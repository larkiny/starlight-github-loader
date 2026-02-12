import { existsSync, promises as fs } from "node:fs";
import { join, dirname, basename, extname } from "node:path";
import { Octokit } from "octokit";
import { shouldIncludeFile } from "./github.paths.js";
import type { Logger } from "./github.logger.js";
import type { ImportOptions } from "./github.types.js";

/**
 * Default asset patterns for common image and media file types
 * @internal
 */
const DEFAULT_ASSET_PATTERNS = [
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".svg",
  ".webp",
  ".ico",
  ".bmp",
];

/**
 * Resolves the effective asset configuration for an import.
 *
 * If `assetsPath` and `assetsBaseUrl` are explicitly provided, uses them (existing behavior).
 * If omitted, derives co-located defaults from the matched include pattern's basePath:
 * - assetsPath: `{basePath}/assets/` (physical directory on disk)
 * - assetsBaseUrl: `./assets` (relative reference in markdown)
 *
 * @param options - Import options that may or may not have explicit asset config
 * @param filePath - The file being processed (used to find the matched include pattern)
 * @returns Resolved assetsPath and assetsBaseUrl, or null if assets should not be processed
 * @internal
 */
export function resolveAssetConfig(
  options: ImportOptions,
  filePath: string,
): { assetsPath: string; assetsBaseUrl: string } | null {
  // Explicit config takes precedence
  if (options.assetsPath && options.assetsBaseUrl) {
    return {
      assetsPath: options.assetsPath,
      assetsBaseUrl: options.assetsBaseUrl,
    };
  }

  // If only one is set, that's a misconfiguration — skip
  if (options.assetsPath || options.assetsBaseUrl) {
    return null;
  }

  // Derive co-located defaults from the matched include pattern's basePath
  const includeResult = shouldIncludeFile(filePath, options);
  if (includeResult.included && includeResult.matchedPattern) {
    const basePath = includeResult.matchedPattern.basePath;
    return {
      assetsPath: join(basePath, "assets"),
      assetsBaseUrl: "./assets",
    };
  }

  return null;
}

/**
 * Detects asset references in markdown content using regex patterns
 * @param content - The markdown content to parse
 * @param assetPatterns - File extensions to treat as assets
 * @returns Array of detected asset paths
 * @internal
 */
export function detectAssets(
  content: string,
  assetPatterns: string[] = DEFAULT_ASSET_PATTERNS,
): string[] {
  const assets: string[] = [];
  const patterns = assetPatterns.map((ext) => ext.toLowerCase());

  // Match markdown images: ![alt](path)
  const imageRegex = /!\[[^\]]*\]\(([^)]+)\)/g;
  let match;

  while ((match = imageRegex.exec(content)) !== null) {
    const assetPath = match[1];
    // Only include relative paths and assets matching our patterns
    if (
      assetPath.startsWith("./") ||
      assetPath.startsWith("../") ||
      !assetPath.includes("://")
    ) {
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
    if (
      assetPath.startsWith("./") ||
      assetPath.startsWith("../") ||
      !assetPath.includes("://")
    ) {
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
  octokit: Octokit,
  owner: string,
  repo: string,
  ref: string,
  assetPath: string,
  localPath: string,
  signal?: AbortSignal,
): Promise<void> {
  try {
    const { data } = await octokit.rest.repos.getContent({
      owner,
      repo,
      path: assetPath,
      ref,
      request: { signal },
    });

    if (Array.isArray(data)) {
      throw new Error(`Asset ${assetPath} is a directory, not a file`);
    }
    if (data.type !== "file" || !data.download_url) {
      throw new Error(
        `Asset ${assetPath} is not a valid file (type: ${data.type}, downloadUrl: ${data.download_url})`,
      );
    }

    const response = await fetch(data.download_url, { signal });
    if (!response.ok) {
      throw new Error(
        `Failed to download asset: ${response.status} ${response.statusText}`,
      );
    }

    const buffer = await response.arrayBuffer();
    const dir = dirname(localPath);

    if (!existsSync(dir)) {
      await fs.mkdir(dir, { recursive: true });
    }

    await fs.writeFile(localPath, new Uint8Array(buffer));
  } catch (error: unknown) {
    if (
      typeof error === "object" &&
      error !== null &&
      "status" in error &&
      (error as { status: number }).status === 404
    ) {
      throw new Error(`Asset not found: ${assetPath}`);
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
export function transformAssetReferences(
  content: string,
  assetMap: Map<string, string>,
): string {
  let transformedContent = content;

  for (const [originalPath, newPath] of assetMap) {
    // Transform markdown images
    const imageRegex = new RegExp(
      `(!)\\[([^\\]]*)\\]\\(\\s*${escapeRegExp(originalPath)}\\s*\\)`,
      "g",
    );
    transformedContent = transformedContent.replace(
      imageRegex,
      `$1[$2](${newPath})`,
    );

    // Transform HTML img tags
    const htmlRegex = new RegExp(
      `(<img[^>]+src\\s*=\\s*["'])${escapeRegExp(originalPath)}(["'][^>]*>)`,
      "gi",
    );
    transformedContent = transformedContent.replace(
      htmlRegex,
      `$1${newPath}$2`,
    );
  }

  return transformedContent;
}

/**
 * Escapes special regex characters in a string
 * @internal
 */
function escapeRegExp(string: string): string {
  return string.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Resolves an asset path relative to a base path
 * @internal
 */
export function resolveAssetPath(basePath: string, assetPath: string): string {
  if (assetPath.startsWith("./")) {
    return join(dirname(basePath), assetPath.slice(2));
  } else if (assetPath.startsWith("../")) {
    return join(dirname(basePath), assetPath);
  }
  return assetPath;
}

/**
 * Processes assets in markdown content by detecting, downloading, and transforming references
 * @param content - The markdown content to process
 * @param filePath - The file path of the markdown file being processed
 * @param options - Configuration options including asset settings
 * @param octokit - GitHub API client
 * @param logger - Logger instance for output
 * @param signal - Abort signal for cancellation
 * @returns Promise that resolves to transformed content
 * @internal
 */
export async function processAssets(
  content: string,
  filePath: string,
  options: ImportOptions,
  octokit: Octokit,
  logger: Logger,
  signal?: AbortSignal,
): Promise<{
  content: string;
  assetsDownloaded: number;
  assetsCached: number;
}> {
  const {
    owner,
    repo,
    ref = "main",
    assetsPath,
    assetsBaseUrl,
    assetPatterns,
  } = options;

  logger.verbose(`🖼️  Processing assets for ${filePath}`);
  logger.debug(`    assetsPath: ${assetsPath}`);
  logger.debug(`    assetsBaseUrl: ${assetsBaseUrl}`);

  if (!assetsPath || !assetsBaseUrl) {
    logger.verbose(
      `    ⏭️  Skipping asset processing - missing assetsPath or assetsBaseUrl`,
    );
    return { content, assetsDownloaded: 0, assetsCached: 0 };
  }

  // Detect assets in the content
  const detectedAssets = detectAssets(content, assetPatterns);
  logger.verbose(`    📸 Detected ${detectedAssets.length} assets`);
  if (detectedAssets.length > 0) {
    logger.debug(`    Assets: ${detectedAssets.join(", ")}`);
  }

  if (detectedAssets.length === 0) {
    return { content, assetsDownloaded: 0, assetsCached: 0 };
  }

  const assetMap = new Map<string, string>();
  let assetsDownloaded = 0;
  let assetsCached = 0;

  // Process each detected asset
  await Promise.all(
    detectedAssets.map(async (assetPath) => {
      logger.logAssetProcessing("Processing", assetPath);
      try {
        // Resolve the asset path relative to the current markdown file
        const resolvedAssetPath = resolveAssetPath(filePath, assetPath);
        logger.debug(`    🔗 Resolved path: ${resolvedAssetPath}`);

        // Generate unique filename to avoid conflicts
        const originalFilename = basename(assetPath);
        const ext = extname(originalFilename);
        const nameWithoutExt = basename(originalFilename, ext);
        const uniqueFilename = `${nameWithoutExt}-${Date.now()}${ext}`;
        const localPath = join(assetsPath, uniqueFilename);
        logger.debug(`    💾 Local path: ${localPath}`);

        // Check if asset already exists (simple cache check)
        if (existsSync(localPath)) {
          logger.logAssetProcessing("Cached", assetPath);
          assetsCached++;
        } else {
          // Download the asset
          logger.logAssetProcessing(
            "Downloading",
            assetPath,
            `from ${owner}/${repo}@${ref}:${resolvedAssetPath}`,
          );
          await downloadAsset(
            octokit,
            owner,
            repo,
            ref,
            resolvedAssetPath,
            localPath,
            signal,
          );
          logger.logAssetProcessing("Downloaded", assetPath);
          assetsDownloaded++;
        }

        // Generate URL for the transformed reference
        const assetUrl = `${assetsBaseUrl}/${uniqueFilename}`.replace(
          /\/+/g,
          "/",
        );
        logger.debug(`    🔄 Transform: ${assetPath} -> ${assetUrl}`);

        // Map the transformation
        assetMap.set(assetPath, assetUrl);
      } catch (error) {
        logger.warn(`    ❌ Failed to process asset ${assetPath}: ${error}`);
      }
    }),
  );

  logger.verbose(
    `    🗺️  Processed ${assetMap.size} assets: ${assetsDownloaded} downloaded, ${assetsCached} cached`,
  );

  // Transform the content with new asset references
  const transformedContent = transformAssetReferences(content, assetMap);
  return { content: transformedContent, assetsDownloaded, assetsCached };
}
