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

  it("enforces the feature kill-switch throughout the privileged BFF session lifecycle", () => {
    const sql = readMigration();
    const functionBody = (name: string) => {
      const start = sql.indexOf(`CREATE OR REPLACE FUNCTION public.${name}`);
      const end = sql.indexOf("CREATE OR REPLACE FUNCTION", start + 1);
      expect(start, `${name} must exist`).toBeGreaterThanOrEqual(0);
      return sql.slice(start, end > start ? end : undefined);
    };
    const featureGuard = /NOT EXISTS\s*\([\s\S]{0,300}?FROM public\.feature_flags f[\s\S]{0,200}?f\.name\s*=\s*'admin-marketing-operations'[\s\S]{0,120}?f\.is_active IS TRUE/i;

    const finalize = functionBody("service_finalize_marketing_web_session");
    expect(finalize).toMatch(featureGuard);
    expect(finalize).toContain("Marketing operations feature is disabled");
    expect(finalize.indexOf("admin-marketing-operations")).toBeLessThan(
      finalize.indexOf("DELETE FROM public.marketing_admin_auth_challenges"),
    );

    const getSession = functionBody("service_get_marketing_web_session");
    expect(getSession).toMatch(featureGuard);
    expect(getSession).toMatch(
      /UPDATE public\.marketing_admin_web_sessions[\s\S]{0,300}?revoke_reason\s*=\s*COALESCE\(s\.revoke_reason,\s*'feature_disabled'\)[\s\S]{0,160}?RETURN NULL/i,
    );

    const requireAdmin = functionBody("marketing_require_admin");
    expect(requireAdmin).toMatch(featureGuard);
    expect(requireAdmin).toContain("Active marketing BFF administrator session required");
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
      "phone_normalized",
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

  it("rejects recreating a suppressed Swiss phone identity in another dialing format", () => {
    const sql = readMigration();
    const normalizerStart = sql.indexOf("CREATE OR REPLACE FUNCTION public.marketing_normalize_swiss_phone");
    const normalizerEnd = sql.indexOf("CREATE OR REPLACE FUNCTION", normalizerStart + 1);
    const normalizer = sql.slice(normalizerStart, normalizerEnd > normalizerStart ? normalizerEnd : undefined);
    const contactsStart = sql.indexOf("CREATE TABLE IF NOT EXISTS public.marketing_contacts");
    const contactsEnd = sql.indexOf("CREATE TABLE IF NOT EXISTS", contactsStart + 1);
    const contacts = sql.slice(contactsStart, contactsEnd > contactsStart ? contactsEnd : undefined);
    const upsertStart = sql.indexOf("CREATE OR REPLACE FUNCTION public.admin_upsert_marketing_contact");
    const upsertEnd = sql.indexOf("CREATE OR REPLACE FUNCTION", upsertStart + 1);
    const upsert = sql.slice(upsertStart, upsertEnd > upsertStart ? upsertEnd : undefined);
    const suppressStart = sql.indexOf("CREATE OR REPLACE FUNCTION public.admin_suppress_marketing_contact");
    const suppressEnd = sql.indexOf("CREATE OR REPLACE FUNCTION", suppressStart + 1);
    const suppress = sql.slice(suppressStart, suppressEnd > suppressStart ? suppressEnd : undefined);
    const phoneIndex = sql.match(
      /CREATE UNIQUE INDEX IF NOT EXISTS marketing_contacts_phone_unique[\s\S]{0,240}?;/i,
    )?.[0] || "";

    expect(normalizerStart).toBeGreaterThanOrEqual(0);
    expect(normalizer).toContain("IMMUTABLE");
    expect(normalizer).toMatch(/v_compact\s*~\s*'\^\\\+41\[2-9\]\[0-9\]\{8\}\$'/i);
    expect(normalizer).toContain("v_compact ~ '^0041[2-9][0-9]{8}$'");
    expect(normalizer).toContain("v_compact ~ '^0[2-9][0-9]{8}$'");
    expect(normalizer).toContain("RETURN '+41' || v_national");
    expect(normalizer).toContain("Invalid Swiss contact phone");
    expect(contacts).toContain(
      "phone_normalized text GENERATED ALWAYS AS (public.marketing_normalize_swiss_phone(phone)) STORED",
    );
    expect(phoneIndex).toMatch(/ON public\.marketing_contacts\(phone_normalized\)/i);
    expect(phoneIndex).toMatch(/WHERE phone_normalized IS NOT NULL/i);
    expect(phoneIndex).not.toMatch(/opted_out_at|lifecycle_status/i);

    expect(upsert).toContain("v_phone_normalized := public.marketing_normalize_swiss_phone(v_phone)");
    expect(upsert).toContain("c.phone_normalized = v_phone_normalized");
    expect(upsert).toContain("c.id IS DISTINCT FROM v_id");
    expect(upsert).toContain("Marketing phone identity already exists, including suppressed contacts");
    expect(upsert).toContain("Suppressed contact phone identity cannot be changed or removed");
    expect(upsert).not.toMatch(/c\.phone_normalized\s*=\s*v_phone_normalized[\s\S]{0,180}?c\.opted_out_at\s+IS\s+NULL/i);
    expect(suppress).toContain("opted_out_at = COALESCE(opted_out_at, now())");
    expect(suppress).not.toMatch(/DELETE FROM public\.marketing_contacts|phone\s*=\s*NULL/i);
  });

  it("binds canonical phone identity to fingerprints and the contact frequency cap", () => {
    const sql = readMigration();
    const upsertStart = sql.indexOf("CREATE OR REPLACE FUNCTION public.admin_upsert_marketing_contact");
    const upsertEnd = sql.indexOf("CREATE OR REPLACE FUNCTION", upsertStart + 1);
    const upsert = sql.slice(upsertStart, upsertEnd > upsertStart ? upsertEnd : undefined);
    const materializeStart = sql.indexOf("CREATE OR REPLACE FUNCTION public.service_materialize_marketing_deliveries");
    const materializeEnd = sql.indexOf("CREATE OR REPLACE FUNCTION", materializeStart + 1);
    const materialize = sql.slice(materializeStart, materializeEnd > materializeStart ? materializeEnd : undefined);
    const claimStart = sql.indexOf("CREATE OR REPLACE FUNCTION public.claim_marketing_deliveries");
    const claimEnd = sql.indexOf("CREATE OR REPLACE FUNCTION", claimStart + 1);
    const claim = sql.slice(claimStart, claimEnd > claimStart ? claimEnd : undefined);
    const manualStart = sql.indexOf("CREATE OR REPLACE FUNCTION public.admin_complete_manual_marketing_delivery");
    const manualEnd = sql.indexOf("CREATE OR REPLACE FUNCTION", manualStart + 1);
    const manual = sql.slice(manualStart, manualEnd > manualStart ? manualEnd : undefined);

    expect(upsert).toMatch(/lower\(v_email\),\s*v_phone_normalized,\s*v_user_id::text/i);
    expect(materialize).toContain("THEN c.phone_normalized");
    expect(materialize).toContain("reserved.contact_id = c.id");
    expect(materialize).toContain("c.last_contact_at <= now() - make_interval(hours => v_frequency_cap_hours)");
    expect(materialize).toContain("COALESCE(e.target_fingerprint, e.raw_target)");
    expect(claim).toContain("THEN c.phone_normalized");
    expect(claim).toContain("PARTITION BY d.contact_id");
    expect(claim).toContain("c.last_contact_at <= now() - make_interval(hours => v_frequency_cap_hours)");
    expect(manual).toMatch(/last_contact_at\s*=\s*now\(\)/i);
    expect(sql).toContain("WHEN v_delivery.channel = 'manual_call' THEN v_contact.phone_normalized");
  });

  it("qualifies restaurants only through a strict evidence-backed dispatcher payload", () => {
    const sql = readMigration();
    const upsertStart = sql.search(/CREATE OR REPLACE FUNCTION public\.admin_upsert_marketing_contact/i);
    const upsertEnd = sql.indexOf("CREATE OR REPLACE FUNCTION", upsertStart + 1);
    const upsert = sql.slice(upsertStart, upsertEnd > upsertStart ? upsertEnd : undefined);
    const dispatcherStart = sql.indexOf("CREATE OR REPLACE FUNCTION public.service_execute_marketing_admin_operation");
    const dispatcherEnd = sql.indexOf("-- Revoke the default PUBLIC EXECUTE", dispatcherStart);
    const dispatcher = sql.slice(dispatcherStart, dispatcherEnd);

    expect(upsert).toContain("A qualified restaurant requires an email or phone");
    expect(upsert).toContain("Legitimate interest is restricted to a manual phone task");
    expect(upsert).toContain("Lawful basis requires a dated source and an evidence note");
    expect(upsert).toContain("Registered client contacts cannot be converted into restaurant leads");
    expect(upsert).toContain("lawful_basis_evidence");
    expect(upsert).toContain("Opt-out cannot be cleared by contact upsert");
    expect(dispatcher).toContain("WHEN 'admin_upsert_marketing_contact' THEN");
    expect(dispatcher).toContain("Restaurant qualification contains unsupported fields");
    expect(dispatcher).toContain("'contact_type', 'restaurant_lead'");
    expect(dispatcher).toContain("'consent_source', CASE");
    expect(dispatcher).toContain("'consent_at', CASE");
    expect(dispatcher).toContain("'lawful_basis_evidence'");
    expect(dispatcher).not.toContain("v_args -> 'p_payload' -> 'metadata'");
  });

  it("suppresses contacts and exposes no path that can clear an opposition", () => {
    const sql = readMigration();
    const suppressStart = sql.search(/CREATE OR REPLACE FUNCTION public\.admin_suppress_marketing_contact/i);
    const suppressEnd = sql.indexOf("CREATE OR REPLACE FUNCTION", suppressStart + 1);
    const suppress = sql.slice(suppressStart, suppressEnd > suppressStart ? suppressEnd : undefined);

    expect(suppress).toContain("Suppression reason must contain between 8 and 500 characters");
    expect(suppress).toContain("opted_out_at = COALESCE(opted_out_at, now())");
    expect(suppress).toContain("lawful_basis = 'none'");
    expect(suppress).toContain("status = 'cancelled'");
    expect(suppress).toContain("'manual_required'");
    expect(sql).toContain("WHEN 'admin_suppress_marketing_contact' THEN");
  });

  it("reveals only an approved eligible manual call or email target and audits every access", () => {
    const sql = readMigration();
    const revealStart = sql.search(/CREATE OR REPLACE FUNCTION public\.admin_reveal_manual_delivery_target/i);
    const revealEnd = sql.indexOf("CREATE OR REPLACE FUNCTION", revealStart + 1);
    const reveal = sql.slice(revealStart, revealEnd > revealStart ? revealEnd : undefined);
    const listStart = sql.search(/CREATE OR REPLACE FUNCTION public\.admin_list_marketing_deliveries/i);
    const listEnd = sql.indexOf("CREATE OR REPLACE FUNCTION", listStart + 1);
    const list = sql.slice(listStart, listEnd > listStart ? listEnd : undefined);

    expect(revealStart).toBeGreaterThanOrEqual(0);
    expect(reveal).toContain("marketing_require_admin()");
    expect(reveal).toContain("v_delivery.status <> 'manual_required'");
    expect(reveal).toContain("v_delivery.channel NOT IN ('manual_call','manual_email')");
    expect(reveal).toContain("public.marketing_runtime_enabled() IS NOT TRUE");
    expect(reveal).toContain("AT TIME ZONE 'Europe/Zurich'");
    expect(reveal).toContain("v_item.approval_status <> 'approved'");
    expect(reveal).toContain("v_item.approved_at IS DISTINCT FROM v_delivery.item_approved_at");
    expect(reveal).toContain("marketing_contact_is_eligible");
    expect(reveal).toContain("marketing_manual_target_revealed");
    expect(reveal).toContain("'reason', left(btrim(p_reason), 500)");
    expect(reveal).toContain("'target', v_target");
    expect(list).toContain("'target_masked', page.target_masked");
    expect(list).not.toMatch(/'target'\s*,\s*(?:c\.)?(?:email|email_normalized|phone|raw_target)/i);
    expect(sql).toContain("WHEN 'admin_reveal_manual_delivery_target' THEN");
  });

  it("keeps manual visits fail-closed without a structured address", () => {
    const sql = readMigration();
    const eligibilityStart = sql.search(/CREATE OR REPLACE FUNCTION public\.marketing_contact_is_eligible/i);
    const eligibilityEnd = sql.indexOf("CREATE OR REPLACE FUNCTION", eligibilityStart + 1);
    const eligibility = sql.slice(eligibilityStart, eligibilityEnd > eligibilityStart ? eligibilityEnd : undefined);
    const visitSeed = sql.match(/\('manual-visit'[^\n]+/i)?.[0] || "";

    expect(visitSeed).toContain("'blocked_configuration'");
    expect(visitSeed).toContain("requires_structured_address");
    expect(sql).toMatch(/UPDATE public\.marketing_integrations SET[\s\S]{0,500}?WHERE channel = 'manual_visit'/i);
    expect(eligibility).toContain("WHEN p_channel = 'manual_visit' THEN false");
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
    expect(sql).toContain("marketing_admin_web_sessions");
    expect(sql).toContain("app.marketing_actor_user_id");
    expect(sql).toContain("app.marketing_web_session_sid_hash");
    expect(sql).toMatch(/user_roles[\s\S]{0,200}?role::text\s*=\s*'admin'/i);
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
    const grantsStart = sql.indexOf("GRANT EXECUTE ON FUNCTION", adminGrantStart);
    const grantsEnd = sql.indexOf("-- The schedule stores only", grantsStart);
    const grants = sql.slice(grantsStart, grantsEnd);

    for (const functionName of adminFunctions) {
      const start = sql.search(new RegExp(`CREATE OR REPLACE FUNCTION public\\.${functionName}\\s*\\(`, "i"));
      const end = sql.indexOf("CREATE OR REPLACE FUNCTION", start + 1);
      const body = sql.slice(start, end > start ? end : undefined);

      expect(body, `${functionName} must be SECURITY DEFINER`).toMatch(/SECURITY DEFINER/i);
      expect(body, `${functionName} must enforce admin`).toContain("marketing_require_admin()");
      expect(grants, `${functionName} must not be granted directly`).not.toContain(`public.${functionName}(`);
    }

    expect(grants).toContain(
      "public.service_execute_marketing_admin_operation(text, text, text, jsonb)",
    );
    expect(grants).toMatch(/service_execute_marketing_admin_operation[\s\S]*TO service_role;/i);
    expect(sql).not.toMatch(/TO\s+authenticated\s*;/i);

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

  it("stores only opaque BFF session hashes and encrypts pending Supabase tokens with Vault", () => {
    const sql = readMigration();
    const challengeTableStart = sql.indexOf(
      "CREATE TABLE IF NOT EXISTS public.marketing_admin_auth_challenges",
    );
    const challengeTableEnd = sql.indexOf("CREATE TABLE IF NOT EXISTS", challengeTableStart + 1);
    const challengeTable = sql.slice(challengeTableStart, challengeTableEnd);

    expect(challengeTableStart).toBeGreaterThanOrEqual(0);
    expect(challengeTable).toContain("pending_sid_hash text PRIMARY KEY");
    expect(challengeTable).toContain("access_token_ciphertext bytea NOT NULL");
    expect(challengeTable).toContain("refresh_token_ciphertext bytea NOT NULL");
    expect(challengeTable).not.toMatch(/\baccess_token\s+text/i);
    expect(challengeTable).not.toMatch(/\brefresh_token\s+text/i);
    expect(challengeTable).toContain("interval '10 minutes'");

    expect(sql).toContain("marketing_bff_encryption_secret");
    expect(sql).toContain("vault.decrypted_secrets");
    expect(sql).toContain("extensions.pgp_sym_encrypt");
    expect(sql).toContain("extensions.pgp_sym_decrypt");
    expect(sql).toContain("cipher-algo=aes256");
    expect(sql).toMatch(
      /ON CONFLICT \(pending_sid_hash\) DO UPDATE SET[\s\S]{0,700}?factor_id = EXCLUDED\.factor_id[\s\S]{0,400}?last_used_at = NULL[\s\S]{0,200}?expires_at = v_expires_at/i,
    );
    expect(sql).toContain("marketing_admin_web_session_lifetime");
    expect(sql).toContain("interval '4 hours'");
    expect(sql).toContain("marketing_admin_login_limits");
    expect(sql).toContain("v_max_attempts constant integer := 5");
    expect(sql).toContain("v_window constant interval := interval '15 minutes'");

    for (const table of [
      "marketing_admin_auth_challenges",
      "marketing_admin_web_sessions",
      "marketing_admin_login_limits",
    ]) {
      expect(sql).toContain(`ALTER TABLE public.${table} FORCE ROW LEVEL SECURITY`);
      expect(sql).toContain(
        `REVOKE ALL ON public.${table} FROM PUBLIC, anon, authenticated, service_role`,
      );
    }
  });

  it("exposes only the agreed service-role BFF function signatures", () => {
    const sql = readMigration();
    for (const signature of [
      "service_store_marketing_auth_challenge(text, uuid, text, text, uuid, uuid)",
      "service_get_marketing_auth_challenge(text)",
      "service_finalize_marketing_web_session(text, text, text, timestamptz)",
      "service_get_marketing_web_session(text, text, boolean)",
      "service_revoke_marketing_web_session(text)",
      "service_consume_marketing_auth_attempt(text)",
      "service_clear_marketing_auth_attempt(text)",
      "service_execute_marketing_admin_operation(text, text, text, jsonb)",
    ]) {
      expect(sql).toContain(`public.${signature}`);
    }
    const serviceGrantsStart = sql.indexOf("GRANT EXECUTE ON FUNCTION");
    const serviceGrantsEnd = sql.indexOf("-- The schedule stores only", serviceGrantsStart);
    expect(sql.slice(serviceGrantsStart, serviceGrantsEnd)).toMatch(/TO service_role;/i);
  });

  it("allowlists exactly the RPC operations used by the marketing client", () => {
    const sql = readMigration();
    const client = readFileSync(
      resolve(process.cwd(), "src/marketing/marketingClient.ts"),
      "utf8",
    );
    const dispatcherStart = sql.indexOf(
      "CREATE OR REPLACE FUNCTION public.service_execute_marketing_admin_operation",
    );
    const dispatcherEnd = sql.indexOf("-- Revoke the default PUBLIC EXECUTE", dispatcherStart);
    const dispatcher = sql.slice(dispatcherStart, dispatcherEnd);
    const clientOperations = Array.from(new Set(
      Array.from(client.matchAll(/invokeRpc(?:<[^>]+>)?\("(admin_[a-z0-9_]+)"/gi), (match) => match[1]),
    )).sort();
    const dispatcherOperations = Array.from(new Set(
      Array.from(dispatcher.matchAll(/WHEN\s+'(admin_[a-z0-9_]+)'\s+THEN/gi), (match) => match[1]),
    )).sort();

    expect(clientOperations).toHaveLength(24);
    expect(dispatcherOperations).toEqual(clientOperations);
    expect(dispatcher).toContain("service_get_marketing_web_session");
    expect(dispatcher).toContain("set_config('app.marketing_actor_user_id'");
    expect(dispatcher).toContain("set_config('app.marketing_web_session_sid_hash'");
    expect(dispatcher).toMatch(/user_roles[\s\S]{0,200}?role::text\s*=\s*'admin'/i);
    expect(dispatcher).toContain("Marketing operation is not allowlisted");
  });

  it("attributes every marketing mutation to the BFF actor context", () => {
    const sql = readMigration();
    const auditStart = sql.indexOf("CREATE OR REPLACE FUNCTION public.marketing_write_audit");
    const auditEnd = sql.indexOf("CREATE OR REPLACE FUNCTION", auditStart + 1);
    const auditFunction = sql.slice(auditStart, auditEnd);

    expect(sql).toContain("CREATE OR REPLACE FUNCTION public.marketing_actor_user_id()");
    expect(auditFunction).toContain("public.marketing_actor_user_id()");
    expect(sql.match(/auth\.uid\(\)/g)).toHaveLength(2);
    expect(sql.match(/public\.marketing_actor_user_id\(\)/g)?.length || 0).toBeGreaterThan(15);
    expect(sql).toContain("Active marketing BFF administrator session required");
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

  it("keeps lawful-basis proof immutable, typed and separately audited", () => {
    const sql = readMigration();
    const tableStart = sql.indexOf("CREATE TABLE IF NOT EXISTS public.marketing_lawful_basis_evidence");
    const tableEnd = sql.indexOf("CREATE TABLE IF NOT EXISTS", tableStart + 1);
    const table = sql.slice(tableStart, tableEnd > tableStart ? tableEnd : undefined);
    const captureStart = sql.indexOf("CREATE OR REPLACE FUNCTION public.marketing_capture_lawful_basis_evidence");
    const captureEnd = sql.indexOf("CREATE OR REPLACE FUNCTION", captureStart + 1);
    const capture = sql.slice(captureStart, captureEnd > captureStart ? captureEnd : undefined);
    const auditSummaryStart = capture.indexOf("'marketing_lawful_basis_evidence_recorded'");
    const auditSummary = capture.slice(auditSummaryStart);

    expect(tableStart).toBeGreaterThanOrEqual(0);
    expect(table).toContain("contact_id uuid NOT NULL REFERENCES public.marketing_contacts(id) ON DELETE RESTRICT");
    expect(table).toContain("evidence_source text NOT NULL");
    expect(table).toContain("evidence_note text NOT NULL");
    expect(table).toContain("evidence_recorded_at timestamptz NOT NULL");
    expect(table).toContain("evidence_fingerprint text NOT NULL");
    expect(sql).toContain("marketing_lawful_basis_evidence is append-only");
    expect(sql).toContain("BEFORE UPDATE OR DELETE ON public.marketing_lawful_basis_evidence");
    expect(sql).toContain("ALTER TABLE public.marketing_lawful_basis_evidence FORCE ROW LEVEL SECURITY");
    expect(sql).toContain(
      "REVOKE ALL ON public.marketing_lawful_basis_evidence FROM PUBLIC, anon, authenticated, service_role",
    );
    expect(captureStart).toBeGreaterThanOrEqual(0);
    expect(capture).toContain("app.marketing_lawful_basis_context");
    expect(capture).toContain("INSERT INTO public.marketing_lawful_basis_evidence");
    expect(capture).toContain("ON CONFLICT DO NOTHING");
    expect(capture).toContain("'evidence_fingerprint', v_fingerprint");
    expect(auditSummary).not.toContain("'evidence_note'");
    expect(auditSummary).not.toContain("'evidence_source'");
    expect(sql).toContain("CREATE TRIGGER marketing_contacts_lawful_basis_evidence");
    expect(sql).toContain("'migration_snapshot'");
  });

  it("implements bounded resumable catalogue and consent synchronization", () => {
    const sql = readMigration();
    const functionBody = (name: string) => {
      const start = sql.indexOf(`CREATE OR REPLACE FUNCTION public.${name}`);
      const end = sql.indexOf("CREATE OR REPLACE FUNCTION", start + 1);
      expect(start, `${name} must exist`).toBeGreaterThanOrEqual(0);
      return sql.slice(start, end > start ? end : undefined);
    };
    const prospects = functionBody("admin_sync_marketing_prospect_catalog");
    const consents = functionBody("admin_sync_marketing_client_consents");
    const dispatcher = functionBody("service_execute_marketing_admin_operation");

    expect(prospects).toMatch(/p_limit integer DEFAULT 500[\s\S]*p_after_source_objectid bigint[\s\S]*p_until_source_objectid bigint/i);
    expect(prospects).toContain("COALESCE(p_limit, 500), 1), 500");
    expect(prospects).toContain("c.source_objectid > p_after_source_objectid");
    expect(prospects).toContain("c.source_objectid <= v_watermark");
    expect(prospects).toContain("LIMIT v_limit + 1");
    expect(prospects).toContain("'next_cursor'");
    expect(prospects).toContain("'watermark'");
    expect(prospects).toContain("'remaining'");
    expect(prospects).toContain("'has_more'");
    expect(prospects).toContain("'complete'");
    expect(prospects).not.toMatch(/10000|25000/);

    expect(consents).toMatch(/p_limit integer DEFAULT 250[\s\S]*p_cursor text/i);
    expect(consents).toContain("COALESCE(p_limit, 250), 1), 250");
    expect(consents).toContain("r.user_id > v_after_user_id");
    expect(consents).toContain("LIMIT v_limit + 1");
    expect(consents).toContain("CROSS JOIN LATERAL");
    expect(consents).toContain("pg_advisory_xact_lock");
    expect(consents).toContain("v_contact.metadata ->> 'receipt_id' = v_receipt.id::text");
    expect(consents).toContain("app.marketing_lawful_basis_context");
    expect(consents).toContain("'processed'");
    expect(consents).toContain("'next_cursor'");
    expect(consents).toContain("marketing-consent-v1");
    expect(consents).toContain("v_actor_user_id");
    expect(consents).toContain("extensions.pgp_sym_encrypt");
    expect(consents).toContain("extensions.pgp_sym_decrypt");
    expect(consents).not.toContain("'next_cursor', CASE WHEN v_processed > 0 THEN v_next_cursor::text");
    expect(consents).toContain("'remaining'");
    expect(consents).not.toMatch(/10000|25000/);

    expect(dispatcher).toContain("v_args ->> 'p_after_source_objectid'");
    expect(dispatcher).toContain("v_args ->> 'p_until_source_objectid'");
    expect(dispatcher).toContain("v_args ->> 'p_cursor'");
    expect(dispatcher).not.toContain("v_args ->> 'p_after_user_id'");
  });

  it("uses the exact paginated list contract and never searches PII", () => {
    const sql = readMigration();
    const functionBody = (name: string) => {
      const start = sql.indexOf(`CREATE OR REPLACE FUNCTION public.${name}`);
      const end = sql.indexOf("CREATE OR REPLACE FUNCTION", start + 1);
      expect(start, `${name} must exist`).toBeGreaterThanOrEqual(0);
      return sql.slice(start, end > start ? end : undefined);
    };
    const contacts = functionBody("admin_list_marketing_contacts");
    const deliveries = functionBody("admin_list_marketing_deliveries");

    for (const body of [contacts, deliveries]) {
      expect(body).toMatch(/p_query text DEFAULT NULL[\s\S]*p_status text DEFAULT NULL[\s\S]*p_channel text DEFAULT NULL[\s\S]*p_limit integer DEFAULT 100[\s\S]*p_offset integer DEFAULT 0/i);
      expect(body).toContain("'items'");
      expect(body).toContain("'total'");
      expect(body).toContain("'has_more'");
      expect(body).toContain("position('%' IN v_query)");
      expect(body).toContain("position('_' IN v_query)");
    }
    expect(contacts).toContain("lower(c.display_name) LIKE v_query || '%'");
    expect(contacts).not.toMatch(/lower\([^\n]*(?:email|phone|target_fingerprint|source_reference|metadata)/i);
    expect(contacts).toContain("'email_masked', CASE WHEN c.email_normalized IS NULL THEN NULL");
    expect(contacts).toContain("'phone_masked', CASE WHEN c.phone_normalized IS NULL THEN NULL");
    expect(contacts).toContain("'has_email', c.email_normalized IS NOT NULL");
    expect(contacts).toContain("'has_phone', c.phone_normalized IS NOT NULL");
    expect(contacts).toContain("public.marketing_contact_is_eligible(c.id, 'email')");

    expect(deliveries).toContain("lower(i.title) LIKE v_query || '%'");
    expect(deliveries).toContain("lower(d.provider) LIKE v_query || '%'");
    expect(deliveries).not.toMatch(/lower\([^\n]*(?:target_masked|target_hash|manual_note|last_error|metadata)/i);
  });
});
