// @ts-check
import { defineConfig } from "astro/config";
import mdx from "@astrojs/mdx";
import starlight from "@astrojs/starlight";
import starlightTypeDoc, { typeDocSidebarGroup } from "starlight-typedoc";

// https://astro.build/config
export default defineConfig({
  integrations: [
    starlight({
      title: "astro-github-loader",
      plugins: [
        starlightTypeDoc({
          output: "typedoc",
          sidebar: {
            label: "Github Loader",
          },
          entryPoints: [
            "../astro-github-loader/src/index.ts",
          ],
          tsconfig: "../astro-github-loader/tsconfig.json",
        }),
      ],
      sidebar: [
        typeDocSidebarGroup,
        {
          label: "Getting Started",
          badge: { text: "Remote", variant: "danger" },
          autogenerate: { directory: "algokit" },
        },
        {
          label: "Reference",
          badge: { text: "Remote", variant: "danger" },
          autogenerate: { directory: "references" },
        },
      ],
    }),
    mdx(),
  ],
});
