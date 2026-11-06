import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();

describe("production deploy concurrency", () => {
  it("cancels superseded production workflows instead of queueing stale deploys", () => {
    const workflow = readFileSync(
      resolve(root, ".github/workflows/deploy-production.yml"),
      "utf8",
    );

    expect(workflow).toContain("group: production-deploy");
    expect(workflow).toContain("cancel-in-progress: true");
    expect(workflow).not.toContain("cancel-in-progress: false");
    expect(workflow).not.toContain("queue: max");
  });
});
