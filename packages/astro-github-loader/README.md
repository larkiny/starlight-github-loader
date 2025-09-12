# Starlight Github Loader

Loads content from a remote resource on Github and adds it to a content collection

```typescript
import { defineCollection } from "astro:content";
import { docsLoader } from "@astrojs/starlight/loaders";
import { docsSchema } from "@astrojs/starlight/schema";
import { Octokit } from "octokit";
import { githubLoader } from "astro-github-loader";
import type { ImportOptions } from "astro-github-loader";

const GITHUB_API_CLIENT = new Octokit({ auth: import.meta.env.GITHUB_TOKEN });

const REMOTE_CONTENT: ImportOptions[] = [
  {
    owner: "awesome-algorand",
    repo: "algokit-cli",
    ref: "docs/starlight-preview",
    path: ".devportal/starlight",
    replace: ".devportal/starlight/",
    basePath: "src/content/docs",
  },
];

export const collections = {
  docs: defineCollection({
    loader: {
      name: "docs",
      load: async (context) => {
        await docsLoader().load(context);

        for (const config of REMOTE_CONTENT) {
          await githubLoader({
            octokit: GITHUB_API_CLIENT,
            configs: [config],
            clear: true,
          }).load(context);
        }
      },
    },
    schema: docsSchema(),
  }),
};
```

## Using Content Transformers

You can apply transformations to content before it's processed by adding a `transforms` array to your configuration:

```typescript
import { defineCollection } from "astro:content";
import { docsLoader } from "@astrojs/starlight/loaders";
import { docsSchema } from "@astrojs/starlight/schema";
import { Octokit } from "octokit";
import { githubLoader } from "astro-github-loader";
import type { ImportOptions, TransformFunction } from "astro-github-loader";

const GITHUB_API_CLIENT = new Octokit({ auth: import.meta.env.GITHUB_TOKEN });

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
    owner: "awesome-algorand",
    repo: "algokit-cli",
    ref: "docs/starlight-preview",
    path: ".devportal/starlight",
    replace: ".devportal/starlight/",
    basePath: "src/content/docs",
    transforms: [removeInternalComments, addFrontmatter],
  },
];

export const collections = {
  docs: defineCollection({
    loader: {
      name: "docs",
      load: async (context) => {
        await docsLoader().load(context);

        for (const config of REMOTE_CONTENT_WITH_TRANSFORMS) {
          await githubLoader({
            octokit: GITHUB_API_CLIENT,
            configs: [config],
            clear: false,
          }).load(context);
        }
      },
    },
    schema: docsSchema(),
  }),
};
```

## Asset Import and Management

The loader can automatically detect, download, and transform asset references (images, etc.) in your markdown files. This is useful when your GitHub repository contains images that are referenced in markdown files:

```typescript
import { defineCollection } from "astro:content";
import { docsLoader } from "@astrojs/starlight/loaders";
import { docsSchema } from "@astrojs/starlight/schema";
import { Octokit } from "octokit";
import { githubLoader } from "astro-github-loader";
import type { ImportOptions } from "astro-github-loader";

const GITHUB_API_CLIENT = new Octokit({ auth: import.meta.env.GITHUB_TOKEN });

const REMOTE_CONTENT_WITH_ASSETS: ImportOptions[] = [
  {
    name: "AlgoKit CLI Docs",
    owner: "awesome-algorand",
    repo: "algokit-cli",
    ref: "docs/starlight-preview",
    path: ".devportal/starlight",
    replace: ".devportal/starlight/",
    basePath: "src/content/docs",
    // Asset configuration for automatic image handling
    assetsPath: "src/assets/docs",
    assetsBaseUrl: "/assets/docs",
    assetPatterns: [
      ".png",
      ".jpg",
      ".jpeg",
      ".gif",
      ".svg",
      ".webp",
      ".ico",
      ".bmp",
    ],
    enabled: true,
    clear: false,
  },
];

export const collections = {
  docs: defineCollection({
    loader: {
      name: "docs",
      load: async (context) => {
        await docsLoader().load(context);

        for (const config of REMOTE_CONTENT_WITH_ASSETS) {
          if (!config.enabled) continue;

          try {
            console.log(
              `📥 Loading ${config.name} (clear: ${config.clear})...`
            );
            await githubLoader({
              octokit: GITHUB_API_CLIENT,
              configs: [config],
              clear: config.clear,
            }).load(context);
            console.log(`✅ ${config.name} loaded successfully`);
          } catch (error) {
            console.error(`❌ Error loading ${config.name}:`, error);
          }
        }
      },
    },
    schema: docsSchema(),
  }),
};
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

For example, a markdown reference like `![Diagram](./images/flow-chart.png)` would be automatically transformed to `![Diagram](/assets/docs/flow-chart-1641234567890.png)` and the image file would be downloaded and saved locally.

## Selective File Import with Include/Exclude Patterns

You can control which files are imported from the repository using glob patterns. This is useful when you only want to import specific files or need to exclude certain files (like drafts or internal documentation):

```typescript
import { defineCollection } from "astro:content";
import { docsLoader } from "@astrojs/starlight/loaders";
import { docsSchema } from "@astrojs/starlight/schema";
import { Octokit } from "octokit";
import { githubLoader } from "astro-github-loader";
import type { ImportOptions } from "astro-github-loader";

const GITHUB_API_CLIENT = new Octokit({ auth: import.meta.env.GITHUB_TOKEN });

const REMOTE_CONTENT_WITH_FILTERING: ImportOptions[] = [
  {
    name: "AlgoKit CLI Docs",
    owner: "awesome-algorand",
    repo: "algokit-cli",
    ref: "docs/starlight-preview",
    path: ".devportal/starlight",
    replace: ".devportal/starlight/",
    basePath: "src/content/docs",
    // Only include specific patterns
    include: [
      "arc-*.md", // All ARC files
      "important.md", // Specific file
      "guides/**/*.md", // All markdown files in guides directory
    ],
    // Exclude certain patterns
    exclude: [
      "**/draft-*.md", // Any draft files in any directory
      "internal/**", // Entire internal directory
      "*.temp.md", // Temporary files
    ],
    enabled: true,
    clear: false,
  },
];

export const collections = {
  docs: defineCollection({
    loader: {
      name: "docs",
      load: async (context) => {
        await docsLoader().load(context);

        for (const config of REMOTE_CONTENT_WITH_FILTERING) {
          if (!config.enabled) continue;

          try {
            console.log(
              `📥 Loading ${config.name} (clear: ${config.clear})...`
            );
            await githubLoader({
              octokit: GITHUB_API_CLIENT,
              configs: [config],
              clear: config.clear,
            }).load(context);
            console.log(`✅ ${config.name} loaded successfully`);
          } catch (error) {
            console.error(`❌ Error loading ${config.name}:`, error);
          }
        }
      },
    },
    schema: docsSchema(),
  }),
};
```

### Include/Exclude Pattern Rules

The filtering follows these priority rules:

1. **No patterns specified** → All files are imported (default behavior)
2. **Exclude patterns only** → All files except those matching exclude patterns
3. **Include patterns only** → Only files matching include patterns
4. **Both include and exclude** → Include matching files, but exclude takes precedence

### Pattern Examples

```typescript
{
  // Include only ARC standards and readme files
  include: ["arc-*.md", "**/README.md"],

  // Exclude draft files and internal directories
  exclude: ["**/draft-*", "internal/**", "*.temp.*"],

  // Complex filtering: include guides but exclude drafts
  include: ["guides/**/*.md"],
  exclude: ["**/draft-*.md", "**/*.draft.md"]
}
```

### Supported Glob Patterns

The loader uses [picomatch](https://github.com/micromatch/picomatch) for pattern matching, which supports:

- `*` - matches any characters except `/`
- `**` - matches any characters including `/` (for nested directories)
- `?` - matches a single character
- `[abc]` - matches any character in the set
- `{a,b,c}` - matches any of the alternatives

The module is not published yet, but you can try the loader out by following the Get Started Guide

## Get Started

Clone the repository

```bash
git clone git@github.com:awesome-algorand/starlight-github-loader.git
```

Change to the project directory

```bash
cd starlight-github-loader
```

Install the dependencies

```bash
npm install
```

Run the example Starlight site

```bash
npm run dev
```

## About

This was created during the [2025 Algorand Developer Retreat](https://github.com/Algorand-Developer-Retreat) as a
way to help manage the developer documentation in the Algorand/Algokit ecosystems!
