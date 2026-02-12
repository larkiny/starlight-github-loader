import { beforeEach, describe, it, expect, vi } from "vitest";
import { Octokit } from "octokit";
import {
  resolveAssetConfig,
  detectAssets,
  downloadAsset,
  transformAssetReferences,
  resolveAssetPath,
  processAssets,
} from "./github.assets.js";
import type { ImportOptions } from "./github.types.js";

// ---------------------------------------------------------------------------
// Mock node:fs so downloadAsset / processAssets never touch the real filesystem
// ---------------------------------------------------------------------------
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

import { existsSync, promises as fs } from "node:fs";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Minimal mock that satisfies the Logger interface used by processAssets */
function createMockLogger() {
  return {
    verbose: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
    error: vi.fn(),
    logAssetProcessing: vi.fn(),
    logFileProcessing: vi.fn(),
    logImportSummary: vi.fn(),
    withSpinner: vi.fn(),
    getLevel: () => "default" as const,
  };
}

/** Saves the original global fetch so we can restore it in afterEach */
const originalFetch = globalThis.fetch;

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.restoreAllMocks();
  // Re-apply the fs mock defaults after restoreAllMocks clears them
  vi.mocked(existsSync).mockReturnValue(false);
  vi.mocked(fs.mkdir).mockResolvedValue(undefined);
  vi.mocked(fs.writeFile).mockResolvedValue(undefined);
  globalThis.fetch = originalFetch;
});

// ========================== resolveAssetConfig =============================

describe("resolveAssetConfig", () => {
  it("returns explicit config when both assetsPath and assetsBaseUrl are set", () => {
    const options: ImportOptions = {
      owner: "test",
      repo: "repo",
      assetsPath: "/custom/assets",
      assetsBaseUrl: "/static/img",
      includes: [{ pattern: "docs/**/*.md", basePath: "out" }],
    };

    expect(resolveAssetConfig(options, "docs/guide.md")).toEqual({
      assetsPath: "/custom/assets",
      assetsBaseUrl: "/static/img",
    });
  });

  it("returns null when only assetsPath is set (misconfiguration)", () => {
    const options: ImportOptions = {
      owner: "o",
      repo: "r",
      assetsPath: "/assets",
      includes: [{ pattern: "docs/**/*.md", basePath: "out" }],
    };
    expect(resolveAssetConfig(options, "docs/guide.md")).toBeNull();
  });

  it("returns null when only assetsBaseUrl is set (misconfiguration)", () => {
    const options: ImportOptions = {
      owner: "o",
      repo: "r",
      assetsBaseUrl: "/img",
      includes: [{ pattern: "docs/**/*.md", basePath: "out" }],
    };
    expect(resolveAssetConfig(options, "docs/guide.md")).toBeNull();
  });

  it("derives co-located defaults from matched include basePath", () => {
    const options: ImportOptions = {
      owner: "o",
      repo: "r",
      includes: [
        { pattern: "docs/**/*.md", basePath: "src/content/docs/mylib" },
      ],
    };

    const result = resolveAssetConfig(options, "docs/intro.md");

    expect(result).toEqual({
      assetsPath: "src/content/docs/mylib/assets",
      assetsBaseUrl: "./assets",
    });
  });

  it("returns null when file does not match any include pattern", () => {
    const options: ImportOptions = {
      owner: "o",
      repo: "r",
      includes: [{ pattern: "docs/**/*.md", basePath: "out" }],
    };

    expect(resolveAssetConfig(options, "src/main.ts")).toBeNull();
  });

  it("returns null when no includes are defined and no explicit config", () => {
    const options: ImportOptions = { owner: "o", repo: "r" };
    expect(resolveAssetConfig(options, "anything.md")).toBeNull();
  });
});

// ============================== detectAssets ===============================

describe("detectAssets", () => {
  it("finds markdown image references", () => {
    const content = "![screenshot](./screenshot.png)";
    expect(detectAssets(content)).toEqual(["./screenshot.png"]);
  });

  it("finds HTML img tags", () => {
    const content = '<img src="photo.jpg" alt="photo">';
    expect(detectAssets(content)).toEqual(["photo.jpg"]);
  });

  it("finds HTML img tags with single quotes", () => {
    const content = "<img src='icon.svg' />";
    expect(detectAssets(content)).toEqual(["icon.svg"]);
  });

  it("ignores absolute URLs in markdown images", () => {
    const content = "![logo](https://example.com/logo.png)";
    expect(detectAssets(content)).toEqual([]);
  });

  it("ignores absolute URLs in HTML img tags", () => {
    const content = '<img src="https://cdn.example.com/hero.jpg">';
    expect(detectAssets(content)).toEqual([]);
  });

  it("ignores non-matching extensions", () => {
    const content = "![doc](./readme.pdf)\n![data](./file.csv)";
    expect(detectAssets(content)).toEqual([]);
  });

  it("supports custom asset patterns", () => {
    const content = "![doc](./readme.pdf)";
    expect(detectAssets(content, [".pdf"])).toEqual(["./readme.pdf"]);
  });

  it("deduplicates repeated references", () => {
    const content =
      "![a](./img.png)\n![b](./img.png)\n![c](./img.png)";
    expect(detectAssets(content)).toEqual(["./img.png"]);
  });

  it("handles ../ relative paths", () => {
    const content = "![up](../assets/diagram.svg)";
    expect(detectAssets(content)).toEqual(["../assets/diagram.svg"]);
  });

  it("returns empty array when no assets are present", () => {
    const content = "# Just a heading\n\nSome text with no images.";
    expect(detectAssets(content)).toEqual([]);
  });

  it("finds multiple different assets", () => {
    const content = [
      "![a](./alpha.png)",
      "![b](./beta.jpg)",
      '<img src="gamma.svg">',
    ].join("\n");

    const result = detectAssets(content);
    expect(result).toContain("./alpha.png");
    expect(result).toContain("./beta.jpg");
    expect(result).toContain("gamma.svg");
    expect(result).toHaveLength(3);
  });

  it("detects bare filenames without ./ prefix", () => {
    const content = "![icon](icon.webp)";
    expect(detectAssets(content)).toEqual(["icon.webp"]);
  });

  it("handles mixed markdown and HTML references", () => {
    const content =
      '![md](./one.png)\n<img src="two.gif">\n![md2](./three.jpeg)';
    const result = detectAssets(content);
    expect(result).toHaveLength(3);
  });
});

// ============================ downloadAsset ================================

describe("downloadAsset", () => {
  let octokit: Octokit;

  beforeEach(() => {
    octokit = new Octokit({ auth: "mock-token" });
  });

  it("downloads a file and writes it to disk", async () => {
    const binaryPayload = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);

    vi.spyOn(octokit.rest.repos, "getContent").mockResolvedValue({
      data: {
        type: "file",
        name: "image.png",
        path: "docs/image.png",
        download_url: "https://raw.githubusercontent.com/o/r/main/docs/image.png",
      },
      status: 200,
      url: "",
      headers: {},
    } as any);

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      arrayBuffer: async () => binaryPayload.buffer,
    });

    await downloadAsset(
      octokit,
      "o",
      "r",
      "main",
      "docs/image.png",
      "/out/assets/image.png",
    );

    expect(fs.mkdir).toHaveBeenCalledWith("/out/assets", { recursive: true });
    expect(fs.writeFile).toHaveBeenCalledWith(
      "/out/assets/image.png",
      expect.any(Uint8Array),
    );
  });

  it("skips mkdir when directory already exists", async () => {
    vi.mocked(existsSync).mockReturnValue(true);

    vi.spyOn(octokit.rest.repos, "getContent").mockResolvedValue({
      data: {
        type: "file",
        name: "img.png",
        path: "img.png",
        download_url: "https://raw.githubusercontent.com/o/r/main/img.png",
      },
      status: 200,
      url: "",
      headers: {},
    } as any);

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      arrayBuffer: async () => new ArrayBuffer(4),
    });

    await downloadAsset(octokit, "o", "r", "main", "img.png", "/out/img.png");

    expect(fs.mkdir).not.toHaveBeenCalled();
  });

  it("throws when getContent returns an array (directory)", async () => {
    vi.spyOn(octokit.rest.repos, "getContent").mockResolvedValue({
      data: [{ type: "file", name: "a.png" }],
      status: 200,
      url: "",
      headers: {},
    } as any);

    await expect(
      downloadAsset(octokit, "o", "r", "main", "dir/", "/out/dir/"),
    ).rejects.toThrow("is a directory");
  });

  it("throws when data.type is not file", async () => {
    vi.spyOn(octokit.rest.repos, "getContent").mockResolvedValue({
      data: { type: "symlink", name: "link", path: "link", download_url: null },
      status: 200,
      url: "",
      headers: {},
    } as any);

    await expect(
      downloadAsset(octokit, "o", "r", "main", "link", "/out/link"),
    ).rejects.toThrow("is not a valid file");
  });

  it('throws "Asset not found" on 404 status', async () => {
    const notFoundError = Object.assign(new Error("Not Found"), {
      status: 404,
    });
    vi.spyOn(octokit.rest.repos, "getContent").mockRejectedValue(
      notFoundError,
    );

    await expect(
      downloadAsset(octokit, "o", "r", "main", "missing.png", "/out/x.png"),
    ).rejects.toThrow("Asset not found: missing.png");
  });

  it("throws download error on non-ok fetch response", async () => {
    vi.spyOn(octokit.rest.repos, "getContent").mockResolvedValue({
      data: {
        type: "file",
        name: "img.png",
        path: "img.png",
        download_url: "https://raw.githubusercontent.com/o/r/main/img.png",
      },
      status: 200,
      url: "",
      headers: {},
    } as any);

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      statusText: "Internal Server Error",
    });

    await expect(
      downloadAsset(octokit, "o", "r", "main", "img.png", "/out/img.png"),
    ).rejects.toThrow("Failed to download asset: 500 Internal Server Error");
  });

  it("re-throws unexpected errors as-is", async () => {
    vi.spyOn(octokit.rest.repos, "getContent").mockRejectedValue(
      new Error("Network failure"),
    );

    await expect(
      downloadAsset(octokit, "o", "r", "main", "x.png", "/out/x.png"),
    ).rejects.toThrow("Network failure");
  });
});

// ======================== transformAssetReferences =========================

describe("transformAssetReferences", () => {
  it("transforms a markdown image reference", () => {
    const content = "![alt](./img.png)";
    const map = new Map([["./img.png", "/assets/img-123.png"]]);
    expect(transformAssetReferences(content, map)).toBe(
      "![alt](/assets/img-123.png)",
    );
  });

  it("transforms an HTML img tag", () => {
    const content = '<img src="./photo.jpg" alt="photo">';
    const map = new Map([["./photo.jpg", "/assets/photo-456.jpg"]]);
    expect(transformAssetReferences(content, map)).toBe(
      '<img src="/assets/photo-456.jpg" alt="photo">',
    );
  });

  it("handles multiple replacements", () => {
    const content = "![a](./a.png)\n![b](./b.svg)";
    const map = new Map([
      ["./a.png", "/out/a.png"],
      ["./b.svg", "/out/b.svg"],
    ]);
    const result = transformAssetReferences(content, map);
    expect(result).toContain("![a](/out/a.png)");
    expect(result).toContain("![b](/out/b.svg)");
  });

  it("leaves non-matching references unchanged", () => {
    const content = "![x](./other.png)\n![y](./untouched.gif)";
    const map = new Map([["./other.png", "/new/other.png"]]);
    const result = transformAssetReferences(content, map);
    expect(result).toContain("![x](/new/other.png)");
    expect(result).toContain("![y](./untouched.gif)");
  });

  it("handles special regex characters in paths", () => {
    const content = "![chart](./data[1].chart(v2).png)";
    const map = new Map([
      ["./data[1].chart(v2).png", "/assets/chart-789.png"],
    ]);
    expect(transformAssetReferences(content, map)).toBe(
      "![chart](/assets/chart-789.png)",
    );
  });

  it("returns unchanged content when map is empty", () => {
    const content = "![a](./a.png)";
    expect(transformAssetReferences(content, new Map())).toBe(content);
  });

  it("transforms multiple occurrences of the same asset", () => {
    const content = "![first](./icon.svg)\nSome text\n![second](./icon.svg)";
    const map = new Map([["./icon.svg", "/out/icon.svg"]]);
    const result = transformAssetReferences(content, map);
    expect(result).toBe(
      "![first](/out/icon.svg)\nSome text\n![second](/out/icon.svg)",
    );
  });
});

// ============================= resolveAssetPath ============================

describe("resolveAssetPath", () => {
  it("resolves ./relative paths against dirname of base", () => {
    expect(resolveAssetPath("docs/guide.md", "./image.png")).toBe(
      "docs/image.png",
    );
  });

  it("resolves ../parent paths against dirname of base", () => {
    expect(resolveAssetPath("docs/sub/page.md", "../shared/logo.svg")).toBe(
      "docs/shared/logo.svg",
    );
  });

  it("returns absolute-looking paths unchanged", () => {
    expect(resolveAssetPath("docs/guide.md", "assets/icon.png")).toBe(
      "assets/icon.png",
    );
  });

  it("returns bare filenames unchanged", () => {
    expect(resolveAssetPath("docs/guide.md", "photo.jpg")).toBe("photo.jpg");
  });

  it("resolves ./ from a nested directory", () => {
    expect(
      resolveAssetPath("a/b/c/file.md", "./diagram.svg"),
    ).toBe("a/b/c/diagram.svg");
  });
});

// ============================== processAssets ==============================

describe("processAssets", () => {
  let octokit: Octokit;
  let mockLogger: ReturnType<typeof createMockLogger>;

  beforeEach(() => {
    octokit = new Octokit({ auth: "mock-token" });
    mockLogger = createMockLogger();
    // Stabilize Date.now for deterministic unique filenames
    vi.spyOn(Date, "now").mockReturnValue(1000000);
  });

  it("skips processing when assetsPath is missing", async () => {
    const options: ImportOptions = {
      owner: "o",
      repo: "r",
      assetsBaseUrl: "/img",
      // assetsPath intentionally omitted
    };

    const result = await processAssets(
      "![a](./a.png)",
      "docs/file.md",
      options,
      octokit,
      mockLogger as any,
    );

    expect(result.content).toBe("![a](./a.png)");
    expect(result.assetsDownloaded).toBe(0);
    expect(result.assetsCached).toBe(0);
  });

  it("skips processing when assetsBaseUrl is missing", async () => {
    const options: ImportOptions = {
      owner: "o",
      repo: "r",
      assetsPath: "/tmp/assets",
      // assetsBaseUrl intentionally omitted
    };

    const result = await processAssets(
      "![a](./a.png)",
      "docs/file.md",
      options,
      octokit,
      mockLogger as any,
    );

    expect(result.content).toBe("![a](./a.png)");
    expect(result.assetsDownloaded).toBe(0);
  });

  it("returns unchanged content when no assets are detected", async () => {
    const options: ImportOptions = {
      owner: "o",
      repo: "r",
      assetsPath: "/tmp/assets",
      assetsBaseUrl: "./assets",
    };

    const content = "# Just text\n\nNo images here.";
    const result = await processAssets(
      content,
      "docs/file.md",
      options,
      octokit,
      mockLogger as any,
    );

    expect(result.content).toBe(content);
    expect(result.assetsDownloaded).toBe(0);
    expect(result.assetsCached).toBe(0);
  });

  it("downloads assets and transforms references end-to-end", async () => {
    const options: ImportOptions = {
      owner: "myorg",
      repo: "myrepo",
      ref: "main",
      assetsPath: "/out/assets",
      assetsBaseUrl: "./assets",
    };

    vi.spyOn(octokit.rest.repos, "getContent").mockResolvedValue({
      data: {
        type: "file",
        name: "diagram.png",
        path: "docs/diagram.png",
        download_url:
          "https://raw.githubusercontent.com/myorg/myrepo/main/docs/diagram.png",
      },
      status: 200,
      url: "",
      headers: {},
    } as any);

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      arrayBuffer: async () => new ArrayBuffer(8),
    });

    const content = "# Guide\n\n![diagram](./diagram.png)\n";
    const result = await processAssets(
      content,
      "docs/guide.md",
      options,
      octokit,
      mockLogger as any,
    );

    expect(result.assetsDownloaded).toBe(1);
    expect(result.assetsCached).toBe(0);
    // The transformed path should use the assetsBaseUrl + unique filename
    expect(result.content).toContain("./assets/diagram-1000000.png");
    expect(result.content).not.toContain("./diagram.png");
  });

  it("handles download errors gracefully (logs warning, continues)", async () => {
    const options: ImportOptions = {
      owner: "o",
      repo: "r",
      ref: "main",
      assetsPath: "/out/assets",
      assetsBaseUrl: "./assets",
    };

    vi.spyOn(octokit.rest.repos, "getContent").mockRejectedValue(
      new Error("API rate limit"),
    );

    const content = "![img](./fail.png)";
    const result = await processAssets(
      content,
      "docs/page.md",
      options,
      octokit,
      mockLogger as any,
    );

    // Content stays unchanged because the download failed
    expect(result.content).toBe(content);
    expect(result.assetsDownloaded).toBe(0);
    expect(mockLogger.warn).toHaveBeenCalledWith(
      expect.stringContaining("Failed to process asset ./fail.png"),
    );
  });

  it("reports cached count when asset already exists on disk", async () => {
    vi.mocked(existsSync).mockReturnValue(true);

    const options: ImportOptions = {
      owner: "o",
      repo: "r",
      ref: "main",
      assetsPath: "/out/assets",
      assetsBaseUrl: "./assets",
    };

    const content = "![cached](./cached.png)";
    const result = await processAssets(
      content,
      "docs/page.md",
      options,
      octokit,
      mockLogger as any,
    );

    expect(result.assetsCached).toBe(1);
    expect(result.assetsDownloaded).toBe(0);
    // Content should still be transformed with the new reference
    expect(result.content).toContain("./assets/cached-1000000.png");
  });

  it("processes multiple assets in a single file", async () => {
    const options: ImportOptions = {
      owner: "o",
      repo: "r",
      ref: "main",
      assetsPath: "/out/assets",
      assetsBaseUrl: "./assets",
    };

    vi.spyOn(octokit.rest.repos, "getContent").mockResolvedValue({
      data: {
        type: "file",
        name: "img.png",
        path: "docs/img.png",
        download_url: "https://raw.githubusercontent.com/o/r/main/docs/img.png",
      },
      status: 200,
      url: "",
      headers: {},
    } as any);

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      arrayBuffer: async () => new ArrayBuffer(4),
    });

    const content = "![a](./alpha.png)\n![b](./beta.jpg)";
    const result = await processAssets(
      content,
      "docs/page.md",
      options,
      octokit,
      mockLogger as any,
    );

    expect(result.assetsDownloaded).toBe(2);
    expect(result.content).toContain("./assets/alpha-1000000.png");
    expect(result.content).toContain("./assets/beta-1000000.jpg");
  });

  it("uses default ref 'main' when ref is not specified", async () => {
    const options: ImportOptions = {
      owner: "o",
      repo: "r",
      // ref intentionally omitted
      assetsPath: "/out/assets",
      assetsBaseUrl: "./assets",
    };

    const getContentSpy = vi
      .spyOn(octokit.rest.repos, "getContent")
      .mockResolvedValue({
        data: {
          type: "file",
          name: "x.png",
          path: "docs/x.png",
          download_url: "https://raw.githubusercontent.com/o/r/main/docs/x.png",
        },
        status: 200,
        url: "",
        headers: {},
      } as any);

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      arrayBuffer: async () => new ArrayBuffer(2),
    });

    await processAssets(
      "![x](./x.png)",
      "docs/file.md",
      options,
      octokit,
      mockLogger as any,
    );

    expect(getContentSpy).toHaveBeenCalledWith(
      expect.objectContaining({ ref: "main" }),
    );
  });
});
