# Astro GitHub Loader

Load content from GitHub repositories into Astro content collections with flexible pattern-based import, asset management, content transformations, and intelligent change detection.

## Features

- 🎯 **Pattern-Based Import** - Use glob patterns to selectively import content with per-pattern configuration
- 🖼️ **Asset Management** - Automatically download and transform asset references in markdown files
- 🛠️ **Content Transforms** - Apply custom transformations to content during import, with pattern-specific transforms
- ⚡ **Change Detection** - Built-in dry-run mode to check for repository changes without importing
- 🔒 **Stable Imports** - Non-destructive approach that preserves local content collections
- 🚀 **Optimized Performance** - Smart directory scanning to minimize GitHub API calls

## Quick Start

```typescript
import { defineCollection } from "astro:content";
import { docsLoader } from "@astrojs/starlight/loaders";
import { docsSchema } from "@astrojs/starlight/schema";
import { Octokit } from "octokit";
import { githubLoader } from "@larkiny/astro-github-loader";
import type {
  ImportOptions,
  LoaderContext,
} from "@larkiny/astro-github-loader";

const REMOTE_CONTENT: ImportOptions[] = [
  {
    name: "Documentation",
    owner: "your-org",
    repo: "your-docs-repo",
    ref: "main",
    includes: [
      {
        pattern: "docs/**/*.md",
        basePath: "src/content/docs/imported",
      },
    ],
    clear: false, // Recommended: prevents content collection invalidation
  },
];

const octokit = new Octokit({ auth: import.meta.env.GITHUB_TOKEN });

export const collections = {
  docs: defineCollection({
    loader: {
      name: "docs",
      load: async (context) => {
        await docsLoader().load(context);

        for (const config of REMOTE_CONTENT) {
          await githubLoader({
            octokit,
            configs: [config],
            clear: config.clear,
            dryRun: false, // Set to true for change detection only
          }).load(context as LoaderContext);
        }
      },
    },
    schema: docsSchema(),
  }),
};
```

## Pattern-Based Import System

The new `includes` system allows you to define multiple import patterns, each with its own destination path and transforms:

```typescript
const REMOTE_CONTENT: ImportOptions[] = [
  {
    name: "Multi-Pattern Import",
    owner: "your-org",
    repo: "your-docs-repo",
    includes: [
      // Import main documentation
      {
        pattern: "docs/**/*.md",
        basePath: "src/content/docs/guides",
        transforms: [addGuideMetadata],
      },
      // Import API reference to different location
      {
        pattern: "api-reference/**/*.md",
        basePath: "src/content/docs/api",
        transforms: [addApiMetadata, formatApiDocs],
      },
      // Import specific files
      {
        pattern: "README.md",
        basePath: "src/content/docs",
        transforms: [convertReadmeToOverview],
      },
    ],
  },
];
```

### Pattern Features

- **Glob patterns**: Use `**/*.md`, `docs/guides/*.md`, specific files, etc.
- **Per-pattern basePath**: Each pattern can target a different local directory
- **Per-pattern transforms**: Apply different transformations to different content types
- **Directory structure preservation**: Relative paths within patterns are preserved

### Common Pattern Examples

- **`**/\*.md`\*\* - All markdown files in the repository
- **`docs/**/\*`\*\* - All files in the docs directory and subdirectories
- **`guides/*.md`** - Only markdown files directly in the guides directory
- **`api-reference/**/\*.{md,mdx}`\*\* - Markdown and MDX files in api-reference
- **`README.md`** - Specific file at repository root
- **`docs/getting-started.md`** - Specific file at specific path

## Content Transformations

Apply transformations globally or per-pattern:

```typescript
import { githubLoader } from "@larkiny/astro-github-loader";
import type { TransformFunction } from "@larkiny/astro-github-loader";

// Global transform functions
const addImportMetadata: TransformFunction = (content, context) => {
  return `---
imported_from: ${context.options.owner}/${context.options.repo}
original_path: ${context.path}
imported_at: ${new Date().toISOString()}
---
${content}`;
};

// Pattern-specific transform
const addApiDocsBadge: TransformFunction = (content, context) => {
  const lines = content.split("\n");
  const frontmatterEnd = lines.findIndex((line, i) => i > 0 && line === "---");
  if (frontmatterEnd > 0) {
    lines.splice(frontmatterEnd, 0, "sidebar:", '  badge: "API"');
  }
  return lines.join("\n");
};

const REMOTE_CONTENT: ImportOptions[] = [
  {
    name: "Docs with Transforms",
    owner: "your-org",
    repo: "docs-repo",
    // Global transforms applied to all includes
    transforms: [addImportMetadata],
    includes: [
      {
        pattern: "docs/**/*.md",
        basePath: "src/content/docs/guides",
        // These transforms are applied in addition to global ones
        transforms: [addGuideFormatting],
      },
      {
        pattern: "api/**/*.md",
        basePath: "src/content/docs/api",
        transforms: [addApiDocsBadge, formatApiContent],
      },
    ],
  },
];
```

## Link Transformation Utilities

Handle markdown links with anchor fragments using built-in utilities:

```typescript
import {
  createLinkTransform,
  extractAnchor,
  removeMarkdownExtension,
} from "@larkiny/astro-github-loader";

const linkTransform = createLinkTransform({
  baseUrl: "/docs/imported",
  pathTransform: (path, context) => {
    const { path: cleanPath, anchor } = extractAnchor(path);

    // Custom link handling logic
    if (cleanPath === "README.md") {
      return `/docs/imported/overview${anchor}`;
    }

    // Use utility to remove .md extension and preserve anchors
    return `/docs/imported/${removeMarkdownExtension(path)}`;
  },
});
```

### Link Transform Utilities

- **`extractAnchor(path)`** - Returns `{path, anchor}` separating the anchor fragment
- **`removeMarkdownExtension(path)`** - Removes `.md`/`.mdx` extensions while preserving anchors
- **`createLinkTransform(options)`** - Main transform with custom path handling

## Asset Import and Management

Automatically detect, download, and transform asset references:

```typescript
const REMOTE_CONTENT_WITH_ASSETS: ImportOptions[] = [
  {
    name: "Docs with Assets",
    owner: "your-org",
    repo: "docs-repo",
    includes: [
      {
        pattern: "documentation/**/*.md",
        basePath: "src/content/docs/imported",
      },
    ],
    // Asset configuration
    assetsPath: "src/assets/imported",
    assetsBaseUrl: "~/assets/imported", // or "/assets/imported"
    assetPatterns: [".png", ".jpg", ".jpeg", ".gif", ".svg", ".webp"],
  },
];
```

### Asset Management Features

- **Automatic detection**: Finds image references in markdown
- **Smart downloading**: Only downloads assets that have changed
- **Path transformation**: Updates markdown to use local asset paths
- **Multiple formats**: Supports various image formats

## File Management Strategy

> **⚠️ Important: Do not use `clear: true`**
>
> The `clear: true` option should not be used with the current implementation due to how Astro content collection syncing works. Mass file deletions can cause Astro to invalidate entire content collections, leading to 404 errors and build instability.
>
> **Instead**: If you need to handle file deletions, renames, or path restructuring from the source repository:
>
> 1. Manually delete the local import folders (e.g., `src/content/docs/imported`)
> 2. Re-run the import process
> 3. Fresh content will be imported with the new structure
>
> This approach ensures your site remains stable while handling structural changes.

## Change Detection & Dry-Run Mode

Check for repository changes without importing:

```typescript
// In your content config
await githubLoader({
  octokit,
  configs: REMOTE_CONTENT,
  clear: false,
  dryRun: process.env.IMPORT_DRY_RUN === "true",
}).load(context);
```

### Setting up Dry-Run Scripts

Add to your `package.json`:

```json
{
  "scripts": {
    "import:check": "IMPORT_DRY_RUN=true astro sync"
  }
}
```

### Dry-Run Output

```bash
npm run import:check

# Output:
📊 Repository Import Status:
✅ Documentation: Up to date
   Last imported: 2 hours ago
🔄 API Reference: Needs re-import
   Latest commit: Add new endpoints
   Committed: 30 minutes ago
   Last imported: 1 day ago
```

## Configuration Options

### ImportOptions Interface

```typescript
interface ImportOptions {
  /** Display name for this configuration (used in logging) */
  name?: string;

  /** GitHub repository owner */
  owner: string;

  /** GitHub repository name */
  repo: string;

  /** Git reference (branch, tag, or commit SHA) */
  ref?: string; // defaults to "main"

  /** Whether this configuration is enabled */
  enabled?: boolean; // defaults to true

  /** Whether to clear content store (recommend: false) */
  clear?: boolean; // defaults to false

  /** Array of transform functions applied to all includes */
  transforms?: TransformFunction[];

  /** Pattern-based import configuration */
  includes?: IncludePattern[];

  /** Asset management options */
  assetsPath?: string; // Local directory for downloaded assets
  assetsBaseUrl?: string; // Base URL for asset references
  assetPatterns?: string[]; // File extensions to treat as assets
}

interface IncludePattern {
  /** Glob pattern to match files (relative to repository root) */
  pattern: string;

  /** Local base path where matching files should be imported */
  basePath: string;

  /** Transforms to apply only to files matching this pattern */
  transforms?: TransformFunction[];
}
```

### Transform Function Interface

```typescript
interface TransformContext {
  /** Generated ID for the content */
  id: string;

  /** File path within the repository */
  path: string;

  /** Full configuration options */
  options: ImportOptions;

  /** Information about which include pattern matched (if any) */
  matchedPattern?: MatchedPattern;
}

type TransformFunction = (content: string, context: TransformContext) => string;
```

## Performance Optimizations

The loader includes several optimizations:

- **Smart directory scanning**: Only scans directories that match include patterns
- **Efficient API usage**: Minimizes GitHub API calls through targeted requests
- **Change detection**: Uses ETags and manifest files to avoid unnecessary downloads
- **Concurrent processing**: Downloads and processes files in parallel

## Installation & Setup

```bash
npm install @larkiny/astro-github-loader octokit
```

Set up your GitHub token in `.env`:

```bash
GITHUB_TOKEN=your_github_token_here
```

## License

MIT - See LICENSE file for details.
