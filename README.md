# Astro GitHub Loader

[![CI](https://github.com/larkiny/starlight-github-loader/actions/workflows/ci.yml/badge.svg)](https://github.com/larkiny/starlight-github-loader/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=flat-square)](https://opensource.org/licenses/MIT)

A powerful content loader for Astro that enables importing and transforming content from GitHub repositories into Astro content collections with intelligent link resolution and asset management.

## Features

- 🎯 **Pattern-Based Import** - Use glob patterns to selectively import content with per-pattern configuration
- 🖼️ **Asset Management** - Automatically download and transform asset references in markdown files
- 🛠️ **Content Transforms** - Apply custom transformations to content during import, with pattern-specific transforms
- ⚡ **Change Detection** - Built-in dry-run mode to check for repository changes without importing
- 🔗 **Smart Link Resolution** - Intelligent cross-reference handling with context-aware transformations
- 🚀 **Optimized Performance** - Git Trees API for efficient file discovery with minimal API calls

## Repository Structure

This repository contains:

- **`packages/astro-github-loader/`** - The main npm package ([see detailed documentation](packages/astro-github-loader/README.md))
- **`packages/docs/`** - Starlight demo site showcasing the loader's capabilities

## Package Documentation

For complete installation instructions, configuration options, and usage examples, see the [astro-github-loader package documentation](packages/astro-github-loader/README.md).

## Demo Site

The `packages/docs/` directory contains a fully functional Starlight documentation site that demonstrates the astro-github-loader in action. This demo site imports content from the AlgoKit CLI repository and showcases:

- Pattern-based content import with path restructuring
- Asset downloading and transformation
- Content transforms (H1 to title conversion, frontmatter addition)
- Cross-repository link resolution
- Multi-repository import configurations

### Running the Demo

```bash
cd packages/docs

# Install dependencies
npm install

# Import content from GitHub and start development server
npm run dev:fresh

# Or check for changes without importing
npm run import:dry-run
```

The demo site imports AlgoKit CLI documentation and transforms it into a properly structured Starlight site with working cross-references and assets.

## Quick Start

```bash
npm install @larkiny/astro-github-loader octokit
```

```typescript
import { githubLoader } from "@larkiny/astro-github-loader";
import { Octokit } from "octokit";

const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });

export const collections = {
  docs: defineCollection({
    loader: {
      load: async (context) => {
        await githubLoader({
          octokit,
          configs: [{
            name: "Documentation",
            owner: "your-org",
            repo: "your-docs-repo",
            includes: [{
              pattern: "docs/**/*.md",
              basePath: "src/content/docs/imported"
            }]
          }]
        }).load(context);
      }
    }
  })
};
```

## License

MIT - See LICENSE file for details.