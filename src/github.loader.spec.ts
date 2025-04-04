import {beforeEach, describe, it} from 'vitest'
import {github} from "./github.loader";
import {Octokit} from "octokit";

const FIXTURES = [
    {owner:"awesome-algorand", repo: "algokit-cli", ref: "docs/starlight-preview", path: ".devportal/starlight"}
]
describe('github loader', () => {
    let octokit: Octokit;
    beforeEach(()=>{
        octokit = new Octokit({auth: process.env.GITHUB_TOKEN})
    })

    it('should work', async () => {
        const result = github({octokit, configs:FIXTURES})

        console.log(result)
    })
})