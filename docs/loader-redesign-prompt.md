# Loader Redesign — Session Prompt

Use this document as context for a Claude Code session in the `astro-github-loader` repo. It captures design decisions made in the devportal repo that affect the loader.

## Background

The Algorand Developer Portal (`devportal`) uses `@larkiny/astro-github-loader` to import documentation from GitHub repositories into Astro content collections. We are redesigning the devportal's library configuration system. Some of those changes require corresponding updates to the loader.

The devportal design doc is at: `/Users/larkinyoung/dev/af/devportal/docs/planning/2026-02-12-library-config-redesign.md`

## What the devportal is changing

1. **Import configs now use a `variants` wrapper.** Each library has a single config file with a `metadata` object and a `variants` array. Each variant represents a language-specific import (e.g., TypeScript, Python) from a different GitHub repo. The loader receives individual variants to process — same as today's `ImportOptions`, but with added `language` and `versions` fields.

2. **Versions are per-variant, declared in the import config.** Each variant has a `versions` array listing the versions to display (e.g., `[{ slug: 'latest', label: 'Latest' }, { slug: 'v8.0.0', label: 'v8.0.0' }]`). Versions are manually curated — no auto-discovery, no manifest files. The version folders already exist in the source repo's content (typically on a `docs-dist` branch).

3. **Assets are co-located with content.** Instead of a separate `assetsPath` directory, assets (images, etc.) should be placed in an `assets/` folder within the content destination path for each version. This means `assetsPath` and `assetsBaseUrl` can be derived from the variant's content `basePath` rather than explicitly configured.

## Changes needed in the loader

### 1. ImportOptions type updates

**What:** Add `language` and `versions` fields directly to the existing `ImportOptions` type. No backward-compatibility shim needed — the devportal is the only consumer of this loader.

```typescript
interface VersionConfig {
  slug: string;    // URL segment: "latest", "v8.0.0"
  label: string;   // Display name: "Latest", "v8.0.0"
}

// Added to ImportOptions:
language?: string;          // "TypeScript", "Python", "Go", etc.
versions?: VersionConfig[]; // Versions to display in the devportal's version picker
```

The `language` field is useful for logging. The `versions` field is informational — it tells the loader which version folders exist in the source content, which can be used for validation or path mapping. The core import logic doesn't change based on these fields.

### 2. Co-located assets

**What:** When the loader downloads assets (images referenced in markdown), place them in an `assets/` subdirectory relative to the content's destination path, rather than in a separate `assetsPath` directory.

**Current behavior:**
- Content goes to: `src/content/docs/docs/algokit-utils/typescript/`
- Assets go to: `src/assets/algokit-utils-ts/` (separate directory)
- Markdown references: absolute path to assets directory

**New behavior:**
- Content goes to: `src/content/docs/docs/algokit-utils/typescript/v8.0.0/`
- Assets go to: `src/content/docs/docs/algokit-utils/typescript/v8.0.0/assets/`
- Markdown references: relative path (`./assets/image.png`)

**Benefits:**
- `assetsPath` and `assetsBaseUrl` can be removed from the config (derived from `basePath`)
- Version cleanup is atomic (delete version folder, assets go with it)
- Relative references are simpler

**Backward compatibility:** If `assetsPath` is explicitly provided, use it (existing behavior). If omitted, default to `{basePath}/assets/`.

### 3. Version-aware content import

**What:** The source repos publish documentation to a `docs-dist` branch (or equivalent) with version folders already in place. The loader imports from a single ref — it does NOT need to check out different branches/tags per version.

**Source content structure (on the docs-dist branch):**
```
latest/              ← always present
  getting-started/
  guides/
  api/
v8.0.0/              ← pinned release version (optional)
  getting-started/
  guides/
  api/
```

**Destination path structure:**
```
src/content/docs/docs/algokit-utils/typescript/
  latest/
    getting-started/
    guides/
    assets/
  v8.0.0/
    getting-started/
    guides/
    assets/
```

**Key point:** The loader does NOT iterate over multiple refs. It imports from one ref (the docs-dist branch), and the version folder structure carries through from source to destination. The `versions` field in the config tells the devportal which versions exist for the UI (version picker), but the loader's job is simply to import the content as it finds it.

**For external repos** that don't use the docs-dist convention: the `ref` field on the import config points to whatever branch contains the docs, and typically only a single version (`latest`) is configured. The loader doesn't need special handling — it just imports from the configured ref as it does today.

## What does NOT change in the loader

- **Core import pipeline** — file discovery, glob matching, content transforms, path mappings all stay the same
- **Link transformation** — same mechanism, just applied per-version
- **Authentication** — same GitHub App / PAT approach
- **Change detection** — same ref-aware caching

## Suggested approach

1. **Start by reading the current loader codebase** to understand the import pipeline, especially how `ref`, `basePath`, and asset handling work.
2. **Update `ImportOptions` type** — add `language` and `versions` fields. Simplest change, do first.
3. **Design co-located assets** — default `assetsPath` to `{basePath}/assets/` when not explicitly provided.

## Testing improvements

The current test setup needs significant improvement. Before making any functional changes, review the existing test infrastructure and bring it up to best practices. This is a priority — all loader changes should ship with solid test coverage.

**Audit the current setup:**
- Review the test framework, runner config, and existing test files
- Identify what's covered and what's not (especially core pipeline functions, transforms, asset handling, and path mapping)
- Check for proper mocking of GitHub API calls (no real network requests in tests)
- Assess whether tests are unit-level, integration-level, or a mix

**Apply these practices:**
- **Mock external dependencies.** All GitHub API interactions should be mocked. Tests must run offline and fast.
- **Use fixtures for file content.** Create a `test/fixtures/` directory with sample markdown files, images, and directory structures that represent real import scenarios.
- **Test transforms in isolation.** Each content transform (frontmatter injection, link rewriting, path mapping, etc.) should have its own focused tests with clear input/output assertions.
- **Test the asset pipeline.** Verify that assets are downloaded, placed in the correct directory, and that markdown references are rewritten correctly — especially for the new co-located assets default.
- **Test config validation.** Verify that malformed or incomplete `ImportOptions` are handled gracefully (missing required fields, invalid patterns, etc.).
- **Add coverage reporting.** Configure the test runner to output coverage metrics. Aim for meaningful coverage of core logic — don't chase 100%, but ensure critical paths (file discovery, glob matching, content writing, path resolution) are well-covered.
- **Make tests easy to run.** `npm test` (or equivalent) should run the full suite with no setup required. Add a `test:watch` script for development.

**For each loader change in this session**, write tests alongside the implementation:
1. `ImportOptions` type updates — test that the new fields are accepted and passed through correctly
2. Co-located assets — test the default `{basePath}/assets/` behavior when `assetsPath` is omitted, and that explicit `assetsPath` still works

## Reference files in devportal

- Design doc: `/Users/larkinyoung/dev/af/devportal/docs/planning/2026-02-12-library-config-redesign.md`
- Current import configs: `/Users/larkinyoung/dev/af/devportal/imports/configs/`
- Current types: `/Users/larkinyoung/dev/af/devportal/imports/transforms/types.ts`
- Content config: `/Users/larkinyoung/dev/af/devportal/src/content/config.ts`
