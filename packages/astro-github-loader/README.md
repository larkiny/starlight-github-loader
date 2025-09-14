# Astro GitHub Loader

Load content from GitHub repositories into Astro content collections with asset management, content transformations, and intelligent change detection.

## Features

- 🔄 **Smart Content Import** - Import markdown and other content from any GitHub repository
- 🖼️ **Asset Management** - Automatically download and transform asset references in markdown files
- 🛠️ **Content Transforms** - Apply custom transformations to content during import
- ⚡ **Change Detection** - Built-in dry-run mode to check for repository changes without importing
- 🔒 **Stable Imports** - Non-destructive approach that preserves local content collections

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

## Selective Content Import

Control which files are imported using the `ignores` option to skip specific files or directories:

```typescript
const REMOTE_CONTENT: ImportOptions[] = [
  {
    name: "Docs with Selective Import",
    owner: "your-org", 
    repo: "your-docs-repo",
    path: "docs",
    basePath: "src/content/docs/imported",
    ignores: [
      // Ignore entire directories  
      "api/**/*",           // Skip all files in the api directory
      "internal/**/*",      // Skip internal documentation
      "temp/**/*",          // Skip temporary files
      
      // Ignore specific file patterns
      "**/*.test.md",       // Skip test files anywhere
      "**/*.draft.md",      // Skip draft files
      "**/TODO.md",         // Skip TODO files
      
      // Ignore specific files
      "old-readme.md",      // Skip specific file
      "deprecated.md",      // Skip deprecated content
    ],
  },
];
```

### Common Ignore Patterns

- **`directory/**/*`** - Ignore entire directory and all subdirectories
- **`**/*.extension`** - Ignore all files with specific extension anywhere  
- **`**/filename.md`** - Ignore specific filename in any directory
- **`filename.md`** - Ignore specific file in root path only
- **`prefix-*`** - Ignore files starting with prefix
- **`*-suffix.md`** - Ignore files ending with suffix

The `ignores` option uses [picomatch](https://github.com/micromatch/picomatch) for glob pattern matching, supporting all standard glob patterns.

## Content Transformations

Apply custom transformations to content during import using the `transforms` array:

```typescript
import { githubLoader } from "@larkiny/astro-github-loader";
import type { TransformFunction } from "@larkiny/astro-github-loader";

// Define transformation functions
const addFrontmatter: TransformFunction = (content, context) => {
  const title = context.path.replace(/\.(md|mdx)$/, "").replace(/\//g, " ");
  return `---
title: ${title}
source: ${context.options.owner}/${context.options.repo}
---
${content}`;
};

const removeInternalComments: TransformFunction = (content) => {
  return content.replace(/<!-- INTERNAL.*?-->/gs, "");
};

const REMOTE_CONTENT_WITH_TRANSFORMS: ImportOptions[] = [
  {
    name: "Docs with Transforms",
    owner: "your-org",
    repo: "docs-repo",
    path: "documentation",
    basePath: "src/content/docs/imported",
    clear: false,
    transforms: [removeInternalComments, addFrontmatter], // Applied in order
  },
];

// Use in your content collection as shown in Quick Start
```

## File Renaming

Rename files during import to organize content according to your site structure:

```typescript
import type { FileRename } from "@larkiny/astro-github-loader";

const REMOTE_CONTENT_WITH_RENAMES: ImportOptions[] = [
  {
    name: "Documentation with Renames",
    owner: "your-org",
    repo: "docs-repo",
    path: "docs",
    basePath: "src/content/docs/imported",
    clear: false,
    fileRenames: [
      { from: "README.md", to: "index.md" },
      { from: "getting-started.md", to: "guides/quick-start.md" },
      { from: "advanced/config.md", to: "configuration.md" },
    ],
  },
];
```

### File Rename Rules

- **`from`**: Source path relative to the repository path being imported
- **`to`**: Destination path relative to the basePath where file will be saved
- Files are matched exactly by their path - no glob patterns supported
- Directories in the `to` path will be created automatically
- Files not matching any rename rules maintain their original paths

This feature is perfect for:
- Converting README files to index pages
- Reorganizing content structure during import  
- Consolidating nested documentation into flatter hierarchies
- Renaming files to match your site's URL structure

## Asset Import and Management

Automatically detect, download, and transform asset references in your markdown files:

```typescript
const REMOTE_CONTENT_WITH_ASSETS: ImportOptions[] = [
  {
    name: "Docs with Assets",
    owner: "your-org",
    repo: "docs-repo",
    path: "documentation",
    basePath: "src/content/docs/imported",
    clear: false,
    // Asset configuration for automatic image handling
    assetsPath: "src/assets/imported",
    assetsBaseUrl: "~/assets/imported", // or "/assets/imported"
    assetPatterns: [".png", ".jpg", ".jpeg", ".gif", ".svg", ".webp"],
  },
];
```

### Asset Configuration Options

- **`assetsPath`**: Local directory where downloaded assets will be stored (e.g., `"src/assets/docs"`)
- **`assetsBaseUrl`**: Base URL prefix for asset references in transformed markdown (e.g., `"/assets/docs"`)
- **`assetPatterns`**: Array of file extensions to treat as assets (defaults to common image formats if not specified)

When enabled, the loader will:

1. Parse markdown files for image references like `![alt](./images/diagram.png)` or `<img src="../assets/logo.svg">`
2. Download the referenced assets from the GitHub repository
3. Save them locally to the specified `assetsPath` directory
4. Transform the markdown references to use the local paths with `assetsBaseUrl`

For example, `![Diagram](./images/flow-chart.png)` becomes `![Diagram](~/assets/imported/flow-chart-1641234567890.png)` with the image downloaded locally.

## File Management Strategy

This loader uses a **non-destructive approach** to prevent Astro content collection invalidation:

### Why `clear: false` is Recommended

- **Prevents collection invalidation**: Mass file deletions can cause Astro to invalidate entire content collections, leading to 404 errors
- **Preserves stability**: Your site remains functional even during partial imports
- **Handles updates gracefully**: New and modified files are imported/updated automatically via ETag caching

### Handling Deleted Files

Since files aren't automatically deleted, you'll need to manually clean up when remote files are removed:

1. **Check for changes** using the dry-run feature (see below)
2. **Delete target import folders** for repositories that need updates
3. **Re-import** with a fresh import

This approach trades automatic cleanup for guaranteed stability.

## Change Detection & Dry-Run Mode

Use the dry-run feature to check for repository changes without importing:

```typescript
// In your content config
await githubLoader({
  octokit,
  configs: REMOTE_CONTENT,
  clear: false,
  dryRun: process.env.IMPORT_DRY_RUN === 'true', // Enable via environment variable
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

### Change Detection Features

- **Commit-based tracking**: Compares latest commit SHA with last import
- **State persistence**: Maintains `.github-import-state.json` for tracking
- **Comprehensive detection**: Catches all changes (new, modified, deleted, renamed files)
- **Fast execution**: Single API call per repository

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
  
  /** Path within the repository to import from */
  path?: string; // defaults to repository root
  
  /** String to remove from generated file paths */
  replace?: string;
  
  /** Local directory where content should be imported */
  basePath?: string;
  
  /** Whether this configuration is enabled */
  enabled?: boolean; // defaults to true
  
  /** Whether to clear content store (recommend: false) */
  clear?: boolean; // defaults to false
  
  /** Array of transform functions to apply to content */
  transforms?: TransformFunction[];
  
  /** Files and directories to ignore during import (glob patterns supported) */
  ignores?: string[]; // e.g., ['temp/**/*', '**/*.test.md', 'old-file.md']
  
  /** Asset management options */
  assetsPath?: string; // Local directory for downloaded assets
  assetsBaseUrl?: string; // Base URL for asset references
  assetPatterns?: string[]; // File extensions to treat as assets
  
  /** File rename configurations */
  fileRenames?: FileRename[]; // Array of from/to path mappings
}
```

### GithubLoaderOptions Interface

```typescript
interface GithubLoaderOptions {
  /** Octokit instance for GitHub API access */
  octokit: Octokit;
  
  /** Array of import configurations */
  configs: ImportOptions[];
  
  /** Whether to clear content store (recommend: false) */
  clear?: boolean; // defaults to false
  
  /** Enable dry-run mode for change detection only */
  dryRun?: boolean; // defaults to false
  
  /** Fetch options for HTTP requests */
  fetchOptions?: RequestInit;
}
```

## Installation & Setup

```bash
npm install @larkiny/astro-github-loader octokit
```

Set up your GitHub token in `.env`:

```bash
GITHUB_TOKEN=your_github_token_here
```

## Development

Clone and run the example:

```bash
git clone https://github.com/larkiny/starlight-github-loader-fork.git
cd starlight-github-loader-fork
npm install
npm run dev
```

## License

MIT - See LICENSE file for details.