import type { Loader, GithubLoaderOptions } from "./github.types.js";
/**
 * Loads data from GitHub repositories based on the provided configurations and options.
 *
 * @return A loader object responsible for managing the data loading process.
 */
export declare function github({ octokit, configs, fetchOptions, clear, }: GithubLoaderOptions): Loader;
