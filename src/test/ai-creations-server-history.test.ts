import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const root = process.cwd();

function readProjectFile(path: string) {
  const absolutePath = resolve(root, path);
  expect(existsSync(absolutePath), `${path} should exist`).toBe(true);
  return readFileSync(absolutePath, "utf8");
}

describe("Mes créations server-backed history", () => {
  it("hydrates persisted AI creations from Supabase instead of relying only on browser localStorage", () => {
    const jobs = readProjectFile("src/lib/ai/aiCreationJobs.ts");
    const gallery = readProjectFile("src/components/dashboard/AiCreationsGallery.tsx");

    expect(jobs).toContain("export async function loadPersistedAiCreationRecords");
    expect(jobs).toContain('.from("ai_generated_assets" as never)');
    expect(jobs).toContain('.eq("restaurant_id", restaurantId)');
    expect(jobs).toContain('.eq("status", "stored")');
    expect(jobs).toContain('.order("created_at", { ascending: false })');
    expect(jobs).toContain(".limit(120)");
    expect(jobs).toContain("asset.asset_url");
    expect(jobs).toContain("metadata.generation_seed");
    expect(jobs).toContain("metadata.marketing_asset_mode");

    expect(gallery).toContain("loadPersistedAiCreationRecords");
    expect(gallery).toContain("mergeAiCreationRecordSources");
    expect(gallery).toContain("const [localRecords");
    expect(gallery).toContain("const [persistedRecords");
  });

  it("deduplicates server history against local jobs by persisted asset id while preserving local-only jobs", () => {
    const jobs = readProjectFile("src/lib/ai/aiCreationJobs.ts");

    expect(jobs).toContain("export function mergeAiCreationRecordSources");
    expect(jobs).toContain("record.result?.assetId");
    expect(jobs).toContain("persisted.result?.assetId");
    expect(jobs).toContain("sortRecords(");
  });
});
