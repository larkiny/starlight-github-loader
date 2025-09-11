# Starlight Github Loader

Loads content from a remote resource on Github and adds it to a collection

```typescript
import { defineCollection } from "astro:content";
import { docsLoader } from "@astrojs/starlight/loaders";
import { docsSchema } from "@astrojs/starlight/schema";

import { Octokit } from "octokit";

import { github } from "./github.loader";
import type { RootOptions } from "./github.content";
import type { LoaderContext } from "./github.types";

const FIXTURES: RootOptions[] = [
  {
    owner: "awesome-algorand",
    repo: "algokit-cli",
    ref: "docs/starlight-preview",
    path: ".devportal/starlight",
    replace: ".devportal/starlight/",
    basePath: "src/content/docs",
  },
];

const octokit = new Octokit({ auth: import.meta.env.GITHUB_TOKEN });
export const collections = {
  docs: defineCollection({
    loader: {
      name: "github-starlight",
      load: async (context) => {
        await docsLoader().load(context);
        await github({
          octokit,
          configs: FIXTURES,
          clear: true, // Clear directories and content store before importing
        }).load(context as LoaderContext);
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

import { github } from "./github.loader";
import type { RootOptions, TransformFunction } from "./github.content";
import type { LoaderContext } from "./github.types";

// Define transformation functions
const addFrontmatter: TransformFunction = (content, context) => {
  return `---
title: ${context.path.replace(".mdx", "").replace(/\//g, " ")}
source: ${context.owner}/${context.repo}
---
${content}`;
};

const removeInternalComments: TransformFunction = (content) => {
  return content.replace(/<!-- INTERNAL.*?-->/gs, "");
};

const FIXTURES_WITH_TRANSFORMS: RootOptions[] = [
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

const octokit = new Octokit({ auth: import.meta.env.GITHUB_TOKEN });
export const collections = {
  docs: defineCollection({
    loader: {
      name: "github-starlight",
      load: async (context) => {
        await docsLoader().load(context);
        await github({
          octokit,
          configs: FIXTURES_WITH_TRANSFORMS,
          clear: false,
        }).load(context as LoaderContext);
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

import { github } from "./github.loader";
import type { RootOptions } from "./github.content";
import type { LoaderContext } from "./github.types";

const FIXTURES_WITH_ASSETS: RootOptions[] = [
  {
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
  },
];

const octokit = new Octokit({ auth: import.meta.env.GITHUB_TOKEN });
export const collections = {
  docs: defineCollection({
    loader: {
      name: "github-starlight-with-assets",
      load: async (context) => {
        await docsLoader().load(context);
        await github({
          octokit,
          configs: FIXTURES_WITH_ASSETS,
          clear: false,
        }).load(context as LoaderContext);
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
