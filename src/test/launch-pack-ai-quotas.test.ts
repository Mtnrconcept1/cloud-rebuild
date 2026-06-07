import { existsSync, readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const root = process.cwd();

function read(path: string) {
  const absolutePath = resolve(root, path);
  expect(existsSync(absolutePath), `${path} should exist`).toBe(true);
  return readFileSync(absolutePath, "utf8");
}

function allMigrationSource() {
  return readdirSync(resolve(root, "supabase/migrations"))
    .filter((name) => name.endsWith(".sql"))
    .sort()
    .map((name) => read(`supabase/migrations/${name}`))
    .join("\n");
}

describe("launch pack AI quota governance", () => {
  it("stores pack-level AI quotas and monthly budget caps in migrations", () => {
    const migrations = allMigrationSource();

    expect(migrations).toContain("monthly_ai_image_limit");
    expect(migrations).toContain("monthly_ai_premium_image_limit");
    expect(migrations).toContain("ai_monthly_budget_chf");
    expect(migrations).toMatch(/UPDATE\s+public\.launch_packs[\s\S]+decouverte[\s\S]+10/i);
    expect(migrations).toMatch(/UPDATE\s+public\.launch_packs[\s\S]+essentiel[\s\S]+30/i);
    expect(migrations).toMatch(/UPDATE\s+public\.launch_packs[\s\S]+pro[\s\S]+80/i);
  });

  it("exposes AI quota fields and renders them on restaurateur pack surfaces", () => {
    const launchPacks = read("src/lib/launchPacks.ts");
    const publicPacks = read("src/pages/PacksRestaurateur.tsx");
    const dashboardPack = read("src/pages/dashboard/DashboardPack.tsx");

    expect(launchPacks).toContain("monthly_ai_image_limit");
    expect(launchPacks).toContain("formatLaunchPackAiQuota");
    expect(publicPacks).toContain("formatLaunchPackAiQuota(pack)");
    expect(dashboardPack).toContain("formatLaunchPackAiQuota(pack)");
    expect(dashboardPack).toContain("formatLaunchPackAiQuota(restaurantPack.launch_packs)");
  });
});
