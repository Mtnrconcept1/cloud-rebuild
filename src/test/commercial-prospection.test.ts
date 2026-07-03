import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

type ProspectJson = {
  sourceObjectId: number;
  latitude: number;
  longitude: number;
};

function readProspectsSource() {
  return JSON.parse(
    readFileSync(resolve(process.cwd(), "public/data/geneva-commercial-prospects.json"), "utf8"),
  ) as ProspectJson[];
}

describe("commercial prospecting surface", () => {
  it("serves the Geneva restaurant prospect source with valid coordinates", () => {
    const prospects = readProspectsSource();
    expect(prospects.length).toBeGreaterThan(4300);

    const invalidCoordinates = prospects.filter(
      (prospect) =>
        !Number.isFinite(prospect.latitude) ||
        !Number.isFinite(prospect.longitude) ||
        prospect.latitude < 45 ||
        prospect.latitude > 47 ||
        prospect.longitude < 5 ||
        prospect.longitude > 7.5,
    );

    expect(invalidCoordinates).toHaveLength(0);
    expect(new Set(prospects.map((prospect) => prospect.sourceObjectId)).size)
      .toBe(prospects.length);
  });

  it("uses a free map provider and persists only commercial follow-up state", () => {
    const pageSource = readFileSync(resolve(process.cwd(), "src/pages/CommercialProspection.tsx"), "utf8");
    const dataSource = readFileSync(resolve(process.cwd(), "src/data/genevaCommercialProspects.ts"), "utf8");

    expect(pageSource).toContain("tile.openstreetmap.org");
    expect(pageSource).toContain("commercial_prospect_followups");
    expect(pageSource).toContain("source_objectid");
    expect(pageSource).toContain("fetchGenevaCommercialProspects");
    expect(dataSource).toContain("/data/geneva-commercial-prospects.json");
    expect(pageSource).toContain("not_interested");
    expect(pageSource).toContain("signed");
  });

  it("protects the route for admin and commercial roles behind the feature flag", () => {
    const appSource = readFileSync(resolve(process.cwd(), "src/App.tsx"), "utf8");
    const roleAccessSource = readFileSync(resolve(process.cwd(), "src/lib/roleAccess.ts"), "utf8");

    expect(appSource).toContain('path="/commercial"');
    expect(appSource).toContain('requiredRoles={["admin", "commercial"]}');
    expect(appSource).toContain('hasFeature("commercial-prospection")');
    expect(roleAccessSource).toContain('commercial: "/commercial"');
    expect(roleAccessSource).toContain('commercial: ["commercial-prospection"]');
  });

  it("adds RLS-protected follow-up storage in a migration after the role enum migration", () => {
    const enumMigration = readFileSync(
      resolve(process.cwd(), "supabase/migrations/20260703075901_add_commercial_role.sql"),
      "utf8",
    );
    const followupMigration = readFileSync(
      resolve(process.cwd(), "supabase/migrations/20260703080000_commercial_prospecting_map.sql"),
      "utf8",
    );

    expect(enumMigration).toContain("ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'commercial'");
    expect(followupMigration).toContain("CREATE TABLE IF NOT EXISTS public.commercial_prospect_followups");
    expect(followupMigration).toContain("ENABLE ROW LEVEL SECURITY");
    expect(followupMigration).toContain("ur.role::text IN ('admin', 'commercial')");
    expect(followupMigration).toContain("'commercial-prospection'");
  });
});
