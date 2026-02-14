import { existsSync, promises as fs } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import type { ImportedFile } from "./github.link-transform.js";
import type { ExtendedLoaderContext } from "./github.types.js";

/**
 * Ensures directory exists and writes file to disk.
 * Validates that the resolved path stays within the project root.
 * @internal
 */
export async function syncFile(filePath: string, content: string) {
  const resolved = resolve(filePath);
  if (!resolved.startsWith(process.cwd())) {
    throw new Error(
      `syncFile: path "${filePath}" resolves outside project root`,
    );
  }
  const dir = resolved.substring(0, resolved.lastIndexOf("/"));
  if (dir && !existsSync(dir)) {
    await fs.mkdir(dir, { recursive: true });
  }
  await fs.writeFile(resolved, content, "utf-8");
}

/**
 * Stores a processed file in Astro's content store
 * @internal
 */
export async function storeProcessedFile(
  file: ImportedFile,
  context: ExtendedLoaderContext,
  clear: boolean,
) {
  const { store, generateDigest, entryTypes, logger, parseData, config } =
    context;

  function configForFile(filePath: string) {
    const ext = filePath.split(".").at(-1);
    if (!ext) {
      logger.warn(`No extension found for ${filePath}`);
      return;
    }
    return entryTypes?.get(`.${ext}`);
  }

  const entryType = configForFile(file.sourcePath || "tmp.md");
  if (!entryType) throw new Error("No entry type found");

  const fileUrl = pathToFileURL(file.targetPath);
  const { body, data } = await entryType.getEntryInfo({
    contents: file.content,
    fileUrl: fileUrl,
  });

  // Generate digest for storage (repository-level caching handles change detection)
  const digest = generateDigest(file.content);
  const existingEntry = store.get(file.id);

  if (existingEntry) {
    logger.debug(`🔄 File ${file.id} - updating`);
  } else {
    logger.debug(`📄 File ${file.id} - adding`);
  }

  // Write file to disk
  if (!existsSync(fileURLToPath(fileUrl))) {
    logger.verbose(`Writing ${file.id} to ${fileUrl}`);
    await syncFile(fileURLToPath(fileUrl), file.content);
  }

  const parsedData = await parseData({
    id: file.id,
    data,
    filePath: fileUrl.toString(),
  });

  // When clear mode is enabled, delete the existing entry before setting the new one.
  // This provides atomic replacement without breaking Astro's content collection,
  // as opposed to calling store.clear() which empties everything at once.
  if (clear && existingEntry) {
    logger.debug(`🗑️ Clearing existing entry before replacement: ${file.id}`);
    store.delete(file.id);
  }

  // Store in content store
  if (entryType.getRenderFunction) {
    logger.verbose(`Rendering ${file.id}`);
    const render = await entryType.getRenderFunction(config);
    let rendered = undefined;
    try {
      rendered = await render?.({
        id: file.id,
        data,
        body,
        filePath: fileUrl.toString(),
        digest,
      });
    } catch (error: unknown) {
      logger.error(
        `Error rendering ${file.id}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
    logger.debug(
      `🔍 Storing collection entry: ${file.id} (${file.sourcePath} -> ${file.targetPath})`,
    );
    store.set({
      id: file.id,
      data: parsedData,
      body,
      filePath: file.targetPath,
      digest,
      rendered,
    });
  } else if ("contentModuleTypes" in entryType) {
    store.set({
      id: file.id,
      data: parsedData,
      body,
      filePath: file.targetPath,
      digest,
      deferredRender: true,
    });
  } else {
    store.set({
      id: file.id,
      data: parsedData,
      body,
      filePath: file.targetPath,
      digest,
    });
  }

  return { id: file.id, filePath: file.targetPath };
}
