import { promises as fs } from "node:fs";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { Octokit } from "octokit";
import type { Logger } from "./github.logger.js";
import type { ImportOptions, LoaderContext } from "./github.types.js";

const STATE_FILENAME = ".github-import-state.json";

/**
 * Represents the state of a single import configuration
 */
export interface ImportState {
  /** Configuration name for identification */
  name: string;
  /** Repository owner/name/path identifier */
  repoId: string;
  /** Last known commit SHA */
  lastCommitSha?: string;
  /** Last import timestamp */
  lastImported?: string;
  /** Git reference being tracked */
  ref: string;
}

/**
 * State file structure
 */
export interface StateFile {
  /** Map of config identifiers to their state */
  imports: Record<string, ImportState>;
  /** Last check timestamp */
  lastChecked: string;
}

/**
 * Information about repository changes
 */
export interface RepositoryChangeInfo {
  /** Configuration details */
  config: ImportOptions;
  /** Current state */
  state: ImportState;
  /** Whether repository needs to be re-imported */
  needsReimport: boolean;
  /** Latest commit SHA from remote */
  latestCommitSha?: string;
  /** Latest commit message */
  latestCommitMessage?: string;
  /** Latest commit date */
  latestCommitDate?: string;
  /** Error message if check failed */
  error?: string;
}

/**
 * Creates a unique identifier for an import configuration
 */
export function createConfigId(config: ImportOptions): string {
  return `${config.owner}/${config.repo}@${config.ref || "main"}`;
}

/**
 * Loads the import state from the state file
 */
export async function loadImportState(
  workingDir: string,
  logger?: Logger,
): Promise<StateFile> {
  const statePath = join(workingDir, STATE_FILENAME);

  if (!existsSync(statePath)) {
    return {
      imports: {},
      lastChecked: new Date().toISOString(),
    };
  }

  try {
    const content = await fs.readFile(statePath, "utf-8");
    return JSON.parse(content);
  } catch (error) {
    const msg = `Failed to load import state from ${statePath}, starting fresh: ${error}`;
    // eslint-disable-next-line no-console -- fallback when no logger provided
    logger ? logger.warn(msg) : console.warn(msg);
    return {
      imports: {},
      lastChecked: new Date().toISOString(),
    };
  }
}

/**
 * Saves the import state to the state file
 */
async function saveImportState(
  workingDir: string,
  state: StateFile,
  logger?: Logger,
): Promise<void> {
  const statePath = join(workingDir, STATE_FILENAME);

  try {
    await fs.writeFile(statePath, JSON.stringify(state, null, 2), "utf-8");
  } catch (error) {
    const msg = `Failed to save import state to ${statePath}: ${error}`;
    // eslint-disable-next-line no-console -- fallback when no logger provided
    logger ? logger.warn(msg) : console.warn(msg);
  }
}

/**
 * Gets the latest commit information for a repository path
 */
export async function getLatestCommitInfo(
  octokit: Octokit,
  config: ImportOptions,
  signal?: AbortSignal,
): Promise<{ sha: string; message: string; date: string } | null> {
  const { owner, repo, ref = "main" } = config;

  try {
    // Get commits for the entire repository
    const { data } = await octokit.rest.repos.listCommits({
      owner,
      repo,
      sha: ref,
      per_page: 1,
      request: { signal },
    });

    if (data.length === 0) {
      return null;
    }

    const latestCommit = data[0];
    return {
      sha: latestCommit.sha,
      message: latestCommit.commit.message.split("\n")[0], // First line only
      date:
        latestCommit.commit.committer?.date ||
        latestCommit.commit.author?.date ||
        new Date().toISOString(),
    };
  } catch (error: unknown) {
    if (
      typeof error === "object" &&
      error !== null &&
      "status" in error &&
      (error as { status: number }).status === 404
    ) {
      throw new Error(`Repository not found: ${owner}/${repo}`);
    }
    throw error;
  }
}

/**
 * Checks a single repository for changes
 */
async function checkRepositoryForChanges(
  octokit: Octokit,
  config: ImportOptions,
  currentState: ImportState,
  signal?: AbortSignal,
): Promise<RepositoryChangeInfo> {
  const configName = config.name || `${config.owner}/${config.repo}`;

  try {
    const latestCommit = await getLatestCommitInfo(octokit, config, signal);

    if (!latestCommit) {
      return {
        config,
        state: currentState,
        needsReimport: false,
        error: "No commits found in repository",
      };
    }

    const needsReimport =
      !currentState.lastCommitSha ||
      currentState.lastCommitSha !== latestCommit.sha;

    return {
      config,
      state: currentState,
      needsReimport,
      latestCommitSha: latestCommit.sha,
      latestCommitMessage: latestCommit.message,
      latestCommitDate: latestCommit.date,
    };
  } catch (error: unknown) {
    return {
      config,
      state: currentState,
      needsReimport: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Updates the import state after a successful import
 */
export async function updateImportState(
  workingDir: string,
  config: ImportOptions,
  commitSha?: string,
  logger?: Logger,
): Promise<void> {
  const state = await loadImportState(workingDir, logger);
  const configId = createConfigId(config);
  const configName = config.name || `${config.owner}/${config.repo}`;

  state.imports[configId] = {
    name: configName,
    repoId: configId,
    lastCommitSha: commitSha,
    lastImported: new Date().toISOString(),
    ref: config.ref || "main",
  };

  await saveImportState(workingDir, state, logger);
}

/**
 * Performs a dry run check on all configured repositories
 */
export async function performDryRun(
  configs: ImportOptions[],
  context: LoaderContext,
  octokit: Octokit,
  workingDir: string = process.cwd(),
  signal?: AbortSignal,
): Promise<RepositoryChangeInfo[]> {
  const { logger } = context;

  logger.info("🔍 Performing dry run - checking for repository changes...");

  // Load current state
  const state = await loadImportState(workingDir);
  const results: RepositoryChangeInfo[] = [];

  // Check each configuration
  for (const config of configs) {
    if (config.enabled === false) {
      logger.debug(
        `Skipping disabled config: ${config.name || `${config.owner}/${config.repo}`}`,
      );
      continue;
    }

    const configId = createConfigId(config);
    const configName = config.name || `${config.owner}/${config.repo}`;

    // Get current state for this config
    const currentState: ImportState = state.imports[configId] || {
      name: configName,
      repoId: configId,
      ref: config.ref || "main",
    };

    logger.debug(`Checking ${configName}...`);

    try {
      const changeInfo = await checkRepositoryForChanges(
        octokit,
        config,
        currentState,
        signal,
      );
      results.push(changeInfo);
    } catch (error: unknown) {
      if (signal?.aborted) throw error;

      results.push({
        config,
        state: currentState,
        needsReimport: false,
        error: `Failed to check repository: ${error instanceof Error ? error.message : String(error)}`,
      });
    }
  }

  // Update last checked time
  state.lastChecked = new Date().toISOString();
  await saveImportState(workingDir, state);

  return results;
}

/**
 * Formats and displays the dry run results
 */
export function displayDryRunResults(
  results: RepositoryChangeInfo[],
  logger: { info: (msg: string) => void },
): void {
  logger.info("\n📊 Repository Import Status:");
  logger.info("=".repeat(50));

  let needsReimportCount = 0;
  let errorCount = 0;

  for (const result of results) {
    const configName =
      result.config.name || `${result.config.owner}/${result.config.repo}`;

    if (result.error) {
      logger.info(`❌ ${configName}: ${result.error}`);
      errorCount++;
    } else if (result.needsReimport) {
      logger.info(`🔄 ${configName}: Needs re-import`);
      if (result.latestCommitMessage) {
        logger.info(`   Latest commit: ${result.latestCommitMessage}`);
      }
      if (result.latestCommitDate) {
        const date = new Date(result.latestCommitDate);
        const timeAgo = getTimeAgo(date);
        logger.info(`   Committed: ${timeAgo}`);
      }
      if (result.state.lastImported) {
        const lastImported = new Date(result.state.lastImported);
        const importTimeAgo = getTimeAgo(lastImported);
        logger.info(`   Last imported: ${importTimeAgo}`);
      } else {
        logger.info(`   Last imported: Never`);
      }
      needsReimportCount++;
    } else {
      logger.info(`✅ ${configName}: Up to date`);
      if (result.state.lastImported) {
        const lastImported = new Date(result.state.lastImported);
        const timeAgo = getTimeAgo(lastImported);
        logger.info(`   Last imported: ${timeAgo}`);
      }
    }
  }

  logger.info("=".repeat(50));
  logger.info(
    `📈 Summary: ${needsReimportCount} of ${results.length} repositories need re-import, ${errorCount} errors`,
  );

  if (needsReimportCount > 0) {
    logger.info("\n💡 To import updated repositories:");
    logger.info(
      "1. Delete the target import folders for repositories that need re-import",
    );
    logger.info("2. Run the import process normally (dryRun: false)");
    logger.info("3. Fresh content will be imported automatically");
  } else {
    logger.info("\n🎉 All repositories are up to date!");
  }
}

/**
 * Helper function to format time differences in a human-readable way
 */
function getTimeAgo(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffMins < 60) {
    return `${diffMins} minutes ago`;
  } else if (diffHours < 24) {
    return `${diffHours} hours ago`;
  } else if (diffDays < 7) {
    return `${diffDays} days ago`;
  } else {
    return date.toLocaleDateString();
  }
}
