import { testQuartoCmd, Verify } from "../../test.ts";
import { assert } from "testing/asserts";
import { existsSync } from "../../../src/deno_ral/fs.ts";

const verifyPackagesCreated: Verify = {
  name: "Verify typst/packages directory was created",
  verify: async () => {
    const packagesDir = "_extensions/test-format/typst/packages";
    assert(
      existsSync(packagesDir),
      `Expected typst/packages directory not found: ${packagesDir}`,
    );
  },
};

const verifyExamplePackageCached: Verify = {
  name: "Verify @preview/example package was cached",
  verify: async () => {
    const packageDir = "_extensions/test-format/typst/packages/preview/example/0.1.0";
    assert(
      existsSync(packageDir),
      `Expected cached package not found: ${packageDir}`,
    );

    // Verify typst.toml exists in the package
    const manifestPath = `${packageDir}/typst.toml`;
    assert(
      existsSync(manifestPath),
      `Expected package manifest not found: ${manifestPath}`,
    );
  },
};

testQuartoCmd(
  "call",
  ["typst-gather"],
  [
    verifyPackagesCreated,
    verifyExamplePackageCached,
  ],
  {
    cwd: () => "smoke/typst-gather",
  },
  "typst-gather caches preview packages from extension templates",
);
