import type {
  Loader as AstroLoader,
  LoaderContext as AstroLoaderContext,
} from "astro/loaders";
import type { ContentEntryType } from "astro";
import type {MarkdownHeading} from "@astrojs/markdown-remark";
import {Octokit} from "octokit";

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
export type TransformFunction = (content: string, context: TransformContext) => string;

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
  context: LoaderContext;
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
 * Represents configuration options for importing content from GitHub repositories.
 */
export type ImportOptions = {
  /**
   * Display name for this configuration (used in logging)
   */
  name?: string;
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
};

export type FetchOptions = RequestInit & {
  signal?: AbortSignal;
  concurrency?: number;
};

/**
 * @internal
 */
export interface LoaderContext extends AstroLoaderContext {
  /** @internal */
  entryTypes?: Map<string, ContentEntryType>;
}

/**
 * @internal
 */
export interface Loader extends AstroLoader {
  /** Do the actual loading of the data */
  load: (context: LoaderContext) => Promise<void>;
}

/**
 * Represents a single file entry in the sync manifest
 */
export interface ManifestEntry {
  /** File path within the repository */
  path: string;
  /** Local file system path */
  localPath: string;
  /** Last modified timestamp from GitHub */
  lastModified?: string;
  /** ETag from GitHub response */
  etag?: string;
  /** Content digest for change detection */
  digest?: string;
}

/**
 * Manifest file tracking synced content
 */
export interface SyncManifest {
  /** Map of file IDs to their manifest entries */
  files: Record<string, ManifestEntry>;
  /** Timestamp of last sync operation */
  lastSync: string;
  /** Configuration hash to detect config changes */
  configHash?: string;
}

/**
 * Plan for synchronizing files
 */
export interface SyncPlan {
  /** Files to be added (new files) */
  toAdd: ManifestEntry[];
  /** Files to be updated (changed files) */
  toUpdate: ManifestEntry[];
  /** Files to be deleted (no longer exist remotely) */
  toDelete: ManifestEntry[];
  /** Files that haven't changed (skip processing) */
  unchanged: ManifestEntry[];
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
