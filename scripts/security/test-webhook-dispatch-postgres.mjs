#!/usr/bin/env node
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

// Fresh disposable PostgreSQL only. This script sends no HTTP request.
const env = process.env;
if (env.TOK_WEBHOOK_SECURITY_DISPOSABLE !== "true"
  || !["127.0.0.1", "localhost", "::1"].includes(env.PGHOST)
  || !/^\d{1,5}$/.test(env.PGPORT || "")
  || !/^tok_(?:security|connect_security)[a-z0-9_]*$/.test(env.PGDATABASE || "")
  || env.PGSERVICE || env.PGSERVICEFILE || env.PGHOSTADDR) {
  throw new Error("Requires TOK_WEBHOOK_SECURITY_DISPOSABLE=true and an explicit local tok_security* test database");
}
const root = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const read = (path) => readFileSync(resolve(root, path), "utf8");
const quote = (value) => "'" + String(value).replaceAll("'", "''") + "'";
function sql(query) {
  return new Promise((resolveResult, reject) => {
    const child = spawn("psql", ["-X", "-q", "-A", "-t", "-v", "ON_ERROR_STOP=1", "-c", query], {
      env: { ...env, PGOPTIONS: "-c statement_timeout=12000 -c lock_timeout=5000" }, stdio: ["ignore", "pipe", "pipe"],
    });
    let output = "";
    let errors = "";
    child.stdout.on("data", (data) => { output += data; });
    child.stderr.on("data", (data) => { errors += data; });
    child.on("error", reject);
    child.on("close", (code) => code === 0 ? resolveResult(output.trim()) : reject(new Error(errors.slice(0, 3000) || "psql failed")));
  });
}
const serviceSql = (query) => sql("SET ROLE service_role; SET request.jwt.claim.role='service_role'; " + query);
const json = async (query, service = false) => JSON.parse(await (service ? serviceSql(query) : sql(query)));
const claim = (limit = 5) => json("SELECT coalesce(jsonb_agg(to_jsonb(d)), '[]'::jsonb) FROM public.claim_tok_connect_webhook_deliveries(" + limit + ") d", true);
const complete = (row, outcome, status = null, body = null) => json("SELECT coalesce(to_jsonb(public.complete_tok_connect_webhook_delivery("
  + quote(row.id) + "::uuid," + quote(row.dispatch_lease_token) + "::uuid," + quote(outcome) + ","
  + (status === null ? "NULL" : status) + "," + (body === null ? "NULL" : quote(body))
  + ",'synthetic failure','synthetic-signature')), 'null'::jsonb)", true);

assert.equal(await sql("SELECT current_database()"), env.PGDATABASE);
assert.equal(await sql("SELECT coalesce(to_regclass('public.tok_connect_webhook_deliveries')::text,'')"), "", "refusing non-empty webhook database");
await sql(`
  DO $$ BEGIN
    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon NOLOGIN; END IF;
    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='service_role') THEN CREATE ROLE service_role NOLOGIN BYPASSRLS; END IF;
  END $$;
  CREATE SCHEMA IF NOT EXISTS auth;
  CREATE TABLE auth.users(id uuid PRIMARY KEY);
  CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.role', true), '') $$;
  GRANT USAGE ON SCHEMA auth TO anon, authenticated, service_role;
  GRANT EXECUTE ON FUNCTION auth.role() TO anon, authenticated, service_role;
  CREATE TABLE public.tok_connect_partners(id uuid PRIMARY KEY);
`);
// Use the real historical table definitions, including their constraints.
const foundation = read("supabase/migrations/20260626101032_tok_connect_foundation.sql");
for (const table of ["tok_connect_webhook_endpoints", "tok_connect_webhook_deliveries"]) {
  const statement = foundation.match(new RegExp("CREATE TABLE IF NOT EXISTS public\\." + table + " \\([\\s\\S]*?\\n\\);"))?.[0];
  assert.ok(statement, "historical contract missing: " + table);
  await sql(statement);
}
await sql(`
  ALTER TABLE public.tok_connect_webhook_deliveries ADD COLUMN last_attempted_at timestamptz, ADD COLUMN response_body text;
  ALTER TABLE public.tok_connect_webhook_endpoints ENABLE ROW LEVEL SECURITY;
  ALTER TABLE public.tok_connect_webhook_deliveries ENABLE ROW LEVEL SECURITY;
  GRANT ALL ON public.tok_connect_webhook_deliveries, public.tok_connect_webhook_endpoints TO service_role;
  INSERT INTO public.tok_connect_partners(id) VALUES ('00000000-0000-4000-8000-000000000001');
  INSERT INTO public.tok_connect_webhook_endpoints(id,partner_id,url,signing_secret)
    VALUES('00000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000001','https://fixture.example/hook','synthetic-only-secret');
`);
const migration = read("supabase/migrations/20261018140000_tok_connect_webhook_dispatch_security.sql");
await sql(migration);
await sql(migration);
for (const role of ["anon", "authenticated"]) {
  assert.equal(await sql("SELECT has_function_privilege(" + quote(role) + ",'public.claim_tok_connect_webhook_deliveries(integer)','EXECUTE')"), "f");
  assert.equal(await sql("SELECT has_function_privilege(" + quote(role) + ",'public.complete_tok_connect_webhook_delivery(uuid,uuid,text,integer,text,text,text)','EXECUTE')"), "f");
  await assert.rejects(sql("SET ROLE " + role + "; SET request.jwt.claim.role='service_role'; SELECT * FROM public.claim_tok_connect_webhook_deliveries(1)"), /permission denied/);
}
await assert.rejects(sql("SET ROLE service_role; SET request.jwt.claim.role='authenticated'; SELECT * FROM public.claim_tok_connect_webhook_deliveries(1)"), /service_role_required/);
const addRows = (count) => sql("INSERT INTO public.tok_connect_webhook_deliveries(endpoint_id,partner_id,event_type,payload) "
  + "SELECT '00000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000001','synthetic.test','{\"synthetic\":true}'::jsonb FROM generate_series(1," + count + ")");
await addRows(20);
const batches = await Promise.all(Array.from({ length: 8 }, () => claim(99)));
assert.ok(batches.every((batch) => batch.length <= 5));
const claimed = batches.flat();
assert.equal(claimed.length, 20);
assert.equal(new Set(claimed.map((row) => row.id)).size, 20, "SKIP LOCKED claims must be unique across eight concurrent connections");
assert.ok(claimed.every((row) => row.attempts === 1 && row.dispatch_lease_token));
assert.deepEqual(await claim(), [], "active leases cannot be claimed twice");

const old = claimed[0];
await sql("UPDATE public.tok_connect_webhook_deliveries SET dispatch_lease_expires_at=clock_timestamp()-interval '1 second' WHERE id=" + quote(old.id));
const [reclaimed] = await claim(1);
assert.equal(reclaimed.id, old.id);
assert.equal(reclaimed.attempts, 2);
assert.notEqual(reclaimed.dispatch_lease_token, old.dispatch_lease_token);
assert.equal(await complete(old, "delivered", 200), null, "stale worker cannot acknowledge a newer claim");
await assert.rejects(complete(reclaimed, "delivered", null), /invalid_webhook_completion/);
await assert.rejects(complete(reclaimed, "retry", 200), /invalid_webhook_completion/);
assert.equal(await complete(reclaimed, "delivered", 200, "x".repeat(3000)), "delivered");
assert.equal(await sql("SELECT length(response_body) FROM public.tok_connect_webhook_deliveries WHERE id=" + quote(old.id)), "2000");
assert.equal(await complete(reclaimed, "retry", 500), null, "delivered state cannot be overwritten");
const cancelled = claimed[1];
await sql("UPDATE public.tok_connect_webhook_deliveries SET status='cancelled' WHERE id=" + quote(cancelled.id));
assert.equal(await complete(cancelled, "delivered", 200), null, "cancellation survives an in-flight worker");
await sql("UPDATE public.tok_connect_webhook_deliveries SET status='cancelled' WHERE status='pending'");

await addRows(1);
for (let attempt = 1; attempt <= 5; attempt += 1) {
  const [row] = await claim(1);
  assert.ok(row);
  assert.equal(row.attempts, attempt);
  assert.equal(await complete(row, "retry", 503), attempt < 5 ? "pending" : "failed");
  if (attempt < 5) {
    const seconds = Number(await sql("SELECT extract(epoch FROM next_retry_at-last_attempted_at) FROM public.tok_connect_webhook_deliveries WHERE id=" + quote(row.id)));
    const expected = 60 * 2 ** (attempt - 1);
    assert.ok(seconds >= expected && seconds < expected + 20, "database retry delay for attempt " + attempt);
    assert.deepEqual(await claim(), [], "not-yet-due retry cannot be claimed");
    await sql("UPDATE public.tok_connect_webhook_deliveries SET next_retry_at=clock_timestamp()-interval '1 second' WHERE id=" + quote(row.id));
  }
}
assert.deepEqual(await claim(), [], "five attempts is a terminal limit");
await addRows(1);
await sql("UPDATE public.tok_connect_webhook_deliveries SET attempts=4 WHERE status='pending'");
const [crashed] = await claim(1);
assert.equal(crashed.attempts, 5);
await sql("UPDATE public.tok_connect_webhook_deliveries SET dispatch_lease_expires_at=clock_timestamp()-interval '1 second' WHERE id=" + quote(crashed.id));
assert.deepEqual(await claim(), []);
assert.equal(await sql("SELECT status FROM public.tok_connect_webhook_deliveries WHERE id=" + quote(crashed.id)), "failed", "crashed final attempt is cleaned up");
console.log("PASS: real contracts; idempotent migration; ACLs; eight-connection claims; leases; stale ACK; cancellation; retry delay; final-attempt crash");
