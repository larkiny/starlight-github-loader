import { describe, it, expect } from "vitest";
import {
  globalLinkTransform,
  generateAutoLinkMappings,
  type ImportedFile,
  type LinkHandler,
} from "./github.link-transform.js";
import type {
  LinkMapping,
  IncludePattern,
  LinkTransformContext,
} from "./github.types.js";
import { createLogger } from "./github.logger.js";

describe("globalLinkTransform", () => {
  const logger = createLogger("silent");

  function createImportedFile(
    sourcePath: string,
    targetPath: string,
    content: string,
    id: string = sourcePath,
    linkContext?: LinkTransformContext,
  ): ImportedFile {
    return {
      sourcePath,
      targetPath,
      content,
      id,
      linkContext,
    };
  }

  describe("internal markdown link transformations", () => {
    it("should transform relative markdown links between files", () => {
      const files: ImportedFile[] = [
        createImportedFile(
          "docs/guide.md",
          "src/content/docs/guide.md",
          "[See intro](./intro.md)",
        ),
        createImportedFile(
          "docs/intro.md",
          "src/content/docs/intro.md",
          "# Intro",
        ),
      ];

      const result = globalLinkTransform(files, {
        stripPrefixes: ["src/content/docs"],
        logger,
      });

      expect(result[0].content).toBe("[See intro](/intro/)");
    });

    it("should handle links with ./ prefix", () => {
      const files: ImportedFile[] = [
        createImportedFile(
          "docs/guide.md",
          "src/content/docs/guide.md",
          "[Link](./other.md)",
        ),
        createImportedFile(
          "docs/other.md",
          "src/content/docs/other.md",
          "# Other",
        ),
      ];

      const result = globalLinkTransform(files, {
        stripPrefixes: ["src/content/docs"],
        logger,
      });

      expect(result[0].content).toBe("[Link](/other/)");
    });

    it("should handle links with ../ prefix", () => {
      const files: ImportedFile[] = [
        createImportedFile(
          "docs/api/client.md",
          "src/content/docs/api/client.md",
          "[Guide](../guide.md)",
        ),
        createImportedFile(
          "docs/guide.md",
          "src/content/docs/guide.md",
          "# Guide",
        ),
      ];

      const result = globalLinkTransform(files, {
        stripPrefixes: ["src/content/docs"],
        logger,
      });

      expect(result[0].content).toBe("[Guide](/guide/)");
    });

    it("should handle relative links without ./ prefix", () => {
      const files: ImportedFile[] = [
        createImportedFile(
          "docs/guide.md",
          "src/content/docs/guide.md",
          "[See other](other.md)",
        ),
        createImportedFile(
          "docs/other.md",
          "src/content/docs/other.md",
          "# Other",
        ),
      ];

      const result = globalLinkTransform(files, {
        stripPrefixes: ["src/content/docs"],
        logger,
      });

      expect(result[0].content).toBe("[See other](/other/)");
    });

    it("should apply global linkMappings to bare-path links before normalization", () => {
      const files: ImportedFile[] = [
        createImportedFile(
          "docs/markdown/capabilities/guide.md",
          "src/content/docs/guide.md",
          "[`AccountManager`](docs/markdown/autoapi/algokit_utils/accounts/account_manager/#algokit_utils.accounts.account_manager.AccountManager)",
        ),
      ];

      const result = globalLinkTransform(files, {
        stripPrefixes: ["src/content/docs"],
        linkMappings: [
          {
            pattern: /^docs\/markdown\/autoapi\/algokit_utils\/(.+)/,
            replacement: "/docs/algokit-utils/python/latest/api/$1",
            global: true,
          },
        ],
        logger,
      });

      expect(result[0].content).toBe(
        "[`AccountManager`](/docs/algokit-utils/python/latest/api/accounts/account_manager/#algokit_utils.accounts.account_manager.AccountManager)",
      );
    });

    it("should not early-return relative ./ links when .md-stripping global mappings exist", () => {
      const files: ImportedFile[] = [
        createImportedFile(
          "docs/guide.md",
          "src/content/docs/guide.md",
          "[Subscriber](./subscriber.md)",
        ),
        createImportedFile(
          "docs/subscriber.md",
          "src/content/docs/subscriber.md",
          "# Subscriber",
        ),
      ];

      const result = globalLinkTransform(files, {
        stripPrefixes: ["src/content/docs"],
        linkMappings: [
          {
            pattern: /\.md(#|$)/,
            replacement: "$1",
            global: true,
          },
          {
            pattern: /\/index(\.md)?$/,
            replacement: "/",
            global: true,
          },
        ],
        logger,
      });

      // Should resolve via sourceToTargetMap, not early-return from .md stripping
      expect(result[0].content).toBe("[Subscriber](/subscriber/)");
    });

    it("should not early-return relative ../ links when global mappings exist", () => {
      const files: ImportedFile[] = [
        createImportedFile(
          "docs/guides/intro.md",
          "src/content/docs/guides/intro.md",
          "[Overview](../overview.md)",
        ),
        createImportedFile(
          "docs/overview.md",
          "src/content/docs/overview.md",
          "# Overview",
        ),
      ];

      const result = globalLinkTransform(files, {
        stripPrefixes: ["src/content/docs"],
        linkMappings: [
          {
            pattern: /\.md(#|$)/,
            replacement: "$1",
            global: true,
          },
        ],
        logger,
      });

      // Should resolve via normalization + sourceToTargetMap
      expect(result[0].content).toBe("[Overview](/overview/)");
    });

    it("should not early-return single-segment bare-path sibling references", () => {
      // Single-segment bare paths like "page-b.md" are sibling-file references.
      // They must go through normalizePath() (joining with current dir) to resolve
      // via sourceToTargetMap, NOT be caught by the bare-path pre-normalization check.
      const files: ImportedFile[] = [
        createImportedFile(
          "docs/api/page-a.md",
          "src/content/docs/api/page-a.md",
          "[See B](page-b.md#section)",
        ),
        createImportedFile(
          "docs/api/page-b.md",
          "src/content/docs/api/page-b.md",
          "# Page B",
        ),
      ];

      const result = globalLinkTransform(files, {
        stripPrefixes: ["src/content/docs"],
        linkMappings: [
          {
            pattern: /\.md(#|$)/,
            replacement: "$1",
            global: true,
          },
        ],
        logger,
      });

      // "page-b.md" normalizes to "docs/api/page-b.md", resolves via sourceToTargetMap
      expect(result[0].content).toBe("[See B](/api/page-b/#section)");
    });

    it("should preserve anchors in transformed links", () => {
      const files: ImportedFile[] = [
        createImportedFile(
          "docs/guide.md",
          "src/content/docs/guide.md",
          "[Section](./intro.md#setup)",
        ),
        createImportedFile(
          "docs/intro.md",
          "src/content/docs/intro.md",
          "# Intro",
        ),
      ];

      const result = globalLinkTransform(files, {
        stripPrefixes: ["src/content/docs"],
        logger,
      });

      expect(result[0].content).toBe("[Section](/intro/#setup)");
    });

    it("should handle nested directory structures", () => {
      const files: ImportedFile[] = [
        createImportedFile(
          "docs/api/v1/endpoints.md",
          "src/content/docs/api/v1/endpoints.md",
          "[Auth](../auth/index.md)",
        ),
        createImportedFile(
          "docs/api/auth/index.md",
          "src/content/docs/api/auth/index.md",
          "# Auth",
        ),
      ];

      const result = globalLinkTransform(files, {
        stripPrefixes: ["src/content/docs"],
        logger,
      });

      expect(result[0].content).toBe("[Auth](/api/auth/)");
    });

    it("should handle index.md files correctly", () => {
      const files: ImportedFile[] = [
        createImportedFile(
          "docs/guide.md",
          "src/content/docs/guide.md",
          "[API](./api/index.md)",
        ),
        createImportedFile(
          "docs/api/index.md",
          "src/content/docs/api/index.md",
          "# API",
        ),
      ];

      const result = globalLinkTransform(files, {
        stripPrefixes: ["src/content/docs"],
        logger,
      });

      expect(result[0].content).toBe("[API](/api/)");
    });

    it("should strip .md extension from unresolved internal links", () => {
      const files: ImportedFile[] = [
        createImportedFile(
          "docs/guide.md",
          "src/content/docs/guide.md",
          "[External doc](./missing.md)",
        ),
      ];

      const result = globalLinkTransform(files, {
        stripPrefixes: ["src/content/docs"],
        logger,
      });

      expect(result[0].content).toBe("[External doc](docs/missing)");
    });
  });

  describe("external link preservation", () => {
    it("should preserve https:// links", () => {
      const files: ImportedFile[] = [
        createImportedFile(
          "docs/guide.md",
          "src/content/docs/guide.md",
          "[GitHub](https://github.com)",
        ),
      ];

      const result = globalLinkTransform(files, {
        stripPrefixes: ["src/content/docs"],
        logger,
      });

      expect(result[0].content).toBe("[GitHub](https://github.com)");
    });

    it("should preserve http:// links", () => {
      const files: ImportedFile[] = [
        createImportedFile(
          "docs/guide.md",
          "src/content/docs/guide.md",
          "[Site](http://example.com)",
        ),
      ];

      const result = globalLinkTransform(files, {
        stripPrefixes: ["src/content/docs"],
        logger,
      });

      expect(result[0].content).toBe("[Site](http://example.com)");
    });

    it("should preserve mailto: links", () => {
      const files: ImportedFile[] = [
        createImportedFile(
          "docs/guide.md",
          "src/content/docs/guide.md",
          "[Email](mailto:test@example.com)",
        ),
      ];

      const result = globalLinkTransform(files, {
        stripPrefixes: ["src/content/docs"],
        logger,
      });

      expect(result[0].content).toBe("[Email](mailto:test@example.com)");
    });

    it("should preserve ftp:// links", () => {
      const files: ImportedFile[] = [
        createImportedFile(
          "docs/guide.md",
          "src/content/docs/guide.md",
          "[FTP](ftp://ftp.example.com)",
        ),
      ];

      const result = globalLinkTransform(files, {
        stripPrefixes: ["src/content/docs"],
        logger,
      });

      expect(result[0].content).toBe("[FTP](ftp://ftp.example.com)");
    });

    it("should preserve data: URLs", () => {
      const files: ImportedFile[] = [
        createImportedFile(
          "docs/guide.md",
          "src/content/docs/guide.md",
          "[Data](data:text/plain;base64,SGVsbG8=)",
        ),
      ];

      const result = globalLinkTransform(files, {
        stripPrefixes: ["src/content/docs"],
        logger,
      });

      expect(result[0].content).toBe("[Data](data:text/plain;base64,SGVsbG8=)");
    });

    it("should preserve anchor-only links", () => {
      const files: ImportedFile[] = [
        createImportedFile(
          "docs/guide.md",
          "src/content/docs/guide.md",
          "[Section](#heading)",
        ),
      ];

      const result = globalLinkTransform(files, {
        stripPrefixes: ["src/content/docs"],
        logger,
      });

      expect(result[0].content).toBe("[Section](#heading)");
    });
  });

  describe("link mappings with string patterns", () => {
    it("should apply string pattern replacements", () => {
      const files: ImportedFile[] = [
        createImportedFile(
          "docs/guide.md",
          "src/content/docs/guide.md",
          "[API](api/client.md)",
        ),
      ];

      const linkMappings: LinkMapping[] = [
        {
          pattern: "api/",
          replacement: "reference/api/",
        },
      ];

      const result = globalLinkTransform(files, {
        stripPrefixes: ["src/content/docs"],
        linkMappings,
        logger,
      });

      // Link is normalized to docs/api/client.md, mapping is applied, then .md is stripped
      expect(result[0].content).toBe("[API](docs/reference/api/client.md)");
    });

    it("should apply multiple string pattern replacements in sequence", () => {
      const files: ImportedFile[] = [
        createImportedFile(
          "docs/guide.md",
          "src/content/docs/guide.md",
          "[API](docs/api/client.md)",
        ),
      ];

      const linkMappings: LinkMapping[] = [
        {
          pattern: "docs/",
          replacement: "content/docs/",
        },
        {
          pattern: "api/",
          replacement: "reference/api/",
        },
      ];

      const result = globalLinkTransform(files, {
        stripPrefixes: ["src/content/docs"],
        linkMappings,
        logger,
      });

      // Both mappings are applied in sequence, then .md is stripped at the end
      expect(result[0].content).toBe(
        "[API](content/docs/docs/reference/api/client.md)",
      );
    });

    it("should handle string pattern with function replacement", () => {
      const files: ImportedFile[] = [
        createImportedFile(
          "docs/guide.md",
          "src/content/docs/guide.md",
          "[API](api/client.md)",
        ),
      ];

      const linkMappings: LinkMapping[] = [
        {
          pattern: "api/",
          replacement: (match: string) => match.replace("api/", "reference/"),
        },
      ];

      const result = globalLinkTransform(files, {
        stripPrefixes: ["src/content/docs"],
        linkMappings,
        logger,
      });

      // Normalized to docs/api/client.md, mapping replaces api/ with reference/, .md remains
      expect(result[0].content).toBe("[API](docs/reference/client.md)");
    });
  });

  describe("link mappings with regex patterns", () => {
    it("should apply regex pattern replacements", () => {
      const files: ImportedFile[] = [
        createImportedFile(
          "docs/guide.md",
          "src/content/docs/guide.md",
          "[API](api/v1/client.md)",
        ),
      ];

      const linkMappings: LinkMapping[] = [
        {
          pattern: /^docs\/api\/v\d+\//,
          replacement: "docs/reference/api/",
        },
      ];

      const result = globalLinkTransform(files, {
        stripPrefixes: ["src/content/docs"],
        linkMappings,
        logger,
      });

      // Normalized to docs/api/v1/client.md, pattern matches, replacement applied
      expect(result[0].content).toBe("[API](docs/reference/api/client.md)");
    });

    it("should handle regex pattern with capture groups", () => {
      const files: ImportedFile[] = [
        createImportedFile(
          "docs/guide.md",
          "src/content/docs/guide.md",
          "[API](api/v2/client.md)",
        ),
      ];

      const linkMappings: LinkMapping[] = [
        {
          pattern: /^docs\/api\/(v\d+)\//,
          replacement: "docs/reference/$1/",
        },
      ];

      const result = globalLinkTransform(files, {
        stripPrefixes: ["src/content/docs"],
        linkMappings,
        logger,
      });

      // Normalized to docs/api/v2/client.md, capture group preserved in replacement
      expect(result[0].content).toBe("[API](docs/reference/v2/client.md)");
    });

    it("should handle regex pattern with function replacement", () => {
      const files: ImportedFile[] = [
        createImportedFile(
          "docs/guide.md",
          "src/content/docs/guide.md",
          "[API](api/client.md)",
        ),
      ];

      const linkMappings: LinkMapping[] = [
        {
          pattern: /^docs\/api\/(.+)$/,
          replacement: (match: string) => match.toUpperCase(),
        },
      ];

      const result = globalLinkTransform(files, {
        stripPrefixes: ["src/content/docs"],
        linkMappings,
        logger,
      });

      // Normalized to docs/api/client.md, function transforms entire path to uppercase
      expect(result[0].content).toBe("[API](DOCS/API/CLIENT.MD)");
    });
  });

  describe("contextFilter on link mappings", () => {
    it("should apply mapping when contextFilter returns true", () => {
      const linkContext: LinkTransformContext = {
        sourcePath: "docs/api/guide.md",
        targetPath: "src/content/docs/api/guide.md",
        basePath: "src/content/docs/api",
      };

      const files: ImportedFile[] = [
        createImportedFile(
          "docs/api/guide.md",
          "src/content/docs/api/guide.md",
          "[Ref](../ref/client.md)",
          "docs/api/guide",
          linkContext,
        ),
      ];

      const linkMappings: LinkMapping[] = [
        {
          pattern: "docs/ref/",
          replacement: "docs/reference/",
          contextFilter: (ctx) => ctx.basePath.includes("api"),
        },
      ];

      const result = globalLinkTransform(files, {
        stripPrefixes: ["src/content/docs"],
        linkMappings,
        logger,
      });

      // Normalized to docs/ref/client.md, mapping applied because contextFilter returns true
      expect(result[0].content).toBe("[Ref](docs/reference/client.md)");
    });

    it("should skip mapping when contextFilter returns false", () => {
      const linkContext: LinkTransformContext = {
        sourcePath: "docs/guides/tutorial.md",
        targetPath: "src/content/docs/guides/tutorial.md",
        basePath: "src/content/docs/guides",
      };

      const files: ImportedFile[] = [
        createImportedFile(
          "docs/guides/tutorial.md",
          "src/content/docs/guides/tutorial.md",
          "[Ref](../ref/client.md)",
          "docs/guides/tutorial",
          linkContext,
        ),
      ];

      const linkMappings: LinkMapping[] = [
        {
          pattern: "ref/",
          replacement: "reference/",
          contextFilter: (ctx) => ctx.basePath.includes("api"),
        },
      ];

      const result = globalLinkTransform(files, {
        stripPrefixes: ["src/content/docs"],
        linkMappings,
        logger,
      });

      // Mapping should not be applied since contextFilter returns false
      expect(result[0].content).toBe("[Ref](docs/ref/client)");
    });

    it("should apply mapping when no contextFilter is specified", () => {
      const linkContext: LinkTransformContext = {
        sourcePath: "docs/guide.md",
        targetPath: "src/content/docs/guide.md",
        basePath: "src/content/docs",
      };

      const files: ImportedFile[] = [
        createImportedFile(
          "docs/guide.md",
          "src/content/docs/guide.md",
          "[API](api/client.md)",
          "docs/guide",
          linkContext,
        ),
      ];

      const linkMappings: LinkMapping[] = [
        {
          pattern: "docs/api/",
          replacement: "docs/reference/",
        },
      ];

      const result = globalLinkTransform(files, {
        stripPrefixes: ["src/content/docs"],
        linkMappings,
        logger,
      });

      // Normalized to docs/api/client.md, mapping applied
      expect(result[0].content).toBe("[API](docs/reference/client.md)");
    });
  });

  describe("stripPrefixes configuration", () => {
    it("should strip single prefix from URLs", () => {
      const files: ImportedFile[] = [
        createImportedFile(
          "docs/guide.md",
          "src/content/docs/guide.md",
          "[Other](./other.md)",
        ),
        createImportedFile(
          "docs/other.md",
          "src/content/docs/other.md",
          "# Other",
        ),
      ];

      const result = globalLinkTransform(files, {
        stripPrefixes: ["src/content/docs"],
        logger,
      });

      expect(result[0].content).toBe("[Other](/other/)");
    });

    it("should strip multiple prefixes, using first match", () => {
      const files: ImportedFile[] = [
        createImportedFile(
          "docs/guide.md",
          "src/content/docs/main/guide.md",
          "[Other](./other.md)",
        ),
        createImportedFile(
          "docs/other.md",
          "src/content/docs/main/other.md",
          "# Other",
        ),
      ];

      const result = globalLinkTransform(files, {
        stripPrefixes: ["src/content/docs/main", "src/content/docs"],
        logger,
      });

      expect(result[0].content).toBe("[Other](/other/)");
    });

    it("should handle empty stripPrefixes array", () => {
      const files: ImportedFile[] = [
        createImportedFile(
          "docs/guide.md",
          "docs/guide.md",
          "[Other](./other.md)",
        ),
        createImportedFile("docs/other.md", "docs/other.md", "# Other"),
      ];

      const result = globalLinkTransform(files, {
        stripPrefixes: [],
        logger,
      });

      expect(result[0].content).toBe("[Other](/docs/other/)");
    });
  });

  describe("custom handlers", () => {
    it("should apply custom handler when test returns true", () => {
      const files: ImportedFile[] = [
        createImportedFile(
          "docs/guide.md",
          "src/content/docs/guide.md",
          "[Custom](unresolved.md)",
        ),
      ];

      const customHandlers: LinkHandler[] = [
        {
          test: (link) => link.includes("unresolved"),
          transform: (link) =>
            link.replace("docs/unresolved", "/special/handled"),
        },
      ];

      const result = globalLinkTransform(files, {
        stripPrefixes: ["src/content/docs"],
        customHandlers,
        logger,
      });

      // Custom handlers receive the normalized path (docs/unresolved.md)
      expect(result[0].content).toBe("[Custom](/special/handled.md)");
    });

    it("should not apply custom handler when test returns false", () => {
      const files: ImportedFile[] = [
        createImportedFile(
          "docs/guide.md",
          "src/content/docs/guide.md",
          "[Normal](./other.md)",
        ),
        createImportedFile(
          "docs/other.md",
          "src/content/docs/other.md",
          "# Other",
        ),
      ];

      const customHandlers: LinkHandler[] = [
        {
          test: (link) => link.startsWith("custom://"),
          transform: (link) => link.replace("custom://", "/special/"),
        },
      ];

      const result = globalLinkTransform(files, {
        stripPrefixes: ["src/content/docs"],
        customHandlers,
        logger,
      });

      expect(result[0].content).toBe("[Normal](/other/)");
    });

    it("should apply first matching custom handler", () => {
      const files: ImportedFile[] = [
        createImportedFile(
          "docs/guide.md",
          "src/content/docs/guide.md",
          "[Link](special.md)",
        ),
      ];

      const customHandlers: LinkHandler[] = [
        {
          test: (link) => link.includes("special"),
          transform: (link) => link.replace("special", "first"),
        },
        {
          test: (link) => link.includes("special"),
          transform: (link) => link.replace("special", "second"),
        },
      ];

      const result = globalLinkTransform(files, {
        stripPrefixes: ["src/content/docs"],
        customHandlers,
        logger,
      });

      // First matching handler is applied
      expect(result[0].content).toBe("[Link](docs/first.md)");
    });
  });

  describe("complex scenarios", () => {
    it("should handle multiple links in the same file", () => {
      const files: ImportedFile[] = [
        createImportedFile(
          "docs/guide.md",
          "src/content/docs/guide.md",
          "[Intro](./intro.md) and [API](./api.md) and [External](https://example.com)",
        ),
        createImportedFile(
          "docs/intro.md",
          "src/content/docs/intro.md",
          "# Intro",
        ),
        createImportedFile("docs/api.md", "src/content/docs/api.md", "# API"),
      ];

      const result = globalLinkTransform(files, {
        stripPrefixes: ["src/content/docs"],
        logger,
      });

      expect(result[0].content).toBe(
        "[Intro](/intro/) and [API](/api/) and [External](https://example.com)",
      );
    });

    it("should handle links with complex anchors", () => {
      const files: ImportedFile[] = [
        createImportedFile(
          "docs/guide.md",
          "src/content/docs/guide.md",
          "[Section](./intro.md#complex-section-name-123)",
        ),
        createImportedFile(
          "docs/intro.md",
          "src/content/docs/intro.md",
          "# Intro",
        ),
      ];

      const result = globalLinkTransform(files, {
        stripPrefixes: ["src/content/docs"],
        logger,
      });

      expect(result[0].content).toBe(
        "[Section](/intro/#complex-section-name-123)",
      );
    });

    it("should transform all files in the array", () => {
      const files: ImportedFile[] = [
        createImportedFile(
          "docs/guide.md",
          "src/content/docs/guide.md",
          "[Intro](./intro.md)",
        ),
        createImportedFile(
          "docs/intro.md",
          "src/content/docs/intro.md",
          "[Guide](./guide.md)",
        ),
      ];

      const result = globalLinkTransform(files, {
        stripPrefixes: ["src/content/docs"],
        logger,
      });

      expect(result[0].content).toBe("[Intro](/intro/)");
      expect(result[1].content).toBe("[Guide](/guide/)");
    });

    it("should preserve original file properties except content", () => {
      const linkContext: LinkTransformContext = {
        sourcePath: "docs/guide.md",
        targetPath: "src/content/docs/guide.md",
        basePath: "src/content/docs",
      };

      const files: ImportedFile[] = [
        createImportedFile(
          "docs/guide.md",
          "src/content/docs/guide.md",
          "[Intro](./intro.md)",
          "custom-id",
          linkContext,
        ),
      ];

      const result = globalLinkTransform(files, {
        stripPrefixes: ["src/content/docs"],
        logger,
      });

      expect(result[0].sourcePath).toBe("docs/guide.md");
      expect(result[0].targetPath).toBe("src/content/docs/guide.md");
      expect(result[0].id).toBe("custom-id");
      expect(result[0].linkContext).toEqual(linkContext);
    });
  });

  describe("edge cases", () => {
    it("should handle empty file content", () => {
      const files: ImportedFile[] = [
        createImportedFile("docs/empty.md", "src/content/docs/empty.md", ""),
      ];

      const result = globalLinkTransform(files, {
        stripPrefixes: ["src/content/docs"],
        logger,
      });

      expect(result[0].content).toBe("");
    });

    it("should handle content with no links", () => {
      const files: ImportedFile[] = [
        createImportedFile(
          "docs/guide.md",
          "src/content/docs/guide.md",
          "# Guide\n\nThis is just text with no links.",
        ),
      ];

      const result = globalLinkTransform(files, {
        stripPrefixes: ["src/content/docs"],
        logger,
      });

      expect(result[0].content).toBe(
        "# Guide\n\nThis is just text with no links.",
      );
    });

    it("should handle malformed markdown links", () => {
      const files: ImportedFile[] = [
        createImportedFile(
          "docs/guide.md",
          "src/content/docs/guide.md",
          "[Incomplete link]()",
        ),
      ];

      const result = globalLinkTransform(files, {
        stripPrefixes: ["src/content/docs"],
        logger,
      });

      expect(result[0].content).toBe("[Incomplete link]()");
    });

    it("should handle empty array of files", () => {
      const files: ImportedFile[] = [];

      const result = globalLinkTransform(files, {
        stripPrefixes: ["src/content/docs"],
        logger,
      });

      expect(result).toEqual([]);
    });

    it("should handle link to directory ending with /", () => {
      const files: ImportedFile[] = [
        createImportedFile(
          "docs/guide.md",
          "src/content/docs/guide.md",
          "[API](./api/)",
        ),
        createImportedFile(
          "docs/api/index.md",
          "src/content/docs/api/index.md",
          "# API",
        ),
      ];

      const result = globalLinkTransform(files, {
        stripPrefixes: ["src/content/docs"],
        logger,
      });

      expect(result[0].content).toBe("[API](/api/)");
    });
  });
});

describe("generateAutoLinkMappings", () => {
  describe("basic functionality", () => {
    it("should return empty array when no pathMappings configured", () => {
      const includes: IncludePattern[] = [
        {
          pattern: "docs/**/*.md",
          basePath: "src/content/docs",
        },
      ];

      const result = generateAutoLinkMappings(includes);

      expect(result).toEqual([]);
    });

    it("should return empty array when includes is empty", () => {
      const includes: IncludePattern[] = [];

      const result = generateAutoLinkMappings(includes);

      expect(result).toEqual([]);
    });

    it("should generate link mapping for file mapping", () => {
      const includes: IncludePattern[] = [
        {
          pattern: "docs/**/*.md",
          basePath: "src/content/docs/api",
          pathMappings: {
            "docs/README.md": "overview.md",
          },
        },
      ];

      const result = generateAutoLinkMappings(
        includes,
        ["src/content/docs"],
      );

      expect(result).toHaveLength(1);
      expect(result[0].pattern).toBeInstanceOf(RegExp);
      expect(result[0].global).toBe(true);

      // Test that the pattern matches the exact file
      expect("docs/README.md").toMatch(result[0].pattern as RegExp);
      expect("docs/README.mdx").not.toMatch(result[0].pattern as RegExp);
    });

    it("should generate link mapping for folder mapping with trailing slash", () => {
      const includes: IncludePattern[] = [
        {
          pattern: "docs/**/*.md",
          basePath: "src/content/docs/api",
          pathMappings: {
            "docs/capabilities/": "features/",
          },
        },
      ];

      const result = generateAutoLinkMappings(
        includes,
        ["src/content/docs"],
      );

      expect(result).toHaveLength(1);
      expect(result[0].pattern).toBeInstanceOf(RegExp);
      expect(result[0].global).toBe(true);

      // Test that the pattern matches files in the folder
      expect("docs/capabilities/feature1.md").toMatch(
        result[0].pattern as RegExp,
      );
      expect("docs/capabilities/nested/feature2.md").toMatch(
        result[0].pattern as RegExp,
      );
      expect("docs/other/file.md").not.toMatch(result[0].pattern as RegExp);
    });

    it("should generate multiple link mappings for multiple pathMappings", () => {
      const includes: IncludePattern[] = [
        {
          pattern: "docs/**/*.md",
          basePath: "src/content/docs/api",
          pathMappings: {
            "docs/README.md": "overview.md",
            "docs/capabilities/": "features/",
            "docs/api.md": "index.md",
          },
        },
      ];

      const result = generateAutoLinkMappings(
        includes,
        ["src/content/docs"],
      );

      expect(result).toHaveLength(3);
      result.forEach((mapping) => {
        expect(mapping.global).toBe(true);
      });
    });
  });

  describe("enhanced path mapping with crossSectionPath", () => {
    it("should use explicit crossSectionPath when provided", () => {
      const includes: IncludePattern[] = [
        {
          pattern: "docs/api/**/*.md",
          basePath: "src/content/docs/reference/api",
          pathMappings: {
            "docs/api/": {
              target: "",
              crossSectionPath: "/custom/path/api",
            },
          },
        },
      ];

      const result = generateAutoLinkMappings(
        includes,
        ["src/content/docs"],
      );

      expect(result).toHaveLength(1);
      expect(result[0].global).toBe(true);

      // Test the replacement function
      if (typeof result[0].replacement === "function") {
        const transformedPath = result[0].replacement(
          "docs/api/client.md",
          "",
          {} as LinkTransformContext,
        );
        expect(transformedPath).toContain("/custom/path/api/");
      }
    });

    it("should infer crossSectionPath from basePath when not provided", () => {
      const includes: IncludePattern[] = [
        {
          pattern: "docs/api/**/*.md",
          basePath: "src/content/docs/reference/api",
          pathMappings: {
            "docs/api/": "",
          },
        },
      ];

      const result = generateAutoLinkMappings(
        includes,
        ["src/content/docs"],
      );

      expect(result).toHaveLength(1);

      // Test the replacement function - should infer /reference/api from basePath
      if (typeof result[0].replacement === "function") {
        const transformedPath = result[0].replacement(
          "docs/api/client.md",
          "",
          {} as LinkTransformContext,
        );
        expect(transformedPath).toContain("/reference/api/");
      }
    });

    it("should handle enhanced object format with empty target", () => {
      const includes: IncludePattern[] = [
        {
          pattern: "docs/api/**/*.md",
          basePath: "src/content/docs/reference/api",
          pathMappings: {
            "docs/api/": {
              target: "",
              crossSectionPath: "/reference/api",
            },
          },
        },
      ];

      const result = generateAutoLinkMappings(
        includes,
        ["src/content/docs"],
      );

      expect(result).toHaveLength(1);

      if (typeof result[0].replacement === "function") {
        const transformedPath = result[0].replacement(
          "docs/api/endpoints.md",
          "",
          {} as LinkTransformContext,
        );
        // With empty target, should just prepend crossSectionPath to relative path
        expect(transformedPath).toBe("/reference/api/endpoints/");
      }
    });

    it("should handle enhanced object format with non-empty target", () => {
      const includes: IncludePattern[] = [
        {
          pattern: "docs/api/**/*.md",
          basePath: "src/content/docs/reference",
          pathMappings: {
            "docs/api/": {
              target: "api/v2/",
              crossSectionPath: "/reference",
            },
          },
        },
      ];

      const result = generateAutoLinkMappings(
        includes,
        ["src/content/docs"],
      );

      expect(result).toHaveLength(1);

      if (typeof result[0].replacement === "function") {
        const transformedPath = result[0].replacement(
          "docs/api/client.md",
          "",
          {} as LinkTransformContext,
        );
        expect(transformedPath).toBe("/reference/api/v2/client/");
      }
    });

    it("should handle file mapping with enhanced object format", () => {
      const includes: IncludePattern[] = [
        {
          pattern: "docs/**/*.md",
          basePath: "src/content/docs/api",
          pathMappings: {
            "docs/README.md": {
              target: "overview.md",
              crossSectionPath: "/api",
            },
          },
        },
      ];

      const result = generateAutoLinkMappings(
        includes,
        ["src/content/docs"],
      );

      expect(result).toHaveLength(1);
      expect(result[0].global).toBe(true);

      if (typeof result[0].replacement === "function") {
        const transformedPath = result[0].replacement(
          "docs/README.md",
          "",
          {} as LinkTransformContext,
        );
        expect(transformedPath).toBe("/api/overview/");
      }
    });
  });

  describe("stripPrefixes handling", () => {
    it("should apply stripPrefixes in the generated mappings", () => {
      const includes: IncludePattern[] = [
        {
          pattern: "docs/**/*.md",
          basePath: "src/content/docs/api",
          pathMappings: {
            "docs/": "",
          },
        },
      ];

      const result = generateAutoLinkMappings(
        includes,
        ["src/content/docs"],
      );

      expect(result).toHaveLength(1);

      if (typeof result[0].replacement === "function") {
        const transformedPath = result[0].replacement(
          "docs/guide.md",
          "",
          {} as LinkTransformContext,
        );
        // Should strip src/content/docs prefix
        expect(transformedPath).toBe("/api/guide/");
      }
    });

    it("should work with empty stripPrefixes array", () => {
      const includes: IncludePattern[] = [
        {
          pattern: "docs/**/*.md",
          basePath: "content/docs",
          pathMappings: {
            "docs/": "",
          },
        },
      ];

      const result = generateAutoLinkMappings(includes, []);

      expect(result).toHaveLength(1);

      if (typeof result[0].replacement === "function") {
        const transformedPath = result[0].replacement(
          "docs/guide.md",
          "",
          {} as LinkTransformContext,
        );
        // No prefix stripping, should include full path
        expect(transformedPath).toMatch(/^\/content\/docs/);
      }
    });
  });

  describe("multiple include patterns", () => {
    it("should generate mappings from multiple include patterns", () => {
      const includes: IncludePattern[] = [
        {
          pattern: "docs/api/**/*.md",
          basePath: "src/content/docs/reference/api",
          pathMappings: {
            "docs/api/": "api/",
          },
        },
        {
          pattern: "docs/guides/**/*.md",
          basePath: "src/content/docs/guides",
          pathMappings: {
            "docs/guides/": "",
          },
        },
      ];

      const result = generateAutoLinkMappings(
        includes,
        ["src/content/docs"],
      );

      expect(result).toHaveLength(2);
      result.forEach((mapping) => {
        expect(mapping.global).toBe(true);
      });
    });

    it("should handle mix of patterns with and without pathMappings", () => {
      const includes: IncludePattern[] = [
        {
          pattern: "docs/api/**/*.md",
          basePath: "src/content/docs/api",
          pathMappings: {
            "docs/api/": "",
          },
        },
        {
          pattern: "docs/guides/**/*.md",
          basePath: "src/content/docs/guides",
          // No pathMappings
        },
      ];

      const result = generateAutoLinkMappings(
        includes,
        ["src/content/docs"],
      );

      expect(result).toHaveLength(1);
      expect(result[0].global).toBe(true);
    });
  });

  describe("special characters in paths", () => {
    it("should escape regex special characters in source paths", () => {
      const includes: IncludePattern[] = [
        {
          pattern: "docs/**/*.md",
          basePath: "src/content/docs",
          pathMappings: {
            "docs/c++/": "cpp/",
          },
        },
      ];

      const result = generateAutoLinkMappings(
        includes,
        ["src/content/docs"],
      );

      expect(result).toHaveLength(1);

      // The + should be escaped in the regex pattern
      expect("docs/c++/guide.md").toMatch(result[0].pattern as RegExp);
      expect("docs/cxx/guide.md").not.toMatch(result[0].pattern as RegExp);
    });

    it("should handle dots in path names", () => {
      const includes: IncludePattern[] = [
        {
          pattern: "docs/**/*.md",
          basePath: "src/content/docs",
          pathMappings: {
            "docs/v1.0/": "v1/",
          },
        },
      ];

      const result = generateAutoLinkMappings(
        includes,
        ["src/content/docs"],
      );

      expect(result).toHaveLength(1);

      // The dot should be escaped in the regex pattern
      expect("docs/v1.0/api.md").toMatch(result[0].pattern as RegExp);
      expect("docs/v1x0/api.md").not.toMatch(result[0].pattern as RegExp);
    });
  });
});
