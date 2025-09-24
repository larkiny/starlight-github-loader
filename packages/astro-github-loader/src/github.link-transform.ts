import { slug } from 'github-slugger';
import path from 'node:path';
import type { LinkMapping, LinkTransformContext, MatchedPattern } from './github.types.js';
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

  // Handle relative paths
  if (linkPath.startsWith('./') || linkPath.includes('../')) {
    const currentDir = path.dirname(currentFilePath);
    const resolved = path.posix.normalize(path.posix.join(currentDir, linkPath));
    logger?.debug(`[normalizePath] RELATIVE PATH RESOLVED: "${linkPath}" -> "${resolved}" (currentDir: "${currentDir}")`);
    return resolved;
  }

  // Remove leading './'
  if (linkPath.startsWith('./')) {
    return linkPath.slice(2);
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
          const targetBase = pathToStarlightUrl(context.currentFile.linkContext.basePath, context.global.stripPrefixes);

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
 * Convert a target path to a Starlight-compatible URL
 */
function pathToStarlightUrl(targetPath: string, stripPrefixes: string[]): string {
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
 */
function transformLink(linkText: string, linkUrl: string, context: LinkContext): string {
  // Skip external links FIRST - no transformations should ever be applied to them
  if (isExternalLink(linkUrl)) {
    return `[${linkText}](${linkUrl})`;
  }

  let processedUrl = linkUrl;

  // Apply global path mappings (only to non-external links)
  if (context.global.linkMappings) {
    const globalMappings = context.global.linkMappings.filter(m => m.global);
    if (globalMappings.length > 0) {
      processedUrl = applyLinkMappings(processedUrl, globalMappings, context);
    }
  }

  const { path: linkPath, anchor } = extractAnchor(processedUrl);

  // Normalize the link path relative to current file
  const normalizedPath = normalizePath(linkPath, context.currentFile.sourcePath, context.global.logger);

  // Check if this links to an imported file
  const targetPath = context.global.sourceToTargetMap.get(normalizedPath);

  if (targetPath) {
    // This is an internal link to an imported file
    const starlightUrl = pathToStarlightUrl(targetPath, context.global.stripPrefixes);
    return `[${linkText}](${starlightUrl}${anchor})`;
  }

  // Apply non-global path mappings to unresolved links
  if (context.global.linkMappings) {
    const nonGlobalMappings = context.global.linkMappings.filter(m => !m.global);
    if (nonGlobalMappings.length > 0) {
      const mappedUrl = applyLinkMappings(processedUrl, nonGlobalMappings, context);
      if (mappedUrl !== processedUrl) {
        return `[${linkText}](${mappedUrl})`;
      }
    }
  }

  // Check custom handlers
  if (context.global.customHandlers) {
    for (const handler of context.global.customHandlers) {
      if (handler.test(processedUrl, context)) {
        const transformedUrl = handler.transform(processedUrl, context);
        return `[${linkText}](${transformedUrl})`;
      }
    }
  }

  // No transformation needed - return processed URL
  return `[${linkText}](${processedUrl})`;
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
 * Export types for use in configuration
 */
export type { LinkContext, GlobalLinkContext };