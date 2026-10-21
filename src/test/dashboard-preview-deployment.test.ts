import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { Script } from "node:vm";
import { describe, expect, it } from "vitest";

const workflow = readFileSync(
  resolve(process.cwd(), ".github/workflows/dashboard-design-preview.yml"),
  "utf8",
);
const condition = workflow.match(/^ {4}if:\s*>-\s*\$\{\{([\s\S]*?)\}\}/m)?.[1];

function allowsPreview(repository: string, event: string, ref: string) {
  if (!condition) throw new Error("Missing explicit dashboard preview boundary");
  return new Script(condition).runInNewContext({
    github: { repository, event_name: event, ref },
  }, { timeout: 100 });
}

describe("dashboard preview deployment boundary", () => {
  it.each<[string, string, string, boolean]>([
    ["Mtnrconcept1/cloud-rebuild", "push", "refs/heads/codex/dashboard-ivory-redesign", true],
    ["Mtnrconcept1/cloud-rebuild", "push", "refs/heads/main", false],
    ["Mtnrconcept1/cloud-rebuild", "push", "refs/heads/another-feature", false],
    ["Mtnrconcept1/cloud-rebuild", "pull_request", "refs/heads/codex/dashboard-ivory-redesign", false],
    ["another-owner/cloud-rebuild", "push", "refs/heads/codex/dashboard-ivory-redesign", false],
  ])("allows only the requested branch (%s, %s, %s)", (repository, event, ref, allowed) => {
    expect(allowsPreview(repository, event, ref)).toBe(allowed);
  });

  it("limits triggers and credentials without changing the production deployment record", () => {
    expect(workflow).toMatch(/on:\s+push:\s+branches:\s+- codex\/dashboard-ivory-redesign\s+permissions:/);
    expect(workflow).toContain("contents: read");
    expect(workflow).not.toMatch(/\b(?:contents|actions|deployments|pull-requests): write/);
    expect(workflow).toMatch(/environment:\s+name: production\s+deployment: false/);
    expect(workflow).toContain("persist-credentials: false");
    const secretNames = [...workflow.matchAll(/\$\{\{ secrets\.([A-Z_]+) \}\}/g)].map((match) => match[1]);
    expect(secretNames).toEqual(["VERCEL_TOKEN", "VITE_SUPABASE_PUBLISHABLE_KEY", "SUPABASE_ANON_KEY", "VERCEL_TOKEN", "VERCEL_TOKEN"]);
    const setup = workflow.slice(0, workflow.indexOf("      - name: Pull the branch preview settings"));
    expect(setup).not.toContain("${{ secrets.");
  });

  it("prepares only existing public frontend fallback values after the project gate", () => {
    const gate = workflow.indexOf("      - name: Verify the existing project");
    const preparation = workflow.indexOf("      - name: Prepare existing public frontend configuration for the preview");
    const build = workflow.indexOf("      - name: Build the preview");
    expect(gate).toBeGreaterThan(0);
    expect(preparation).toBeGreaterThan(gate);
    expect(build).toBeGreaterThan(preparation);
    const step = workflow.slice(preparation, build);
    expect(step).toContain("DASHBOARD_PREVIEW_FALLBACK_PUBLISHABLE_KEY: ${{ secrets.VITE_SUPABASE_PUBLISHABLE_KEY }}");
    expect(step).toContain("DASHBOARD_PREVIEW_FALLBACK_ANON_KEY: ${{ secrets.SUPABASE_ANON_KEY }}");
    expect(step).not.toContain("VERCEL_TOKEN");
    expect(step).toContain("node scripts/dashboard-design-preview-env.mjs");
    expect(workflow).toMatch(/name: Remove downloaded environment values\s+if: \$\{\{ always\(\) \}\}\s+run: rm -f -- \.vercel\/\.env\.preview\.local/);
  });

  it("builds and publishes only a branch preview of the immutable commit", () => {
    expect(workflow).toContain("ref: ${{ github.sha }}");
    expect(workflow).toContain('--environment=preview --git-branch="$GITHUB_REF_NAME"');
    expect(workflow).toContain('build --target=preview --standalone');
    expect(workflow).toContain('--prebuilt --target=preview --archive=tgz');
    expect(workflow).toContain('--meta githubCommitSha="$GITHUB_SHA"');
    expect(workflow).toContain('--meta githubCommitRef="$GITHUB_REF_NAME"');
    expect(workflow).toContain('project.projectId !== process.env.VERCEL_PROJECT_ID');
    expect(workflow).not.toMatch(/--prod\b|\b(?:promote|alias|domains add)\b|supabase (?:db|functions|secrets)\b/);
    expect(workflow).not.toMatch(/SUPABASE_SERVICE_ROLE_KEY|SUPABASE_ACCESS_TOKEN|STRIPE_SECRET_KEY|--env\s/);
    expect(workflow).not.toContain("write-production-env");
    const vercelConfig = JSON.parse(readFileSync(resolve(process.cwd(), "vercel.json"), "utf8"));
    expect(vercelConfig.git.deploymentEnabled).toBe(false);
  });
});
