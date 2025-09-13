import { defineCollection } from "astro:content";
import { docsLoader } from "@astrojs/starlight/loaders";
import { docsSchema } from "@astrojs/starlight/schema";

import { Octokit } from "octokit";
import {
  githubLoader,
  ImportOptions,
  LoaderContext,
} from "@larkiny/astro-github-loader";

// const octokit = new Octokit({ auth: import.meta.env.GITHUB_TOKEN });
// export const collections = {
//   docs: defineCollection({
//     loader: {
//       name: "github-starlight",
//       load: async (context) => {
//         await docsLoader().load(context);
//         await githubLoader({ octokit, configs: FIXTURES, clear: false }).load(
//           context as LoaderContext,
//         );
//       },
//     },
//     schema: docsSchema(),
//   }),
// };

const REMOTE_CONTENT: ImportOptions[] = [
  {
    owner: "awesome-algorand",
    repo: "algokit-cli",
    ref: "docs/starlight-preview",
    path: ".devportal/starlight",
    replace: ".devportal/starlight/",
    basePath: "src/content/docs/StaticDocs/imports",
    assetsPath: "src/assets/imports/algokit-cli",
    assetsBaseUrl: "~/assets/imports/algokit-cli",
    assetPatterns: [".png", ".jpg", ".jpeg", ".gif", ".svg", ".webp"],
    clear: false,
    enabled: true,
  },
];

const IMPORT_REMOTE = true;
const GITHUB_API_CLIENT = new Octokit({ auth: import.meta.env.GITHUB_TOKEN });

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
