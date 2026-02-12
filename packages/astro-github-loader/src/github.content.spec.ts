import { beforeEach, describe, it, expect, vi } from "vitest";
import { toCollectionEntry, resolveAssetConfig } from "./github.content.js";
import type { ImportOptions, VersionConfig } from "./github.types.js";
import { createMockContext, createMockOctokit, mockFetch } from "./test-helpers.js";

describe("Git Trees API Optimization", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe("API call efficiency", () => {
    it("should use Git Trees API (2 calls) instead of recursive getContent (N calls)", async () => {
      const { octokit, spies } = createMockOctokit();
      mockFetch();
      const ctx = createMockContext();

      const testConfig: ImportOptions = {
        name: "Test Repo",
        owner: "algorandfoundation",
        repo: "algokit-cli",
        ref: "chore/content-fix",
        includes: [{
          pattern: "docs/{features/**/*.md,algokit.md}",
          basePath: "test-output",
        }],
      };

      await toCollectionEntry({
        context: ctx as any,
        octokit,
        options: testConfig,
      });

      expect(spies.listCommitsSpy).toHaveBeenCalledTimes(1);
      expect(spies.listCommitsSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          owner: "algorandfoundation",
          repo: "algokit-cli",
          sha: "chore/content-fix",
          per_page: 1,
        })
      );

      expect(spies.getTreeSpy).toHaveBeenCalledTimes(1);
      expect(spies.getTreeSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          owner: "algorandfoundation",
          repo: "algokit-cli",
          tree_sha: "tree123abc456",
          recursive: "true",
        })
      );

      // getContent should NOT be called (old recursive approach)
      expect(spies.getContentSpy).not.toHaveBeenCalled();
    });
  });

  describe("file filtering", () => {
    it("should correctly filter files matching the glob pattern", async () => {
      const { octokit } = createMockOctokit();
      mockFetch("# Test Content\n\nMockfile content.");
      const ctx = createMockContext();

      const testConfig: ImportOptions = {
        name: "Test filtering",
        owner: "algorandfoundation",
        repo: "algokit-cli",
        ref: "chore/content-fix",
        includes: [{
          pattern: "docs/{features/**/*.md,algokit.md}",
          basePath: "test-output",
        }],
      };

      const stats = await toCollectionEntry({
        context: ctx as any,
        octokit,
        options: testConfig,
      });

      // Should match: docs/algokit.md + 3 features/*.md files
      expect(stats.processed).toBe(4);
      expect(ctx._store.size).toBe(4);

      const storedIds = Array.from(ctx._store.keys());
      expect(storedIds).toContain('docs/algokit');
      expect(storedIds.some(id => id.includes('features'))).toBe(true);
      expect(storedIds).not.toContain('package');
      expect(storedIds).not.toContain('README');
    });

    it("should filter to match only specific file when pattern is exact", async () => {
      const { octokit } = createMockOctokit();
      mockFetch("# Single File Content");
      const ctx = createMockContext();

      const testConfig: ImportOptions = {
        name: "Exact match test",
        owner: "test",
        repo: "repo",
        ref: "main",
        includes: [{
          pattern: "docs/algokit.md",
          basePath: "test-output",
        }],
      };

      const stats = await toCollectionEntry({
        context: ctx as any,
        octokit,
        options: testConfig,
      });

      expect(stats.processed).toBe(1);
      expect(ctx._store.size).toBe(1);
      expect(Array.from(ctx._store.keys())[0]).toContain('algokit');
    });
  });

  describe("download URL construction", () => {
    it("should construct valid raw.githubusercontent.com URLs from tree data", async () => {
      const { octokit } = createMockOctokit();
      const fetchMock = mockFetch("# Content");
      const ctx = createMockContext();

      const testConfig: ImportOptions = {
        name: "URL test",
        owner: "algorandfoundation",
        repo: "algokit-cli",
        ref: "chore/content-fix",
        includes: [{
          pattern: "docs/algokit.md",
          basePath: "test-output",
        }],
      };

      await toCollectionEntry({
        context: ctx as any,
        octokit,
        options: testConfig,
      });

      const rawGithubCalls = fetchMock.mock.calls.filter(call => {
        const url = call[0]?.toString() || '';
        return url.includes('raw.githubusercontent.com');
      });

      expect(rawGithubCalls.length).toBeGreaterThan(0);
      expect(rawGithubCalls[0][0]?.toString()).toMatch(
        /^https:\/\/raw\.githubusercontent\.com\/algorandfoundation\/algokit-cli\/abc123def456\/docs\/algokit\.md$/
      );
    });
  });

  describe("real-world config simulation", () => {
    it("should handle the production algokit-cli config pattern correctly", async () => {
      const { octokit } = createMockOctokit();
      mockFetch("# Content");
      const ctx = createMockContext();

      const productionConfig: ImportOptions = {
        name: "AlgoKit CLI Docs",
        owner: "algorandfoundation",
        repo: "algokit-cli",
        ref: "chore/content-fix",
        includes: [
          {
            pattern: "docs/{features/**/*.md,algokit.md}",
            basePath: "src/content/docs/algokit/cli",
            pathMappings: {
              "docs/features/": "",
              "docs/algokit.md": "overview.md",
            },
          },
          {
            pattern: "docs/cli/index.md",
            basePath: "src/content/docs/reference/algokit-cli/",
            pathMappings: {
              "docs/cli/index.md": "index.md",
            },
          },
        ],
      };

      const stats = await toCollectionEntry({
        context: ctx as any,
        octokit,
        options: productionConfig,
      });

      // 4 files from pattern 1 + 1 file from pattern 2
      expect(stats.processed).toBe(5);

      const storedIds = Array.from(ctx._store.keys());
      expect(storedIds.some(id => id.includes('overview'))).toBe(true);
      expect(storedIds.filter(id => id.includes('features')).length).toBe(3);
      expect(storedIds.some(id => id.includes('cli') && id.includes('index'))).toBe(true);
    });
  });

  describe("ImportOptions new fields (language, versions)", () => {
    it("should accept language and versions fields without errors", async () => {
      const { octokit } = createMockOctokit();
      mockFetch("# Content with versioned config");
      const ctx = createMockContext();

      const testConfig: ImportOptions = {
        name: "AlgoKit Utils TS",
        owner: "algorandfoundation",
        repo: "algokit-utils-ts",
        ref: "docs-dist",
        language: "TypeScript",
        versions: [
          { slug: "latest", label: "Latest" },
          { slug: "v8.0.0", label: "v8.0.0" },
        ],
        includes: [{
          pattern: "docs/algokit.md",
          basePath: "test-output",
        }],
      };

      const stats = await toCollectionEntry({
        context: ctx as any,
        octokit,
        options: testConfig,
      });

      expect(stats.processed).toBe(1);
      expect(ctx._store.size).toBe(1);
    });

    it("should make language and versions accessible in transform context", async () => {
      const { octokit } = createMockOctokit();
      mockFetch("# Content to transform");
      const ctx = createMockContext();

      let capturedOptions: ImportOptions | undefined;

      const testConfig: ImportOptions = {
        name: "Transform context test",
        owner: "test",
        repo: "repo",
        ref: "main",
        language: "Python",
        versions: [{ slug: "latest", label: "Latest" }],
        includes: [{
          pattern: "docs/algokit.md",
          basePath: "test-output",
        }],
        transforms: [
          (content, context) => {
            capturedOptions = context.options;
            return content;
          },
        ],
      };

      await toCollectionEntry({
        context: ctx as any,
        octokit,
        options: testConfig,
      });

      expect(capturedOptions).toBeDefined();
      expect(capturedOptions!.language).toBe("Python");
      expect(capturedOptions!.versions).toEqual([{ slug: "latest", label: "Latest" }]);
    });

    it("should work without language and versions (backward compatible)", async () => {
      const { octokit } = createMockOctokit();
      mockFetch("# Content without new fields");
      const ctx = createMockContext();

      const testConfig: ImportOptions = {
        name: "No new fields",
        owner: "test",
        repo: "repo",
        ref: "main",
        includes: [{
          pattern: "docs/algokit.md",
          basePath: "test-output",
        }],
      };

      const stats = await toCollectionEntry({
        context: ctx as any,
        octokit,
        options: testConfig,
      });

      expect(stats.processed).toBe(1);
    });
  });
});

describe("resolveAssetConfig", () => {
  it("should return explicit assetsPath and assetsBaseUrl when both are provided", () => {
    const options: ImportOptions = {
      owner: "test",
      repo: "repo",
      assetsPath: "src/assets/custom",
      assetsBaseUrl: "/assets/custom",
      includes: [{
        pattern: "docs/**/*.md",
        basePath: "src/content/docs/lib",
      }],
    };

    const result = resolveAssetConfig(options, "docs/guide.md");

    expect(result).toEqual({
      assetsPath: "src/assets/custom",
      assetsBaseUrl: "/assets/custom",
    });
  });

  it("should derive co-located defaults from basePath when assetsPath/assetsBaseUrl are omitted", () => {
    const options: ImportOptions = {
      owner: "test",
      repo: "repo",
      includes: [{
        pattern: "docs/**/*.md",
        basePath: "src/content/docs/algokit-utils/typescript/v8.0.0",
      }],
    };

    const result = resolveAssetConfig(options, "docs/guide.md");

    expect(result).toEqual({
      assetsPath: "src/content/docs/algokit-utils/typescript/v8.0.0/assets",
      assetsBaseUrl: "./assets",
    });
  });

  it("should return null when only assetsPath is set (misconfiguration)", () => {
    const options: ImportOptions = {
      owner: "test",
      repo: "repo",
      assetsPath: "src/assets/custom",
      // assetsBaseUrl intentionally omitted
      includes: [{
        pattern: "docs/**/*.md",
        basePath: "src/content/docs/lib",
      }],
    };

    const result = resolveAssetConfig(options, "docs/guide.md");
    expect(result).toBeNull();
  });

  it("should return null when only assetsBaseUrl is set (misconfiguration)", () => {
    const options: ImportOptions = {
      owner: "test",
      repo: "repo",
      // assetsPath intentionally omitted
      assetsBaseUrl: "/assets/custom",
      includes: [{
        pattern: "docs/**/*.md",
        basePath: "src/content/docs/lib",
      }],
    };

    const result = resolveAssetConfig(options, "docs/guide.md");
    expect(result).toBeNull();
  });

  it("should return null when file does not match any include pattern", () => {
    const options: ImportOptions = {
      owner: "test",
      repo: "repo",
      includes: [{
        pattern: "docs/**/*.md",
        basePath: "src/content/docs/lib",
      }],
    };

    const result = resolveAssetConfig(options, "src/main.ts");
    expect(result).toBeNull();
  });

  it("should return null when no includes are defined and no explicit config", () => {
    const options: ImportOptions = {
      owner: "test",
      repo: "repo",
    };

    const result = resolveAssetConfig(options, "docs/guide.md");
    // No includes means shouldIncludeFile returns matchedPattern: null
    expect(result).toBeNull();
  });

  it("should use the correct basePath when multiple patterns exist", () => {
    const options: ImportOptions = {
      owner: "test",
      repo: "repo",
      includes: [
        {
          pattern: "docs/guides/**/*.md",
          basePath: "src/content/docs/guides",
        },
        {
          pattern: "docs/api/**/*.md",
          basePath: "src/content/docs/reference/api",
        },
      ],
    };

    // File matches the second pattern
    const result = resolveAssetConfig(options, "docs/api/endpoints.md");

    expect(result).toEqual({
      assetsPath: "src/content/docs/reference/api/assets",
      assetsBaseUrl: "./assets",
    });
  });
});
