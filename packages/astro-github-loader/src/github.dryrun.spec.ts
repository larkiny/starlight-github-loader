import { beforeEach, describe, it, expect, vi, afterEach } from "vitest";
import {
  createConfigId,
  loadImportState,
  updateImportState,
  getLatestCommitInfo,
} from "./github.dryrun.js";
import type { ImportOptions, StateFile } from "./github.dryrun.js";
import { createMockOctokit, MOCK_COMMIT } from "./test-helpers.js";
import { promises as fs } from "node:fs";
import { existsSync } from "node:fs";

// Mock the filesystem modules
vi.mock("node:fs/promises");
vi.mock("node:fs");

describe("github.dryrun", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("createConfigId", () => {
    it("should generate a stable string from config (owner/repo@ref)", () => {
      const config: ImportOptions = {
        name: "Test Repo",
        owner: "test-owner",
        repo: "test-repo",
        ref: "main",
        includes: [],
      };

      const id = createConfigId(config);

      expect(id).toBe("test-owner/test-repo@main");
    });

    it("should default to main branch when ref is not specified", () => {
      const config: ImportOptions = {
        name: "Test Repo",
        owner: "algorand",
        repo: "docs",
        includes: [],
      };

      const id = createConfigId(config);

      expect(id).toBe("algorand/docs@main");
    });

    it("should use custom stateKey when provided", () => {
      const config: ImportOptions = {
        owner: "algorandfoundation",
        repo: "puya",
        ref: "devportal",
        stateKey: "puya-legacy-guides",
        includes: [],
      };

      expect(createConfigId(config)).toBe("puya-legacy-guides");
    });

    it("should handle different refs correctly", () => {
      const config: ImportOptions = {
        name: "Test Repo",
        owner: "user",
        repo: "project",
        ref: "develop",
        includes: [],
      };

      const id = createConfigId(config);

      expect(id).toBe("user/project@develop");
    });
  });

  describe("loadImportState", () => {
    it("should return default state when file doesn't exist", async () => {
      vi.mocked(existsSync).mockReturnValue(false);

      const state = await loadImportState("/test-dir");

      expect(state).toEqual({
        imports: {},
        lastChecked: expect.any(String),
      });
      expect(vi.mocked(fs.readFile)).not.toHaveBeenCalled();
    });

    it("should return parsed content when file has valid JSON", async () => {
      vi.mocked(existsSync).mockReturnValue(true);

      const validState: StateFile = {
        imports: {
          "owner/repo@main": {
            name: "Test Repo",
            repoId: "owner/repo@main",
            lastCommitSha: "abc123",
            lastImported: "2024-01-01T00:00:00Z",
            ref: "main",
          },
        },
        lastChecked: "2024-01-01T00:00:00Z",
      };

      vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify(validState));

      const state = await loadImportState("/test-dir");

      expect(state).toEqual(validState);
      expect(vi.mocked(fs.readFile)).toHaveBeenCalledWith(
        "/test-dir/.github-import-state.json",
        "utf-8",
      );
    });

    it("should return default state when file has malformed JSON", async () => {
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(fs.readFile).mockResolvedValue("{ invalid json }");

      const mockLogger = {
        warn: vi.fn(),
        info: vi.fn(),
        error: vi.fn(),
        debug: vi.fn(),
      };

      const state = await loadImportState("/test-dir", mockLogger as any);

      expect(state).toEqual({
        imports: {},
        lastChecked: expect.any(String),
      });
      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining("Failed to load import state"),
      );
    });

    it("should return default state when file has valid JSON but wrong shape (no imports key)", async () => {
      vi.mocked(existsSync).mockReturnValue(true);

      // Valid JSON but missing the imports key
      const invalidShape = {
        lastChecked: "2024-01-01T00:00:00Z",
        // missing imports key
      };

      vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify(invalidShape));

      const mockLogger = {
        warn: vi.fn(),
        info: vi.fn(),
        error: vi.fn(),
        debug: vi.fn(),
      };

      const state = await loadImportState("/test-dir", mockLogger as any);

      expect(state).toEqual({
        imports: {},
        lastChecked: expect.any(String),
      });
      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining("Malformed state file"),
      );
    });

    it("should return default state when parsed value is null", async () => {
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(fs.readFile).mockResolvedValue("null");

      const mockLogger = {
        warn: vi.fn(),
        info: vi.fn(),
        error: vi.fn(),
        debug: vi.fn(),
      };

      const state = await loadImportState("/test-dir", mockLogger as any);

      expect(state).toEqual({
        imports: {},
        lastChecked: expect.any(String),
      });
      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining("Malformed state file"),
      );
    });

    it("should return default state when imports is not an object", async () => {
      vi.mocked(existsSync).mockReturnValue(true);

      const invalidImports = {
        imports: "not an object",
        lastChecked: "2024-01-01T00:00:00Z",
      };

      vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify(invalidImports));

      const mockLogger = {
        warn: vi.fn(),
        info: vi.fn(),
        error: vi.fn(),
        debug: vi.fn(),
      };

      const state = await loadImportState("/test-dir", mockLogger as any);

      expect(state).toEqual({
        imports: {},
        lastChecked: expect.any(String),
      });
      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining("Malformed state file"),
      );
    });

    it("should use console.warn when logger is not provided", async () => {
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(fs.readFile).mockResolvedValue("{ invalid json }");

      const consoleWarnSpy = vi
        .spyOn(console, "warn")
        .mockImplementation(() => {});

      await loadImportState("/test-dir");

      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining("Failed to load import state"),
      );

      consoleWarnSpy.mockRestore();
    });
  });

  describe("updateImportState", () => {
    it("should write state file with updated config", async () => {
      vi.mocked(existsSync).mockReturnValue(false);
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);

      const config: ImportOptions = {
        name: "Test Repo",
        owner: "test-owner",
        repo: "test-repo",
        ref: "main",
        includes: [],
      };

      await updateImportState("/test-dir", config, "abc123");

      expect(vi.mocked(fs.writeFile)).toHaveBeenCalledWith(
        "/test-dir/.github-import-state.json",
        expect.stringContaining("test-owner/test-repo@main"),
        "utf-8",
      );

      // Verify the written content structure
      const writtenContent = vi.mocked(fs.writeFile).mock.calls[0][1] as string;
      const parsedContent = JSON.parse(writtenContent);

      expect(parsedContent.imports["test-owner/test-repo@main"]).toEqual({
        name: "Test Repo",
        repoId: "test-owner/test-repo@main",
        lastCommitSha: "abc123",
        lastImported: expect.any(String),
        ref: "main",
      });
    });

    it("should merge with existing state when updating", async () => {
      vi.mocked(existsSync).mockReturnValue(true);

      const existingState: StateFile = {
        imports: {
          "other/repo@main": {
            name: "Other Repo",
            repoId: "other/repo@main",
            lastCommitSha: "xyz789",
            lastImported: "2024-01-01T00:00:00Z",
            ref: "main",
          },
        },
        lastChecked: "2024-01-01T00:00:00Z",
      };

      vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify(existingState));
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);

      const config: ImportOptions = {
        name: "New Repo",
        owner: "new-owner",
        repo: "new-repo",
        ref: "develop",
        includes: [],
      };

      await updateImportState("/test-dir", config, "newsha456");

      const writtenContent = vi.mocked(fs.writeFile).mock.calls[0][1] as string;
      const parsedContent = JSON.parse(writtenContent);

      // Should have both the existing and new entries
      expect(parsedContent.imports["other/repo@main"]).toBeDefined();
      expect(parsedContent.imports["new-owner/new-repo@develop"]).toEqual({
        name: "New Repo",
        repoId: "new-owner/new-repo@develop",
        lastCommitSha: "newsha456",
        lastImported: expect.any(String),
        ref: "develop",
      });
    });

    it("should handle undefined commitSha", async () => {
      vi.mocked(existsSync).mockReturnValue(false);
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);

      const config: ImportOptions = {
        name: "Test Repo",
        owner: "test-owner",
        repo: "test-repo",
        ref: "main",
        includes: [],
      };

      await updateImportState("/test-dir", config);

      const writtenContent = vi.mocked(fs.writeFile).mock.calls[0][1] as string;
      const parsedContent = JSON.parse(writtenContent);

      expect(
        parsedContent.imports["test-owner/test-repo@main"].lastCommitSha,
      ).toBeUndefined();
    });

    it("should use console.warn when logger is not provided and write fails", async () => {
      vi.mocked(existsSync).mockReturnValue(false);
      vi.mocked(fs.writeFile).mockRejectedValue(
        new Error("Permission denied"),
      );

      const consoleWarnSpy = vi
        .spyOn(console, "warn")
        .mockImplementation(() => {});

      const config: ImportOptions = {
        name: "Test Repo",
        owner: "test-owner",
        repo: "test-repo",
        ref: "main",
        includes: [],
      };

      await updateImportState("/test-dir", config, "abc123");

      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining("Failed to save import state"),
      );

      consoleWarnSpy.mockRestore();
    });
  });

  describe("getLatestCommitInfo", () => {
    it("should fetch latest commit with mocked Octokit", async () => {
      const { octokit, spies } = createMockOctokit();

      const config: ImportOptions = {
        name: "Test Repo",
        owner: "test-owner",
        repo: "test-repo",
        ref: "main",
        includes: [],
      };

      const commitInfo = await getLatestCommitInfo(octokit, config);

      expect(commitInfo).toEqual({
        sha: MOCK_COMMIT.sha,
        message: "Test commit",
        date: "2024-01-01T00:00:00Z",
      });

      expect(spies.listCommitsSpy).toHaveBeenCalledWith({
        owner: "test-owner",
        repo: "test-repo",
        sha: "main",
        per_page: 1,
        request: { signal: undefined },
      });
    });

    it("should return null when no commits are found", async () => {
      const { octokit, spies } = createMockOctokit();

      // Mock empty commits array
      spies.listCommitsSpy.mockResolvedValue({
        data: [],
        status: 200,
        url: "",
        headers: {},
      } as any);

      const config: ImportOptions = {
        name: "Test Repo",
        owner: "test-owner",
        repo: "test-repo",
        ref: "main",
        includes: [],
      };

      const commitInfo = await getLatestCommitInfo(octokit, config);

      expect(commitInfo).toBeNull();
    });

    it("should throw error when repository is not found (404)", async () => {
      const { octokit, spies } = createMockOctokit();

      // Mock 404 error
      const error = new Error("Not found");
      (error as any).status = 404;
      spies.listCommitsSpy.mockRejectedValue(error);

      const config: ImportOptions = {
        name: "Test Repo",
        owner: "test-owner",
        repo: "nonexistent-repo",
        ref: "main",
        includes: [],
      };

      await expect(getLatestCommitInfo(octokit, config)).rejects.toThrow(
        "Repository not found: test-owner/nonexistent-repo",
      );
    });

    it("should rethrow other API errors", async () => {
      const { octokit, spies } = createMockOctokit();

      // Mock generic error
      const error = new Error("API rate limit exceeded");
      (error as any).status = 429;
      spies.listCommitsSpy.mockRejectedValue(error);

      const config: ImportOptions = {
        name: "Test Repo",
        owner: "test-owner",
        repo: "test-repo",
        ref: "main",
        includes: [],
      };

      await expect(getLatestCommitInfo(octokit, config)).rejects.toThrow(
        "API rate limit exceeded",
      );
    });

    it("should use default ref when not specified", async () => {
      const { octokit, spies } = createMockOctokit();

      const config: ImportOptions = {
        name: "Test Repo",
        owner: "test-owner",
        repo: "test-repo",
        includes: [],
      };

      await getLatestCommitInfo(octokit, config);

      expect(spies.listCommitsSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          sha: "main",
        }),
      );
    });

    it("should extract only first line of commit message", async () => {
      const { octokit, spies } = createMockOctokit({
        commitData: {
          ...MOCK_COMMIT,
          commit: {
            ...MOCK_COMMIT.commit,
            message: "First line of commit\n\nAdditional details\nMore details",
          },
        },
      });

      const config: ImportOptions = {
        name: "Test Repo",
        owner: "test-owner",
        repo: "test-repo",
        ref: "main",
        includes: [],
      };

      const commitInfo = await getLatestCommitInfo(octokit, config);

      expect(commitInfo?.message).toBe("First line of commit");
    });

    it("should handle AbortSignal", async () => {
      const { octokit, spies } = createMockOctokit();
      const abortController = new AbortController();

      const config: ImportOptions = {
        name: "Test Repo",
        owner: "test-owner",
        repo: "test-repo",
        ref: "main",
        includes: [],
      };

      const abortError = new Error("Aborted");
      (abortError as any).name = "AbortError";
      spies.listCommitsSpy.mockRejectedValue(abortError);

      abortController.abort();

      await expect(
        getLatestCommitInfo(octokit, config, abortController.signal),
      ).rejects.toThrow("Aborted");
    });

    it("should use committer date if available, otherwise author date", async () => {
      const { octokit } = createMockOctokit({
        commitData: {
          ...MOCK_COMMIT,
          commit: {
            ...MOCK_COMMIT.commit,
            committer: {
              name: "Committer",
              email: "committer@example.com",
              date: "2024-02-01T00:00:00Z",
            },
            author: {
              name: "Author",
              email: "author@example.com",
              date: "2024-01-01T00:00:00Z",
            },
          },
        },
      });

      const config: ImportOptions = {
        name: "Test Repo",
        owner: "test-owner",
        repo: "test-repo",
        ref: "main",
        includes: [],
      };

      const commitInfo = await getLatestCommitInfo(octokit, config);

      // Should use committer date
      expect(commitInfo?.date).toBe("2024-02-01T00:00:00Z");
    });

    it("should fallback to current date when no dates available", async () => {
      const { octokit } = createMockOctokit({
        commitData: {
          ...MOCK_COMMIT,
          commit: {
            ...MOCK_COMMIT.commit,
            committer: {
              name: "Committer",
              email: "committer@example.com",
              date: undefined as any,
            },
            author: {
              name: "Author",
              email: "author@example.com",
              date: undefined as any,
            },
          },
        },
      });

      const config: ImportOptions = {
        name: "Test Repo",
        owner: "test-owner",
        repo: "test-repo",
        ref: "main",
        includes: [],
      };

      const commitInfo = await getLatestCommitInfo(octokit, config);

      // Should use current date (ISO string format)
      expect(commitInfo?.date).toMatch(
        /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/,
      );
    });
  });
});
