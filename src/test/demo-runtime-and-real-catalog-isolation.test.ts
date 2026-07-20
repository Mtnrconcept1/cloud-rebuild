import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const cors = readFileSync("supabase/functions/_shared/cors.ts", "utf8");
const productionMigration = readFileSync(
  "supabase/migrations/20260720130000_hide_demo_restaurants_from_real_catalog.sql",
  "utf8",
);
const demoMigration = readFileSync(
  "supabase/demo-migrations/20260720130500_enable_dedicated_demo_runtime_rpcs.sql",
  "utf8",
);

describe("demo runtime access and real catalog isolation", () => {
  it("allows every focused demo origin through the shared Edge Function CORS helper", () => {
    for (const origin of [
      "https://demo-client.thetok.ch",
      "https://demo-restaurateur.thetok.ch",
      "https://demo-livreur.thetok.ch",
    ]) {
      expect(cors).toContain(`"${origin}"`);
    }
    expect(cors).toContain('"Vary": "Origin"');
    expect(cors).toContain("if (isOriginAllowed(origin, allowed))");
  });

  it("keeps the production catalog guard and excludes every demo restaurant explicitly", () => {
    expect(productionMigration).toContain(
      "IF public.commercial_demo_current_user_is_restricted() THEN",
    );
    expect(productionMigration).toContain(
      "AND COALESCE(r.is_demo, false) IS FALSE",
    );
    expect(productionMigration).toContain("SECURITY DEFINER");
  });

  it("adapts production-only RPC guards exclusively for verified dedicated demo actors", () => {
    expect(demoMigration).toContain(
      "LIKE '%COMMERCIAL_DEMO_PRODUCTION_RPC_BLOCKED%'",
    );
    expect(demoMigration).toContain(
      "AND NOT public.is_dedicated_commercial_demo_actor() THEN",
    );
    expect(demoMigration).toContain("IF patched_count < 20 THEN");
    expect(demoMigration).not.toMatch(/^\s*(BEGIN|COMMIT|ROLLBACK)\b/im);
  });

  it("scopes demo discovery and restaurant mutations to the mapped shared restaurant", () => {
    expect(demoMigration).toContain(
      "AND r.id = public.commercial_demo_current_restaurant_id()",
    );
    expect(demoMigration).toContain("dedicated_commercial_demo_shared_restaurant_select");
    expect(demoMigration).toContain("dedicated_commercial_demo_shared_restaurant_update");
    expect(demoMigration).toContain(
      "DROP POLICY IF EXISTS dedicated_commercial_demo_full_access",
    );
    expect(demoMigration).not.toMatch(/FOR\\s+INSERT/i);
    expect(demoMigration).not.toMatch(/FOR\\s+DELETE/i);
  });
});
