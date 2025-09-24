import { toCollectionEntry } from "./github.content.js";
import { performSelectiveCleanup } from "./github.cleanup.js";
import { performDryRun, displayDryRunResults, updateImportState } from "./github.dryrun.js";
import { createLogger, type Logger, type ImportSummary } from "./github.logger.js";

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
  logLevel,
}: GithubLoaderOptions): Loader {
  return {
    name: "github-loader",
    load: async (context) => {
      const { store } = context;

      // Create global logger with specified level or default
      const globalLogger = createLogger(logLevel || 'default');

      if (dryRun) {
        globalLogger.info("🔍 Dry run mode enabled - checking for changes only");

        try {
          const results = await performDryRun(configs, context, octokit);
          displayDryRunResults(results, context.logger);

          globalLogger.info("\n🚫 Dry run complete - no imports performed");
          globalLogger.info("💡 Set dryRun: false to perform actual imports");

          return; // Exit without importing
        } catch (error: any) {
          globalLogger.error(`Dry run failed: ${error.message}`);
          throw error;
        }
      }

      globalLogger.debug(`Loading data from ${configs.length} sources`);

      // Always use standard processing - no file deletions to avoid Astro issues
      globalLogger.info(clear ? "Processing with content store clear" : "Processing without content store clear");

      if (clear) {
        store.clear();
      }

      // Process each config sequentially to avoid overwhelming GitHub API/CDN
      for (let i = 0; i < configs.length; i++) {
        const config = configs[i];

        if (config.enabled === false) {
          globalLogger.debug(`Skipping disabled config: ${config.name || `${config.owner}/${config.repo}`}`);
          continue;
        }

        // Add small delay between configs to be gentler on GitHub's CDN
        if (i > 0) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }

        // Determine the effective log level for this config
        const effectiveLogLevel = logLevel || config.logLevel || 'default';
        const configLogger = createLogger(effectiveLogLevel);

        const configName = config.name || `${config.owner}/${config.repo}`;
        const repository = `${config.owner}/${config.repo}`;

        let summary: ImportSummary = {
          configName,
          repository,
          ref: config.ref,
          filesProcessed: 0,
          filesUpdated: 0,
          filesUnchanged: 0,
          duration: 0,
          status: 'error',
        };

        const startTime = Date.now();

        try {
          // Perform the import with timing
          globalLogger.info(`🔄 Starting import for ${configName}`);

          const stats = await toCollectionEntry({
            context: { ...context, logger: configLogger as any },
            octokit,
            options: config,
            fetchOptions,
          });

          summary.duration = Date.now() - startTime;
          summary.filesProcessed = stats?.processed || 0;
          summary.filesUpdated = stats?.updated || 0;
          summary.filesUnchanged = stats?.unchanged || 0;
          summary.assetsDownloaded = stats?.assetsDownloaded || 0;
          summary.assetsCached = stats?.assetsCached || 0;
          summary.status = 'success';

          // Log structured summary
          configLogger.logImportSummary(summary);

          // Update state tracking for future dry runs
          try {
            // Get the latest commit info to track state
            const { data } = await octokit.rest.repos.listCommits({
              owner: config.owner,
              repo: config.repo,
              sha: config.ref || 'main',
              per_page: 1
            });

            if (data.length > 0) {
              await updateImportState(process.cwd(), config, data[0].sha);
            }
          } catch (error) {
            // Don't fail the import if state tracking fails
            configLogger.debug(`Failed to update import state for ${configName}: ${error}`);
          }
        } catch (error: any) {
          summary.duration = Date.now() - startTime;
          summary.status = 'error';
          summary.error = error.message;

          configLogger.logImportSummary(summary);
          // Continue with other configs even if one fails
        }
      }
    },
  };
}
