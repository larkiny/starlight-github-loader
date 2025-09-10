import { beforeEach, describe, it, expect } from "vitest";
import { github } from "./github.loader.js";
import { Octokit } from "octokit";
const FIXTURES = [
    {
        owner: "awesome-algorand",
        repo: "algokit-cli",
        ref: "docs/starlight-preview",
        path: ".devportal/starlight",
    },
];
describe("github loader", () => {
    let octokit;
    beforeEach(() => {
        octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });
    });
    it("should work", async () => {
        const result = github({ octokit, configs: FIXTURES });
        console.log(result);
    });
    it("should support transforms", () => {
        const addPrefixTransform = (content) => `<!-- Generated -->\n${content}`;
        const removeCommentsTransform = (content) => content.replace(/<!--.*? -->/g, '');
        const result = github({
            octokit,
            configs: [{
                    ...FIXTURES[0],
                    transforms: [addPrefixTransform, removeCommentsTransform]
                }]
        });
        expect(result.name).toBe("github-loader");
        expect(typeof result.load).toBe("function");
    });
});
