import { testQuartoCmd } from "../../test.ts";
import { fileExists, folderExists, noErrorsOrWarnings, printsMessage } from "../../verify.ts";
import { join, fromFileUrl, dirname } from "../../../src/deno_ral/path.ts";
import { ensureDirSync, existsSync } from "../../../src/deno_ral/fs.ts";

const tempDir = Deno.makeTempDirSync();
const testDir = dirname(fromFileUrl(import.meta.url));
const fixtureDir = join(testDir, "..", "use-brand");

// Scenario 1: Basic brand installation
const basicDir = join(tempDir, "basic");
ensureDirSync(basicDir);
testQuartoCmd(
  "use",
  ["brand", join(fixtureDir, "basic-brand"), "--force"],
  [
    noErrorsOrWarnings,
    folderExists(join(basicDir, "_brand")),
    fileExists(join(basicDir, "_brand", "_brand.yml")),
    fileExists(join(basicDir, "_brand", "logo.png")),
  ],
  {
    setup: () => {
      Deno.writeTextFileSync(join(basicDir, "_quarto.yml"), "project:\n  type: default\n");
      return Promise.resolve();
    },
    cwd: () => basicDir,
    teardown: () => {
      try { Deno.removeSync(basicDir, { recursive: true }); } catch { /* ignore */ }
      return Promise.resolve();
    }
  },
  "quarto use brand - basic installation"
);

// Scenario 2: Dry-run mode
const dryRunDir = join(tempDir, "dry-run");
ensureDirSync(dryRunDir);
testQuartoCmd(
  "use",
  ["brand", join(fixtureDir, "basic-brand"), "--dry-run"],
  [
    noErrorsOrWarnings,
    printsMessage({ level: "INFO", regex: /Would create directory/ }),
    printsMessage({ level: "INFO", regex: /Would create:/ }),
    {
      name: "_brand directory should not exist in dry-run mode",
      verify: () => {
        const brandDir = join(dryRunDir, "_brand");
        if (existsSync(brandDir)) {
          throw new Error("_brand directory should not exist in dry-run mode");
        }
        return Promise.resolve();
      }
    }
  ],
  {
    setup: () => {
      Deno.writeTextFileSync(join(dryRunDir, "_quarto.yml"), "project:\n  type: default\n");
      return Promise.resolve();
    },
    cwd: () => dryRunDir,
    teardown: () => {
      try { Deno.removeSync(dryRunDir, { recursive: true }); } catch { /* ignore */ }
      return Promise.resolve();
    }
  },
  "quarto use brand - dry-run mode"
);

// Scenario 3: Force mode - overwrites existing, creates new, preserves unrelated
const forceOverwriteDir = join(tempDir, "force-overwrite");
ensureDirSync(forceOverwriteDir);
testQuartoCmd(
  "use",
  ["brand", join(fixtureDir, "basic-brand"), "--force"],
  [
    noErrorsOrWarnings,
    // _brand.yml should be overwritten (exists in both)
    {
      name: "_brand.yml should be overwritten with new content",
      verify: () => {
        const content = Deno.readTextFileSync(join(forceOverwriteDir, "_brand", "_brand.yml"));
        if (content.includes("Old Brand")) {
          throw new Error("_brand.yml should have been overwritten");
        }
        if (!content.includes("Basic Test Brand")) {
          throw new Error("_brand.yml should contain new brand content");
        }
        return Promise.resolve();
      }
    },
    // logo.png should be created (not in target originally)
    fileExists(join(forceOverwriteDir, "_brand", "logo.png")),
    // unrelated.txt should be preserved (not in source)
    {
      name: "unrelated.txt should be preserved",
      verify: () => {
        const content = Deno.readTextFileSync(join(forceOverwriteDir, "_brand", "unrelated.txt"));
        if (content !== "keep me") {
          throw new Error("unrelated.txt should be preserved");
        }
        return Promise.resolve();
      }
    },
  ],
  {
    setup: () => {
      Deno.writeTextFileSync(join(forceOverwriteDir, "_quarto.yml"), "project:\n  type: default\n");
      // Create existing _brand directory with files
      const brandDir = join(forceOverwriteDir, "_brand");
      ensureDirSync(brandDir);
      // This file exists in source - should be overwritten
      Deno.writeTextFileSync(join(brandDir, "_brand.yml"), "meta:\n  name: Old Brand\n");
      // This file does NOT exist in source - should be preserved
      Deno.writeTextFileSync(join(brandDir, "unrelated.txt"), "keep me");
      return Promise.resolve();
    },
    cwd: () => forceOverwriteDir,
    teardown: () => {
      try { Deno.removeSync(forceOverwriteDir, { recursive: true }); } catch { /* ignore */ }
      return Promise.resolve();
    }
  },
  "quarto use brand - force overwrites existing, creates new, preserves unrelated"
);

// Scenario 4: Dry-run reports "Would overwrite" vs "Would create" correctly
const dryRunOverwriteDir = join(tempDir, "dry-run-overwrite");
ensureDirSync(dryRunOverwriteDir);
testQuartoCmd(
  "use",
  ["brand", join(fixtureDir, "basic-brand"), "--dry-run"],
  [
    noErrorsOrWarnings,
    // Should report "Would overwrite" for _brand.yml (exists in both)
    printsMessage({ level: "INFO", regex: /Would overwrite:.*_brand\.yml/ }),
    // Should report "Would create" for logo.png (not in target)
    printsMessage({ level: "INFO", regex: /Would create:.*logo\.png/ }),
    // Verify _brand.yml was NOT modified
    {
      name: "_brand.yml should not be modified in dry-run",
      verify: () => {
        const content = Deno.readTextFileSync(join(dryRunOverwriteDir, "_brand", "_brand.yml"));
        if (!content.includes("Old Brand")) {
          throw new Error("_brand.yml should not be modified in dry-run mode");
        }
        return Promise.resolve();
      }
    },
    // Verify logo.png was NOT created
    {
      name: "logo.png should not be created in dry-run",
      verify: () => {
        if (existsSync(join(dryRunOverwriteDir, "_brand", "logo.png"))) {
          throw new Error("logo.png should not be created in dry-run mode");
        }
        return Promise.resolve();
      }
    },
  ],
  {
    setup: () => {
      Deno.writeTextFileSync(join(dryRunOverwriteDir, "_quarto.yml"), "project:\n  type: default\n");
      // Create existing _brand directory with only _brand.yml (not logo.png)
      const brandDir = join(dryRunOverwriteDir, "_brand");
      ensureDirSync(brandDir);
      Deno.writeTextFileSync(join(brandDir, "_brand.yml"), "meta:\n  name: Old Brand\n");
      return Promise.resolve();
    },
    cwd: () => dryRunOverwriteDir,
    teardown: () => {
      try { Deno.removeSync(dryRunOverwriteDir, { recursive: true }); } catch { /* ignore */ }
      return Promise.resolve();
    }
  },
  "quarto use brand - dry-run reports overwrite vs create correctly"
);

// Scenario 5: Error - force and dry-run together
const errorFlagDir = join(tempDir, "error-flags");
ensureDirSync(errorFlagDir);
testQuartoCmd(
  "use",
  ["brand", join(fixtureDir, "basic-brand"), "--force", "--dry-run"],
  [
    printsMessage({ level: "ERROR", regex: /Cannot use --force and --dry-run together/ }),
  ],
  {
    setup: () => {
      Deno.writeTextFileSync(join(errorFlagDir, "_quarto.yml"), "project:\n  type: default\n");
      return Promise.resolve();
    },
    cwd: () => errorFlagDir,
    teardown: () => {
      try { Deno.removeSync(errorFlagDir, { recursive: true }); } catch { /* ignore */ }
      return Promise.resolve();
    }
  },
  "quarto use brand - error on --force --dry-run"
);

// Scenario 6: Multi-file brand installation
const multiFileDir = join(tempDir, "multi-file");
ensureDirSync(multiFileDir);
testQuartoCmd(
  "use",
  ["brand", join(fixtureDir, "multi-file-brand"), "--force"],
  [
    noErrorsOrWarnings,
    folderExists(join(multiFileDir, "_brand")),
    fileExists(join(multiFileDir, "_brand", "_brand.yml")),
    fileExists(join(multiFileDir, "_brand", "logo.png")),
    fileExists(join(multiFileDir, "_brand", "favicon.png")),
  ],
  {
    setup: () => {
      Deno.writeTextFileSync(join(multiFileDir, "_quarto.yml"), "project:\n  type: default\n");
      return Promise.resolve();
    },
    cwd: () => multiFileDir,
    teardown: () => {
      try { Deno.removeSync(multiFileDir, { recursive: true }); } catch { /* ignore */ }
      return Promise.resolve();
    }
  },
  "quarto use brand - multi-file installation"
);

// Scenario 7: Nested directory structure preserved
const nestedDir = join(tempDir, "nested");
ensureDirSync(nestedDir);
testQuartoCmd(
  "use",
  ["brand", join(fixtureDir, "nested-brand"), "--force"],
  [
    noErrorsOrWarnings,
    folderExists(join(nestedDir, "_brand")),
    fileExists(join(nestedDir, "_brand", "_brand.yml")),
    folderExists(join(nestedDir, "_brand", "images")),
    fileExists(join(nestedDir, "_brand", "images", "logo.png")),
    fileExists(join(nestedDir, "_brand", "images", "header.png")),
  ],
  {
    setup: () => {
      Deno.writeTextFileSync(join(nestedDir, "_quarto.yml"), "project:\n  type: default\n");
      return Promise.resolve();
    },
    cwd: () => nestedDir,
    teardown: () => {
      try { Deno.removeSync(nestedDir, { recursive: true }); } catch { /* ignore */ }
      return Promise.resolve();
    }
  },
  "quarto use brand - nested directory structure"
);

// Scenario 8: Error - no project directory
const noProjectDir = join(tempDir, "no-project");
ensureDirSync(noProjectDir);
testQuartoCmd(
  "use",
  ["brand", join(fixtureDir, "basic-brand"), "--force"],
  [
    printsMessage({ level: "ERROR", regex: /Could not find project dir/ }),
  ],
  {
    setup: () => {
      // No _quarto.yml created - this should cause an error
      return Promise.resolve();
    },
    cwd: () => noProjectDir,
    teardown: () => {
      try { Deno.removeSync(noProjectDir, { recursive: true }); } catch { /* ignore */ }
      return Promise.resolve();
    }
  },
  "quarto use brand - error on no project"
);

// Scenario 9: Nested directory - overwrite files in subdirectories
const nestedOverwriteDir = join(tempDir, "nested-overwrite");
ensureDirSync(nestedOverwriteDir);
testQuartoCmd(
  "use",
  ["brand", join(fixtureDir, "nested-brand"), "--force"],
  [
    noErrorsOrWarnings,
    // images/logo.png should be overwritten (exists in both)
    {
      name: "images/logo.png should be overwritten",
      verify: () => {
        const stats = Deno.statSync(join(nestedOverwriteDir, "_brand", "images", "logo.png"));
        // Original was 10 bytes ("old logo\n"), new one is 1862 bytes
        if (stats.size < 100) {
          throw new Error("images/logo.png should have been overwritten with larger file");
        }
        return Promise.resolve();
      }
    },
    // images/header.png should be created (not in target originally)
    fileExists(join(nestedOverwriteDir, "_brand", "images", "header.png")),
    // images/unrelated.png should be preserved (not in source)
    {
      name: "images/unrelated.png should be preserved",
      verify: () => {
        const content = Deno.readTextFileSync(join(nestedOverwriteDir, "_brand", "images", "unrelated.png"));
        if (content !== "keep me nested") {
          throw new Error("images/unrelated.png should be preserved");
        }
        return Promise.resolve();
      }
    },
  ],
  {
    setup: () => {
      Deno.writeTextFileSync(join(nestedOverwriteDir, "_quarto.yml"), "project:\n  type: default\n");
      // Create existing _brand/images directory with files
      const imagesDir = join(nestedOverwriteDir, "_brand", "images");
      ensureDirSync(imagesDir);
      // This file exists in source - should be overwritten
      Deno.writeTextFileSync(join(imagesDir, "logo.png"), "old logo\n");
      // This file does NOT exist in source - should be preserved
      Deno.writeTextFileSync(join(imagesDir, "unrelated.png"), "keep me nested");
      return Promise.resolve();
    },
    cwd: () => nestedOverwriteDir,
    teardown: () => {
      try { Deno.removeSync(nestedOverwriteDir, { recursive: true }); } catch { /* ignore */ }
      return Promise.resolve();
    }
  },
  "quarto use brand - nested overwrite, create, preserve in subdirectories"
);

// Scenario 10: Dry-run with nested directories - reports correctly
const dryRunNestedDir = join(tempDir, "dry-run-nested");
ensureDirSync(dryRunNestedDir);
testQuartoCmd(
  "use",
  ["brand", join(fixtureDir, "nested-brand"), "--dry-run"],
  [
    noErrorsOrWarnings,
    // Should report "Would overwrite" for images/logo.png (exists in both)
    printsMessage({ level: "INFO", regex: /Would overwrite:.*images\/logo\.png/ }),
    // Should report "Would create" for images/header.png (not in target)
    printsMessage({ level: "INFO", regex: /Would create:.*images\/header\.png/ }),
    // Verify images/logo.png was NOT modified
    {
      name: "images/logo.png should not be modified in dry-run",
      verify: () => {
        const content = Deno.readTextFileSync(join(dryRunNestedDir, "_brand", "images", "logo.png"));
        if (content !== "old logo\n") {
          throw new Error("images/logo.png should not be modified in dry-run mode");
        }
        return Promise.resolve();
      }
    },
    // Verify images/header.png was NOT created
    {
      name: "images/header.png should not be created in dry-run",
      verify: () => {
        if (existsSync(join(dryRunNestedDir, "_brand", "images", "header.png"))) {
          throw new Error("images/header.png should not be created in dry-run mode");
        }
        return Promise.resolve();
      }
    },
  ],
  {
    setup: () => {
      Deno.writeTextFileSync(join(dryRunNestedDir, "_quarto.yml"), "project:\n  type: default\n");
      // Create existing _brand/images directory with only logo.png (not header.png)
      const imagesDir = join(dryRunNestedDir, "_brand", "images");
      ensureDirSync(imagesDir);
      Deno.writeTextFileSync(join(imagesDir, "logo.png"), "old logo\n");
      // Also create _brand.yml so we're only testing nested behavior
      Deno.writeTextFileSync(join(dryRunNestedDir, "_brand", "_brand.yml"), "meta:\n  name: Old\n");
      return Promise.resolve();
    },
    cwd: () => dryRunNestedDir,
    teardown: () => {
      try { Deno.removeSync(dryRunNestedDir, { recursive: true }); } catch { /* ignore */ }
      return Promise.resolve();
    }
  },
  "quarto use brand - dry-run reports nested overwrite vs create correctly"
);

// Scenario 11: Nested directory created when doesn't exist
const nestedNewSubdirDir = join(tempDir, "nested-new-subdir");
ensureDirSync(nestedNewSubdirDir);
testQuartoCmd(
  "use",
  ["brand", join(fixtureDir, "nested-brand"), "--force"],
  [
    noErrorsOrWarnings,
    // _brand/ exists but images/ doesn't - should be created
    folderExists(join(nestedNewSubdirDir, "_brand", "images")),
    fileExists(join(nestedNewSubdirDir, "_brand", "images", "logo.png")),
    fileExists(join(nestedNewSubdirDir, "_brand", "images", "header.png")),
    // existing file at root should be overwritten
    {
      name: "_brand.yml should be overwritten",
      verify: () => {
        const content = Deno.readTextFileSync(join(nestedNewSubdirDir, "_brand", "_brand.yml"));
        if (content.includes("Old Brand")) {
          throw new Error("_brand.yml should have been overwritten");
        }
        return Promise.resolve();
      }
    },
  ],
  {
    setup: () => {
      Deno.writeTextFileSync(join(nestedNewSubdirDir, "_quarto.yml"), "project:\n  type: default\n");
      // Create _brand/ but NOT images/ subdirectory
      const brandDir = join(nestedNewSubdirDir, "_brand");
      ensureDirSync(brandDir);
      Deno.writeTextFileSync(join(brandDir, "_brand.yml"), "meta:\n  name: Old Brand\n");
      return Promise.resolve();
    },
    cwd: () => nestedNewSubdirDir,
    teardown: () => {
      try { Deno.removeSync(nestedNewSubdirDir, { recursive: true }); } catch { /* ignore */ }
      return Promise.resolve();
    }
  },
  "quarto use brand - creates nested subdirectory when _brand exists but subdir doesn't"
);

// Scenario 12: Dry-run reports new subdirectory creation
const dryRunNewSubdirDir = join(tempDir, "dry-run-new-subdir");
ensureDirSync(dryRunNewSubdirDir);
testQuartoCmd(
  "use",
  ["brand", join(fixtureDir, "nested-brand"), "--dry-run"],
  [
    noErrorsOrWarnings,
    // Should NOT report "Would create directory" for _brand/ (already exists)
    printsMessage({ level: "INFO", regex: /Would create directory/, negate: true }),
    // Should report "Would create" for files in new subdir
    printsMessage({ level: "INFO", regex: /Would create:.*images\/logo\.png/ }),
    printsMessage({ level: "INFO", regex: /Would create:.*images\/header\.png/ }),
    // Verify images/ directory was NOT created
    {
      name: "images/ directory should not be created in dry-run",
      verify: () => {
        if (existsSync(join(dryRunNewSubdirDir, "_brand", "images"))) {
          throw new Error("images/ directory should not be created in dry-run mode");
        }
        return Promise.resolve();
      }
    },
  ],
  {
    setup: () => {
      Deno.writeTextFileSync(join(dryRunNewSubdirDir, "_quarto.yml"), "project:\n  type: default\n");
      // Create _brand/ but NOT images/ subdirectory
      const brandDir = join(dryRunNewSubdirDir, "_brand");
      ensureDirSync(brandDir);
      Deno.writeTextFileSync(join(brandDir, "_brand.yml"), "meta:\n  name: Old\n");
      return Promise.resolve();
    },
    cwd: () => dryRunNewSubdirDir,
    teardown: () => {
      try { Deno.removeSync(dryRunNewSubdirDir, { recursive: true }); } catch { /* ignore */ }
      return Promise.resolve();
    }
  },
  "quarto use brand - dry-run when _brand exists but nested subdir doesn't"
);
