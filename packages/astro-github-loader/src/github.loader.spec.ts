import { describe, it, expect } from "vitest";
import { githubLoader } from "./github.loader.js";
import {
  globalLinkTransform,
  type ImportedFile,
} from "./github.link-transform.js";
import { createLogger, type ImportSummary } from "./github.logger.js";
import type { ImportOptions, VersionConfig } from "./github.types.js";
import { Octokit } from "octokit";

describe("githubLoader", () => {
  it("should return a loader object", () => {
    const octokit = new Octokit({ auth: "mock-token" });
    const result = githubLoader({ octokit, configs: [] });
    expect(result).toHaveProperty("name", "github-loader");
    expect(result).toHaveProperty("load");
    expect(typeof result.load).toBe("function");
  });

  it("should accept configs with language and versions fields", () => {
    const octokit = new Octokit({ auth: "mock-token" });
    const configs: ImportOptions[] = [
      {
        name: "AlgoKit Utils TS",
        owner: "algorandfoundation",
        repo: "algokit-utils-ts",
        ref: "docs-dist",
        language: "TypeScript",
        versions: [
          { slug: "latest", label: "Latest" },
          { slug: "v8.0.0", label: "v8.0.0" },
        ],
        includes: [
          {
            pattern: "docs/**/*.md",
            basePath: "src/content/docs/docs/algokit-utils/typescript",
          },
        ],
      },
    ];

    // Should not throw when constructing the loader with new fields
    const result = githubLoader({ octokit, configs });
    expect(result).toHaveProperty("name", "github-loader");
  });

  describe("context-aware link transformations", () => {
    it("should handle relative links from API files with contextFilter", () => {
      const testFiles: ImportedFile[] = [
        {
          id: "api-readme",
          sourcePath: "docs/code/README.md",
          targetPath:
            "src/content/docs/reference/algokit-utils-ts/api/README.md",
          content: "Check out the [modules](modules/) for more info.",
          linkContext: {
            sourcePath: "docs/code/README.md",
            targetPath:
              "src/content/docs/reference/algokit-utils-ts/api/README.md",
            basePath: "src/content/docs/reference/algokit-utils-ts/api",
            pathMappings: { "docs/code/": "" },
          },
        },
        {
          id: "modules-index",
          sourcePath: "docs/code/modules/index.md",
          targetPath:
            "src/content/docs/reference/algokit-utils-ts/api/modules/index.md",
          content: "This is the modules index.",
          linkContext: {
            sourcePath: "docs/code/modules/index.md",
            targetPath:
              "src/content/docs/reference/algokit-utils-ts/api/modules/index.md",
            basePath: "src/content/docs/reference/algokit-utils-ts/api",
            pathMappings: { "docs/code/": "" },
          },
        },
      ];

      const result = globalLinkTransform(testFiles, {
        stripPrefixes: ["src/content/docs"],
        linkMappings: [
          {
            contextFilter: (context) =>
              context.sourcePath.startsWith("docs/code/"),
            relativeLinks: true,
            pattern: /.*/,
            replacement: "",
            global: false,
          },
        ],
      });

      expect(result[0].content).toContain(
        "[modules](/reference/algokit-utils-ts/api/modules/)",
      );
    });
  });

  describe("logging system", () => {
    it("should create logger with different levels", () => {
      const silentLogger = createLogger("silent");
      const defaultLogger = createLogger("default");
      const verboseLogger = createLogger("verbose");
      const debugLogger = createLogger("debug");

      expect(silentLogger.getLevel()).toBe("silent");
      expect(defaultLogger.getLevel()).toBe("default");
      expect(verboseLogger.getLevel()).toBe("verbose");
      expect(debugLogger.getLevel()).toBe("debug");
    });

    it("should format import summary without throwing", () => {
      const logger = createLogger("default");
      const summary: ImportSummary = {
        configName: "Test Config",
        repository: "test/repo",
        ref: "main",
        filesProcessed: 10,
        filesUpdated: 5,
        filesUnchanged: 5,
        assetsDownloaded: 3,
        assetsCached: 2,
        duration: 1500,
        status: "success",
      };

      expect(() => logger.logImportSummary(summary)).not.toThrow();
    });
  });
});
