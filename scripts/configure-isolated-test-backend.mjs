import { fileURLToPath } from "node:url";

export const TEST_REF = "esmsehyxenyqewdfawie";
export function assertReplayDisabled(operation) {
  if (operation === "replay") throw new Error("TEST_MIGRATION_REPLAY_BLOCKED_NO_PROVEN_OUTBOUND_QUARANTINE");
}

export async function configureIsolatedTestBackend(mode, { env = process.env, fetchImpl = fetch, log = console.log } = {}) {
  assertReplayDisabled(mode);
  if (!["preflight", "configure"].includes(mode)) throw new Error("UNKNOWN_OPERATION");
  if (env.TOK_ISOLATED_TEST_MODE !== "true" || env.SUPABASE_PROJECT_REF !== TEST_REF) throw new Error("TEST_TARGET_REQUIRED");
  const token = env.SUPABASE_ACCESS_TOKEN;
  const stripeKey = env.STRIPE_SECRET_KEY_TEST;
  if (!token || !stripeKey?.startsWith("sk_test_")) throw new Error("TEST_CREDENTIALS_REQUIRED");
  const management = async (path, method = "GET", body) => {
    const res = await fetchImpl(`https://api.supabase.com/v1/projects/${TEST_REF}/${path}`, {
      method, headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(60000),
    });
    if (!res.ok) throw new Error(`TEST_MANAGEMENT_${res.status}`);
    const text = await res.text(); return text ? JSON.parse(text) : null;
  };
  const query = (sql) => management("database/query", "POST", { query: sql });
  if (mode === "preflight") {
    const secrets = await management("secrets");
    log(JSON.stringify({ project: TEST_REF, secretNames: secrets.map((s) => s.name) }));
    const rows = await query("select count(*) as outbound_queued from net.http_request_queue");
    log(JSON.stringify(rows));
    return;
  }
  if (mode === "configure") {
    // Delete every inherited custom provider credential before enabling test flows.
    // Supabase-managed SUPABASE_* runtime credentials are project-owned and reserved.
    const [state] = await query("select to_regclass('cron.job') is not null as cron_exists, (select count(*) from vault.secrets)::integer as vault_count, (select count(*) from net.http_request_queue)::integer as queued_count");
    if (!state || state.vault_count !== 0 || state.queued_count !== 0) throw new Error("TEST_OUTBOUND_PREFLIGHT_FAILED");
    if (state.cron_exists) {
      const [jobs] = await query("select count(*)::integer as active_count from cron.job where active");
      if (!jobs || jobs.active_count !== 0) throw new Error("TEST_CRON_QUARANTINE_REQUIRED");
    }
    const secrets = await management("secrets");
    const inherited = secrets.map((s) => s.name).filter((name) => !name.startsWith("SUPABASE_"));
    if (inherited.length) await management("secrets", "DELETE", inherited);
    const account = await fetchImpl("https://api.stripe.com/v1/account", {
      headers: { Authorization: `Bearer ${stripeKey}` }, signal: AbortSignal.timeout(15000),
    });
    if (!account.ok || !(await account.json()).id) throw new Error("STRIPE_TEST_ACCOUNT_CHECK_FAILED");
    const response = await fetchImpl("https://api.stripe.com/v1/webhook_endpoints", {
      method: "POST", headers: { Authorization: `Bearer ${stripeKey}`, "Content-Type": "application/x-www-form-urlencoded", "Idempotency-Key": `tok-isolated-webhook-${TEST_REF}` },
      body: new URLSearchParams({ url: `https://${TEST_REF}.supabase.co/functions/v1/stripe-webhook`,
        "enabled_events[0]": "checkout.session.completed", "enabled_events[1]": "checkout.session.async_payment_succeeded",
        description: "TOK temporary isolated MCP Test environment; delete after acceptance tests" }),
      signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) throw new Error("STRIPE_TEST_WEBHOOK_CREATE_FAILED");
    const endpoint = await response.json();
    if (endpoint.livemode !== false || !endpoint.secret?.startsWith("whsec_")) throw new Error("STRIPE_TEST_WEBHOOK_MODE_INVALID");
    await management("secrets", "POST", [
      { name: "TOK_ISOLATED_TEST_MODE", value: "true" },
      { name: "STRIPE_SECRET_KEY_TEST", value: stripeKey },
      { name: "STRIPE_ISOLATED_TEST_WEBHOOK_SECRET", value: endpoint.secret },
      { name: "PUBLIC_APP_URL", value: "http://localhost:5173" },
    ]);
    log(JSON.stringify({ project: TEST_REF, testWebhookId: endpoint.id, configured: true }));
    return;
  }

}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  configureIsolatedTestBackend(process.argv[2]).catch((error) => { console.error(error instanceof Error ? error.message : "TEST_BACKEND_FAILED"); process.exitCode = 1; });
}
