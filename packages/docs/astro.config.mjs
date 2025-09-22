// @ts-check
import { defineConfig } from "astro/config";
import mdx from "@astrojs/mdx";
import { resolve } from "path";
import starlight from "@astrojs/starlight";
import starlightTypeDoc, { typeDocSidebarGroup } from "starlight-typedoc";

// https://astro.build/config
export default defineConfig({
  integrations: [
    starlight({
      title: "astro-github-loader",
      sidebar: [
        {
          label: "Introduction",
          link: "/getting-started/introduction",
        },
        {
          label: "AlgoKit Utils (Typescript)",
          badge: { text: "Remote", variant: "danger" },
          autogenerate: { directory: "algokit/cli" },
        },
        {
          label: "Reference",
          badge: { text: "Remote", variant: "danger" },
          items: [
            {
              label: "AlgoKit CLI Reference",
              link: "/reference/algokit-cli",
            },
          ],
        },
        // {
        //   label: "AlgoKit Utils FIXED",
        //   badge: { text: "Remote", variant: "danger" },
        //   autogenerate: { directory: "imported/algokit/cli" },
        // },
        // {
        //   label: "Reference FIXED",
        //   badge: { text: "Remote", variant: "danger" },
        //   autogenerate: { directory: "imported/reference/algokit/cli" },
        // },
      ],
    }),
    mdx(),
  ],
  vite: {
    resolve: {
      alias: {
        "@assets": resolve("./src/assets"),
      },
    },
  },
});
