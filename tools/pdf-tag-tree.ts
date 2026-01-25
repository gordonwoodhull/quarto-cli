#!/usr/bin/env -S deno run --allow-read --allow-env
/**
 * pdf-tag-tree.ts
 *
 * Extracts and displays the PDF structure tree (tag hierarchy) with MCIDs.
 * Useful for debugging ensurePdfTextPositions issues.
 *
 * Usage: deno run --allow-read --allow-env tools/pdf-tag-tree.ts <pdf-file> [search-text]
 */

import * as pdfjsLib from "npm:pdfjs-dist@4.4.168/legacy/build/pdf.mjs";

interface StructTreeContent {
  type: "content";
  id: string;
}

interface StructTreeNode {
  role: string;
  children?: (StructTreeNode | StructTreeContent)[];
  alt?: string;
  lang?: string;
}

interface TextMarkedContent {
  type: string;
  id?: string;
  tag?: string;
}

interface TextItem {
  str: string;
  transform: number[];
  width: number;
  height: number;
}

function isStructTreeContent(child: any): child is StructTreeContent {
  return child && typeof child === "object" && child.type === "content";
}

function isTextMarkedContent(item: any): item is TextMarkedContent {
  return "type" in item && typeof item.type === "string";
}

// Build a map from MCID to the path of tags leading to it
function buildMcidPaths(
  node: StructTreeNode,
  path: string[] = [],
  result: Map<string, { path: string[]; role: string; attrs: Record<string, any> }> = new Map()
): Map<string, { path: string[]; role: string; attrs: Record<string, any> }> {
  const currentPath = [...path, node.role];

  for (const child of node.children ?? []) {
    if (isStructTreeContent(child)) {
      // This is an MCID reference
      const attrs: Record<string, any> = {};
      if (node.alt) attrs.alt = node.alt;
      if (node.lang) attrs.lang = node.lang;

      result.set(child.id, {
        path: currentPath,
        role: node.role,
        attrs
      });
    } else {
      // Recurse into child structure nodes
      buildMcidPaths(child, currentPath, result);
    }
  }

  return result;
}

// Pretty print the structure tree
function printStructTree(node: StructTreeNode, indent: number = 0, maxDepth: number = 10): void {
  if (indent > maxDepth) {
    console.log(" ".repeat(indent * 2) + "...(truncated)");
    return;
  }

  const attrs: string[] = [];
  if (node.alt) attrs.push(`alt="${node.alt}"`);
  if (node.lang) attrs.push(`lang="${node.lang}"`);

  const attrStr = attrs.length > 0 ? ` [${attrs.join(", ")}]` : "";

  let mcids: string[] = [];
  let childNodes: StructTreeNode[] = [];

  for (const child of node.children ?? []) {
    if (isStructTreeContent(child)) {
      mcids.push(child.id);
    } else {
      childNodes.push(child);
    }
  }

  const mcidStr = mcids.length > 0 ? ` (MCIDs: ${mcids.join(", ")})` : "";
  console.log(" ".repeat(indent * 2) + `<${node.role}>${attrStr}${mcidStr}`);

  for (const child of childNodes) {
    printStructTree(child, indent + 1, maxDepth);
  }
}

async function main() {
  const file = Deno.args[0];
  const searchText = Deno.args[1];

  if (!file) {
    console.error("Usage: pdf-tag-tree.ts <pdf-file> [search-text]");
    Deno.exit(1);
  }

  console.log(`Loading PDF: ${file}\n`);

  const data = await Deno.readFile(file);
  const pdf = await pdfjsLib.getDocument({
    data,
    useWorkerFetch: false,
    isEvalSupported: false,
    useSystemFonts: true,
  }).promise;

  console.log(`PDF has ${pdf.numPages} page(s)\n`);

  // Collect all text items with their MCIDs
  const allTextItems: { str: string; mcid: string | null; page: number; x: number; y: number }[] = [];

  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    const page = await pdf.getPage(pageNum);
    const viewport = page.getViewport({ scale: 1.0 });

    // Get structure tree for this page
    const structTree = await page.getStructTree();

    if (pageNum === 1) {
      console.log("=== STRUCTURE TREE (Page 1) ===\n");
      if (structTree) {
        printStructTree(structTree as StructTreeNode, 0, 15);
      } else {
        console.log("No structure tree found (PDF may not be tagged)");
      }
      console.log("\n");
    }

    // Build MCID paths for this page
    const mcidPaths = structTree ? buildMcidPaths(structTree as StructTreeNode) : new Map();

    // Get text content
    const textContent = await page.getTextContent({ includeMarkedContent: true });

    let currentMcid: string | null = null;

    for (const item of textContent.items) {
      if (isTextMarkedContent(item)) {
        // pdfjs uses "beginMarkedContentProps" (not "beginMarkedContent")
        const mcidValue = (item as any).id;
        if (item.type === "beginMarkedContentProps" && mcidValue !== undefined) {
          currentMcid = mcidValue;
        } else if (item.type === "endMarkedContent") {
          currentMcid = null;
        }
      } else {
        const textItem = item as TextItem;
        const x = textItem.transform[4];
        const y = textItem.transform[5];
        allTextItems.push({
          str: textItem.str,
          mcid: currentMcid,
          page: pageNum,
          x,
          y
        });
      }
    }

    // If searching for specific text, show MCID info
    if (searchText && pageNum === 1) {
      console.log(`=== TEXT ITEMS CONTAINING "${searchText}" ===\n`);

      for (const item of textContent.items) {
        if (isTextMarkedContent(item)) {
          const mcidValue = (item as any).id;
          if (item.type === "beginMarkedContentProps" && mcidValue !== undefined) {
            currentMcid = mcidValue;
          } else if (item.type === "endMarkedContent") {
            currentMcid = null;
          }
        } else {
          const textItem = item as TextItem;
          if (textItem.str.includes(searchText)) {
            const x = textItem.transform[4];
            const y = textItem.transform[5];
            const pathInfo = currentMcid ? mcidPaths.get(currentMcid) : null;

            console.log(`Text: "${textItem.str}"`);
            console.log(`  MCID: ${currentMcid}`);
            console.log(`  Position: x=${x.toFixed(1)}, y=${y.toFixed(1)}`);
            if (pathInfo) {
              console.log(`  Tag path: ${pathInfo.path.join(" > ")}`);
              if (Object.keys(pathInfo.attrs).length > 0) {
                console.log(`  Attrs: ${JSON.stringify(pathInfo.attrs)}`);
              }
            }
            console.log();
          }
        }
      }
    }
  }

  // Show all text items in code blocks (looking for Figure or Code tags)
  if (!searchText) {
    console.log("\n=== SAMPLE TEXT ITEMS WITH MCIDs ===\n");

    let count = 0;
    for (const item of allTextItems) {
      if (item.str.trim() && count < 30) {
        console.log(`"${item.str.substring(0, 40).padEnd(40)}" | MCID: ${(item.mcid || "none").padEnd(12)} | x: ${item.x.toFixed(1).padStart(6)} | y: ${item.y.toFixed(1).padStart(6)}`);
        count++;
      }
    }
  }
}

main().catch(console.error);
