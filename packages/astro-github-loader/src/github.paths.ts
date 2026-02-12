import path, { join, basename } from "node:path";
import picomatch from "picomatch";
import type {
  ExtendedLoaderContext,
  ImportOptions,
  MatchedPattern,
} from "./github.types.js";

export interface ImportStats {
  processed: number;
  updated: number;
  unchanged: number;
  assetsDownloaded?: number;
  assetsCached?: number;
}

/**
 * Generates a unique identifier from a file path by removing the extension
 * @param filePath - The file path to generate ID from
 * @return {string} The generated identifier as a string with extension removed
 * @internal
 */
export function generateId(filePath: string): string {
  let id = filePath;

  // Remove file extension for ID generation
  const lastDotIndex = id.lastIndexOf(".");
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
export function applyRename(
  filePath: string,
  matchedPattern?: MatchedPattern | null,
  options?: ImportOptions,
): string {
  if (
    options?.includes &&
    matchedPattern &&
    matchedPattern.index < options.includes.length
  ) {
    const includePattern = options.includes[matchedPattern.index];

    if (includePattern.pathMappings) {
      // First check for exact file match (current behavior - backwards compatible)
      if (includePattern.pathMappings[filePath]) {
        const mappingValue = includePattern.pathMappings[filePath];
        return typeof mappingValue === "string"
          ? mappingValue
          : mappingValue.target;
      }

      // Then check for folder-to-folder mappings
      for (const [sourceFolder, mappingValue] of Object.entries(
        includePattern.pathMappings,
      )) {
        // Check if this is a folder mapping (ends with /) and file is within it
        if (sourceFolder.endsWith("/") && filePath.startsWith(sourceFolder)) {
          // Replace the source folder path with target folder path
          const targetFolder =
            typeof mappingValue === "string"
              ? mappingValue
              : mappingValue.target;
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
export function generatePath(
  filePath: string,
  matchedPattern?: MatchedPattern | null,
  options?: ImportOptions,
): string {
  if (matchedPattern) {
    // Extract the directory part from the pattern (before any glob wildcards)
    const pattern = matchedPattern.pattern;
    const beforeGlob = pattern.split(/[*?{]/)[0];

    // Remove the pattern prefix from the file path to get the relative path
    let relativePath = filePath;
    if (beforeGlob && filePath.startsWith(beforeGlob)) {
      relativePath = filePath.substring(beforeGlob.length);
      // Remove leading slash if present
      if (relativePath.startsWith("/")) {
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
    const hasPathMappings =
      options?.includes?.[matchedPattern.index]?.pathMappings &&
      Object.keys(options.includes[matchedPattern.index].pathMappings!).length >
        0;
    if (finalFilename !== basename(filePath) || hasPathMappings) {
      // Check if applyRename returned a full path (contains path separators) or just a filename
      if (finalFilename.includes("/") || finalFilename.includes("\\")) {
        // applyRename returned a full relative path - need to extract relative part
        // Remove the pattern prefix to get the relative path within the pattern context
        const beforeGlob = pattern.split(/[*?{]/)[0];
        if (beforeGlob && finalFilename.startsWith(beforeGlob)) {
          relativePath = finalFilename.substring(beforeGlob.length);
          // Remove leading slash if present
          if (relativePath.startsWith("/")) {
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
 * Checks if a file path should be included and returns the matching pattern
 * @param filePath - The file path to check (relative to the repository root)
 * @param options - Import options containing includes patterns
 * @returns Object with include status and matched pattern, or null if not included
 * @internal
 */
export function shouldIncludeFile(
  filePath: string,
  options: ImportOptions,
):
  | { included: true; matchedPattern: MatchedPattern | null }
  | { included: false; matchedPattern: null } {
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
          index: i,
        },
      };
    }
  }

  // No patterns matched
  return { included: false, matchedPattern: null };
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
  meta: ExtendedLoaderContext["meta"];
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
  meta: ExtendedLoaderContext["meta"];
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
