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
        await github({ octokit, configs: FIXTURES, clear: false }).load(
          context as LoaderContext,
        );
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
title: ${context.path.replace('.mdx', '').replace(/\//g, ' ')}
source: ${context.owner}/${context.repo}
---
${content}`;
};

const removeInternalComments: TransformFunction = (content) => {
  return content.replace(/<!-- INTERNAL.*?-->/gs, '');
};

const FIXTURES_WITH_TRANSFORMS: RootOptions[] = [
  {
    owner: "awesome-algorand",
    repo: "algokit-cli", 
    ref: "docs/starlight-preview",
    path: ".devportal/starlight",
    replace: ".devportal/starlight/",
    basePath: "src/content/docs",
    transforms: [removeInternalComments, addFrontmatter]
  },
];

const octokit = new Octokit({ auth: import.meta.env.GITHUB_TOKEN });
export const collections = {
  docs: defineCollection({
    loader: {
      name: "github-starlight",
      load: async (context) => {
        await docsLoader().load(context);
        await github({ octokit, configs: FIXTURES_WITH_TRANSFORMS, clear: false }).load(
          context as LoaderContext,
        );
      },
    },
    schema: docsSchema(),
  }),
};
```

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

# TODO:

- update gitignore for base directories if it exists
- asset imports/image resources
