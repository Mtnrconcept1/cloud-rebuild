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
const demoEffects = readFileSync("src/lib/commercialDemoEffects.ts", "utf8");
const demoAi = readFileSync("src/lib/commercialDemoAi.ts", "utf8");

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

  it("keeps the production guard and excludes both demo markers from the real catalog", () => {
    expect(productionMigration).toContain(
      "IF public.commercial_demo_current_user_is_restricted() THEN",
    );
    expect(productionMigration).toContain(
      "AND COALESCE(r.is_demo, false) IS FALSE",
    );
    expect(productionMigration).toContain(
      "AND lower(COALESCE(r.status, '')) <> 'demo'",
    );
    expect(productionMigration).toContain("SECURITY DEFINER");
  });

  it("authorizes demo resources by mapped restaurant rather than by actor alone", () => {
    expect(demoMigration).toContain(
      "CREATE OR REPLACE FUNCTION public.dedicated_demo_can_access_restaurant",
    );
    expect(demoMigration).toContain(
      "p_restaurant_id = public.commercial_demo_current_restaurant_id()",
    );
    expect(demoMigration).toContain(
      "public.can_view_commercial_demo_restaurant(p_restaurant_id)",
    );
    expect(demoMigration).toContain(
      "OR public.dedicated_demo_can_access_restaurant(p_restaurant_id)",
    );
    expect(demoMigration).not.toContain(
      "LIKE '%COMMERCIAL_DEMO_PRODUCTION_RPC_BLOCKED%'",
    );
    expect(demoMigration).not.toContain("IF patched_count < 20 THEN");
  });

  it("adapts only explicitly scoped read RPCs and leaves generic transaction RPCs blocked", () => {
    expect(demoMigration).toContain(
      "get_restaurant_subscription_self_service_state(uuid)",
    );
    expect(demoMigration).toContain(
      "get_reservation_fee_invoice_lines(uuid)",
    );
    expect(demoMigration).toContain(
      "get_restaurant_credit_usage(uuid,timestamp with time zone,timestamp with time zone)",
    );
    expect(demoMigration).toContain("DEMO_RESTAURANT_SCOPE_VIOLATION");
    expect(demoMigration).not.toContain("create_order_with_items");
    expect(demoMigration).not.toContain("validate_and_create_reservation");
    expect(demoMigration).not.toContain("cancel_order_by_restaurant");
  });

  it("scopes catalog, restaurant updates and menu CRUD to the mapped shared restaurant", () => {
    expect(demoMigration).toContain(
      "AND r.id = public.commercial_demo_current_restaurant_id()",
    );
    expect(demoMigration).toContain(
      "dedicated_commercial_demo_shared_restaurant_select",
    );
    expect(demoMigration).toContain(
      "dedicated_commercial_demo_shared_restaurant_update",
    );
    expect(demoMigration).toContain(
      "dedicated_commercial_demo_mapped_menu_insert",
    );
    expect(demoMigration).toContain(
      "dedicated_commercial_demo_mapped_menu_delete",
    );
    expect(demoMigration).toContain(
      "DROP POLICY IF EXISTS dedicated_commercial_demo_full_access",
    );
    expect(demoMigration).not.toContain(
      "CREATE POLICY block_commercial_demo_restaurant_insert",
    );
    expect(demoMigration).not.toContain(
      "CREATE POLICY block_commercial_demo_restaurant_delete",
    );
  });

  it("trusts the dedicated Supabase project for live demo AI and image edits", () => {
    expect(demoEffects).toContain(
      'import { COMMERCIAL_DEMO_SUPABASE_URL } from "@/integrations/supabase/demoClient"',
    );
    expect(demoEffects).toContain(
      "new URL(COMMERCIAL_DEMO_SUPABASE_URL).origin",
    );
    expect(demoAi).toContain(
      "const dedicatedDemoOrigin = new URL(COMMERCIAL_DEMO_SUPABASE_URL).origin",
    );
    expect(demoAi).toContain("parsed.origin === dedicatedDemoOrigin");
  });

  it("keeps the custom demo migration runner transaction-free", () => {
    expect(demoMigration).not.toMatch(/^\s*(BEGIN|COMMIT|ROLLBACK)\b/im);
  });
});
