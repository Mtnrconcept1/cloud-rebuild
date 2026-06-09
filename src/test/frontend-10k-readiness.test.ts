import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { inspectFrontendReadiness } from "../../scripts/frontend-10k-readiness.mjs";

const fixtures: string[] = [];

function makeFixture(name: string) {
  const root = path.join(process.cwd(), ".tmp", `frontend-10k-${name}-${Date.now()}`);
  fixtures.push(root);
  mkdirSync(path.join(root, "public", "campagne"), { recursive: true });
  mkdirSync(path.join(root, "src", "pages", "admin"), { recursive: true });
  return root;
}

afterEach(() => {
  for (const fixture of fixtures.splice(0)) {
    rmSync(fixture, { recursive: true, force: true });
  }
});

describe("frontend 10k readiness", () => {
  it("detects oversized public raster assets and broad Supabase row caps", () => {
    const root = makeFixture("bad");
    writeFileSync(path.join(root, "public", "campagne", "huge.png"), Buffer.alloc(2_600_000));
    writeFileSync(
      path.join(root, "src", "pages", "admin", "BadAdmin.tsx"),
      "supabase.from(\"orders\").select(\"id\").range(0, 999);\nsupabase.from(\"dispatch_jobs\").select(\"id\").limit(1000);\n",
      "utf8",
    );

    const result = inspectFrontendReadiness({ root });

    expect(result.ok).toBe(false);
    expect(result.errors).toEqual(expect.arrayContaining([
      expect.stringContaining("huge.png"),
      expect.stringContaining("range(0, 999)"),
      expect.stringContaining("limit(1000)"),
    ]));
  });

  it("keeps the current app within tracked asset, query and lazy-route budgets", () => {
    const result = inspectFrontendReadiness({ root: process.cwd(), inspectBuiltBundle: false });

    expect(result.ok).toBe(true);
    expect(result.errors).toEqual([]);
    expect(result.summary.maxBudgetedPublicRasterBytes).toBeLessThanOrEqual(2_500_000);
    expect(result.summary.maxSupabaseFetchedRows).toBeLessThanOrEqual(500);
    expect(result.summary.lazyRouteImports).toBeGreaterThanOrEqual(result.summary.pageFiles - 3);
  });
});
