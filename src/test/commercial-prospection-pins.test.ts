import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const root = process.cwd();
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

describe("commercial prospect map pins", () => {
  const page = read("src/pages/CommercialProspection.tsx");
  const markerTheme = read("src/lib/commercialProspectionMarkerTheme.ts");
  const markerCss = read("src/styles/commercial-prospection-markers.css");
  const prospectSource = read("src/data/genevaCommercialProspects.ts");
  const theForkSource = read("src/data/theForkCommercialProspects.ts");
  const migration = read(
    "supabase/migrations/20260726061344_seed_thefork_commercial_prospect_catalog.sql",
  );

  it("activates the marker theme on the canonical commercial dashboard route", () => {
    expect(markerTheme).toContain('pathname === "/commercial"');
    expect(markerTheme).toContain('pathname === "/commercial/prospection"');
    expect(markerTheme).toContain("data-commercial-prospection-map");
  });

  it("renders standard and fork markers with explicit CSP-safe classes", () => {
    expect(page).toContain("point.prospect.isTheFork === true");
    expect(page).toContain("commercial-prospect-marker-icon");
    expect(page).toContain("commercial-prospect-marker-glyph");
    expect(page).toContain("is-thefork");
    expect(page).toContain("is-standard");
    expect(markerCss).toContain(".commercial-prospect-marker-shell");
    expect(markerCss).toContain(".commercial-prospect-marker-glyph.is-thefork");
    expect(markerCss).toContain(".commercial-prospect-marker-glyph.is-standard");
    expect(markerCss).not.toContain("data:image/svg+xml");
    expect(markerCss).not.toContain("mask-image");
  });

  it("keeps the available map source when the other source fails", () => {
    expect(prospectSource).toContain("Promise.allSettled");
    expect(prospectSource).toContain('registryResult.status === "fulfilled"');
    expect(prospectSource).toContain('theForkResult.status === "fulfilled"');
    expect(prospectSource).not.toContain("await Promise.all([");
  });

  it("loads TheFork pins from a committed static dataset with authorized identifiers", () => {
    // The previous embedded bzip2 payload was truncated at its source (the
    // fourth base64 chunk was never committed because scripts/.tmp/ is
    // gitignored), so the TheFork source failed on every load and the fork
    // pins silently disappeared from the commercial map.
    expect(theForkSource).toContain('"/data/thefork-geneva-commercial-prospects.json"');
    expect(theForkSource).toContain("isAuthorizedTheForkProspect");
    expect(theForkSource).not.toContain("bzip2");
    expect(theForkSource).not.toContain("scripts/.tmp");

    const dataset = JSON.parse(
      read("public/data/thefork-geneva-commercial-prospects.json"),
    ) as Array<Record<string, unknown>>;

    expect(Array.isArray(dataset)).toBe(true);
    expect(dataset.length).toBeGreaterThanOrEqual(400);
    expect(dataset.length).toBeLessThanOrEqual(520);

    const sourceObjectIds = new Set(dataset.map((row) => Number(row.sourceObjectId)));
    expect(sourceObjectIds.size).toBe(dataset.length);
    for (const row of dataset) {
      const index = Number(row.sourceObjectId) - 2_600_000_000;
      expect(Number.isInteger(index) && index >= 1 && index <= 520).toBe(true);
      expect(row.isTheFork).toBe(true);
      expect(String(row.theForkUrl)).toMatch(/^https:\/\/www\.thefork\.(?:ch|com)\//);
      expect(Number(row.latitude)).toBeGreaterThanOrEqual(45);
      expect(Number(row.latitude)).toBeLessThanOrEqual(48.2);
      expect(Number(row.longitude)).toBeGreaterThanOrEqual(5);
      expect(Number(row.longitude)).toBeLessThanOrEqual(11);
    }
  });

  it("authorizes exactly the 520 stable fork identifiers without exposing the catalog", () => {
    expect(migration).toContain("generate_series(1, 520)");
    expect(migration).toContain("2600000000::bigint + source_index");
    expect(migration).toContain("v_authorized_count <> 520");
    expect(migration).toContain("relation.relrowsecurity IS TRUE");
    expect(migration).toContain(
      "commercial_prospect_catalog must remain service-only without client policies",
    );
    expect(migration).not.toContain("CREATE POLICY");
    expect(migration).not.toContain("GRANT ");
  });
});
