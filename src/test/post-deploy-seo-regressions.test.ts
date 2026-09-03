import { describe, expect, it } from "vitest";

import { runPostDeployCheck } from "../../scripts/post-deploy-check.mjs";

describe("post-deploy content rejection", () => {
  it("accepts expected content when rejected markers are absent", async () => {
    const result = await runPostDeployCheck([
      {
        url: "data:text/plain,TOK%20healthy%20SEO",
        expect: ["TOK", "SEO"],
        reject: ["moto911.com", "Monsite"],
      },
    ]);
    expect(result.ok).toBe(true);
    expect(result.failures).toEqual([]);
  });

  it("fails when a forbidden SEO regression marker is present", async () => {
    const result = await runPostDeployCheck([
      {
        url: "data:text/plain,TOK%20Monsite",
        expect: ["TOK"],
        reject: ["Monsite"],
      },
    ]);
    expect(result.ok).toBe(false);
    expect(result.failures.some((failure) => failure.includes("contains rejected content: Monsite"))).toBe(true);
  });
});
