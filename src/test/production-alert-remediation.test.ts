import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();

function read(path: string) {
  return readFileSync(resolve(root, path), "utf8");
}

describe("production security alert remediation", () => {
  const migration = read("supabase/migrations/20260712060000_fix_production_security_alerts.sql");
  const auth = read("supabase/functions/_shared/auth.ts");
  const stripeWebhook = read("supabase/functions/stripe-webhook/index.ts");
  const sendEmail = read("supabase/functions/send-email/index.ts");
  const sendPush = read("supabase/functions/send-push/index.ts");

  it("provisions a Vault-backed scheduler without storing the secret in cron commands", () => {
    expect(migration).toContain("vault.create_secret");
    expect(migration).toContain("verify_internal_cron_secret");
    expect(migration).toContain("SELECT decrypted_secret FROM vault.decrypted_secrets");
    expect(migration).toContain("send-email-worker");
    expect(migration).toContain("send-push-worker");
    expect(migration).toContain("tok-reconcile-paid-order-checkouts");
    expect(migration).toContain("tok-reconcile-match-group-authorizations");
    expect(migration).toContain("tok-capture-due-match-groups");
    expect(auth).toContain('adminClient.rpc("verify_internal_cron_secret"');
  });

  it("uses the managed Stripe endpoint secret while preserving raw-body verification", () => {
    expect(migration).toContain("get_stripe_webhook_signing_secrets");
    expect(migration).toContain("stripe._managed_webhooks");
    expect(stripeWebhook).toContain('adminClient.rpc("get_stripe_webhook_signing_secrets"');
    expect(stripeWebhook).toContain("const body = await req.text()");
    expect(stripeWebhook).toContain("constructEventAsync");
  });

  it("removes known payment false positives and expired campaign noise", () => {
    expect(migration).toContain("COALESCE(o.total_amount, 0) > 0");
    expect(migration).toContain("lower(COALESCE(pt.metadata->>'checkout_kind', 'order')) = 'order'");
    expect(migration).toContain("ac.ends_at > now()");
    expect(migration).toContain("cs_live\\_%");
    expect(migration).toContain("checkout_expiry_reason");
  });

  it("deduplicates health incidents and treats unused on-demand functions as idle", () => {
    expect(migration).toContain("rootCauseId");
    expect(migration).toContain("stripe_webhook_signature");
    expect(migration).toContain("activityState', 'idle");
    expect(migration).toContain("activityState', 'recovered");
    expect(migration).toContain("ignored_24h");
    expect(migration).toContain("user_agent', '') NOT LIKE 'pg_net/%'");
  });

  it("reports real delivery failures and skips push work without an active token", () => {
    expect(migration).toContain("Archived stale delivery: RESEND_API_KEY not configured");
    expect(sendEmail).toContain('status: failed > 0 ? "failure" : "success"');
    expect(sendEmail).toContain("notification_failed");
    expect(sendPush).toContain("settleNotificationDelivery");
    expect(sendPush).toContain('terminalStatus: "skipped"');
    expect(sendPush).toContain('lastError: "No active device tokens"');
    expect(sendPush).toContain('status: failed > 0 ? "failure" : "success"');
    expect(sendPush).toContain("let skipped = 0");
  });
});
