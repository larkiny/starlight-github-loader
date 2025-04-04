import {Octokit} from "octokit";
import pMap from "p-map";
import {type RootOptions, toCollectionEntry} from "./github.content";
import type {Loader} from "./github.types";
import type {FetchOptions} from "./github.fetch";

export type GithubLoaderOptions = {
  octokit: Octokit,
  configs: Array<RootOptions>,
  clear?: boolean,
  gitIgnore?: string,
  basePath?: string,
  fetchOptions?: FetchOptions,
}

export function github({octokit, configs, fetchOptions = {}, clear = false, basePath}: GithubLoaderOptions): Loader {
    const {concurrency = 10, signal} = fetchOptions
    if(typeof basePath === 'undefined' || basePath == ''){
        basePath = "src/content"
    }
    return {
        name: 'github-loader',
        load: async (context)=>{
            const { store, logger } = context
            logger.debug(`Loading data from ${configs.length} sources`);
            clear && store.clear();
            await pMap(configs, async (config) => toCollectionEntry({context, octokit, options: config, fetchOptions:{signal, concurrency}}), {concurrency, signal})
        }
    }
}