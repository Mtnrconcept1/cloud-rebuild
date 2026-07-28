import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("Google Actions Center real-time updates", () => {
  const migration = read("supabase/migrations/20260728120000_google_actions_center_outbox.sql");
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

  it("claims work safely and backs off on failure", () => {
    // Overlapping runs must not deliver the same notification twice.
    expect(migration).toContain("FOR UPDATE SKIP LOCKED");
    expect(migration).toContain("CREATE OR REPLACE FUNCTION public.claim_google_actions_center_outbox");
    expect(migration).toContain("CREATE OR REPLACE FUNCTION public.settle_google_actions_center_outbox");

    // A permanently rejected row must stop consuming the batch.
    expect(migration).toContain("power(3, LEAST(COALESCE(v_attempts, 0), 5))");
    expect(migration).toContain("'abandoned'");

    // Service-role only, both ways.
    expect(migration).toContain("Service role required.");
    expect(migration).toContain("REVOKE ALL ON public.google_actions_center_outbox FROM anon, authenticated");
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

  it("recomputes availability at send time and settles every row", () => {
    // Several bookings can land between the trigger and delivery, so the queued
    // payload must not be the one sent.
    expect(worker).toContain("get_restaurant_reservation_slot_availability");
    expect(worker).toContain("p_date: row.availability_date");
    expect(worker).toContain("remaining_tables");

    // Success and failure both settle, otherwise a row stays claimed forever.
    expect(worker).toContain("p_success: true");
    expect(worker).toContain("p_success: false");

    // Scheduler-authenticated and service-role gated.
    expect(worker).toContain("allowSchedulerSecret: true");
    expect(worker).toContain("if (!actor.isServiceRole) throw new HttpError(403");
  });

  it("is scheduled, registered and named in the audit log", () => {
    expect(cron).toContain("cron.schedule('tok-google-actions-center-sync', '*/2 * * * *'");
    expect(cron).toContain("internal_cron_secret");
    expect(cron).toContain("/google-actions-center-sync");
    expect(config).toContain("[functions.google-actions-center-sync]");
    expect(narrative).toContain('"google-actions-center-sync"');
  });
});
