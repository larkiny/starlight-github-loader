import { defineCollection } from "astro:content";
import { docsLoader } from "@astrojs/starlight/loaders";
import { docsSchema } from "@astrojs/starlight/schema";

import { Octokit } from "octokit";
import {
  githubLoader,
  type ImportOptions,
  type LoaderContext,
} from "@larkiny/astro-github-loader";
import { generateStarlightLinkMappings } from "../imports/transforms/links.js";
import {
  convertH1ToTitle,
  conditionalTransform,
  matchesPath,
  createRemoveContentUpToHeading,
} from "../imports/transforms/common.js";
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
        pattern: "docs/{features/**/*.md,algokit.md}",
        basePath: "src/content/docs/algokit/cli",
        pathMappings: {
          "docs/features/": "",
          "docs/algokit.md": "overview.md",
          "docs/cli/index.md": "index.md",
        },
        transforms: [
          conditionalTransform(
            (path) => matchesPath("docs/algokit.md", path),
            createFrontmatterTransform({
              frontmatter: {
                title: "AlgoKit CLI Overview",
                sidebar: { label: "Overview", order: 0 },
              },
              mode: "merge",
              preserveExisting: false,
            }),
          ),
        ],
      },
      {
        pattern: "docs/cli/index.md",
        basePath: "src/content/docs/reference/algokit-cli/",
        pathMappings: {
          "docs/cli/index.md": "index.md",
        },
        transforms: [createRemoveContentUpToHeading(/^# algokit$/m)],
      },
    ],
    transforms: [convertH1ToTitle],
    linkTransform: {
      stripPrefixes: ["src/content/docs"],
      linkMappings: [
        ...generateStarlightLinkMappings(),
        // Map unresolved CLI links to reference section
        {
          pattern: /^\.\.\/cli\/?$/,
          replacement: `/reference/algokit-cli`,
          global: true,
        },
        // Map README links to AlgoKit Introduction doc
        {
          pattern: /^\.\.\/\.\.\/README\.md$/,
          replacement: `/algokit/algokit-intro`,
          global: true,
        },
      ],
    },
    enabled: true,
  },
];

const IMPORT_REMOTE = process.env.IMPORT_GITHUB === "true";
const GITHUB_API_CLIENT = new Octokit({ auth: import.meta.env.GITHUB_TOKEN });
const IS_DRY_RUN = process.env.IMPORT_DRY_RUN === "true";
const FORCE_IMPORT = process.env.FORCE_IMPORT === "true";

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
              await githubLoader({
                octokit: GITHUB_API_CLIENT,
                configs: [config],
                clear: config.clear,
                dryRun: IS_DRY_RUN,
                force: FORCE_IMPORT,
              }).load(context as LoaderContext);
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
