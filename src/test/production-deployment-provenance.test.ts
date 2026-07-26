import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("production deployment provenance", () => {
  it("attaches the immutable GitHub commit SHA to Vercel deployment metadata", () => {
    const workflow = readFileSync(
      path.join(process.cwd(), ".github", "workflows", "deploy-production.yml"),
      "utf8",
    );

    expect(workflow).toContain('--meta githubCommitSha="$GITHUB_SHA"');
  });
});
