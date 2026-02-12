import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  Logger,
  createLogger,
  type LogLevel,
  type ImportSummary,
  type SyncSummary,
  type CleanupSummary,
} from "./github.logger";

describe("github.logger", () => {
  let consoleLogSpy: ReturnType<typeof vi.spyOn>;
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;
  let consoleWarnSpy: ReturnType<typeof vi.spyOn>;
  let stdoutWriteSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleLogSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    consoleWarnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    stdoutWriteSpy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.clearAllTimers();
  });

  describe("Logger constructor", () => {
    it("should create logger with default level", () => {
      const logger = new Logger({ level: "default" });

      expect(logger.getLevel()).toBe("default");
    });

    it("should create logger with silent level", () => {
      const logger = new Logger({ level: "silent" });

      expect(logger.getLevel()).toBe("silent");
    });

    it("should create logger with verbose level", () => {
      const logger = new Logger({ level: "verbose" });

      expect(logger.getLevel()).toBe("verbose");
    });

    it("should create logger with debug level", () => {
      const logger = new Logger({ level: "debug" });

      expect(logger.getLevel()).toBe("debug");
    });

    it("should create logger with prefix", () => {
      const logger = new Logger({ level: "default", prefix: "[TEST]" });

      logger.info("message");

      expect(consoleLogSpy).toHaveBeenCalledWith("[TEST] message");
    });

    it("should create logger without prefix", () => {
      const logger = new Logger({ level: "default" });

      logger.info("message");

      expect(consoleLogSpy).toHaveBeenCalledWith("message");
    });
  });

  describe("setLevel and getLevel", () => {
    it("should change logger level", () => {
      const logger = new Logger({ level: "default" });

      logger.setLevel("debug");

      expect(logger.getLevel()).toBe("debug");
    });

    it("should affect output after level change", () => {
      const logger = new Logger({ level: "default" });

      logger.debug("before");
      expect(consoleLogSpy).not.toHaveBeenCalled();

      logger.setLevel("debug");
      logger.debug("after");

      expect(consoleLogSpy).toHaveBeenCalledWith("after");
    });
  });

  describe("level filtering", () => {
    describe("silent level", () => {
      it("should suppress all output", () => {
        const logger = new Logger({ level: "silent" });

        logger.info("info");
        logger.verbose("verbose");
        logger.debug("debug");
        logger.warn("warn");
        logger.error("error");

        expect(consoleLogSpy).not.toHaveBeenCalled();
        expect(consoleWarnSpy).not.toHaveBeenCalled();
        expect(consoleErrorSpy).not.toHaveBeenCalled();
      });

      it("should suppress import summary", () => {
        const logger = new Logger({ level: "silent" });
        const summary: ImportSummary = {
          configName: "test",
          repository: "owner/repo",
          filesProcessed: 5,
          filesUpdated: 2,
          filesUnchanged: 3,
          duration: 1000,
          status: "success",
        };

        logger.logImportSummary(summary);

        expect(consoleLogSpy).not.toHaveBeenCalled();
      });
    });

    describe("default level", () => {
      it("should show info, warn, and error", () => {
        const logger = new Logger({ level: "default" });

        logger.info("info message");
        logger.warn("warn message");
        logger.error("error message");

        expect(consoleLogSpy).toHaveBeenCalledWith("info message");
        expect(consoleWarnSpy).toHaveBeenCalledWith("warn message");
        expect(consoleErrorSpy).toHaveBeenCalledWith("error message");
      });

      it("should not show verbose or debug", () => {
        const logger = new Logger({ level: "default" });

        logger.verbose("verbose message");
        logger.debug("debug message");

        expect(consoleLogSpy).not.toHaveBeenCalled();
      });

      it("should show import summary", () => {
        const logger = new Logger({ level: "default" });
        const summary: ImportSummary = {
          configName: "test",
          repository: "owner/repo",
          filesProcessed: 5,
          filesUpdated: 2,
          filesUnchanged: 3,
          duration: 1000,
          status: "success",
        };

        logger.logImportSummary(summary);

        expect(consoleLogSpy).toHaveBeenCalled();
      });
    });

    describe("verbose level", () => {
      it("should show info, verbose, warn, and error", () => {
        const logger = new Logger({ level: "verbose" });

        logger.info("info message");
        logger.verbose("verbose message");
        logger.warn("warn message");
        logger.error("error message");

        expect(consoleLogSpy).toHaveBeenCalledWith("info message");
        expect(consoleLogSpy).toHaveBeenCalledWith("verbose message");
        expect(consoleWarnSpy).toHaveBeenCalledWith("warn message");
        expect(consoleErrorSpy).toHaveBeenCalledWith("error message");
      });

      it("should not show debug", () => {
        const logger = new Logger({ level: "verbose" });

        logger.debug("debug message");

        expect(consoleLogSpy).not.toHaveBeenCalled();
      });
    });

    describe("debug level", () => {
      it("should show all messages", () => {
        const logger = new Logger({ level: "debug" });

        logger.info("info message");
        logger.verbose("verbose message");
        logger.debug("debug message");
        logger.warn("warn message");
        logger.error("error message");

        expect(consoleLogSpy).toHaveBeenCalledWith("info message");
        expect(consoleLogSpy).toHaveBeenCalledWith("verbose message");
        expect(consoleLogSpy).toHaveBeenCalledWith("debug message");
        expect(consoleWarnSpy).toHaveBeenCalledWith("warn message");
        expect(consoleErrorSpy).toHaveBeenCalledWith("error message");
      });
    });
  });

  describe("logging methods", () => {
    describe("info", () => {
      it("should log at default level", () => {
        const logger = new Logger({ level: "default" });

        logger.info("test message");

        expect(consoleLogSpy).toHaveBeenCalledWith("test message");
      });
    });

    describe("verbose", () => {
      it("should log at verbose level", () => {
        const logger = new Logger({ level: "verbose" });

        logger.verbose("verbose message");

        expect(consoleLogSpy).toHaveBeenCalledWith("verbose message");
      });
    });

    describe("debug", () => {
      it("should log at debug level", () => {
        const logger = new Logger({ level: "debug" });

        logger.debug("debug message");

        expect(consoleLogSpy).toHaveBeenCalledWith("debug message");
      });
    });

    describe("warn", () => {
      it("should use console.warn", () => {
        const logger = new Logger({ level: "default" });

        logger.warn("warning message");

        expect(consoleWarnSpy).toHaveBeenCalledWith("warning message");
      });
    });

    describe("error", () => {
      it("should use console.error", () => {
        const logger = new Logger({ level: "default" });

        logger.error("error message");

        expect(consoleErrorSpy).toHaveBeenCalledWith("error message");
      });
    });

    describe("silent", () => {
      it("should not produce output", () => {
        const logger = new Logger({ level: "default" });

        logger.silent();

        expect(consoleLogSpy).not.toHaveBeenCalled();
      });
    });
  });

  describe("logImportSummary", () => {
    it("should log successful import summary", () => {
      const logger = new Logger({ level: "default" });
      const summary: ImportSummary = {
        configName: "test-config",
        repository: "owner/repo",
        ref: "main",
        filesProcessed: 10,
        filesUpdated: 5,
        filesUnchanged: 5,
        duration: 2500,
        status: "success",
      };

      logger.logImportSummary(summary);

      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining("test-config"));
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining("owner/repo@main"));
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining("10 processed"));
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining("5 updated"));
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining("2.5s"));
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining("✅"));
    });

    it("should log error import summary", () => {
      const logger = new Logger({ level: "default" });
      const summary: ImportSummary = {
        configName: "test-config",
        repository: "owner/repo",
        filesProcessed: 3,
        filesUpdated: 0,
        filesUnchanged: 3,
        duration: 500,
        status: "error",
        error: "API rate limit exceeded",
      };

      logger.logImportSummary(summary);

      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining("❌"));
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining("API rate limit exceeded"));
    });

    it("should log cancelled import summary", () => {
      const logger = new Logger({ level: "default" });
      const summary: ImportSummary = {
        configName: "test-config",
        repository: "owner/repo",
        filesProcessed: 2,
        filesUpdated: 2,
        filesUnchanged: 0,
        duration: 100,
        status: "cancelled",
      };

      logger.logImportSummary(summary);

      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining("🚫"));
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining("Cancelled"));
    });

    it("should log asset information when present", () => {
      const logger = new Logger({ level: "default" });
      const summary: ImportSummary = {
        configName: "test-config",
        repository: "owner/repo",
        filesProcessed: 5,
        filesUpdated: 2,
        filesUnchanged: 3,
        assetsDownloaded: 8,
        assetsCached: 12,
        duration: 1000,
        status: "success",
      };

      logger.logImportSummary(summary);

      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining("8 downloaded"));
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining("12 cached"));
    });

    it("should handle missing ref", () => {
      const logger = new Logger({ level: "default" });
      const summary: ImportSummary = {
        configName: "test-config",
        repository: "owner/repo",
        filesProcessed: 5,
        filesUpdated: 2,
        filesUnchanged: 3,
        duration: 1000,
        status: "success",
      };

      logger.logImportSummary(summary);

      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining("owner/repo"));
      expect(consoleLogSpy).not.toHaveBeenCalledWith(expect.stringContaining("@"));
    });

    it("should be suppressed at silent level", () => {
      const logger = new Logger({ level: "silent" });
      const summary: ImportSummary = {
        configName: "test",
        repository: "owner/repo",
        filesProcessed: 5,
        filesUpdated: 2,
        filesUnchanged: 3,
        duration: 1000,
        status: "success",
      };

      logger.logImportSummary(summary);

      expect(consoleLogSpy).not.toHaveBeenCalled();
    });
  });

  describe("logSyncSummary", () => {
    it("should log sync with changes", () => {
      const logger = new Logger({ level: "default" });
      const summary: SyncSummary = {
        added: 3,
        updated: 2,
        deleted: 1,
        unchanged: 5,
        duration: 150,
      };

      logger.logSyncSummary("test-config", summary);

      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining("3 added, 2 updated, 1 deleted"),
      );
    });

    it("should log sync with no changes", () => {
      const logger = new Logger({ level: "default" });
      const summary: SyncSummary = {
        added: 0,
        updated: 0,
        deleted: 0,
        unchanged: 5,
        duration: 50,
      };

      logger.logSyncSummary("test-config", summary);

      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining("No changes needed"));
    });
  });

  describe("logCleanupSummary", () => {
    it("should log cleanup with deletions", () => {
      const logger = new Logger({ level: "default" });
      const summary: CleanupSummary = {
        deleted: 5,
        duration: 100,
      };

      logger.logCleanupSummary("test-config", summary);

      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining("5 obsolete files deleted"),
      );
    });

    it("should use debug level when no deletions", () => {
      const logger = new Logger({ level: "default" });
      const summary: CleanupSummary = {
        deleted: 0,
        duration: 50,
      };

      logger.logCleanupSummary("test-config", summary);

      expect(consoleLogSpy).not.toHaveBeenCalled();
    });

    it("should show no cleanup message at debug level", () => {
      const logger = new Logger({ level: "debug" });
      const summary: CleanupSummary = {
        deleted: 0,
        duration: 50,
      };

      logger.logCleanupSummary("test-config", summary);

      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining("No cleanup needed"));
    });
  });

  describe("logFileProcessing", () => {
    it("should log file processing at verbose level", () => {
      const logger = new Logger({ level: "verbose" });

      logger.logFileProcessing("Processing", "path/to/file.md");

      expect(consoleLogSpy).toHaveBeenCalledWith("Processing: path/to/file.md");
    });

    it("should log with details", () => {
      const logger = new Logger({ level: "verbose" });

      logger.logFileProcessing("Updating", "path/to/file.md", "changed frontmatter");

      expect(consoleLogSpy).toHaveBeenCalledWith(
        "Updating: path/to/file.md - changed frontmatter",
      );
    });

    it("should not log at default level", () => {
      const logger = new Logger({ level: "default" });

      logger.logFileProcessing("Processing", "path/to/file.md");

      expect(consoleLogSpy).not.toHaveBeenCalled();
    });
  });

  describe("logAssetProcessing", () => {
    it("should log asset processing at verbose level", () => {
      const logger = new Logger({ level: "verbose" });

      logger.logAssetProcessing("downloading", "images/logo.png");

      expect(consoleLogSpy).toHaveBeenCalledWith("Asset downloading: images/logo.png");
    });

    it("should log with details", () => {
      const logger = new Logger({ level: "verbose" });

      logger.logAssetProcessing("cached", "images/logo.png", "using cache");

      expect(consoleLogSpy).toHaveBeenCalledWith(
        "Asset cached: images/logo.png - using cache",
      );
    });
  });

  describe("child", () => {
    it("should create child logger with concatenated prefix", () => {
      const parent = new Logger({ level: "default", prefix: "[PARENT]" });
      const child = parent.child("[CHILD]");

      child.info("message");

      expect(consoleLogSpy).toHaveBeenCalledWith("[PARENT][CHILD] message");
    });

    it("should create child logger with prefix when parent has none", () => {
      const parent = new Logger({ level: "default" });
      const child = parent.child("[CHILD]");

      child.info("message");

      expect(consoleLogSpy).toHaveBeenCalledWith("[CHILD] message");
    });

    it("should inherit parent log level", () => {
      const parent = new Logger({ level: "debug" });
      const child = parent.child("[CHILD]");

      expect(child.getLevel()).toBe("debug");
    });

    it("should maintain independent log levels after creation", () => {
      const parent = new Logger({ level: "default" });
      const child = parent.child("[CHILD]");

      parent.setLevel("silent");

      expect(child.getLevel()).toBe("default");
    });
  });

  describe("time", () => {
    it("should measure and log execution duration", async () => {
      vi.useFakeTimers();
      const logger = new Logger({ level: "verbose" });

      const promise = logger.time("test operation", async () => {
        await new Promise((resolve) => setTimeout(resolve, 100));
        return "result";
      });

      await vi.advanceTimersByTimeAsync(100);
      const result = await promise;

      expect(result).toBe("result");
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining("Completed: test operation"));
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining("100ms"));

      vi.useRealTimers();
    });

    it("should log start message at debug level", async () => {
      vi.useFakeTimers();
      const logger = new Logger({ level: "debug" });

      const promise = logger.time("test operation", async () => {
        await new Promise((resolve) => setTimeout(resolve, 50));
        return "result";
      });

      await vi.advanceTimersByTimeAsync(50);
      await promise;

      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining("Starting: test operation"));

      vi.useRealTimers();
    });

    it("should log error and rethrow on failure", async () => {
      vi.useFakeTimers();
      const logger = new Logger({ level: "default" });
      const error = new Error("test error");

      const promise = logger.time("failing operation", async () => {
        await new Promise((resolve) => setTimeout(resolve, 50));
        throw error;
      });
      promise.catch(() => {}); // prevent unhandled rejection before timer advance

      await vi.advanceTimersByTimeAsync(50);

      await expect(promise).rejects.toThrow("test error");
      expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining("Failed: failing operation"));
      expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining("test error"));

      vi.useRealTimers();
    });

    it("should include duration in error log", async () => {
      vi.useFakeTimers();
      const logger = new Logger({ level: "default" });

      const promise = logger.time("failing operation", async () => {
        await new Promise((resolve) => setTimeout(resolve, 200));
        throw new Error("failure");
      });
      promise.catch(() => {}); // prevent unhandled rejection before timer advance

      await vi.advanceTimersByTimeAsync(200);

      await expect(promise).rejects.toThrow();
      expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining("200ms"));

      vi.useRealTimers();
    });
  });

  describe("createLogger", () => {
    it("should create logger with default level", () => {
      const logger = createLogger();

      expect(logger.getLevel()).toBe("default");
    });

    it("should create logger with specified level", () => {
      const logger = createLogger("debug");

      expect(logger.getLevel()).toBe("debug");
    });

    it("should create logger with prefix", () => {
      const logger = createLogger("default", "[PREFIX]");

      logger.info("test");

      expect(consoleLogSpy).toHaveBeenCalledWith("[PREFIX] test");
    });

    it("should create logger without prefix", () => {
      const logger = createLogger("default");

      logger.info("test");

      expect(consoleLogSpy).toHaveBeenCalledWith("test");
    });
  });

  describe("spinner", () => {
    it("should not start spinner at silent level", () => {
      vi.useFakeTimers();
      const logger = new Logger({ level: "silent" });

      logger.startSpinner("Processing");

      expect(stdoutWriteSpy).not.toHaveBeenCalled();

      vi.useRealTimers();
    });

    it("should start and stop spinner", () => {
      vi.useFakeTimers();
      const logger = new Logger({ level: "default" });

      logger.startSpinner("Processing");
      expect(stdoutWriteSpy).toHaveBeenCalled();

      logger.stopSpinner("Done");

      vi.useRealTimers();
    });

    it("should display final message when stopping", () => {
      vi.useFakeTimers();
      const logger = new Logger({ level: "default" });

      logger.startSpinner("Processing");
      logger.stopSpinner("Completed");

      expect(stdoutWriteSpy).toHaveBeenCalledWith(expect.stringContaining("Completed"));

      vi.useRealTimers();
    });

    it("should clear line when stopping without message", () => {
      vi.useFakeTimers();
      const logger = new Logger({ level: "default" });

      logger.startSpinner("Processing");
      logger.stopSpinner();

      expect(stdoutWriteSpy).toHaveBeenCalledWith("\r\x1b[K");

      vi.useRealTimers();
    });
  });

  describe("withSpinner", () => {
    it("should execute function with spinner", async () => {
      vi.useFakeTimers();
      const logger = new Logger({ level: "default" });

      const promise = logger.withSpinner(
        "Processing",
        async () => {
          await new Promise((resolve) => setTimeout(resolve, 100));
          return "result";
        },
      );

      await vi.advanceTimersByTimeAsync(100);
      const result = await promise;

      expect(result).toBe("result");
      expect(stdoutWriteSpy).toHaveBeenCalled();

      vi.useRealTimers();
    });

    it("should show success message", async () => {
      vi.useFakeTimers();
      const logger = new Logger({ level: "default" });

      const promise = logger.withSpinner(
        "Processing",
        async () => "done",
        "Success!",
      );

      await vi.advanceTimersByTimeAsync(0);
      await promise;

      expect(stdoutWriteSpy).toHaveBeenCalledWith(expect.stringContaining("Success!"));

      vi.useRealTimers();
    });

    it("should show error message on failure", async () => {
      vi.useFakeTimers();
      const logger = new Logger({ level: "default" });

      const promise = logger.withSpinner(
        "Processing",
        async () => {
          throw new Error("failed");
        },
        undefined,
        "Error occurred",
      );
      promise.catch(() => {}); // prevent unhandled rejection before timer advance

      await vi.advanceTimersByTimeAsync(0);

      await expect(promise).rejects.toThrow("failed");
      expect(stdoutWriteSpy).toHaveBeenCalledWith(expect.stringContaining("Error occurred"));

      vi.useRealTimers();
    });

    it("should use default success message", async () => {
      vi.useFakeTimers();
      const logger = new Logger({ level: "default" });

      const promise = logger.withSpinner("🔄 Processing data", async () => "done");

      await vi.advanceTimersByTimeAsync(0);
      await promise;

      expect(stdoutWriteSpy).toHaveBeenCalledWith(expect.stringContaining("completed"));

      vi.useRealTimers();
    });

    it("should use default error message", async () => {
      vi.useFakeTimers();
      const logger = new Logger({ level: "default" });

      const promise = logger.withSpinner("⏳ Processing", async () => {
        throw new Error("error");
      });
      promise.catch(() => {}); // prevent unhandled rejection before timer advance

      await vi.advanceTimersByTimeAsync(0);

      await expect(promise).rejects.toThrow();
      expect(stdoutWriteSpy).toHaveBeenCalledWith(expect.stringContaining("failed"));

      vi.useRealTimers();
    });
  });
});
