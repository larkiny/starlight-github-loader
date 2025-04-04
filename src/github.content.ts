import type { MarkdownHeading } from '@astrojs/markdown-remark';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {Octokit} from "octokit";
import {INVALID_STRING_ERROR, INVALID_URL_ERROR} from "./github.constants";
import type {FetchOptions} from "./github.fetch";
import type {LoaderContext} from "./github.types";
import {existsSync, promises as fs} from "node:fs";
import {getConditionalHeaders, storeConditionalHeaders} from "./utils";


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

export type RootOptions = {
    owner: string,
    repo: string
    replace?: string,
    basePath?: string,
    path?: string,
    ref?: string,
}

export function generateId(options: RootOptions) {
    let id = options.path?.replace('.mdx', '') || ''
    if(typeof options.replace === 'string'){
        id = id.replace(options.replace, '')
    }
    return id
}
export function generatePath(options: RootOptions, id?: string) {
    if(typeof id === 'string'){
        return `${options.basePath? `${options.basePath}/`:''}${id}.mdx`
    }
    return options.path?.replace('.mdx', '') || ''
}

export async function syncFile(path: string, content: string) {
    const dir = path.substring(0, path.lastIndexOf('/'));

    // Ensure the directory exists
    if (dir && !existsSync(dir)) {
        await fs.mkdir(dir, {recursive: true});
    }

    // Write the file to the filesystem and store
    await fs.writeFile(path, content, 'utf-8');
}

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
 */
export async function syncEntry(
    context: LoaderContext,
    {url, editUrl}: {url: string | URL | null, editUrl: string},
    options: RootOptions,
    init: RequestInit = {}
) {

    // Exit on null or if the URL is invalid
    if(url === null || (typeof url !== 'string' && !(url instanceof URL))) {
        throw new TypeError(INVALID_URL_ERROR)
    }
    // Validate URL
    if(typeof url === 'string') url = new URL(url)

    const {meta, store, generateDigest, entryTypes, logger, parseData, config} = context

    function configForFile(file: string) {
        const ext = file.split('.').at(-1);
        if (!ext) {
            logger.warn(`No extension found for ${file}`);
            return;
        }
        return entryTypes?.get(`.${ext}`);
    }
    // Custom ID, TODO: Allow custom id generators
    let id = generateId(options)


    init.headers = getConditionalHeaders({
        init: init.headers,
        meta,
        id,
    })

    const res = await fetch(url, init)

    if(res.status === 304) {
        logger.info(`Skipping ${id} as it has not changed`)
        return
    }
    if(!res.ok) throw new Error(res.statusText)
    const contents = await res.text()
    const entryType = configForFile(options?.path || 'tmp.mdx')
    if(!entryType) throw new Error('No entry type found')


    const relativePath = generatePath(options, id)
    const filePath = pathToFileURL(relativePath)
    const { body, data } = await entryType.getEntryInfo({
        contents,
        fileUrl: filePath,
    });

    const existingEntry = store.get(id);

    const digest = generateDigest(contents);

    if (existingEntry && existingEntry.digest === digest && existingEntry.filePath) {
        return;
    }
    // Write file to path
    if(!existsSync(fileURLToPath(filePath))) {
        logger.info(`Writing ${id} to ${filePath}`)
        await syncFile(fileURLToPath(filePath), contents)
    }

    const parsedData = await parseData({
        id,
        data,
        filePath: filePath.toString(),
    });

    if (entryType.getRenderFunction) {
        logger.info(`Rendering ${id}`)
        const render = await entryType.getRenderFunction(config);
        let rendered: RenderedContent | undefined = undefined;
        try {
            rendered = await render?.({
                id,
                data,
                body,
                filePath: filePath.toString(),
                digest,
            });
        } catch (error: any) {
            logger.error(`Error rendering ${id}: ${error.message}`);
        }
        store.set({
            id,
            data: parsedData,
            body,
            filePath: relativePath,
            digest,
            rendered,
        })
    } else if ('contentModuleTypes' in entryType) {
        store.set({
            id,
            data: parsedData,
            body,
            filePath: relativePath,
            digest,
            deferredRender: true,
        });
    } else {
        store.set({ id, data: parsedData, body, filePath: relativePath, digest });
    }

    storeConditionalHeaders({
        headers: res.headers,
        meta,
        id,
    })
}
type CollectionEntryOptions ={
  context: LoaderContext,
  octokit: Octokit,
  options: RootOptions,
  signal?: AbortSignal,
  fetchOptions?: FetchOptions,
}

/**
 * Converts a given GitHub repository path into a collection entry by fetching the content
 * from the GitHub repository using the provided Octokit instance and options.
 * Handles both files and directories, recursively processing directories if needed.
 */
export async function toCollectionEntry({context, octokit, options, signal}: CollectionEntryOptions) {
    const {owner, repo, replace, basePath, path = '', ref = 'main'} = options || {}
    if (typeof repo !== 'string' || typeof owner !== 'string') throw new TypeError(INVALID_STRING_ERROR);

    // Fetch the content
    const {data, status} =  await octokit.rest.repos.getContent({owner, repo, path, ref, request: {signal}})
    if(status !== 200) throw new Error('Something went wrong')

    // Matches for regular files
    if (!Array.isArray(data)) {
        const path = data.path
        switch (data.type) {
            // Return
            case 'file':
                return await syncEntry(context, {url: data.download_url, editUrl: data.url}, {...options, path, ref}, {signal})
            default:
                throw new Error('Invalid type')
        }
    }

    // Directory listing
    const promises: Promise<any>[] = data.map(({type, path, download_url, url}) => {
        switch (type) {
            // Recurse
            case 'dir':
                return toCollectionEntry({context, octokit, options: {...options, path, ref}, signal})
            // Return
            case 'file':
                return syncEntry(context, {url: download_url, editUrl: url}, {...options, path, ref}, {signal})
            default:
                throw new Error('Invalid type')
        }
    })
    return await Promise.all(promises)
}