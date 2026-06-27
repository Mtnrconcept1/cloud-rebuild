import { createAdminClient, HttpError, jsonResponse, writeAuditLog } from "../_shared/auth.ts";
import { buildCorsHeaders, handleCorsPreflight } from "../_shared/cors.ts";
import { makeLogger } from "../_shared/logging.ts";

const FUNCTION_NAME = "google-actions-center";
const AUTH_REALM = 'Basic realm="Google Actions Center"';
const DEFAULT_APP_BASE_URL = "https://www.thetok.ch";
const DEFAULT_SERVICE_ID = "tok-table-reservation";
const DEFAULT_DURATION_SEC = 7200;
const ZURICH_TIME_ZONE = "Europe/Zurich";

const ROUTES = {
  healthCheck: "/v3/HealthCheck/",
  batchAvailabilityLookup: "/v3/BatchAvailabilityLookup/",
  createBooking: "/v3/CreateBooking/",
  updateBooking: "/v3/UpdateBooking/",
  getBookingStatus: "/v3/GetBookingStatus/",
  listBookings: "/v3/ListBookings/",
  merchantsFeed: "/v3/feeds/merchants/",
  servicesFeed: "/v3/feeds/services/",
  availabilityFeed: "/v3/feeds/availability/",
} as const;

type GoogleEnvironment = "sandbox" | "production";

type Slot = {
  merchant_id: string;
  service_id: string;
  start_sec: number;
  duration_sec: number;
  party_size: number;
};

type GoogleBookingRow = {
  google_booking_id: string;
  idempotency_token: string | null;
  request_hash: string | null;
  restaurant_id: string;
  reservation_id: string | null;
  status: string | null;
  source_environment: GoogleEnvironment | null;
  user_information: Record<string, unknown> | null;
  request_payload: Record<string, unknown> | null;
  response_payload: Record<string, unknown> | null;
};

type AvailabilityRow = {
  slot_time: string;
  service: string | null;
  capacity: number | null;
  remaining_tables: number | null;
  available: boolean | null;
};

type FeedRestaurantRow = {
  id: string;
  name: string | null;
  address: string | null;
  city: string | null;
  phone: string | null;
  cuisine_type: string | null;
  latitude: number | null;
  longitude: number | null;
  supports_reservation: boolean | null;
  is_active: boolean | null;
  status: string | null;
};

type GoogleBookingSetupRow = {
  restaurant_id: string;
  google_place_id: string | null;
  google_business_url: string | null;
  booking_slug: string;
  tok_booking_url: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

function unauthorizedResponse(corsHeaders: Record<string, string>) {
  return jsonResponse(
    { error: "Unauthorized" },
    401,
    { ...corsHeaders, "WWW-Authenticate": AUTH_REALM },
  );
}

function decodeBasicAuth(req: Request) {
  const header = req.headers.get("authorization") || "";
  if (!header.startsWith("Basic ")) return null;

  try {
    const decoded = atob(header.slice("Basic ".length).trim());
    const separatorIndex = decoded.indexOf(":");
    if (separatorIndex < 0) return null;
    return {
      username: decoded.slice(0, separatorIndex),
      password: decoded.slice(separatorIndex + 1),
    };
  } catch {
    return null;
  }
}

function authenticateGoogleActionsCenter(req: Request) {
  const expectedUsername = Deno.env.get("GOOGLE_ACTIONS_CENTER_USERNAME")?.trim() || "";
  const expectedPassword = Deno.env.get("GOOGLE_ACTIONS_CENTER_PASSWORD")?.trim() || "";

  if (!expectedUsername || !expectedPassword) {
    throw new HttpError(503, "Google Actions Center credentials are not configured.");
  }

  const credentials = decodeBasicAuth(req);
  if (!credentials) throw new HttpError(401, "Unauthorized");

  if (
    !safeEqual(credentials.username, expectedUsername) ||
    !safeEqual(credentials.password, expectedPassword)
  ) {
    throw new HttpError(401, "Unauthorized");
  }
}

function stripFunctionPrefix(pathname: string) {
  const marker = `/${FUNCTION_NAME}`;
  const index = pathname.indexOf(marker);
  if (index >= 0) {
    return pathname.slice(index + marker.length) || "/";
  }
  return pathname || "/";
}

function normalizeRoute(pathname: string) {
  const stripped = stripFunctionPrefix(pathname);
  return stripped.endsWith("/") ? stripped : `${stripped}/`;
}

function getEnvironment(req: Request, body?: Record<string, unknown>): GoogleEnvironment {
  const raw = String(
    req.headers.get("x-google-actions-center-environment") ||
      req.headers.get("x-actions-center-environment") ||
      body?.environment ||
      Deno.env.get("GOOGLE_ACTIONS_CENTER_ENVIRONMENT") ||
      "production",
  ).toLowerCase();

  return raw === "sandbox" ? "sandbox" : "production";
}

function getAppBaseUrl() {
  return (
    Deno.env.get("PUBLIC_APP_URL") ||
    Deno.env.get("APP_BASE_URL") ||
    Deno.env.get("SITE_URL") ||
    DEFAULT_APP_BASE_URL
  ).replace(/\/+$/, "");
}

function finiteNumber(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function integerParam(url: URL, name: string, fallback: number, min: number, max: number) {
  const parsed = Math.floor(Number(url.searchParams.get(name) || fallback));
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(parsed, min), max);
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

function stringValue(value: unknown, fallback = "") {
  return typeof value === "string" ? value.trim() : fallback;
}

async function parseJsonBody(req: Request): Promise<Record<string, unknown>> {
  const body = await req.json().catch(() => ({}));
  return isRecord(body) ? body : {};
}

function normalizeTime(value: string) {
  const match = value.match(/^(\d{1,2}):(\d{2})/);
  if (!match) return "";
  return `${match[1].padStart(2, "0")}:${match[2]}`;
}

function partsToDateOrTime(
  date: Date,
  options: Intl.DateTimeFormatOptions,
  wanted: Array<Intl.DateTimeFormatPartTypes>,
) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: ZURICH_TIME_ZONE,
    ...options,
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return wanted.map((type) => values[type] || "").join("-");
}

function restaurantDateFromStartSec(startSec: number) {
  return partsToDateOrTime(
    new Date(startSec * 1000),
    { year: "numeric", month: "2-digit", day: "2-digit" },
    ["year", "month", "day"],
  );
}

function dateInZurichDaysFromNow(daysFromNow: number) {
  return partsToDateOrTime(
    new Date(Date.now() + daysFromNow * 24 * 60 * 60 * 1000),
    { year: "numeric", month: "2-digit", day: "2-digit" },
    ["year", "month", "day"],
  );
}

function restaurantTimeFromStartSec(startSec: number) {
  const parts = new Intl.DateTimeFormat("fr-CH", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: ZURICH_TIME_ZONE,
  }).formatToParts(new Date(startSec * 1000));
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return normalizeTime(`${values.hour || "00"}:${values.minute || "00"}`);
}

function zurichOffsetMinutes(date: Date) {
  const timeZoneName = new Intl.DateTimeFormat("en-US", {
    timeZone: ZURICH_TIME_ZONE,
    timeZoneName: "shortOffset",
  }).formatToParts(date).find((part) => part.type === "timeZoneName")?.value || "GMT+1";
  const match = timeZoneName.match(/^GMT([+-])(\d{1,2})(?::?(\d{2}))?$/);
  if (!match) return 60;
  const sign = match[1] === "-" ? -1 : 1;
  return sign * (Number(match[2]) * 60 + Number(match[3] || 0));
}

function localZurichDateTimeToEpochSeconds(date: string, time: string) {
  const [year, month, day] = date.split("-").map(Number);
  const [hour, minute] = normalizeTime(time).split(":").map(Number);
  const naiveUtcMs = Date.UTC(year, month - 1, day, hour, minute, 0);
  const offsetMinutes = zurichOffsetMinutes(new Date(naiveUtcMs));
  return Math.floor((naiveUtcMs - offsetMinutes * 60 * 1000) / 1000);
}

function extractSeconds(value: unknown) {
  if (isRecord(value) && value.seconds !== undefined) return finiteNumber(value.seconds);
  return finiteNumber(value);
}

function parseSlot(rawSlot: unknown, fallbackMerchantId = ""): Slot | null {
  const slot = isRecord(rawSlot) ? rawSlot : {};
  const resources = isRecord(slot.resources) ? slot.resources : {};
  const merchantId = stringValue(slot.merchant_id || slot.merchantId || resources.merchant_id || fallbackMerchantId);
  const serviceId = stringValue(slot.service_id || slot.serviceId, DEFAULT_SERVICE_ID) || DEFAULT_SERVICE_ID;
  const startSec = extractSeconds(slot.start_sec ?? slot.startTimeSec ?? slot.start_time ?? slot.startTime);
  const durationSec = finiteNumber(slot.duration_sec ?? slot.durationSec, DEFAULT_DURATION_SEC) || DEFAULT_DURATION_SEC;
  const partySize = Math.max(
    1,
    Math.floor(finiteNumber(slot.party_size ?? slot.partySize ?? resources.party_size ?? resources.partySize, 1)),
  );

  if (!merchantId || startSec <= 0) return null;

  return {
    merchant_id: merchantId,
    service_id: serviceId,
    start_sec: startSec,
    duration_sec: durationSec,
    party_size: partySize,
  };
}

async function sha256Hex(value: string) {
  const bytes = new TextEncoder().encode(value);
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(hash)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function getRequestHashPayload(body: Record<string, unknown>) {
  return JSON.stringify(body);
}

function getGoogleBookingId(token: string) {
  return `tok-google-${token}`;
}

function asBookingStatus(status: string | null | undefined) {
  const normalized = String(status || "").toLowerCase();
  if (normalized === "cancelled" || normalized === "canceled") return "CANCELED";
  if (normalized === "no_show") return "NO_SHOW";
  if (normalized === "pending") return "PENDING_MERCHANT_CONFIRMATION";
  return "CONFIRMED";
}

function buildBookingPayload(params: {
  bookingId: string;
  slot: Slot;
  status?: string | null;
  userInformation?: Record<string, unknown>;
}) {
  return {
    booking: {
      booking_id: params.bookingId,
      merchant_id: params.slot.merchant_id,
      service_id: params.slot.service_id,
      start_time: { seconds: params.slot.start_sec },
      duration_sec: params.slot.duration_sec,
      party_size: params.slot.party_size,
      status: asBookingStatus(params.status || "confirmed"),
      user_information: params.userInformation || {},
    },
  };
}

function extractBookingRecord(body: Record<string, unknown>) {
  return isRecord(body.booking) ? body.booking : {};
}

function parseBookingSlotFromBody(body: Record<string, unknown>, fallbackMerchantId = "") {
  const booking = extractBookingRecord(body);
  return parseSlot(body.slot ?? booking.slot ?? booking, fallbackMerchantId);
}

function extractUserInformation(body: Record<string, unknown>) {
  const booking = extractBookingRecord(body);
  if (isRecord(body.user_information)) return body.user_information;
  if (isRecord(body.userInformation)) return body.userInformation;
  if (isRecord(booking.user_information)) return booking.user_information;
  if (isRecord(booking.userInformation)) return booking.userInformation;
  return {};
}

function extractGoogleUserId(body: Record<string, unknown>) {
  const userInformation = extractUserInformation(body);
  return stringValue(
    body.user_id ||
      body.userId ||
      userInformation.user_id ||
      userInformation.userId,
  );
}

function slotFromBookingRow(row: GoogleBookingRow): Slot {
  const requestPayload = isRecord(row.request_payload) ? row.request_payload : {};
  const responsePayload = isRecord(row.response_payload) ? row.response_payload : {};
  const responseBooking = isRecord(responsePayload.booking) ? responsePayload.booking : {};

  return parseBookingSlotFromBody(requestPayload, row.restaurant_id) ||
    parseSlot(responseBooking, row.restaurant_id) ||
    {
      merchant_id: row.restaurant_id,
      service_id: DEFAULT_SERVICE_ID,
      start_sec: 1,
      duration_sec: DEFAULT_DURATION_SEC,
      party_size: 1,
    };
}

function buildBookingPayloadFromRow(row: GoogleBookingRow) {
  return buildBookingPayload({
    bookingId: row.google_booking_id,
    slot: slotFromBookingRow(row),
    status: row.status,
    userInformation: row.user_information || {},
  }).booking;
}

function bookingStartSeconds(booking: { start_time?: unknown }) {
  return extractSeconds(booking.start_time);
}

function buildBookingFailure(cause: string, description: string) {
  return {
    booking_failure: {
      cause,
      description,
    },
  };
}

async function resolveRestaurant(adminClient: ReturnType<typeof createAdminClient>, merchantId: string) {
  if (!isUuid(merchantId)) return null;

  const { data, error } = await adminClient
    .from("restaurants")
    .select("id, name, supports_reservation, is_active, status")
    .eq("id", merchantId)
    .maybeSingle();

  if (error) throw new HttpError(500, error.message);
  if (!data) return null;

  const status = String((data as { status?: string | null }).status || "").toLowerCase();
  const isBookable = Boolean(
    (data as { supports_reservation?: boolean | null }).supports_reservation &&
      (data as { is_active?: boolean | null }).is_active !== false &&
      !["archived", "suspended", "paused"].includes(status),
  );

  return { id: String((data as { id: string }).id), isBookable };
}

async function getSlotAvailable(adminClient: ReturnType<typeof createAdminClient>, slot: Slot) {
  const restaurantDate = restaurantDateFromStartSec(slot.start_sec);
  const restaurantTime = restaurantTimeFromStartSec(slot.start_sec);
  const { data, error } = await adminClient.rpc("get_restaurant_reservation_slot_availability", {
    p_restaurant_id: slot.merchant_id,
    p_date: restaurantDate,
  });

  if (error) throw new HttpError(500, error.message);

  const rows = Array.isArray(data) ? data as AvailabilityRow[] : [];
  const matchingSlot = rows.find((row) => normalizeTime(String(row.slot_time || "")) === restaurantTime);
  return Boolean(matchingSlot?.available && Number(matchingSlot.remaining_tables || 0) > 0);
}

function buildFeedMetadata(feedName: string) {
  return {
    generation_timestamp: { seconds: Math.floor(Date.now() / 1000) },
    processing_instruction: "PROCESS_AS_COMPLETE",
    nonce: `${feedName}-${crypto.randomUUID()}`,
    shard_number: 0,
    total_shards: 1,
  };
}

async function listFeedRestaurants(
  req: Request,
  adminClient: ReturnType<typeof createAdminClient>,
) {
  const url = new URL(req.url);
  const feedLimit = integerParam(url, "limit", 100, 1, 100);
  const { data: restaurants, error: restaurantError } = await adminClient
    .from("restaurants")
    .select("id, name, address, city, phone, cuisine_type, latitude, longitude, supports_reservation, is_active, status")
    .eq("supports_reservation", true)
    .eq("is_active", true)
    .order("name", { ascending: true })
    .limit(feedLimit)
    .returns<FeedRestaurantRow[]>();

  if (restaurantError) throw new HttpError(500, restaurantError.message);

  const activeRestaurants = (restaurants || []).filter((restaurant) => {
    const status = String(restaurant.status || "").toLowerCase();
    return !["archived", "suspended", "paused"].includes(status);
  });
  const restaurantIds = activeRestaurants.map((restaurant) => restaurant.id);
  if (restaurantIds.length === 0) {
    return { restaurants: [], setups: new Map<string, GoogleBookingSetupRow>() };
  }

  const { data: setups, error: setupError } = await adminClient
    .from("restaurant_google_booking_setup")
    .select("restaurant_id, google_place_id, google_business_url, booking_slug, tok_booking_url")
    .in("restaurant_id", restaurantIds)
    .returns<GoogleBookingSetupRow[]>();

  if (setupError) throw new HttpError(500, setupError.message);

  return {
    restaurants: activeRestaurants,
    setups: new Map((setups || []).map((setup) => [setup.restaurant_id, setup])),
  };
}

function bookingUrlForRestaurant(restaurant: FeedRestaurantRow, setup: GoogleBookingSetupRow | undefined) {
  return setup?.tok_booking_url || `${getAppBaseUrl()}/restaurant/${restaurant.id}?open=reservation`;
}

function merchantAddress(restaurant: FeedRestaurantRow) {
  return {
    country: "CH",
    locality: restaurant.city || "Geneve",
    street_address: restaurant.address || "",
  };
}

async function merchantsFeed(
  req: Request,
  corsHeaders: Record<string, string>,
  adminClient: ReturnType<typeof createAdminClient>,
) {
  const { restaurants, setups } = await listFeedRestaurants(req, adminClient);

  return jsonResponse({
    metadata: buildFeedMetadata("merchants"),
    merchant: restaurants.map((restaurant) => {
      const setup = setups.get(restaurant.id);
      return {
        merchant_id: restaurant.id,
        name: restaurant.name || "Restaurant TOK",
        telephone: restaurant.phone || "",
        url: bookingUrlForRestaurant(restaurant, setup),
        category: restaurant.cuisine_type ? [restaurant.cuisine_type, "restaurant"] : ["restaurant"],
        address: merchantAddress(restaurant),
        geo: restaurant.latitude && restaurant.longitude
          ? { latitude: restaurant.latitude, longitude: restaurant.longitude }
          : undefined,
        matching_hints: {
          google_place_id: setup?.google_place_id || "",
          google_business_url: setup?.google_business_url || "",
        },
      };
    }),
  }, 200, corsHeaders);
}

async function servicesFeed(
  req: Request,
  corsHeaders: Record<string, string>,
  adminClient: ReturnType<typeof createAdminClient>,
) {
  const { restaurants, setups } = await listFeedRestaurants(req, adminClient);

  return jsonResponse({
    metadata: buildFeedMetadata("services"),
    service: restaurants.map((restaurant) => ({
      merchant_id: restaurant.id,
      service_id: DEFAULT_SERVICE_ID,
      localized_service_name: {
        value: "Reservation de table",
        localized_value: [{ locale: "fr-CH", value: "Reservation de table" }],
      },
      localized_description: {
        value: "Reserver une table avec TOK.",
        localized_value: [{ locale: "fr-CH", value: "Reserver une table avec TOK." }],
      },
      type: "SERVICE_TYPE_DINING_RESERVATION",
      confirmation_mode: "CONFIRMATION_MODE_SYNCHRONOUS",
      duration_sec: DEFAULT_DURATION_SEC,
      action_link: [{ url: bookingUrlForRestaurant(restaurant, setups.get(restaurant.id)) }],
    })),
  }, 200, corsHeaders);
}

async function availabilityFeed(
  req: Request,
  corsHeaders: Record<string, string>,
  adminClient: ReturnType<typeof createAdminClient>,
) {
  const url = new URL(req.url);
  const days = integerParam(url, "days", 30, 1, 30);
  const { restaurants } = await listFeedRestaurants(req, adminClient);
  const serviceAvailability = [];

  for (const restaurant of restaurants) {
    for (let dayIndex = 0; dayIndex < days; dayIndex += 1) {
      const date = dateInZurichDaysFromNow(dayIndex);
      const { data, error } = await adminClient.rpc("get_restaurant_reservation_slot_availability", {
        p_restaurant_id: restaurant.id,
        p_date: date,
      });

      if (error) throw new HttpError(500, error.message);

      const rows = Array.isArray(data) ? data as AvailabilityRow[] : [];
      for (const row of rows) {
        if (!row.available) continue;
        const remainingTables = Math.max(0, Number(row.remaining_tables || 0));
        const totalTables = Math.max(remainingTables, Number(row.capacity || remainingTables || 0));
        if (remainingTables <= 0 || totalTables <= 0) continue;

        serviceAvailability.push({
          merchant_id: restaurant.id,
          service_id: DEFAULT_SERVICE_ID,
          start_sec: localZurichDateTimeToEpochSeconds(date, String(row.slot_time || "")),
          duration_sec: DEFAULT_DURATION_SEC,
          spots_open: remainingTables,
          spots_total: totalTables,
          availability_tag: `${restaurant.id}:${date}:${normalizeTime(String(row.slot_time || ""))}`,
        });
      }
    }
  }

  return jsonResponse({
    metadata: buildFeedMetadata("availability"),
    service_availability: serviceAvailability,
  }, 200, corsHeaders);
}

async function healthCheck(corsHeaders: Record<string, string>) {
  return jsonResponse({}, 200, corsHeaders);
}

async function batchAvailabilityLookup(
  req: Request,
  corsHeaders: Record<string, string>,
  adminClient: ReturnType<typeof createAdminClient>,
) {
  const recordBody = await parseJsonBody(req);
  const environment = getEnvironment(req, recordBody);
  const rootMerchantId = stringValue(recordBody.merchant_id || recordBody.merchantId);
  const slotTimes = Array.isArray(recordBody.slot_time)
    ? recordBody.slot_time
    : Array.isArray(recordBody.slotTimes)
      ? recordBody.slotTimes
      : [];

  const slotTimeAvailability = [];
  for (const rawSlotTime of slotTimes) {
    const slot = parseSlot(
      isRecord(rawSlotTime) ? rawSlotTime.slot_time || rawSlotTime.slot || rawSlotTime : rawSlotTime,
      rootMerchantId,
    );
    if (!slot) {
      slotTimeAvailability.push({ slot_time: rawSlotTime, available: false });
      continue;
    }

    if (environment === "sandbox") {
      slotTimeAvailability.push({ slot_time: rawSlotTime, available: true, resources: { party_size: slot.party_size } });
      continue;
    }

    const restaurant = await resolveRestaurant(adminClient, slot.merchant_id);
    const available = Boolean(restaurant?.isBookable) && await getSlotAvailable(adminClient, slot);
    slotTimeAvailability.push({
      slot_time: rawSlotTime,
      available,
      resources: { party_size: slot.party_size },
    });
  }

  return jsonResponse({ slot_time_availability: slotTimeAvailability }, 200, corsHeaders);
}

async function getExistingByIdempotency(
  adminClient: ReturnType<typeof createAdminClient>,
  idempotencyToken: string,
) {
  const { data, error } = await adminClient
    .from("google_actions_center_bookings")
    .select("google_booking_id, idempotency_token, request_hash, restaurant_id, reservation_id, status, source_environment, user_information, request_payload, response_payload")
    .eq("idempotency_token", idempotencyToken)
    .maybeSingle<GoogleBookingRow>();

  if (error) throw new HttpError(500, error.message);
  return data || null;
}

async function getExistingByBookingId(
  adminClient: ReturnType<typeof createAdminClient>,
  bookingId: string,
) {
  const { data, error } = await adminClient
    .from("google_actions_center_bookings")
    .select("google_booking_id, idempotency_token, request_hash, restaurant_id, reservation_id, status, source_environment, user_information, request_payload, response_payload")
    .eq("google_booking_id", bookingId)
    .maybeSingle<GoogleBookingRow>();

  if (error) throw new HttpError(500, error.message);
  return data || null;
}

async function persistGoogleBookingMapping(
  adminClient: ReturnType<typeof createAdminClient>,
  params: {
    googleBookingId: string;
    idempotencyToken: string;
    requestHash: string;
    slot: Slot;
    reservationId: string | null;
    status: string;
    environment: GoogleEnvironment;
    userInformation: Record<string, unknown>;
    requestPayload: Record<string, unknown>;
    responsePayload: Record<string, unknown>;
  },
) {
  const { error } = await adminClient.from("google_actions_center_bookings").insert({
    google_booking_id: params.googleBookingId,
    idempotency_token: params.idempotencyToken,
    request_hash: params.requestHash,
    restaurant_id: params.slot.merchant_id,
    reservation_id: params.reservationId,
    status: params.status,
    source_environment: params.environment,
    user_information: params.userInformation,
    request_payload: params.requestPayload,
    response_payload: params.responsePayload,
  });

  if (error) throw new HttpError(500, error.message);
}

async function createBooking(
  req: Request,
  corsHeaders: Record<string, string>,
  adminClient: ReturnType<typeof createAdminClient>,
) {
  const recordBody = await parseJsonBody(req);
  const environment = getEnvironment(req, recordBody);
  const idempotencyToken = stringValue(recordBody.idempotency_token || recordBody.idempotencyToken);
  const slot = parseBookingSlotFromBody(recordBody);
  const userInformation = extractUserInformation(recordBody);

  if (!idempotencyToken) {
    return jsonResponse(buildBookingFailure("INVALID_REQUEST", "Missing idempotency_token."), 200, corsHeaders);
  }
  if (!slot) {
    return jsonResponse(buildBookingFailure("INVALID_REQUEST", "Missing or invalid booking slot."), 200, corsHeaders);
  }

  const requestHash = await sha256Hex(getRequestHashPayload(recordBody));
  const existing = await getExistingByIdempotency(adminClient, idempotencyToken);
  if (existing) {
    if (existing.request_hash && existing.request_hash !== requestHash) {
      return jsonResponse(
        buildBookingFailure("BOOKING_FAILURE_REASON_UNSPECIFIED", "Idempotency token reused with a different request."),
        200,
        corsHeaders,
      );
    }
    return jsonResponse(existing.response_payload || {}, 200, corsHeaders);
  }

  const googleBookingId = getGoogleBookingId(idempotencyToken);
  const payload = buildBookingPayload({
    bookingId: googleBookingId,
    slot,
    status: "confirmed",
    userInformation,
  });

  if (environment === "sandbox") {
    if (isUuid(slot.merchant_id)) {
      await persistGoogleBookingMapping(adminClient, {
        googleBookingId,
        idempotencyToken,
        requestHash,
        slot,
        reservationId: null,
        status: "confirmed",
        environment,
        userInformation,
        requestPayload: recordBody,
        responsePayload: payload,
      });
    }
    return jsonResponse(payload, 200, corsHeaders);
  }

  const restaurant = await resolveRestaurant(adminClient, slot.merchant_id);
  if (!restaurant?.isBookable) {
    return jsonResponse(buildBookingFailure("SLOT_UNAVAILABLE", "Restaurant is not currently bookable."), 200, corsHeaders);
  }

  const serviceUserId = Deno.env.get("GOOGLE_ACTIONS_CENTER_SERVICE_USER_ID")?.trim() || "";
  if (!serviceUserId) {
    throw new HttpError(503, "Google Actions Center service user is not configured.");
  }

  if (!await getSlotAvailable(adminClient, slot)) {
    return jsonResponse(buildBookingFailure("SLOT_UNAVAILABLE", "Slot is no longer available."), 200, corsHeaders);
  }

  const { data: reservationRows, error: reservationError } = await adminClient.rpc(
    "validate_and_create_reservation_safe",
    {
      p_restaurant_id: slot.merchant_id,
      p_date: restaurantDateFromStartSec(slot.start_sec),
      p_time: restaurantTimeFromStartSec(slot.start_sec),
      p_party_size: slot.party_size,
      p_feature: "classique",
      p_metadata: {
        _internal_user_id: serviceUserId,
        acquisition_source: "google_actions_center",
        google_actions_center: true,
        google_booking_id: googleBookingId,
        google_idempotency_token: idempotencyToken,
        google_user_information: userInformation,
        tok_restaurant_url: `${DEFAULT_APP_BASE_URL}/restaurant/${slot.merchant_id}?open=reservation`,
      },
      p_notes: "Reservation creee via Google Actions Center.",
      p_progressive_offer_id: null,
    },
  );

  if (reservationError) throw new HttpError(500, reservationError.message);
  const reservationResult = Array.isArray(reservationRows) ? reservationRows[0] : reservationRows;
  if (!reservationResult?.reservation_id) {
    return jsonResponse(
      buildBookingFailure("SLOT_UNAVAILABLE", reservationResult?.error_message || "Reservation rejected by TOK."),
      200,
      corsHeaders,
    );
  }

  await persistGoogleBookingMapping(adminClient, {
    googleBookingId,
    idempotencyToken,
    requestHash,
    slot,
    reservationId: reservationResult.reservation_id,
    status: "confirmed",
    environment,
    userInformation,
    requestPayload: recordBody,
    responsePayload: payload,
  });

  await writeAuditLog({
    adminClient,
    functionName: FUNCTION_NAME,
    action: "google_actions_center.create_booking",
    status: "success",
    request: req,
    targetEntityType: "reservations",
    targetEntityId: reservationResult.reservation_id,
    actor: { userId: null, roles: ["google_actions_center"], isServiceRole: true, authMode: "service_role" },
    metadata: {
      restaurant_id: slot.merchant_id,
      google_booking_id: googleBookingId,
    },
  });

  return jsonResponse(payload, 200, corsHeaders);
}

function extractBookingId(body: Record<string, unknown>) {
  const booking = isRecord(body.booking) ? body.booking : {};
  return stringValue(body.booking_id || body.bookingId || booking.booking_id || booking.bookingId);
}

function extractRequestedStatus(body: Record<string, unknown>) {
  const booking = isRecord(body.booking) ? body.booking : {};
  return stringValue(body.status || booking.status).toUpperCase();
}

async function updateBooking(
  req: Request,
  corsHeaders: Record<string, string>,
  adminClient: ReturnType<typeof createAdminClient>,
) {
  const recordBody = await parseJsonBody(req);
  const bookingId = extractBookingId(recordBody);
  const requestedStatus = extractRequestedStatus(recordBody);

  if (!bookingId) {
    return jsonResponse(buildBookingFailure("INVALID_REQUEST", "Missing booking_id."), 200, corsHeaders);
  }

  const existing = await getExistingByBookingId(adminClient, bookingId);
  if (!existing) {
    return jsonResponse(buildBookingFailure("BOOKING_NOT_FOUND", "Booking not found."), 200, corsHeaders);
  }

  const isCancellation = ["CANCELED", "CANCELLED"].includes(requestedStatus);
  const finalStatus = isCancellation ? "cancelled" : requestedStatus === "NO_SHOW" ? "no_show" : existing.status || "confirmed";

  if (isCancellation && existing.reservation_id) {
    const cancelledAt = new Date().toISOString();
    const { error: updateReservationError } = await adminClient
      .from("reservations")
      .update({
        status: "cancelled",
        cancelled_at: cancelledAt,
        cancelled_by: "customer",
        cancellation_reason_code: "google_actions_center",
        cancellation_reason_details: "Annulation recue via Google Actions Center.",
        updated_at: cancelledAt,
      })
      .eq("id", existing.reservation_id);

    if (updateReservationError) throw new HttpError(500, updateReservationError.message);
  }

  const slot = slotFromBookingRow(existing);
  const payload = buildBookingPayload({
    bookingId,
    slot,
    status: finalStatus,
    userInformation: existing.user_information || {},
  });

  const { error: updateMappingError } = await adminClient
    .from("google_actions_center_bookings")
    .update({
      status: finalStatus,
      response_payload: payload,
      updated_at: new Date().toISOString(),
    })
    .eq("google_booking_id", bookingId);

  if (updateMappingError) throw new HttpError(500, updateMappingError.message);

  await writeAuditLog({
    adminClient,
    functionName: FUNCTION_NAME,
    action: isCancellation ? "google_actions_center.cancel_booking" : "google_actions_center.update_booking",
    status: "success",
    request: req,
    targetEntityType: existing.reservation_id ? "reservations" : "google_actions_center_bookings",
    targetEntityId: existing.reservation_id || bookingId,
    actor: { userId: null, roles: ["google_actions_center"], isServiceRole: true, authMode: "service_role" },
    metadata: {
      restaurant_id: existing.restaurant_id,
      google_booking_id: bookingId,
      requested_status: requestedStatus || null,
    },
  });

  return jsonResponse(payload, 200, corsHeaders);
}

async function getBookingStatus(
  req: Request,
  corsHeaders: Record<string, string>,
  adminClient: ReturnType<typeof createAdminClient>,
) {
  const recordBody = await parseJsonBody(req);
  const bookingId = extractBookingId(recordBody);

  if (!bookingId) {
    return jsonResponse(buildBookingFailure("INVALID_REQUEST", "Missing booking_id."), 200, corsHeaders);
  }

  const existing = await getExistingByBookingId(adminClient, bookingId);
  if (!existing) {
    return jsonResponse(buildBookingFailure("BOOKING_NOT_FOUND", "Booking not found."), 200, corsHeaders);
  }

  return jsonResponse({
    booking_id: bookingId,
    booking_status: asBookingStatus(existing.status),
    prepayment_status: "PREPAYMENT_NOT_PROVIDED",
    reservation_id: existing.reservation_id,
  }, 200, corsHeaders);
}

async function listBookings(
  req: Request,
  corsHeaders: Record<string, string>,
  adminClient: ReturnType<typeof createAdminClient>,
) {
  const recordBody = await parseJsonBody(req);
  const userId = extractGoogleUserId(recordBody);

  if (!userId) {
    return jsonResponse(buildBookingFailure("INVALID_REQUEST", "Missing user_id."), 200, corsHeaders);
  }

  const { data, error } = await adminClient
    .from("google_actions_center_bookings")
    .select("google_booking_id, idempotency_token, request_hash, restaurant_id, reservation_id, status, source_environment, user_information, request_payload, response_payload")
    .filter("user_information->>user_id", "eq", userId)
    .order("created_at", { ascending: false })
    .limit(100)
    .returns<GoogleBookingRow[]>();

  if (error) throw new HttpError(500, error.message);

  const nowSec = Math.floor(Date.now() / 1000);
  const bookings = (data || [])
    .map(buildBookingPayloadFromRow)
    .filter((booking) => bookingStartSeconds(booking) >= nowSec);

  return jsonResponse({
    bookings,
  }, 200, corsHeaders);
}

async function dispatch(req: Request, corsHeaders: Record<string, string>) {
  const path = normalizeRoute(new URL(req.url).pathname);
  const adminClient = createAdminClient();

  if (req.method === "GET" && path === ROUTES.healthCheck) {
    return await healthCheck(corsHeaders);
  }

  authenticateGoogleActionsCenter(req);

  if (req.method === "POST" && path === ROUTES.batchAvailabilityLookup) {
    return await batchAvailabilityLookup(req, corsHeaders, adminClient);
  }
  if (req.method === "POST" && path === ROUTES.createBooking) {
    return await createBooking(req, corsHeaders, adminClient);
  }
  if (req.method === "POST" && path === ROUTES.updateBooking) {
    return await updateBooking(req, corsHeaders, adminClient);
  }
  if (req.method === "POST" && path === ROUTES.getBookingStatus) {
    return await getBookingStatus(req, corsHeaders, adminClient);
  }
  if (req.method === "POST" && path === ROUTES.listBookings) {
    return await listBookings(req, corsHeaders, adminClient);
  }
  if (req.method === "GET" && path === ROUTES.merchantsFeed) {
    return await merchantsFeed(req, corsHeaders, adminClient);
  }
  if (req.method === "GET" && path === ROUTES.servicesFeed) {
    return await servicesFeed(req, corsHeaders, adminClient);
  }
  if (req.method === "GET" && path === ROUTES.availabilityFeed) {
    return await availabilityFeed(req, corsHeaders, adminClient);
  }

  throw new HttpError(404, "google_actions_center_route_not_found");
}

Deno.serve(async (req) => {
  const corsHeaders = buildCorsHeaders(req);
  const preflight = handleCorsPreflight(req, corsHeaders);
  if (preflight) return preflight;

  const log = makeLogger(FUNCTION_NAME);

  try {
    return await dispatch(req, corsHeaders);
  } catch (error) {
    const status = error instanceof HttpError ? error.status : 500;
    const message = error instanceof Error ? error.message : "Google Actions Center error.";
    log.error("request failed", { status, message });

    if (status === 401) return unauthorizedResponse(corsHeaders);

    return jsonResponse({ error: message }, status, corsHeaders);
  }
});
