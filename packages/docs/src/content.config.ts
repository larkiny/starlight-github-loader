import { defineCollection } from "astro:content";
import { docsLoader } from "@astrojs/starlight/loaders";
import { docsSchema } from "@astrojs/starlight/schema";

import { Octokit } from "octokit";
import {
  githubLoader,
  ImportOptions,
  LoaderContext,
} from "@larkiny/astro-github-loader";

const REMOTE_CONTENT: ImportOptions[] = [
  {
    name: "Algokit CLI Docs",
    owner: "larkiny",
    repo: "algokit-cli-docs",
    ref: "docs/starlight-preview",
    path: ".devportal/starlight",
    replace: ".devportal/starlight/",
    basePath: "src/content/docs/StaticDocs/imports",
    assetsPath: "src/assets/imports/algokit-cli",
    assetsBaseUrl: "~/assets/imports/algokit-cli",
    assetPatterns: [".png", ".jpg", ".jpeg", ".gif", ".svg", ".webp"],
    fileRenames: [
      { from: "references/index.mdx", to: "references/overview.mdx" },
    ],
    clear: false,
    enabled: true,
  },
];

const IMPORT_REMOTE = true;
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
