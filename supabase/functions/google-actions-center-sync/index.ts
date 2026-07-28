import { buildCorsHeaders, handleCorsPreflight } from "../_shared/cors.ts";
import {
  authenticateRequest,
  HttpError,
  getEnv,
  jsonResponse,
  type EdgeSupabaseClient,
} from "../_shared/auth.ts";
import { makeLogger } from "../_shared/logging.ts";

const FUNCTION_NAME = "google-actions-center-sync";
const DEFAULT_BATCH_SIZE = 50;
const REQUEST_TIMEOUT_MS = 20_000;
const TOKEN_SCOPE = "https://www.googleapis.com/auth/mapsbooking";

type OutboxRow = {
  id: string;
  kind: "availability" | "booking";
  restaurant_id: string | null;
  reservation_id: string | null;
  availability_date: string | null;
  payload: Record<string, unknown>;
  attempts: number;
};

type ServiceAccount = {
  client_email: string;
  private_key: string;
  token_uri: string;
};

/* ------------------------------------------------------------------ *
 * Google contract — the only part that depends on Actions Center.
 *
 * The endpoint paths and request shapes below could not be checked against
 * developers.google.com, which is unreachable from the build environment. They
 * are therefore driven by environment variables and confined to this section,
 * so correcting them after a read of the official reference is a change here
 * and nowhere else. Everything above and below is provider-independent.
 * ------------------------------------------------------------------ */

const API_BASE = () =>
  getEnv("GOOGLE_ACTIONS_CENTER_API_BASE") || "https://mapsbooking.googleapis.com/v1alpha";

const PARTNER_ID = () => getEnv("GOOGLE_ACTIONS_CENTER_PARTNER_ID") || "";

function availabilityEndpoint(merchantId: string) {
  const template = getEnv("GOOGLE_ACTIONS_CENTER_AVAILABILITY_PATH")
    || "/inventory/partners/{partnerId}/merchants/{merchantId}/availability:replace";
  return API_BASE() + template
    .replace("{partnerId}", encodeURIComponent(PARTNER_ID()))
    .replace("{merchantId}", encodeURIComponent(merchantId));
}

function bookingEndpoint() {
  const template = getEnv("GOOGLE_ACTIONS_CENTER_BOOKING_PATH")
    || "/notification/partners/{partnerId}/bookings:notify";
  return API_BASE() + template.replace("{partnerId}", encodeURIComponent(PARTNER_ID()));
}

/* ------------------------------------------------------------------ */

function decodeServiceAccount(): ServiceAccount {
  const raw = getEnv("GOOGLE_ACTIONS_CENTER_SERVICE_ACCOUNT");
  if (!raw) throw new HttpError(503, "google_service_account_missing");

  let parsed: Record<string, unknown>;
  try {
    // Accept both raw JSON and base64, since secret stores mangle newlines.
    const candidate = raw.trim().startsWith("{") ? raw : atob(raw);
    parsed = JSON.parse(candidate) as Record<string, unknown>;
  } catch {
    throw new HttpError(503, "google_service_account_invalid_json");
  }

  const clientEmail = typeof parsed.client_email === "string" ? parsed.client_email : "";
  const privateKey = typeof parsed.private_key === "string"
    ? parsed.private_key.replace(/\\n/g, "\n")
    : "";
  if (!clientEmail || !privateKey) throw new HttpError(503, "google_service_account_invalid_format");

  return {
    client_email: clientEmail,
    private_key: privateKey,
    token_uri: typeof parsed.token_uri === "string" ? parsed.token_uri : "https://oauth2.googleapis.com/token",
  };
}

function base64Url(bytes: Uint8Array) {
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function pemToPkcs8(pem: string) {
  const body = pem.replace(/-----[^-]+-----/g, "").replace(/\s+/g, "");
  const binary = atob(body);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

/** Mints a short-lived OAuth token, mirroring the pattern already used by send-push. */
async function mintAccessToken(account: ServiceAccount) {
  const now = Math.floor(Date.now() / 1000);
  const header = base64Url(new TextEncoder().encode(JSON.stringify({ alg: "RS256", typ: "JWT" })));
  const claims = base64Url(new TextEncoder().encode(JSON.stringify({
    iss: account.client_email,
    scope: TOKEN_SCOPE,
    aud: account.token_uri,
    iat: now,
    exp: now + 3600,
  })));

  const key = await crypto.subtle.importKey(
    "pkcs8",
    pemToPkcs8(account.private_key),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    key,
    new TextEncoder().encode(`${header}.${claims}`),
  );
  const assertion = `${header}.${claims}.${base64Url(new Uint8Array(signature))}`;

  const response = await fetch(account.token_uri, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
  });
  if (!response.ok) throw new HttpError(503, "google_token_request_failed");

  const payload = await response.json() as { access_token?: string };
  if (!payload.access_token) throw new HttpError(503, "google_token_missing");
  return payload.access_token;
}

/**
 * Rebuilds the bookable slots for one merchant and day.
 *
 * Availability is recomputed at send time rather than captured when the row was
 * queued: several bookings can land between the trigger and delivery, and the
 * only useful state to send Google is the current one.
 */
async function buildAvailabilityPayload(client: EdgeSupabaseClient, row: OutboxRow) {
  const { data, error } = await client.rpc("get_restaurant_reservation_slot_availability", {
    p_restaurant_id: row.restaurant_id,
    p_date: row.availability_date,
  });
  if (error) throw new HttpError(503, "availability_lookup_failed");

  const slots = Array.isArray(data) ? data : [];
  return {
    merchant_id: row.restaurant_id,
    availability: slots.map((slot) => {
      const record = (slot || {}) as Record<string, unknown>;
      // The RPC returns a local wall-clock time; the date comes from the queued
      // row, so the two are recombined into the instant Google expects.
      const startSec = Math.floor(
        new Date(`${row.availability_date}T${String(record.slot_time ?? "")}`).getTime() / 1000,
      );
      return {
        service_id: "tok-table-reservation",
        start_sec: startSec,
        duration_sec: Number(getEnv("GOOGLE_ACTIONS_CENTER_SLOT_DURATION_SEC")) || 5400,
        spots_total: Number(record.capacity ?? 0),
        spots_open: Math.max(0, Number(record.remaining_tables ?? 0)),
      };
    }).filter((slot) => Number.isFinite(slot.start_sec) && slot.start_sec > 0),
  };
}

async function buildBookingPayload(client: EdgeSupabaseClient, row: OutboxRow) {
  const { data, error } = await client
    .from("google_actions_center_bookings")
    .select("google_booking_id, status, reservation_id")
    .eq("reservation_id", row.reservation_id)
    .maybeSingle();
  if (error || !data) throw new HttpError(503, "google_booking_mapping_missing");

  const status = String((row.payload as Record<string, unknown>).status ?? "");
  return {
    booking: {
      booking_id: data.google_booking_id,
      status: status === "cancelled" || status === "canceled"
        ? "CANCELED"
        : status === "no_show"
        ? "NO_SHOW"
        : "CONFIRMED",
    },
  };
}

async function deliver(client: EdgeSupabaseClient, row: OutboxRow, token: string) {
  const isAvailability = row.kind === "availability";
  if (isAvailability && !row.restaurant_id) throw new HttpError(400, "restaurant_id_missing");

  const url = isAvailability ? availabilityEndpoint(String(row.restaurant_id)) : bookingEndpoint();
  const body = isAvailability
    ? await buildAvailabilityPayload(client, row)
    : await buildBookingPayload(client, row);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (!response.ok) {
      const detail = (await response.text().catch(() => "")).slice(0, 300);
      throw new HttpError(502, `google_rejected_${response.status}: ${detail}`);
    }
  } finally {
    clearTimeout(timer);
  }
}

Deno.serve(async (req) => {
  const cors = buildCorsHeaders(req);
  const preflight = handleCorsPreflight(req, cors);
  if (preflight) return preflight;

  const log = makeLogger(FUNCTION_NAME);

  try {
    if (req.method !== "POST") throw new HttpError(405, "method_not_allowed");
    const actor = await authenticateRequest(req, { allowServiceRole: true, allowSchedulerSecret: true });
    if (!actor.isServiceRole) throw new HttpError(403, "forbidden");

    const body = await req.json().catch(() => ({})) as Record<string, unknown>;
    const limit = Math.min(Math.max(Number(body.limit) || DEFAULT_BATCH_SIZE, 1), 200);

    const { data: claimed, error: claimError } = await actor.adminClient
      .rpc("claim_google_actions_center_outbox", { p_limit: limit });
    if (claimError) throw new HttpError(503, "outbox_claim_failed");

    const rows = (Array.isArray(claimed) ? claimed : []) as OutboxRow[];
    if (rows.length === 0) {
      return jsonResponse({ ok: true, claimed: 0, sent: 0, failed: 0 }, 200, cors);
    }

    // Minted once per batch rather than per row: the token is valid for an hour
    // and a token request per notification would dominate the run.
    const token = await mintAccessToken(decodeServiceAccount());

    let sent = 0;
    let failed = 0;
    for (const row of rows) {
      try {
        await deliver(actor.adminClient, row, token);
        await actor.adminClient.rpc("settle_google_actions_center_outbox", {
          p_id: row.id,
          p_success: true,
          p_error: null,
        });
        sent += 1;
      } catch (error) {
        const message = error instanceof Error ? error.message : "unknown_error";
        await actor.adminClient.rpc("settle_google_actions_center_outbox", {
          p_id: row.id,
          p_success: false,
          p_error: message,
        });
        failed += 1;
      }
    }

    log.info("outbox drained", { claimed: rows.length, sent, failed });
    return jsonResponse({ ok: true, claimed: rows.length, sent, failed }, 200, cors);
  } catch (error) {
    if (error instanceof HttpError) {
      return jsonResponse({ ok: false, error: error.message }, error.status, cors);
    }
    log.error("sync failed", { error: error instanceof Error ? error.message : "unknown" });
    return jsonResponse({ ok: false, error: "internal_error" }, 500, cors);
  }
});
