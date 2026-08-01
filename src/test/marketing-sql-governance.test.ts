import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const migrationPath = "supabase/migrations/20260801190000_marketing_operations_center.sql";

function readMigration() {
  return readFileSync(resolve(process.cwd(), migrationPath), "utf8");
}

describe("marketing SQL governance", () => {
  it("starts every automation paused and every external integration unavailable", () => {
    const sql = readMigration();
    const integrationSeedStart = sql.indexOf("INSERT INTO public.marketing_integrations");
    const automationSeedStart = sql.indexOf("INSERT INTO public.marketing_automations", integrationSeedStart);
    const integrationSeed = sql.slice(integrationSeedStart, automationSeedStart);

    expect(sql).toMatch(/CREATE TABLE(?: IF NOT EXISTS)? public\.marketing_automations[\s\S]*?status\s+text\s+NOT NULL\s+DEFAULT\s+'paused'/i);
    expect(sql).toMatch(/marketing_automations[\s\S]*?CHECK\s*\([\s\S]*?'paused'[\s\S]*?'active'[\s\S]*?'disabled'[\s\S]*?'error'/i);
    expect(sql).toMatch(/global_runtime[\s\S]*?'paused'/i);
    expect(sql).toMatch(/v_status\s*=\s*'active'[\s\S]{0,500}?v_global_paused[\s\S]{0,500}?RAISE EXCEPTION/i);
    for (const functionName of ["claim_due_marketing_items", "claim_marketing_item"]) {
      const start = sql.search(new RegExp(`CREATE OR REPLACE FUNCTION public\\.${functionName}\\s*\\(`, "i"));
      const end = sql.indexOf("CREATE OR REPLACE FUNCTION", start + 1);
      const body = sql.slice(start, end > start ? end : undefined);

      expect(start, `${functionName} must exist`).toBeGreaterThanOrEqual(0);
      expect(body, `${functionName} must fail closed through the shared runtime guard`).toMatch(
        /public\.marketing_runtime_enabled\(\)\s+IS\s+NOT\s+TRUE/i,
      );
    }
    for (const provider of [
      "resend",
      "firebase",
      "instagram",
      "facebook",
      "linkedin",
      "tiktok",
      "youtube",
      "telegram",
      "google-business",
      "website",
    ]) {
      const row = integrationSeed.match(new RegExp(`\\('${provider}'[^\\n]+`, "i"))?.[0] || "";
      expect(row).toMatch(/'(?:disconnected|blocked_configuration)'/i);
      expect(row).not.toMatch(/'connected'/i);
    }
    expect(sql).not.toMatch(/INSERT INTO public\.marketing_automations[\s\S]{0,1200}?'active'/i);
  });

  it("keeps tok_news manual and rejects custom activation without an automation engine", () => {
    const sql = readMigration();
    const tokNewsRow = sql.match(/\('tok-platform'[^\n]+/i)?.[0] || "";
    const upsertStart = sql.indexOf("CREATE OR REPLACE FUNCTION public.admin_upsert_marketing_automation");
    const upsertEnd = sql.indexOf("CREATE OR REPLACE FUNCTION", upsertStart + 1);
    const upsertFunction = sql.slice(upsertStart, upsertEnd > upsertStart ? upsertEnd : undefined);

    expect(tokNewsRow).toMatch(/'tok_news'\s*,\s*'manual'/i);
    expect(tokNewsRow).toMatch(/"manual"\s*:\s*true/i);
    expect(upsertStart).toBeGreaterThanOrEqual(0);
    expect(upsertFunction).toMatch(
      /IF\s+v_status\s*=\s*'active'\s+THEN\s+RAISE EXCEPTION\s+'Automation rules engine is not enabled/i,
    );
  });

  it("seeds the admin feature enabled without overwriting a later kill-switch", () => {
    const sql = readMigration();
    const flagSeedStart = sql.indexOf("admin-marketing-operations");
    expect(flagSeedStart).toBeGreaterThanOrEqual(0);
    const flagSeed = sql.slice(Math.max(0, flagSeedStart - 1_000), flagSeedStart + 1_500);

    expect(flagSeed).toMatch(/feature_flags/i);
    expect(flagSeed).toMatch(/admin-marketing-operations[\s\S]*?true/i);
    expect(flagSeed).not.toMatch(/DO UPDATE SET[\s\S]*?is_active\s*=\s*true/i);
  });

  it("stores provenance, lawful basis, consent proof and suppression state", () => {
    const sql = readMigration();

    expect(sql).toMatch(/CREATE TABLE(?: IF NOT EXISTS)? public\.marketing_contacts/i);
    for (const column of [
      "lawful_basis",
      "consent_source",
      "consent_at",
      "opted_out_at",
      "suppression_reason",
      "last_verified_at",
      "source_system",
      "source_reference",
      "email_normalized",
      "target_fingerprint",
    ]) {
      expect(sql).toMatch(new RegExp(`\\b${column}\\b`, "i"));
    }

    expect(sql).toMatch(/lawful_basis[\s\S]{0,500}?DEFAULT\s+'none'/i);
    expect(sql).toMatch(/lawful_basis[\s\S]{0,1000}?'none'[\s\S]*?'consent'[\s\S]*?'existing_customer'[\s\S]*?'legitimate_interest'/i);
  });

  it("never lets a bulk admin upsert erase an opt-out", () => {
    const sql = readMigration();
    const functionStart = sql.search(/CREATE OR REPLACE FUNCTION public\.admin_upsert_marketing_contact/i);
    expect(functionStart).toBeGreaterThanOrEqual(0);
    const functionBody = sql.slice(functionStart, functionStart + 12_000);

    expect(functionBody).toMatch(/opted_out_at/i);
    expect(functionBody).toMatch(/RAISE EXCEPTION/i);
    expect(functionBody).not.toMatch(/opted_out_at\s*=\s*NULL/i);
  });

  it("filters dispatch eligibility on positive lawful basis and no opt-out", () => {
    const sql = readMigration();

    expect(sql).toMatch(/lawful_basis\s*(?:<>|!=)\s*'none'/i);
    expect(sql).toMatch(/opted_out_at\s+IS\s+NULL/i);
    expect(sql).toMatch(/marketing_deliveries[\s\S]*?idempotency/i);
    expect(sql).toMatch(/marketing_contact_is_eligible\s*\(/i);
    expect(sql).toMatch(/g\.status\s*=\s*'connected'/i);
  });

  it("enforces server-side admin authorization, RLS and audited mutations", () => {
    const sql = readMigration();

    expect(sql).toContain("ENABLE ROW LEVEL SECURITY");
    expect(sql).toMatch(/auth_is_admin\s*\(\s*\)/i);
    expect(sql).toMatch(/REVOKE[\s\S]*?FROM\s+(?:PUBLIC|anon)/i);
    expect(sql).toMatch(/public\.audit_log/i);
    expect(sql).toMatch(/SECURITY DEFINER/i);
  });

  it("revokes default PUBLIC execution from every privileged RPC", () => {
    const sql = readMigration();
    const aclStart = sql.indexOf("-- Revoke the default PUBLIC EXECUTE privilege");
    const adminGrantStart = sql.indexOf("GRANT EXECUTE ON FUNCTION", aclStart);
    const aclBlock = sql.slice(aclStart, adminGrantStart);
    const adminFunctions = Array.from(new Set(
      Array.from(sql.matchAll(/CREATE OR REPLACE FUNCTION public\.(admin_[a-z0-9_]+)\s*\(/gi), (match) => match[1]),
    ));
    expect(adminFunctions.length).toBeGreaterThan(10);
    expect(aclBlock).toContain("p.proname ~");
    expect(aclBlock).toMatch(/admin_\.\*marketing/);
    expect(aclBlock).toMatch(/REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated, service_role/i);

    for (const functionName of adminFunctions) {
      const start = sql.search(new RegExp(`CREATE OR REPLACE FUNCTION public\\.${functionName}\\s*\\(`, "i"));
      const end = sql.indexOf("CREATE OR REPLACE FUNCTION", start + 1);
      const body = sql.slice(start, end > start ? end : undefined);

      expect(body, `${functionName} must be SECURITY DEFINER`).toMatch(/SECURITY DEFINER/i);
      expect(body, `${functionName} must enforce admin`).toContain("marketing_require_admin()");
      expect(sql, `${functionName} must grant authenticated`).toMatch(
        new RegExp(`GRANT EXECUTE ON FUNCTION[^;]*public\\.${functionName}\\([^;]*TO\\s+authenticated\\s*;`, "i"),
      );
    }

    for (const functionName of [
      "claim_due_marketing_items",
      "claim_marketing_item",
      "complete_marketing_item",
      "service_dispatch_marketing_notification_item",
      "service_materialize_marketing_deliveries",
      "claim_marketing_deliveries",
      "complete_marketing_delivery",
      "record_marketing_provider_event",
    ]) {
      const start = sql.search(new RegExp(`CREATE OR REPLACE FUNCTION public\\.${functionName}\\s*\\(`, "i"));
      const end = sql.indexOf("CREATE OR REPLACE FUNCTION", start + 1);
      const body = sql.slice(start, end > start ? end : undefined);

      expect(start, `${functionName} must exist`).toBeGreaterThanOrEqual(0);
      expect(body, `${functionName} must enforce service role`).toContain("marketing_require_service_role()");
      expect(sql, `${functionName} must grant only the worker role`).toMatch(
        new RegExp(`GRANT EXECUTE ON FUNCTION[^;]*public\\.${functionName}\\([^;]*TO\\s+service_role\\s*;`, "i"),
      );
    }
  });

  it("creates campaign and calendar drafts atomically with an idempotency key", () => {
    const sql = readMigration();
    const start = sql.search(/CREATE OR REPLACE FUNCTION public\.admin_create_marketing_campaign_bundle/i);
    const end = sql.indexOf("CREATE OR REPLACE FUNCTION", start + 1);
    const body = sql.slice(start, end > start ? end : undefined);

    expect(start).toBeGreaterThanOrEqual(0);
    expect(sql).toMatch(/CREATE UNIQUE INDEX IF NOT EXISTS marketing_campaigns_client_request_unique/i);
    expect(body).toContain("marketing_require_admin()");
    expect(body).toContain("pg_advisory_xact_lock");
    expect(body).toContain("Campaign bundles are create-only");
    expect(body).toContain("admin_upsert_marketing_campaign");
    expect(body).toContain("admin_upsert_marketing_calendar_item");
    expect(body).toContain("'client_request_id'");
    expect(body).toContain("'complete'");
    expect(body).toContain("'duplicate', true");
  });

  it("closes only approved public items assigned to a manual integration", () => {
    const sql = readMigration();
    const start = sql.search(/CREATE OR REPLACE FUNCTION public\.admin_complete_manual_marketing_item/i);
    const end = sql.indexOf("CREATE OR REPLACE FUNCTION", start + 1);
    const body = sql.slice(start, end > start ? end : undefined);

    expect(start).toBeGreaterThanOrEqual(0);
    expect(body).toContain("marketing_require_admin()");
    expect(body).toContain("Manual item outcome must be published or failed");
    expect(body).toContain("A manual publication note is required");
    expect(body).toContain("v_item.approval_status <> 'approved'");
    expect(body).toContain("v_integration.status <> 'manual'");
    expect(body).toContain("v_campaign.approved_at IS NULL");
    expect(body).toContain("'manual_note', left(btrim(p_note), 2000)");
    expect(body).toContain("marketing_manual_item_completed");
    expect(body).toContain("'duplicate', true");
  });

  it("does not embed credentials or expose raw PII in list RPCs", () => {
    const sql = readMigration();
    const listStart = sql.search(/CREATE OR REPLACE FUNCTION public\.admin_list_marketing_contacts/i);
    const listEnd = sql.indexOf("CREATE OR REPLACE FUNCTION", listStart + 1);
    const listFunction = sql.slice(listStart, listEnd > listStart ? listEnd : undefined);

    expect(sql).not.toMatch(/-----BEGIN (?:RSA |EC )?PRIVATE KEY-----/);
    expect(sql).not.toMatch(/\b(?:sk_(?:live|test)|sk-proj-|sb_secret_)[A-Za-z0-9_-]{12,}/);
    expect(sql).not.toMatch(/\b(?:whsec_|xox[baprs]-)[A-Za-z0-9_-]{12,}/);
    expect(sql).not.toMatch(/\bAIza[0-9A-Za-z_-]{20,}/);
    expect(sql).not.toMatch(/\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/);
    expect(sql).not.toMatch(/service_role_key\s*[:=]/i);
    expect(sql).toMatch(/mask|masked|redact/i);
    expect(listStart).toBeGreaterThanOrEqual(0);
    expect(listFunction).toContain("email_masked");
    expect(listFunction).toContain("phone_masked");
    expect(listFunction).not.toMatch(/'email'\s*,\s*(?:c\.)?email\b/i);
    expect(listFunction).not.toMatch(/'phone'\s*,\s*(?:c\.)?phone\b/i);
    expect(sql).not.toMatch(
      /GRANT\s+(?:ALL|SELECT|INSERT|UPDATE|DELETE)(?:\s*,\s*(?:SELECT|INSERT|UPDATE|DELETE))*\s+ON\s+(?:TABLE\s+)?[^;]*\bpublic\.marketing_contacts\b[^;]*TO\s+authenticated\s*;/i,
    );
  });
});
