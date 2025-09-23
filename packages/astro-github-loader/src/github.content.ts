import { existsSync, promises as fs } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import path, { join, dirname, basename, extname } from "node:path";
import picomatch from "picomatch";
import { globalLinkTransform, type ImportedFile } from "./github.link-transform.js";

import {
  INVALID_SERVICE_RESPONSE,
  INVALID_STRING_ERROR,
  INVALID_URL_ERROR,
} from "./github.constants.js";

import type { LoaderContext, CollectionEntryOptions, ImportOptions, RenderedContent, MatchedPattern } from "./github.types.js";

/**
 * Generates a unique identifier from a file path by removing the extension
 * @param filePath - The file path to generate ID from
 * @return {string} The generated identifier as a string with extension removed
 * @internal
 */
export function generateId(filePath: string): string {
  let id = filePath;

  // Remove file extension for ID generation
  const lastDotIndex = id.lastIndexOf('.');
  if (lastDotIndex > 0) {
    id = id.substring(0, lastDotIndex);
  }
  return id;
}


/**
 * Applies path mapping logic to get the final filename for a file
 *
 * Supports two types of path mappings:
 * - **File mapping**: Exact file path match (e.g., 'docs/README.md' -> 'docs/overview.md')
 * - **Folder mapping**: Folder path with trailing slash (e.g., 'docs/capabilities/' -> 'docs/')
 *
 * @param filePath - Original source file path
 * @param matchedPattern - The pattern that matched this file
 * @param options - Import options containing path mappings
 * @returns Final filename after applying path mapping logic
 * @internal
 */
export function applyRename(filePath: string, matchedPattern?: MatchedPattern | null, options?: ImportOptions): string {
  if (options?.includes && matchedPattern && matchedPattern.index < options.includes.length) {
    const includePattern = options.includes[matchedPattern.index];

    if (includePattern.pathMappings) {
      // First check for exact file match (current behavior - backwards compatible)
      if (includePattern.pathMappings[filePath]) {
        return includePattern.pathMappings[filePath];
      }

      // Then check for folder-to-folder mappings
      for (const [sourceFolder, targetFolder] of Object.entries(includePattern.pathMappings)) {
        // Check if this is a folder mapping (ends with /) and file is within it
        if (sourceFolder.endsWith('/') && filePath.startsWith(sourceFolder)) {
          // Replace the source folder path with target folder path
          const relativePath = filePath.slice(sourceFolder.length);
          return path.posix.join(targetFolder, relativePath);
        }
      }
    }
  }

  // Return original filename if no path mapping found
  return basename(filePath);
}

/**
 * Generates a local file path based on the matched pattern and file path
 * @param filePath - The original file path from the repository
 * @param matchedPattern - The pattern that matched this file (or null if no includes specified)
 * @param options - Import options containing includes patterns for path mapping lookups
 * @return {string} The local file path where this content should be stored
 * @internal
 */
export function generatePath(filePath: string, matchedPattern?: MatchedPattern | null, options?: ImportOptions): string {
  if (matchedPattern) {
    // Extract the directory part from the pattern (before any glob wildcards)
    const pattern = matchedPattern.pattern;
    const beforeGlob = pattern.split(/[*?{]/)[0];
    
    // Remove the pattern prefix from the file path to get the relative path
    let relativePath = filePath;
    if (beforeGlob && filePath.startsWith(beforeGlob)) {
      relativePath = filePath.substring(beforeGlob.length);
      // Remove leading slash if present
      if (relativePath.startsWith('/')) {
        relativePath = relativePath.substring(1);
      }
    }
    
    // If no relative path remains, use just the filename
    if (!relativePath) {
      relativePath = basename(filePath);
    }

    // Apply path mapping logic
    const finalFilename = applyRename(filePath, matchedPattern, options);
    // Always apply path mapping if applyRename returned something different from the original basename
    // OR if there are pathMappings configured (since empty string mappings might return same basename)
    const hasPathMappings = options?.includes?.[matchedPattern.index]?.pathMappings &&
                           Object.keys(options.includes[matchedPattern.index].pathMappings!).length > 0;
    if (finalFilename !== basename(filePath) || hasPathMappings) {
      // Check if applyRename returned a full path (contains path separators) or just a filename
      if (finalFilename.includes('/') || finalFilename.includes('\\')) {
        // applyRename returned a full relative path - need to extract relative part
        // Remove the pattern prefix to get the relative path within the pattern context
        const beforeGlob = pattern.split(/[*?{]/)[0];
        if (beforeGlob && finalFilename.startsWith(beforeGlob)) {
          relativePath = finalFilename.substring(beforeGlob.length);
          // Remove leading slash if present
          if (relativePath.startsWith('/')) {
            relativePath = relativePath.substring(1);
          }
        } else {
          relativePath = finalFilename;
        }
      } else {
        // applyRename returned just a filename
        // If the filename is different due to pathMapping, use it directly
        // This handles cases where pathMappings flatten directory structures
        relativePath = finalFilename;
      }
    }

    return join(matchedPattern.basePath, relativePath);
  }
  
  // Should not happen since we always use includes
  throw new Error("No matched pattern provided - includes are required");
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
 * Checks if a file path should be included and returns the matching pattern
 * @param filePath - The file path to check (relative to the repository root)
 * @param options - Import options containing includes patterns
 * @returns Object with include status and matched pattern, or null if not included
 * @internal
 */
export function shouldIncludeFile(filePath: string, options: ImportOptions): { included: true; matchedPattern: MatchedPattern | null } | { included: false; matchedPattern: null } {
  const { includes } = options;
  
  // If no include patterns specified, include all files
  if (!includes || includes.length === 0) {
    return { included: true, matchedPattern: null };
  }
  
  // Check each include pattern to find a match
  for (let i = 0; i < includes.length; i++) {
    const includePattern = includes[i];
    const matcher = picomatch(includePattern.pattern);
    
    if (matcher(filePath)) {
      return {
        included: true,
        matchedPattern: {
          pattern: includePattern.pattern,
          basePath: includePattern.basePath,
          index: i
        }
      };
    }
  }
  
  // No patterns matched
  return { included: false, matchedPattern: null };
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
  console.log(`      📡 GitHub API call: repos.getContent(${owner}/${repo}:${assetPath}@${ref})`);
  try {
    const { data } = await octokit.rest.repos.getContent({
      owner,
      repo,
      path: assetPath,
      ref,
      request: { signal },
    });

    console.log(`      📋 GitHub API response: type=${data.type}, isArray=${Array.isArray(data)}`);

    if (Array.isArray(data) || data.type !== 'file' || !data.download_url) {
      throw new Error(`Asset ${assetPath} is not a valid file (type: ${data.type}, downloadUrl: ${data.download_url})`);
    }

    console.log(`      🌐 Fetching from download URL: ${data.download_url}`);
    const response = await fetch(data.download_url, { signal });
    if (!response.ok) {
      throw new Error(`Failed to download asset: ${response.status} ${response.statusText}`);
    }

    console.log(`      📦 Converting to buffer (size: ${response.headers.get('content-length')} bytes)`);
    const buffer = await response.arrayBuffer();
    const dir = dirname(localPath);

    console.log(`      📁 Ensuring directory exists: ${dir}`);
    if (!existsSync(dir)) {
      await fs.mkdir(dir, { recursive: true });
      console.log(`      ✨ Created directory: ${dir}`);
    }

    console.log(`      💿 Writing file: ${localPath}`);
    await fs.writeFile(localPath, new Uint8Array(buffer));
    console.log(`      🎉 Asset download complete!`);
  } catch (error: any) {
    console.log(`      🚫 Download error: ${error.message} (status: ${error.status})`);
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
  filePath: string,
  options: ImportOptions,
  octokit: any,
  signal?: AbortSignal
): Promise<string> {
  const { owner, repo, ref = 'main', assetsPath, assetsBaseUrl, assetPatterns } = options;

  console.log(`🖼️  Processing assets for ${filePath}`);
  console.log(`    assetsPath: ${assetsPath}`);
  console.log(`    assetsBaseUrl: ${assetsBaseUrl}`);

  if (!assetsPath || !assetsBaseUrl) {
    console.log(`    ⏭️  Skipping asset processing - missing assetsPath or assetsBaseUrl`);
    return content;
  }

  // Detect assets in the content
  const detectedAssets = detectAssets(content, assetPatterns);
  console.log(`    📸 Detected ${detectedAssets.length} assets:`, detectedAssets);

  if (detectedAssets.length === 0) {
    return content;
  }

  const assetMap = new Map<string, string>();

  // Process each detected asset
  await Promise.all(detectedAssets.map(async (assetPath) => {
    console.log(`    📥 Processing asset: ${assetPath}`);
    try {
      // Resolve the asset path relative to the current markdown file
      const resolvedAssetPath = resolveAssetPath(filePath, assetPath);
      console.log(`    🔗 Resolved path: ${resolvedAssetPath}`);

      // Generate unique filename to avoid conflicts
      const originalFilename = basename(assetPath);
      const ext = extname(originalFilename);
      const nameWithoutExt = basename(originalFilename, ext);
      const uniqueFilename = `${nameWithoutExt}-${Date.now()}${ext}`;
      const localPath = join(assetsPath, uniqueFilename);
      console.log(`    💾 Local path: ${localPath}`);

      // Download the asset
      console.log(`    ⬇️  Downloading asset from ${owner}/${repo}@${ref}:${resolvedAssetPath}`);
      await downloadAsset(octokit, owner, repo, ref, resolvedAssetPath, localPath, signal);
      console.log(`    ✅ Downloaded successfully`);

      // Generate URL for the transformed reference
      const assetUrl = `${assetsBaseUrl}/${uniqueFilename}`.replace(/\/+/g, '/');
      console.log(`    🔄 Transform: ${assetPath} -> ${assetUrl}`);

      // Map the transformation
      assetMap.set(assetPath, assetUrl);
    } catch (error) {
      console.warn(`    ❌ Failed to process asset ${assetPath}:`, error);
    }
  }));

  console.log(`    🗺️  Asset map size: ${assetMap.size}`);
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
  filePath: string,
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
  let id = generateId(filePath);

  init.headers = getHeaders({
    init: init.headers,
    meta,
    id,
  });

  let res = await fetch(url, init);

  if (res.status === 304) {
    // Only skip if the local file actually exists
    const includeResult = shouldIncludeFile(filePath, options);
    const relativePath = generatePath(filePath, includeResult.included ? includeResult.matchedPattern : null, options);
    const fileUrl = pathToFileURL(relativePath);
    
    if (existsSync(fileURLToPath(fileUrl))) {
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
  const entryType = configForFile(filePath || "tmp.md");
  if (!entryType) throw new Error("No entry type found");

  // Process assets FIRST if configuration is provided - before content transforms
  // This ensures asset detection works with original markdown links before they get transformed
  if (options.assetsPath && options.assetsBaseUrl) {
    await processAssets(contents, filePath, options, octokit, init.signal || undefined).then(transformedContent => {
      contents = transformedContent;
    }).catch(error => {
      logger.warn(`Asset processing failed for ${id}: ${error.message}`);
    });
  }

  // Apply content transforms if provided - both global and pattern-specific
  // This runs after asset processing so transforms work with processed content
  const includeResultForTransforms = shouldIncludeFile(filePath, options);
  const transformsToApply: any[] = [];

  // Add global transforms first
  if (options.transforms && options.transforms.length > 0) {
    transformsToApply.push(...options.transforms);
  }

  // Add pattern-specific transforms
  if (includeResultForTransforms.included && includeResultForTransforms.matchedPattern && options.includes) {
    const matchedInclude = options.includes[includeResultForTransforms.matchedPattern.index];
    if (matchedInclude.transforms && matchedInclude.transforms.length > 0) {
      transformsToApply.push(...matchedInclude.transforms);
    }
  }

  if (transformsToApply.length > 0) {
    const transformContext = {
      id,
      path: filePath,
      options,
      matchedPattern: includeResultForTransforms.included ? includeResultForTransforms.matchedPattern : undefined,
    };

    for (const transform of transformsToApply) {
      try {
        contents = transform(contents, transformContext);
      } catch (error) {
        logger.warn(`Transform failed for ${id}: ${error}`);
      }
    }
  }

  const includeResult = shouldIncludeFile(filePath, options);
  const relativePath = generatePath(filePath, includeResult.included ? includeResult.matchedPattern : null, options);
  const fileUrl = pathToFileURL(relativePath);
  const { body, data } = await entryType.getEntryInfo({
    contents,
    fileUrl: fileUrl,
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
  if (!existsSync(fileURLToPath(fileUrl))) {
    logger.info(`Writing ${id} to ${fileUrl}`);
    await syncFile(fileURLToPath(fileUrl), contents);
  }

  const parsedData = await parseData({
    id,
    data,
    filePath: fileUrl.toString(),
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
        filePath: fileUrl.toString(),
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
  const { owner, repo, ref = "main" } = options || {};
  if (typeof repo !== "string" || typeof owner !== "string")
    throw new TypeError(INVALID_STRING_ERROR);

  // Get all unique directory prefixes from include patterns to limit scanning
  const directoriesToScan = new Set<string>();
  if (options.includes && options.includes.length > 0) {
    for (const includePattern of options.includes) {
      // Extract directory part from pattern (before any glob wildcards)
      const pattern = includePattern.pattern;
      const beforeGlob = pattern.split(/[*?{]/)[0];
      const dirPart = beforeGlob.includes('/') ? beforeGlob.substring(0, beforeGlob.lastIndexOf('/')) : '';
      directoriesToScan.add(dirPart);
    }
  } else {
    // If no includes specified, scan from root
    directoriesToScan.add('');
  }

  // Collect all files first (with content transforms applied)
  const allFiles: ImportedFile[] = [];

  for (const dirPath of directoriesToScan) {
    const files = await collectFilesRecursively(dirPath);
    allFiles.push(...files);
  }

  // Apply link transformation if configured
  let processedFiles = allFiles;
  if (options.linkTransform) {
    context.logger?.info(`Applying link transformation to ${allFiles.length} files`);
    processedFiles = globalLinkTransform(allFiles, {
      stripPrefixes: options.linkTransform.stripPrefixes,
      customHandlers: options.linkTransform.customHandlers,
      linkMappings: options.linkTransform.linkMappings,
    });
  }

  // Now store all processed files
  const results = [];
  for (const file of processedFiles) {
    const result = await storeProcessedFile(file, context, options);
    results.push(result);
  }

  return results;

  // Helper function to collect files without storing them
  async function collectFilesRecursively(path: string): Promise<ImportedFile[]> {
    const collectedFiles: ImportedFile[] = [];

    // Fetch the content
    const { data, status } = await octokit.rest.repos.getContent({
      owner,
      repo,
      path,
      ref,
      request: { signal },
    });
    if (status !== 200) throw new Error(INVALID_SERVICE_RESPONSE);

    // Handle single file
    if (!Array.isArray(data)) {
      const filePath = data.path;
      if (data.type === "file") {
        const fileData = await collectFileData(
          { url: data.download_url, editUrl: data.url },
          filePath
        );
        if (fileData) {
          collectedFiles.push(fileData);
        }
      }
      return collectedFiles;
    }

    // Directory listing - process files and recurse into subdirectories
    const filteredEntries = data
      .filter(({ type, path }) => {
        // Always include directories for recursion
        if (type === "dir") return true;
        // Apply filtering logic to files
        if (type === "file") {
          return shouldIncludeFile(path, options).included;
        }
        return false;
      });

    for (const { type, path, download_url, url } of filteredEntries) {
      if (type === "dir") {
        // Recurse into subdirectory
        const subDirFiles = await collectFilesRecursively(path);
        collectedFiles.push(...subDirFiles);
      } else if (type === "file") {
        // Process file
        const fileData = await collectFileData(
          { url: download_url, editUrl: url },
          path
        );
        if (fileData) {
          collectedFiles.push(fileData);
        }
      }
    }

    return collectedFiles;
  }

  // Helper function to collect file data with content transforms applied
  async function collectFileData(
    { url, editUrl }: { url: string | null; editUrl: string },
    filePath: string
  ): Promise<ImportedFile | null> {
    if (url === null || typeof url !== "string") {
      return null;
    }

    const urlObj = new URL(url);

    // Determine if file needs renaming and generate appropriate ID
    const includeCheck = shouldIncludeFile(filePath, options);
    const matchedPattern = includeCheck.included ? includeCheck.matchedPattern : null;

    // Check if this file has a path mapping
    const hasPathMapping = matchedPattern &&
      options?.includes &&
      matchedPattern.index < options.includes.length &&
      options.includes[matchedPattern.index].pathMappings &&
      options.includes[matchedPattern.index].pathMappings![filePath];

    // Generate ID based on appropriate path
    const id = hasPathMapping ?
      generateId(generatePath(filePath, matchedPattern, options)) : // Use path-mapped path for ID
      generateId(filePath); // Use original path for ID

    const finalPath = generatePath(filePath, matchedPattern, options);
    let contents: string;

    console.log(`🔄 Fetching file: ${filePath} from ${urlObj.toString()}`);

    // Download file content
    const init = { signal, headers: getHeaders({ init: {}, meta: context.meta, id }) };
    let res: Response | null = null;

    // Fetch with retries (simplified version of syncEntry logic)
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        res = await fetch(urlObj, init);
        if (res.ok) break;
      } catch (error) {
        if (attempt === 2) throw error;
        await new Promise(resolve => setTimeout(resolve, 1000 * (attempt + 1)));
      }
    }

    if (!res) {
      throw new Error(`No response received for ${urlObj.toString()}`);
    }

    if (res.status === 304) {
      // File not modified, read existing content from disk if it exists
      const includeResult = shouldIncludeFile(filePath, options);
      const relativePath = generatePath(filePath, includeResult.included ? includeResult.matchedPattern : null, options);
      const fileUrl = pathToFileURL(relativePath);

      if (existsSync(fileURLToPath(fileUrl))) {
        console.log(`⏭️  Using cached content for ${filePath} (304)`);
        const { promises: fs } = await import('node:fs');
        contents = await fs.readFile(fileURLToPath(fileUrl), 'utf-8');
      } else {
        // File is missing locally, re-fetch without cache headers
        console.log(`🔄 File ${filePath} missing locally, re-fetching despite 304`);
        const freshInit = { ...init };
        freshInit.headers = new Headers(init.headers);
        freshInit.headers.delete('If-None-Match');
        freshInit.headers.delete('If-Modified-Since');

        res = await fetch(urlObj, freshInit);
        if (!res.ok) {
          throw new Error(`Failed to fetch file content from ${urlObj.toString()}: ${res.status} ${res.statusText || 'Unknown error'}`);
        }
        contents = await res.text();
      }
    } else if (!res.ok) {
      throw new Error(`Failed to fetch file content from ${urlObj.toString()}: ${res.status} ${res.statusText || 'Unknown error'}`);
    } else {
      contents = await res.text();
    }

    // Process assets FIRST if configuration is provided
    if (options.assetsPath && options.assetsBaseUrl) {
      try {
        contents = await processAssets(contents, filePath, options, octokit, signal);
      } catch (error) {
        context.logger?.warn(`Asset processing failed for ${id}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    // Apply content transforms
    const includeResult = shouldIncludeFile(filePath, options);
    const transformsToApply: any[] = [];

    // Add global transforms first
    if (options.transforms && options.transforms.length > 0) {
      transformsToApply.push(...options.transforms);
    }

    // Add pattern-specific transforms
    if (includeResult.included && includeResult.matchedPattern && options.includes) {
      const matchedInclude = options.includes[includeResult.matchedPattern.index];
      if (matchedInclude.transforms && matchedInclude.transforms.length > 0) {
        transformsToApply.push(...matchedInclude.transforms);
      }
    }

    if (transformsToApply.length > 0) {
      const transformContext = {
        id,
        path: filePath,
        options,
        matchedPattern: includeResult.included ? includeResult.matchedPattern : undefined,
      };

      for (const transform of transformsToApply) {
        try {
          contents = transform(contents, transformContext);
        } catch (error) {
          context.logger?.warn(`Transform failed for ${id}: ${error}`);
        }
      }
    }

    // Use the finalPath we already computed
    return {
      sourcePath: filePath,
      targetPath: finalPath,
      content: contents,
      id,
    };
  }

  // Helper function to store a processed file
  async function storeProcessedFile(
    file: ImportedFile,
    context: any,
    options: ImportOptions
  ): Promise<any> {
    const { store, generateDigest, entryTypes, logger, parseData, config } = context;

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

    const existingEntry = store.get(file.id);
    const digest = generateDigest(file.content);

    if (
      existingEntry &&
      existingEntry.digest === digest &&
      existingEntry.filePath
    ) {
      return; // No changes, skip
    }

    // Write file to disk
    if (!existsSync(fileURLToPath(fileUrl))) {
      logger.info(`Writing ${file.id} to ${fileUrl}`);
      await syncFile(fileURLToPath(fileUrl), file.content);
    }

    const parsedData = await parseData({
      id: file.id,
      data,
      filePath: fileUrl.toString(),
    });

    // Store in content store
    if (entryType.getRenderFunction) {
      logger.info(`Rendering ${file.id}`);
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
      } catch (error: any) {
        logger.error(`Error rendering ${file.id}: ${error.message}`);
      }
      console.log(`🔍 STORING COLLECTION ENTRY:`, {
        id: file.id,
        filePath: file.targetPath,
        sourcePath: file.sourcePath
      });
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
        digest
      });
    }

    return { id: file.id, filePath: file.targetPath };
  }

  async function processDirectoryRecursively(path: string): Promise<any> {
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
      const filePath = data.path;
      switch (data.type) {
        // Return
        case "file":
          return await syncEntry(
            context,
            { url: data.download_url, editUrl: data.url },
            filePath,
            options,
            octokit,
            { signal },
          );
        default:
          throw new Error("Invalid type");
      }
    }

    // Directory listing with filtering - process sequentially
    const filteredEntries = data
      .filter(({ type, path }) => {
        // Always include directories for recursion
        if (type === "dir") return true;
        // Apply filtering logic to files
        if (type === "file") {
          return shouldIncludeFile(path, options).included;
        }
        return false;
      });
    
    const results = [];
    for (const { type, path, download_url, url } of filteredEntries) {
      switch (type) {
        // Recurse
        case "dir":
          results.push(await processDirectoryRecursively(path));
          break;
        // Return
        case "file":
          results.push(await syncEntry(
            context,
            { url: download_url, editUrl: url },
            path,
            options,
            octokit,
            { signal },
          ));
          break;
        default:
          throw new Error("Invalid type");
      }
    }
    return results;
  } // End of processDirectoryRecursively function
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