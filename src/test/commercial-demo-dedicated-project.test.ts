import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const root = process.cwd();
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

describe("dedicated commercial demo project", () => {
  const client = read("src/integrations/supabase/demoClient.ts");
  const mainClient = read("src/integrations/supabase/client.ts");
  const bridge = read("src/lib/commercialDemoProject.ts");
  const hostGuard = read("src/lib/commercialDemoHostSecurity.ts");
  const journey = read("src/lib/commercialDemoJourney.ts");
  const demoAi = read("src/lib/commercialDemoAi.ts");
  const provision = read("supabase/functions/provision-commercial-demo-project-session/index.ts");
  const secretsWriter = read("scripts/write-commercial-demo-secrets-env.mjs");
  const workflow = read(".github/workflows/deploy-production.yml");
  const demoMigrationPath =
    "supabase/demo-migrations/20260719140000_dedicated_commercial_demo_project.sql";
  const demoMigration = read(demoMigrationPath);
  const fullToolsMigration = read(
    "supabase/demo-migrations/20260719143000_enable_full_commercial_demo_tools.sql",
  );
  const paymentSimulationMigration = read(
    "supabase/demo-migrations/20260719150000_simulated_commercial_demo_payments.sql",
  );

  it("routes demo frames and the explicit demo workspace to the isolated Supabase project", () => {
    expect(client).toContain('COMMERCIAL_DEMO_SUPABASE_PROJECT_REF = "hzldfhjfgjcadmpghhhf"');
    expect(client).toContain('"tok-commercial-demo-auth"');
    expect(client).toContain('"tok-active-demo-workspace"');
    expect(client).toContain("isCommercialDemoAuthPath");
    expect(client).toContain("window.sessionStorage");
    expect(mainClient).toContain("shouldUseCommercialDemoSupabase(window.location.pathname)");
    expect(mainClient).toContain("return getCommercialDemoSupabase()");
    expect(mainClient).toContain("export function getProductionSupabase");
    expect(journey).toContain("getCommercialDemoSupabase");
    expect(demoAi).toContain("invokeCommercialDemoFunction");
  });

  it("keeps the production identity and issues a separate demo session", () => {
    expect(bridge).toContain("verified.user?.id !== productionUserId");
    expect(bridge).toContain("verifyOtp");
    expect(provision).toContain("requireProductionRuntime()");
    expect(provision).toContain('actor.roles.includes("commercial")');
    expect(provision).toContain("id: userId");
    expect(provision).toContain("commercial_demo_accounts");
    expect(provision).toContain('["client", "restaurateur", "courier", "commercial"]');
    expect(provision).toContain("generateLink");
    expect(provision).not.toContain("action_link:");
    expect(provision).not.toContain("DEMO_SUPABASE_SECRET_KEY,");
  });

  it("allows the full app only on the exact isolated origin", () => {
    expect(hostGuard).toContain(
      'COMMERCIAL_DEMO_SUPABASE_ORIGIN =\n  "https://hzldfhjfgjcadmpghhhf.supabase.co"',
    );
    expect(hostGuard).toContain("if (isDedicatedDemoSupabaseOrigin(url)) return false");
    expect(hostGuard).toContain("PAID_AI_API_HOSTS.has");
    expect(hostGuard.indexOf("PAID_AI_API_HOSTS.has")).toBeLessThan(
      hostGuard.indexOf("if (isDedicatedDemoSupabaseOrigin(url)) return false"),
    );
  });

  it("syncs real AI keys without injecting any payment-provider credential", () => {
    expect(secretsWriter).toContain('["OPENAI_API_KEY", requireSecret("OPENAI_API_KEY")]');
    expect(secretsWriter).toContain('["DEMO_PAYMENT_MODE", "simulated"]');
    expect(secretsWriter).not.toMatch(/STRIPE_/);
    const demoSecretStep = workflow.slice(
      workflow.indexOf("Prepare dedicated commercial demo secrets without payment-provider credentials"),
      workflow.indexOf("Configure dedicated demo Auth redirects"),
    );
    expect(demoSecretStep).not.toContain("STRIPE_");
    expect(workflow).toContain(
      'secrets set --env-file "${RUNNER_TEMP}/commercial-demo.providers.env" --project-ref "$COMMERCIAL_DEMO_PROJECT_REF"',
    );
    expect(workflow).toContain(
      'functions deploy "${functions[@]}" --project-ref "$COMMERCIAL_DEMO_PROJECT_REF"',
    );
  });

  it("tracks demo-only database divergence outside production migrations", () => {
    expect(demoMigrationPath.startsWith("supabase/demo-migrations/")).toBe(true);
    expect(demoMigration).toContain(
      "DROP CONSTRAINT IF EXISTS commercial_demo_accounts_demo_restaurant_id_key",
    );
    expect(demoMigration).toContain("Commercial demo affiliations are server-managed");
    expect(demoMigration).toContain("p_payment_method IS DISTINCT FROM 'stripe_test'");
    expect(demoMigration).toContain("account.user_id = v_actor_id");
    expect(fullToolsMigration).toContain("is_dedicated_commercial_demo_actor");
    expect(fullToolsMigration).toContain("dedicated_commercial_demo_full_access");
    expect(fullToolsMigration).toContain("ON storage.objects");
    expect(paymentSimulationMigration).toContain(
      "commercial_demo_confirm_simulated_payment",
    );
    expect(paymentSimulationMigration).toContain("TO service_role");
  });
});
