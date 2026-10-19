import { readFileSync } from "node:fs";
import path from "node:path";
import { Script } from "node:vm";
import { describe, expect, it } from "vitest";

const workflow = readFileSync(
  path.join(process.cwd(), ".github", "workflows", "deploy-production.yml"),
  "utf8",
);

type JobResult = "success" | "failure" | "cancelled" | "skipped";
type BaselineContext = {
  enabled?: string;
  baseline?: JobResult;
  gate?: JobResult;
  optionalJobs?: JobResult[];
  cancelled?: boolean;
};

function shouldRecordBaseline({
  enabled = "true",
  baseline = "success",
  gate = "success",
  optionalJobs = ["success"],
  cancelled = false,
}: BaselineContext) {
  const job = workflow.slice(workflow.indexOf("  record_production_baseline:"));
  const condition = job.match(/^ {4}if:\s*(?:>-\s*)?\$\{\{([\s\S]*?)\}\}/m)?.[1];
  if (!condition) throw new Error("Missing production baseline job condition");

  const results = [baseline, gate, ...optionalJobs];
  const success = () => !cancelled && results.every((result) => result === "success");
  // Actions adds success() when an if expression has no status function. A
  // legitimately skipped ancestor must not suppress this post-deployment job.
  if (!/\b(?:always|cancelled|failure|success)\s*\(/.test(condition) && !success()) {
    return false;
  }

  // This condition uses the shared JS/Actions boolean-expression subset. Run
  // the actual YAML expression, not a copy of its expected business rules.
  return new Script(condition).runInNewContext({
    vars: { PRODUCTION_DEPLOY_ENABLED: enabled },
    needs: { baseline: { result: baseline }, deployment_gate: { result: gate } },
    always: () => true,
    cancelled: () => cancelled,
    success,
    failure: () => results.includes("failure"),
  }, { timeout: 100 });
}

describe("production deployment provenance", () => {
  it("attaches the immutable GitHub commit SHA to Vercel deployment metadata", () => {
    expect(workflow).toContain('--meta githubCommitSha="$GITHUB_SHA"');
  });

  it.each<[string, BaselineContext, boolean]>([
    ["all required jobs succeed", {}, true],
    ["optional deployment jobs are skipped", { optionalJobs: ["skipped"] }, true],
    ["reading the previous baseline fails", { baseline: "failure" }, false],
    ["reading the previous baseline is skipped", { baseline: "skipped" }, false],
    ["the deployment gate fails", { gate: "failure" }, false],
    ["the deployment gate is skipped", { gate: "skipped" }, false],
    ["the deployment gate is cancelled", { gate: "cancelled" }, false],
    ["the workflow is cancelled after the gate", { cancelled: true }, false],
    ["production deployment is disabled", { enabled: "false" }, false],
    ["the production deployment flag is missing", { enabled: "" }, false],
  ])("records the production baseline correctly when %s", (_scenario, context, expected) => {
    expect(shouldRecordBaseline(context)).toBe(expected);
  });
});
