# Astro GitHub Loader

Load content from GitHub repositories into Astro content collections with flexible pattern-based import, asset management, content transformations, and intelligent change detection.

## Features

- 🎯 **Pattern-Based Import** - Use glob patterns to selectively import content with per-pattern configuration
- 🖼️ **Asset Management** - Automatically download and transform asset references in markdown files
- 🛠️ **Content Transforms** - Apply custom transformations to content during import, with pattern-specific transforms
- ⚡ **Intelligent Change Detection** - Ref-aware commit tracking that only triggers re-imports when your target branch/tag actually changes
- 🔒 **Stable Imports** - Non-destructive approach that preserves local content collections
- 🚀 **Optimized Performance** - Git Trees API for efficient file discovery with minimal API calls

## Quick Start

```typescript
import { defineCollection } from "astro:content";
import { docsLoader } from "@astrojs/starlight/loaders";
import { docsSchema } from "@astrojs/starlight/schema";
import {
  githubLoader,
  createOctokitFromEnv,
  type ImportOptions,
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

// Automatically uses GitHub App or Personal Access Token based on env vars
const octokit = createOctokitFromEnv();

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
          }).load(context);
        }
      },
    },
    schema: docsSchema(),
  }),
};
```

## Authentication

The loader supports two authentication methods with different rate limits:

| Method                       | Rate Limit           | Best For                                      |
| ---------------------------- | -------------------- | --------------------------------------------- |
| **GitHub App** (Recommended) | 15,000 requests/hour | Production, large imports, organizational use |
| **Personal Access Token**    | 5,000 requests/hour  | Development, small imports                    |

### Option 1: GitHub App Authentication (Recommended - 3x Rate Limit)

**Step 1: Create a GitHub App**

1. Go to GitHub Settings → Developer settings → GitHub Apps → [New GitHub App](https://github.com/settings/apps/new)
2. Fill in the required fields:
   - **GitHub App name**: `your-org-docs-loader` (or any name)
   - **Homepage URL**: Your documentation site URL
   - **Webhook**: Uncheck "Active" (not needed)
3. Set **Repository permissions**:
   - Contents: **Read-only**
4. Click **Create GitHub App**

**Step 2: Generate Private Key**

1. In your GitHub App settings, scroll to "Private keys"
2. Click **Generate a private key**
3. Save the downloaded `.pem` file securely

**Step 3: Install the App**

1. In your GitHub App settings, click **Install App**
2. Select your organization or personal account
3. Choose **All repositories** or **Only select repositories**
4. Note the **Installation ID** from the URL: `https://github.com/settings/installations/{installation_id}`

**Step 4: Configure Environment Variables**

```bash
# .env
GITHUB_APP_ID=123456
GITHUB_APP_INSTALLATION_ID=12345678
# For the private key, you have two options:

# Option A: Direct PEM content (multiline)
GITHUB_APP_PRIVATE_KEY="-----BEGIN RSA PRIVATE KEY-----
MIIEpAIBAAKCAQEA...
...
-----END RSA PRIVATE KEY-----"

# Option B: Base64 encoded (single line - easier for .env files)
# Run: cat your-app.private-key.pem | base64 | tr -d '\n'
GITHUB_APP_PRIVATE_KEY="LS0tLS1CRUdJTiBSU0EgUFJJVkFURSBLRVktLS0..."
```

**Step 5: Use in Your Config**

```typescript
import { createOctokitFromEnv } from "@larkiny/astro-github-loader";

// Automatically uses GitHub App if env vars are set
const octokit = createOctokitFromEnv();
```

### Option 2: Personal Access Token (PAT)

**Step 1: Create a Token**

1. Go to GitHub Settings → Developer settings → Personal access tokens → [Tokens (classic)](https://github.com/settings/tokens)
2. Click **Generate new token (classic)**
3. Select scopes:
   - `public_repo` (for public repositories)
   - `repo` (for private repositories)
4. Generate and copy the token

**Step 2: Configure Environment Variable**

```bash
# .env
GITHUB_TOKEN=ghp_your_token_here
```

**Step 3: Use in Your Config**

```typescript
import { createOctokitFromEnv } from "@larkiny/astro-github-loader";

// Automatically falls back to PAT if GitHub App vars aren't set
const octokit = createOctokitFromEnv();
```

### Manual Authentication (Advanced)

For more control, you can manually create the Octokit instance:

```typescript
import { createAuthenticatedOctokit } from "@larkiny/astro-github-loader";

// GitHub App (explicit)
const octokit = createAuthenticatedOctokit({
  appId: process.env.GITHUB_APP_ID!,
  privateKey: process.env.GITHUB_APP_PRIVATE_KEY!,
  installationId: process.env.GITHUB_APP_INSTALLATION_ID!,
});

// Personal Access Token (explicit)
const octokit = createAuthenticatedOctokit({
  token: process.env.GITHUB_TOKEN!,
});
```

## Multi-Ref Configuration Example

Track multiple git references from the same repository independently:

```typescript
import { defineCollection } from "astro:content";
import { docsLoader } from "@astrojs/starlight/loaders";
import { docsSchema } from "@astrojs/starlight/schema";
import {
  githubLoader,
  createOctokitFromEnv,
  type ImportOptions,
} from "@larkiny/astro-github-loader";

const MULTI_REF_CONTENT: ImportOptions[] = [
  {
    name: "Stable Docs",
    owner: "myorg",
    repo: "docs",
    ref: "v2.0.0", // Immutable tag - never re-imports
    includes: [
      {
        pattern: "docs/**/*.md",
        basePath: "src/content/docs/v2",
      },
    ],
  },
  {
    name: "Latest Docs",
    owner: "myorg",
    repo: "docs",
    ref: "main", // Live branch - re-imports only on main commits
    includes: [
      {
        pattern: "docs/**/*.md",
        basePath: "src/content/docs/latest",
      },
    ],
  },
  {
    name: "Beta Features",
    owner: "myorg",
    repo: "docs",
    ref: "beta", // Feature branch - ignores main/other branch commits
    includes: [
      {
        pattern: "experimental/**/*.md",
        basePath: "src/content/docs/beta",
      },
    ],
  },
];

const octokit = createOctokitFromEnv();

export const collections = {
  docs: defineCollection({
    loader: {
      name: "docs",
      load: async (context) => {
        await docsLoader().load(context);

        // Each config is tracked independently by ref
        for (const config of MULTI_REF_CONTENT) {
          await githubLoader({
            octokit,
            configs: [config],
            dryRun: false,
          }).load(context);
        }
      },
    },
    schema: docsSchema(),
  }),
};
```

In this example:

- **Stable docs** (v2.0.0 tag): Never re-imports, provides stable reference
- **Latest docs** (main branch): Only re-imports when main branch changes
- **Beta features** (beta branch): Only re-imports when beta branch changes

Commits to `develop`, `feature-xyz`, or any other branches are completely ignored by all three configs.

## Processing Pipeline

The astro-github-loader processes files through a well-defined pipeline with clear order of operations:

To understand more about the content processing flow, see the [detailed guide](PROCESSING_FLOW.md).

### Order of Operations

1. **File Discovery and Collection**: Scan repository using include patterns and fetch file contents
2. **Individual File Processing**: For each file:
   - Apply asset processing (download and transform asset references)
   - Apply path mappings to determine target paths
   - Apply content transformations (global transforms, then pattern-specific transforms)
3. **Global Link Transformation**: Process all markdown links across all imported files using `linkMappings`
4. **File Storage**: Write processed files to Astro content store

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

// Convert H1 to title frontmatter
const convertH1ToTitle: TransformFunction = (content, context) => {
  const h1Match = content.match(/^#\s+(.+)$/m);
  if (h1Match) {
    const title = h1Match[1];
    // Remove the H1 from content
    content = content.replace(/^#\s+.+$/m, "").trim();
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
```

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
          "docs/capabilities/": "docs/",
          "docs/README.md": "docs/overview.md",
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
      stripPrefixes: ["src/content/docs"],
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
        },

        // Transform README links to introduction
        {
          pattern: /^\.\.\/\.\.\/README\.md$/,
          replacement: (match: string, anchor: string) => {
            return `/introduction`;
          },
          global: true,
        },
      ],
    },
  },
];
```

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

The `clear` option enables selective replacement of content collection entries during import. When enabled, existing entries are atomically replaced (deleted then re-added) one at a time, preserving content collection stability.

### Using the Clear Option

```typescript
// Per-config clear (recommended)
const REMOTE_CONTENT: ImportOptions[] = [
  {
    name: "Docs that need clearing",
    owner: "your-org",
    repo: "docs-repo",
    clear: true, // Enable clearing for this config only
    includes: [
      { pattern: "docs/**/*.md", basePath: "src/content/docs/imported" },
    ],
  },
  {
    name: "Docs that don't need clearing",
    owner: "your-org",
    repo: "other-docs",
    clear: false, // Explicitly disable (or omit for default behavior)
    includes: [
      { pattern: "guides/**/*.md", basePath: "src/content/docs/guides" },
    ],
  },
];

// Or use global clear with per-config override
await githubLoader({
  octokit,
  configs: REMOTE_CONTENT,
  clear: true, // Global default - can be overridden per-config
}).load(context);
```

### When to Use Clear

- **Use `clear: true`** when you need to ensure stale entries are removed (e.g., files renamed or deleted in the source repo)
- **Use `clear: false`** (default) for incremental updates where you want to preserve existing entries

### How It Works

Unlike a bulk clear operation, the loader uses a selective delete-before-set approach:

1. For each file being imported, if an entry already exists, it's deleted immediately before the new entry is added
2. This atomic replacement ensures the content collection is never empty
3. Astro's content collection system handles individual deletions gracefully

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

### How Change Detection Works

The loader uses intelligent, ref-aware change detection:

- **Per-ref tracking**: Each `owner/repo@ref` combination is tracked separately
- **Branch isolation**: Commits to other branches are completely ignored
- **Tag immutability**: Fixed tags (e.g., `v1.0.0`) never trigger re-imports
- **Efficient checking**: Only the latest commit of your target ref is checked

**Examples**:

- Config tracking `main` branch → only `main` commits trigger re-import
- Config tracking `v2.1.0` tag → never re-imports (tags are immutable)
- Config tracking `feature-branch` → ignores commits to `main`, `develop`, etc.
- Multiple configs for same repo with different refs → tracked independently

This means you can safely track multiple refs from the same repository without unnecessary re-imports when unrelated branches change.

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
    | ((match: string, anchor: string, context: LinkTransformContext) => string);

  /** Apply to all links, not just unresolved internal links (default: false) */
  global?: boolean;

  /** Function to determine if this mapping should apply to the current file context */
  contextFilter?: (context: LinkTransformContext) => boolean;

  /** Automatically handle relative links by prefixing with target base path (default: false) */
  relativeLinks?: boolean;
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
   * Supports two mapping formats:
   * - **Simple string**: `'docs/README.md': 'docs/overview.md'`
   * - **Enhanced object**: `'docs/api/': { target: 'api/', crossSectionPath: '/reference/api' }`
   *
   * And two mapping scopes:
   * - **File mapping**: Exact file path match (e.g., `'docs/README.md': 'docs/overview.md'`)
   * - **Folder mapping**: Trailing slash moves all files (e.g., `'docs/capabilities/': 'docs/'`)
   *
   * **Important**: Folder mappings require trailing slashes to distinguish from file mappings.
   */
  pathMappings?: Record<string, PathMappingValue>;
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

- **Git Trees API**: Retrieves the entire repository file tree in a single API call (2 total: 1 for commit SHA + 1 for tree), replacing recursive directory traversal
- **Efficient API usage**: Minimizes GitHub API calls regardless of repository size or depth
- **Ref-aware change detection**: Tracks commit SHA for specific git references (branches/tags) to avoid unnecessary downloads when unrelated branches change
- **Concurrent processing**: Downloads and processes files in parallel

## Installation & Setup

```bash
npm install @larkiny/astro-github-loader
```

Set up your authentication in `.env`:

```bash
# Option 1: GitHub App (recommended - 15,000 requests/hour)
GITHUB_APP_ID=123456
GITHUB_APP_INSTALLATION_ID=12345678
GITHUB_APP_PRIVATE_KEY="-----BEGIN RSA PRIVATE KEY-----..."

# Option 2: Personal Access Token (5,000 requests/hour)
GITHUB_TOKEN=ghp_your_token_here
```

See the [Authentication](#authentication) section for detailed setup instructions.

## License

MIT - See LICENSE file for details.
