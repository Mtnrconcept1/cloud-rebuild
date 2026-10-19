#!/usr/bin/env node
import { readFileSync } from "node:fs";

// Generate a portable fixture for an empty, disposable PostgreSQL database.
// No connection or credentials are used by this script. Definitions that govern
// authorization, eligibility, approval and delivery creation come from the repo.
const supabaseRoot = new URL("../supabase/", import.meta.url);
const read = (path) => readFileSync(new URL(path, supabaseRoot), "utf8");
const base = read("migrations/20260801190000_marketing_operations_center.sql");
const coordinates = read("migrations/20260803010000_marketing_prospect_coordinates.sql");
const autopilot = read("migrations/20261003070000_marketing_autopilot_foundation.sql");

function sourceBlock(source, marker, terminator) {
  const start = source.indexOf(marker);
  if (start < 0 || source.indexOf(marker, start + marker.length) >= 0) {
    throw new Error(`Expected one source definition: ${marker}`);
  }
  const end = source.indexOf(terminator, start + marker.length);
  if (end < 0) throw new Error(`Missing source terminator: ${marker}`);
  return source.slice(start, end + terminator.length);
}
const fn = (source, name) => sourceBlock(source, `CREATE OR REPLACE FUNCTION public.${name}(`, "$$;");
const table = (name) => sourceBlock(base, `CREATE TABLE IF NOT EXISTS public.${name} (`, "\n);");
const index = (name) => sourceBlock(base, `CREATE UNIQUE INDEX IF NOT EXISTS ${name}\n`, ";");
const trigger = (name) => sourceBlock(base, `CREATE TRIGGER ${name} `, ";");
const statement = (source, marker) => sourceBlock(source, marker, ";");
const sections = [];
const add = (label, sql) => sections.push(`-- Fixture stage: ${label}\n${sql.trim()}\n`);
const marketingTables = [
  "marketing_campaigns", "marketing_integrations", "marketing_automations",
  "marketing_calendar_items", "marketing_contacts", "marketing_deliveries",
  "marketing_admin_web_sessions",
];

add("empty local Supabase identities and pgcrypto", `
CREATE ROLE anon;
CREATE ROLE authenticated;
CREATE ROLE service_role BYPASSRLS;
CREATE SCHEMA auth;
CREATE SCHEMA extensions;
CREATE EXTENSION pgcrypto WITH SCHEMA extensions;
CREATE TABLE auth.users (id uuid PRIMARY KEY, email text);
CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $$
  SELECT COALESCE(NULLIF(current_setting('request.jwt.claims', true), ''), '{}')::jsonb
$$;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT NULLIF(auth.jwt() ->> 'sub', '')::uuid
$$;
CREATE TABLE public.user_roles (user_id uuid REFERENCES auth.users(id), role text, PRIMARY KEY (user_id, role));
CREATE TABLE public.feature_flags (name text PRIMARY KEY, label text, is_active boolean NOT NULL DEFAULT false);
CREATE TABLE public.notification_preferences (user_id uuid PRIMARY KEY REFERENCES auth.users(id), categories jsonb, channels jsonb);
-- Only unrelated foreign-key targets are placeholders. These are never sent to a provider.
CREATE TABLE public.notification_campaigns (id uuid PRIMARY KEY);
CREATE TABLE public.social_posts (id uuid PRIMARY KEY);
CREATE TABLE public.ad_campaigns (id uuid PRIMARY KEY);
`);

add("verbatim marketing tables, coordinate columns and identity indexes", [
  fn(base, "marketing_actor_user_id"), fn(base, "marketing_normalize_swiss_phone"),
  ...marketingTables.map(table),
  statement(coordinates, "ALTER TABLE public.marketing_contacts\n"),
  ...[
    "marketing_contacts_user_unique", "marketing_contacts_email_unique",
    "marketing_contacts_phone_unique", "marketing_contacts_source_unique",
    "marketing_deliveries_item_contact_channel_unique", "marketing_deliveries_item_user_channel_unique",
    "marketing_deliveries_provider_message_unique",
  ].map(index),
].join("\n\n"));

add("verbatim session, admin, eligibility, approval and materialization functions", [
  ...["marketing_require_service_role", "service_get_marketing_web_session", "marketing_require_admin",
    "marketing_mask_target", "marketing_channel_availability", "marketing_runtime_enabled"].map((name) => fn(base, name)),
  read("migrations/20260803020000_marketing_b2b_legitimate_interest_email.sql"),
  ...["marketing_validate_audience_filter", "marketing_contact_matches_filter", "admin_estimate_marketing_audience",
    "admin_approve_marketing_item", "service_materialize_marketing_deliveries",
    "service_execute_marketing_admin_operation"].map((name) => fn(base, name)),
  fn(autopilot, "marketing_redact_audit_record"),
].join("\n\n"));

add("verbatim persisted revision triggers", [
  fn(base, "marketing_touch_version"), fn(base, "marketing_touch_delivery"),
  ...["marketing_campaigns_touch", "marketing_integrations_touch", "marketing_automations_touch",
    "marketing_calendar_touch", "marketing_contacts_touch", "marketing_deliveries_touch"].map(trigger),
].join("\n\n"));

add("source RLS and ACL for the included tables and functions", [
  ...marketingTables.map((name) => statement(base, `ALTER TABLE public.${name} ENABLE ROW LEVEL SECURITY`)),
  statement(base, "ALTER TABLE public.marketing_admin_web_sessions FORCE ROW LEVEL SECURITY"),
  ...marketingTables.map((name) => statement(base, `REVOKE ALL ON public.${name} FROM`)),
  `GRANT ALL ON ${marketingTables.filter((name) => name !== "marketing_admin_web_sessions").map((name) => `public.${name}`).join(", ")} TO service_role;`,
  sourceBlock(base, "DO $marketing_acl$", "$marketing_acl$;"),
  `GRANT EXECUTE ON FUNCTION public.service_get_marketing_web_session(text,text,boolean),
    public.service_execute_marketing_admin_operation(text,text,text,jsonb),
    public.service_materialize_marketing_deliveries(uuid,integer) TO service_role;`,
].join("\n\n"));

add("unrelated delivery renderer placeholder for additive template migration", `
-- This fixture never invokes delivery preparation or an external mail provider.
-- Its signature/body anchors allow the targeted-mailing migration's additive patch.
CREATE FUNCTION public.service_prepare_marketing_email_delivery(uuid,uuid) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE v_subject text; v_item record;
BEGIN RETURN jsonb_build_object(
    'subject', v_subject,
  'status','ready'); END;
$$;
`);

for (const name of [
  "20261018171046_marketing_targeted_mailing.sql",
  "20261018210000_marketing_mailing_recipients.sql",
  "20261018210100_marketing_mailing_image_upload.sql",
]) {
  for (const pass of [1, 2]) add(`${name}, application ${pass}`, read(`migrations/${name}`));
}
for (const name of ["marketing_mailing_recipients.sql", "marketing_mailing_image_upload.sql"]) {
  add(`SQL integration assertions: ${name}`, read(`tests/${name}`));
}

process.stdout.write([
  "-- Generated by scripts/marketing-mailing-sql-fixture.mjs.",
  "-- EMPTY DISPOSABLE DATABASE ONLY. Requires pgcrypto and permission to create local roles.",
  "-- No network, secrets, production records or provider delivery are used.",
  "-- Function and table definitions below are extracted verbatim; these are scoped integration fixtures, not a full Supabase bootstrap.",
  "", ...sections,
].join("\n"));
