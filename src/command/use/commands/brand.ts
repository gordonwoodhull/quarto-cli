/*
 * brand.ts
 *
 * Copyright (C) 2021-2025 Posit Software, PBC
 */

import {
  ExtensionSource,
  extensionSource,
} from "../../../extension/extension-host.ts";
import { info } from "../../../deno_ral/log.ts";
import { Confirm } from "cliffy/prompt/mod.ts";
import { basename, dirname, join, relative } from "../../../deno_ral/path.ts";
import { ensureDir, ensureDirSync, existsSync } from "../../../deno_ral/fs.ts";
import { TempContext } from "../../../core/temp-types.ts";
import { downloadWithProgress } from "../../../core/download.ts";
import { withSpinner } from "../../../core/console.ts";
import { unzip } from "../../../core/zip.ts";
import { templateFiles } from "../../../extension/template.ts";
import { Command } from "cliffy/command/mod.ts";
import { initYamlIntelligenceResourcesFromFilesystem } from "../../../core/schema/utils.ts";
import { createTempContext } from "../../../core/temp.ts";
import { InternalError } from "../../../core/lib/error.ts";
import { notebookContext } from "../../../render/notebook/notebook-context.ts";
import { projectContext } from "../../../project/project-context.ts";

const kRootTemplateName = "template.qmd";

export const useBrandCommand = new Command()
  .name("brand")
  .arguments("<target:string>")
  .description(
    "Use a brand for this project.",
  )
  .option(
    "--no-prompt",
    "Do not prompt to confirm actions",
  )
  .example(
    "Use a brand from Github",
    "quarto use brand <gh-org>/<gh-repo>",
  )
  .action(async (options: { prompt?: boolean }, target: string) => {
    await initYamlIntelligenceResourcesFromFilesystem();
    const temp = createTempContext();
    try {
      await useBrand(options, target, temp);
    } finally {
      temp.cleanup();
    }
  });

async function useBrand(
  options: { prompt?: boolean },
  target: string,
  tempContext: TempContext,
) {
  // Resolve brand host and trust
  const source = await extensionSource(target);
  // Is this source valid?
  if (!source) {
    info(
      `Brand not found in local or remote sources`,
    );
    return;
  }
  const trusted = await isTrusted(source, options.prompt !== false);
  if (!trusted) {
    return;
  }

  // Resolve brand directory
  const brandDir = await ensureBrandDirectory(options.prompt !== false);

  // Extract and move the template into place
  const stagedDir = await stageBrand(source, tempContext);

  // Filter the list to template files
  const filesToCopy = templateFiles(stagedDir);

  // Confirm changes to brand directory
  if (options.prompt) {
    const filename = (typeof (source.resolvedTarget) === "string"
      ? source.resolvedTarget
      : source.resolvedFile) || "brand.zip";

    const allowUse = await Confirm.prompt({
      message: `Proceed with using brand ${filename}?`,
      default: true,
    });
    if (!allowUse) {
      return;
    }
  }

  // Confirm any overwrites
  info(
    `\nPreparing brand files...`,
  );

  const copyActions: Array<{ file: string; copy: () => Promise<void> }> = [];
  for (const fileToCopy of filesToCopy) {
    const isDir = Deno.statSync(fileToCopy).isDirectory;
    const rel = relative(stagedDir, fileToCopy);
    if (isDir) {
      continue;
    }
    // Compute the paths
    const target = join(brandDir, rel);
    const displayName = rel;
    const targetDir = dirname(target);
    const copyAction = {
      file: displayName,
      copy: async () => {
        // Ensure the directory exists
        await ensureDir(targetDir);

        // Copy the file into place
        await Deno.copyFile(fileToCopy, target);
      },
    };

    if (existsSync(target)) {
      if (options.prompt) {
        const proceed = await Confirm.prompt({
          message: `Overwrite file ${displayName}?`,
          default: true,
        });
        if (proceed) {
          copyActions.push(copyAction);
        } else {
          throw new Error(
            `The file ${displayName} already exists and would be overwritten by this action.`,
          );
        }
      }
    } else {
      copyActions.push(copyAction);
    }
  }

  // Copy the files
  if (copyActions.length > 0) {
    await withSpinner({ message: "Copying files..." }, async () => {
      for (const copyAction of copyActions) {
        await copyAction.copy();
      }
    });
  }

  if (copyActions.length > 0) {
    info(
      `\nFiles created:`,
    );
    for (const copyAction of copyActions) {
      info(` - ${copyAction.file}`);
    }
  }
}

async function stageBrand(
  source: ExtensionSource,
  tempContext: TempContext,
) {
  if (source.type === "remote") {
    // A temporary working directory
    const workingDir = tempContext.createDir();

    // Stages a remote file by downloading and unzipping it
    const archiveDir = join(workingDir, "archive");
    ensureDirSync(archiveDir);

    // The filename
    const filename = (typeof (source.resolvedTarget) === "string"
      ? source.resolvedTarget
      : source.resolvedFile) || "brand.zip";

    // The tarball path
    const toFile = join(archiveDir, filename);

    // Download the file
    await downloadWithProgress(source.resolvedTarget, `Downloading`, toFile);

    // Unzip and remove zip
    await unzipInPlace(toFile);

    // Try to find the correct sub directory
    if (source.targetSubdir) {
      const sourceSubDir = join(archiveDir, source.targetSubdir);
      if (existsSync(sourceSubDir)) {
        return sourceSubDir;
      }
    }

    // Couldn't find a source sub dir, see if there is only a single
    // subfolder and if so use that
    const dirEntries = Deno.readDirSync(archiveDir);
    let count = 0;
    let name;
    let hasFiles = false;
    for (const dirEntry of dirEntries) {
      // ignore any files
      if (dirEntry.isDirectory) {
        name = dirEntry.name;
        count++;
      } else {
        hasFiles = true;
      }
    }
    // there is a lone subfolder - use that.
    if (!hasFiles && count === 1 && name) {
      return join(archiveDir, name);
    }

    return archiveDir;
  } else {
    if (typeof source.resolvedTarget !== "string") {
      throw new InternalError(
        "Local resolved extension should always have a string target.",
      );
    }

    if (Deno.statSync(source.resolvedTarget).isDirectory) {
      // copy the contents of the directory, filtered by quartoignore
      return source.resolvedTarget;
    } else {
      // A temporary working directory
      const workingDir = tempContext.createDir();
      const targetFile = join(workingDir, basename(source.resolvedTarget));

      // Copy the zip to the working dir
      Deno.copyFileSync(
        source.resolvedTarget,
        targetFile,
      );

      await unzipInPlace(targetFile);
      return workingDir;
    }
  }
}

// Determines whether the user trusts the template
async function isTrusted(
  source: ExtensionSource,
  allowPrompt: boolean,
): Promise<boolean> {
  if (allowPrompt && source.type === "remote") {
    // Write the preamble
    const preamble =
      `\nIf you do not \ntrust the authors of the brand, we recommend that you do not install or \nuse the brand.`;
    info(preamble);

    // Ask for trust
    const question = "Do you trust the authors of this brand";
    const confirmed: boolean = await Confirm.prompt({
      message: question,
      default: true,
    });
    return confirmed;
  } else {
    return true;
  }
}

async function ensureBrandDirectory(allowPrompt: boolean) {
  const currentDir = Deno.cwd();
  const nbContext = notebookContext();
  const project = await projectContext(currentDir, nbContext);
  if (!project) {
    throw new Error(`Could not find project dir for ${currentDir}`);
  }
  const brandDir = join(project.dir, "brand");
  if (!existsSync(brandDir)) {
    if (allowPrompt) {
      if (
        !await Confirm.prompt({
          message: `Create brand directory ${brandDir}?`,
          default: true,
        })
      ) {
        throw new Error(`Could not create brand directory ${brandDir}`);
      }
    }
    ensureDirSync(brandDir);
  }
  return brandDir;
}

// Unpack and stage a zipped file
async function unzipInPlace(zipFile: string) {
  // Unzip the file
  await withSpinner(
    { message: "Unzipping" },
    async () => {
      // Unzip the archive
      const result = await unzip(zipFile);
      if (!result.success) {
        throw new Error("Failed to unzip brand.\n" + result.stderr);
      }

      // Remove the tar ball itself
      await Deno.remove(zipFile);

      return Promise.resolve();
    },
  );
}
