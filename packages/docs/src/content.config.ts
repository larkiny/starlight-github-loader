import { defineCollection } from "astro:content";
import { docsLoader } from "@astrojs/starlight/loaders";
import { docsSchema } from "@astrojs/starlight/schema";

import { Octokit } from "octokit";
import {
  githubLoader,
  type ImportOptions,
  type LoaderContext,
} from "@larkiny/astro-github-loader";
import { createStarlightLinkMappings } from "../imports/transforms/links.js";
import { convertH1ToTitle } from "../imports/transforms/common.js";
import {
  createFrontmatterTransform,
  createPathBasedFrontmatterTransform,
} from "../imports/transforms/frontmatter.js";

const REMOTE_CONTENT: ImportOptions[] = [
  {
    name: "AlgoKit CLI Docs",
    owner: "algorandfoundation",
    repo: "algokit-cli",
    ref: "chore/content-fix",
    assetsPath: "src/assets/imports/algokit/cli",
    assetsBaseUrl: "@assets/imports/algokit/cli",
    includes: [
      {
        pattern: "docs/features/**/*.md",
        basePath: "src/content/docs/algokit/cli",
      },
      {
        pattern: "docs/algokit.md",
        basePath: "src/content/docs/algokit/cli",
        transforms: [
          createFrontmatterTransform({
            frontmatter: {
              title: "AlgoKit CLI Overview",
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
      linkMappings: [
        ...createStarlightLinkMappings(),
        // Map ../cli/ to reference/algokit-cli for cross-repository links (after index.md is stripped)
        {
          pattern: /^\.\.\/cli\/?$/,
          replacement: (match: string, anchor: string) => {
            return `/reference/algokit-cli`;
          },
          global: true,
          description: "Map CLI reference links to reference section",
        },
        // Map README links to AlgoKit Introduction
        {
          pattern: /^\.\.\/\.\.\/README\.md$/,
          replacement: (match: string, anchor: string) => {
            return `/algokit/algokit-intro`;
          },
          global: true,
          description: "Map README links to AlgoKit Introduction",
        },
      ],
    },
    enabled: true,
  },
  {
    name: "AlgoKit Utils Python Docs",
    owner: "algorandfoundation",
    repo: "algokit-utils-py",
    ref: "chore/reference-docs",
    includes: [
      {
        pattern: "docs/markdown/autoapi/algokit_utils/**/*.md",
        basePath: "src/content/docs/reference/algokit-utils-py/api",
        pathMappings: {
          "docs/markdown/autoapi/algokit_utils/": "",
        },
      },
    ],
    transforms: [convertH1ToTitle],
    linkTransform: {
      stripPrefixes: ["src/content/docs"],
      linkMappings: [
        ...createStarlightLinkMappings(),
        {
          contextFilter: (context) =>
            context.sourcePath.startsWith("docs/markdown/autoapi/algokit_utils/"),
          relativeLinks: true,
          pattern: /.*/,
          replacement: (match: string, anchor: string, context: any) => {
            const relativePath = match.replace(/\.md$/, "");
            const finalPath = `/reference/algokit-utils-py/api/${relativePath}`;
            return finalPath.replace(/\/index$/, "/");
          },
          global: false,
        },
      ],
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
