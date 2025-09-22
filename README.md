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

## Processing Pipeline

The astro-github-loader processes files through a well-defined pipeline with clear order of operations:

### Order of Operations

1. **File Discovery**: Scan repository using include patterns
2. **Pattern Matching**: Determine which include pattern(s) match each file
3. **Path Mapping**: Apply `pathMappings` to restructure file paths within the repository context
4. **Local Path Generation**: Combine pattern `basePath` with the (possibly transformed) relative path
5. **Content Transforms**: Apply transformations in order:
   - Global transforms (from main config)
   - Pattern-specific transforms (from matched include pattern)
6. **Link Transformation**: Process all markdown links across all imported files using `linkMappings`
7. **Asset Processing**: Download and transform asset references

### Path vs Link Transformations

Understanding when and why to use each type of transformation:

- **`pathMappings`**: Controls where files are imported to (changes file system paths)

  - Applied during import process
  - Affects the final location of files on disk
  - **Use when**: You need to restructure the imported files differently than they exist in the source repository
  - Example: `'docs/capabilities/': 'docs/'` moves files from capabilities folder up one level

- **`linkMappings`**: Controls how markdown links are transformed (changes URLs in content)
  - Applied after all content is imported
  - Affects links within markdown content
  - **Use when**: You have restructured files (with `pathMappings`) OR need to handle links to files outside the imported document set
  - Example: Transform `../cli/index.md` to `/reference/algokit-cli/` (external reference)

## Pattern-Based Import System

The `includes` system allows you to define multiple import patterns, each with its own destination path and transforms:

```typescript
const REMOTE_CONTENT: ImportOptions[] = [
  {
    name: "Multi-Pattern Import",
    owner: "your-org",
    repo: "your-docs-repo",
    includes: [
      // Import main documentation with path restructuring
      {
        pattern: "docs/**/*.md",
        basePath: "src/content/docs/guides",
        pathMappings: {
          // Move files from capabilities subfolder up one level
          "docs/capabilities/": "docs/",
          // Rename specific files
          "docs/README.md": "docs/overview.md",
        },
        transforms: [addGuideMetadata],
      },
      // Import API reference to different location
      {
        pattern: "api-reference/**/*.md",
        basePath: "src/content/docs/api",
        pathMappings: {
          // Flatten API structure
          "api-reference/v1/": "api-reference/",
        },
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
- **Per-pattern pathMappings**: Restructure file paths within each pattern
- **Directory structure preservation**: Relative paths within patterns are preserved

### Path Mappings

Use `pathMappings` to restructure files during import.

**Common use cases**:

- Flatten nested folder structures (e.g., move `docs/capabilities/` files to `docs/`)
- Rename specific files (e.g., `README.md` → `overview.md`)
- Reorganize content for better site structure
- Remove unwanted path segments from imported files

```typescript
{
  pattern: "docs/**/*.md",
  basePath: "src/content/docs/guides",
  pathMappings: {
    // File mappings (exact paths)
    'docs/README.md': 'docs/overview.md',
    'docs/getting-started.md': 'docs/quickstart.md',

    // Folder mappings (require trailing slash)
    'docs/capabilities/': 'docs/',           // Move all files up one level
    'docs/legacy/guides/': 'docs/archive/',  // Move to different folder
  },
}
```

**Important**: Folder mappings require trailing slashes to distinguish from file mappings:

- ✅ `'docs/capabilities/': 'docs/'` (folder mapping - moves all files)
- ❌ `'docs/capabilities': 'docs/'` (treated as exact file match)

### Common Pattern Examples

- **`**/\*.md`\*\* - All markdown files in the repository
- **`docs/**/\*`\*\* - All files in the docs directory and subdirectories
- **`guides/*.md`** - Only markdown files directly in the guides directory
- **`api-reference/**/\*.{md,mdx}`\*\* - Markdown and MDX files in api-reference
- **`README.md`** - Specific file at repository root
- **`docs/getting-started.md`** - Specific file at specific path

## Content & Link Transformations

The loader supports both content transformations (modifying file contents) and link transformations (fixing cross-references):

### Content Transformations

Apply content transformations globally or per-pattern.

**Use content transforms when you need to**:

- Add frontmatter (metadata) to imported files
- Convert H1 headings to frontmatter titles
- Add import tracking information
- Modify content structure or formatting
- Add badges, labels, or other metadata specific to your site

````typescript
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

// Convert H1 to title frontmatter
const convertH1ToTitle: TransformFunction = (content, context) => {
  const h1Match = content.match(/^#\s+(.+)$/m);
  if (h1Match) {
    const title = h1Match[1];
    // Remove the H1 from content
    content = content.replace(/^#\s+.+$/m, '').trim();
    // Add to frontmatter
    const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);
    if (frontmatterMatch) {
      const existingFrontmatter = frontmatterMatch[1];
      const newFrontmatter = `---\ntitle: "${title}"\n${existingFrontmatter}\n---`;
      content = content.replace(/^---\n[\s\S]*?\n---/, newFrontmatter);
    } else {
      content = `---\ntitle: "${title}"\n---\n\n${content}`;
    }
  }
  return content;
};

### Link Transformations

Configure link transformations to handle cross-repository links and restructured file references.

**Use link mappings when**:
- You've restructured files with `pathMappings` and need to update internal links
- Links reference files outside the imported document set (external repositories, different sections)
- Links need to be transformed for your site's URL structure (e.g., Starlight routing)
- You need to handle broken or outdated links in the source content

```typescript
import { createStarlightLinkMappings } from "./transforms/links.js";

const REMOTE_CONTENT: ImportOptions[] = [
  {
    name: "Docs with Full Transformations",
    owner: "your-org",
    repo: "docs-repo",

    // Global content transforms applied to all includes
    transforms: [addImportMetadata, convertH1ToTitle],

    includes: [
      {
        pattern: "docs/**/*.md",
        basePath: "src/content/docs/guides",
        pathMappings: {
          'docs/capabilities/': 'docs/',
          'docs/README.md': 'docs/overview.md',
        },
        // Pattern-specific content transforms
        transforms: [addGuideFormatting],
      },
      {
        pattern: "api/**/*.md",
        basePath: "src/content/docs/api",
        transforms: [addApiDocsBadge, formatApiContent],
      },
    ],

    // Link transformations (applied after content transforms)
    linkTransform: {
      stripPrefixes: ['src/content/docs'],
      linkMappings: [
        // Apply Starlight-specific link transformations
        ...createStarlightLinkMappings(),

        // Custom link mappings for external references
        {
          pattern: /^\.\.\/cli\/?$/,
          replacement: (match: string, anchor: string) => {
            return `/reference/algokit-cli`;
          },
          global: true,
          description: 'Map CLI reference links to reference section',
        },

        // Transform README links to introduction
        {
          pattern: /^\.\.\/\.\.\/README\.md$/,
          replacement: (match: string, anchor: string) => {
            return `/introduction`;
          },
          global: true,
          description: 'Map README links to introduction page',
        },
      ],
    },
  },
];
````

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

  /** Link transformation options (applied after all content transforms) */
  linkTransform?: ImportLinkTransformOptions;
}

interface ImportLinkTransformOptions {
  /** Base paths to strip from final URLs (e.g., ["src/content/docs"]) */
  stripPrefixes: string[];

  /** Link mappings to transform URLs in markdown links */
  linkMappings?: LinkMapping[];
}

interface LinkMapping {
  /** Pattern to match (string or regex) */
  pattern: string | RegExp;

  /** Replacement string or function */
  replacement:
    | string
    | ((match: string, anchor: string, context: any) => string);

  /** Apply to all links, not just unresolved internal links (default: false) */
  global?: boolean;

  /** Description for debugging (optional) */
  description?: string;
}

interface IncludePattern {
  /** Glob pattern to match files (relative to repository root) */
  pattern: string;

  /** Local base path where matching files should be imported */
  basePath: string;

  /** Transforms to apply only to files matching this pattern */
  transforms?: TransformFunction[];

  /**
   * Map of source paths to target paths for controlling where files are imported.
   *
   * Supports two types of mappings:
   * - **File mapping**: `'docs/README.md': 'docs/overview.md'` - moves a specific file to a new path
   * - **Folder mapping**: `'docs/capabilities/': 'docs/'` - moves all files from source folder to target folder
   *
   * **Important**: Folder mappings require trailing slashes to distinguish from file mappings.
   * - ✅ `'docs/capabilities/': 'docs/'` (folder mapping - moves all files)
   * - ❌ `'docs/capabilities': 'docs/'` (treated as exact file match)
   */
  pathMappings?: Record<string, string>;
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
