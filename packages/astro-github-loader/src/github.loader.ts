import { toCollectionEntry } from "./github.content.js";
import { performSelectiveCleanup } from "./github.cleanup.js";
import { performDryRun, displayDryRunResults, updateImportState, loadImportState, createConfigId, getLatestCommitInfo } from "./github.dryrun.js";
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
 * Features:
 * - Sequential processing with spinner feedback for long-running operations
 * - Dry run mode for change detection without actual imports
 * - Configurable logging levels per configuration
 * - Import state tracking for incremental updates
 * - Content store management with optional clearing
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
  force = false,
}: GithubLoaderOptions): Loader {
  return {
    name: "github-loader",
    load: async (context) => {

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

      // Log clear mode status - actual clearing happens per-entry in toCollectionEntry
      // to avoid breaking Astro's content collection by emptying the store all at once
      globalLogger.info(clear ? "Processing with selective entry replacement" : "Processing without entry replacement");

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

        const langSuffix = config.language ? ` (${config.language})` : '';
        const configName = config.name ? `${config.name}${langSuffix}` : `${config.owner}/${config.repo}${langSuffix}`;
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
          // Repository-level caching check before spinner
          const configId = createConfigId(config);

          if (!force) {
            try {
              const state = await loadImportState(process.cwd());
              const currentState = state.imports[configId];

              if (currentState && currentState.lastCommitSha) {
                configLogger.debug(`🔍 Checking repository changes for ${configName}...`);
                const latestCommit = await getLatestCommitInfo(octokit, config);

                if (latestCommit && currentState.lastCommitSha === latestCommit.sha) {
                  configLogger.info(`✅ Repository ${configName} unchanged (${latestCommit.sha.slice(0, 7)}) - skipping import`);

                  // Update summary for unchanged repository
                  summary.duration = Date.now() - startTime;
                  summary.filesProcessed = 0;
                  summary.filesUpdated = 0;
                  summary.filesUnchanged = 0;
                  summary.status = 'success';

                  configLogger.logImportSummary(summary);
                  continue; // Skip to next config
                } else if (latestCommit) {
                  configLogger.info(`🔄 Repository ${configName} changed (${currentState.lastCommitSha?.slice(0, 7) || 'unknown'} -> ${latestCommit.sha.slice(0, 7)}) - proceeding with import`);
                }
              } else {
                configLogger.debug(`📥 First time importing ${configName} - no previous state found`);
              }
            } catch (error) {
              configLogger.warn(`Failed to check repository state for ${configName}: ${error instanceof Error ? error.message : String(error)}`);
              // Continue with import if state check fails
            }
          } else {
            configLogger.info(`🔄 Force mode enabled for ${configName} - proceeding with full import`);
          }

          // Determine effective clear setting: per-config takes precedence over global
          const effectiveClear = config.clear ?? clear;

          // Perform selective cleanup before importing if clear is enabled
          if (effectiveClear) {
            configLogger.info(`🧹 Clearing obsolete files for ${configName}...`);
            try {
              await performSelectiveCleanup(config, { ...context, logger: configLogger as any }, octokit);
            } catch (error) {
              configLogger.warn(`Cleanup failed for ${configName}, continuing with import: ${error}`);
            }
          }

          // Perform the import with spinner
          const stats = await globalLogger.withSpinner(
            `🔄 Importing ${configName}...`,
            () => toCollectionEntry({
              context: { ...context, logger: configLogger as any },
              octokit,
              options: config,
              fetchOptions,
              force,
              clear: effectiveClear,
            }),
            `✅ ${configName} imported successfully`,
            `❌ ${configName} import failed`
          );

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
