import { defineCollection } from "astro:content";
import { docsLoader } from "@astrojs/starlight/loaders";
import { docsSchema } from "@astrojs/starlight/schema";

import { Octokit } from "octokit";

import { github } from "astro-github-loader";
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
      load: async (context ) => {
        await docsLoader().load(context);
        await github({ octokit, configs: FIXTURES, clear: false }).load(
          context as LoaderContext,
        );
      },
    },
    schema: docsSchema(),
  }),
};
