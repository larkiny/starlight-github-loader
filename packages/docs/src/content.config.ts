import { defineCollection } from "astro:content";
import { docsLoader } from "@astrojs/starlight/loaders";
import { docsSchema } from "@astrojs/starlight/schema";

import { Octokit } from "octokit";
import {
  githubLoader,
  type ImportOptions,
  type LoaderContext,
} from "@larkiny/astro-github-loader";
import { createStarlightPathMappings } from "../imports/transforms/links.js";
import { convertH1ToTitle } from "../imports/transforms/common.js";
import {
  createFrontmatterTransform,
  createPathBasedFrontmatterTransform,
} from "../imports/transforms/frontmatter.js";

const REMOTE_CONTENT: ImportOptions[] = [
  {
    name: "AlgoKit CLI Docs",
    owner: "larkiny",
    repo: "algokit-cli-docs",
    assetsPath: "src/assets/imports/algokit/cli",
    assetsBaseUrl: "@assets/imports/algokit/cli",
    includes: [
      {
        pattern: "docs/{features/**,algokit.md}",
        basePath: "src/content/docs/algokit/cli",
        // rename: {
        //   "docs/algokit.md": "overview.md",
        // },
        transforms: [
          createPathBasedFrontmatterTransform("docs/algokit.md", {
            frontmatter: {
              title: "AlgoKit CLI Overview",
              slug: "algokit/cli/algokit",
              sidebar: { label: "Overview", order: 0 },
            },
            mode: "merge",
            preserveExisting: false,
          }),
        ],
      },
      {
        pattern: "docs/cli/index.md",
        basePath: "src/content/docs/reference/algokit-cli/",
      },
    ],
    transforms: [convertH1ToTitle],
    linkTransform: {
      stripPrefixes: ["src/content/docs"],
      pathMappings: createStarlightPathMappings(),
    },
    enabled: true,
  },
];

const IMPORT_REMOTE = process.env.IMPORT_GITHUB === "true";
const GITHUB_API_CLIENT = new Octokit({ auth: import.meta.env.GITHUB_TOKEN });
const IS_DRY_RUN = process.env.IMPORT_DRY_RUN === "true";

export const collections = {
  docs: defineCollection({
    loader: {
      name: "algorand-docs",
      load: async (context) => {
        await docsLoader().load(context);

        if (IMPORT_REMOTE) {
          console.log("🔄 Importing content from GitHub repositories...");

          for (const config of REMOTE_CONTENT) {
            if (!config.enabled) continue;

            try {
              console.log(
                `📥 Loading ${config.name} (clear: ${config.clear})...`,
              );
              await githubLoader({
                octokit: GITHUB_API_CLIENT,
                configs: [config],
                clear: config.clear,
                dryRun: IS_DRY_RUN,
              }).load(context as LoaderContext);
              console.log(`✅ ${config.name} loaded successfully`);
            } catch (error) {
              console.error(`❌ Error loading ${config.name}:`, error);
            }
          }
        }
      },
    },
    schema: docsSchema(),
  }),
};
