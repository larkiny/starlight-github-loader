import { Octokit } from "octokit";
import { createAppAuth } from "@octokit/auth-app";

/**
 * Configuration options for GitHub App authentication
 */
export interface GitHubAppAuthConfig {
  /** GitHub App ID */
  appId: string | number;
  /** GitHub App private key (PEM format) */
  privateKey: string;
  /** GitHub App installation ID */
  installationId: string | number;
}

/**
 * Configuration options for Personal Access Token authentication
 */
export interface GitHubPATAuthConfig {
  /** Personal Access Token (classic or fine-grained) */
  token: string;
}

/**
 * Union type for authentication configuration
 */
export type GitHubAuthConfig = GitHubAppAuthConfig | GitHubPATAuthConfig;

/**
 * Type guard to check if config is GitHub App authentication
 */
function isGitHubAppAuth(config: GitHubAuthConfig): config is GitHubAppAuthConfig {
  return 'appId' in config && 'privateKey' in config && 'installationId' in config;
}

/**
 * Creates an authenticated Octokit instance with support for both Personal Access Tokens
 * and GitHub App authentication.
 *
 * **Rate Limits:**
 * - Personal Access Token: 5,000 requests/hour
 * - GitHub App: 15,000 requests/hour (3x higher)
 *
 * **GitHub App Setup:**
 * 1. Create a GitHub App: https://github.com/settings/apps/new
 * 2. Grant required permissions: Contents (read-only)
 * 3. Install the app to your organization/repositories
 * 4. Generate and download a private key
 * 5. Note your App ID and Installation ID
 *
 * @param config - Authentication configuration (PAT or GitHub App)
 * @returns Authenticated Octokit instance
 *
 * @example
 * // Using Personal Access Token
 * const octokit = createAuthenticatedOctokit({
 *   token: process.env.GITHUB_TOKEN
 * });
 *
 * @example
 * // Using GitHub App (recommended for higher rate limits)
 * const octokit = createAuthenticatedOctokit({
 *   appId: process.env.GITHUB_APP_ID,
 *   privateKey: process.env.GITHUB_APP_PRIVATE_KEY,
 *   installationId: process.env.GITHUB_APP_INSTALLATION_ID
 * });
 */
export function createAuthenticatedOctokit(config: GitHubAuthConfig): Octokit {
  if (isGitHubAppAuth(config)) {
    // GitHub App authentication (15,000 requests/hour)
    return new Octokit({
      authStrategy: createAppAuth,
      auth: {
        appId: config.appId,
        privateKey: config.privateKey,
        installationId: config.installationId,
      },
    });
  } else {
    // Personal Access Token authentication (5,000 requests/hour)
    return new Octokit({
      auth: config.token,
    });
  }
}

/**
 * Creates an authenticated Octokit instance from environment variables.
 * Automatically detects whether to use GitHub App or PAT authentication based on
 * which environment variables are present.
 *
 * **Priority:**
 * 1. GitHub App (if GITHUB_APP_ID, GITHUB_APP_PRIVATE_KEY, and GITHUB_APP_INSTALLATION_ID are set)
 * 2. Personal Access Token (if GITHUB_TOKEN is set)
 *
 * **Environment Variables:**
 *
 * For GitHub App (recommended - 15,000 req/hour):
 * - `GITHUB_APP_ID` - Your GitHub App ID
 * - `GITHUB_APP_PRIVATE_KEY` - Private key in PEM format (can be multiline or base64 encoded)
 * - `GITHUB_APP_INSTALLATION_ID` - Installation ID for your org/repos
 *
 * For Personal Access Token (5,000 req/hour):
 * - `GITHUB_TOKEN` - Your personal access token
 *
 * @returns Authenticated Octokit instance
 * @throws Error if no valid authentication credentials are found
 *
 * @example
 * // In your Astro config or content.config.ts
 * const octokit = createOctokitFromEnv();
 */
export function createOctokitFromEnv(): Octokit {
  // Check for GitHub App credentials (preferred)
  const appId = process.env.GITHUB_APP_ID;
  const privateKey = process.env.GITHUB_APP_PRIVATE_KEY;
  const installationId = process.env.GITHUB_APP_INSTALLATION_ID;

  if (appId && privateKey && installationId) {
    // Decode private key if it's base64 encoded (for easier .env storage)
    let decodedPrivateKey = privateKey;
    if (!privateKey.includes('BEGIN RSA PRIVATE KEY') && !privateKey.includes('BEGIN PRIVATE KEY')) {
      try {
        decodedPrivateKey = Buffer.from(privateKey, 'base64').toString('utf-8');
      } catch {
        // If decoding fails, use as-is (might already be plaintext)
      }
    }

    console.log('✓ Using GitHub App authentication (15,000 requests/hour)');
    return createAuthenticatedOctokit({
      appId,
      privateKey: decodedPrivateKey,
      installationId,
    });
  }

  // Fallback to Personal Access Token
  const token = process.env.GITHUB_TOKEN;
  if (token) {
    console.log('✓ Using Personal Access Token authentication (5,000 requests/hour)');
    console.log('💡 Consider switching to GitHub App for 3x higher rate limits');
    return createAuthenticatedOctokit({ token });
  }

  throw new Error(
    'No GitHub authentication credentials found. Please set either:\n' +
    '  - GITHUB_TOKEN (for PAT authentication)\n' +
    '  - GITHUB_APP_ID, GITHUB_APP_PRIVATE_KEY, GITHUB_APP_INSTALLATION_ID (for GitHub App authentication)'
  );
}
