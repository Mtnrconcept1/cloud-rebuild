import { existsSync, readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const root = process.cwd();

function readProjectFile(path: string) {
  const absolutePath = resolve(root, path);
  expect(existsSync(absolutePath), `${path} should exist`).toBe(true);
  return readFileSync(absolutePath, "utf8");
}

function readMigrationContaining(slug: string) {
  const migrationName = readdirSync(resolve(root, "supabase/migrations"))
    .filter((name) => name.endsWith(".sql"))
    .find((name) => name.includes(slug));

  expect(migrationName, `migration containing ${slug} should exist`).toBeTruthy();
  return readProjectFile(`supabase/migrations/${migrationName}`);
}

describe("TOK Intelligence Suite", () => {
  it("adds the four additive intelligence modules with RLS", () => {
    const sql = readMigrationContaining("tok_intelligence_suite");

    for (const table of [
      "campaign_studio_runs",
      "customer_memory_items",
      "customer_memory_events",
      "support_resolution_runs",
      "support_resolution_actions",
      "ops_guardian_assessments",
      "ops_guardian_verifications",
    ]) {
      expect(sql).toMatch(
        new RegExp(
          `CREATE\\s+TABLE\\s+IF\\s+NOT\\s+EXISTS\\s+public\\.${table}`,
          "i",
        ),
      );
      expect(sql).toMatch(
        new RegExp(
          `ALTER\\s+TABLE\\s+public\\.${table}\\s+ENABLE\\s+ROW\\s+LEVEL\\s+SECURITY`,
          "i",
        ),
      );
    }

    expect(sql).toContain("dashboard-campaign-studio");
    expect(sql).toContain("customer-memory");
    expect(sql).toContain("admin-support-resolution");
    expect(sql).toContain("admin-guardian");
    expect(sql).not.toMatch(/\bDROP\s+TABLE\b/i);
    expect(sql).not.toMatch(/\bTRUNCATE\b/i);
  });

  it("keeps the OpenAI key server-side in all new functions", () => {
    for (const functionName of [
      "ai-campaign-studio",
      "customer-memory",
      "ai-support-resolution",
      "ai-guardian",
    ]) {
      const source = readProjectFile(
        `supabase/functions/${functionName}/index.ts`,
      );
      expect(source).toContain("OPENAI_API_KEY");
      expect(source).toContain("authenticateRequest");
      expect(source).toContain("createRateLimiter");
      expect(source).toContain("writeAuditLog");
      expect(source).not.toContain("VITE_OPENAI");
      expect(source).not.toContain("sk-proj-");
    }
  });

  it("keeps Campaign Studio in draft mode until the existing campaign portal is called", () => {
    const backend = readProjectFile(
      "supabase/functions/ai-campaign-studio/index.ts",
    );
    const page = readProjectFile(
      "src/pages/dashboard/DashboardCampaignStudio.tsx",
    );

    expect(backend).toContain('status: "draft"');
    expect(backend).not.toContain('.from("ad_campaigns").insert');
    expect(backend).not.toContain('.from("ad_campaigns").upsert');
    expect(page).toContain("saveRestaurantCampaign");
    expect(page).toContain("activationConfirmed");
    expect(page).toContain("manual_approval_required");
    expect(page).toContain("markCampaignStudioRunLaunched");
  });

  it("requires personalization consent and forbids sensitive inference", () => {
    const memory = readProjectFile(
      "supabase/functions/customer-memory/index.ts",
    );

    expect(memory).toContain("requirePersonalizationConsent");
    expect(memory).toContain("consent_blocked");
    expect(memory).toContain("status: \"pending\"");
    expect(memory).toContain(
      "N'infère jamais santé, allergie, handicap, religion, origine, politique, sexualité",
    );
    expect(memory).not.toContain("support_incident_messages");
  });

  it("never executes refunds or credits from Support & Resolution", () => {
    const support = readProjectFile(
      "supabase/functions/ai-support-resolution/index.ts",
    );

    expect(support).toContain("FINANCIAL_ACTIONS");
    expect(support).toContain(
      "financial_action_requires_human_finance_workflow",
    );
    expect(support).toContain("manual_required");
    expect(support).not.toContain("process-refund");
    expect(support).not.toContain("wallet_transactions");
    expect(support).not.toContain("grant_loyalty");
  });

  it("keeps Guardian analytical and never resolves incidents automatically", () => {
    const guardian = readProjectFile(
      "supabase/functions/ai-guardian/index.ts",
    );

    expect(guardian).toContain("automatic_resolution_performed: false");
    expect(guardian).toContain("human_approval_required");
    expect(guardian).toContain("branche dédiée, patch minimal, tests, PR");
    expect(guardian).not.toContain('.update({ status: "resolved"');
    expect(guardian).not.toContain("merge_pull_request");
    expect(guardian).not.toContain("supabase db push");
  });

  it("registers routes, navigation entries and Edge Function auth policies", () => {
    const app = readProjectFile("src/App.tsx");
    const restaurantNavigation = readProjectFile(
      "src/components/DashboardLayout.tsx",
    );
    const customerNavigation = readProjectFile(
      "src/components/CustomerDashboardLayout.tsx",
    );
    const adminNavigation = readProjectFile(
      "src/components/admin/AdminMobileNavigation.tsx",
    );
    const config = readProjectFile("supabase/config.toml");

    expect(app).toContain("/dashboard/campaign-studio");
    expect(app).toContain("/memoire-tok");
    expect(app).toContain("/admin/support-resolution");
    expect(app).toContain("/admin/guardian");
    expect(restaurantNavigation).toContain("Campaign Studio IA");
    expect(customerNavigation).toContain("Ma mémoire TOK");
    expect(adminNavigation).toContain("Résolution IA");
    expect(adminNavigation).toContain("TOK Guardian");

    for (const functionName of [
      "ai-campaign-studio",
      "customer-memory",
      "ai-support-resolution",
      "ai-guardian",
    ]) {
      expect(config).toContain(`[functions.${functionName}]`);
      expect(config).toMatch(
        new RegExp(
          `\\[functions\\.${functionName}\\]\\s+verify_jwt\\s*=\\s*false`,
          "i",
        ),
      );
    }
  });
});
