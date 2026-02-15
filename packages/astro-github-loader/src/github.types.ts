import type {
  Loader as AstroLoader,
  LoaderContext as AstroLoaderContext,
} from "astro/loaders";
import type { ContentEntryType } from "astro";
import type { MarkdownHeading } from "@astrojs/markdown-remark";
import { Octokit } from "octokit";

// Import link transformation types from the dedicated module
import type { LinkHandler } from "./github.link-transform.js";
import type { LogLevel, Logger } from "./github.logger.js";

/**
 * Context information for link transformations
 */
export interface LinkTransformContext {
  /** Original source path in the repository */
  sourcePath: string;
  /** Target path where the file will be written */
  targetPath: string;
  /** Base path for this include pattern */
  basePath: string;
  /** Path mappings used for this file */
  pathMappings?: Record<string, PathMappingValue>;
  /** The include pattern that matched this file */
  matchedPattern?: MatchedPattern;
}

/**
 * Link mapping for transforming URLs in markdown links
 */
export interface LinkMapping {
  /** Pattern to match (string or regex) */
  pattern: string | RegExp;
  /** Replacement string or function */
  replacement:
    | string
    | ((
        match: string,
        anchor: string,
        context: LinkTransformContext,
      ) => string);
  /** Apply to all links, not just unresolved internal links (default: false) */
  global?: boolean;
  /** Function to determine if this mapping should apply to the current file context */
  contextFilter?: (context: LinkTransformContext) => boolean;
  /** Automatically handle relative links by prefixing with target base path (default: false) */
  relativeLinks?: boolean;
}

/**
 * Configuration for import link transformation
 */
export interface ImportLinkTransformOptions {
  /** Base paths to strip from final URLs (e.g., ["src/content/docs"]) */
  stripPrefixes: string[];
  /** Custom handlers for special link types */
  customHandlers?: LinkHandler[];
  /** Link mappings to transform URLs in markdown links */
  linkMappings?: LinkMapping[];
}

/**
 * Information about which include pattern matched a file
 */
export interface MatchedPattern {
  /** The glob pattern that matched */
  pattern: string;
  /** The base path for this pattern */
  basePath: string;
  /** Index of the pattern in the includes array */
  index: number;
}

/**
 * Context object passed to transform functions
 */
export interface TransformContext {
  /** Generated ID for the content */
  id: string;
  /** File path within the repository */
  path: string;
  /** Full configuration options */
  options: ImportOptions;
  /** Information about which include pattern matched (if any) */
  matchedPattern?: MatchedPattern;
}

/**
 * Function type for content transformations
 * @param content - The markdown content to transform
 * @param context - Context information about the file being processed
 * @returns The transformed content
 */
export type TransformFunction = (
  content: string,
  context: TransformContext,
) => string;

/**
 * Enhanced path mapping configuration that supports cross-section linking
 */
export interface EnhancedPathMapping {
  /** Target path where the file should be imported */
  target: string;
  /**
   * Cross-section path for generating links to this content from other sections.
   * If not specified, will be inferred from the basePath.
   * Example: '/reference/algokit-utils-ts/api'
   */
  crossSectionPath?: string;
}

/**
 * Path mapping value - can be a simple string or an enhanced configuration object
 */
export type PathMappingValue = string | EnhancedPathMapping;

/**
 * Configuration for a single include pattern
 */
export interface IncludePattern {
  /** Glob pattern to match files (relative to repository root) */
  pattern: string;
  /** Local base path where matching files should be imported */
  basePath: string;
  /** Transforms to apply only to files matching this pattern */
  transforms?: TransformFunction[];
  /**
   * Map of source paths to target paths for controlling where files are imported.
   *
   * Supports multiple mapping formats:
   *
   * **Simple string format:**
   * - **File mapping**: `'docs/README.md': 'docs/overview.md'` - moves a specific file to a new path
   * - **Folder mapping**: `'docs/capabilities/': 'docs/'` - moves all files from source folder to target folder
   *
   * **Enhanced object format with cross-section linking:**
   * - `'docs/api/': { target: 'api/', crossSectionPath: '/reference/api' }`
   *
   * **Important**: Folder mappings require trailing slashes to distinguish from file mappings.
   * - ✅ `'docs/capabilities/': 'docs/'` (folder mapping - moves all files)
   * - ❌ `'docs/capabilities': 'docs/'` (treated as exact file match)
   *
   * When using enhanced format, link mappings will be automatically generated for cross-section references.
   * If `crossSectionPath` is not specified, it will be inferred from the basePath.
   */
  pathMappings?: Record<string, PathMappingValue>;
}

export type GithubLoaderOptions = {
  octokit: Octokit;
  configs: Array<ImportOptions>;
  clear?: boolean;
  gitIgnore?: string;
  basePath?: string;
  fetchOptions?: FetchOptions;
  /**
   * When true, only checks for repository changes without importing.
   * Returns a report of which repositories have new commits.
   * @default false
   */
  dryRun?: boolean;
  /**
   * Global logging level for all import operations
   * Overrides individual ImportOptions logLevel settings
   * @default 'default'
   */
  logLevel?: LogLevel;
  /**
   * When true, forces a full import even if no repository changes are detected.
   * When false (default), skips processing if repository hasn't changed.
   * @default false
   */
  force?: boolean;
};

/**
 * Represents the configuration options for a collection entry operation.
 * @internal
 */
export type CollectionEntryOptions = {
  /**
   * Represents the context object for a loader, providing metadata
   * and utilities for the current loading process.
   *
   * The LoaderContext may contain properties and methods that offer
   * control or inspection over the loading behavior.
   */
  context: ExtendedLoaderContext;
  /**
   * An instance of the Octokit library, which provides a way to interact
   * with GitHub's REST API. This variable allows you to access and perform
   * operations such as creating repositories, managing issues, handling
   * pull requests, fetching user data, and more.
   *
   * The Octokit instance must be configured*/
  octokit: Octokit;
  /**
   * Represents the configuration options for initializing or customizing the root application behavior.
   * The option object may include various properties that control specific features or behavior of the application.
   */
  options: ImportOptions;
  /**
   * An optional AbortSignal instance that enables observing and controlling the
   * abort state of an operation. It can be used to signal cancellation requests
   * to an ongoing task, such as a fetch request or custom asynchronous operations.
   *
   * If provided, the corresponding task can listen to the `abort` event of the signal
   * to handle early termination or cleanup logic appropriately.
   *
   * If the signal is already aborted at the time it is assigned or checked, the task
   * may respond to the abort condition immediately.
   */
  signal?: AbortSignal;
  /**
   * Represents the optional configuration settings for a fetch operation.
   * This variable allows customization of the behavior of the fetch process.
   */
  fetchOptions?: FetchOptions;
  /**
   * When true, forces a full import even if no repository changes are detected.
   * When false (default), skips processing if repository hasn't changed.
   * @default false
   */
  force?: boolean;
  /**
   * When true, deletes existing store entries before setting new ones.
   * This enables atomic replacement of entries without breaking the content collection.
   * Passed from GithubLoaderOptions.clear
   * @internal
   */
  clear?: boolean;
};

/**
 * Interface representing rendered content, including HTML and associated metadata.
 * @internal
 */
export interface RenderedContent {
  /** Rendered HTML string. If present then `render(entry)` will return a component that renders this HTML. */
  html: string;
  metadata?: {
    /** Any images that are present in this entry. Relative to the {@link DataEntry} filePath. */
    imagePaths?: Array<string>;
    /** Any headings that are present in this file. */
    headings?: MarkdownHeading[];
    /** Raw frontmatter, parsed parsed from the file. This may include data from remark plugins. */
    frontmatter?: Record<string, any>;
    /** Any other metadata that is present in this file. */
    [key: string]: unknown;
  };
}

/**
 * Represents a version of a library variant to display in the devportal's version picker.
 * Versions are manually curated in the import config — no auto-discovery.
 */
export interface VersionConfig {
  /** URL segment for this version (e.g., "latest", "v8.0.0") */
  slug: string;
  /** Display name for this version (e.g., "Latest", "v8.0.0") */
  label: string;
}

/**
 * Represents configuration options for importing content from GitHub repositories.
 */
export type ImportOptions = {
  /**
   * Display name for this configuration (used in logging)
   */
  name?: string;
  /**
   * Custom state key for import tracking. When provided, overrides the default
   * `owner/repo@ref` key used to track import state. This allows the same repo
   * to be imported independently to multiple locations.
   */
  stateKey?: string;
  /**
   * Repository owner
   */
  owner: string;
  /**
   * Repository Name
   */
  repo: string;
  /**
   * A specific reference in Github
   */
  ref?: string;
  /**
   * Local directory path where downloaded assets should be stored
   */
  assetsPath?: string;
  /**
   * Base URL prefix for asset references in transformed markdown content
   */
  assetsBaseUrl?: string;
  /**
   * Array of file extensions to treat as assets (e.g., ['.png', '.jpg', '.svg'])
   * Defaults to common image formats if not specified
   */
  assetPatterns?: string[];
  /**
   * Whether this configuration is enabled for processing
   */
  enabled?: boolean;
  /**
   * Whether to clear target directories before importing content
   */
  clear?: boolean;
  /**
   * Array of transform functions to apply to all imported content
   */
  transforms?: TransformFunction[];
  /**
   * Array of include patterns defining which files to import and where to put them
   * If not specified, all files will be imported (backward compatibility mode)
   */
  includes?: IncludePattern[];
  /**
   * Link transformation options
   * Applied after all content transforms and across all include patterns
   */
  linkTransform?: ImportLinkTransformOptions;
  /**
   * Logging level for this import configuration
   * Can be overridden by global logLevel in GithubLoaderOptions
   * @default 'default'
   */
  logLevel?: LogLevel;
  /**
   * Language for this import variant (e.g., "TypeScript", "Python", "Go").
   * Used for logging and passed through to the devportal for UI display.
   */
  language?: string;
  /**
   * Versions to display in the devportal's version picker.
   * Informational — tells the loader which version folders exist in the source content.
   * The loader imports content as-is; the version folder structure carries through from source to destination.
   */
  versions?: VersionConfig[];
};

export type FetchOptions = RequestInit & {
  signal?: AbortSignal;
  concurrency?: number;
};

/**
 * Astro loader context extended with optional entry type support.
 * Use this type when calling `.load(context as LoaderContext)` in multi-loader patterns.
 */
export interface LoaderContext extends AstroLoaderContext {
  /** @internal */
  entryTypes?: Map<string, ContentEntryType>;
}

/**
 * LoaderContext with Astro's logger replaced by our Logger class.
 * Used by internal functions that need verbose/logFileProcessing/etc.
 * @internal
 */
export type ExtendedLoaderContext = Omit<LoaderContext, "logger"> & {
  logger: Logger;
};

/**
 * @internal
 */
export interface Loader extends AstroLoader {
  /** Do the actual loading of the data */
  load: (context: LoaderContext) => Promise<void>;
}

/**
 * Statistics for a sync operation
 */
export interface SyncStats {
  /** Number of files added */
  added: number;
  /** Number of files updated */
  updated: number;
  /** Number of files deleted */
  deleted: number;
  /** Number of files unchanged */
  unchanged: number;
  /** Total processing time in ms */
  duration: number;
}
