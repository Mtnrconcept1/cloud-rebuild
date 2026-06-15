import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const root = process.cwd();

function read(path: string) {
  return readFileSync(resolve(root, path), "utf8");
}

function latestMigrationContaining(pattern: RegExp) {
  const migrationsDir = resolve(root, "supabase/migrations");
  const matches = readdirSync(migrationsDir)
    .filter((name) => name.endsWith(".sql"))
    .sort()
    .filter((name) => pattern.test(readFileSync(resolve(migrationsDir, name), "utf8")));
  expect(matches.length).toBeGreaterThan(0);
  return readFileSync(resolve(migrationsDir, matches[matches.length - 1]), "utf8");
}

describe("automatic floor-plan image import", () => {
  it("persists saved floor-plan variants with owner/admin RLS", () => {
    const sql = latestMigrationContaining(/CREATE TABLE IF NOT EXISTS public\.floor_plan_variants/i);

    expect(sql).toContain("CREATE TABLE IF NOT EXISTS public.floor_plan_variants");
    expect(sql).toContain("snapshot jsonb NOT NULL");
    expect(sql).toContain("CHECK (source IN ('manual', 'ai-image', 'ai-generated'))");
    expect(sql).toContain("ALTER TABLE public.floor_plan_variants ENABLE ROW LEVEL SECURITY");
    expect(sql).toContain("auth_can_manage_floor_plan_variant");
    expect(sql).toContain("REVOKE ALL ON public.floor_plan_variants FROM anon");
    expect(sql).toContain("GRANT SELECT, INSERT, UPDATE, DELETE ON public.floor_plan_variants TO authenticated");
  });

  it("sends uploaded plan images to the floorplan AI vision path", () => {
    const edgeFunction = read("supabase/functions/floorplan-ai/index.ts");
    const panel = read("src/components/floor-plan/FloorPlanAIPanel.tsx");

    expect(edgeFunction).toContain('"image-import"');
    expect(edgeFunction).toContain("MAX_IMAGE_DATA_URL_CHARS");
    expect(edgeFunction).toContain("OPENAI_VISION_MODEL");
    expect(edgeFunction).toContain('type: "image_url"');
    expect(edgeFunction).toContain('detail: "high"');
    expect(panel).toContain("Plan de salle automatique");
    expect(panel).toContain('type="file"');
    expect(panel).toContain('accept="image/png,image/jpeg,image/webp"');
    expect(panel).toContain('callAI("image-import"');
    expect(panel).toContain("MAX_IMPORT_IMAGE_BYTES");
  });

  it("creates switchable variants instead of overwriting the active template immediately", () => {
    const page = read("src/pages/dashboard/DashboardPlanSalle.tsx");

    expect(page).toContain('supabase.from("floor_plan_variants" as any)');
    expect(page).toContain("buildFloorPlanVariantSnapshot");
    expect(page).toContain("buildDraftTablesFromVariant");
    expect(page).toContain("Sauver variante");
    expect(page).toContain("Template actif");
    expect(page).toContain('source: result.source === "image-import" ? "ai-image" : "ai-generated"');
    expect(page).toContain("commitHistorySnapshot(buildHistorySnapshot(newTables, {}, null))");
  });
});
