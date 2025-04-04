import { toCollectionEntry } from "./github.content.js";

import type {Loader, GithubLoaderOptions} from "./github.types.js";


/**
 * Loads data from GitHub repositories based on the provided configurations and options.
 *
 * @return A loader object responsible for managing the data loading process.
 */
export function github({
  octokit,
  configs,
  fetchOptions = {},
  clear = false,
}: GithubLoaderOptions): Loader {
  return {
    name: "github-loader",
    load: async (context) => {
      const { store, logger } = context;
      logger.debug(`Loading data from ${configs.length} sources`);
      clear && store.clear();
      await Promise.all(
        configs.map((config) =>
          toCollectionEntry({
            context,
            octokit,
            options: config,
            fetchOptions,
          }),
        ),
      );
    },
  };
}
