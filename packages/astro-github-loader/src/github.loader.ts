import { promises as fs } from "node:fs";
import { existsSync } from "node:fs";
import { toCollectionEntry } from "./github.content.js";

import type {Loader, GithubLoaderOptions, RootOptions} from "./github.types.js";

/**
 * Clears the specified directories if they exist
 * @param configs - Array of configuration objects containing directory paths
 * @internal
 */
async function clearDirectories(configs: RootOptions[]): Promise<void> {
  const directoriesToClear = new Set<string>();
  
  // Collect unique directories from all configs
  for (const config of configs) {
    if (config.basePath && existsSync(config.basePath)) {
      directoriesToClear.add(config.basePath);
    }
    if (config.assetsPath && existsSync(config.assetsPath)) {
      directoriesToClear.add(config.assetsPath);
    }
  }
  
  // Clear each directory
  await Promise.all(
    Array.from(directoriesToClear).map(async (dir) => {
      try {
        await fs.rm(dir, { recursive: true, force: true });
      } catch (error) {
        console.warn(`Failed to clear directory ${dir}:`, error);
      }
    })
  );
}

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
      
      if (clear) {
        logger.debug("Clearing content store and directories");
        store.clear();
        await clearDirectories(configs);
      }
      
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
