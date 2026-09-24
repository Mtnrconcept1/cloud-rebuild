import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { Script } from "node:vm";
import { webcrypto } from "node:crypto";
import ts from "typescript";

// Execute the real handlers with isolated SDK/provider boundaries. No network,
// real credentials, customer records or provider side effects are available.
const root = new URL("../", import.meta.url);
const source = (path) => readFileSync(new URL(path, root), "utf8");
function loadModule(path, imports, globals = {}) {
  const exports = {};
  const compiled = ts.transpileModule(source(path), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    reportDiagnostics: true,
    fileName: path,
  });
  assert.equal(compiled.diagnostics?.filter((d) => d.category === ts.DiagnosticCategory.Error).length, 0);
  new Script(compiled.outputText, { filename: path }).runInNewContext({
    exports, module: { exports }, Request, Response, URL, Error,
    crypto: webcrypto, setTimeout, clearTimeout,
    require(id) {
      assert.ok(Object.hasOwn(imports, id), `Unexpected import: ${id}`);
      return imports[id];
    },
    Deno: { env: { get: () => undefined } },
    console: { error() {} },
    ...globals,
  }, { timeout: 5000 });
  return exports;
}
function loadAuth(logs = []) {
  return loadModule("supabase/functions/_shared/auth.ts", {
    "https://esm.sh/@supabase/supabase-js@2": {
      createClient() { throw new Error("Real SDK access forbidden in unit tests"); },
    },
  }, { console: { error: (...args) => logs.push(args) } });
}
class ProviderError extends Error {
  constructor({ retryable = false, ambiguous = false } = {}) {
    super("Provider failure");
    this.code = "provider_test_failure";
    this.retryable = retryable;
    this.ambiguous = ambiguous;
  }
}
function scenario(options = {}) {
  const auth = loadAuth();
  const calls = [];
  const audits = [];
  const state = { existing: options.existing ?? false, stateError: options.stateError ?? false, creates: 0 };
  const order = {
    id: "11111111-1111-4111-8111-111111111111", restaurant_id: "restaurant-test",
    owner_user_id: "owner-test", print_quote_id: "quote-test", print_export_id: "export-test",
    payment_status: options.paymentStatus ?? "paid", status: options.orderStatus ?? "paid",
    provider_reference: "TOKP_TEST_REFERENCE", shipping_address: {},
  };
  const job = { id: "job-test", print_order_id: order.id, job_type: "submit_order",
    lease_token: "lease-test", attempt_count: options.attemptCount ?? 1, max_attempts: 3 };
  const client = {
    from(table) {
      let selection = "";
      const result = () => {
        if (table === "print_orders") return { data: selection === "id, payment_attempt_id" ? [] : order, error: null };
        if (table === "print_settings") return { data: { enabled: true, new_orders_enabled: true }, error: null };
        if (table === "print_order_items") return { data: { id: "item-test", print_order_id: order.id, quantity: 1,
          provider_product_reference: "product-test", item_reference: "item-test", options: [] }, error: null };
        if (table === "print_quotes") return { data: { id: "quote-test", country: "CH",
          expires_at: new Date(Date.now() + 3600_000).toISOString(), selected_shipping_quote: "shipping-test" }, error: null };
        if (table === "print_exports") return { data: { id: "export-test", status: "approved",
          production_storage_path: "test/file.pdf", md5: "test-md5" }, error: null };
        throw new Error(`Unexpected table: ${table}`);
      };
      const chain = {
        select(value) { selection = value; return chain; },
        eq() { return chain; }, not() { return chain; }, order() { return chain; }, limit() { return chain; },
        update() { return chain; }, maybeSingle: async () => result(), single: async () => result(),
        then(resolve, reject) { return Promise.resolve(result()).then(resolve, reject); },
      };
      return chain;
    },
    async rpc(name, args) {
      calls.push({ name, args });
      if (name === "claim_print_fulfillment_jobs") return { data: [job], error: null };
      if (name === "advance_print_order_state") {
        if (state.stateError) return { data: null, error: { code: "40001", message: "Persistence failed" } };
        order.status = "submitted";
        return { data: { advanced: true }, error: null };
      }
      if (name === "complete_print_fulfillment_job") {
        return { data: null, error: options.completionError ? { code: "40001", message: "Lease lost" } : null };
      }
      throw new Error(`Unexpected RPC: ${name}`);
    },
    storage: { from: () => ({ createSignedUrl: async () => ({ data: { signedUrl: "https://example.invalid/test.pdf" }, error: null }) }) },
  };
  const provider = {
    async getOrder() {
      calls.push({ name: "provider.getOrder" });
      return state.existing ? { state: "submitted", stateCode: "submitted", items: [] } : null;
    },
    async createOrder() {
      calls.push({ name: "provider.createOrder" });
      state.creates++;
      if (options.providerError && !options.providerError.ambiguous) throw options.providerError;
      state.existing = true;
      if (options.providerError) throw options.providerError;
      return { accepted: true };
    },
  };
  let handler;
  loadModule("supabase/functions/print-orchestrator/index.ts", {
    "../_shared/auth.ts": {
      ...auth, createAdminClient: () => client,
      authenticateRequest: async () => {
        if (options.unauthorized) throw new auth.HttpError(401, "Unauthorized");
        return { authMode: "service_role", isServiceRole: true };
      },
      writeAuditLog: async (entry) => audits.push(entry),
    },
    "../_shared/cors.ts": { buildCorsHeaders: () => ({}), handleCorsPreflight: () => null },
    "../_shared/print/cloudprinter.ts": { CloudprinterError: ProviderError, getPrintProvider: () => provider },
  }, { Deno: { env: { get: () => undefined }, serve: (fn) => { handler = fn; } } });
  assert.equal(typeof handler, "function");
  return {
    state, calls, audits,
    completed: () => calls.filter((c) => c.name === "complete_print_fulfillment_job").map((c) => c.args.p_status),
    async run(body = {}, method = "POST") {
      const response = await handler(new Request("https://example.invalid/print-orchestrator", {
        method, ...(method === "POST" ? { body: JSON.stringify(body), headers: { "Content-Type": "application/json" } } : {}),
      }));
      return { status: response.status, body: await response.json() };
    },
  };
}

for (const [name, options] of [
  ["new provider submission", {}],
  ["existing provider order", { existing: true }],
  ["ambiguous response reconciled at provider", { providerError: new ProviderError({ retryable: true, ambiguous: true }) }],
]) {
  test(`does not complete after SQL failure: ${name}`, async () => {
    const s = scenario({ ...options, stateError: true });
    await s.run();
    assert.deepEqual(s.completed(), ["retrying"]);
  });
}
test("retries persistence without creating a second provider order", async () => {
  const s = scenario({ stateError: true });
  await s.run();
  assert.deepEqual(s.completed(), ["retrying"]);
  s.state.stateError = false;
  await s.run();
  assert.equal(s.state.creates, 1);
  assert.deepEqual(s.completed(), ["retrying", "completed"]);
});
test("persists state before marking a successful submission completed", async () => {
  const s = scenario();
  const result = await s.run();
  assert.equal(result.status, 200);
  assert.deepEqual(s.completed(), ["completed"]);
  assert.ok(s.calls.findIndex((c) => c.name === "advance_print_order_state") < s.calls.findIndex((c) => c.name === "complete_print_fulfillment_job"));
});
test("does not submit an order already present at the provider", async () => {
  const s = scenario({ existing: true });
  await s.run();
  assert.equal(s.state.creates, 0);
  assert.deepEqual(s.completed(), ["completed"]);
});
test("does not retry a permanent provider rejection", async () => {
  const s = scenario({ providerError: new ProviderError() });
  await s.run();
  assert.deepEqual(s.completed(), ["failed"]);
});
test("retries a temporary provider error", async () => {
  const s = scenario({ providerError: new ProviderError({ retryable: true }) });
  await s.run();
  assert.deepEqual(s.completed(), ["retrying"]);
});
test("stops retrying after the last permitted attempt", async () => {
  const s = scenario({ providerError: new ProviderError({ retryable: true }), attemptCount: 3 });
  await s.run();
  assert.deepEqual(s.completed(), ["failed"]);
});
test("surfaces inability to persist job completion instead of reporting success", async () => {
  const s = scenario({ stateError: true, completionError: true });
  assert.equal((await s.run()).status, 500);
});
test("keeps unpaid orders away from the provider", async () => {
  const s = scenario({ paymentStatus: "pending" });
  await s.run();
  assert.equal(s.state.creates, 0);
  assert.deepEqual(s.completed(), ["failed"]);
});
for (const status of ["canceled", "refunded"]) {
  test(`does not submit a terminal ${status} order even with a stale paid flag`, async () => {
    const s = scenario({ orderStatus: status });
    await s.run();
    assert.equal(s.state.creates, 0);
    assert.deepEqual(s.completed(), ["canceled"]);
  });
}
for (const limit of ["invalid", "5", {}, [], true, 0, -1, 1.5, 51]) {
  test(`rejects invalid batch limit ${JSON.stringify(limit)} before claiming jobs`, async () => {
    const s = scenario();
    assert.equal((await s.run({ limit })).status, 400);
    assert.equal(s.calls.length, 0);
  });
}
test("accepts a valid explicit batch limit", async () => {
  const s = scenario();
  assert.equal((await s.run({ limit: 5 })).status, 200);
  assert.equal(s.calls.find((c) => c.name === "claim_print_fulfillment_jobs").args.p_limit, 5);
});
test("rejects anonymous callers before claiming jobs", async () => {
  const s = scenario({ unauthorized: true });
  assert.equal((await s.run()).status, 401);
  assert.equal(s.calls.length, 0);
});
test("rejects an unsupported method before claiming jobs", async () => {
  const s = scenario();
  assert.equal((await s.run({}, "GET")).status, 405);
  assert.equal(s.calls.length, 0);
});

test("logs an SDK-returned audit error without throwing or leaking its payload", async () => {
  const logs = [];
  const auth = loadAuth(logs);
  await auth.writeAuditLog({ functionName: "test", status: "success", adminClient: {
    from: () => ({ insert: async () => ({ error: { code: "42501", message: "private-customer-payload", details: "private-details" } }) }),
  } });
  assert.equal(logs.length, 1);
  assert.match(JSON.stringify(logs), /42501/);
  assert.doesNotMatch(JSON.stringify(logs), /private-customer-payload|private-details/);
});
test("sanitizes thrown audit failures and preserves the non-throwing contract", async () => {
  const logs = [];
  const auth = loadAuth(logs);
  await auth.writeAuditLog({ functionName: "test", status: "success", adminClient: {
    from: () => ({ insert: async () => { throw { code: "unsafe code with private data", message: "private-customer-payload" }; } }),
  } });
  assert.equal(logs.length, 1);
  assert.doesNotMatch(JSON.stringify(logs), /unsafe code|private data|private-customer-payload/);
});
test("keeps successful audit metadata and does not emit a false alarm", async () => {
  const logs = [];
  let record;
  const auth = loadAuth(logs);
  await auth.writeAuditLog({ functionName: "test", action: "run", status: "success", metadata: { job_count: 2 }, adminClient: {
    from: () => ({ insert: async (row) => { record = row; return { error: null }; } }),
  } });
  assert.equal(record.function_name, "test");
  assert.equal(record.request_metadata.job_count, 2);
  assert.equal(logs.length, 0);
});

// Migration contracts complement (not replace) real PostgreSQL/RLS integration tests.
test("restricts exactly the six internal print RPCs without changing their bodies", () => {
  const sql = source("supabase/migrations/20260924040000_restrict_internal_print_rpc_execution.sql");
  const signatures = [
    "advance_print_order_state(uuid, text, text, text, text, text, text, text, jsonb)",
    "advance_print_reorder_state(uuid, text, text, text, text, text, text)",
    "claim_print_fulfillment_jobs(integer, text, integer)",
    "complete_print_fulfillment_job(uuid, uuid, text, text, text, jsonb, timestamptz)",
    "finalize_paid_print_order(uuid, uuid, text)",
    "record_print_provider_event(text, text, text, text, text, text, text, timestamptz, text, jsonb)",
  ];
  for (const signature of signatures) {
    assert.ok(sql.includes(`REVOKE EXECUTE ON FUNCTION public.${signature} FROM PUBLIC, anon, authenticated;`));
    assert.ok(sql.includes(`GRANT EXECUTE ON FUNCTION public.${signature} TO service_role;`));
  }
  assert.equal((sql.match(/REVOKE EXECUTE ON FUNCTION/g) || []).length, 6);
  assert.doesNotMatch(sql, /CREATE OR REPLACE FUNCTION|ALTER DEFAULT PRIVILEGES|ON ALL FUNCTIONS|DROP FUNCTION/i);
});
test("qualifies the Storage object path in all three invoice-logo policies", () => {
  const sql = source("supabase/migrations/20260924040100_qualify_invoice_logo_storage_paths.sql");
  assert.equal((sql.match(/ALTER POLICY/g) || []).length, 3);
  assert.equal((sql.match(/storage\.foldername\(storage\.objects\.name\)/g) || []).length, 6);
  assert.doesNotMatch(sql, /foldername\((?:name|r\.name)\)/i);
  assert.doesNotMatch(sql, /DELETE FROM|UPDATE storage\.objects|DROP/i);
});
test("aligns the two broad public-read policies without restricting owner/admin policies", () => {
  const sql = source("supabase/migrations/20260924040200_align_restaurant_public_read_policies.sql");
  assert.equal((sql.match(/ALTER POLICY/g) || []).length, 2);
  assert.equal((sql.match(/is_active IS TRUE/g) || []).length, 2);
  assert.equal((sql.match(/is_demo IS FALSE/g) || []).length, 2);
  assert.equal((sql.match(/lower\(COALESCE\(status, ''\)\) = 'active'/g) || []).length, 2);
  assert.ok(sql.includes("OR (id = public.commercial_demo_current_restaurant_id())"));
  assert.doesNotMatch(sql, /ALTER POLICY\s+(?:restaurants_owner_|"Admins)|AS RESTRICTIVE|DROP POLICY/i);
});
