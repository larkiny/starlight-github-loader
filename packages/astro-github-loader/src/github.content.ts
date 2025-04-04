import { existsSync, promises as fs } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";

import {
  INVALID_SERVICE_RESPONSE,
  INVALID_STRING_ERROR,
  INVALID_URL_ERROR,
} from "./github.constants.js";

import type { LoaderContext, CollectionEntryOptions, RootOptions, RenderedContent } from "./github.types.js";

/**
 * Generates a unique identifier based on the given options.
 *
 * @param {RootOptions} options - The configuration object containing the path and replacement string.
 * @param {string} options.path - The file path used to generate the identifier, defaults to an empty string if absent.
 * @param {string} [options.replace] - Optional substring that will be removed from the identifier if present.
 * @return {string} The generated identifier with the specified transformations applied.
 *
 * @internal
 */
export function generateId(options: RootOptions) {
  let id = options.path?.replace(".mdx", "") || "";
  if (typeof options.replace === "string") {
    id = id.replace(options.replace, "");
  }
  return id;
}

/**
 * Generates a path based on the provided options and optional identifier.
 *
 * @param {RootOptions} options - An object containing configuration for path generation.
 * @param {string} [id] - An optional identifier to append to the base path.
 * @return {string} The generated path as a string. Returns a modified path based on the identifier
 * provided or the base path configuration. Returns an empty string if no path can be generated.
 * @internal
 */
export function generatePath(options: RootOptions, id?: string) {
  if (typeof id === "string") {
    return `${options.basePath ? `${options.basePath}/` : ""}${id}.mdx`;
  }
  return options.path?.replace(".mdx", "") || "";
}

/**
 * Synchronizes a file by ensuring the target directory exists and then writing the specified content to the file at the given path.
 *
 * @param {string} path - The path of the file to synchronize, including its directory and filename.
 * @param {string} content - The content to write into the file.
 * @return {Promise<void>} - A promise that resolves when the file has been successfully written.
 * @internal
 */
export async function syncFile(path: string, content: string) {
  const dir = path.substring(0, path.lastIndexOf("/"));

  // Ensure the directory exists
  if (dir && !existsSync(dir)) {
    await fs.mkdir(dir, { recursive: true });
  }

  // Write the file to the filesystem and store
  await fs.writeFile(path, content, "utf-8");
}

/**
 * Synchronizes an entry by fetching its contents, validating its metadata, and storing or rendering it as needed.
 *
 * @param {LoaderContext} context - The loader context containing the required utilities, metadata, and configuration.
 * @param {Object} urls - Object containing URL data.
 * @param {string | URL | null} urls.url - The URL of the entry to fetch. Throws an error if null or invalid.
 * @param {string} urls.editUrl - The URL for editing the entry.
 * @param {RootOptions} options - Configuration settings for processing the entry such as file paths and custom options.
 * @param {RequestInit} [init] - Optional parameter for customizing the fetch request.
 * @return {Promise<void>} Resolves when the entry has been successfully processed and stored. Throws errors if invalid URL, missing configuration, or other issues occur.
 * @internal
 */
export async function syncEntry(
  context: LoaderContext,
  { url, editUrl }: { url: string | URL | null; editUrl: string },
  options: RootOptions,
  init: RequestInit = {},
) {
  // Exit on null or if the URL is invalid
  if (url === null || (typeof url !== "string" && !(url instanceof URL))) {
    throw new TypeError(INVALID_URL_ERROR);
  }
  // Validate URL
  if (typeof url === "string") url = new URL(url);

  const { meta, store, generateDigest, entryTypes, logger, parseData, config } =
    context;

  function configForFile(file: string) {
    const ext = file.split(".").at(-1);
    if (!ext) {
      logger.warn(`No extension found for ${file}`);
      return;
    }
    return entryTypes?.get(`.${ext}`);
  }
  // Custom ID, TODO: Allow custom id generators
  let id = generateId(options);

  init.headers = getHeaders({
    init: init.headers,
    meta,
    id,
  });

  const res = await fetch(url, init);

  if (res.status === 304) {
    logger.info(`Skipping ${id} as it has not changed`);
    return;
  }
  if (!res.ok) throw new Error(res.statusText);
  const contents = await res.text();
  const entryType = configForFile(options?.path || "tmp.mdx");
  if (!entryType) throw new Error("No entry type found");

  const relativePath = generatePath(options, id);
  const filePath = pathToFileURL(relativePath);
  const { body, data } = await entryType.getEntryInfo({
    contents,
    fileUrl: filePath,
  });

  const existingEntry = store.get(id);

  const digest = generateDigest(contents);

  if (
    existingEntry &&
    existingEntry.digest === digest &&
    existingEntry.filePath
  ) {
    return;
  }
  // Write file to path
  if (!existsSync(fileURLToPath(filePath))) {
    logger.info(`Writing ${id} to ${filePath}`);
    await syncFile(fileURLToPath(filePath), contents);
  }

  const parsedData = await parseData({
    id,
    data,
    filePath: filePath.toString(),
  });

  if (entryType.getRenderFunction) {
    logger.info(`Rendering ${id}`);
    const render = await entryType.getRenderFunction(config);
    let rendered: RenderedContent | undefined = undefined;
    try {
      rendered = await render?.({
        id,
        data,
        body,
        filePath: filePath.toString(),
        digest,
      });
    } catch (error: any) {
      logger.error(`Error rendering ${id}: ${error.message}`);
    }
    store.set({
      id,
      data: parsedData,
      body,
      filePath: relativePath,
      digest,
      rendered,
    });
  } else if ("contentModuleTypes" in entryType) {
    store.set({
      id,
      data: parsedData,
      body,
      filePath: relativePath,
      digest,
      deferredRender: true,
    });
  } else {
    store.set({ id, data: parsedData, body, filePath: relativePath, digest });
  }

  syncHeaders({
    headers: res.headers,
    meta,
    id,
  });
}

/**
 * Converts a given GitHub repository path into a collection entry by fetching the content
 * from the GitHub repository using the provided Octokit instance and options.
 * Handles both files and directories, recursively processing directories if needed.
 * @internal
 */
export async function toCollectionEntry({
  context,
  octokit,
  options,
  signal,
}: CollectionEntryOptions) {
  const { owner, repo, path = "", ref = "main" } = options || {};
  if (typeof repo !== "string" || typeof owner !== "string")
    throw new TypeError(INVALID_STRING_ERROR);

  // Fetch the content
  const { data, status } = await octokit.rest.repos.getContent({
    owner,
    repo,
    path,
    ref,
    request: { signal },
  });
  if (status !== 200) throw new Error(INVALID_SERVICE_RESPONSE);

  // Matches for regular files
  if (!Array.isArray(data)) {
    const path = data.path;
    switch (data.type) {
      // Return
      case "file":
        return await syncEntry(
          context,
          { url: data.download_url, editUrl: data.url },
          { ...options, path, ref },
          { signal },
        );
      default:
        throw new Error("Invalid type");
    }
  }

  // Directory listing
  const promises: Promise<any>[] = data.map(
    ({ type, path, download_url, url }) => {
      switch (type) {
        // Recurse
        case "dir":
          return toCollectionEntry({
            context,
            octokit,
            options: { ...options, path, ref },
            signal,
          });
        // Return
        case "file":
          return syncEntry(
            context,
            { url: download_url, editUrl: url },
            { ...options, path, ref },
            { signal },
          );
        default:
          throw new Error("Invalid type");
      }
    },
  );
  return await Promise.all(promises);
}



/**
 * Get the headers needed to make a conditional request.
 * Uses the etag and last-modified values from the meta store.
 * @internal
 */
export function getHeaders({
                                        init,
                                        meta,
                                        id,
                                      }: {
  /** Initial headers to include */
  init?: RequestInit["headers"];
  /** Meta store to get etag and last-modified values from */
  meta: LoaderContext["meta"];
  id: string;
}): Headers {
  const tag = `${id}-etag`;
  const lastModifiedTag = `${id}-last-modified`;
  const etag = meta.get(tag);
  const lastModified = meta.get(lastModifiedTag);
  const headers = new Headers(init);

  if (etag) {
    headers.set("If-None-Match", etag);
  } else if (lastModified) {
    headers.set("If-Modified-Since", lastModified);
  }
  return headers;
}

/**
 * Store the etag or last-modified headers from a response in the meta store.
 * @internal
 */
export function syncHeaders({
                                          headers,
                                          meta,
                                          id,
                                        }: {
  /** Headers from the response */
  headers: Headers;
  /** Meta store to store etag and last-modified values in */
  meta: LoaderContext["meta"];
  /** id string */
  id: string;
}) {
  const etag = headers.get("etag");
  const lastModified = headers.get("last-modified");
  const tag = `${id}-etag`;
  const lastModifiedTag = `${id}-last-modified`;
  meta.delete(tag);
  meta.delete(lastModifiedTag);
  if (etag) {
    meta.set(tag, etag);
  } else if (lastModified) {
    meta.set(lastModifiedTag, lastModified);
  }
}