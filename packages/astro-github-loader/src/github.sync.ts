import { promises as fs } from "node:fs";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { generateId, generatePath, shouldIncludeFile, syncEntry } from "./github.content.js";
import type { 
  ImportOptions, 
  SyncManifest, 
  ManifestEntry, 
  SyncPlan, 
  SyncStats,
  LoaderContext
} from "./github.types.js";

const MANIFEST_FILENAME = '.astro-github-manifest.json';
const SLEEP_BETWEEN_DELETES = 10; // ms between file deletions

/**
 * Creates a hash of the configuration to detect changes
 */
function createConfigHash(options: ImportOptions): string {
  const configForHashing = {
    owner: options.owner,
    repo: options.repo,
    ref: options.ref,
    includes: options.includes
  };
  return createHash('md5').update(JSON.stringify(configForHashing)).digest('hex');
}

/**
 * Loads the sync manifest from disk
 */
async function loadManifest(basePath: string): Promise<SyncManifest> {
  const manifestPath = join(basePath, MANIFEST_FILENAME);
  
  if (!existsSync(manifestPath)) {
    return {
      files: {},
      lastSync: new Date().toISOString()
    };
  }

  try {
    const content = await fs.readFile(manifestPath, 'utf-8');
    return JSON.parse(content);
  } catch (error) {
    console.warn(`Failed to load manifest from ${manifestPath}, starting fresh:`, error);
    return {
      files: {},
      lastSync: new Date().toISOString()
    };
  }
}

/**
 * Saves the sync manifest to disk
 */
async function saveManifest(basePath: string, manifest: SyncManifest): Promise<void> {
  const manifestPath = join(basePath, MANIFEST_FILENAME);
  
  // Ensure directory exists
  if (!existsSync(basePath)) {
    await fs.mkdir(basePath, { recursive: true });
  }

  try {
    await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2), 'utf-8');
  } catch (error) {
    console.warn(`Failed to save manifest to ${manifestPath}:`, error);
  }
}

/**
 * Discovers all files in a GitHub repository directory
 */
async function discoverRemoteFiles(
  octokit: any, 
  options: ImportOptions,
  signal?: AbortSignal
): Promise<Map<string, ManifestEntry>> {
  const { owner, repo, ref = "main" } = options;
  const files = new Map<string, ManifestEntry>();

  // Get all unique directory prefixes from include patterns to limit scanning
  const directoriesToScan = new Set<string>();
  if (options.includes && options.includes.length > 0) {
    for (const includePattern of options.includes) {
      // Extract directory part from pattern (before any glob wildcards)
      const pattern = includePattern.pattern;
      const beforeGlob = pattern.split(/[*?{]/)[0];
      const dirPart = beforeGlob.includes('/') ? beforeGlob.substring(0, beforeGlob.lastIndexOf('/')) : '';
      directoriesToScan.add(dirPart);
    }
  } else {
    // If no includes specified, scan from root
    directoriesToScan.add('');
  }

  async function processDirectory(dirPath: string) {
    try {
      const { data } = await octokit.rest.repos.getContent({
        owner,
        repo,
        path: dirPath,
        ref,
        request: { signal }
      });

      if (!Array.isArray(data)) {
        // Single file
        if (data.type === 'file' && shouldIncludeFile(data.path, options).included) {
          const id = generateId(data.path);
          const includeResult = shouldIncludeFile(data.path, options);
          const localPath = generatePath(data.path, includeResult.included ? includeResult.matchedPattern : null);
          
          files.set(id, {
            path: data.path,
            localPath,
            lastModified: data.last_modified || undefined,
            etag: data.sha // Use SHA as ETag equivalent
          });
        }
        return;
      }

      // Directory listing
      const promises = data
        .filter(({ type, path }) => {
          if (type === "dir") return true;
          if (type === "file") return shouldIncludeFile(path, options).included;
          return false;
        })
        .map(async ({ type, path: itemPath }) => {
          if (type === "dir") {
            await processDirectory(itemPath);
          } else if (type === "file") {
            const id = generateId(itemPath);
            const includeResult = shouldIncludeFile(itemPath, options);
            const localPath = generatePath(itemPath, includeResult.included ? includeResult.matchedPattern : null);
            
            files.set(id, {
              path: itemPath,
              localPath,
              etag: data.find(item => item.path === itemPath)?.sha
            });
          }
        });

      await Promise.all(promises);
    } catch (error: any) {
      if (signal?.aborted) throw error;
      console.warn(`Failed to process directory ${dirPath}:`, error);
    }
  }

  // Process only the directories that match our include patterns
  for (const dirPath of directoriesToScan) {
    await processDirectory(dirPath);
  }
  return files;
}

/**
 * Creates a sync plan by comparing remote files with the local manifest
 */
async function createSyncPlan(
  remoteFiles: Map<string, ManifestEntry>,
  manifest: SyncManifest,
  options: ImportOptions
): Promise<SyncPlan> {
  const plan: SyncPlan = {
    toAdd: [],
    toUpdate: [],
    toDelete: [],
    unchanged: []
  };

  // Check remote files against local manifest
  for (const [id, remoteEntry] of remoteFiles) {
    const localEntry = manifest.files[id];
    
    if (!localEntry) {
      // New file
      plan.toAdd.push(remoteEntry);
    } else if (
      remoteEntry.etag !== localEntry.etag ||
      remoteEntry.lastModified !== localEntry.lastModified ||
      !existsSync(localEntry.localPath)
    ) {
      // Changed or missing local file
      plan.toUpdate.push({ ...remoteEntry, localPath: localEntry.localPath });
    } else {
      // Unchanged
      plan.unchanged.push(localEntry);
    }
  }

  // Check for files to delete (in local manifest but not in remote)
  for (const [id, localEntry] of Object.entries(manifest.files)) {
    if (!remoteFiles.has(id)) {
      plan.toDelete.push(localEntry);
    }
  }

  return plan;
}

/**
 * Sleep utility for pacing file operations
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Executes the sync plan with proper pacing to avoid Astro issues
 */
async function executeSyncPlan(
  plan: SyncPlan,
  options: ImportOptions,
  context: LoaderContext,
  octokit: any,
  signal?: AbortSignal
): Promise<void> {
  const { logger } = context;

  // Delete obsolete files first (with pacing)
  for (const entry of plan.toDelete) {
    try {
      if (existsSync(entry.localPath)) {
        await fs.unlink(entry.localPath);
        logger.debug(`Deleted ${entry.localPath}`);
      }
      await sleep(SLEEP_BETWEEN_DELETES);
    } catch (error) {
      logger.warn(`Failed to delete ${entry.localPath}: ${error}`);
    }
  }

  // Process additions and updates (can be done in parallel)
  const processFile = async (entry: ManifestEntry) => {
    try {
      const { owner, repo, ref = "main" } = options;
      const { data } = await octokit.rest.repos.getContent({
        owner,
        repo,
        path: entry.path,
        ref,
        request: { signal }
      });

      if (Array.isArray(data) || data.type !== 'file' || !data.download_url) {
        throw new Error(`${entry.path} is not a valid file`);
      }

      await syncEntry(
        context,
        { url: data.download_url, editUrl: data.url },
        entry.path,
        options,
        octokit,
        { signal }
      );

      logger.debug(`Synced ${entry.path} -> ${entry.localPath}`);
    } catch (error: any) {
      if (signal?.aborted) throw error;
      logger.error(`Failed to sync ${entry.path}: ${error}`);
    }
  };

  // Process additions and updates with controlled concurrency
  const allFilesToProcess = [...plan.toAdd, ...plan.toUpdate];
  const concurrency = 5; // Limit concurrent operations
  
  for (let i = 0; i < allFilesToProcess.length; i += concurrency) {
    const batch = allFilesToProcess.slice(i, i + concurrency);
    await Promise.all(batch.map(processFile));
  }
}

/**
 * Performs incremental sync for a single import configuration
 */
export async function performIncrementalSync(
  config: ImportOptions,
  context: LoaderContext,
  octokit: any,
  signal?: AbortSignal
): Promise<SyncStats> {
  const startTime = Date.now();
  const { logger } = context;
  const configName = config.name || `${config.owner}/${config.repo}`;
  
  if (!config.includes || config.includes.length === 0) {
    throw new Error(`includes patterns are required for incremental sync in config: ${configName}`);
  }

  logger.debug(`Starting incremental sync for ${configName}`);

  try {
    // Load existing manifest (using first include pattern's base path)
    const manifestPath = config.includes[0].basePath;
    const manifest = await loadManifest(manifestPath);
    
    // Check if config changed (force full sync if it did)
    const currentConfigHash = createConfigHash(config);
    const configChanged = manifest.configHash && manifest.configHash !== currentConfigHash;
    
    if (configChanged) {
      logger.info(`Configuration changed for ${configName}, performing full sync`);
      manifest.files = {}; // Clear manifest to force full re-sync
    }

    // Discover remote files
    const remoteFiles = await discoverRemoteFiles(octokit, config, signal);
    
    // Create sync plan
    const plan = await createSyncPlan(remoteFiles, manifest, config);
    
    // Execute the sync plan
    await executeSyncPlan(plan, config, context, octokit, signal);
    
    // Update manifest
    const newManifest: SyncManifest = {
      files: Object.fromEntries(remoteFiles),
      lastSync: new Date().toISOString(),
      configHash: currentConfigHash
    };
    
    await saveManifest(manifestPath, newManifest);
    
    const duration = Date.now() - startTime;
    const stats: SyncStats = {
      added: plan.toAdd.length,
      updated: plan.toUpdate.length,
      deleted: plan.toDelete.length,
      unchanged: plan.unchanged.length,
      duration
    };

    // Log summary
    logger.info(
      `Sync completed for ${configName}: ` +
      `${stats.added} added, ${stats.updated} updated, ` +
      `${stats.deleted} deleted, ${stats.unchanged} unchanged ` +
      `(${duration}ms)`
    );

    return stats;
    
  } catch (error: any) {
    if (signal?.aborted) {
      logger.info(`Sync cancelled for ${configName}`);
      throw error;
    }
    
    const duration = Date.now() - startTime;
    logger.error(`Sync failed for ${configName} after ${duration}ms: ${error}`);
    throw error;
  }
}