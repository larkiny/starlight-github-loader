import { beforeEach, describe, it, expect } from "vitest";
import { githubLoader } from "./github.loader.js";
import { globalLinkTransform, type ImportedFile } from "./github.link-transform.js";
import { Octokit } from "octokit";

const FIXTURES = [
  {
    owner: "awesome-algorand",
    repo: "algokit-cli",
    ref: "docs/starlight-preview",
    path: ".devportal/starlight",
  },
];
describe("githubLoader", () => {
  let octokit: Octokit;
  beforeEach(() => {
    octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });
  });

  it("should work", async () => {
    const result = githubLoader({ octokit, configs: FIXTURES });

    console.log(result);
  });

  describe("context-aware link transformations", () => {
    it("should handle relative links from API files with contextFilter", () => {
      const testFiles: ImportedFile[] = [
        {
          id: "api-readme",
          sourcePath: "docs/code/README.md",
          targetPath: "src/content/docs/reference/algokit-utils-ts/api/README.md",
          content: 'Check out the [modules](modules/) for more info.',
          linkContext: {
            sourcePath: "docs/code/README.md",
            targetPath: "src/content/docs/reference/algokit-utils-ts/api/README.md",
            basePath: "src/content/docs/reference/algokit-utils-ts/api",
            pathMappings: { "docs/code/": "" }
          }
        },
        {
          id: "modules-index",
          sourcePath: "docs/code/modules/index.md",
          targetPath: "src/content/docs/reference/algokit-utils-ts/api/modules/index.md",
          content: 'This is the modules index.',
          linkContext: {
            sourcePath: "docs/code/modules/index.md",
            targetPath: "src/content/docs/reference/algokit-utils-ts/api/modules/index.md",
            basePath: "src/content/docs/reference/algokit-utils-ts/api",
            pathMappings: { "docs/code/": "" }
          }
        }
      ];

      const result = globalLinkTransform(testFiles, {
        stripPrefixes: ['src/content/docs'],
        linkMappings: [
          {
            contextFilter: (context) => context.sourcePath.startsWith('docs/code/'),
            relativeLinks: true,
            pattern: /.*/,
            replacement: '',
            global: false
          }
        ]
      });

      // The relative link `modules/` should be transformed to `/reference/algokit-utils-ts/api/modules/`
      expect(result[0].content).toContain('[modules](/reference/algokit-utils-ts/api/modules/)');
    });
  });
});
