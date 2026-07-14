import { existsSync, readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const root = process.cwd();
const googleBookingsTableCreation =
  "CREATE TABLE IF NOT EXISTS public.google_actions_center_bookings";

function read(relativePath: string) {
  const absolutePath = resolve(root, relativePath);
  expect(existsSync(absolutePath), `${relativePath} should exist`).toBe(true);
  return readFileSync(absolutePath, "utf8");
}

function readLatestMigrationContaining(pattern: string) {
  const migrationsDir = resolve(root, "supabase/migrations");
  const migrationName = readdirSync(migrationsDir)
    .filter((name) => name.endsWith(".sql"))
    .sort()
    .reverse()
    .find((name) => readFileSync(resolve(migrationsDir, name), "utf8").includes(pattern));

  expect(migrationName, `a migration containing ${pattern} should exist`).toBeTruthy();
  return readFileSync(resolve(migrationsDir, migrationName!), "utf8");
}

describe("Google Actions Center readiness", () => {
  it("keeps a Google Business canonical reservation URL while preserving the legacy short link", () => {
    const app = read("src/App.tsx");
    const migration = readLatestMigrationContaining("/reserver");

    expect(app).toContain('path="/r/:slug/reserver"');
    expect(app).toContain('path="/r/:slug"');
    expect(migration).toContain("'https://www.thetok.ch/r/' || v_candidate || '/reserver'");
    expect(migration).toContain("'https://www.thetok.ch/r/' || booking_slug || '/reserver'");
  });

  it("adds a Google Actions Center booking server with the required v3 routes and Basic auth", () => {
    const fn = read("supabase/functions/google-actions-center/index.ts");
    const config = read("supabase/config.toml");

    expect(config).toContain("[functions.google-actions-center]");
    expect(config).toContain("verify_jwt = false");

    expect(fn).toContain("/v3/HealthCheck/");
    expect(fn).toContain("/v3/BatchAvailabilityLookup/");
    expect(fn).toContain("/v3/CreateBooking/");
    expect(fn).toContain("/v3/UpdateBooking/");
    expect(fn).toContain("/v3/GetBookingStatus/");
    expect(fn).toContain("/v3/ListBookings/");
    expect(fn).toContain("GOOGLE_ACTIONS_CENTER_USERNAME");
    expect(fn).toContain("GOOGLE_ACTIONS_CENTER_PASSWORD");
    expect(fn).toContain("Basic realm=\"Google Actions Center\"");
    expect(fn).toContain("safeEqual");
    expect(fn).toContain("https://www.thetok.ch");
  });

  it("creates Google bookings through the existing reservation RPC with service-user attribution", () => {
    const fn = read("supabase/functions/google-actions-center/index.ts");

    expect(fn).toContain("GOOGLE_ACTIONS_CENTER_SERVICE_USER_ID");
    expect(fn).toContain("validate_and_create_reservation_safe");
    expect(fn).toContain("_internal_user_id");
    expect(fn).toContain("get_restaurant_reservation_slot_availability");
    expect(fn).toContain("google_actions_center_bookings");
    expect(fn).toContain("idempotency_token");
    expect(fn).toContain("request_hash");
    expect(fn).toContain("response_payload");
    expect(fn).toContain("writeAuditLog");
    expect(fn).not.toContain("SUPABASE_SERVICE_ROLE_KEY");
  });

  it("aligns Booking Server status, list and availability lookups with Google request shapes", () => {
    const fn = read("supabase/functions/google-actions-center/index.ts");
    const migration = readLatestMigrationContaining(googleBookingsTableCreation);

    expect(fn).toContain("fallbackMerchantId");
    expect(fn).toContain("const rootMerchantId");
    expect(fn).toContain("parseSlot");
    expect(fn).toContain("prepayment_status");
    expect(fn).toContain("PREPAYMENT_NOT_PROVIDED");
    expect(fn).toContain("extractGoogleUserId");
    expect(fn).toContain('filter("user_information->>user_id", "eq", userId)');
    expect(fn).toContain("buildBookingPayloadFromRow");
    expect(fn).toContain("const nowSec");
    expect(fn).toContain("bookingStartSeconds");
    expect(fn).not.toContain("request_payload: recordBody,\n      response_payload: payload");
    expect(migration).toContain("google_actions_center_bookings_user_id_idx");
    expect(migration).toContain("(user_information ->> 'user_id')");
  });

  it("can export Merchant, Service and Availability JSON feeds for the partner portal", () => {
    const fn = read("supabase/functions/google-actions-center/index.ts");
    const doc = read("docs/integrations/google-actions-center.md");

    expect(fn).toContain("/v3/feeds/merchants");
    expect(fn).toContain("/v3/feeds/services");
    expect(fn).toContain("/v3/feeds/availability");
    expect(fn).toContain("buildFeedMetadata");
    expect(fn).toContain("PROCESS_AS_COMPLETE");
    expect(fn).toContain("merchant_id");
    expect(fn).toContain("localized_service_name");
    expect(fn).toContain("service_availability");
    expect(fn).toContain("spots_open");
    expect(fn).toContain("spots_total");
    expect(fn).toContain("CONFIRMATION_MODE_SYNCHRONOUS");
    expect(fn).toContain("google_place_id");
    expect(fn).toContain(".limit(feedLimit)");

    expect(doc).toContain("/v3/feeds/merchants");
    expect(doc).toContain("/v3/feeds/services");
    expect(doc).toContain("/v3/feeds/availability");
    expect(doc).toContain("PROCESS_AS_COMPLETE");
  });

  it("stores Google booking mappings behind service-role-only RLS", () => {
    const migration = readLatestMigrationContaining(googleBookingsTableCreation);

    expect(migration).toContain("CREATE TABLE IF NOT EXISTS public.google_actions_center_bookings");
    expect(migration).toContain("google_booking_id text NOT NULL");
    expect(migration).toContain("idempotency_token text");
    expect(migration).toContain("request_hash text NOT NULL");
    expect(migration).toContain("reservation_id uuid REFERENCES public.reservations(id) ON DELETE SET NULL");
    expect(migration).toContain("response_payload jsonb NOT NULL DEFAULT '{}'::jsonb");
    expect(migration).toContain("ALTER TABLE public.google_actions_center_bookings ENABLE ROW LEVEL SECURITY");
    expect(migration).toContain("FOR ALL TO service_role");
    expect(migration).toContain("REVOKE ALL ON public.google_actions_center_bookings FROM PUBLIC, anon, authenticated");
    expect(migration).toContain("GRANT ALL ON public.google_actions_center_bookings TO service_role");
    expect(migration).toContain("google_actions_center_bookings_google_id_idx");
    expect(migration).toContain("google_actions_center_bookings_idempotency_idx");
  });

  it("documents the remaining human and Google-side onboarding work", () => {
    const doc = read("docs/integrations/google-actions-center.md");
    const packageJson = read("package.json");

    expect(doc).toContain("Partner Interest Form");
    expect(doc).toContain("Actions Center");
    expect(doc).toContain("Merchant feed");
    expect(doc).toContain("Service feed");
    expect(doc).toContain("Availability feed");
    expect(doc).toContain("Booking Server");
    expect(doc).toContain("GOOGLE_ACTIONS_CENTER_USERNAME");
    expect(doc).toContain("GOOGLE_ACTIONS_CENTER_SERVICE_USER_ID");
    expect(doc).toContain("30 jours");
    expect(doc).toContain("Suisse");
    expect(doc).toContain("sandbox");
    expect(doc).toContain("production review");
    expect(doc).toContain("pnpm google:actions:feeds");
    expect(doc).toContain("GOOGLE_ACTIONS_CENTER_FEED_BASE_URL");
    expect(packageJson).toContain('"google:actions:feeds": "node ./scripts/google-actions-center-export-feeds.mjs"');
  });
});
