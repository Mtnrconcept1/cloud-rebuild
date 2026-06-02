import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function read(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

describe("reconcile paid order checkouts", () => {
  const fn = read("supabase/functions/reconcile-paid-order-checkouts/index.ts");
  const config = read("supabase/config.toml");
  const migration = read("supabase/migrations/20260602095159_reconcile_paid_order_checkouts_10k_hardening.sql");

  it("accepts scheduler secret, service role or admin user only", () => {
    expect(fn).toContain("allowServiceRole: true");
    expect(fn).toContain("allowSchedulerSecret: true");
    expect(fn).toContain('requireRole(actor, ["admin"])');
    expect(config).toContain("[functions.reconcile-paid-order-checkouts]");
    expect(config).toContain("verify_jwt = false");
  });

  it("reconciles paid and expired Stripe sessions with audit logging", () => {
    expect(fn).toContain("stripe.checkout.sessions.retrieve");
    expect(fn).toContain('expand: ["payment_intent.payment_method"]');
    expect(fn).toContain("finalizePaidOrderCheckout");
    expect(fn).toContain("shouldDispatchNotifications: true");
    expect(fn).toContain("markOrderCheckoutSessionState");
    expect(fn).toContain('checkoutState: "expired"');
    expect(fn).toContain("writeAuditLog");
    expect(fn).toContain("dry_run");
  });

  it("schedules the reconciler every five minutes only when the Vault secret exists", () => {
    expect(migration).toContain("tok-reconcile-paid-order-checkouts");
    expect(migration).toContain("*/5 * * * *");
    expect(migration).toContain("vault.decrypted_secrets");
    expect(migration).toContain("internal_cron_secret");
    expect(migration).toContain("net.http_post");
    expect(migration).toContain("/reconcile-paid-order-checkouts");
  });
});
