import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const root = process.cwd();
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

describe("dedicated commercial demo migration workflow", () => {
  const workflow = read(".github/workflows/deploy-production.yml");
  const planner = read("scripts/ci-change-plan.mjs");
  const runner = read("scripts/apply-commercial-demo-migrations.mjs");

  it("classifies production and dedicated demo migrations as database deployments", () => {
    expect(planner).toContain('file.startsWith("supabase/migrations/")');
    expect(planner).toContain('file.startsWith("supabase/demo-migrations/")');
    expect(planner).toContain("const deployDatabase");
  });

  it("runs demo migrations against the exact dedicated project after production migrations", () => {
    const productionPush = workflow.indexOf("- name: Push database migrations");
    const demoPush = workflow.indexOf("- name: Push dedicated commercial demo migrations");

    expect(productionPush).toBeGreaterThan(-1);
    expect(demoPush).toBeGreaterThan(productionPush);
    expect(workflow).toContain("COMMERCIAL_DEMO_PROJECT_REF: hzldfhjfgjcadmpghhhf");
    expect(workflow).toContain("DEMO_MIGRATION_BASE_SHA: ${{ needs.baseline.outputs.base_sha }}");
    expect(workflow).toContain("DEMO_MIGRATION_HEAD_SHA: ${{ github.sha }}");
    expect(workflow).toContain("node ./scripts/apply-commercial-demo-migrations.mjs");
  });

  it("uses the authenticated Management API without exposing a second database password", () => {
    expect(runner).toContain(
      '/v1/projects/${encodeURIComponent(projectRef)}/database/query',
    );
    expect(runner).toContain('Authorization: \`Bearer ${token}\`');
    expect(runner).not.toContain("COMMERCIAL_DEMO_DB_PASSWORD");
    expect(runner).not.toContain("SUPABASE_DB_PASSWORD");
  });

  it("is append-only, transactional, checksum-verified and retry-safe", () => {
    expect(runner).toContain('"--diff-filter=ACDMRTUXB"');
    expect(runner).toContain('if (status !== "A")');
    expect(runner).toContain('createHash("sha256")');
    expect(runner).toContain("BEGIN;");
    expect(runner).toContain("COMMIT;");
    expect(runner).toContain("schema_migrations");
    expect(runner).toContain("already applied; skipping");
    expect(runner).toContain("could not be verified after execution");
  });
});
