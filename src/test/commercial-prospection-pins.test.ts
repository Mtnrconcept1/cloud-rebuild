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
