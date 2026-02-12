import { describe, it, expect, beforeEach } from "vitest";
import {
  generateId,
  applyRename,
  generatePath,
  shouldIncludeFile,
  getHeaders,
  syncHeaders,
} from "./github.paths.js";
import type { ImportOptions, MatchedPattern } from "./github.types.js";

// ---------------------------------------------------------------------------
// generateId
// ---------------------------------------------------------------------------
describe("generateId", () => {
  it("removes file extension", () => {
    expect(generateId("docs/guide.md")).toBe("docs/guide");
  });

  it("handles nested paths", () => {
    expect(generateId("src/lib/utils.ts")).toBe("src/lib/utils");
  });

  it("returns the path as-is when there is no extension", () => {
    expect(generateId("README")).toBe("README");
  });

  it("preserves dot-prefixed directory names", () => {
    expect(generateId("docs/.hidden/file.md")).toBe("docs/.hidden/file");
  });

  it("removes only the last extension for files with multiple dots", () => {
    expect(generateId("file.spec.ts")).toBe("file.spec");
  });

  it("handles a leading dot file (hidden file)", () => {
    // lastDotIndex === 0, so the condition > 0 is false → unchanged
    expect(generateId(".gitignore")).toBe(".gitignore");
  });

  it("handles an empty string", () => {
    expect(generateId("")).toBe("");
  });
});

// ---------------------------------------------------------------------------
// applyRename
// ---------------------------------------------------------------------------
describe("applyRename", () => {
  it("returns basename when no options are provided", () => {
    expect(applyRename("docs/guide.md")).toBe("guide.md");
  });

  it("returns basename when no matchedPattern is provided", () => {
    const options: ImportOptions = {
      owner: "o",
      repo: "r",
      includes: [{ pattern: "docs/**", basePath: "guide" }],
    };
    expect(applyRename("docs/guide.md", null, options)).toBe("guide.md");
  });

  it("returns basename when options have no includes", () => {
    const options: ImportOptions = { owner: "o", repo: "r" };
    const mp: MatchedPattern = { pattern: "docs/**", basePath: "guide", index: 0 };
    expect(applyRename("docs/guide.md", mp, options)).toBe("guide.md");
  });

  it("applies exact file mapping (string value)", () => {
    const options: ImportOptions = {
      owner: "o",
      repo: "r",
      includes: [
        {
          pattern: "docs/**",
          basePath: "guide",
          pathMappings: { "docs/README.md": "overview.md" },
        },
      ],
    };
    const mp: MatchedPattern = { pattern: "docs/**", basePath: "guide", index: 0 };
    expect(applyRename("docs/README.md", mp, options)).toBe("overview.md");
  });

  it("applies exact file mapping (object value)", () => {
    const options: ImportOptions = {
      owner: "o",
      repo: "r",
      includes: [
        {
          pattern: "docs/**",
          basePath: "guide",
          pathMappings: { "docs/README.md": { target: "overview.md" } },
        },
      ],
    };
    const mp: MatchedPattern = { pattern: "docs/**", basePath: "guide", index: 0 };
    expect(applyRename("docs/README.md", mp, options)).toBe("overview.md");
  });

  it("applies folder mapping (string value)", () => {
    const options: ImportOptions = {
      owner: "o",
      repo: "r",
      includes: [
        {
          pattern: "docs/**",
          basePath: "guide",
          pathMappings: { "docs/features/": "" },
        },
      ],
    };
    const mp: MatchedPattern = { pattern: "docs/**", basePath: "guide", index: 0 };
    expect(applyRename("docs/features/auth.md", mp, options)).toBe("auth.md");
  });

  it("applies folder mapping (object value)", () => {
    const options: ImportOptions = {
      owner: "o",
      repo: "r",
      includes: [
        {
          pattern: "docs/**",
          basePath: "guide",
          pathMappings: {
            "docs/features/": { target: "feat/" },
          },
        },
      ],
    };
    const mp: MatchedPattern = { pattern: "docs/**", basePath: "guide", index: 0 };
    expect(applyRename("docs/features/auth.md", mp, options)).toBe("feat/auth.md");
  });

  it("returns basename when no mapping matches", () => {
    const options: ImportOptions = {
      owner: "o",
      repo: "r",
      includes: [
        {
          pattern: "docs/**",
          basePath: "guide",
          pathMappings: { "docs/README.md": "overview.md" },
        },
      ],
    };
    const mp: MatchedPattern = { pattern: "docs/**", basePath: "guide", index: 0 };
    expect(applyRename("docs/other.md", mp, options)).toBe("other.md");
  });

  it("returns basename when pattern index is out of bounds", () => {
    const options: ImportOptions = {
      owner: "o",
      repo: "r",
      includes: [{ pattern: "docs/**", basePath: "guide" }],
    };
    const mp: MatchedPattern = { pattern: "docs/**", basePath: "guide", index: 5 };
    expect(applyRename("docs/guide.md", mp, options)).toBe("guide.md");
  });

  it("returns basename when pathMappings is not defined on the include", () => {
    const options: ImportOptions = {
      owner: "o",
      repo: "r",
      includes: [{ pattern: "docs/**", basePath: "guide" }],
    };
    const mp: MatchedPattern = { pattern: "docs/**", basePath: "guide", index: 0 };
    expect(applyRename("docs/guide.md", mp, options)).toBe("guide.md");
  });
});

// ---------------------------------------------------------------------------
// generatePath
// ---------------------------------------------------------------------------
describe("generatePath", () => {
  it("joins basePath with relative path after stripping pattern prefix", () => {
    const mp: MatchedPattern = { pattern: "docs/**", basePath: "guide", index: 0 };
    const options: ImportOptions = {
      owner: "o",
      repo: "r",
      includes: [{ pattern: "docs/**", basePath: "guide" }],
    };
    // filePath "docs/intro.md" → beforeGlob "docs/" → relative "intro.md"
    const result = generatePath("docs/intro.md", mp, options);
    expect(result).toBe("guide/intro.md");
  });

  it("uses filename when path equals the pattern prefix exactly", () => {
    const mp: MatchedPattern = { pattern: "README.md", basePath: "root", index: 0 };
    const options: ImportOptions = {
      owner: "o",
      repo: "r",
      includes: [{ pattern: "README.md", basePath: "root" }],
    };
    // beforeGlob = "README.md" → relative becomes "" → falls back to basename
    const result = generatePath("README.md", mp, options);
    expect(result).toBe("root/README.md");
  });

  it("applies path mapping that produces a filename", () => {
    const options: ImportOptions = {
      owner: "o",
      repo: "r",
      includes: [
        {
          pattern: "docs/**",
          basePath: "guide",
          pathMappings: { "docs/README.md": "overview.md" },
        },
      ],
    };
    const mp: MatchedPattern = { pattern: "docs/**", basePath: "guide", index: 0 };
    const result = generatePath("docs/README.md", mp, options);
    expect(result).toBe("guide/overview.md");
  });

  it("applies path mapping that produces a full relative path", () => {
    const options: ImportOptions = {
      owner: "o",
      repo: "r",
      includes: [
        {
          pattern: "docs/**",
          basePath: "guide",
          pathMappings: { "docs/features/": "topics/" },
        },
      ],
    };
    const mp: MatchedPattern = { pattern: "docs/**", basePath: "guide", index: 0 };
    const result = generatePath("docs/features/auth.md", mp, options);
    expect(result).toBe("guide/topics/auth.md");
  });

  it("handles a full relative path that starts with pattern prefix", () => {
    const options: ImportOptions = {
      owner: "o",
      repo: "r",
      includes: [
        {
          pattern: "docs/**",
          basePath: "guide",
          pathMappings: { "docs/README.md": "docs/renamed.md" },
        },
      ],
    };
    const mp: MatchedPattern = { pattern: "docs/**", basePath: "guide", index: 0 };
    const result = generatePath("docs/README.md", mp, options);
    // applyRename returns "docs/renamed.md", which starts with beforeGlob "docs/"
    // so relative becomes "renamed.md"
    expect(result).toBe("guide/renamed.md");
  });

  it("throws when no matchedPattern is provided", () => {
    expect(() => generatePath("docs/file.md")).toThrow(
      "No matched pattern provided - includes are required",
    );
  });

  it("throws when matchedPattern is null", () => {
    expect(() => generatePath("docs/file.md", null)).toThrow(
      "No matched pattern provided - includes are required",
    );
  });

  it("preserves nested directory structure within pattern", () => {
    const mp: MatchedPattern = { pattern: "src/**", basePath: "lib", index: 0 };
    const options: ImportOptions = {
      owner: "o",
      repo: "r",
      includes: [{ pattern: "src/**", basePath: "lib" }],
    };
    const result = generatePath("src/utils/helpers/format.ts", mp, options);
    expect(result).toBe("lib/utils/helpers/format.ts");
  });
});

// ---------------------------------------------------------------------------
// shouldIncludeFile
// ---------------------------------------------------------------------------
describe("shouldIncludeFile", () => {
  it("includes all files when includes is undefined", () => {
    const options: ImportOptions = { owner: "o", repo: "r" };
    const result = shouldIncludeFile("any/file.md", options);
    expect(result).toEqual({ included: true, matchedPattern: null });
  });

  it("includes all files when includes is an empty array", () => {
    const options: ImportOptions = { owner: "o", repo: "r", includes: [] };
    const result = shouldIncludeFile("any/file.md", options);
    expect(result).toEqual({ included: true, matchedPattern: null });
  });

  it("returns the matched pattern when a pattern matches", () => {
    const options: ImportOptions = {
      owner: "o",
      repo: "r",
      includes: [{ pattern: "docs/**/*.md", basePath: "guide" }],
    };
    const result = shouldIncludeFile("docs/intro.md", options);
    expect(result).toEqual({
      included: true,
      matchedPattern: { pattern: "docs/**/*.md", basePath: "guide", index: 0 },
    });
  });

  it("returns not included when no pattern matches", () => {
    const options: ImportOptions = {
      owner: "o",
      repo: "r",
      includes: [{ pattern: "docs/**/*.md", basePath: "guide" }],
    };
    const result = shouldIncludeFile("src/index.ts", options);
    expect(result).toEqual({ included: false, matchedPattern: null });
  });

  it("returns the correct index when matching the second pattern", () => {
    const options: ImportOptions = {
      owner: "o",
      repo: "r",
      includes: [
        { pattern: "docs/**/*.md", basePath: "guide" },
        { pattern: "src/**/*.ts", basePath: "api" },
      ],
    };
    const result = shouldIncludeFile("src/utils.ts", options);
    expect(result).toEqual({
      included: true,
      matchedPattern: { pattern: "src/**/*.ts", basePath: "api", index: 1 },
    });
  });

  it("uses the first matching pattern when multiple could match", () => {
    const options: ImportOptions = {
      owner: "o",
      repo: "r",
      includes: [
        { pattern: "docs/**", basePath: "all-docs" },
        { pattern: "docs/**/*.md", basePath: "md-docs" },
      ],
    };
    const result = shouldIncludeFile("docs/guide.md", options);
    expect(result).toEqual({
      included: true,
      matchedPattern: { pattern: "docs/**", basePath: "all-docs", index: 0 },
    });
  });

  it("matches glob patterns with ** and braces", () => {
    const options: ImportOptions = {
      owner: "o",
      repo: "r",
      includes: [
        { pattern: "src/**/*.{ts,tsx}", basePath: "components" },
      ],
    };

    expect(shouldIncludeFile("src/Button.tsx", options)).toEqual({
      included: true,
      matchedPattern: {
        pattern: "src/**/*.{ts,tsx}",
        basePath: "components",
        index: 0,
      },
    });

    expect(shouldIncludeFile("src/utils/helpers.ts", options)).toEqual({
      included: true,
      matchedPattern: {
        pattern: "src/**/*.{ts,tsx}",
        basePath: "components",
        index: 0,
      },
    });

    expect(shouldIncludeFile("src/styles.css", options)).toEqual({
      included: false,
      matchedPattern: null,
    });
  });
});

// ---------------------------------------------------------------------------
// getHeaders
// ---------------------------------------------------------------------------
describe("getHeaders", () => {
  let meta: Map<string, string>;

  beforeEach(() => {
    meta = new Map<string, string>();
  });

  it("returns plain Headers when no cached values exist", () => {
    const headers = getHeaders({ meta, id: "test" });
    expect(headers.has("If-None-Match")).toBe(false);
    expect(headers.has("If-Modified-Since")).toBe(false);
  });

  it("sets If-None-Match when etag is cached", () => {
    meta.set("test-etag", '"abc123"');
    const headers = getHeaders({ meta, id: "test" });
    expect(headers.get("If-None-Match")).toBe('"abc123"');
  });

  it("sets If-Modified-Since when lastModified is cached and no etag", () => {
    meta.set("test-last-modified", "Thu, 01 Jan 2025 00:00:00 GMT");
    const headers = getHeaders({ meta, id: "test" });
    expect(headers.get("If-Modified-Since")).toBe(
      "Thu, 01 Jan 2025 00:00:00 GMT",
    );
    expect(headers.has("If-None-Match")).toBe(false);
  });

  it("etag takes precedence over lastModified", () => {
    meta.set("test-etag", '"abc123"');
    meta.set("test-last-modified", "Thu, 01 Jan 2025 00:00:00 GMT");
    const headers = getHeaders({ meta, id: "test" });
    expect(headers.get("If-None-Match")).toBe('"abc123"');
    expect(headers.has("If-Modified-Since")).toBe(false);
  });

  it("preserves initial headers", () => {
    const init = { Authorization: "token ghp_xxx", Accept: "application/json" };
    const headers = getHeaders({ init, meta, id: "test" });
    expect(headers.get("Authorization")).toBe("token ghp_xxx");
    expect(headers.get("Accept")).toBe("application/json");
  });

  it("preserves initial headers alongside conditional headers", () => {
    meta.set("test-etag", '"abc123"');
    const init = { Authorization: "token ghp_xxx" };
    const headers = getHeaders({ init, meta, id: "test" });
    expect(headers.get("Authorization")).toBe("token ghp_xxx");
    expect(headers.get("If-None-Match")).toBe('"abc123"');
  });
});

// ---------------------------------------------------------------------------
// syncHeaders
// ---------------------------------------------------------------------------
describe("syncHeaders", () => {
  let meta: Map<string, string>;

  beforeEach(() => {
    meta = new Map<string, string>();
  });

  it("stores etag from response headers", () => {
    const headers = new Headers({ etag: '"def456"' });
    syncHeaders({ headers, meta, id: "test" });
    expect(meta.get("test-etag")).toBe('"def456"');
    expect(meta.has("test-last-modified")).toBe(false);
  });

  it("stores lastModified when no etag is present", () => {
    const headers = new Headers({
      "last-modified": "Fri, 02 Jan 2025 12:00:00 GMT",
    });
    syncHeaders({ headers, meta, id: "test" });
    expect(meta.get("test-last-modified")).toBe(
      "Fri, 02 Jan 2025 12:00:00 GMT",
    );
    expect(meta.has("test-etag")).toBe(false);
  });

  it("etag takes precedence over lastModified", () => {
    const headers = new Headers({
      etag: '"xyz789"',
      "last-modified": "Fri, 02 Jan 2025 12:00:00 GMT",
    });
    syncHeaders({ headers, meta, id: "test" });
    expect(meta.get("test-etag")).toBe('"xyz789"');
    expect(meta.has("test-last-modified")).toBe(false);
  });

  it("clears previous etag before setting new lastModified", () => {
    meta.set("test-etag", '"old-etag"');
    meta.set("test-last-modified", "old-date");

    const headers = new Headers({
      "last-modified": "Sat, 03 Jan 2025 00:00:00 GMT",
    });
    syncHeaders({ headers, meta, id: "test" });

    expect(meta.has("test-etag")).toBe(false);
    expect(meta.get("test-last-modified")).toBe(
      "Sat, 03 Jan 2025 00:00:00 GMT",
    );
  });

  it("clears previous lastModified before setting new etag", () => {
    meta.set("test-etag", '"old-etag"');
    meta.set("test-last-modified", "old-date");

    const headers = new Headers({ etag: '"new-etag"' });
    syncHeaders({ headers, meta, id: "test" });

    expect(meta.get("test-etag")).toBe('"new-etag"');
    expect(meta.has("test-last-modified")).toBe(false);
  });

  it("clears all previous caching headers when response has none", () => {
    meta.set("test-etag", '"stale-etag"');
    meta.set("test-last-modified", "stale-date");

    const headers = new Headers();
    syncHeaders({ headers, meta, id: "test" });

    expect(meta.has("test-etag")).toBe(false);
    expect(meta.has("test-last-modified")).toBe(false);
  });

  it("does not affect meta entries for other ids", () => {
    meta.set("other-etag", '"other"');
    meta.set("other-last-modified", "other-date");

    const headers = new Headers({ etag: '"new"' });
    syncHeaders({ headers, meta, id: "test" });

    expect(meta.get("other-etag")).toBe('"other"');
    expect(meta.get("other-last-modified")).toBe("other-date");
    expect(meta.get("test-etag")).toBe('"new"');
  });
});
