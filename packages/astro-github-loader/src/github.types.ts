import type {
  Loader as AstroLoader,
  LoaderContext as AstroLoaderContext,
} from "astro/loaders";
import type { ContentEntryType } from "astro";
import type {MarkdownHeading} from "@astrojs/markdown-remark";
import {Octokit} from "octokit";

export type TransformFunction = (content: string, context: TransformContext) => Promise<string> | string;

export type TransformContext = {
  path: string;
  owner: string;
  repo: string;
  ref: string;
  metadata?: Record<string, any>;
};

export type GithubLoaderOptions = {
  octokit: Octokit;
  configs: Array<RootOptions>;
  clear?: boolean;
  gitIgnore?: string;
  basePath?: string;
  fetchOptions?: FetchOptions;
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
  options: RootOptions;
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
 * Represents configuration options for all tree operations.
 */
export type RootOptions = {
  /**
   * Repository owner
   */
  owner: string;
  /**
   * Repository Name
   */
  repo: string;
  /**
   * An optional string that specifies the replacement selector
   */
  replace?: string;
  /**
   * Represents the base path for constructing URLs or accessing a specific directory.
   * This optional string value can be set to define the root path for operations that require a prefixed path.
   */
  basePath?: string;
  /**
   * The path relative to the repository name and owner
   */
  path?: string;
  /**
   * A specific reference in Github
   */
  ref?: string;
  /**
   * Array of transformation functions to apply to file content before processing
   */
  transforms?: TransformFunction[];
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
