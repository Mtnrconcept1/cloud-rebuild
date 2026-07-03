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
    expect(pageSource).toContain("#facc15");
    expect(pageSource).toContain("#f97316");
    expect(pageSource).toContain("#16a34a");
    expect(pageSource).toContain("#ef4444");
    expect(pageSource).toContain("CommercialWorkspaceChrome");
    expect(pageSource).toContain("RoleSpaceSwitcher");
    expect(pageSource).toContain("commercialProspectMarkerIcon");
    expect(pageSource).toContain("L.divIcon");
    expect(pageSource).toContain("L.marker");
    expect(pageSource).not.toContain("L.circleMarker");
    expect(pageSource).toContain("COMMERCIAL_CLUSTER_DISABLE_ZOOM");
    expect(pageSource).toContain("buildCommercialMapClusters");
    expect(pageSource).toContain("commercialProspectClusterIcon");
    expect(pageSource).toContain("map.on(\"zoomend\"");
    expect(pageSource).toContain("map.fitBounds(cluster.bounds");
    expect(pageSource).toContain("CommercialProspectDetailsDialog");
    expect(pageSource).toContain("Notes du commercial");
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

  it("tracks which commercial owns and signs a restaurant prospect", () => {
    const pageSource = readFileSync(resolve(process.cwd(), "src/pages/CommercialProspection.tsx"), "utf8");
    const typesSource = readFileSync(resolve(process.cwd(), "src/integrations/supabase/types.ts"), "utf8");
    const signatureMigration = readFileSync(
      resolve(process.cwd(), "supabase/migrations/20260703183553_commercial_followup_signatures.sql"),
      "utf8",
    );

    expect(pageSource).toContain("assigned_to_name");
    expect(pageSource).toContain("signed_by_name");
    expect(pageSource).toContain("signed_at");
    expect(pageSource).toContain('draftStatus === "signed"');
    expect(typesSource).toContain("signed_by_name: string | null");
    expect(signatureMigration).toContain("ADD COLUMN IF NOT EXISTS signed_by");
    expect(signatureMigration).toContain("ADD COLUMN IF NOT EXISTS signed_at");
  });

  it("stores signed subscription snapshots and computes commercial commissions", () => {
    const pageSource = readFileSync(resolve(process.cwd(), "src/pages/CommercialProspection.tsx"), "utf8");
    const typesSource = readFileSync(resolve(process.cwd(), "src/integrations/supabase/types.ts"), "utf8");
    const commissionMigration = readFileSync(
      resolve(process.cwd(), "supabase/migrations/20260703205820_commercial_commission_tracking.sql"),
      "utf8",
    );

    expect(pageSource).toContain("Abonnement signé et commission");
    expect(pageSource).toContain("signed_subscription_plan_slug");
    expect(pageSource).toContain("acquisition_commission_chf");
    expect(pageSource).toContain("commercial_compensation_mode");
    expect(pageSource).toContain("FIXED_RESERVATION_COMMISSION_RATE = 0.02");
    expect(pageSource).toContain("get_commercial_prospect_commission_summary");
    expect(pageSource).toContain("Fixe + 2% réservations");
    expect(typesSource).toContain("acquisition_commission_chf: number");
    expect(typesSource).toContain("reservation_commission_rate: number");
    expect(typesSource).toContain("get_commercial_prospect_commission_summary");
    expect(commissionMigration).toContain("ADD COLUMN IF NOT EXISTS signed_subscription_plan_slug");
    expect(commissionMigration).toContain("reservation_commission_rate numeric(6, 4) NOT NULL DEFAULT 0");
    expect(commissionMigration).toContain("CREATE OR REPLACE FUNCTION public.get_commercial_prospect_commission_summary");
    expect(commissionMigration).toContain("v_followup.commercial_compensation_mode = 'fixed_plus_reservation'");
    expect(commissionMigration).toContain("COALESCE(SUM(GREATEST(COALESCE(r.total_amount, 0), COALESCE(r.billing_fee_chf, 0)))");
    expect(commissionMigration).toContain("DEFAULT 0.10");
  });
});
