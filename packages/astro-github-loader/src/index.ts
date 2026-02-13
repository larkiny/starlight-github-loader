// Public API — functions
export { githubLoader } from "./github.loader.js";
export {
  createAuthenticatedOctokit,
  createOctokitFromEnv,
} from "./github.auth.js";

// Public API — types: loader config
export type {
  GithubLoaderOptions,
  ImportOptions,
  FetchOptions,
  IncludePattern,
  PathMappingValue,
  EnhancedPathMapping,
  VersionConfig,
  LoaderContext,
} from "./github.types.js";

// Public API — types: transforms
export type {
  TransformFunction,
  TransformContext,
  MatchedPattern,
} from "./github.types.js";

// Public API — types: link transforms
export type {
  LinkMapping,
  LinkTransformContext,
  ImportLinkTransformOptions,
} from "./github.types.js";
export type { LinkHandler } from "./github.link-transform.js";

// Public API — types: auth
export type {
  GitHubAuthConfig,
  GitHubAppAuthConfig,
  GitHubPATAuthConfig,
} from "./github.auth.js";

// Public API — types: logging
export type { LogLevel } from "./github.logger.js";
