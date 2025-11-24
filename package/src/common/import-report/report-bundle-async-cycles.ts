/*
 * report-bundle-async-cycles.ts
 *
 * Detects when esbuild marks modules as async due to transitive top-level await,
 * and those async modules are in import cycles, causing bundling errors.
 *
 * Copyright (C) 2024 Posit Software, PBC
 */

import { existsSync } from "../../../../src/deno_ral/fs.ts";
import { resolve, join } from "../../../../src/deno_ral/path.ts";
import { architectureToolsPath } from "../../../../src/core/resources.ts";

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

function findRootAsyncModules(bundleCode: string, asyncModules: AsyncModule[]): AsyncModule[] {
  // Root async modules are those that don't call any await init_*() inside them
  const rootModules: AsyncModule[] = [];

  for (const { name, path } of asyncModules) {
    // Extract the body of this wrapper function
    const wrapperBodyPattern = new RegExp(
      `var ${name} = __esm\\(\\{[^}]*async\\s+"[^"]+?"\\(\\)\\s*\\{([\\s\\S]{0,5000})`,
    );
    const bodyMatch = bundleCode.match(wrapperBodyPattern);

    if (!bodyMatch) continue;

    const body = bodyMatch[1];
    // Check if this body calls any await init_* functions
    const hasAwaitInit = /await init_\w+\(\)/.test(body);

    if (!hasAwaitInit) {
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

  // Find async modules
  console.log("Analyzing async modules in bundle...");
  const asyncModules = findAsyncModules(bundleCode);
  console.log(`✓ Found ${asyncModules.length} async modules\n`);

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
    console.log("💡 Recommendation:");
    console.log("   Break the import chain from root async modules to these cyclic files");
    console.log("   Consider using dynamic imports to defer loading of async dependencies");

    if (rootModules.length > 0) {
      console.log("\n   Root causes to investigate:");
      for (const { path } of rootModules.slice(0, 3)) {
        console.log(`     - ${simplifyPath(path)}`);
      }
    }
  }

  // Cleanup
  try {
    Deno.removeSync(cyclesFile);
  } catch {
    // Ignore cleanup errors
  }
}
