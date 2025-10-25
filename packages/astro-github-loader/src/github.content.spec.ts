import { beforeEach, describe, it, expect, vi } from "vitest";
import { toCollectionEntry } from "./github.content.js";
import { Octokit } from "octokit";
import type { ImportOptions } from "./github.types.js";

/**
 * Test suite for Git Trees API optimization
 *
 * These tests verify that the new Git Trees API approach:
 * 1. Correctly discovers files matching include patterns
 * 2. Reduces API calls compared to recursive approach
 * 3. Works with the expected repository configuration
 *
 * These are unit tests with mocked API responses to test the optimization
 * logic without requiring network access.
 */
describe("Git Trees API Optimization", () => {
  let octokit: Octokit;

  // Mock commit data
  const mockCommit = {
    sha: "abc123def456",
    commit: {
      tree: {
        sha: "tree123abc456"
      },
      message: "Test commit",
      author: {
        name: "Test Author",
        email: "test@example.com",
        date: "2024-01-01T00:00:00Z"
      },
      committer: {
        name: "Test Committer",
        email: "test@example.com",
        date: "2024-01-01T00:00:00Z"
      }
    }
  };

  // Mock tree data representing a repository structure similar to algokit-cli
  const mockTreeData = {
    sha: "tree123abc456",
    url: "https://api.github.com/repos/test/repo/git/trees/tree123abc456",
    tree: [
      {
        path: "docs/algokit.md",
        mode: "100644",
        type: "blob",
        sha: "file1sha",
        size: 1234,
        url: "https://api.github.com/repos/test/repo/git/blobs/file1sha"
      },
      {
        path: "docs/features",
        mode: "040000",
        type: "tree",
        sha: "dir1sha",
        url: "https://api.github.com/repos/test/repo/git/trees/dir1sha"
      },
      {
        path: "docs/features/accounts.md",
        mode: "100644",
        type: "blob",
        sha: "file2sha",
        size: 2345,
        url: "https://api.github.com/repos/test/repo/git/blobs/file2sha"
      },
      {
        path: "docs/features/tasks.md",
        mode: "100644",
        type: "blob",
        sha: "file3sha",
        size: 3456,
        url: "https://api.github.com/repos/test/repo/git/blobs/file3sha"
      },
      {
        path: "docs/features/generate.md",
        mode: "100644",
        type: "blob",
        sha: "file4sha",
        size: 4567,
        url: "https://api.github.com/repos/test/repo/git/blobs/file4sha"
      },
      {
        path: "docs/cli/index.md",
        mode: "100644",
        type: "blob",
        sha: "file5sha",
        size: 5678,
        url: "https://api.github.com/repos/test/repo/git/blobs/file5sha"
      },
      {
        path: "README.md",
        mode: "100644",
        type: "blob",
        sha: "file6sha",
        size: 678,
        url: "https://api.github.com/repos/test/repo/git/blobs/file6sha"
      },
      {
        path: "package.json",
        mode: "100644",
        type: "blob",
        sha: "file7sha",
        size: 789,
        url: "https://api.github.com/repos/test/repo/git/blobs/file7sha"
      }
    ],
    truncated: false
  };

  beforeEach(() => {
    // Create Octokit instance
    octokit = new Octokit({ auth: "mock-token" });

    // Reset all mocks
    vi.restoreAllMocks();
  });

  describe("API call efficiency", () => {
    it("should use Git Trees API (2 calls) instead of recursive getContent (N calls)", async () => {
      // Mock the API calls
      const listCommitsMock = vi.spyOn(octokit.rest.repos, 'listCommits')
        .mockResolvedValue({
          data: [mockCommit],
          status: 200,
          url: '',
          headers: {}
        } as any);

      const getTreeMock = vi.spyOn(octokit.rest.git, 'getTree')
        .mockResolvedValue({
          data: mockTreeData,
          status: 200,
          url: '',
          headers: {}
        } as any);

      const getContentMock = vi.spyOn(octokit.rest.repos, 'getContent')
        .mockResolvedValue({
          data: [],
          status: 200,
          url: '',
          headers: {}
        } as any);

      // Mock fetch for file downloads
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers(),
        text: async () => "# Test Content\n\nThis is test markdown content."
      } as any);

      const testConfig: ImportOptions = {
        name: "Test Repo",
        owner: "algorandfoundation",
        repo: "algokit-cli",
        ref: "chore/content-fix",
        includes: [
          {
            pattern: "docs/{features/**/*.md,algokit.md}",
            basePath: "test-output",
          },
        ],
      };

      // Create minimal mock context with Astro-specific components
      const mockStore = new Map();
      const mockContext = {
        store: {
          set: (entry: any) => mockStore.set(entry.id, entry),
          get: (id: string) => mockStore.get(id),
          clear: () => mockStore.clear(),
          entries: () => mockStore.entries(),
          keys: () => mockStore.keys(),
          values: () => mockStore.values(),
        },
        meta: new Map(),
        logger: {
          info: vi.fn(),
          warn: vi.fn(),
          error: vi.fn(),
          debug: vi.fn(),
          verbose: vi.fn(),
          logFileProcessing: vi.fn(),
          logImportSummary: vi.fn(),
          withSpinner: async (msg: string, fn: () => Promise<any>) => await fn(),
          getLevel: () => 'default',
        },
        config: {},
        entryTypes: new Map([
          ['.md', {
            getEntryInfo: async ({ contents, fileUrl }: any) => ({
              body: contents,
              data: {}
            })
          }]
        ]),
        generateDigest: (content: string) => {
          // Simple hash function for testing
          return content.length.toString();
        },
        parseData: async (data: any) => data,
      };

      await toCollectionEntry({
        context: mockContext as any,
        octokit,
        options: testConfig,
      });

      // Verify Git Trees API is used
      expect(listCommitsMock).toHaveBeenCalledTimes(1);
      expect(listCommitsMock).toHaveBeenCalledWith(
        expect.objectContaining({
          owner: "algorandfoundation",
          repo: "algokit-cli",
          sha: "chore/content-fix",
          per_page: 1,
        })
      );

      expect(getTreeMock).toHaveBeenCalledTimes(1);
      expect(getTreeMock).toHaveBeenCalledWith(
        expect.objectContaining({
          owner: "algorandfoundation",
          repo: "algokit-cli",
          tree_sha: "tree123abc456",
          recursive: "true",
        })
      );

      // Verify getContent is NOT called (old recursive approach)
      expect(getContentMock).not.toHaveBeenCalled();

      console.log('✅ API Efficiency Test Results:');
      console.log(`   - listCommits calls: ${listCommitsMock.mock.calls.length} (expected: 1)`);
      console.log(`   - getTree calls: ${getTreeMock.mock.calls.length} (expected: 1)`);
      console.log(`   - getContent calls: ${getContentMock.mock.calls.length} (expected: 0)`);
      console.log(`   - Total API calls for discovery: ${listCommitsMock.mock.calls.length + getTreeMock.mock.calls.length}`);
      console.log(`   - 🎉 Optimization achieved: 2 calls instead of potentially 10+ recursive calls`);
    });
  });

  describe("file filtering", () => {
    it("should correctly filter files matching the glob pattern", async () => {
      const listCommitsMock = vi.spyOn(octokit.rest.repos, 'listCommits')
        .mockResolvedValue({
          data: [mockCommit],
          status: 200,
          url: '',
          headers: {}
        } as any);

      const getTreeMock = vi.spyOn(octokit.rest.git, 'getTree')
        .mockResolvedValue({
          data: mockTreeData,
          status: 200,
          url: '',
          headers: {}
        } as any);

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers(),
        text: async () => "# Test Content\n\nMockfile content."
      } as any);

      const testConfig: ImportOptions = {
        name: "Test filtering",
        owner: "algorandfoundation",
        repo: "algokit-cli",
        ref: "chore/content-fix",
        includes: [
          {
            pattern: "docs/{features/**/*.md,algokit.md}",
            basePath: "test-output",
          },
        ],
      };

      const mockStore = new Map();
      const mockContext = {
        store: {
          set: (entry: any) => {
            mockStore.set(entry.id, entry);
            return entry;
          },
          get: (id: string) => mockStore.get(id),
          clear: () => mockStore.clear(),
          entries: () => mockStore.entries(),
          keys: () => mockStore.keys(),
          values: () => mockStore.values(),
        },
        meta: new Map(),
        logger: {
          info: vi.fn(),
          warn: vi.fn(),
          error: vi.fn(),
          debug: vi.fn(),
          verbose: vi.fn(),
          logFileProcessing: vi.fn(),
          logImportSummary: vi.fn(),
          withSpinner: async (msg: string, fn: () => Promise<any>) => await fn(),
          getLevel: () => 'default',
        },
        config: {},
        entryTypes: new Map([['.md', { getEntryInfo: async ({ contents }: any) => ({ body: contents, data: {} }) }]]),
        generateDigest: (content: string) => content.length.toString(),
        parseData: async (data: any) => data,
      };

      const stats = await toCollectionEntry({
        context: mockContext as any,
        octokit,
        options: testConfig,
      });

      console.log('\n🔍 File Filtering Test Results:');
      console.log(`   - Pattern: docs/{features/**/*.md,algokit.md}`);
      console.log(`   - Files in tree: ${mockTreeData.tree.length}`);
      console.log(`   - Files processed: ${stats.processed}`);
      console.log(`   - Files matched: ${mockStore.size}`);

      // Based on our mock data, we should match:
      // - docs/algokit.md (explicit match)
      // - docs/features/accounts.md (matches features/**/*.md)
      // - docs/features/tasks.md (matches features/**/*.md)
      // - docs/features/generate.md (matches features/**/*.md)
      // Should NOT match:
      // - docs/cli/index.md (not in pattern)
      // - README.md (not in pattern)
      // - package.json (not in pattern)

      expect(stats.processed).toBe(4); // algokit.md + 3 features/*.md files
      expect(mockStore.size).toBe(4);

      // Verify correct files were stored
      const storedIds = Array.from(mockStore.keys());
      expect(storedIds).toContain('docs/algokit');
      expect(storedIds.some(id => id.includes('features'))).toBe(true);
      expect(storedIds).not.toContain('package');
      expect(storedIds).not.toContain('README');
    });

    it("should filter to match only specific file when pattern is exact", async () => {
      vi.spyOn(octokit.rest.repos, 'listCommits')
        .mockResolvedValue({ data: [mockCommit], status: 200, url: '', headers: {} } as any);

      vi.spyOn(octokit.rest.git, 'getTree')
        .mockResolvedValue({ data: mockTreeData, status: 200, url: '', headers: {} } as any);

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers(),
        text: async () => "# Single File Content"
      } as any);

      const testConfig: ImportOptions = {
        name: "Exact match test",
        owner: "test",
        repo: "repo",
        ref: "main",
        includes: [{
          pattern: "docs/algokit.md", // Exact file
          basePath: "test-output",
        }],
      };

      const mockStore = new Map();
      const mockContext = {
        store: {
          set: (entry: any) => mockStore.set(entry.id, entry),
          get: (id: string) => mockStore.get(id),
          clear: () => mockStore.clear(),
          entries: () => mockStore.entries(),
          keys: () => mockStore.keys(),
          values: () => mockStore.values(),
        },
        meta: new Map(),
        logger: {
          info: vi.fn(),
          warn: vi.fn(),
          error: vi.fn(),
          debug: vi.fn(),
          verbose: vi.fn(),
          logFileProcessing: vi.fn(),
          logImportSummary: vi.fn(),
          withSpinner: async (msg: string, fn: () => Promise<any>) => await fn(),
          getLevel: () => 'default',
        },
        config: {},
        entryTypes: new Map([['.md', { getEntryInfo: async ({ contents }: any) => ({ body: contents, data: {} }) }]]),
        generateDigest: (content: string) => content.length.toString(),
        parseData: async (data: any) => data,
      };

      const stats = await toCollectionEntry({
        context: mockContext as any,
        octokit,
        options: testConfig,
      });

      console.log('\n🎯 Exact Pattern Match Test:');
      console.log(`   - Pattern: docs/algokit.md`);
      console.log(`   - Files processed: ${stats.processed}`);
      console.log(`   - Expected: 1 file`);

      expect(stats.processed).toBe(1);
      expect(mockStore.size).toBe(1);
      expect(Array.from(mockStore.keys())[0]).toContain('algokit');
    });
  });

  describe("download URL construction", () => {
    it("should construct valid raw.githubusercontent.com URLs from tree data", async () => {
      vi.spyOn(octokit.rest.repos, 'listCommits')
        .mockResolvedValue({ data: [mockCommit], status: 200, url: '', headers: {} } as any);

      vi.spyOn(octokit.rest.git, 'getTree')
        .mockResolvedValue({ data: mockTreeData, status: 200, url: '', headers: {} } as any);

      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers(),
        text: async () => "# Content"
      } as any);
      global.fetch = fetchMock;

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

      const mockStore = new Map();
      const mockContext = {
        store: {
          set: (entry: any) => mockStore.set(entry.id, entry),
          get: (id: string) => mockStore.get(id),
          clear: () => mockStore.clear(),
          entries: () => mockStore.entries(),
          keys: () => mockStore.keys(),
          values: () => mockStore.values(),
        },
        meta: new Map(),
        logger: {
          info: vi.fn(),
          warn: vi.fn(),
          error: vi.fn(),
          debug: vi.fn(),
          verbose: vi.fn(),
          logFileProcessing: vi.fn(),
          logImportSummary: vi.fn(),
          withSpinner: async (msg: string, fn: () => Promise<any>) => await fn(),
          getLevel: () => 'default',
        },
        config: {},
        entryTypes: new Map([['.md', { getEntryInfo: async ({ contents }: any) => ({ body: contents, data: {} }) }]]),
        generateDigest: (content: string) => content.length.toString(),
        parseData: async (data: any) => data,
      };

      await toCollectionEntry({
        context: mockContext as any,
        octokit,
        options: testConfig,
      });

      // Find fetch calls to raw.githubusercontent.com
      const rawGithubCalls = fetchMock.mock.calls.filter(call => {
        const url = call[0]?.toString() || '';
        return url.includes('raw.githubusercontent.com');
      });

      console.log('\n🔗 URL Construction Test:');
      console.log(`   - Total fetch calls: ${fetchMock.mock.calls.length}`);
      console.log(`   - Calls to raw.githubusercontent.com: ${rawGithubCalls.length}`);

      expect(rawGithubCalls.length).toBeGreaterThan(0);

      const exampleUrl = rawGithubCalls[0][0]?.toString();
      console.log(`   - Example URL: ${exampleUrl}`);

      // Verify URL format: https://raw.githubusercontent.com/{owner}/{repo}/{commit_sha}/{file_path}
      expect(exampleUrl).toMatch(
        /^https:\/\/raw\.githubusercontent\.com\/algorandfoundation\/algokit-cli\/abc123def456\/docs\/algokit\.md$/
      );
    });
  });

  describe("real-world config simulation", () => {
    it("should handle the production algokit-cli config pattern correctly", async () => {
      vi.spyOn(octokit.rest.repos, 'listCommits')
        .mockResolvedValue({ data: [mockCommit], status: 200, url: '', headers: {} } as any);

      vi.spyOn(octokit.rest.git, 'getTree')
        .mockResolvedValue({ data: mockTreeData, status: 200, url: '', headers: {} } as any);

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers(),
        text: async () => "# Content"
      } as any);

      // This is the actual production config from content.config.ts
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

      const mockStore = new Map();
      const mockContext = {
        store: {
          set: (entry: any) => mockStore.set(entry.id, entry),
          get: (id: string) => mockStore.get(id),
          clear: () => mockStore.clear(),
          entries: () => mockStore.entries(),
          keys: () => mockStore.keys(),
          values: () => mockStore.values(),
        },
        meta: new Map(),
        logger: {
          info: vi.fn(),
          warn: vi.fn(),
          error: vi.fn(),
          debug: vi.fn(),
          verbose: vi.fn(),
          logFileProcessing: vi.fn(),
          logImportSummary: vi.fn(),
          withSpinner: async (msg: string, fn: () => Promise<any>) => await fn(),
          getLevel: () => 'default',
        },
        config: {},
        entryTypes: new Map([['.md', { getEntryInfo: async ({ contents }: any) => ({ body: contents, data: {} }) }]]),
        generateDigest: (content: string) => content.length.toString(),
        parseData: async (data: any) => data,
      };

      const stats = await toCollectionEntry({
        context: mockContext as any,
        octokit,
        options: productionConfig,
      });

      console.log('\n📋 Production Config Test:');
      console.log(`   - Pattern 1: docs/{features/**/*.md,algokit.md}`);
      console.log(`   - Pattern 2: docs/cli/index.md`);
      console.log(`   - Files processed: ${stats.processed}`);
      console.log(`   - Expected files:`);
      console.log(`     • docs/algokit.md → overview.md (from pattern 1)`);
      console.log(`     • docs/features/accounts.md → accounts.md (from pattern 1)`);
      console.log(`     • docs/features/tasks.md → tasks.md (from pattern 1)`);
      console.log(`     • docs/features/generate.md → generate.md (from pattern 1)`);
      console.log(`     • docs/cli/index.md → index.md (from pattern 2)`);

      // Should match 4 files from pattern 1 + 1 file from pattern 2
      expect(stats.processed).toBe(5);

      const storedIds = Array.from(mockStore.keys());
      console.log(`   - Stored IDs:`, storedIds);

      // Verify expected files are stored
      expect(storedIds.some(id => id.includes('overview'))).toBe(true); // algokit.md mapped to overview
      expect(storedIds.filter(id => id.includes('features')).length).toBe(3); // 3 features files
      expect(storedIds.some(id => id.includes('cli') && id.includes('index'))).toBe(true); // cli/index.md
    });
  });
});
