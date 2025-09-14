import { existsSync, promises as fs } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { join, dirname, basename, extname } from "node:path";
import picomatch from "picomatch";

import {
  INVALID_SERVICE_RESPONSE,
  INVALID_STRING_ERROR,
  INVALID_URL_ERROR,
} from "./github.constants.js";

import type { LoaderContext, CollectionEntryOptions, ImportOptions, RenderedContent } from "./github.types.js";

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
export function generateId(options: ImportOptions) {
  let id = options.path || "";
  if (typeof options.replace === "string") {
    id = id.replace(options.replace, "");
  }
  // Remove file extension for ID generation
  const lastDotIndex = id.lastIndexOf('.');
  if (lastDotIndex > 0) {
    id = id.substring(0, lastDotIndex);
  }
  return id;
}

/**
 * Applies file renaming rules to a path if configured
 * @param filePath - Original file path relative to repository
 * @param options - Import options containing fileRenames configuration  
 * @returns Renamed path if rule matches, otherwise original path
 * @internal
 */
export function applyFileRename(filePath: string, options: ImportOptions): string {
  if (!options.fileRenames || options.fileRenames.length === 0) {
    return filePath;
  }

  // Find matching rename rule - try both with and without extension
  let rename = options.fileRenames.find(r => r.from === filePath);
  
  if (!rename) {
    // If no direct match, try matching with extension added
    const filePathWithExt = `${filePath}.md`;
    rename = options.fileRenames.find(r => r.from === filePathWithExt);
  }
  
  if (!rename) {
    // If still no match, try matching without extension
    const lastDotIndex = filePath.lastIndexOf('.');
    if (lastDotIndex > 0) {
      const filePathWithoutExt = filePath.substring(0, lastDotIndex);
      rename = options.fileRenames.find(r => r.from === filePathWithoutExt);
    }
  }
  
  if (rename) {
    // Remove extension from the target if it has one, since generatePath will add it back
    const lastDotIndex = rename.to.lastIndexOf('.');
    if (lastDotIndex > 0) {
      return rename.to.substring(0, lastDotIndex);
    }
    return rename.to;
  }

  return filePath;
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
export function generatePath(options: ImportOptions, id?: string) {
  if (typeof id === "string") {
    // Apply file renaming if configured
    const renamedId = applyFileRename(id, options);
    
    // Preserve original file extension from options.path
    const originalPath = options.path || "";
    const lastDotIndex = originalPath.lastIndexOf('.');
    const extension = lastDotIndex > 0 ? originalPath.substring(lastDotIndex) : '.md';
    return `${options.basePath ? `${options.basePath}/` : ""}${renamedId}${extension}`;
  }
  return options.path || "";
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
 * Default asset patterns for common image and media file types
 * @internal
 */
const DEFAULT_ASSET_PATTERNS = ['.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp', '.ico', '.bmp'];

/**
 * Checks if a file path should be included based on ignore patterns
 * @param filePath - The file path to check (relative to the repository root)
 * @param options - Import options containing ignores patterns
 * @returns true if file should be included, false otherwise
 * @internal
 */
export function shouldIncludeFile(filePath: string, options: ImportOptions): boolean {
  const { ignores } = options;
  
  // If no ignore patterns specified, include all files
  if (!ignores || ignores.length === 0) {
    return true;
  }
  
  // Check if file matches any ignore pattern
  const ignoreMatchers = ignores.map(pattern => picomatch(pattern));
  return !ignoreMatchers.some(matcher => matcher(filePath));
}

/**
 * Detects asset references in markdown content using regex patterns
 * @param content - The markdown content to parse
 * @param assetPatterns - File extensions to treat as assets
 * @returns Array of detected asset paths
 * @internal
 */
export function detectAssets(content: string, assetPatterns: string[] = DEFAULT_ASSET_PATTERNS): string[] {
  const assets: string[] = [];
  const patterns = assetPatterns.map(ext => ext.toLowerCase());
  
  // Match markdown images: ![alt](path)
  const imageRegex = /!\[[^\]]*\]\(([^)]+)\)/g;
  let match;
  
  while ((match = imageRegex.exec(content)) !== null) {
    const assetPath = match[1];
    // Only include relative paths and assets matching our patterns
    if (assetPath.startsWith('./') || assetPath.startsWith('../') || !assetPath.includes('://')) {
      const ext = extname(assetPath).toLowerCase();
      if (patterns.includes(ext)) {
        assets.push(assetPath);
      }
    }
  }
  
  // Match HTML img tags: <img src="path">
  const htmlImgRegex = /<img[^>]+src\s*=\s*["']([^"']+)["'][^>]*>/gi;
  while ((match = htmlImgRegex.exec(content)) !== null) {
    const assetPath = match[1];
    if (assetPath.startsWith('./') || assetPath.startsWith('../') || !assetPath.includes('://')) {
      const ext = extname(assetPath).toLowerCase();
      if (patterns.includes(ext)) {
        assets.push(assetPath);
      }
    }
  }
  
  return [...new Set(assets)]; // Remove duplicates
}

/**
 * Downloads an asset from GitHub and saves it locally
 * @param octokit - GitHub API client
 * @param owner - Repository owner
 * @param repo - Repository name  
 * @param ref - Git reference
 * @param assetPath - Path to the asset in the repository
 * @param localPath - Local path where the asset should be saved
 * @param signal - Abort signal for cancellation
 * @returns Promise that resolves when the asset is downloaded
 * @internal
 */
export async function downloadAsset(
  octokit: any,
  owner: string,
  repo: string,
  ref: string,
  assetPath: string,
  localPath: string,
  signal?: AbortSignal
): Promise<void> {
  try {
    const { data } = await octokit.rest.repos.getContent({
      owner,
      repo,
      path: assetPath,
      ref,
      request: { signal },
    });

    if (Array.isArray(data) || data.type !== 'file' || !data.download_url) {
      throw new Error(`Asset ${assetPath} is not a valid file`);
    }

    const response = await fetch(data.download_url, { signal });
    if (!response.ok) {
      throw new Error(`Failed to download asset: ${response.statusText}`);
    }

    const buffer = await response.arrayBuffer();
    const dir = dirname(localPath);
    
    if (!existsSync(dir)) {
      await fs.mkdir(dir, { recursive: true });
    }
    
    await fs.writeFile(localPath, new Uint8Array(buffer));
  } catch (error: any) {
    if (error.status === 404) {
      console.warn(`Asset not found: ${assetPath}`);
      return;
    }
    throw error;
  }
}

/**
 * Transforms asset references in markdown content to use local paths
 * @param content - The markdown content to transform
 * @param assetMap - Map of original asset paths to new local paths
 * @returns Transformed content with updated asset references
 * @internal
 */
export function transformAssetReferences(content: string, assetMap: Map<string, string>): string {
  let transformedContent = content;
  
  for (const [originalPath, newPath] of assetMap) {
    // Transform markdown images
    const imageRegex = new RegExp(`(!)\\[([^\\]]*)\\]\\(\\s*${escapeRegExp(originalPath)}\\s*\\)`, 'g');
    transformedContent = transformedContent.replace(imageRegex, `$1[$2](${newPath})`);
    
    // Transform HTML img tags
    const htmlRegex = new RegExp(`(<img[^>]+src\\s*=\\s*["'])${escapeRegExp(originalPath)}(["'][^>]*>)`, 'gi');
    transformedContent = transformedContent.replace(htmlRegex, `$1${newPath}$2`);
  }
  
  return transformedContent;
}

/**
 * Escapes special regex characters in a string
 * @internal
 */
function escapeRegExp(string: string): string {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Processes assets in markdown content by detecting, downloading, and transforming references
 * @param content - The markdown content to process
 * @param options - Configuration options including asset settings
 * @param octokit - GitHub API client
 * @param signal - Abort signal for cancellation
 * @returns Promise that resolves to transformed content
 * @internal
 */
async function processAssets(
  content: string,
  options: ImportOptions,
  octokit: any,
  signal?: AbortSignal
): Promise<string> {
  const { owner, repo, ref = 'main', path: basePath = '', assetsPath, assetsBaseUrl, assetPatterns } = options;
  
  if (!assetsPath || !assetsBaseUrl) {
    return content;
  }

  // Detect assets in the content
  const detectedAssets = detectAssets(content, assetPatterns);
  if (detectedAssets.length === 0) {
    return content;
  }

  const assetMap = new Map<string, string>();
  
  // Process each detected asset
  await Promise.all(detectedAssets.map(async (assetPath) => {
    try {
      // Resolve the asset path relative to the current markdown file
      const resolvedAssetPath = resolveAssetPath(basePath, assetPath);
      
      // Generate unique filename to avoid conflicts
      const originalFilename = basename(assetPath);
      const ext = extname(originalFilename);
      const nameWithoutExt = basename(originalFilename, ext);
      const uniqueFilename = `${nameWithoutExt}-${Date.now()}${ext}`;
      const localPath = join(assetsPath, uniqueFilename);
      
      // Download the asset
      await downloadAsset(octokit, owner, repo, ref, resolvedAssetPath, localPath, signal);
      
      // Generate URL for the transformed reference
      const assetUrl = `${assetsBaseUrl}/${uniqueFilename}`.replace(/\/+/g, '/');
      
      // Map the transformation
      assetMap.set(assetPath, assetUrl);
    } catch (error) {
      console.warn(`Failed to process asset ${assetPath}:`, error);
    }
  }));

  // Transform the content with new asset references
  return transformAssetReferences(content, assetMap);
}

/**
 * Resolves an asset path relative to a base path
 * @internal
 */
function resolveAssetPath(basePath: string, assetPath: string): string {
  if (assetPath.startsWith('./')) {
    return join(dirname(basePath), assetPath.slice(2));
  } else if (assetPath.startsWith('../')) {
    return join(dirname(basePath), assetPath);
  }
  return assetPath;
}

/**
 * Synchronizes an entry by fetching its contents, validating its metadata, and storing or rendering it as needed.
 *
 * @param {LoaderContext} context - The loader context containing the required utilities, metadata, and configuration.
 * @param {Object} urls - Object containing URL data.
 * @param {string | URL | null} urls.url - The URL of the entry to fetch. Throws an error if null or invalid.
 * @param {string} urls.editUrl - The URL for editing the entry.
 * @param {RootOptions} options - Configuration settings for processing the entry such as file paths and custom options.
 * @param {any} octokit - GitHub API client for downloading assets.
 * @param {RequestInit} [init] - Optional parameter for customizing the fetch request.
 * @return {Promise<void>} Resolves when the entry has been successfully processed and stored. Throws errors if invalid URL, missing configuration, or other issues occur.
 * @internal
 */
export async function syncEntry(
  context: LoaderContext,
  { url, editUrl }: { url: string | URL | null; editUrl: string },
  options: ImportOptions,
  octokit: any,
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

  let res = await fetch(url, init);

  if (res.status === 304) {
    // Only skip if the local file actually exists
    const relativePath = generatePath(options, id);
    const filePath = pathToFileURL(relativePath);
    
    if (existsSync(fileURLToPath(filePath))) {
      logger.info(`Skipping ${id} as it has not changed`);
      return;
    } else {
      logger.info(`File ${id} missing locally, re-fetching despite 304`);
      // File is missing locally, fetch without ETag headers
      const freshInit = { ...init };
      freshInit.headers = new Headers(init.headers);
      freshInit.headers.delete('If-None-Match');
      freshInit.headers.delete('If-Modified-Since');
      
      res = await fetch(url, freshInit);
      if (!res.ok) throw new Error(res.statusText);
    }
  }
  if (!res.ok) throw new Error(res.statusText);
  let contents = await res.text();
  const entryType = configForFile(options?.path || "tmp.md");
  if (!entryType) throw new Error("No entry type found");

  // Apply content transforms if provided
  if (options.transforms && options.transforms.length > 0) {
    const transformContext = {
      id,
      path: options.path || "",
      options,
    };
    
    for (const transform of options.transforms) {
      try {
        contents = transform(contents, transformContext);
      } catch (error) {
        logger.warn(`Transform failed for ${id}: ${error}`);
      }
    }
  }

  // Process assets if configuration is provided
  if (options.assetsPath && options.assetsBaseUrl) {
    await processAssets(contents, options, octokit, init.signal || undefined).then(transformedContent => {
      contents = transformedContent;
    }).catch(error => {
      logger.warn(`Asset processing failed for ${id}: ${error.message}`);
    });
  }

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
          octokit,
          { signal },
        );
      default:
        throw new Error("Invalid type");
    }
  }

  // Directory listing with filtering
  const promises: Promise<any>[] = data
    .filter(({ type, path }) => {
      // Always include directories for recursion
      if (type === "dir") return true;
      // Apply filtering logic to files
      if (type === "file") {
        return shouldIncludeFile(path, options);
      }
      return false;
    })
    .map(({ type, path, download_url, url }) => {
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
            octokit,
            { signal },
          );
        default:
          throw new Error("Invalid type");
      }
    });
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