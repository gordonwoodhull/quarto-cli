/*
 * report-bundle-async-cycles.ts
 *
 * Detects when esbuild marks modules as async due to transitive top-level await,
 * and those async modules are in import cycles, causing bundling errors.
 *
 * Copyright (C) 2024 Posit Software, PBC
 */

import { existsSync } from "../../../../src/deno_ral/fs.ts";
import { resolve } from "../../../../src/deno_ral/path.ts";
import { architectureToolsPath } from "../../../../src/core/resources.ts";
import { Parser } from "npm:acorn@8.14.0";
import { simple } from "npm:acorn-walk@8.3.4";

interface AsyncModule {
  name: string;
  path: string;
}

async function generateCycles(entryPoint: string): Promise<string> {
  const timestamp = Date.now();
  const cyclesFile = `/tmp/cycles-${timestamp}.toon`;

  console.log("Generating cycle data...");

  const denoBinary = Deno.env.get("QUARTO_DENO") || architectureToolsPath("deno");
  const scriptPath = resolve("package/src/common/import-report/explain-all-cycles.ts");
  const importMapPath = resolve("src/import_map.json");

  const process = Deno.run({
    cmd: [
      denoBinary,
      "run",
      "--allow-read",
      "--allow-write",
      "--allow-env",
      "--allow-net",
      "--allow-run",
      "--allow-import",
      "--import-map",
      importMapPath,
      scriptPath,
      entryPoint,
      "--simplify",
      "--list",
      cyclesFile,
    ],
    stdout: "piped",
    stderr: "piped",
  });

  const status = await process.status();

  if (!status.success) {
    const error = new TextDecoder().decode(await process.stderrOutput());
    throw new Error(`Failed to generate cycles: ${error}`);
  }

  process.close();

  return cyclesFile;
}

function parseCyclesFile(cyclesFile: string): Set<string> {
  const content = Deno.readTextFileSync(cyclesFile);
  const lines = content.split("\n");
  const filesInCycles = new Set<string>();

  // Parse TOON format: edges[N]{from,to}: followed by "  from,to" lines
  for (const line of lines) {
    if (line.startsWith("  ")) {
      const [from, to] = line.trim().split(",");
      if (from) filesInCycles.add(from);
      if (to) filesInCycles.add(to);
    }
  }

  return filesInCycles;
}

function findAsyncModules(bundleCode: string): AsyncModule[] {
  // Pattern: var init_foo = __esm({ async "path/to/file.ts"() {
  const asyncWrapperPattern = /var (init_\w+) = __esm\(\{\s*async\s+"([^"]+)"\(\)/g;

  const asyncModules: AsyncModule[] = [];
  for (const match of bundleCode.matchAll(asyncWrapperPattern)) {
    asyncModules.push({
      name: match[1],
      path: match[2],
    });
  }

  return asyncModules;
}

function findAllModules(bundleCode: string): AsyncModule[] {
  // Pattern: var init_foo = __esm({ "path/to/file.ts"() { OR async "path"() {
  const wrapperPattern = /var (init_\w+) = __esm\(\{\s*(?:async\s+)?"([^"]+)"\(\)/g;

  const allModules: AsyncModule[] = [];
  for (const match of bundleCode.matchAll(wrapperPattern)) {
    allModules.push({
      name: match[1],
      path: match[2],
    });
  }

  return allModules;
}

function findRootAsyncModules(bundleCode: string, asyncModules: AsyncModule[]): AsyncModule[] {
  // Root async modules are those marked async but don't await OTHER init_*() functions
  // They have the actual top-level await (e.g., await wasm_default())
  const rootModules: AsyncModule[] = [];

  for (const { name, path } of asyncModules) {
    // Find where this wrapper is defined
    // Format: var init_foo = __esm({ async "path"() { ... }});
    const startPattern = new RegExp(
      `var ${name} = __esm\\(\\{\\s*async\\s+"[^"]+?"\\(\\)\\s*\\{`,
      's'
    );
    const startMatch = startPattern.exec(bundleCode);

    if (!startMatch) continue;

    // Extract code after the wrapper starts
    const startIndex = startMatch.index + startMatch[0].length;
    const remainder = bundleCode.slice(startIndex, startIndex + 10000);

    // Find where THIS wrapper ends (closing "});")
    const endPattern = /^\}\);/m;
    const endMatch = endPattern.exec(remainder);

    if (!endMatch) continue;

    // Only check the body of THIS wrapper, not subsequent code
    const wrapperBody = remainder.slice(0, endMatch.index);

    // Check if this wrapper body calls await init_*()
    const awaitInitPattern = /await init_\w+\(\)/;
    const hasAwaitInit = awaitInitPattern.test(wrapperBody);

    if (!hasAwaitInit) {
      // This is a root async module - it's async but doesn't await other inits
      rootModules.push({ name, path });
    }
  }

  return rootModules;
}

function simplifyPath(path: string): string {
  // Remove common prefixes for display
  if (path.includes("/src/")) {
    return path.slice(path.indexOf("/src/") + 1);
  }
  if (path.startsWith("https://")) {
    // Show just the meaningful part of URLs
    if (path.length > 60) {
      return "..." + path.slice(-57);
    }
  }
  return path;
}


function reverseGraph(graph: Map<string, Set<string>>): Map<string, Set<string>> {
  // Build reverse graph: A imports B becomes B is imported by A
  const reversed = new Map<string, Set<string>>();

  // Initialize all nodes
  for (const node of graph.keys()) {
    reversed.set(node, new Set<string>());
  }

  // Reverse all edges
  for (const [from, toSet] of graph.entries()) {
    for (const to of toSet) {
      if (!reversed.has(to)) {
        reversed.set(to, new Set<string>());
      }
      reversed.get(to)!.add(from);
    }
  }

  return reversed;
}

function buildAsyncPropagationGraphFromAST(
  bundleCode: string,
  asyncModules: AsyncModule[],
  allModules: AsyncModule[]
): Map<string, Set<string>> {
  // Build map: init_name -> module info (use allModules, not just asyncModules)
  const initToModule = new Map<string, AsyncModule>();
  for (const mod of allModules) {
    initToModule.set(mod.name, mod);
  }

  const graph = new Map<string, Set<string>>();

  // Parse each wrapper individually to avoid issues with invalid syntax in some wrappers
  for (const { name, path } of allModules) {
    // Find this wrapper's definition (with or without async keyword)
    const wrapperPattern = new RegExp(
      `var ${name} = __esm\\(\\{\\s*(?:async\\s+)?"[^"]+?"\\(\\)\\s*\\{`,
      's'
    );
    const match = wrapperPattern.exec(bundleCode);
    if (!match) {
      continue;
    }

    // Extract the wrapper body (up to the closing "});")
    const startIndex = match.index + match[0].length;
    const remainder = bundleCode.slice(startIndex, startIndex + 50000);
    const endPattern = /^\}\);/m;
    const endMatch = endPattern.exec(remainder);
    if (!endMatch) {
      continue;
    }

    const wrapperBody = remainder.slice(0, endMatch.index);

    try {
      // Try to parse just this wrapper's body as a function
      const functionCode = `async function temp() {\n${wrapperBody}\n}`;
      const ast = Parser.parse(functionCode, {
        ecmaVersion: "latest",
        sourceType: "module",
      });

      // Find all init_*() calls (both awaited and non-awaited)
      const deps = new Set<string>();
      simple(ast, {
        CallExpression(callNode: any) {
          if (
            callNode.callee?.type === "Identifier" &&
            callNode.callee.name.startsWith("init_")
          ) {
            const depName = callNode.callee.name;
            const depModule = initToModule.get(depName);
            if (depModule) {
              deps.add(simplifyPath(depModule.path));
            }
          }
        },
      });

      graph.set(simplifyPath(path), deps);
    } catch (e) {
      // If this wrapper has syntax errors (the exact issue we're tracking!),
      // fall back to regex-based extraction
      const initPattern = /\b(init_\w+)\(\)/g;
      const deps = new Set<string>();

      for (const initMatch of wrapperBody.matchAll(initPattern)) {
        const depName = initMatch[1];
        const depModule = initToModule.get(depName);
        if (depModule) {
          deps.add(simplifyPath(depModule.path));
        }
      }

      graph.set(simplifyPath(path), deps);
    }
  }

  return graph;
}

function normalizePath(path: string, filesInCycles: Set<string>): string {
  // Normalize to match cycle file format (relative from src/)
  const simplified = simplifyPath(path);

  // Try exact match first
  if (filesInCycles.has(simplified)) {
    return simplified;
  }

  // Try without src/ prefix
  if (simplified.startsWith("src/")) {
    const withoutSrc = simplified.slice(4);
    if (filesInCycles.has(withoutSrc)) {
      return withoutSrc;
    }
  }

  return simplified;
}

function tracePaths(
  graph: Map<string, Set<string>>,
  rootAsync: string,
  filesInCycles: Set<string>
): Map<string, string[]> {
  const paths = new Map<string, string[]>();
  const queue: string[][] = [[rootAsync]];
  const visited = new Set<string>();

  while (queue.length > 0) {
    const path = queue.shift()!;
    const current = path[path.length - 1];

    // Create a normalized version for cycle checking
    const normalizedCurrent = normalizePath(current, filesInCycles);

    if (visited.has(current)) continue;
    visited.add(current);

    // If current is in a cycle, record the path
    if (filesInCycles.has(normalizedCurrent)) {
      // Only record if we don't have a shorter path to this file
      if (!paths.has(normalizedCurrent) || path.length < paths.get(normalizedCurrent)!.length) {
        paths.set(normalizedCurrent, path);
      }
      continue; // Don't traverse further into cycles
    }

    // Add neighbors to queue
    const deps = graph.get(current);
    if (deps) {
      for (const dep of deps) {
        if (!visited.has(dep)) {
          queue.push([...path, dep]);
        }
      }
    }
  }

  return paths;
}

interface BreakPoint {
  file: string;
  imports: string;
  cycleEntry: string;
  affectedFiles: string[];
}

function identifyBreakPoints(
  paths: Map<string, string[]>,
  filesInCycles: Set<string>
): BreakPoint[] {
  const breakPoints: BreakPoint[] = [];
  const breakPointMap = new Map<string, Set<string>>(); // edge -> affected cycle files

  for (const [cycleFile, path] of paths.entries()) {
    if (path.length < 2) continue; // Need at least root -> cycleEntry

    // The break point is the edge from the last non-cycle file to the first cycle file
    const cycleEntryIndex = path.findIndex((p) => {
      const normalized = normalizePath(p, filesInCycles);
      return filesInCycles.has(normalized);
    });

    if (cycleEntryIndex > 0) {
      // In the reversed graph, the path shows: root → ... → lastNonCycle → firstCycle → ...
      // We need to find the LAST file NOT in the cycle (which imports the first cycle file)

      const cycleEntry = path[cycleEntryIndex];  // First file in cycle

      // Find the last non-cycle file by going backwards from cycleEntry
      let lastNonCycleIndex = cycleEntryIndex - 1;
      while (lastNonCycleIndex >= 0) {
        const candidate = path[lastNonCycleIndex];
        const normalized = normalizePath(candidate, filesInCycles);
        if (!filesInCycles.has(normalized)) {
          // Found a non-cycle file!
          // In reversed graph: ... → lastNonCycle → cycleEntry → ...
          // In forward terms: cycleEntry imports lastNonCycle
          // So the break is: in cycleEntry, make import of lastNonCycle dynamic
          const edge = `${cycleEntry}→${candidate}`;

          if (!breakPointMap.has(edge)) {
            breakPointMap.set(edge, new Set());
          }
          breakPointMap.get(edge)!.add(cycleFile);
          break;
        }
        lastNonCycleIndex--;
      }
    }
  }

  // Convert to BreakPoint objects
  for (const [edge, affectedFiles] of breakPointMap.entries()) {
    const [file, imports] = edge.split("→");
    const cycleEntry = imports;
    breakPoints.push({
      file,
      imports,
      cycleEntry,
      affectedFiles: Array.from(affectedFiles),
    });
  }

  // Sort by number of affected files (descending)
  breakPoints.sort((a, b) => b.affectedFiles.length - a.affectedFiles.length);

  return breakPoints;
}

function formatChainRecommendations(
  breakPoints: BreakPoint[],
  rootModules: AsyncModule[]
): string {
  if (breakPoints.length === 0) {
    return "✅ No actionable break points identified.\n   This may mean the async chains have already been broken.\n";
  }

  const lines: string[] = [];
  lines.push("=== IMPORT CHAIN ANALYSIS ===\n");

  if (rootModules.length > 0) {
    lines.push("Root async modules (files with actual top-level await):");
    for (const { path } of rootModules.slice(0, 3)) {
      lines.push(`  • ${simplifyPath(path)}`);
    }
    lines.push("");
  }

  lines.push(`Found ${breakPoints.length} recommended break point(s):\n`);

  for (let i = 0; i < breakPoints.length; i++) {
    const bp = breakPoints[i];
    lines.push(`${i + 1}. Break point (affects ${bp.affectedFiles.length} cyclic file(s)):\n`);
    lines.push(`   File: ${simplifyPath(bp.file)}`);
    lines.push(`   Currently imports: ${simplifyPath(bp.imports)}`);
    lines.push(`   Cycle entry: ${simplifyPath(bp.cycleEntry)}\n`);
    lines.push("   💡 Recommendation:");
    lines.push("      Make this import dynamic to break the async propagation chain");
    lines.push("      before it reaches the cyclic code.\n");
    lines.push(`   Affected cyclic files (${bp.affectedFiles.length}):`);
    for (const file of bp.affectedFiles.slice(0, 5)) {
      lines.push(`     • ${file}`);
    }
    if (bp.affectedFiles.length > 5) {
      lines.push(`     ... and ${bp.affectedFiles.length - 5} more`);
    }
    lines.push("");
  }

  return lines.join("\n");
}

if (import.meta.main) {
  console.log("=== Bundle Async-Cycles Detector ===\n");

  // Check for bundle
  const bundlePath = "package/pkg-working/bin/quarto.js";
  if (!existsSync(bundlePath)) {
    console.error("❌ Bundle not found at:", bundlePath);
    console.error("\nPlease run prepare-dist first:");
    console.error("  cd package && ./scripts/common/prepare-dist.sh");
    console.error("\nSee ~/bin/try-dist for more details.");
    Deno.exit(1);
  }

  console.log("✓ Found bundle at:", bundlePath);

  // Read the bundle
  const bundleCode = Deno.readTextFileSync(bundlePath);
  console.log(`✓ Bundle size: ${(bundleCode.length / 1024 / 1024).toFixed(1)} MB\n`);

  // Find all modules and async modules
  console.log("Analyzing modules in bundle...");
  const allModules = findAllModules(bundleCode);
  const asyncModules = findAsyncModules(bundleCode);
  console.log(`✓ Found ${allModules.length} total modules (${asyncModules.length} async)\n`);

  if (asyncModules.length === 0) {
    console.log("✅ No async modules found. Bundle is clean!");
    Deno.exit(0);
  }

  // Find root async modules
  const rootModules = findRootAsyncModules(bundleCode, asyncModules);

  console.log("=== ROOT ASYNC MODULES ===");
  console.log("(Modules with actual top-level await)\n");

  if (rootModules.length === 0) {
    console.log("⚠️  Could not identify root modules (may be in a cycle)");
  } else {
    console.log(`Found ${rootModules.length} root async modules:`);
    for (const { name, path } of rootModules) {
      console.log(`  ${simplifyPath(path)}`);
    }
  }
  console.log();

  // Generate cycles
  const entryPoint = Deno.args[0] || "src/quarto.ts";
  const cyclesFile = await generateCycles(entryPoint);
  console.log(`✓ Generated cycles data\n`);

  // Parse cycles
  const filesInCycles = parseCyclesFile(cyclesFile);
  console.log(`✓ Found ${filesInCycles.size} files in cycles\n`);

  // Find intersection: async modules that are in cycles
  const asyncInCycles: AsyncModule[] = [];
  const asyncPaths = new Set<string>();

  for (const { name, path } of asyncModules) {
    asyncPaths.add(path);

    // Check if this path or simplified version is in cycles
    const simplified = simplifyPath(path);
    if (filesInCycles.has(path) || filesInCycles.has(simplified)) {
      asyncInCycles.push({ name, path });
    }
  }

  // Results
  console.log("=== ASYNC MODULES IN CYCLES ===");

  if (asyncInCycles.length === 0) {
    console.log("✅ No async modules found in cycles!");
    console.log("   The bundle should not have async initialization issues.\n");
  } else {
    console.log("⚠️  Found async modules in import cycles:");
    console.log("   These cause esbuild to generate 'await init_*()' in non-async functions\n");

    for (const { name, path } of asyncInCycles) {
      console.log(`  ${name.padEnd(30)} ${simplifyPath(path)}`);
    }
    console.log();
  }

  // Build complete dependency graph from bundle (shows ALL init_* dependencies)
  console.log("Building dependency graph from bundle...");
  const fullGraph = buildAsyncPropagationGraphFromAST(bundleCode, asyncModules, allModules);
  console.log(`✓ Built dependency graph (${fullGraph.size} modules)`);

  // Reverse the graph to trace async propagation (A imports B → B imported by A)
  console.log("Reversing graph to trace async propagation...");
  const reverseFullGraph = reverseGraph(fullGraph);
  console.log(`✓ Built reverse graph (${reverseFullGraph.size} modules)\n`);

  // For each root async module, trace BACKWARDS through importers to find cyclic files
  if (rootModules.length > 0 && asyncInCycles.length > 0) {
    console.log("=== TRACING ASYNC PROPAGATION CHAINS ===\n");

    const allPaths = new Map<string, string[]>();

    for (const { path: rootPath } of rootModules) {
      const paths = tracePaths(reverseFullGraph, simplifyPath(rootPath), filesInCycles);

      for (const [cycleFile, path] of paths.entries()) {
        // Keep the shortest path to each cycle file
        if (!allPaths.has(cycleFile) || path.length < allPaths.get(cycleFile)!.length) {
          allPaths.set(cycleFile, path);
        }
      }
    }

    console.log(`Found ${allPaths.size} paths from root async modules to cyclic files\n`);

    // Identify break points
    const breakPoints = identifyBreakPoints(allPaths, filesInCycles);

    // Format and display recommendations
    const recommendations = formatChainRecommendations(breakPoints, rootModules);
    console.log(recommendations);
  } else if (asyncInCycles.length === 0) {
    console.log("✅ No async modules in cycles - no chain analysis needed.\n");
  } else {
    console.log("⚠️  Could not trace chains (no root async modules identified)\n");
  }

  // Cleanup
  try {
    Deno.removeSync(cyclesFile);
  } catch {
    // Ignore cleanup errors
  }
}
