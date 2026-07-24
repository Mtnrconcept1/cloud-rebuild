import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import {
  mergeGenevaCommercialProspects,
  commercialProspectIdentityKey,
  mergeGenevaCommercialProspectsWithReport,
  type GenevaCommercialProspect,
} from "@/data/genevaCommercialProspects";
import {
  decodeTheForkCommercialProspectParts,
  type TheForkCommercialProspectManifest,
  type TheForkCommercialProspectPart,
} from "@/data/theForkCommercialProspects";

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(resolve(process.cwd(), path), "utf8")) as T;
}

function readTheForkProspects() {
  const manifest = readJson<TheForkCommercialProspectManifest>(
    "public/data/thefork-geneva-commercial-prospects/manifest.json",
  );
  const parts = manifest.parts.map((part) => readJson<TheForkCommercialProspectPart>(
    `public/data/thefork-geneva-commercial-prospects/${part}`,
  ));
  return { manifest, prospects: decodeTheForkCommercialProspectParts(manifest, parts) };
}

function makeProspect(
  overrides: Partial<GenevaCommercialProspect> = {},
): GenevaCommercialProspect {
  return {
    sourceObjectId: 77,
    name: "Restaurant Déjà Présent",
    legalName: "Restaurant Déjà Présent Sàrl",
    registryType: "Etablissement",
    category: "Restaurant",
    branch: "Restauration",
    activityDetail: null,
    address: "Rue du Rhône 1",
    postalCode: "1204",
    locality: "Genève",
    commune: "Genève",
    phone: "+41 22 000 00 00",
    email: "contact@example.ch",
    website: "https://example.ch",
    companySize: null,
    localType: null,
    establishmentId: "CH-EXISTING",
    companyId: "CH-COMPANY",
    ideNumber: "CHE-000.000.000",
    latitude: 46.203,
    longitude: 6.147,
    source: "Registre suisse",
    collectedAt: "2026-07-01",
    ...overrides,
  };
}

describe("TheFork commercial prospect map import", () => {
  it("loads exactly 520 unique, mappable restaurant prospects from eight controlled segments", () => {
    const { manifest, prospects } = readTheForkProspects();

    expect(manifest.count).toBe(520);
    expect(manifest.parts).toHaveLength(8);
    expect(prospects).toHaveLength(520);
    expect(new Set(prospects.map((prospect) => prospect.sourceObjectId))).toHaveSize(520);
    expect(new Set(prospects.map((prospect) => (
      `${prospect.name}|${prospect.address}|${prospect.postalCode}|${prospect.locality}`
    )))).toHaveSize(520);

    for (const prospect of prospects) {
      expect(prospect.isTheFork).toBe(true);
      expect(prospect.theForkUrl).toMatch(/^https:\/\/www\.thefork\.(?:ch|com)\//i);
      expect(prospect.latitude).toBeGreaterThanOrEqual(45);
      expect(prospect.latitude).toBeLessThanOrEqual(48.2);
      expect(prospect.longitude).toBeGreaterThanOrEqual(5);
      expect(prospect.longitude).toBeLessThanOrEqual(11);
    }
  });

  it("keeps the historical sourceObjectId and exact map coordinates when a restaurant already exists", () => {
    const registryProspect = makeProspect();
    const theForkProspect = makeProspect({
      sourceObjectId: 2_600_000_001,
      legalName: null,
      registryType: "TheFork",
      latitude: 46.22,
      longitude: 6.18,
      source: "TheFork Genève",
      isTheFork: true,
      theForkUrl: "https://www.thefork.ch/restaurant/example-r1",
      theForkDirectUrl: "https://www.thefork.ch/restaurant/example-r1",
      coordinatePrecision: "locality_fallback",
    });

    const merged = mergeGenevaCommercialProspects([registryProspect], [theForkProspect]);

    expect(merged).toHaveLength(1);
    expect(merged[0]).toMatchObject({
      sourceObjectId: 77,
      latitude: 46.203,
      longitude: 6.147,
      isTheFork: true,
      dataOrigin: "registry+thefork",
    });
  });

  it("does not merge two unrelated restaurants merely because they share an address", () => {
    const base = makeProspect({ name: "Tosca", address: "Rue de la Mairie 8", postalCode: "1207" });
    const incoming = makeProspect({
      sourceObjectId: 2_600_000_002,
      name: "Puccini by TOSCA",
      legalName: null,
      registryType: "TheFork",
      address: "Rue de la Mairie 8",
      postalCode: "1207",
      phone: null,
      email: null,
      website: null,
      isTheFork: true,
    });

    expect(mergeGenevaCommercialProspects([base], [incoming])).toHaveLength(2);
  });

  it("merges the real Geneva registry without duplicate exact restaurant identities", () => {
    const registry = readJson<GenevaCommercialProspect[]>(
      "public/data/geneva-commercial-prospects.json",
    );
    const { prospects: theForkProspects } = readTheForkProspects();
    const { prospects, report } = mergeGenevaCommercialProspectsWithReport(
      registry,
      theForkProspects,
    );

    console.info("[commercial-map-thefork-test]", report);
    expect(report.theForkCount).toBe(520);
    expect(report.matchedExisting + report.addedNew).toBe(520);
    expect(report.matchedExisting).toBeGreaterThan(0);
    expect(prospects).toHaveLength(report.finalCount);
    expect(new Set(prospects.map((prospect) => prospect.sourceObjectId))).toHaveSize(
      prospects.length,
    );

    const theForkIdentities = new Set(
      prospects
        .filter((prospect) => prospect.isTheFork)
        .map((prospect) => commercialProspectIdentityKey(prospect)),
    );
    expect(theForkIdentities.size).toBe(520);
  });

  it("imports every absent restaurant once while preserving matched Supabase status identifiers", () => {
    const { prospects: theForkProspects } = readTheForkProspects();
    const first = theForkProspects[0];
    const existing = makeProspect({
      sourceObjectId: 95871,
      name: first.name,
      address: first.address,
      postalCode: first.postalCode,
      locality: first.locality,
      commune: first.commune,
    });

    const { prospects, report } = mergeGenevaCommercialProspectsWithReport(
      [existing],
      theForkProspects,
    );

    expect(report.theForkCount).toBe(520);
    expect(report.matchedExisting).toBe(1);
    expect(report.addedNew).toBe(519);
    expect(report.reusedExistingSourceIds).toContain(95871);
    expect(prospects).toHaveLength(520);
    expect(new Set(prospects.map((prospect) => prospect.sourceObjectId))).toHaveSize(520);
  });

  it("installs fork markers and the requested yellow/orange/green/red status theme", () => {
    const main = readFileSync(resolve(process.cwd(), "src/main.tsx"), "utf8");
    const theme = readFileSync(
      resolve(process.cwd(), "src/lib/commercialProspectionMarkerTheme.ts"),
      "utf8",
    );
    const css = readFileSync(
      resolve(process.cwd(), "src/styles/commercial-prospection-markers.css"),
      "utf8",
    );
    const page = readFileSync(resolve(process.cwd(), "src/pages/CommercialProspection.tsx"), "utf8");

    expect(main).toContain('commercial-prospection-markers.css');
    expect(main).toContain("installCommercialProspectionMarkerTheme");
    expect(theme).toContain('data-commercial-prospection-map');
    expect(css).toContain("mask-image");
    expect(css).toContain("#f97316");
    expect(page).toContain('marker: "#facc15"');
    expect(page).toContain('marker: "#16a34a"');
    expect(page).toContain('marker: "#ef4444"');
  });
});
