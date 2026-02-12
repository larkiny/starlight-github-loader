import { existsSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";
import {
  globalLinkTransform,
  generateAutoLinkMappings,
  type ImportedFile,
} from "./github.link-transform.js";
import { Octokit } from "octokit";
import { INVALID_STRING_ERROR } from "./github.constants.js";

import type {
  CollectionEntryOptions,
  ExtendedLoaderContext,
  ImportOptions,
  TransformFunction,
} from "./github.types.js";

// Decomposed modules
import {
  type ImportStats,
  generateId,
  generatePath,
  shouldIncludeFile,
  getHeaders,
} from "./github.paths.js";
import { resolveAssetConfig, processAssets } from "./github.assets.js";
import { storeProcessedFile } from "./github.storage.js";

// Re-export items that used to live in this module so existing internal
// consumers can migrate gradually (cleanup.ts, spec files, etc.).
export {
  type ImportStats,
  generateId,
  generatePath,
  shouldIncludeFile,
  applyRename,
  getHeaders,
  syncHeaders,
} from "./github.paths.js";
export { syncFile } from "./github.storage.js";
export {
  resolveAssetConfig,
  detectAssets,
  downloadAsset,
  transformAssetReferences,
} from "./github.assets.js";

/**
 * Validates that a basePath is relative and does not escape the project root.
 * @internal
 */
function validateBasePath(basePath: string, projectRoot: string): void {
  if (path.isAbsolute(basePath)) {
    throw new Error(`basePath must be relative, got absolute path: ${basePath}`);
  }
  const resolved = path.resolve(projectRoot, basePath);
  const normalized = path.normalize(resolved);
  if (!normalized.startsWith(path.normalize(projectRoot))) {
    throw new Error(
      `basePath "${basePath}" resolves outside project root`,
    );
  }
}

const GITHUB_IDENTIFIER_RE = /^[a-zA-Z0-9._-]+$/;
const GITHUB_REF_RE = /^[a-zA-Z0-9._\-/]+$/;

/**
 * Validates a GitHub owner or repo identifier.
 * @internal
 */
function validateGitHubIdentifier(value: string, name: string): void {
  if (!value || value.length > 100) {
    throw new Error(`Invalid ${name}: must be 1-100 characters`);
  }
  if (!GITHUB_IDENTIFIER_RE.test(value)) {
    throw new Error(
      `Invalid ${name}: "${value}" contains disallowed characters`,
    );
  }
}

/**
 * Validates a GitHub ref (branch/tag name). More permissive than identifiers — allows `/`.
 * @internal
 */
function validateGitHubRef(value: string): void {
  if (!value || value.length > 256) {
    throw new Error(`Invalid ref: must be 1-256 characters`);
  }
  if (!GITHUB_REF_RE.test(value)) {
    throw new Error(
      `Invalid ref: "${value}" contains disallowed characters`,
    );
  }
}

/**
 * Collects file data by downloading content and applying transforms.
 * Extracted from the nested closure inside toCollectionEntry for clarity.
 * @internal
 */
async function collectFileData(
  { url, editUrl: _editUrl }: { url: string | null; editUrl: string },
  filePath: string,
  options: ImportOptions,
  context: ExtendedLoaderContext,
  octokit: Octokit,
  signal?: AbortSignal,
): Promise<ImportedFile | null> {
  const logger = context.logger;

  if (url === null || typeof url !== "string") {
    return null;
  }

  const urlObj = new URL(url);

  // Determine if file needs renaming and generate appropriate ID
  const includeCheck = shouldIncludeFile(filePath, options);
  const matchedPattern = includeCheck.included
    ? includeCheck.matchedPattern
    : null;

  // Check if this file has a path mapping
  const hasPathMapping =
    matchedPattern &&
    options?.includes &&
    matchedPattern.index < options.includes.length &&
    options.includes[matchedPattern.index].pathMappings &&
    options.includes[matchedPattern.index].pathMappings![filePath];

  // Generate ID based on appropriate path
  const id = hasPathMapping
    ? generateId(generatePath(filePath, matchedPattern, options)) // Use path-mapped path for ID
    : generateId(filePath); // Use original path for ID

  const finalPath = generatePath(filePath, matchedPattern, options);
  let contents: string;

  logger.logFileProcessing("Fetching", filePath, `from ${urlObj.toString()}`);

  // Download file content
  const init = {
    signal,
    headers: getHeaders({ init: {}, meta: context.meta, id }),
  };
  let res: Response | null = null;

  // Fetch with retries (simplified version of syncEntry logic)
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      res = await fetch(urlObj, init);
      if (res.ok) break;
    } catch (error) {
      if (attempt === 2) throw error;
      await new Promise((resolve) =>
        setTimeout(resolve, 1000 * (attempt + 1)),
      );
    }
  }

  if (!res) {
    throw new Error(`No response received for ${urlObj.toString()}`);
  }

  if (res.status === 304) {
    // File not modified, read existing content from disk if it exists
    const includeResult = shouldIncludeFile(filePath, options);
    const relativePath = generatePath(
      filePath,
      includeResult.included ? includeResult.matchedPattern : null,
      options,
    );
    const fileUrl = pathToFileURL(relativePath);

    if (existsSync(fileURLToPath(fileUrl))) {
      logger.logFileProcessing("Using cached", filePath, "304 not modified");
      const { promises: fs } = await import("node:fs");
      contents = await fs.readFile(fileURLToPath(fileUrl), "utf-8");
    } else {
      // File is missing locally, re-fetch without cache headers
      logger.logFileProcessing(
        "Re-fetching",
        filePath,
        "missing locally despite 304",
      );
      const freshInit = { ...init };
      freshInit.headers = new Headers(init.headers);
      freshInit.headers.delete("If-None-Match");
      freshInit.headers.delete("If-Modified-Since");

      res = await fetch(urlObj, freshInit);
      if (!res.ok) {
        throw new Error(
          `Failed to fetch file content from ${urlObj.toString()}: ${res.status} ${res.statusText || "Unknown error"}`,
        );
      }
      contents = await res.text();
    }
  } else if (!res.ok) {
    throw new Error(
      `Failed to fetch file content from ${urlObj.toString()}: ${res.status} ${res.statusText || "Unknown error"}`,
    );
  } else {
    contents = await res.text();
  }

  // Process assets FIRST if configuration is provided (or co-located defaults apply)
  const resolvedAssetConfig = resolveAssetConfig(options, filePath);
  if (resolvedAssetConfig) {
    try {
      const optionsWithAssets = { ...options, ...resolvedAssetConfig };
      const assetResult = await processAssets(
        contents,
        filePath,
        optionsWithAssets,
        octokit,
        logger,
        signal,
      );
      contents = assetResult.content;
    } catch (error) {
      logger.warn(
        `Asset processing failed for ${id}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  // Apply content transforms
  const includeResult = shouldIncludeFile(filePath, options);
  const transformsToApply: TransformFunction[] = [];

  // Add global transforms first
  if (options.transforms && options.transforms.length > 0) {
    transformsToApply.push(...options.transforms);
  }

  // Add pattern-specific transforms
  if (
    includeResult.included &&
    includeResult.matchedPattern &&
    options.includes
  ) {
    const matchedInclude =
      options.includes[includeResult.matchedPattern.index];
    if (matchedInclude.transforms && matchedInclude.transforms.length > 0) {
      transformsToApply.push(...matchedInclude.transforms);
    }
  }

  if (transformsToApply.length > 0) {
    const transformContext = {
      id,
      path: filePath,
      options,
      matchedPattern:
        includeResult.included && includeResult.matchedPattern
          ? includeResult.matchedPattern
          : undefined,
    };

    for (const transform of transformsToApply) {
      try {
        contents = transform(contents, transformContext);
      } catch (error) {
        context.logger?.warn(`Transform failed for ${id}: ${error}`);
      }
    }
  }

  // Build link context for this file
  const linkContext =
    includeResult.included && includeResult.matchedPattern
      ? {
          sourcePath: filePath,
          targetPath: finalPath,
          basePath: includeResult.matchedPattern.basePath,
          pathMappings:
            options.includes?.[includeResult.matchedPattern.index]
              ?.pathMappings,
          matchedPattern: includeResult.matchedPattern,
        }
      : undefined;

  // Use the finalPath we already computed
  return {
    sourcePath: filePath,
    targetPath: finalPath,
    content: contents,
    id,
    linkContext,
  };
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
  force = false,
  clear = false,
}: CollectionEntryOptions): Promise<ImportStats> {
  const { owner, repo, ref = "main" } = options || {};
  if (typeof repo !== "string" || typeof owner !== "string")
    throw new TypeError(INVALID_STRING_ERROR);

  // Validate identifiers to prevent injection into API calls / URLs
  validateGitHubIdentifier(owner, "owner");
  validateGitHubIdentifier(repo, "repo");
  if (ref !== "main") validateGitHubRef(ref);

  // Validate include pattern basePaths don't escape the project
  const projectRoot = process.cwd();
  if (options.includes) {
    for (const inc of options.includes) {
      validateBasePath(inc.basePath, projectRoot);
    }
  }
  if (options.assetsPath) {
    validateBasePath(options.assetsPath, projectRoot);
  }

  const logger = context.logger;

  /**
   * OPTIMIZATION: Use Git Trees API for efficient file discovery
   *
   * This replaces the previous recursive directory traversal approach which made
   * N API calls (one per directory) with a single API call to fetch the entire
   * repository tree structure.
   *
   * Benefits:
   * - Reduces API calls by 50-70% for typical repositories
   * - Single getTree() call retrieves all file paths at once
   * - Reduces rate limit pressure significantly
   * - Faster for large repositories with deep directory structures
   *
   * Previous approach:
   *   - Called repos.getContent() recursively for each directory
   *   - Example: 10 directories = 10 API calls
   *
   * New approach:
   *   - 1 call to repos.listCommits() to get commit SHA
   *   - 1 call to git.getTree() to get entire file tree
   *   - Total: 2 API calls regardless of repository structure
   */
  logger.debug(`Using Git Trees API for efficient file discovery`);

  // Get the commit SHA for the ref
  const { data: commits } = await octokit.rest.repos.listCommits({
    owner,
    repo,
    sha: ref,
    per_page: 1,
    request: { signal },
  });

  if (commits.length === 0) {
    throw new Error(`No commits found for ref ${ref}`);
  }

  const commitSha = commits[0].sha;
  const treeSha = commits[0].commit.tree.sha;

  logger.debug(`Fetching repository tree for commit ${commitSha.slice(0, 7)}`);

  // Get the entire repository tree in a single API call
  const { data: treeData } = await octokit.rest.git.getTree({
    owner,
    repo,
    tree_sha: treeSha,
    recursive: "true",
    request: { signal },
  });

  logger.debug(`Retrieved ${treeData.tree.length} items from repository tree`);

  // Filter tree to only include files (not dirs/submodules) that match our patterns
  const fileEntries = treeData.tree.filter(
    (item: { type?: string; path?: string }) => {
      if (item.type !== "blob") return false; // Only process files (blobs)
      const includeCheck = shouldIncludeFile(item.path!, options);
      return includeCheck.included;
    },
  );

  logger.info(
    `Found ${fileEntries.length} files matching include patterns (filtered from ${treeData.tree.length} total items)`,
  );

  // Collect all files first (with content transforms applied)
  const allFiles: ImportedFile[] = [];

  for (const treeItem of fileEntries) {
    const filePath = treeItem.path;
    // Construct the download URL (raw.githubusercontent.com format)
    const encodedPath = filePath.split("/").map(encodeURIComponent).join("/");
    const downloadUrl = `https://raw.githubusercontent.com/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/${commitSha}/${encodedPath}`;
    const editUrl = treeItem.url || ""; // Git blob URL (use empty string as fallback)

    const fileData = await collectFileData(
      { url: downloadUrl, editUrl },
      filePath,
      options,
      context,
      octokit,
      signal,
    );

    if (fileData) {
      allFiles.push(fileData);
    }
  }

  // Track statistics
  const stats: ImportStats = {
    processed: 0,
    updated: 0,
    unchanged: 0,
    assetsDownloaded: 0,
    assetsCached: 0,
  };

  // Apply link transformation if configured
  let processedFiles = allFiles;
  if (options.linkTransform) {
    logger.verbose(`Applying link transformation to ${allFiles.length} files`);

    // Generate automatic link mappings from pathMappings
    const autoGeneratedMappings = options.includes
      ? generateAutoLinkMappings(
          options.includes,
          options.linkTransform.stripPrefixes,
        )
      : [];

    // Combine auto-generated mappings with user-defined mappings
    const allLinkMappings = [
      ...autoGeneratedMappings,
      ...(options.linkTransform.linkMappings || []),
    ];

    logger.debug(
      `Generated ${autoGeneratedMappings.length} automatic link mappings from pathMappings`,
    );

    processedFiles = globalLinkTransform(allFiles, {
      stripPrefixes: options.linkTransform.stripPrefixes,
      customHandlers: options.linkTransform.customHandlers,
      linkMappings: allLinkMappings,
      logger,
    });
  }

  // Now store all processed files
  stats.processed = processedFiles.length;
  for (const file of processedFiles) {
    logger.logFileProcessing("Storing", file.sourcePath);
    const result = await storeProcessedFile(file, context, clear);
    if (result) {
      stats.updated++;
    } else {
      stats.unchanged++;
    }
  }

  return stats;
}
