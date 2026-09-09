import { existsSync, readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const datasetPath = "public/data/thefork-geneva-commercial-prospects.json";
const migrationPath = "supabase/migrations/20260909133500_complete_thefork_directory_catalog.sql";
const reservedMissingStart = 2_600_000_121;
const reservedMissingEnd = 2_600_000_200;
const theForkUrlPattern = /^https:\/\/www\.thefork\.(?:ch|com)\//i;

type TheForkDatasetRow = {
  sourceObjectId: number;
  name: string;
  latitude: number;
  longitude: number;
  theForkUrl?: string | null;
};

describe("verified TheFork commercial directory synchronization", () => {
  it("keeps exactly the 440 verified TheFork restaurants and preserves the reserved 80-id gap", () => {
    expect(existsSync(datasetPath)).toBe(true);
    const dataset = JSON.parse(readFileSync(datasetPath, "utf8")) as TheForkDatasetRow[];

    expect(dataset).toHaveLength(440);
    expect(new Set(dataset.map((row) => row.sourceObjectId)).size).toBe(440);
    expect(dataset.every((row) => row.name.trim().length > 0)).toBe(true);
    expect(dataset.every((row) => theForkUrlPattern.test(row.theForkUrl || ""))).toBe(true);
    expect(dataset.every((row) => Number.isFinite(row.latitude) && Number.isFinite(row.longitude))).toBe(true);
    expect(dataset.every((row) => row.latitude >= 45 && row.latitude <= 48.2)).toBe(true);
    expect(dataset.every((row) => row.longitude >= 5 && row.longitude <= 11)).toBe(true);

    const ids = new Set(dataset.map((row) => row.sourceObjectId));
    for (let sourceObjectId = reservedMissingStart; sourceObjectId <= reservedMissingEnd; sourceObjectId += 1) {
      expect(ids.has(sourceObjectId)).toBe(false);
    }
  });

  it("imports only verified TheFork rows without promoting the 80 reserved placeholders", () => {
    expect(existsSync(migrationPath)).toBe(true);
    const migration = readFileSync(migrationPath, "utf8");

    for (const marker of [
      "Restaurant référencé sur TheFork",
      "commercial_prospect_catalog",
      "directory_source_reference",
      "restaurant_directory_name_jobs",
      "restaurant_image_discovery_jobs",
      "Expected 440 verified TheFork prospects",
      "Expected all 440 verified TheFork prospects to be covered",
      "Reserved TheFork placeholder range must remain outside the public directory",
    ]) {
      expect(migration).toContain(marker);
    }

    expect(migration).toContain("NOT BETWEEN 2600000121 AND 2600000200");
    expect(migration).not.toMatch(/SET\s+branch\s*=\s*'Restaurant référencé sur TheFork'/i);
    expect(migration).not.toMatch(/DELETE\s+FROM/i);
    expect(migration).not.toMatch(/DROP\s+(?:TABLE|COLUMN|SCHEMA)/i);
    expect(migration).not.toMatch(/supports_reservation\s*,?\s*true/i);
  });
});
