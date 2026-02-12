/**
 * Shared test helpers for astro-github-loader test suite.
 * Provides factory functions for creating mock Astro loader contexts,
 * Octokit instances with pre-configured spies, and common fixtures.
 */
import { vi } from "vitest";
import { Octokit } from "octokit";
import type { ImportOptions } from "./github.types.js";

/**
 * Creates a mock Astro LoaderContext with all required properties.
 * The returned store is a real Map wrapped in the store interface,
 * so tests can inspect stored entries directly.
 */
export function createMockContext() {
  const store = new Map<string, any>();
  const meta = new Map<string, string>();

  return {
    store: {
      set: (entry: any) => {
        store.set(entry.id, entry);
        return entry;
      },
      get: (id: string) => store.get(id),
      delete: (id: string) => store.delete(id),
      clear: () => store.clear(),
      entries: () => store.entries(),
      keys: () => store.keys(),
      values: () => store.values(),
    },
    meta,
    logger: {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
      verbose: vi.fn(),
      logFileProcessing: vi.fn(),
      logImportSummary: vi.fn(),
      logAssetProcessing: vi.fn(),
      withSpinner: async (_msg: string, fn: () => Promise<any>) => await fn(),
      getLevel: () => "default" as const,
    },
    config: {},
    entryTypes: new Map([
      [
        ".md",
        {
          getEntryInfo: async ({
            contents,
          }: {
            contents: string;
            fileUrl: URL;
          }) => ({
            body: contents,
            data: {},
          }),
        },
      ],
    ]),
    generateDigest: (content: string) => String(content.length),
    parseData: async (data: any) => data,
    /** Direct access to the underlying store Map for assertions */
    _store: store,
    /** Direct access to the underlying meta Map for assertions */
    _meta: meta,
  };
}

/** Standard mock commit used across tests */
export const MOCK_COMMIT = {
  sha: "abc123def456",
  commit: {
    tree: { sha: "tree123abc456" },
    message: "Test commit",
    author: {
      name: "Test Author",
      email: "test@example.com",
      date: "2024-01-01T00:00:00Z",
    },
    committer: {
      name: "Test Committer",
      email: "test@example.com",
      date: "2024-01-01T00:00:00Z",
    },
  },
};

/** Mock tree data representing a typical repository structure */
export const MOCK_TREE_DATA = {
  sha: "tree123abc456",
  url: "https://api.github.com/repos/test/repo/git/trees/tree123abc456",
  tree: [
    {
      path: "docs/algokit.md",
      mode: "100644",
      type: "blob",
      sha: "file1sha",
      size: 1234,
      url: "https://api.github.com/repos/test/repo/git/blobs/file1sha",
    },
    {
      path: "docs/features",
      mode: "040000",
      type: "tree",
      sha: "dir1sha",
      url: "https://api.github.com/repos/test/repo/git/trees/dir1sha",
    },
    {
      path: "docs/features/accounts.md",
      mode: "100644",
      type: "blob",
      sha: "file2sha",
      size: 2345,
      url: "https://api.github.com/repos/test/repo/git/blobs/file2sha",
    },
    {
      path: "docs/features/tasks.md",
      mode: "100644",
      type: "blob",
      sha: "file3sha",
      size: 3456,
      url: "https://api.github.com/repos/test/repo/git/blobs/file3sha",
    },
    {
      path: "docs/features/generate.md",
      mode: "100644",
      type: "blob",
      sha: "file4sha",
      size: 4567,
      url: "https://api.github.com/repos/test/repo/git/blobs/file4sha",
    },
    {
      path: "docs/cli/index.md",
      mode: "100644",
      type: "blob",
      sha: "file5sha",
      size: 5678,
      url: "https://api.github.com/repos/test/repo/git/blobs/file5sha",
    },
    {
      path: "README.md",
      mode: "100644",
      type: "blob",
      sha: "file6sha",
      size: 678,
      url: "https://api.github.com/repos/test/repo/git/blobs/file6sha",
    },
    {
      path: "package.json",
      mode: "100644",
      type: "blob",
      sha: "file7sha",
      size: 789,
      url: "https://api.github.com/repos/test/repo/git/blobs/file7sha",
    },
  ],
  truncated: false,
};

/**
 * Creates an Octokit instance with mocked API methods for listCommits and getTree.
 * Returns both the instance and the spies for assertions.
 */
export function createMockOctokit(options?: {
  treeData?: typeof MOCK_TREE_DATA;
  commitData?: typeof MOCK_COMMIT;
}) {
  const octokit = new Octokit({ auth: "mock-token" });
  const commit = options?.commitData ?? MOCK_COMMIT;
  const tree = options?.treeData ?? MOCK_TREE_DATA;

  const listCommitsSpy = vi
    .spyOn(octokit.rest.repos, "listCommits")
    .mockResolvedValue({
      data: [commit],
      status: 200,
      url: "",
      headers: {},
    } as any);

  const getTreeSpy = vi.spyOn(octokit.rest.git, "getTree").mockResolvedValue({
    data: tree,
    status: 200,
    url: "",
    headers: {},
  } as any);

  const getContentSpy = vi
    .spyOn(octokit.rest.repos, "getContent")
    .mockResolvedValue({ data: [], status: 200, url: "", headers: {} } as any);

  return {
    octokit,
    spies: { listCommitsSpy, getTreeSpy, getContentSpy },
  };
}

/**
 * Sets up a global fetch mock that returns markdown content.
 * Returns the mock for assertions.
 */
export function mockFetch(
  content: string = "# Test Content\n\nThis is test markdown content.",
) {
  const fetchMock = vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    headers: new Headers(),
    text: async () => content,
  } as any);
  global.fetch = fetchMock;
  return fetchMock;
}
