import { beforeEach, describe, it } from "vitest";
import { githubLoader } from "./github.loader.js";
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
});
