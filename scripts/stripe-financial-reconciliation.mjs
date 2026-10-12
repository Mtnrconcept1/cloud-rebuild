#!/usr/bin/env node
/**
 * Independent, read-only Stripe -> Supabase reconciliation.
 * Only explicit authorised Stripe accounts are scanned. An unknown external
 * Stripe account cannot be discovered from TOK's own database.
 */
import { pathToFileURL } from "node:url";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
export function safeAccountLabel(value) {
  return String(value || "unknown").replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 48);
}
export function classifyPayment(intent, transactions, attempts) {
  const id = intent.id;
  const matches = [...transactions, ...attempts].filter((row) => row.stripe_payment_intent_id === id);
  if (matches.length === 0) return "missing_internal_record";
  const recordedAmounts = transactions.filter((row) => row.stripe_payment_intent_id === id && ["paid", "succeeded", "captured"].includes(row.status));
  if (recordedAmounts.length === 0) return "missing_successful_transaction";
  if (recordedAmounts.some((row) => Math.round(Number(row.amount) * 100) === intent.amount_received && String(row.currency).toLowerCase() === intent.currency)) return "matched";
  return "amount_or_currency_mismatch";
}
export async function fetchJson(url, headers, fetcher = fetch) {
  for (let retry = 0; retry < 3; retry++) {
    const response = await fetcher(url, { headers, signal: AbortSignal.timeout(20000) });
    if (response.ok) return response.json();
    if ((response.status === 429 || response.status >= 500) && retry < 2) {
      await sleep(500 * 2 ** retry);
      continue;
    }
    throw new Error("Upstream request failed with HTTP " + response.status + " (" + new URL(url).hostname + ")");
  }
}
async function listStripeIntents(config, since, until, fetcher) {
  let cursor;
  const result = [];
  do {
    const url = new URL("https://api.stripe.com/v1/payment_intents");
    url.searchParams.set("limit", "100");
    url.searchParams.set("created[gte]", String(since));
    url.searchParams.set("created[lt]", String(until));
    if (cursor) url.searchParams.set("starting_after", cursor);
    const page = await fetchJson(url, { Authorization: "Bearer " + config.secretKey }, fetcher);
    if (!Array.isArray(page.data) || typeof page.has_more !== "boolean") throw new Error("Invalid Stripe payment list response");
    result.push(...page.data.filter((p) => p.status === "succeeded" && p.livemode === true));
    if (!page.has_more) break;
    if (!page.data.length) throw new Error("Stripe pagination returned no cursor");
    cursor = page.data.at(-1).id;
  } while (true);
  return result;
}
async function listSupabaseRows(url, serviceKey, table, sinceIso, untilIso, fetcher) {
  let offset = 0;
  const rows = [];
  do {
    const query = new URL(url.replace(/\/$/, "") + "/rest/v1/" + table);
    query.searchParams.set("select", "stripe_payment_intent_id,amount,currency,status,created_at");
    query.searchParams.set("created_at", "gte." + sinceIso);
    query.searchParams.set("and", "(created_at.lt." + untilIso + ")");
    query.searchParams.set("limit", "1000");
    query.searchParams.set("offset", String(offset));
    const page = await fetchJson(query, { apikey: serviceKey, Authorization: "Bearer " + serviceKey }, fetcher);
    if (!Array.isArray(page)) throw new Error("Invalid Supabase table response: " + table);
    rows.push(...page);
    offset += page.length;
    if (page.length < 1000) break;
  } while (true);
  return rows;
}
async function listAttempts(url, serviceKey, sinceIso, untilIso, fetcher) {
  let offset = 0;
  const rows = [];
  do {
    const query = new URL(url.replace(/\/$/, "") + "/rest/v1/payment_attempts");
    query.searchParams.set("select", "stripe_payment_intent_id,created_at");
    query.searchParams.set("created_at", "gte." + sinceIso);
    query.searchParams.set("and", "(created_at.lt." + untilIso + ")");
    query.searchParams.set("limit", "1000");
    query.searchParams.set("offset", String(offset));
    const page = await fetchJson(query, { apikey: serviceKey, Authorization: "Bearer " + serviceKey }, fetcher);
    if (!Array.isArray(page)) throw new Error("Invalid Supabase attempts response");
    rows.push(...page);
    offset += page.length;
    if (page.length < 1000) break;
  } while (true);
  return rows;
}
export async function runAudit(env = process.env, fetcher = fetch) {
  const configs = JSON.parse(env.STRIPE_AUDIT_ACCOUNTS || "[]");
  if (!Array.isArray(configs) || !configs.length || configs.some((c) => !/^acct_[A-Za-z0-9]+$/.test(c.accountId || "") || !/^sk_live_/.test(c.secretKey || ""))) {
    throw new Error("STRIPE_AUDIT_ACCOUNTS must be a nonempty array of {accountId,secretKey} for approved live accounts");
  }
  if (new Set(configs.map((c) => c.accountId)).size !== configs.length) throw new Error("Duplicate Stripe account IDs");
  if (!/^https:\/\//.test(env.SUPABASE_URL || "") || !env.SUPABASE_SERVICE_ROLE_KEY) throw new Error("Missing Supabase read credentials");
  const days = Number(env.AUDIT_DAYS || 7);
  if (!Number.isInteger(days) || days < 1 || days > 90) throw new Error("AUDIT_DAYS must be 1..90");
  const until = Math.floor(Date.now() / 1000) - 3600; // allow asynchronous payment recording
  const since = until - days * 86400;
  const sinceIso = new Date(since * 1000).toISOString();
  const untilIso = new Date(until * 1000).toISOString();
  const [transactions, attempts] = await Promise.all([
    listSupabaseRows(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, "payment_transactions", sinceIso, untilIso, fetcher),
    listAttempts(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, sinceIso, untilIso, fetcher),
  ]);
  const report = { start: sinceIso, end: untilIso, accounts: [], anomalies: [] };
  for (const account of configs) {
    const identity = await fetchJson("https://api.stripe.com/v1/account", { Authorization: "Bearer " + account.secretKey }, fetcher);
    if (identity.id !== account.accountId) throw new Error("STRIPE_ACCOUNT_ID_MISMATCH for " + safeAccountLabel(account.accountId));
    const intents = await listStripeIntents(account, since, until, fetcher);
    report.accounts.push({ id: account.accountId, successful_intents: intents.length });
    for (const intent of intents) {
      const reason = classifyPayment(intent, transactions, attempts);
      if (reason !== "matched") {
        report.anomalies.push({
          account: account.accountId,
          payment_intent_id: intent.id,
          reason,
          amount_cents: intent.amount_received,
          currency: intent.currency,
        });
      }
    }
  }
  return report;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runAudit().then((result) => {
    console.log(JSON.stringify(result, null, 2));
    if (result.anomalies.length) process.exitCode = 2;
  }).catch((error) => { console.error("Stripe independent audit failed: " + error.message); process.exitCode = 1; });
}
