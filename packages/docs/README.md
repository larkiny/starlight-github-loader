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

# TODO:

- update gitignore for base directories if it exists
- asset imports/image resources
