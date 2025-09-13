import { toCollectionEntry } from "./github.content.js";
import { performSelectiveCleanup } from "./github.cleanup.js";
import { performDryRun, displayDryRunResults, updateImportState } from "./github.dryrun.js";

import type {
  Loader,
  GithubLoaderOptions,
  ImportOptions,
  SyncStats,
} from "./github.types.js";

/**
 * Performs selective cleanup for configurations with basePath
 * @param configs - Array of configuration objects
 * @param context - Loader context  
 * @param octokit - GitHub API client
 * @internal
 */
async function performSelectiveCleanups(
  configs: ImportOptions[],
  context: any,
  octokit: any
): Promise<SyncStats[]> {
  const results: SyncStats[] = [];
  
  // Process each config sequentially to avoid overwhelming Astro's file watcher
  for (const config of configs) {
    if (config.enabled === false) {
      context.logger.debug(`Skipping disabled config: ${config.name || `${config.owner}/${config.repo}`}`);
      continue;
    }

    try {
      const stats = await performSelectiveCleanup(config, context, octokit);
      results.push(stats);
    } catch (error: any) {
      context.logger.error(`Selective cleanup failed for ${config.name || `${config.owner}/${config.repo}`}: ${error}`);
      // Continue with other configs even if one fails
    }
  }
  
  return results;
}

/**
 * Loads data from GitHub repositories based on the provided configurations and options.
 *
 * @return A loader object responsible for managing the data loading process.
 */
export function githubLoader({
  octokit,
  configs,
  fetchOptions = {},
  clear = false,
  dryRun = false,
}: GithubLoaderOptions): Loader {
  return {
    name: "github-loader",
    load: async (context) => {
      const { store, logger } = context;
      
      if (dryRun) {
        logger.info("🔍 Dry run mode enabled - checking for changes only");
        
        try {
          const results = await performDryRun(configs, context, octokit);
          displayDryRunResults(results, logger);
          
          logger.info("\n🚫 Dry run complete - no imports performed");
          logger.info("💡 Set dryRun: false to perform actual imports");
          
          return; // Exit without importing
        } catch (error: any) {
          logger.error(`Dry run failed: ${error.message}`);
          throw error;
        }
      }

      logger.debug(`Loading data from ${configs.length} sources`);

      // Always use standard processing - no file deletions to avoid Astro issues
      logger.info(clear ? "Processing with content store clear" : "Processing without content store clear");
      
      if (clear) {
        store.clear();
      }
      
      await Promise.all(
        configs.map(async (config) => {
          // Perform the import
          await toCollectionEntry({
            context,
            octokit,
            options: config,
            fetchOptions,
          });

          // Update state tracking for future dry runs
          try {
            // Get the latest commit info to track state
            const { data } = await octokit.rest.repos.listCommits({
              owner: config.owner,
              repo: config.repo,
              sha: config.ref || 'main',
              path: config.path || undefined,
              per_page: 1
            });
            
            if (data.length > 0) {
              await updateImportState(process.cwd(), config, data[0].sha);
            }
          } catch (error) {
            // Don't fail the import if state tracking fails
            logger.debug(`Failed to update import state for ${config.name || `${config.owner}/${config.repo}`}: ${error}`);
          }
        })
      );
    },
  };
}
