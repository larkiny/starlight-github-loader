import { beforeEach, describe, it, expect, vi } from "vitest";
import { fileURLToPath, pathToFileURL } from "node:url";
import { syncFile, storeProcessedFile } from "./github.storage.js";
import { createMockContext } from "./test-helpers.js";

vi.mock("node:fs", async () => {
  const actual = await vi.importActual("node:fs");
  return {
    ...actual,
    existsSync: vi.fn(() => false),
    promises: {
      mkdir: vi.fn(),
      writeFile: vi.fn(),
    },
  };
});

// Import the mocked fs after vi.mock so we can control return values per test
import { existsSync, promises as fs } from "node:fs";

const mockedExistsSync = existsSync as ReturnType<typeof vi.fn>;
const mockedMkdir = fs.mkdir as ReturnType<typeof vi.fn>;
const mockedWriteFile = fs.writeFile as ReturnType<typeof vi.fn>;

const mockFile = {
  sourcePath: "docs/guide.md",
  targetPath: "src/content/docs/guide.md",
  content: "# Guide\nContent here",
  id: "docs/guide",
};

describe("syncFile", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    mockedExistsSync.mockReturnValue(false);
    mockedMkdir.mockResolvedValue(undefined);
    mockedWriteFile.mockResolvedValue(undefined);
  });

  it("creates directory and writes file when directory does not exist", async () => {
    await syncFile("some/nested/dir/file.md", "content");

    expect(mockedExistsSync).toHaveBeenCalledWith("some/nested/dir");
    expect(mockedMkdir).toHaveBeenCalledWith("some/nested/dir", {
      recursive: true,
    });
    expect(mockedWriteFile).toHaveBeenCalledWith(
      "some/nested/dir/file.md",
      "content",
      "utf-8",
    );
  });

  it("skips mkdir when directory already exists", async () => {
    mockedExistsSync.mockReturnValue(true);

    await syncFile("existing/dir/file.md", "content");

    expect(mockedExistsSync).toHaveBeenCalledWith("existing/dir");
    expect(mockedMkdir).not.toHaveBeenCalled();
    expect(mockedWriteFile).toHaveBeenCalledWith(
      "existing/dir/file.md",
      "content",
      "utf-8",
    );
  });

  it("skips mkdir when path has no directory component", async () => {
    await syncFile("file.md", "content");

    // dir is "" which is falsy, so existsSync should not be called for dir check
    expect(mockedMkdir).not.toHaveBeenCalled();
    expect(mockedWriteFile).toHaveBeenCalledWith(
      "file.md",
      "content",
      "utf-8",
    );
  });

  it("writes content to the specified path", async () => {
    const longContent = "# Title\n\nParagraph with **bold** and _italic_.";
    await syncFile("output/test.md", longContent);

    expect(mockedWriteFile).toHaveBeenCalledWith(
      "output/test.md",
      longContent,
      "utf-8",
    );
  });
});

describe("storeProcessedFile", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    mockedExistsSync.mockReturnValue(false);
    mockedMkdir.mockResolvedValue(undefined);
    mockedWriteFile.mockResolvedValue(undefined);
  });

  it("stores a basic entry without getRenderFunction or contentModuleTypes", async () => {
    const ctx = createMockContext();

    const result = await storeProcessedFile(mockFile, ctx as any, false);

    const stored = ctx._store.get("docs/guide");
    expect(stored).toBeDefined();
    expect(stored.id).toBe("docs/guide");
    expect(stored.body).toBe(mockFile.content);
    expect(stored.filePath).toBe(mockFile.targetPath);
    expect(stored.digest).toBe(String(mockFile.content.length));
    expect(stored.rendered).toBeUndefined();
    expect(stored.deferredRender).toBeUndefined();
    expect(result).toEqual({
      id: "docs/guide",
      filePath: "src/content/docs/guide.md",
    });
  });

  it("stores entry with rendered content when getRenderFunction is present", async () => {
    const ctx = createMockContext();
    ctx.entryTypes.set(".md", {
      getEntryInfo: async ({ contents }: any) => ({
        body: contents,
        data: {},
      }),
      getRenderFunction: async () => async () => ({
        html: "<p>rendered</p>",
      }),
    });

    await storeProcessedFile(mockFile, ctx as any, false);

    const stored = ctx._store.get("docs/guide");
    expect(stored.rendered).toEqual({ html: "<p>rendered</p>" });
  });

  it("logs error and stores undefined rendered when getRenderFunction throws", async () => {
    const ctx = createMockContext();
    ctx.entryTypes.set(".md", {
      getEntryInfo: async ({ contents }: any) => ({
        body: contents,
        data: {},
      }),
      getRenderFunction: async () => async () => {
        throw new Error("render failed");
      },
    });

    await storeProcessedFile(mockFile, ctx as any, false);

    expect(ctx.logger.error).toHaveBeenCalledWith(
      expect.stringContaining("render failed"),
    );
    const stored = ctx._store.get("docs/guide");
    expect(stored).toBeDefined();
    expect(stored.rendered).toBeUndefined();
  });

  it("sets deferredRender when entry type has contentModuleTypes", async () => {
    const ctx = createMockContext();
    ctx.entryTypes.set(".md", {
      getEntryInfo: async ({ contents }: any) => ({
        body: contents,
        data: {},
      }),
      contentModuleTypes: "some types",
    });

    await storeProcessedFile(mockFile, ctx as any, false);

    const stored = ctx._store.get("docs/guide");
    expect(stored.deferredRender).toBe(true);
    expect(stored.rendered).toBeUndefined();
  });

  it("deletes existing entry before setting when clear is true", async () => {
    const ctx = createMockContext();
    // Pre-populate the store with an existing entry
    ctx.store.set({
      id: "docs/guide",
      data: {},
      body: "old content",
      filePath: "old/path.md",
      digest: "0",
    });

    const deleteSpy = vi.spyOn(ctx.store, "delete");

    await storeProcessedFile(mockFile, ctx as any, true);

    expect(deleteSpy).toHaveBeenCalledWith("docs/guide");
    const stored = ctx._store.get("docs/guide");
    expect(stored.body).toBe(mockFile.content);
  });

  it("does not call delete when clear is true but entry does not exist", async () => {
    const ctx = createMockContext();
    const deleteSpy = vi.spyOn(ctx.store, "delete");

    await storeProcessedFile(mockFile, ctx as any, true);

    expect(deleteSpy).not.toHaveBeenCalled();
    const stored = ctx._store.get("docs/guide");
    expect(stored).toBeDefined();
  });

  it("skips writing file to disk when file already exists", async () => {
    const ctx = createMockContext();
    const expectedFileUrl = pathToFileURL(mockFile.targetPath);
    mockedExistsSync.mockImplementation((path: string) => {
      return path === fileURLToPath(expectedFileUrl);
    });

    await storeProcessedFile(mockFile, ctx as any, false);

    expect(mockedWriteFile).not.toHaveBeenCalled();
    // Entry should still be stored
    expect(ctx._store.get("docs/guide")).toBeDefined();
  });

  it("writes file to disk when file does not exist", async () => {
    const ctx = createMockContext();
    mockedExistsSync.mockReturnValue(false);

    await storeProcessedFile(mockFile, ctx as any, false);

    expect(mockedWriteFile).toHaveBeenCalled();
    expect(ctx.logger.verbose).toHaveBeenCalledWith(
      expect.stringContaining("Writing docs/guide"),
    );
  });

  it("throws when no entry type is found for the file extension", async () => {
    const ctx = createMockContext();
    const unknownFile = {
      ...mockFile,
      sourcePath: "docs/data.yaml",
    };

    await expect(
      storeProcessedFile(unknownFile, ctx as any, false),
    ).rejects.toThrow("No entry type found");
  });

  it("warns and throws when source path has no extension", async () => {
    const ctx = createMockContext();
    const noExtFile = {
      ...mockFile,
      sourcePath: "Makefile",
    };

    // "Makefile" split by "." yields ["Makefile"], .at(-1) = "Makefile"
    // entryTypes won't have ".Makefile", so it throws
    await expect(
      storeProcessedFile(noExtFile, ctx as any, false),
    ).rejects.toThrow("No entry type found");
  });

  it("returns id and filePath on success", async () => {
    const ctx = createMockContext();

    const result = await storeProcessedFile(mockFile, ctx as any, false);

    expect(result).toEqual({
      id: "docs/guide",
      filePath: "src/content/docs/guide.md",
    });
  });

  it("falls back to tmp.md when sourcePath is empty", async () => {
    const ctx = createMockContext();
    const fileWithoutSource = {
      ...mockFile,
      sourcePath: "",
    };

    // Empty sourcePath falls back to "tmp.md", which resolves to .md entry type
    const result = await storeProcessedFile(
      fileWithoutSource,
      ctx as any,
      false,
    );

    expect(result).toEqual({
      id: "docs/guide",
      filePath: "src/content/docs/guide.md",
    });
  });

  it("uses file content for digest generation", async () => {
    const ctx = createMockContext();
    const digestSpy = vi.fn((content: string) => `digest-${content.length}`);
    ctx.generateDigest = digestSpy;

    await storeProcessedFile(mockFile, ctx as any, false);

    expect(digestSpy).toHaveBeenCalledWith(mockFile.content);
    const stored = ctx._store.get("docs/guide");
    expect(stored.digest).toBe(`digest-${mockFile.content.length}`);
  });

  it("logs debug message for existing entry update", async () => {
    const ctx = createMockContext();
    // Pre-populate so it's an update
    ctx.store.set({
      id: "docs/guide",
      data: {},
      body: "old",
      filePath: "old.md",
      digest: "0",
    });

    await storeProcessedFile(mockFile, ctx as any, false);

    expect(ctx.logger.debug).toHaveBeenCalledWith(
      expect.stringContaining("updating"),
    );
  });

  it("logs debug message for new entry addition", async () => {
    const ctx = createMockContext();

    await storeProcessedFile(mockFile, ctx as any, false);

    expect(ctx.logger.debug).toHaveBeenCalledWith(
      expect.stringContaining("adding"),
    );
  });

  it("passes file content and fileUrl to getEntryInfo", async () => {
    const ctx = createMockContext();
    const getEntryInfoSpy = vi.fn(async ({ contents }: any) => ({
      body: contents,
      data: { title: "Test" },
    }));
    ctx.entryTypes.set(".md", { getEntryInfo: getEntryInfoSpy });

    await storeProcessedFile(mockFile, ctx as any, false);

    expect(getEntryInfoSpy).toHaveBeenCalledWith({
      contents: mockFile.content,
      fileUrl: pathToFileURL(mockFile.targetPath),
    });
    const stored = ctx._store.get("docs/guide");
    expect(stored.body).toBe(mockFile.content);
  });

  it("passes config to getRenderFunction", async () => {
    const ctx = createMockContext();
    const mockConfig = { root: "/project" };
    ctx.config = mockConfig;
    const getRenderFunctionSpy = vi
      .fn()
      .mockResolvedValue(async () => ({ html: "<p>ok</p>" }));
    ctx.entryTypes.set(".md", {
      getEntryInfo: async ({ contents }: any) => ({
        body: contents,
        data: {},
      }),
      getRenderFunction: getRenderFunctionSpy,
    });

    await storeProcessedFile(mockFile, ctx as any, false);

    expect(getRenderFunctionSpy).toHaveBeenCalledWith(mockConfig);
  });
});
