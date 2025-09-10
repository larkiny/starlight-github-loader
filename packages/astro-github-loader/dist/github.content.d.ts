import type { LoaderContext, CollectionEntryOptions, RootOptions } from "./github.types.js";
/**
 * Generates a unique identifier based on the given options.
 *
 * @param {RootOptions} options - The configuration object containing the path and replacement string.
 * @param {string} options.path - The file path used to generate the identifier, defaults to an empty string if absent.
 * @param {string} [options.replace] - Optional substring that will be removed from the identifier if present.
 * @return {string} The generated identifier with the specified transformations applied.
 *
 * @internal
 */
export declare function generateId(options: RootOptions): string;
/**
 * Generates a path based on the provided options and optional identifier.
 *
 * @param {RootOptions} options - An object containing configuration for path generation.
 * @param {string} [id] - An optional identifier to append to the base path.
 * @return {string} The generated path as a string. Returns a modified path based on the identifier
 * provided or the base path configuration. Returns an empty string if no path can be generated.
 * @internal
 */
export declare function generatePath(options: RootOptions, id?: string): string;
/**
 * Synchronizes a file by ensuring the target directory exists and then writing the specified content to the file at the given path.
 *
 * @param {string} path - The path of the file to synchronize, including its directory and filename.
 * @param {string} content - The content to write into the file.
 * @return {Promise<void>} - A promise that resolves when the file has been successfully written.
 * @internal
 */
export declare function syncFile(path: string, content: string): Promise<void>;
/**
 * Synchronizes an entry by fetching its contents, validating its metadata, and storing or rendering it as needed.
 *
 * @param {LoaderContext} context - The loader context containing the required utilities, metadata, and configuration.
 * @param {Object} urls - Object containing URL data.
 * @param {string | URL | null} urls.url - The URL of the entry to fetch. Throws an error if null or invalid.
 * @param {string} urls.editUrl - The URL for editing the entry.
 * @param {RootOptions} options - Configuration settings for processing the entry such as file paths and custom options.
 * @param {RequestInit} [init] - Optional parameter for customizing the fetch request.
 * @return {Promise<void>} Resolves when the entry has been successfully processed and stored. Throws errors if invalid URL, missing configuration, or other issues occur.
 * @internal
 */
export declare function syncEntry(context: LoaderContext, { url, editUrl }: {
    url: string | URL | null;
    editUrl: string;
}, options: RootOptions, init?: RequestInit): Promise<void>;
/**
 * Converts a given GitHub repository path into a collection entry by fetching the content
 * from the GitHub repository using the provided Octokit instance and options.
 * Handles both files and directories, recursively processing directories if needed.
 * @internal
 */
export declare function toCollectionEntry({ context, octokit, options, signal, }: CollectionEntryOptions): Promise<void | any[]>;
/**
 * Get the headers needed to make a conditional request.
 * Uses the etag and last-modified values from the meta store.
 * @internal
 */
export declare function getHeaders({ init, meta, id, }: {
    /** Initial headers to include */
    init?: RequestInit["headers"];
    /** Meta store to get etag and last-modified values from */
    meta: LoaderContext["meta"];
    id: string;
}): Headers;
/**
 * Store the etag or last-modified headers from a response in the meta store.
 * @internal
 */
export declare function syncHeaders({ headers, meta, id, }: {
    /** Headers from the response */
    headers: Headers;
    /** Meta store to store etag and last-modified values in */
    meta: LoaderContext["meta"];
    /** id string */
    id: string;
}): void;
