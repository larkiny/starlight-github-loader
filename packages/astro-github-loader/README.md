# @larkiny/astro-github-loader

Load content from GitHub repositories into Astro content collections with asset management, content transformations, and intelligent change detection.

## Features

- 🔄 **Smart Content Import** - Import markdown and other content from any GitHub repository
- 🖼️ **Asset Management** - Automatically download and transform asset references in markdown files  
- 🛠️ **Content Transforms** - Apply custom transformations to content during import
- 🎯 **File Filtering** - Use glob patterns to include/exclude specific files
- ⚡ **Change Detection** - Built-in dry-run mode to check for repository changes without importing
- 🔒 **Stable Imports** - Non-destructive approach that preserves local content collections

## Installation

```bash
npm install @larkiny/astro-github-loader octokit
```

## Quick Start

```typescript
import { defineCollection } from "astro:content";
import { docsLoader } from "@astrojs/starlight/loaders";
import { docsSchema } from "@astrojs/starlight/schema";
import { Octokit } from "octokit";
import { githubLoader } from "@larkiny/astro-github-loader";
import type { ImportOptions, LoaderContext } from "@larkiny/astro-github-loader";

const REMOTE_CONTENT: ImportOptions[] = [
  {
    name: "Documentation",
    owner: "your-org",
    repo: "your-docs-repo",
    ref: "main",
    path: "docs",
    basePath: "src/content/docs/imported",
    clear: false, // Recommended: prevents content collection invalidation
  },
];

const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });

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

## Content Transformations

Apply custom transformations to content during import:

```typescript
import type { TransformFunction } from "@larkiny/astro-github-loader";

const addFrontmatter: TransformFunction = (content, context) => {
  const title = context.path.replace(/\.(md|mdx)$/, "").replace(/\//g, " ");
  return `---
title: ${title}
source: ${context.options.owner}/${context.options.repo}
---
${content}`;
};

const CONTENT_WITH_TRANSFORMS: ImportOptions[] = [
  {
    name: "Docs with Transforms",
    owner: "your-org",
    repo: "docs-repo",
    basePath: "src/content/docs/imported",
    transforms: [addFrontmatter],
  },
];
```

## Asset Import and Management

Automatically detect, download, and transform asset references:

```typescript
const CONTENT_WITH_ASSETS: ImportOptions[] = [
  {
    name: "Docs with Assets",
    owner: "your-org",
    repo: "docs-repo",
    basePath: "src/content/docs/imported",
    // Asset configuration
    assetsPath: "src/assets/imported",
    assetsBaseUrl: "~/assets/imported",
    assetPatterns: [".png", ".jpg", ".jpeg", ".gif", ".svg", ".webp"],
  },
];
```

**What happens:**
1. Parse markdown files for image references like `![alt](./images/diagram.png)`
2. Download referenced assets from GitHub repository
3. Save them locally to the specified `assetsPath` directory  
4. Transform markdown references to use local paths with `assetsBaseUrl`

## File Management Strategy

This loader uses a **non-destructive approach** to prevent Astro content collection invalidation:

### Why `clear: false` is Recommended

- **Prevents collection invalidation**: Mass file deletions can cause Astro to invalidate entire content collections, leading to 404 errors
- **Preserves stability**: Your site remains functional even during partial imports
- **Handles updates gracefully**: New and modified files are imported/updated automatically via ETag caching

### Handling Deleted Files

Since files aren't automatically deleted, you'll need to manually clean up when remote files are removed:

1. **Check for changes** using the dry-run feature
2. **Delete target import folders** for repositories that need updates  
3. **Re-import** with a fresh import

This approach trades automatic cleanup for guaranteed stability.

## Change Detection & Dry-Run Mode

Use dry-run mode to check for repository changes without importing:

```typescript
await githubLoader({
  octokit,
  configs: REMOTE_CONTENT,
  dryRun: process.env.IMPORT_DRY_RUN === 'true',
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

📈 Summary: 1 of 2 repositories need re-import, 0 errors

💡 To import updated repositories:
1. Delete the target import folders for repositories that need re-import
2. Run the import process normally (dryRun: false)
3. Fresh content will be imported automatically
```

## Configuration Options

### ImportOptions Interface

```typescript
interface ImportOptions {
  name?: string;          // Display name for logging
  owner: string;          // GitHub repository owner
  repo: string;           // GitHub repository name
  ref?: string;           // Git reference (defaults to "main")
  path?: string;          // Path within repository
  replace?: string;       // String to remove from file paths
  basePath?: string;      // Local directory for content
  enabled?: boolean;      // Whether configuration is enabled
  clear?: boolean;        // Whether to clear content store (recommend: false)
  transforms?: TransformFunction[]; // Content transformation functions
  
  // Asset management
  assetsPath?: string;    // Local directory for assets
  assetsBaseUrl?: string; // Base URL for asset references
  assetPatterns?: string[]; // File extensions to treat as assets
  
  // File filtering
  include?: string[];     // Glob patterns for files to include
  exclude?: string[];     // Glob patterns for files to exclude
}
```

### GithubLoaderOptions Interface

```typescript
interface GithubLoaderOptions {
  octokit: Octokit;       // GitHub API client
  configs: ImportOptions[]; // Array of import configurations
  clear?: boolean;        // Clear content store (recommend: false)
  dryRun?: boolean;       // Enable dry-run mode (defaults to false)
  fetchOptions?: RequestInit; // HTTP request options
}
```

## File Filtering

Control which files are imported using glob patterns:

```typescript
const FILTERED_CONTENT: ImportOptions[] = [
  {
    name: "Filtered Documentation",
    owner: "your-org",
    repo: "docs",
    basePath: "src/content/docs/imported",
    include: [
      "guides/**/*.md",     // All markdown files in guides directory
      "api-*.md",           // Files starting with "api-"
      "**/README.md",       // README files in any directory
    ],
    exclude: [
      "**/draft-*.md",      // Any draft files
      "internal/**",        // Entire internal directory
      "*.temp.*",           // Temporary files
    ],
  },
];
```

**Pattern Rules:**
1. No patterns → All files imported
2. Include only → Only matching files imported
3. Exclude only → All files except excluded ones
4. Both → Include files, but exclude takes precedence

## License

MIT