/**
 * Multi-level logging system for astro-github-loader
 */

export type LogLevel = 'silent' | 'default' | 'verbose' | 'debug';

export interface LoggerOptions {
  level: LogLevel;
  prefix?: string;
}

export interface ImportSummary {
  configName: string;
  repository: string;
  ref?: string;
  filesProcessed: number;
  filesUpdated: number;
  filesUnchanged: number;
  assetsDownloaded?: number;
  assetsCached?: number;
  duration: number;
  status: 'success' | 'error' | 'cancelled';
  error?: string;
}

export interface SyncSummary {
  added: number;
  updated: number;
  deleted: number;
  unchanged: number;
  duration: number;
}

export interface CleanupSummary {
  deleted: number;
  duration: number;
}

/**
 * Centralized logger with configurable verbosity levels and spinner support for long-running operations
 */
export class Logger {
  private level: LogLevel;
  private prefix: string;
  private spinnerInterval?: NodeJS.Timeout;
  private spinnerChars = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
  private spinnerIndex = 0;
  private spinnerStartTime?: number;

  constructor(options: LoggerOptions) {
    this.level = options.level;
    this.prefix = options.prefix || '';
  }

  /**
   * Set the logging level
   */
  setLevel(level: LogLevel): void {
    this.level = level;
  }

  /**
   * Get the current logging level
   */
  getLevel(): LogLevel {
    return this.level;
  }

  /**
   * Check if a specific level should be logged
   */
  private shouldLog(level: LogLevel): boolean {
    const levels: Record<LogLevel, number> = {
      silent: 0,
      default: 1,
      verbose: 2,
      debug: 3,
    };

    return levels[this.level] >= levels[level];
  }

  /**
   * Format message with prefix
   */
  private formatMessage(message: string): string {
    return this.prefix ? `${this.prefix} ${message}` : message;
  }

  /**
   * Silent level - no output
   */
  silent(): void {
    // Intentionally empty
  }

  /**
   * Default level - summary information only
   */
  info(message: string): void {
    if (this.shouldLog('default')) {
      console.log(this.formatMessage(message));
    }
  }

  /**
   * Verbose level - detailed operation information
   */
  verbose(message: string): void {
    if (this.shouldLog('verbose')) {
      console.log(this.formatMessage(message));
    }
  }

  /**
   * Debug level - all information including diagnostics
   */
  debug(message: string): void {
    if (this.shouldLog('debug')) {
      console.log(this.formatMessage(message));
    }
  }

  /**
   * Error - always shown unless silent
   */
  error(message: string): void {
    if (this.shouldLog('default')) {
      console.error(this.formatMessage(message));
    }
  }

  /**
   * Warning - shown at default level and above
   */
  warn(message: string): void {
    if (this.shouldLog('default')) {
      console.warn(this.formatMessage(message));
    }
  }

  /**
   * Log structured import summary (default level)
   */
  logImportSummary(summary: ImportSummary): void {
    if (!this.shouldLog('default')) return;

    const statusIcon = summary.status === 'success' ? '✅' : summary.status === 'error' ? '❌' : '🚫';

    this.info('');
    this.info(`📊 Import Summary: ${summary.configName}`);
    this.info(`├─ Repository: ${summary.repository}${summary.ref ? `@${summary.ref}` : ''}`);
    this.info(`├─ Files: ${summary.filesProcessed} processed, ${summary.filesUpdated} updated, ${summary.filesUnchanged} unchanged`);

    if (summary.assetsDownloaded !== undefined || summary.assetsCached !== undefined) {
      const downloaded = summary.assetsDownloaded || 0;
      const cached = summary.assetsCached || 0;
      this.info(`├─ Assets: ${downloaded} downloaded, ${cached} cached`);
    }

    this.info(`├─ Duration: ${(summary.duration / 1000).toFixed(1)}s`);
    this.info(`└─ Status: ${statusIcon} ${summary.status === 'success' ? 'Success' : summary.status === 'error' ? `Error: ${summary.error}` : 'Cancelled'}`);
    this.info('');
  }

  /**
   * Log sync operation summary (default level)
   */
  logSyncSummary(configName: string, summary: SyncSummary): void {
    if (!this.shouldLog('default')) return;

    if (summary.added > 0 || summary.updated > 0 || summary.deleted > 0) {
      this.info(`Sync completed for ${configName}: ${summary.added} added, ${summary.updated} updated, ${summary.deleted} deleted (${summary.duration}ms)`);
    } else {
      this.info(`No changes needed for ${configName} (${summary.duration}ms)`);
    }
  }

  /**
   * Log cleanup operation summary (default level)
   */
  logCleanupSummary(configName: string, summary: CleanupSummary): void {
    if (!this.shouldLog('default')) return;

    if (summary.deleted > 0) {
      this.info(`Cleanup completed for ${configName}: ${summary.deleted} obsolete files deleted (${summary.duration}ms)`);
    } else {
      this.debug(`No cleanup needed for ${configName} (${summary.duration}ms)`);
    }
  }

  /**
   * Log file-level processing (verbose level)
   */
  logFileProcessing(action: string, filePath: string, details?: string): void {
    const message = details ? `${action}: ${filePath} - ${details}` : `${action}: ${filePath}`;
    this.verbose(message);
  }

  /**
   * Log asset processing (verbose level)
   */
  logAssetProcessing(action: string, assetPath: string, details?: string): void {
    const message = details ? `Asset ${action}: ${assetPath} - ${details}` : `Asset ${action}: ${assetPath}`;
    this.verbose(message);
  }

  /**
   * Create a child logger with additional prefix
   */
  child(prefix: string): Logger {
    return new Logger({
      level: this.level,
      prefix: this.prefix ? `${this.prefix}${prefix}` : prefix,
    });
  }

  /**
   * Time a function execution and log the result
   */
  async time<T>(label: string, fn: () => Promise<T>): Promise<T> {
    const startTime = Date.now();
    this.debug(`⏱️  Starting: ${label}`);

    try {
      const result = await fn();
      const duration = Date.now() - startTime;
      this.verbose(`✅ Completed: ${label} (${duration}ms)`);
      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      this.error(`❌ Failed: ${label} (${duration}ms): ${error}`);
      throw error;
    }
  }

  /**
   * Format duration in human-readable format
   */
  private formatDuration(seconds: number): string {
    if (seconds < 60) {
      return `${seconds}s`;
    } else if (seconds < 3600) {
      const mins = Math.floor(seconds / 60);
      const secs = seconds % 60;
      return `${mins}m ${secs}s`;
    } else {
      const hours = Math.floor(seconds / 3600);
      const mins = Math.floor((seconds % 3600) / 60);
      return `${hours}h ${mins}m`;
    }
  }

  /**
   * Start a spinner with duration timer for long-running operations
   */
  startSpinner(message: string = 'Processing...'): void {
    if (this.level === 'silent') return;

    this.spinnerStartTime = Date.now();
    this.spinnerIndex = 0;

    const updateSpinner = () => {
      const elapsed = Math.floor((Date.now() - this.spinnerStartTime!) / 1000);
      const spinner = this.spinnerChars[this.spinnerIndex];
      const duration = this.formatDuration(elapsed);
      const formattedMessage = this.formatMessage(`${message} ${spinner} (${duration})`);
      process.stdout.write(`\r${formattedMessage}`);
      this.spinnerIndex = (this.spinnerIndex + 1) % this.spinnerChars.length;
    };

    // Initial display
    updateSpinner();

    // Update every 100ms
    this.spinnerInterval = setInterval(updateSpinner, 100);
  }

  /**
   * Stop the spinner and optionally show a final message
   */
  stopSpinner(finalMessage?: string): void {
    if (this.spinnerInterval) {
      clearInterval(this.spinnerInterval);
      this.spinnerInterval = undefined;
    }

    if (finalMessage && this.spinnerStartTime) {
      const totalTime = Math.floor((Date.now() - this.spinnerStartTime) / 1000);
      const duration = this.formatDuration(totalTime);
      const formattedMessage = this.formatMessage(`${finalMessage} (${duration})`);
      process.stdout.write(`\r${formattedMessage}\n`);
    } else if (finalMessage) {
      const formattedMessage = this.formatMessage(finalMessage);
      process.stdout.write(`\r${formattedMessage}\n`);
    } else {
      process.stdout.write('\r\x1b[K'); // Clear the line
    }

    this.spinnerStartTime = undefined;
  }

  /**
   * Execute a function with spinner feedback
   */
  async withSpinner<T>(message: string, fn: () => Promise<T>, successMessage?: string, errorMessage?: string): Promise<T> {
    this.startSpinner(message);
    try {
      const result = await fn();
      this.stopSpinner(successMessage || `✅ ${message.replace(/^[🔄⏳]?\s*/, '')} completed`);
      return result;
    } catch (error) {
      this.stopSpinner(errorMessage || `❌ ${message.replace(/^[🔄⏳]?\s*/, '')} failed`);
      throw error;
    }
  }
}

/**
 * Create a logger instance with the specified level
 */
export function createLogger(level: LogLevel = 'default', prefix?: string): Logger {
  return new Logger({ level, prefix });
}