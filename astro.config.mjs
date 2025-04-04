// @ts-check
import { defineConfig } from 'astro/config';

import mdx from '@astrojs/mdx';

import starlight from '@astrojs/starlight';

// https://astro.build/config
export default defineConfig({
  integrations: [ starlight({
    title: 'Castle Denada',
    sidebar: [
      {
        label: "Getting Started",
        autogenerate: { directory: 'algokit' },
      },
      {
        label: "Reference",
        autogenerate: { directory: 'references' },
      }
    ]
  }),mdx()]
});