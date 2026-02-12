import { describe, it, expect, vi, afterEach } from "vitest";
import { Octokit } from "octokit";
import {
  createAuthenticatedOctokit,
  createOctokitFromEnv,
  type GitHubAppAuthConfig,
  type GitHubPATAuthConfig,
} from "./github.auth";

describe("github.auth", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  describe("createAuthenticatedOctokit", () => {
    describe("with PAT config", () => {
      it("should create Octokit instance with PAT authentication", () => {
        const config: GitHubPATAuthConfig = {
          token: "ghp_testtoken123",
        };

        const octokit = createAuthenticatedOctokit(config);

        expect(octokit).toBeInstanceOf(Octokit);
      });

      it("should accept token from config", () => {
        const config: GitHubPATAuthConfig = {
          token: "ghp_anothertesttoken456",
        };

        expect(() => createAuthenticatedOctokit(config)).not.toThrow();
      });

      it("should create different instances for different tokens", () => {
        const config1: GitHubPATAuthConfig = { token: "ghp_token1" };
        const config2: GitHubPATAuthConfig = { token: "ghp_token2" };

        const octokit1 = createAuthenticatedOctokit(config1);
        const octokit2 = createAuthenticatedOctokit(config2);

        expect(octokit1).not.toBe(octokit2);
      });
    });

    describe("with GitHub App config", () => {
      it("should create Octokit instance with GitHub App authentication", () => {
        const config: GitHubAppAuthConfig = {
          appId: "12345",
          privateKey: "-----BEGIN RSA PRIVATE KEY-----\ntest\n-----END RSA PRIVATE KEY-----",
          installationId: "67890",
        };

        const octokit = createAuthenticatedOctokit(config);

        expect(octokit).toBeInstanceOf(Octokit);
      });

      it("should accept numeric appId and installationId", () => {
        const config: GitHubAppAuthConfig = {
          appId: 12345,
          privateKey: "-----BEGIN PRIVATE KEY-----\ntest\n-----END PRIVATE KEY-----",
          installationId: 67890,
        };

        expect(() => createAuthenticatedOctokit(config)).not.toThrow();
      });

      it("should accept string appId and installationId", () => {
        const config: GitHubAppAuthConfig = {
          appId: "12345",
          privateKey: "-----BEGIN RSA PRIVATE KEY-----\ntest\n-----END RSA PRIVATE KEY-----",
          installationId: "67890",
        };

        expect(() => createAuthenticatedOctokit(config)).not.toThrow();
      });

      it("should handle RSA PRIVATE KEY format", () => {
        const config: GitHubAppAuthConfig = {
          appId: "12345",
          privateKey: "-----BEGIN RSA PRIVATE KEY-----\nMIIEpAIBAAKCAQEA...\n-----END RSA PRIVATE KEY-----",
          installationId: "67890",
        };

        const octokit = createAuthenticatedOctokit(config);

        expect(octokit).toBeInstanceOf(Octokit);
      });

      it("should handle PRIVATE KEY format", () => {
        const config: GitHubAppAuthConfig = {
          appId: "12345",
          privateKey: "-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBgkqhkiG9w0BAQE...\n-----END PRIVATE KEY-----",
          installationId: "67890",
        };

        const octokit = createAuthenticatedOctokit(config);

        expect(octokit).toBeInstanceOf(Octokit);
      });
    });
  });

  describe("createOctokitFromEnv", () => {
    describe("with GITHUB_TOKEN", () => {
      it("should create Octokit from GITHUB_TOKEN environment variable", () => {
        vi.stubEnv("GITHUB_TOKEN", "ghp_envtoken123");
        const consoleSpy = vi.spyOn(console, "log");

        const octokit = createOctokitFromEnv();

        expect(octokit).toBeInstanceOf(Octokit);
        expect(consoleSpy).toHaveBeenCalledWith(
          "✓ Using Personal Access Token authentication (5,000 requests/hour)",
        );
        expect(consoleSpy).toHaveBeenCalledWith(
          "💡 Consider switching to GitHub App for 3x higher rate limits",
        );
      });

      it("should use PAT when only GITHUB_TOKEN is set", () => {
        vi.stubEnv("GITHUB_TOKEN", "ghp_token");

        expect(() => createOctokitFromEnv()).not.toThrow();
      });
    });

    describe("with GitHub App credentials", () => {
      it("should create Octokit from GitHub App environment variables", () => {
        vi.stubEnv("GITHUB_APP_ID", "12345");
        vi.stubEnv("GITHUB_APP_PRIVATE_KEY", "-----BEGIN RSA PRIVATE KEY-----\ntest\n-----END RSA PRIVATE KEY-----");
        vi.stubEnv("GITHUB_APP_INSTALLATION_ID", "67890");
        const consoleSpy = vi.spyOn(console, "log");

        const octokit = createOctokitFromEnv();

        expect(octokit).toBeInstanceOf(Octokit);
        expect(consoleSpy).toHaveBeenCalledWith(
          "✓ Using GitHub App authentication (15,000 requests/hour)",
        );
      });

      it("should prioritize GitHub App over PAT when both are set", () => {
        vi.stubEnv("GITHUB_APP_ID", "12345");
        vi.stubEnv("GITHUB_APP_PRIVATE_KEY", "-----BEGIN RSA PRIVATE KEY-----\ntest\n-----END RSA PRIVATE KEY-----");
        vi.stubEnv("GITHUB_APP_INSTALLATION_ID", "67890");
        vi.stubEnv("GITHUB_TOKEN", "ghp_token");
        const consoleSpy = vi.spyOn(console, "log");

        createOctokitFromEnv();

        expect(consoleSpy).toHaveBeenCalledWith(
          "✓ Using GitHub App authentication (15,000 requests/hour)",
        );
        expect(consoleSpy).not.toHaveBeenCalledWith(
          expect.stringContaining("Personal Access Token"),
        );
      });

      it("should decode base64-encoded private key", () => {
        const privateKey = "-----BEGIN RSA PRIVATE KEY-----\ntest\n-----END RSA PRIVATE KEY-----";
        const base64Key = Buffer.from(privateKey).toString("base64");

        vi.stubEnv("GITHUB_APP_ID", "12345");
        vi.stubEnv("GITHUB_APP_PRIVATE_KEY", base64Key);
        vi.stubEnv("GITHUB_APP_INSTALLATION_ID", "67890");

        expect(() => createOctokitFromEnv()).not.toThrow();
      });

      it("should use private key as-is if it contains BEGIN RSA PRIVATE KEY", () => {
        const privateKey = "-----BEGIN RSA PRIVATE KEY-----\nMIIEpAIBAAKCAQEA...\n-----END RSA PRIVATE KEY-----";

        vi.stubEnv("GITHUB_APP_ID", "12345");
        vi.stubEnv("GITHUB_APP_PRIVATE_KEY", privateKey);
        vi.stubEnv("GITHUB_APP_INSTALLATION_ID", "67890");

        expect(() => createOctokitFromEnv()).not.toThrow();
      });

      it("should use private key as-is if it contains BEGIN PRIVATE KEY", () => {
        const privateKey = "-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBgkqhkiG9w0BAQE...\n-----END PRIVATE KEY-----";

        vi.stubEnv("GITHUB_APP_ID", "12345");
        vi.stubEnv("GITHUB_APP_PRIVATE_KEY", privateKey);
        vi.stubEnv("GITHUB_APP_INSTALLATION_ID", "67890");

        expect(() => createOctokitFromEnv()).not.toThrow();
      });

      it("should handle decode failure gracefully and use key as-is", () => {
        const invalidBase64 = "not-valid-base64-or-pem!!!";

        vi.stubEnv("GITHUB_APP_ID", "12345");
        vi.stubEnv("GITHUB_APP_PRIVATE_KEY", invalidBase64);
        vi.stubEnv("GITHUB_APP_INSTALLATION_ID", "67890");

        // Should not throw during key processing
        expect(() => createOctokitFromEnv()).not.toThrow();
      });

      it("should not use GitHub App if only appId is set", () => {
        vi.stubEnv("GITHUB_APP_ID", "12345");

        expect(() => createOctokitFromEnv()).toThrow();
      });

      it("should not use GitHub App if only privateKey is set", () => {
        vi.stubEnv("GITHUB_APP_PRIVATE_KEY", "-----BEGIN RSA PRIVATE KEY-----\ntest\n-----END RSA PRIVATE KEY-----");

        expect(() => createOctokitFromEnv()).toThrow();
      });

      it("should not use GitHub App if only installationId is set", () => {
        vi.stubEnv("GITHUB_APP_INSTALLATION_ID", "67890");

        expect(() => createOctokitFromEnv()).toThrow();
      });

      it("should not use GitHub App if missing installationId", () => {
        vi.stubEnv("GITHUB_APP_ID", "12345");
        vi.stubEnv("GITHUB_APP_PRIVATE_KEY", "-----BEGIN RSA PRIVATE KEY-----\ntest\n-----END RSA PRIVATE KEY-----");

        expect(() => createOctokitFromEnv()).toThrow();
      });
    });

    describe("error cases", () => {
      it("should throw error when no credentials are set", () => {
        expect(() => createOctokitFromEnv()).toThrow(
          "No GitHub authentication credentials found",
        );
      });

      it("should include helpful error message with credential options", () => {
        expect(() => createOctokitFromEnv()).toThrow(/GITHUB_TOKEN/);
        expect(() => createOctokitFromEnv()).toThrow(/GITHUB_APP_ID/);
        expect(() => createOctokitFromEnv()).toThrow(/GITHUB_APP_PRIVATE_KEY/);
        expect(() => createOctokitFromEnv()).toThrow(/GITHUB_APP_INSTALLATION_ID/);
      });
    });
  });
});
