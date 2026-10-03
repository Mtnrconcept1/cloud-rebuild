import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const migrationPath =
  "supabase/migrations/20261003070000_marketing_autopilot_foundation.sql";

function readMigration() {
  return readFileSync(resolve(process.cwd(), migrationPath), "utf8");
}

function functionBody(sql: string, name: string) {
  const start = sql.indexOf(`CREATE OR REPLACE FUNCTION public.${name}`);
  expect(start, `${name} must exist`).toBeGreaterThanOrEqual(0);
  const end = sql.indexOf("CREATE OR REPLACE FUNCTION", start + 1);
  return sql.slice(start, end > start ? end : undefined);
}

describe("TOK Marketing Autopilot SQL foundation", () => {
  it("adds governed campaigns, assets with rights, UTM plans and attribution facts", () => {
    const sql = readMigration();

    for (const column of [
      "objective_code",
      "budget_minor",
      "currency",
      "cost_center",
      "owner_user_id",
      "autonomy_level",
      "attribution_model",
      "attribution_window_hours",
      "external_actions_enabled",
      "default_utm_plan_id",
    ]) {
      expect(sql).toMatch(new RegExp(`ADD COLUMN IF NOT EXISTS ${column}\\b`, "i"));
    }

    for (const table of [
      "marketing_assets",
      "marketing_asset_rights",
      "marketing_campaign_assets",
      "marketing_utm_plans",
      "marketing_attribution_facts",
    ]) {
      expect(sql).toContain(`CREATE TABLE IF NOT EXISTS public.${table}`);
      expect(sql).toContain(`ALTER TABLE public.${table} ENABLE ROW LEVEL SECURITY`);
      expect(sql).toContain(`ALTER TABLE public.${table} FORCE ROW LEVEL SECURITY`);
    }

    expect(sql).toContain("Approved marketing asset requires current rights evidence");
    expect(sql).toMatch(/marketing_asset_rights[\s\S]*?rights_basis[\s\S]*?'owned'[\s\S]*?'licensed'/i);
    expect(sql).toMatch(/marketing_utm_plans[\s\S]*?utm_source[\s\S]*?utm_medium[\s\S]*?utm_campaign/i);
    expect(sql).toMatch(/marketing_attribution_facts[\s\S]*?'revenue'[\s\S]*?'spend'/i);
    expect(sql).toContain("UNIQUE (source_system, source_fact_id)");
  });

  it("keeps providers independent from channels and seeds all seven fail closed", () => {
    const sql = readMigration();
    const seedStart = sql.indexOf("INSERT INTO public.marketing_provider_accounts");
    const seedEnd = sql.indexOf("INSERT INTO public.marketing_automation_templates", seedStart);
    const seed = sql.slice(seedStart, seedEnd);

    expect(sql).toContain("CREATE TABLE IF NOT EXISTS public.marketing_provider_accounts");
    expect(sql).toContain("provider_kind text NOT NULL");
    expect(sql).toContain("channels text[] NOT NULL");
    expect(sql).toContain("capabilities text[] NOT NULL");
    expect(sql).toContain("control_state IN ('unconfigured', 'paused')");
    expect(sql).toContain("external_actions_enabled IS FALSE");

    for (const provider of [
      "metricool",
      "hubspot",
      "google-search-console",
      "meta-ads",
      "google-ads",
      "tiktok-ads",
      "canva",
    ]) {
      const row = seed.match(new RegExp(`\\('${provider}'[^\\n]*(?:\\n[^\\n]*){0,4}`, "i"))?.[0] ?? "";
      expect(row, `${provider} must be seeded`).toContain("'unconfigured'");
      expect(row, `${provider} must have no deployed adapter`).toMatch(/false\s*,\s*false/i);
      expect(row).not.toContain("'ready'");
    }
  });

  it("seeds exactly the eight TOK templates disabled and approval-first", () => {
    const sql = readMigration();
    const templateSeedStart = sql.indexOf("INSERT INTO public.marketing_automation_templates");
    const automationSeedStart = sql.indexOf("INSERT INTO public.marketing_automations", templateSeedStart);
    const templateSeed = sql.slice(templateSeedStart, automationSeedStart);
    const keys = [
      "tok.zero_attente",
      "tok.ventes_flash",
      "tok.anti_gaspillage",
      "tok.print_studio",
      "tok.plan_salle",
      "tok.tok_social",
      "tok.publicites_ia",
      "tok.comptabilite_ia",
    ];

    for (const key of keys) {
      expect(templateSeed).toContain(`('${key}'`);
    }
    expect((templateSeed.match(/\('tok\./g) ?? [])).toHaveLength(8);
    expect(sql).toMatch(/ON CONFLICT \(template_key\) DO UPDATE SET[\s\S]*?is_enabled = false[\s\S]*?external_effects_enabled = false/i);
    expect(sql).toMatch(/ON CONFLICT \(automation_key\) DO UPDATE SET[\s\S]*?status = 'disabled'[\s\S]*?approval_mode = 'human_required'[\s\S]*?external_effects_enabled = false/i);
  });

  it("normalizes historical and canonical delivery events without a destructive backfill", () => {
    const sql = readMigration();
    const overview = functionBody(sql, "admin_get_marketing_overview");

    expect(sql).toContain("CREATE OR REPLACE VIEW public.marketing_event_facts");
    expect(sql).toContain("WHEN 'delivered' THEN 'delivery_delivered'");
    expect(sql).toContain("WHEN 'clicked' THEN 'delivery_clicked'");
    expect(sql).toContain("WHEN 'converted' THEN 'delivery_converted'");
    expect(sql).toContain("e.event_type AS source_event_type");
    expect(overview).toContain("FROM public.marketing_event_facts e");
    expect(overview).toContain("e.event_type = 'delivery_delivered'");
  });

  it("preserves the complete historical and autopilot audit redaction union", () => {
    const sql = readMigration();
    const redact = functionBody(sql, "marketing_redact_audit_record");

    for (const field of [
      "email",
      "email_normalized",
      "phone",
      "phone_normalized",
      "target_fingerprint",
      "secret_ref",
      "lease_token",
      "provider_message_id",
      "metadata",
      "last_error",
      "content",
      "targeting",
      "public_configuration",
      "result_summary",
      "body",
      "context",
      "notes",
      "verification_note",
      "result_note",
      "suggested_angle",
      "credential_ref",
      "external_account_ref",
      "granted_scopes",
      "storage_path",
      "draft_payload",
      "input_hash",
      "plan_hash",
      "simulation_key",
      "simulation_receipt_id",
      "reason",
    ]) {
      expect(redact, `${field} must stay redacted`).toContain(`- '${field}'`);
    }
  });

  it("returns the complete dashboard contract with nullable commercial metrics", () => {
    const sql = readMigration();
    const body = functionBody(sql, "admin_get_marketing_autopilot_dashboard");

    for (const field of [
      "generated_at",
      "governance",
      "providers",
      "automations",
      "assets",
      "analytics",
      "completeness",
      "unavailable_reasons",
      "spend_minor",
      "revenue_minor",
      "cpl_minor",
      "cpa_minor",
      "cac_minor",
      "roas",
    ]) {
      expect(body).toContain(`'${field}'`);
    }
    expect(body).toContain("'external_actions_enabled', false");
    expect(body).toContain("'ready', false");
    expect(body).toContain("'probe_ready'");
    expect(body).toContain("'provider_readiness_requires_fresh_probe', true");
    expect(body).toContain("'mixed_currencies'");
    expect(body).toContain("'customer_acquisition_data_unavailable'");
    expect(body).toContain("'cac_minor', NULL");
    expect(body).toContain("'granted_scopes', to_jsonb(p.granted_scopes)");
    expect(body).toContain("'template_key', t.template_key");
    expect(body).toContain("'status', COALESCE(a.status, 'disabled')");
    expect(body).toContain("CASE WHEN v_completeness = 'unavailable' THEN NULL ELSE v_analytics END");
    expect(body).toMatch(/WHEN v_spend_minor IS NOT NULL[\s\S]*?ELSE NULL/i);
    expect(body).toContain("NULLIF(count(*) FILTER (WHERE e.event_type = 'delivery_sent'), 0)");
    expect(body).toContain("NULLIF(count(*) FILTER (WHERE e.event_type = 'delivery_delivered'), 0)");
    expect(body).toContain("NULLIF(count(*) FILTER (WHERE e.event_type = 'delivery_clicked'), 0)");
    expect(body).toContain("NULLIF(count(*) FILTER (WHERE e.event_type = 'delivery_converted'), 0)");
    expect(body).toContain("NULLIF(count(*) FILTER (WHERE f.fact_type = 'lead'), 0)");
    expect(body).toContain("NULLIF(count(*) FILTER (WHERE f.fact_type = 'conversion'), 0)");
    expect(body).toContain("'leads', v_leads");
    expect(body).toContain("'business_conversions', v_business_conversions");
    expect(body).toContain("'sent', v_sent");
    expect(body).toContain("'delivered', v_delivered");
    expect(body).toContain("'clicked', v_clicked");
    expect(body).toContain("'delivery_conversions', v_event_conversions");
    expect(body).not.toMatch(/'(?:sent|delivered|clicked|delivery_conversions|leads|business_conversions)',\s*COALESCE/i);
  });

  it("requires a recent matching simulation receipt and keeps draft preparation idempotent", () => {
    const sql = readMigration();
    const simulate = functionBody(sql, "admin_simulate_marketing_automation");
    const prepare = functionBody(sql, "admin_prepare_marketing_automation_action");

    expect(simulate).toContain("extensions.digest(v_input::text, 'sha256')");
    expect(simulate).toContain("INSERT INTO public.marketing_automation_simulation_receipts");
    expect(simulate).toContain("'simulation_key', v_simulation_key");
    expect(simulate).toContain("'expires_at', v_expires_at");
    expect(simulate).toContain("'deterministic', true");
    expect(simulate).toContain("'external_effect', false");
    expect(simulate).not.toMatch(/marketing_calendar_items|marketing_integrations|net\.http|http_post/i);

    expect(prepare).toContain("p_simulation_key text");
    expect(prepare).toContain("p_client_request_id uuid");
    expect(prepare).toContain("p_reason text");
    expect(prepare).toContain("Recent matching simulation receipt is required");
    expect(prepare).toContain("FROM public.marketing_automation_simulation_receipts r");
    expect(prepare).toContain("WHERE r.simulation_key = p_simulation_key");
    expect(prepare).toContain("FOR UPDATE");
    expect(prepare).toContain("v_receipt.actor_user_id IS DISTINCT FROM v_actor_user_id");
    expect(prepare).toContain("v_receipt.input_hash <> v_input_hash");
    expect(prepare).toContain("v_receipt.expires_at <= clock_timestamp()");
    expect(prepare).toContain("Automation draft reason must contain between 8 and 500 characters");
    expect(prepare).toContain("input_hash, reason, mode, status");
    expect(prepare).toContain("v_input_hash, btrim(p_reason), 'draft'");
    expect(prepare).not.toMatch(/digest\([^)]*p_reason/i);
    expect(prepare).toContain("ON CONFLICT (automation_id, client_request_id) DO NOTHING");
    expect(prepare).toContain("ON CONFLICT (idempotency_key) DO NOTHING");
    expect(prepare).toContain("consumed_by_action_id = v_action.id");
    expect(prepare).toContain("v_run.client_request_id <> p_client_request_id");
    expect(prepare).toContain("'draft'");
    expect(prepare).toContain("'human_required'");
    expect(prepare).toContain("'external_effect', false");
    expect(prepare).not.toMatch(/marketing_calendar_items|marketing_integrations|net\.http|http_post/i);
  });

  it("limits provider control to unconfigured or paused", () => {
    const sql = readMigration();
    const body = functionBody(sql, "admin_update_marketing_provider_control");

    expect(body).toContain("p_control_state NOT IN ('unconfigured', 'paused')");
    expect(body).toContain("external_actions_enabled = false");
    expect(body).not.toMatch(/observed_state\s*=|adapter_deployed\s*=|credential_ref\s*=/i);
  });

  it("uses a separate exact dispatcher with BFF session, CSRF, DB admin and redacted audit", () => {
    const sql = readMigration();
    const body = functionBody(sql, "service_execute_marketing_autopilot_operation");
    const operations = [...body.matchAll(/WHEN '([^']+)' THEN/g)].map((match) => match[1]);

    expect(operations).toEqual([
      "admin_get_marketing_autopilot_dashboard",
      "admin_simulate_marketing_automation",
      "admin_prepare_marketing_automation_action",
      "admin_upsert_marketing_asset",
      "admin_update_marketing_provider_control",
    ]);
    expect(body).toContain("marketing_require_service_role()");
    expect(body).toContain("service_get_marketing_web_session");
    expect(body).toContain("p_csrf_hash");
    expect(body).toContain("ur.role::text = 'admin'");
    expect(body).toContain("Marketing autopilot operation is not allowlisted");
    expect(body).toContain("'p_automation_key', 'p_input', 'p_simulation_key'");
    expect(body).toContain("v_args ->> 'p_simulation_key'");
    expect(body).toContain("v_args ->> 'p_reason'");
    expect(body).toContain("Deliberately omit p_args and business payloads");
    expect(body).toContain("'external_effect', false");
    expect(body).not.toContain("'args', v_args");
  });

  it("forces RLS, revokes direct access and hardens the AI run ledger", () => {
    const sql = readMigration();
    const protectedTables = [
      "marketing_provider_accounts",
      "marketing_provider_probes",
      "marketing_assets",
      "marketing_asset_rights",
      "marketing_campaign_assets",
      "marketing_utm_plans",
      "marketing_automation_templates",
      "marketing_automation_simulation_receipts",
      "marketing_automation_runs",
      "marketing_automation_actions",
      "marketing_attribution_facts",
    ];

    for (const table of protectedTables) {
      expect(sql).toContain(`ALTER TABLE public.${table} ENABLE ROW LEVEL SECURITY`);
      expect(sql).toContain(`ALTER TABLE public.${table} FORCE ROW LEVEL SECURITY`);
    }
    expect(sql).toContain("ALTER TABLE public.marketing_ai_runs FORCE ROW LEVEL SECURITY");
    expect(sql).toMatch(/REVOKE ALL ON TABLE public\.marketing_ai_runs[\s\S]*?PUBLIC, anon, authenticated, service_role/i);
    expect(sql).toMatch(/REVOKE ALL ON TABLE[\s\S]*?public\.marketing_provider_accounts[\s\S]*?public\.marketing_attribution_facts[\s\S]*?FROM PUBLIC, anon, authenticated, service_role/i);
    expect(sql).toMatch(/GRANT EXECUTE ON FUNCTION[\s\S]*?service_execute_marketing_autopilot_operation\(text, text, text, jsonb\)[\s\S]*?TO service_role/i);
    expect(sql).toContain("public.admin_prepare_marketing_automation_action(text, jsonb, text, uuid, text)");
    expect(sql).not.toMatch(/GRANT (?:SELECT|INSERT|UPDATE|DELETE|ALL) ON (?:TABLE )?public\.marketing_(?:provider|asset|automation|attribution)/i);
  });
});
