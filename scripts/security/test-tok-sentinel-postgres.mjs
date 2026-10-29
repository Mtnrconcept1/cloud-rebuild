#!/usr/bin/env node
// Isolated PostgreSQL 17 integration test. Never connects to a networked DB.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const container = process.env.TOK_SENTINEL_TEST_CONTAINER || "";
if (process.env.TOK_SENTINEL_DISPOSABLE !== "true" ||
    !/^tok-sentinel-test-[a-z0-9-]+$/.test(container)) {
  throw new Error("Explicit disposable test container and opt-in required.");
}
function docker(args, input) {
  return execFileSync("docker", args, {
    encoding: "utf8", input, timeout: 100_000, maxBuffer: 2 * 1024 * 1024,
    windowsHide: true,
  }).trim();
}
assert.equal(
  docker(["inspect", container, "--format", "{{.HostConfig.NetworkMode}}"]),
  "none", "Refusing any container with network access",
);
let databaseReady = false;
for (let attempt = 0; attempt < 40; attempt++) {
  try {
    databaseReady = docker(["exec", container, "pg_isready", "-U", "postgres"])
      .includes("accepting connections");
  } catch {
    databaseReady = false;
  }
  if (databaseReady) break;
  await new Promise((resolve) => setTimeout(resolve, 500));
}
if (!databaseReady) throw new Error("Disposable PostgreSQL did not start");
function sql(query) {
  return docker(["exec", "-i", container, "psql", "-X", "-q", "-A", "-t", "-v",
    "ON_ERROR_STOP=1", "-U", "postgres", "-d", "postgres"], query);
}
function expectBlocked(query, code) {
  assert.throws(() => sql(query), (error) => {
    const stderr = String(error.stderr || "");
    return stderr.includes(code);
  }, "Expected an explicit PostgreSQL authorization or state failure");
}

const fixture = [
  "CREATE ROLE anon NOLOGIN;",
  "CREATE ROLE authenticated NOLOGIN;",
  "CREATE ROLE service_role NOLOGIN BYPASSRLS;",
  "CREATE SCHEMA auth;",
  "GRANT USAGE ON SCHEMA auth TO anon, authenticated, service_role;",
  "GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;",
  "CREATE TYPE public.app_role AS ENUM ('client', 'admin');",
  "CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$ SELECT current_setting('request.jwt.claim.role', true) $$;",
  "CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;",
  "CREATE TABLE public.user_roles (user_id uuid PRIMARY KEY, role public.app_role NOT NULL);",
  "CREATE FUNCTION public.has_role(_uid uuid, _role public.app_role) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$ SELECT EXISTS (SELECT FROM public.user_roles WHERE user_id = _uid AND role = _role) $$;",
  "CREATE TABLE public.orders (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), restaurant_id uuid NOT NULL, user_id uuid, status text DEFAULT 'pending');",
  "CREATE TABLE public.reservations (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), restaurant_id uuid NOT NULL, user_id uuid, status text DEFAULT 'pending');",
  "CREATE TABLE public.payment_transactions (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid, status text DEFAULT 'pending');",
  "CREATE TABLE public.restaurants (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), status text DEFAULT 'active');",
  "CREATE TABLE public.restaurant_branches (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), restaurant_id uuid NOT NULL);",
  "GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA auth TO anon, authenticated, service_role;",
  "GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO anon, authenticated, service_role;",
  "GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated, service_role;",
  "GRANT USAGE ON TYPE public.app_role TO anon, authenticated, service_role;",
  ...["orders", "reservations", "payment_transactions", "user_roles",
    "restaurants", "restaurant_branches"].flatMap((table) => [
    "ALTER TABLE public." + table + " ENABLE ROW LEVEL SECURITY;",
    "CREATE POLICY initial_allowed_" + table + " ON public." + table +
      " FOR ALL TO authenticated USING (true) WITH CHECK (true);",
  ]),
].join("\n");
sql(fixture);
assert.ok(Number(sql("SHOW server_version_num;")) >= 170000, "PostgreSQL 17 required");

const migration = readFileSync(resolve("supabase/migrations/20261029043000_tok_sentinel_quarantine.sql"), "utf8");
sql(migration);
console.log("PASS migration applied on a disposable, network-isolated PostgreSQL 17 database");

const client = "11111111-1111-4111-8111-111111111111";
const administrator = "22222222-2222-4222-8222-222222222222";
const restaurant = "33333333-3333-4333-8333-333333333333";
const otherRestaurant = "44444444-4444-4444-8444-444444444444";
const incident = "55555555-5555-4555-8555-555555555555";
const incidentHash = "a".repeat(64);
const fingerprint = "b".repeat(64);
sql("INSERT INTO public.user_roles(user_id,role) VALUES ('" + administrator + "','admin');");
sql("INSERT INTO public.orders(restaurant_id,user_id) VALUES ('" + restaurant + "','" + client +
  "'),('" + otherRestaurant + "','" + client + "');");
assert.equal(sql("SELECT public.tok_sentinel_write_allowed('payments');"), "t");
assert.equal(sql("SELECT public.tok_sentinel_write_allowed('operations');"), "t");

const incidentRow = "INSERT INTO public.tok_sentinel_incidents (id,fingerprint,category,severity,scope,approval_token_hash,approval_expires_at,decision_chat_id,decision_message_id)" +
  " VALUES ('" + incident + "','" + fingerprint + "','payment_abuse','high','payments','" +
  incidentHash + "',now()+interval '1 hour','100200300',221);";
sql(incidentRow);
expectBlocked("SET ROLE anon; SELECT COUNT(*) FROM public.tok_sentinel_incidents;", "permission denied");
expectBlocked("SET ROLE authenticated; SET request.jwt.claim.sub = '" + client +
  "'; SELECT count(*) FROM public.tok_sentinel_incidents;", "permission denied");
expectBlocked("SET ROLE authenticated; SET request.jwt.claim.sub = '" + administrator +
  "'; SELECT count(*) FROM public.tok_sentinel_incidents;", "permission denied");
expectBlocked(
  "SET ROLE authenticated; SELECT public.tok_sentinel_decide('" + incident +
  "','" + incidentHash + "','100200300',221,'telegram:100200300','approve');",
  "permission denied",
);
console.log("PASS Sentinel forensic tables inaccessible to browser roles; only service-side MFA console can read");

const asService = "SET ROLE service_role; SET request.jwt.claim.role = 'service_role'; ";
const decision = "SELECT public.tok_sentinel_decide('" + incident + "','" + incidentHash +
  "','100200300',221,'telegram:100200300','approve');";
expectBlocked(asService + "SELECT public.tok_sentinel_decide('" + incident + "','" +
  incidentHash + "','wrong-chat',221,'telegram:100200300','approve');", "sentinel_stale_or_unverified_decision");
expectBlocked(asService + "SELECT public.tok_sentinel_decide('" + incident + "','" +
  incidentHash + "','100200300',999,'telegram:100200300','approve');", "sentinel_stale_or_unverified_decision");
assert.match(sql(asService + decision), /"status": "contained"|"status":"contained"/);
expectBlocked(asService + decision, "sentinel_stale_or_unverified_decision");
expectBlocked(asService + "UPDATE public.tok_sentinel_events SET event_type='modified' WHERE incident_id='" +
  incident + "';", "sentinel_events_append_only");
expectBlocked(asService + "DELETE FROM public.tok_sentinel_events WHERE incident_id='" +
  incident + "';", "sentinel_events_append_only");
console.log("PASS append-only Sentinel event history even for service role");
assert.equal(sql("SELECT public.tok_sentinel_write_allowed('payments');"), "f");
assert.equal(sql("SELECT public.tok_sentinel_write_allowed('operations');"), "t");

expectBlocked(
  "SET ROLE authenticated; INSERT INTO public.payment_transactions (user_id) VALUES ('" + client + "');",
  "row-level security",
);
sql("SET ROLE authenticated; INSERT INTO public.orders(restaurant_id,user_id) VALUES ('" +
  otherRestaurant + "','" + client + "');");
assert.equal(sql("SELECT COUNT(*) FROM public.tok_sentinel_containments WHERE released_at IS NULL;"), "1");
console.log("PASS atomic one-time Telegram decision; payment scope blocks transaction writes but not orders");

const release = "SELECT public.tok_sentinel_release('" + incident + "','admin:" + administrator + "');";
assert.match(sql(asService + release), /"status": "released"|"status":"released"/);
expectBlocked(asService + release, "sentinel_not_contained");
assert.equal(sql("SELECT public.tok_sentinel_write_allowed('payments');"), "t");
assert.equal(sql("SELECT count(*) FROM public.tok_sentinel_events WHERE incident_id = '" +
  incident + "' AND event_type IN ('containment_approved', 'containment_released');"), "2");
const restaurantIncident = "66666666-6666-4666-8666-666666666666";
const rHash = "c".repeat(64);
sql("INSERT INTO public.tok_sentinel_incidents " +
  "(id,fingerprint,category,severity,scope,target_id,approval_token_hash,approval_expires_at,decision_chat_id,decision_message_id)" +
  " VALUES ('" + restaurantIncident + "','" + "d".repeat(64) +
  "','authorization_probing','high','restaurant','" + restaurant + "','" + rHash +
  "',now()+interval '1 hour','100200300',222);");
sql(asService + "SELECT public.tok_sentinel_decide('" + restaurantIncident + "','" + rHash +
  "','100200300',222,'telegram:100200300','approve');");
assert.equal(sql("SELECT public.tok_sentinel_write_allowed('operations','" + restaurant +
  "','" + client + "');"), "f");
assert.equal(sql("SELECT public.tok_sentinel_write_allowed('operations','" + otherRestaurant +
  "','" + client + "');"), "t");
expectBlocked("SET ROLE authenticated; INSERT INTO public.reservations(restaurant_id,user_id) VALUES ('" +
  restaurant + "','" + client + "');", "row-level security");
sql("SET ROLE authenticated; INSERT INTO public.reservations(restaurant_id,user_id) VALUES ('" +
  otherRestaurant + "','" + client + "');");
sql(asService + "SELECT public.tok_sentinel_release('" + restaurantIncident + "','admin:" +
  administrator + "');");
console.log("PASS restaurant quarantine remains tenant-scoped, including direct PostgREST writes");

expectBlocked(
  "INSERT INTO public.tok_sentinel_incidents(fingerprint,category,severity,scope) VALUES('" +
    "e".repeat(64) + "','authorization_probing','high','global');",
  "tok_sentinel_global_critical_only",
);
const globalIncident = "77777777-7777-4777-8777-777777777777";
const gHash = "f".repeat(64);
sql("INSERT INTO public.tok_sentinel_incidents " +
  "(id,fingerprint,category,severity,scope,approval_token_hash,approval_expires_at,decision_chat_id,decision_message_id)" +
  " VALUES ('" + globalIncident + "','" + "a".repeat(64) +
  "','confirmed_rls_bypass','critical','global','" + gHash +
  "',now()+interval '1 hour','100200300',223);");
sql(asService + "SELECT public.tok_sentinel_decide('" + globalIncident + "','" + gHash +
  "','100200300',223,'telegram:100200300','approve');");
assert.equal(sql("SELECT public.tok_sentinel_write_allowed('operations','" + otherRestaurant +
  "','" + client + "');"), "f");
assert.equal(sql("SELECT public.tok_sentinel_write_allowed('payments');"), "f");
expectBlocked("SET ROLE authenticated; INSERT INTO public.orders(restaurant_id,user_id) VALUES ('" +
  otherRestaurant + "','" + client + "');", "row-level security");
sql(asService + "SELECT public.tok_sentinel_release('" + globalIncident + "','admin:" +
  administrator + "');");
assert.equal(sql("SELECT public.tok_sentinel_write_allowed('operations');"), "t");
console.log("PASS noncritical global containment rejected; critical global containment is reversible");

sql(migration);
assert.equal(sql("SELECT count(*) FROM public.tok_sentinel_containments WHERE incident_id = '" +
  incident + "';"), "1");
console.log("PASS MFA-gated server release RPC, audit events and migration reapplication");
