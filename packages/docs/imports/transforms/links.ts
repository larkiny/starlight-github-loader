import type { LinkMapping } from "@larkiny/astro-github-loader";

/**
 * Helper function to create common link mappings for this project
 */
export function createCommonLinkMappings(): LinkMapping[] {
  return [
    // Strip /index.md for Starlight routing (global - applies to all links)
    {
      pattern: /\/index\.md(#.*)?$/,
      replacement: (match: string, anchor: string) => {
        // Remove /index.md but preserve anchor
        return match.replace("/index.md", "");
      },
      global: true,
      description: "Strip /index.md for Starlight routing",
    },

    // Handle README.md -> overview (non-global - only unresolved links)
    {
      pattern: /\/README\.md(#.*)?$/,
      replacement: (match: string, anchor: string) => {
        return match.replace("/README.md", "/overview");
      },
      global: false,
      description: "Transform README.md to overview",
    },
  ];
}

/**
 * Helper function to create Starlight-specific link mappings for this project
 */
export function createStarlightLinkMappings(): LinkMapping[] {
  return [
    // Strip /index.md and /index (Starlight treats these specially)
    // Example: 'modules/index.md#some-anchor' -> 'modules/#some-anchor'
    {
      pattern: /\/index(\.md)?$/,
      replacement: "/",
      global: true,
      description: "Strip /index and /index.md for Starlight routing",
    },
  ];
}
