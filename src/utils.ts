import path from 'path';
import {fileURLToPath} from 'node:url';
import {slug as githubSlug} from 'github-slugger';
import type {LoaderContext} from "./github.types.ts";

export type ContentPaths = {
    root: URL;
    contentDir: URL;
    assetsDir: URL;
    typesTemplate: URL;
    virtualModTemplate: URL;
    config: {
        exists: boolean;
        url: URL;
    };
};
const isWindows =
    typeof process !== 'undefined' && process.platform === 'win32';

export function slash(path: string) {
    return path.replace(/\\/g, '/');
}

/**
 * Re-implementation of Vite's normalizePath that can be used without Vite
 */
export function normalizePath(id: string) {
    return path.posix.normalize(isWindows ? slash(id) : id);
}

function getRelativeEntryPath(entry: URL, collection: string, contentDir: URL) {
    const relativeToContent = path.relative(
        fileURLToPath(contentDir),
        fileURLToPath(entry),
    );
    return path.relative(collection, relativeToContent);
}

export function getContentEntryIdAndSlug({
                                             entry,
                                             contentDir,
                                             collection,
                                         }: Pick<ContentPaths, 'contentDir'> & { entry: URL; collection: string }): {
    id: string;
    slug: string;
} {
    const relativePath = getRelativeEntryPath(entry, collection, contentDir);
    const withoutFileExt = relativePath.replace(
        new RegExp(path.extname(relativePath) + '$'),
        '',
    );
    const rawSlugSegments = withoutFileExt.split(path.sep);

    const slug = rawSlugSegments
        // Slugify each route segment to handle capitalization and spaces.
        // Note: using `slug` instead of `new Slugger()` means no slug deduping.
        .map(segment => githubSlug(segment))
        .join('/')
        .replace(/\/index$/, '');

    const res = {
        id: normalizePath(relativePath),
        slug,
    };
    return res;
}

/**
 * Convert a platform path to a posix path.
 */
export function posixifyPath(filePath: string) {
    return filePath.split(path.sep).join('/');
}

/**
 * Unlike `path.posix.relative`, this function will accept a platform path and return a posix path.
 */
export function posixRelative(from: string, to: string) {
    return posixifyPath(path.relative(from, to));
}

/**
 * Get the headers needed to make a conditional request.
 * Uses the etag and last-modified values from the meta store.
 */
export function getConditionalHeaders({
                                          init,
                                          meta,
                                          id
                                      }: {
    /** Initial headers to include */
    init?: RequestInit["headers"];
    /** Meta store to get etag and last-modified values from */
    meta: LoaderContext["meta"];
    id: string;
}): Headers {
    const tag = `${id}-etag`
    const lastModifiedTag = `${id}-last-modified`
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
 */
export function storeConditionalHeaders({
                                            headers,
                                            meta,
                                            id,
                                        }: {
    /** Headers from the response */
    headers: Headers;
    /** Meta store to store etag and last-modified values in */
    meta: LoaderContext["meta"];
    /** id string */
    id: string;
}) {
    const etag = headers.get("etag");
    const lastModified = headers.get("last-modified");
    const tag = `${id}-etag`
    const lastModifiedTag = `${id}-last-modified`
    meta.delete(tag);
    meta.delete(lastModifiedTag);
    if (etag) {
        meta.set(tag, etag);
    } else if (lastModified) {
        meta.set(lastModifiedTag, lastModified);
    }
}