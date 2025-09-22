import { promises as fs } from "node:fs";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { generateId, generatePath, shouldIncludeFile } from "./github.content.js";
import type { ImportOptions, LoaderContext, SyncStats } from "./github.types.js";

const SLEEP_BETWEEN_DELETES = 10; // ms between file deletions

/**
 * Sleep utility for pacing file operations
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Gets all files that should exist locally based on remote repository state
 */
async function getExpectedFiles(
  octokit: any,
  options: ImportOptions,
  signal?: AbortSignal
): Promise<Set<string>> {
  const { owner, repo, ref = "main" } = options;
  const expectedFiles = new Set<string>();

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
          const localPath = generatePath(data.path, includeResult.included ? includeResult.matchedPattern : null, options);
          // Convert to absolute path for consistent comparison
          const absolutePath = localPath.startsWith('/') ? localPath : join(process.cwd(), localPath);
          expectedFiles.add(absolutePath);
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
            const localPath = generatePath(itemPath, includeResult.included ? includeResult.matchedPattern : null, options);
            // Convert to absolute path for consistent comparison
            const absolutePath = localPath.startsWith('/') ? localPath : join(process.cwd(), localPath);
            expectedFiles.add(absolutePath);
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
  return expectedFiles;
}

/**
 * Gets all existing local files in the basePath as absolute paths
 */
async function getExistingFiles(basePath: string): Promise<Set<string>> {
  const existingFiles = new Set<string>();
  
  if (!existsSync(basePath)) {
    return existingFiles;
  }

  async function walkDirectory(dirPath: string) {
    try {
      const entries = await fs.readdir(dirPath, { withFileTypes: true });
      
      for (const entry of entries) {
        const fullPath = join(dirPath, entry.name);
        
        if (entry.isDirectory()) {
          // Skip manifest files and other system directories
          if (!entry.name.startsWith('.')) {
            await walkDirectory(fullPath);
          }
        } else if (entry.isFile()) {
          // Skip manifest and system files
          if (!entry.name.startsWith('.')) {
            existingFiles.add(fullPath);
          }
        }
      }
    } catch (error) {
      console.warn(`Failed to read directory ${dirPath}:`, error);
    }
  }

  await walkDirectory(basePath);
  return existingFiles;
}

/**
 * Performs selective cleanup of obsolete files
 */
export async function performSelectiveCleanup(
  config: ImportOptions,
  context: LoaderContext,
  octokit: any,
  signal?: AbortSignal
): Promise<SyncStats> {
  const startTime = Date.now();
  const { logger } = context;
  const configName = config.name || `${config.owner}/${config.repo}`;
  
  if (!config.includes || config.includes.length === 0) {
    // No cleanup needed if no include patterns specified
    return {
      added: 0,
      updated: 0,
      deleted: 0,
      unchanged: 0,
      duration: Date.now() - startTime
    };
  }

  logger.debug(`Starting selective cleanup for ${configName}`);

  try {
    // Get existing local files from all include pattern base paths
    const allExistingFiles = new Set<string>();
    for (const includePattern of config.includes) {
      const existingFiles = await getExistingFiles(includePattern.basePath);
      existingFiles.forEach(file => allExistingFiles.add(file));
    }
    
    // If no existing files, skip cleanup (fresh import)
    if (allExistingFiles.size === 0) {
      logger.debug(`No existing files found in any base paths, skipping cleanup`);
      return {
        added: 0,
        updated: 0,
        deleted: 0,
        unchanged: 0,
        duration: Date.now() - startTime
      };
    }
    
    // Get expected files from remote repository
    const expectedFiles = await getExpectedFiles(octokit, config, signal);
    
    // Find files to delete (exist locally but not in remote)
    const filesToDelete: string[] = [];
    for (const existingFile of allExistingFiles) {
      if (!expectedFiles.has(existingFile)) {
        filesToDelete.push(existingFile);
      }
    }
    
    // Delete obsolete files with pacing
    let deletedCount = 0;
    for (const filePath of filesToDelete) {
      try {
        if (existsSync(filePath)) {
          await fs.unlink(filePath);
          logger.debug(`Deleted obsolete file: ${filePath}`);
          deletedCount++;
          await sleep(SLEEP_BETWEEN_DELETES);
        }
      } catch (error) {
        logger.warn(`Failed to delete ${filePath}: ${error}`);
      }
    }
    
    const duration = Date.now() - startTime;
    const stats: SyncStats = {
      added: 0, // Will be counted by main sync process
      updated: 0, // Will be counted by main sync process  
      deleted: deletedCount,
      unchanged: 0, // Will be counted by main sync process
      duration
    };

    if (deletedCount > 0) {
      logger.info(`Cleanup completed for ${configName}: ${deletedCount} obsolete files deleted (${duration}ms)`);
    } else {
      logger.debug(`No cleanup needed for ${configName} (${duration}ms)`);
    }

    return stats;
    
  } catch (error: any) {
    if (signal?.aborted) {
      logger.info(`Cleanup cancelled for ${configName}`);
      throw error;
    }
    
    const duration = Date.now() - startTime;
    logger.error(`Cleanup failed for ${configName} after ${duration}ms: ${error}`);
    // Don't throw - let the main sync process continue
    return {
      added: 0,
      updated: 0, 
      deleted: 0,
      unchanged: 0,
      duration
    };
  }
}