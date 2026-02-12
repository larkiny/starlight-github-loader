import { slug } from 'github-slugger';
import path from 'node:path';
import type { LinkMapping, LinkTransformContext, MatchedPattern, IncludePattern, PathMappingValue, EnhancedPathMapping } from './github.types.js';
import type { Logger } from './github.logger.js';

/**
 * Represents an imported file with its content and metadata
 */
export interface ImportedFile {
  /** Original source path in the repository */
  sourcePath: string;
  /** Target path where the file will be written */
  targetPath: string;
  /** File content */
  content: string;
  /** File ID for cross-referencing */
  id: string;
  /** Context information for link transformations */
  linkContext?: LinkTransformContext;
}

/**
 * Context for global link transformation
 */
interface GlobalLinkContext {
  /** Map from source paths to target paths for all imported files */
  sourceToTargetMap: Map<string, string>;
  /** Map from source paths to file IDs */
  sourceToIdMap: Map<string, string>;
  /** Base paths to strip from final URLs (e.g., "src/content/docs") */
  stripPrefixes: string[];
  /** Custom handlers for special link types */
  customHandlers?: LinkHandler[];
  /** Path mappings for common transformations */
  linkMappings?: LinkMapping[];
  /** Logger for debug output */
  logger?: Logger;
}

/**
 * Custom handler for specific link patterns
 */
export interface LinkHandler {
  /** Test if this handler should process the link */
  test: (link: string, context: LinkContext) => boolean;
  /** Transform the link */
  transform: (link: string, context: LinkContext) => string;
}

/**
 * Context for individual link transformation
 */
interface LinkContext {
  /** The file containing the link */
  currentFile: ImportedFile;
  /** The original link text */
  originalLink: string;
  /** Any anchor/fragment in the link */
  anchor: string;
  /** Global context */
  global: GlobalLinkContext;
}

/**
 * Extract anchor fragment from a link
 */
function extractAnchor(link: string): { path: string; anchor: string } {
  const anchorMatch = link.match(/#.*$/);
  const anchor = anchorMatch ? anchorMatch[0] : '';
  const path = link.replace(/#.*$/, '');
  return { path, anchor };
}

/**
 * Check if a link is external (should not be transformed)
 * External links are left completely unchanged by all transformations
 */
function isExternalLink(link: string): boolean {
  return (
    // Common protocols
    /^https?:\/\//.test(link) ||
    /^mailto:/.test(link) ||
    /^tel:/.test(link) ||
    /^ftp:/.test(link) ||
    /^ftps:\/\//.test(link) ||

    // Any protocol with ://
    link.includes('://') ||

    // Anchor-only links (same page)
    link.startsWith('#') ||

    // Data URLs
    /^data:/.test(link) ||

    // File protocol
    /^file:\/\//.test(link)
  );
}

/**
 * Normalize path separators and resolve relative paths
 */
function normalizePath(linkPath: string, currentFilePath: string, logger?: Logger): string {
  logger?.debug(`[normalizePath] BEFORE: linkPath="${linkPath}", currentFilePath="${currentFilePath}"`);

  // Handle relative paths (including simple relative paths without ./ prefix)
  // A link is relative if it doesn't start with / or contain a protocol
  const isAbsoluteOrExternal = linkPath.startsWith('/') || linkPath.includes('://') || linkPath.startsWith('#');

  if (!isAbsoluteOrExternal) {
    const currentDir = path.dirname(currentFilePath);
    const resolved = path.posix.normalize(path.posix.join(currentDir, linkPath));
    logger?.debug(`[normalizePath] RELATIVE PATH RESOLVED: "${linkPath}" -> "${resolved}" (currentDir: "${currentDir}")`);
    return resolved;
  }

  logger?.debug(`[normalizePath] AFTER: "${linkPath}" (no changes)`);
  return linkPath;
}

/**
 * Apply link mappings to transform a URL
 */
function applyLinkMappings(
  linkUrl: string,
  linkMappings: LinkMapping[],
  context: LinkContext
): string {
  const { path: linkPath, anchor } = extractAnchor(linkUrl);
  let transformedPath = linkPath;

  for (const mapping of linkMappings) {
    // Check if contextFilter allows this mapping to be applied
    if (mapping.contextFilter && context.currentFile.linkContext) {
      if (!mapping.contextFilter(context.currentFile.linkContext)) {
        continue; // Skip this mapping
      }
    }

    // Handle relative links automatically if enabled
    if (mapping.relativeLinks && context.currentFile.linkContext) {
      // Check if this is a relative link (doesn't start with /, http, etc.)
      if (!linkPath.startsWith('/') && !isExternalLink(linkPath)) {
        // Check if the link points to a known directory structure
        const knownPaths = ['modules/', 'classes/', 'interfaces/', 'enums/'];
        const isKnownPath = knownPaths.some(p => linkPath.startsWith(p));

        if (isKnownPath) {
          // Strip .md extension from the link path
          const cleanLinkPath = linkPath.replace(/\.md$/, '');

          // Convert relative path to absolute path using the target base
          const targetBase = generateSiteUrl(context.currentFile.linkContext.basePath, context.global.stripPrefixes);

          // Construct final URL with proper Starlight formatting
          let finalUrl = targetBase.replace(/\/$/, '') + '/' + cleanLinkPath;

          // Add trailing slash if it doesn't end with one and isn't empty
          if (finalUrl && !finalUrl.endsWith('/')) {
            finalUrl += '/';
          }

          transformedPath = finalUrl;
          return transformedPath + anchor;
        }
      }
    }

    let matched = false;
    let replacement = '';

    if (typeof mapping.pattern === 'string') {
      // String pattern - exact match or contains
      if (transformedPath.includes(mapping.pattern)) {
        matched = true;
        if (typeof mapping.replacement === 'string') {
          replacement = transformedPath.replace(mapping.pattern, mapping.replacement);
        } else {
          replacement = mapping.replacement(transformedPath, anchor, context);
        }
      }
    } else {
      // RegExp pattern
      const match = transformedPath.match(mapping.pattern);
      if (match) {
        matched = true;
        if (typeof mapping.replacement === 'string') {
          replacement = transformedPath.replace(mapping.pattern, mapping.replacement);
        } else {
          replacement = mapping.replacement(transformedPath, anchor, context);
        }
      }
    }

    if (matched) {
      // Apply the transformation and continue with next mapping
      transformedPath = replacement;
      // Note: We continue applying other mappings to allow chaining
    }
  }

  return transformedPath + anchor;
}

/**
 * Convert a target path to a site-compatible URL
 */
function generateSiteUrl(targetPath: string, stripPrefixes: string[]): string {
  let url = targetPath;

  // Strip configured prefixes
  for (const prefix of stripPrefixes) {
    if (url.startsWith(prefix)) {
      url = url.slice(prefix.length);
      break;
    }
  }

  // Remove leading slash if present
  url = url.replace(/^\//, '');

  // Remove file extension
  url = url.replace(/\.(md|mdx)$/i, '');

  // Handle index files - they should resolve to parent directory
  if (url.endsWith('/index')) {
    url = url.replace('/index', '');
  } else if (url === 'index') {
    url = '';
  }

  // Split path into segments and slugify each
  const segments = url.split('/').map(segment => segment ? slug(segment) : '');

  // Reconstruct URL
  url = segments.filter(s => s).join('/');

  // Ensure leading slash
  if (url && !url.startsWith('/')) {
    url = '/' + url;
  }

  // Add trailing slash for non-empty paths
  if (url && !url.endsWith('/')) {
    url = url + '/';
  }

  return url || '/';
}

/**
 * Transform a single markdown link
 *
 * Processing order:
 * 1. Skip external links (no transformation)
 * 2. Normalize path relative to current file
 * 3. Apply global path mappings to normalized path
 * 4. Check if link targets imported file in sourceToTargetMap
 * 5. Apply non-global path mappings if unresolved
 * 6. Check custom handlers
 */
function transformLink(linkText: string, linkUrl: string, context: LinkContext): string {
  // Skip external links FIRST - no transformations should ever be applied to them
  if (isExternalLink(linkUrl)) {
    return `[${linkText}](${linkUrl})`;
  }

  const { path: linkPath, anchor } = extractAnchor(linkUrl);

  // Normalize the link path relative to current file FIRST
  const normalizedPath = normalizePath(linkPath, context.currentFile.sourcePath, context.global.logger);

  // Apply global path mappings to the normalized path
  let processedNormalizedPath = normalizedPath;
  if (context.global.linkMappings) {
    const globalMappings = context.global.linkMappings.filter(m => m.global);
    if (globalMappings.length > 0) {
      processedNormalizedPath = applyLinkMappings(normalizedPath + anchor, globalMappings, context);
      // Extract path again after global mappings
      const { path: newPath } = extractAnchor(processedNormalizedPath);
      processedNormalizedPath = newPath;
    }
  }

  // Check if this links to an imported file
  let targetPath = context.global.sourceToTargetMap.get(normalizedPath);

  // If not found and path ends with /, try looking for index.md
  if (!targetPath && normalizedPath.endsWith('/')) {
    targetPath = context.global.sourceToTargetMap.get(normalizedPath + 'index.md');
  }

  if (targetPath) {
    // This is an internal link to an imported file
    const siteUrl = generateSiteUrl(targetPath, context.global.stripPrefixes);
    return `[${linkText}](${siteUrl}${anchor})`;
  }

  // Apply non-global path mappings to unresolved links
  if (context.global.linkMappings) {
    const nonGlobalMappings = context.global.linkMappings.filter(m => !m.global);
    if (nonGlobalMappings.length > 0) {
      const mappedUrl = applyLinkMappings(processedNormalizedPath + anchor, nonGlobalMappings, context);
      if (mappedUrl !== (processedNormalizedPath + anchor)) {
        return `[${linkText}](${mappedUrl})`;
      }
    }
  }

  // Check custom handlers
  if (context.global.customHandlers) {
    for (const handler of context.global.customHandlers) {
      const currentUrl = processedNormalizedPath + anchor;
      if (handler.test(currentUrl, context)) {
        const transformedUrl = handler.transform(currentUrl, context);
        return `[${linkText}](${transformedUrl})`;
      }
    }
  }

  // No transformation matched - strip .md extension from unresolved internal links
  // This handles links to files that weren't imported but should still use Starlight routing
  const cleanPath = processedNormalizedPath.replace(/\.md$/i, '');
  return `[${linkText}](${cleanPath + anchor})`;
}

/**
 * Global link transformation function
 * Processes all imported files and resolves internal links
 */
export function globalLinkTransform(
  importedFiles: ImportedFile[],
  options: {
    stripPrefixes: string[];
    customHandlers?: LinkHandler[];
    linkMappings?: LinkMapping[];
    logger?: Logger;
  }
): ImportedFile[] {
  // Build global context
  const sourceToTargetMap = new Map<string, string>();
  const sourceToIdMap = new Map<string, string>();

  for (const file of importedFiles) {
    sourceToTargetMap.set(file.sourcePath, file.targetPath);
    sourceToIdMap.set(file.sourcePath, file.id);
  }

  const globalContext: GlobalLinkContext = {
    sourceToTargetMap,
    sourceToIdMap,
    stripPrefixes: options.stripPrefixes,
    customHandlers: options.customHandlers,
    linkMappings: options.linkMappings,
    logger: options.logger,
  };

  // Transform links in all files
  const markdownLinkRegex = /\[([^\]]*)\]\(([^)]+)\)/g;

  return importedFiles.map(file => ({
    ...file,
    content: file.content.replace(markdownLinkRegex, (match, linkText, linkUrl) => {
      const linkContext: LinkContext = {
        currentFile: file,
        originalLink: linkUrl,
        anchor: extractAnchor(linkUrl).anchor,
        global: globalContext,
      };

      return transformLink(linkText, linkUrl, linkContext);
    }),
  }));
}


/**
 * Infer cross-section path from basePath
 * @param basePath - The base path from include pattern (e.g., 'src/content/docs/reference/api')
 * @returns Inferred cross-section path (e.g., '/reference/api')
 */
function inferCrossSectionPath(basePath: string): string {
  return basePath
    .replace(/^src\/content\/docs/, '')
    .replace(/\/$/, '') || '/';
}

/**
 * Generate link mappings automatically from pathMappings in include patterns
 * @param includes - Array of include patterns with pathMappings
 * @param stripPrefixes - Prefixes to strip when generating URLs
 * @returns Array of generated link mappings
 */
export function generateAutoLinkMappings(
  includes: IncludePattern[],
  stripPrefixes: string[] = []
): LinkMapping[] {
  const linkMappings: LinkMapping[] = [];

  for (const includePattern of includes) {
    if (!includePattern.pathMappings) continue;

    const inferredCrossSection = inferCrossSectionPath(includePattern.basePath);

    for (const [sourcePath, mappingValue] of Object.entries(includePattern.pathMappings)) {
      // Handle both string and enhanced object formats
      const targetPath = typeof mappingValue === 'string' ? mappingValue : mappingValue.target;
      const crossSectionPath = typeof mappingValue === 'object' && mappingValue.crossSectionPath
        ? mappingValue.crossSectionPath
        : inferredCrossSection;

      if (sourcePath.endsWith('/')) {
        // Folder mapping - use regex with capture group
        const sourcePattern = sourcePath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

        linkMappings.push({
          pattern: new RegExp(`^${sourcePattern}(.+)$`),
          replacement: (transformedPath: string, anchor: string, context: any) => {
            const relativePath = transformedPath.replace(new RegExp(`^${sourcePattern}`), '');
            let finalPath: string;
            if (crossSectionPath && crossSectionPath !== '/') {
              finalPath = targetPath === ''
                ? `${crossSectionPath}/${relativePath}`
                : `${crossSectionPath}/${targetPath}${relativePath}`;
            } else {
              finalPath = targetPath === '' ? relativePath : `${targetPath}${relativePath}`;
            }
            return generateSiteUrl(finalPath, stripPrefixes);
          },
          global: true,
        });
      } else {
        // File mapping - exact string match
        const sourcePattern = sourcePath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

        linkMappings.push({
          pattern: new RegExp(`^${sourcePattern}$`),
          replacement: (transformedPath: string, anchor: string, context: any) => {
            const finalPath = crossSectionPath && crossSectionPath !== '/'
              ? `${crossSectionPath}/${targetPath}`
              : targetPath;
            return generateSiteUrl(finalPath, stripPrefixes);
          },
          global: true,
        });
      }
    }
  }

  return linkMappings;
}

/**
 * Export types for use in configuration
 */
export type { LinkContext, GlobalLinkContext };