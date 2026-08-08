import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("Google Actions Center real-time updates", () => {
  const migration = read("supabase/migrations/20260728120000_google_actions_center_outbox.sql");
  const leaseMigration = read(
    "supabase/migrations/20260801100000_google_actions_center_outbox_claim_lease.sql",
  );
  const cron = read("supabase/migrations/20260728120100_google_actions_center_sync_cron.sql");
  const worker = read("supabase/functions/google-actions-center-sync/index.ts");
  const config = read("supabase/config.toml");
  const narrative = read("src/lib/admin/auditLogNarrative.ts");

  it("queues notifications in the reservation's own transaction", () => {
    // Writing the intent alongside the reservation is what makes delivery
    // recoverable: a failed HTTP call cannot lose a notification.
    expect(migration).toContain("CREATE TABLE IF NOT EXISTS public.google_actions_center_outbox");
    expect(migration).toContain("CREATE OR REPLACE FUNCTION public.enqueue_google_actions_center_updates");
    expect(migration).toContain("AFTER INSERT OR UPDATE OF status, date, party_size");
    expect(migration).toContain("ON public.reservations");

    // The trigger runs on every reservation in the product, so it must not do I/O.
    expect(migration).not.toMatch(/net\.http_post|pg_net/i);

    // A slot taken through TOK must disappear from Google just like one taken
    // through Google, so availability is queued whoever made the booking.
    expect(migration).toContain("'availability',");
    // Booking notifications stay limited to reservations Google knows about.
    expect(migration).toContain("FROM public.google_actions_center_bookings b");
    expect(migration).toContain("WHERE b.reservation_id = COALESCE(NEW.id, OLD.id)");
  });

  it("keeps the queue from piling up duplicates for one day", () => {
    expect(migration).toContain("uq_google_actions_center_outbox_pending_day");
    expect(migration).toContain("WHERE status = 'pending' AND kind = 'availability'");
    expect(migration).toContain("DO NOTHING");
  });

  it("claims work with a durable lease and a fencing token", () => {
    // SKIP LOCKED alone ends with the claim RPC transaction. The durable
    // processing state prevents another worker from reclaiming the row while
    // the first worker performs the external HTTP request.
    expect(leaseMigration).toContain("status = 'processing'");
    expect(leaseMigration).toContain("lease_expires_at <= now()");
    expect(leaseMigration).toContain("claim_token = gen_random_uuid()");
    expect(leaseMigration).toContain("lease_expires_at = now() + interval '30 minutes'");
    expect(leaseMigration).toContain("FOR UPDATE SKIP LOCKED");
    expect(leaseMigration).toContain("), 50)");

    // Only the worker that still owns the token can settle the row. Both token
    // fields are cleared before the row becomes sent, pending or abandoned.
    expect(leaseMigration).toContain("settle_google_actions_center_outbox_claim");
    expect(leaseMigration).toContain("claim_token = p_claim_token");
    expect(leaseMigration).toContain("claim_token = NULL");
    expect(leaseMigration).toContain("lease_expires_at = NULL");
    expect(leaseMigration).toContain("RETURN false");
    expect(leaseMigration).toContain("WHEN unique_violation THEN");
    expect(leaseMigration).toContain("superseded_by_newer_availability");

    // A permanently rejected row must stop consuming the batch.
    expect(leaseMigration).toContain("power(3, LEAST(COALESCE(v_attempts, 0), 5))");
    expect(leaseMigration).toContain("'abandoned'");

    // Service-role only, both ways.
    expect(leaseMigration).toContain("Service role required.");
    expect(leaseMigration).toContain(
      "REVOKE ALL ON FUNCTION public.settle_google_actions_center_outbox_claim",
    );
  });

  it("isolates everything that depends on the unverified Google contract", () => {
    // Endpoints and paths are configurable so correcting them after reading the
    // official reference is a one-place change.
    expect(worker).toContain("GOOGLE_ACTIONS_CENTER_API_BASE");
    expect(worker).toContain("GOOGLE_ACTIONS_CENTER_PARTNER_ID");
    expect(worker).toContain("GOOGLE_ACTIONS_CENTER_AVAILABILITY_PATH");
    expect(worker).toContain("GOOGLE_ACTIONS_CENTER_BOOKING_PATH");
    expect(worker).toContain("Google contract");

    // Service-account auth mirrors the pattern already proven by send-push.
    expect(worker).toContain('{ name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }');
    expect(worker).toContain("urn:ietf:params:oauth:grant-type:jwt-bearer");
    expect(worker).toContain("https://www.googleapis.com/auth/mapsbooking");
    expect(worker).toContain("GOOGLE_ACTIONS_CENTER_SERVICE_ACCOUNT");
  });

  it("recomputes availability at send time and verifies every settlement", () => {
    // Several bookings can land between the trigger and delivery, so the queued
    // payload must not be the one sent.
    expect(worker).toContain("get_restaurant_reservation_slot_availability");
    expect(worker).toContain("p_date: row.availability_date");
    expect(worker).toContain("remaining_tables");

    expect(worker).toContain("settle_google_actions_center_outbox_claim");
    expect(worker).toContain("p_claim_token: row.claim_token");
    expect(worker).toContain("if (error || settled !== true)");
    expect(worker).toContain("outbox_settle_failed");
    expect(worker).toContain("hasOutstandingDeliveryFailures");
    expect(worker).toContain('["pending", "processing", "abandoned"]');
    expect(worker).toContain('.or("status.eq.processing,last_error.not.is.null")');
    expect(worker).toContain("batch succeeded with outstanding delivery failures");
    expect(worker).toContain("MAX_BATCH_SIZE = 50");

    // Scheduler-authenticated and service-role gated.
    expect(worker).toContain("allowSchedulerSecret: true");
    expect(worker).toContain("if (!authenticated.isServiceRole) throw new HttpError(403");
  });

  it("emits stable incident evidence only after trusted authentication", () => {
    expect(worker).toContain('log.info("outbox idle", { claimed: 0 })');
    expect(worker).toContain("const stableFailureCodes = [...failureCodes].sort()");
    expect(worker).toContain("google_delivery_batch_failed:${stableFailureCodes.join");
    expect(worker).toContain("failure_codes: stableFailureCodes");
    expect(worker).toContain("if (actor) {");
    expect(worker).not.toContain("google_delivery_batch_failed:${failed}/${rows.length}");
    expect(worker).not.toContain("const adminClient = createAdminClient()");
  });

  it("never leases a row it has no credentials to deliver", () => {
    // Claiming first and discovering the missing service account afterwards left
    // rows stuck in `processing` with last_error NULL, re-leased every 30 minutes
    // by the claim RPC: production reached attempts = 2154 without a single
    // delivery attempt, and each run reopened the same incident.
    expect(worker).toContain("function serviceAccountConfigured()");
    expect(worker).toContain("if (!serviceAccountConfigured()) {");
    expect(worker).toContain('error: "google_service_account_missing"');
    expect(worker).toContain("503,");
    expect(worker).not.toContain('skipped: "google_service_account_missing"');

    // The guard is only worth anything before the claim.
    const guardAt = worker.indexOf("if (!serviceAccountConfigured()) {");
    const claimAt = worker.indexOf('.rpc("claim_google_actions_center_outbox"');
    expect(guardAt).toBeGreaterThan(-1);
    expect(claimAt).toBeGreaterThan(guardAt);

    // Visible in the edge logs and surfaced as a non-2xx integration failure so
    // callers and monitors cannot mistake missing credentials for a delivery.
    expect(worker).toContain("google actions center not configured, sync skipped");
  });

  it("is scheduled, registered and named in the audit log", () => {
    expect(cron).toContain("cron.schedule('tok-google-actions-center-sync', '*/2 * * * *'");
    expect(cron).toContain("internal_cron_secret");
    expect(cron).toContain("/google-actions-center-sync");
    expect(config).toContain("[functions.google-actions-center-sync]");
    expect(narrative).toContain('"google-actions-center-sync"');
  });
});
