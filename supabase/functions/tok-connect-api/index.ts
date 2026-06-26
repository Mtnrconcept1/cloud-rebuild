import { buildCorsHeaders, handleCorsPreflight } from "../_shared/cors.ts";
import { HttpError, jsonResponse, writeAuditLog } from "../_shared/auth.ts";
import { createRateLimiter } from "../_shared/rate-limit.ts";
import {
  assertTokConnectScopes,
  buildTokConnectEnvelope,
  createTokConnectCursor,
  getTokConnectIdempotencyDecision,
  isValidTokConnectIdempotencyKey,
  makeTokConnectRequestId,
  parseTokConnectCursor,
  parseTokConnectLimit,
  sha256Base64Url,
} from "../_shared/tok-connect.ts";
import {
  assertTokConnectFeatureEnabled,
  assertTokConnectRestaurantGrant,
  authenticateTokConnectToken,
  enqueueTokConnectWebhookDeliveries,
  recordTokConnectApiRequest,
  type TokConnectTokenContext,
} from "../_shared/tok-connect-auth.ts";

type DispatchResult = {
  response: Response;
  context: TokConnectTokenContext | null;
  scopes: string[];
  route: string;
  restaurantId?: string | null;
  idempotencyKey?: string | null;
};

type TokConnectIdempotencyRow = {
  request_hash: string | null;
  response_body: Record<string, unknown> | null;
  status_code: number | null;
};

type ReservationRow = {
  id: string;
  restaurant_id: string;
  status: string | null;
  date: string | null;
  time: string | null;
  party_size: number | null;
  metadata: Record<string, unknown> | null;
  cancelled_at: string | null;
  cancellation_reason_code: string | null;
};

type CreditSummary = {
  restaurant_id: string;
  balance: number;
  allowance: number;
  spent: number;
  unit: string;
  source: "get_restaurant_credit_usage";
};

const RESTAURANT_SELECT =
  "id, name, description, cuisine_type, address, city, phone, image_url, rating, review_count, price_range, latitude, longitude, supports_reservation, supports_dinein, supports_pickup, created_at";
const TOK_CONNECT_WEBHOOK_DELIVERIES_TABLE = "tok_connect_webhook_deliveries";

const sandboxRestaurants = [
  {
    id: "00000000-0000-4000-8000-000000000101",
    name: "TOK Sandbox Brasserie",
    description: "Fixture sandbox pour intégrations partenaires.",
    cuisine_type: "Bistronomie",
    city: "Genève",
    rating: 4.8,
    supports_reservation: true,
    created_at: "2026-06-26T10:00:00.000Z",
  },
  {
    id: "00000000-0000-4000-8000-000000000102",
    name: "TOK Sandbox Trattoria",
    description: "Restaurant déterministe sans mutation production.",
    cuisine_type: "Italien",
    city: "Carouge",
    rating: 4.7,
    supports_reservation: true,
    created_at: "2026-06-26T09:00:00.000Z",
  },
];

function stripFunctionPrefix(pathname: string) {
  const marker = "/tok-connect-api";
  const index = pathname.indexOf(marker);
  if (index >= 0) {
    return pathname.slice(index + marker.length) || "/";
  }
  return pathname || "/";
}

function ok<TData>(
  requestId: string,
  data: TData,
  corsHeaders: Record<string, string>,
  status = 200,
  nextCursor: string | null = null,
) {
  return jsonResponse(buildTokConnectEnvelope({ requestId, data, nextCursor }), status, corsHeaders);
}

async function authorize(
  req: Request,
  requiredScopes: string[],
) {
  const context = await authenticateTokConnectToken(req, requiredScopes);
  await assertTokConnectFeatureEnabled(context.adminClient, "tok-connect");
  await assertTokConnectFeatureEnabled(context.adminClient, "tok-connect-api");
  assertTokConnectScopes(context.scopes, requiredScopes);
  const limiter = createRateLimiter(context.adminClient, "tok-connect-api");
  await limiter.consume(`partner:${context.partnerId}`, { maxRequests: context.partnerQuotaPerMinute, windowSeconds: 60 });
  await limiter.consume(`client:${context.clientUuid}`, { maxRequests: context.clientQuotaPerMinute, windowSeconds: 60 });
  return context;
}

function getRestaurantIdFromPath(path: string, suffix = "") {
  const match = path.match(new RegExp(`^/v1/restaurants/([^/]+)${suffix}$`));
  return match?.[1] || null;
}

function getCancelReservationPreviewId(path: string) {
  const match = path.match(/^\/v1\/reservations\/([^/]+)\/cancel\/preview$/);
  return match?.[1] || null;
}

function getCancelReservationMutationId(path: string) {
  const match = path.match(/^\/v1\/reservations\/([^/]+)\/cancel$/);
  return match?.[1] || null;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function nullableTrimmedString(value: unknown, maxLength: number) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, maxLength);
}

function finiteNumber(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function extractTokCreditSummary(restaurantId: string, usage: unknown): CreditSummary {
  const usageRecord = asRecord(usage);
  const credits = Array.isArray(usageRecord.credits) ? usageRecord.credits : [];
  const tokCredit = credits
    .map((item) => asRecord(item))
    .find((item) => item.kind === "tok_credits") || {};

  return {
    restaurant_id: restaurantId,
    balance: finiteNumber(tokCredit.balance),
    allowance: finiteNumber(tokCredit.allowance),
    spent: finiteNumber(tokCredit.spent),
    unit: typeof tokCredit.unit === "string" ? tokCredit.unit : "credit",
    source: "get_restaurant_credit_usage",
  };
}

function getReservationPreview(body: Record<string, unknown>, context: TokConnectTokenContext) {
  return {
    restaurant_id: body.restaurant_id,
    date: body.date,
    time: body.time,
    party_size: body.party_size,
    feature: body.feature || "classique",
    requires_confirmation: true,
    environment: context.environment,
    pricing: {
      reservation_fee_chf: 0,
      currency: "CHF",
    },
    guardrails: [
      "confirmation explicite requise",
      "capacité revérifiée côté serveur à la création",
      "aucune action autonome en v1",
    ],
  };
}

async function listRestaurants(req: Request, requestId: string, corsHeaders: Record<string, string>) {
  const context = await authorize(req, ["restaurants:read"]);
  const url = new URL(req.url);
  const limit = parseTokConnectLimit(url.searchParams.get("limit"), 25, 100);

  if (context.environment === "sandbox") {
    const visible = sandboxRestaurants.slice(0, limit);
    const nextCursor = visible.length === sandboxRestaurants.length
      ? null
      : createTokConnectCursor({ createdAt: visible.at(-1)?.created_at || "", id: visible.at(-1)?.id || "" });
    return {
      response: ok(requestId, { restaurants: visible }, corsHeaders, 200, nextCursor),
      context,
      scopes: ["restaurants:read"],
      route: "GET /v1/restaurants",
    };
  }

  const cursor = parseTokConnectCursor(url.searchParams.get("cursor"));
  let query = context.adminClient
    .from("restaurants")
    .select(RESTAURANT_SELECT)
    .eq("is_active", true)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(limit + 1);

  if (cursor) query = query.lt("created_at", cursor.createdAt);
  if (url.searchParams.get("city")) query = query.ilike("city", `%${url.searchParams.get("city")}%`);
  if (url.searchParams.get("cuisine")) query = query.ilike("cuisine_type", `%${url.searchParams.get("cuisine")}%`);

  const { data, error } = await query;
  if (error) throw new HttpError(500, error.message);

  const rows = data || [];
  const visible = rows.slice(0, limit);
  const last = visible.at(-1) as { created_at?: string; id?: string } | undefined;
  const nextCursor = rows.length > limit && last?.created_at && last?.id
    ? createTokConnectCursor({ createdAt: last.created_at, id: last.id })
    : null;

  return {
    response: ok(requestId, { restaurants: visible }, corsHeaders, 200, nextCursor),
    context,
    scopes: ["restaurants:read"],
    route: "GET /v1/restaurants",
  };
}

async function getRestaurant(req: Request, requestId: string, corsHeaders: Record<string, string>, restaurantId: string) {
  const context = await authorize(req, ["restaurants:read"]);

  if (context.environment === "sandbox") {
    const restaurant = sandboxRestaurants.find((item) => item.id === restaurantId) || sandboxRestaurants[0];
    return {
      response: ok(requestId, { restaurant }, corsHeaders),
      context,
      scopes: ["restaurants:read"],
      route: "GET /v1/restaurants/{id}",
      restaurantId,
    };
  }

  const { data, error } = await context.adminClient
    .from("restaurants")
    .select(RESTAURANT_SELECT)
    .eq("id", restaurantId)
    .eq("is_active", true)
    .maybeSingle();

  if (error) throw new HttpError(500, error.message);
  if (!data) throw new HttpError(404, "restaurant_not_found");

  return {
    response: ok(requestId, { restaurant: data }, corsHeaders),
    context,
    scopes: ["restaurants:read"],
    route: "GET /v1/restaurants/{id}",
    restaurantId,
  };
}

async function getMenu(req: Request, requestId: string, corsHeaders: Record<string, string>, restaurantId: string) {
  const context = await authorize(req, ["restaurants:read"]);
  const limit = parseTokConnectLimit(new URL(req.url).searchParams.get("limit"), 50, 100);

  if (context.environment === "sandbox") {
    return {
      response: ok(requestId, {
        restaurant_id: restaurantId,
        items: [
          { id: "sandbox-menu-1", name: "Menu TOK découverte", price: 34, currency: "CHF", is_available: true },
          { id: "sandbox-menu-2", name: "Assiette végétale", price: 28, currency: "CHF", is_available: true },
        ],
      }, corsHeaders),
      context,
      scopes: ["restaurants:read"],
      route: "GET /v1/restaurants/{id}/menu",
      restaurantId,
    };
  }

  const { data, error } = await context.adminClient
    .from("menu_items")
    .select("id, name, description, price, category, image_url, is_available, created_at")
    .eq("restaurant_id", restaurantId)
    .eq("is_available", true)
    .order("category", { ascending: true })
    .order("name", { ascending: true })
    .limit(limit);

  if (error) throw new HttpError(500, error.message);

  return {
    response: ok(requestId, { restaurant_id: restaurantId, items: data || [] }, corsHeaders),
    context,
    scopes: ["restaurants:read"],
    route: "GET /v1/restaurants/{id}/menu",
    restaurantId,
  };
}

async function getAvailability(req: Request, requestId: string, corsHeaders: Record<string, string>, restaurantId: string) {
  const context = await authorize(req, ["availability:read"]);
  const url = new URL(req.url);
  const date = url.searchParams.get("date") || new Date().toISOString().slice(0, 10);
  const partySize = Number(url.searchParams.get("party_size") || 0) || null;

  if (context.environment === "sandbox") {
    return {
      response: ok(requestId, {
        restaurant_id: restaurantId,
        date,
        slots: [
          { slot_time: "12:00", service: "lunch", remaining_tables: 4, available: true },
          { slot_time: "19:30", service: "dinner", remaining_tables: 2, available: true },
        ],
      }, corsHeaders),
      context,
      scopes: ["availability:read"],
      route: "GET /v1/restaurants/{id}/availability",
      restaurantId,
    };
  }

  await assertTokConnectRestaurantGrant(context, restaurantId, "availability:read", {
    partySize,
  });

  const { data, error } = await context.adminClient.rpc("get_restaurant_reservation_slot_availability", {
    p_restaurant_id: restaurantId,
    p_date: date,
  });

  if (error) throw new HttpError(500, error.message);

  return {
    response: ok(requestId, { restaurant_id: restaurantId, date, slots: data || [] }, corsHeaders),
    context,
    scopes: ["availability:read"],
    route: "GET /v1/restaurants/{id}/availability",
    restaurantId,
  };
}

async function previewReservation(req: Request, requestId: string, corsHeaders: Record<string, string>) {
  const context = await authorize(req, ["reservations:create"]);
  const body = await req.json().catch(() => ({}));
  if (!body.restaurant_id || !body.date || !body.time || !body.party_size) {
    throw new HttpError(400, "reservation_preview_fields_required");
  }

  await assertTokConnectRestaurantGrant(context, String(body.restaurant_id), "reservations:create", {
    partySize: Number(body.party_size),
  });

  return {
    response: ok(requestId, { reservation_preview: getReservationPreview(body, context) }, corsHeaders),
    context,
    scopes: ["reservations:create"],
    route: "POST /v1/reservations/preview",
    restaurantId: String(body.restaurant_id),
  };
}

async function createReservation(req: Request, requestId: string, corsHeaders: Record<string, string>) {
  const context = await authorize(req, ["reservations:create"]);
  const idempotencyKey = req.headers.get("Idempotency-Key");
  if (!isValidTokConnectIdempotencyKey(idempotencyKey)) {
    throw new HttpError(400, "idempotency_key_required");
  }

  const body = await req.json().catch(() => ({}));
  if (!body.restaurant_id || !body.date || !body.time || !body.party_size) {
    throw new HttpError(400, "reservation_fields_required");
  }
  if (body.confirmed_by !== "end_user") {
    throw new HttpError(409, "end_user_confirmation_required");
  }

  await assertTokConnectRestaurantGrant(context, String(body.restaurant_id), "reservations:create", {
    partySize: Number(body.party_size),
    enforceDailyReservationLimit: true,
  });

  const requestHash = await sha256Base64Url(JSON.stringify(body));
  const { data: existing, error: existingError } = await context.adminClient
    .from("tok_connect_idempotency_keys")
    .select("request_hash, response_body, status_code")
    .eq("client_id", context.clientUuid)
    .eq("key", idempotencyKey)
    .maybeSingle<{
      request_hash: string | null;
      response_body: Record<string, unknown> | null;
      status_code: number | null;
    }>();

  if (existingError) throw new HttpError(500, existingError.message);
  const idempotencyDecision = getTokConnectIdempotencyDecision(existing, requestHash);
  if (idempotencyDecision.status === "conflict") {
    throw new HttpError(409, "idempotency_key_reused_with_different_body");
  }
  if (idempotencyDecision.status === "in_progress") {
    throw new HttpError(409, "idempotency_key_in_progress");
  }
  if (idempotencyDecision.status === "replay") {
    return {
      response: jsonResponse(idempotencyDecision.responseBody, idempotencyDecision.statusCode, corsHeaders),
      context,
      scopes: ["reservations:create"],
      route: "POST /v1/reservations",
      restaurantId: String(body.restaurant_id),
      idempotencyKey,
    };
  }

  if (context.environment === "sandbox") {
    const sandboxReservationId = "00000000-0000-4000-8000-000000000901";
    const payload = buildTokConnectEnvelope({
      requestId,
      data: {
        reservation: {
          id: sandboxReservationId,
          status: "confirmed",
          restaurant_id: body.restaurant_id,
          date: body.date,
          time: body.time,
          party_size: body.party_size,
          environment: "sandbox",
        },
      },
    });
    await context.adminClient.from("tok_connect_idempotency_keys").insert({
      partner_id: context.partnerId,
      client_id: context.clientUuid,
      key: idempotencyKey,
      operation: "reservation.create",
      request_hash: requestHash,
      response_body: payload,
      status_code: 201,
      resource_type: "reservation",
      resource_id: sandboxReservationId,
    });
    return {
      response: jsonResponse(payload, 201, corsHeaders),
      context,
      scopes: ["reservations:create"],
      route: "POST /v1/reservations",
      restaurantId: String(body.restaurant_id),
      idempotencyKey,
    };
  }

  const metadata = {
    ...(typeof body.metadata === "object" && body.metadata ? body.metadata : {}),
    tok_connect_partner_id: context.partnerId,
    tok_connect_client_id: context.clientUuid,
    tok_connect_request_id: requestId,
    tok_connect_confirmed_by: body.confirmed_by,
  };

  const { data: reservationRows, error: reservationError } = await context.adminClient.rpc(
    "validate_and_create_reservation_safe",
    {
      p_restaurant_id: body.restaurant_id,
      p_date: body.date,
      p_time: body.time,
      p_party_size: Number(body.party_size),
      p_feature: body.feature || "classique",
      p_metadata: metadata,
      p_notes: body.notes || null,
      p_progressive_offer_id: null,
    },
  );

  if (reservationError) throw new HttpError(500, reservationError.message);
  const reservationResult = Array.isArray(reservationRows) ? reservationRows[0] : reservationRows;
  if (!reservationResult?.reservation_id) {
    throw new HttpError(422, reservationResult?.error_message || reservationResult?.error_code || "reservation_rejected");
  }

  const payload = buildTokConnectEnvelope({
    requestId,
    data: {
      reservation: {
        id: reservationResult.reservation_id,
        status: "confirmed",
        restaurant_id: body.restaurant_id,
        date: body.date,
        time: body.time,
        party_size: Number(body.party_size),
      },
    },
  });

  await context.adminClient.from("tok_connect_idempotency_keys").insert({
    partner_id: context.partnerId,
    client_id: context.clientUuid,
    key: idempotencyKey,
    operation: "reservation.create",
    request_hash: requestHash,
    response_body: payload,
    status_code: 201,
    resource_type: "reservation",
    resource_id: reservationResult.reservation_id,
  });

  await enqueueTokConnectWebhookDeliveries({
    context,
    eventType: "reservation.created",
    payload: {
      event: "reservation.created",
      reservation_id: reservationResult.reservation_id,
      restaurant_id: body.restaurant_id,
      request_id: requestId,
    },
  });

  await writeAuditLog({
    adminClient: context.adminClient,
    functionName: "tok-connect-api",
    action: "reservation.create",
    status: "success",
    request: req,
    targetEntityType: "reservation",
    targetEntityId: reservationResult.reservation_id,
    metadata: {
      partner_id: context.partnerId,
      client_id: context.clientUuid,
      request_id: requestId,
      webhook_delivery_table: TOK_CONNECT_WEBHOOK_DELIVERIES_TABLE,
    },
  });

  return {
    response: jsonResponse(payload, 201, corsHeaders),
    context,
    scopes: ["reservations:create"],
    route: "POST /v1/reservations",
    restaurantId: String(body.restaurant_id),
    idempotencyKey,
  };
}

async function previewCancellation(req: Request, requestId: string, corsHeaders: Record<string, string>, reservationId: string) {
  const context = await authorize(req, ["reservations:cancel"]);
  const body = await req.json().catch(() => ({}));
  let restaurantId = typeof body.restaurant_id === "string" ? body.restaurant_id : null;

  if (!restaurantId && context.environment !== "sandbox") {
    const { data: reservation, error } = await context.adminClient
      .from("reservations")
      .select("restaurant_id")
      .eq("id", reservationId)
      .maybeSingle<{ restaurant_id: string }>();

    if (error) throw new HttpError(500, error.message);
    if (!reservation?.restaurant_id) throw new HttpError(404, "reservation_not_found");
    restaurantId = reservation.restaurant_id;
  }

  if (restaurantId) {
    await assertTokConnectRestaurantGrant(context, restaurantId, "reservations:cancel");
  }

  return {
    response: ok(requestId, {
      cancellation_preview: {
        reservation_id: reservationId,
        reason: body.reason || null,
        mutation_required: false,
        requires_human_confirmation: true,
      },
    }, corsHeaders),
    context,
    scopes: ["reservations:cancel"],
    route: "POST /v1/reservations/{id}/cancel/preview",
    restaurantId,
  };
}

async function cancelReservation(req: Request, requestId: string, corsHeaders: Record<string, string>, reservationId: string) {
  const context = await authorize(req, ["reservations:cancel"]);
  const idempotencyKey = req.headers.get("Idempotency-Key");
  if (!isValidTokConnectIdempotencyKey(idempotencyKey)) {
    throw new HttpError(400, "idempotency_key_required");
  }

  const body = asRecord(await req.json().catch(() => ({})));
  if (body.confirmed_by !== "end_user") {
    throw new HttpError(409, "end_user_cancellation_confirmation_required");
  }

  const requestHash = await sha256Base64Url(JSON.stringify({ reservation_id: reservationId, body }));
  const { data: existing, error: existingError } = await context.adminClient
    .from("tok_connect_idempotency_keys")
    .select("request_hash, response_body, status_code")
    .eq("client_id", context.clientUuid)
    .eq("key", idempotencyKey)
    .maybeSingle<TokConnectIdempotencyRow>();

  if (existingError) throw new HttpError(500, existingError.message);
  const idempotencyDecision = getTokConnectIdempotencyDecision(existing, requestHash);
  if (idempotencyDecision.status === "conflict") {
    throw new HttpError(409, "idempotency_key_reused_with_different_body");
  }
  if (idempotencyDecision.status === "in_progress") {
    throw new HttpError(409, "idempotency_key_in_progress");
  }
  if (idempotencyDecision.status === "replay") {
    const replayData = asRecord(idempotencyDecision.responseBody?.data);
    const replayReservation = asRecord(replayData.reservation);
    return {
      response: jsonResponse(idempotencyDecision.responseBody, idempotencyDecision.statusCode, corsHeaders),
      context,
      scopes: ["reservations:cancel"],
      route: "POST /v1/reservations/{id}/cancel",
      restaurantId: typeof replayReservation.restaurant_id === "string" ? replayReservation.restaurant_id : null,
      idempotencyKey,
    };
  }

  if (context.environment === "sandbox") {
    const cancelledAt = new Date().toISOString();
    const payload = buildTokConnectEnvelope({
      requestId,
      data: {
        reservation: {
          id: reservationId,
          status: "cancelled",
          cancelled_at: cancelledAt,
          already_cancelled: false,
          environment: "sandbox",
          reason_code: nullableTrimmedString(body.reason_code, 64) || "customer_cancelled",
        },
      },
    });

    const { error: insertError } = await context.adminClient.from("tok_connect_idempotency_keys").insert({
      partner_id: context.partnerId,
      client_id: context.clientUuid,
      key: idempotencyKey,
      operation: "reservation.cancel",
      request_hash: requestHash,
      response_body: payload,
      status_code: 200,
      resource_type: "reservation",
      resource_id: reservationId,
    });
    if (insertError) throw new HttpError(500, insertError.message);

    return {
      response: jsonResponse(payload, 200, corsHeaders),
      context,
      scopes: ["reservations:cancel"],
      route: "POST /v1/reservations/{id}/cancel",
      restaurantId: typeof body.restaurant_id === "string" ? body.restaurant_id : null,
      idempotencyKey,
    };
  }

  const { data: reservation, error: reservationError } = await context.adminClient
    .from("reservations")
    .select("id, restaurant_id, status, date, time, party_size, metadata, cancelled_at, cancellation_reason_code")
    .eq("id", reservationId)
    .maybeSingle<ReservationRow>();

  if (reservationError) throw new HttpError(500, reservationError.message);
  if (!reservation) throw new HttpError(404, "reservation_not_found");

  await assertTokConnectRestaurantGrant(context, reservation.restaurant_id, "reservations:cancel");

  const reservationMetadata = asRecord(reservation.metadata);
  if (reservationMetadata.tok_connect_partner_id !== context.partnerId) {
    throw new HttpError(403, "tok_connect_reservation_not_owned");
  }

  const status = String(reservation.status || "").toLowerCase();
  if (status === "no_show") {
    throw new HttpError(409, "reservation_invalid_state");
  }

  const reasonCode = nullableTrimmedString(body.reason_code, 64) || "customer_cancelled";
  const reasonDetails = nullableTrimmedString(body.reason, 500);
  const alreadyCancelled = status === "cancelled" || status === "canceled";
  const cancelledAt = reservation.cancelled_at || new Date().toISOString();
  let finalReservation = reservation;

  if (!alreadyCancelled) {
    const updatedMetadata = {
      ...reservationMetadata,
      tok_connect_cancelled_by_partner_id: context.partnerId,
      tok_connect_cancel_client_id: context.clientUuid,
      tok_connect_cancel_request_id: requestId,
      tok_connect_cancelled_at: cancelledAt,
      tok_connect_cancel_reason: reasonDetails || reasonCode,
    };

    const { data: updatedReservation, error: updateError } = await context.adminClient
      .from("reservations")
      .update({
        status: "cancelled",
        cancelled_at: cancelledAt,
        cancelled_by: "customer",
        cancellation_reason_code: reasonCode,
        cancellation_reason_details: reasonDetails,
        metadata: updatedMetadata,
        updated_at: cancelledAt,
      })
      .eq("id", reservationId)
      .select("id, restaurant_id, status, date, time, party_size, metadata, cancelled_at, cancellation_reason_code")
      .maybeSingle<ReservationRow>();

    if (updateError) throw new HttpError(500, updateError.message);
    if (!updatedReservation) throw new HttpError(404, "reservation_not_found");
    finalReservation = updatedReservation;
  }

  const payload = buildTokConnectEnvelope({
    requestId,
    data: {
      reservation: {
        id: finalReservation.id,
        status: "cancelled",
        restaurant_id: finalReservation.restaurant_id,
        date: finalReservation.date,
        time: finalReservation.time,
        party_size: finalReservation.party_size,
        cancelled_at: finalReservation.cancelled_at || cancelledAt,
        already_cancelled: alreadyCancelled,
        reason_code: finalReservation.cancellation_reason_code || reasonCode,
      },
    },
  });

  const { error: insertError } = await context.adminClient.from("tok_connect_idempotency_keys").insert({
    partner_id: context.partnerId,
    client_id: context.clientUuid,
    key: idempotencyKey,
    operation: "reservation.cancel",
    request_hash: requestHash,
    response_body: payload,
    status_code: 200,
    resource_type: "reservation",
    resource_id: finalReservation.id,
  });
  if (insertError) throw new HttpError(500, insertError.message);

  if (!alreadyCancelled) {
    await enqueueTokConnectWebhookDeliveries({
      context,
      eventType: "reservation.cancelled",
      payload: {
        event: "reservation.cancelled",
        reservation_id: finalReservation.id,
        restaurant_id: finalReservation.restaurant_id,
        request_id: requestId,
        reason_code: finalReservation.cancellation_reason_code || reasonCode,
      },
    });
  }

  await writeAuditLog({
    adminClient: context.adminClient,
    functionName: "tok-connect-api",
    action: "reservation.cancel",
    status: "success",
    request: req,
    targetEntityType: "reservation",
    targetEntityId: finalReservation.id,
    metadata: {
      partner_id: context.partnerId,
      client_id: context.clientUuid,
      request_id: requestId,
      already_cancelled: alreadyCancelled,
      webhook_delivery_table: TOK_CONNECT_WEBHOOK_DELIVERIES_TABLE,
    },
  });

  return {
    response: jsonResponse(payload, 200, corsHeaders),
    context,
    scopes: ["reservations:cancel"],
    route: "POST /v1/reservations/{id}/cancel",
    restaurantId: finalReservation.restaurant_id,
    idempotencyKey,
  };
}

async function readRestaurantCreditSummary(context: TokConnectTokenContext, restaurantId: string) {
  const { data, error } = await context.adminClient.rpc("get_restaurant_credit_usage", {
    p_restaurant_id: restaurantId,
  });

  if (error) throw new HttpError(500, error.message);
  return extractTokCreditSummary(restaurantId, data);
}

async function getCredits(req: Request, requestId: string, corsHeaders: Record<string, string>) {
  const context = await authorize(req, ["credits:read"]);
  const url = new URL(req.url);
  const restaurantId = url.searchParams.get("restaurant_id");

  if (restaurantId) {
    await assertTokConnectRestaurantGrant(context, restaurantId, "credits:read");
    const summary = context.environment === "sandbox"
      ? {
        restaurant_id: restaurantId,
        balance: 1000,
        allowance: 1000,
        spent: 0,
        unit: "credit",
        source: "get_restaurant_credit_usage" as const,
      }
      : await readRestaurantCreditSummary(context, restaurantId);

    return {
      response: ok(requestId, {
        credits: {
          ...summary,
          currency: "TOK_CREDIT",
          environment: context.environment,
          restaurant_count: 1,
        },
      }, corsHeaders),
      context,
      scopes: ["credits:read"],
      route: "GET /v1/credits/balance",
      restaurantId,
    };
  }

  if (context.environment === "sandbox") {
    return {
      response: ok(requestId, {
        credits: {
          balance: 1000,
          allowance: 1000,
          spent: 0,
          currency: "TOK_CREDIT",
          unit: "credit",
          environment: "sandbox",
          source: "get_restaurant_credit_usage",
          restaurant_count: 1,
        },
      }, corsHeaders),
      context,
      scopes: ["credits:read"],
      route: "GET /v1/credits/balance",
    };
  }

  const now = new Date().toISOString();
  const { data: grants, error: grantsError } = await context.adminClient
    .from("tok_connect_restaurant_grants")
    .select("restaurant_id, expires_at")
    .eq("partner_id", context.partnerId)
    .eq("status", "active")
    .contains("allowed_scopes", ["credits:read"])
    .or(`expires_at.is.null,expires_at.gt.${now}`)
    .limit(51);

  if (grantsError) throw new HttpError(500, grantsError.message);
  const visibleGrants = (grants || []).slice(0, 50) as Array<{ restaurant_id: string }>;
  const restaurantSummaries: CreditSummary[] = [];
  for (const grant of visibleGrants) {
    if (grant.restaurant_id) {
      restaurantSummaries.push(await readRestaurantCreditSummary(context, grant.restaurant_id));
    }
  }

  const aggregate = restaurantSummaries.reduce((total, item) => ({
    balance: total.balance + item.balance,
    allowance: total.allowance + item.allowance,
    spent: total.spent + item.spent,
  }), { balance: 0, allowance: 0, spent: 0 });

  return {
    response: ok(requestId, {
      credits: {
        ...aggregate,
        currency: "TOK_CREDIT",
        unit: "credit",
        environment: context.environment,
        source: "get_restaurant_credit_usage",
        restaurant_count: restaurantSummaries.length,
        truncated: (grants || []).length > 50,
        restaurants: restaurantSummaries,
      },
    }, corsHeaders),
    context,
    scopes: ["credits:read"],
    route: "GET /v1/credits/balance",
  };
}

async function previewCampaign(req: Request, requestId: string, corsHeaders: Record<string, string>) {
  const context = await authorize(req, ["campaigns:preview"]);
  const body = await req.json().catch(() => ({}));
  if (!body.restaurant_id || !body.objective) throw new HttpError(400, "campaign_preview_fields_required");
  await assertTokConnectRestaurantGrant(context, String(body.restaurant_id), "campaigns:preview");

  const payload = {
    campaign_preview: {
      restaurant_id: body.restaurant_id,
      objective: body.objective,
      budget_chf: Number(body.budget_chf || 0),
      credit_estimate: Math.max(1, Math.ceil(Number(body.budget_chf || 0) / 2)),
      requires_human_approval: true,
      status: "preview",
    },
  };

  await context.adminClient.from("tok_connect_agent_runs").insert({
    partner_id: context.partnerId,
    restaurant_id: body.restaurant_id,
    mode: "preview",
    tool_name: "generate_campaign_preview",
    status: "preview",
    scopes: ["campaigns:preview"],
    input: body,
    output: payload,
    approval_required: true,
  });

  await enqueueTokConnectWebhookDeliveries({
    context,
    eventType: "campaign.previewed",
    payload: {
      event: "campaign.previewed",
      restaurant_id: body.restaurant_id,
      request_id: requestId,
      preview: payload.campaign_preview,
    },
  });

  return {
    response: ok(requestId, payload, corsHeaders),
    context,
    scopes: ["campaigns:preview"],
    route: "POST /v1/campaigns/preview",
    restaurantId: String(body.restaurant_id),
  };
}

async function dispatch(req: Request, requestId: string, corsHeaders: Record<string, string>): Promise<DispatchResult> {
  const path = stripFunctionPrefix(new URL(req.url).pathname);

  if (req.method === "GET" && path === "/v1/restaurants") {
    return await listRestaurants(req, requestId, corsHeaders);
  }

  const menuRestaurantId = getRestaurantIdFromPath(path, "/menu");
  if (req.method === "GET" && menuRestaurantId) {
    return await getMenu(req, requestId, corsHeaders, menuRestaurantId);
  }

  const availabilityRestaurantId = getRestaurantIdFromPath(path, "/availability");
  if (req.method === "GET" && availabilityRestaurantId) {
    return await getAvailability(req, requestId, corsHeaders, availabilityRestaurantId);
  }

  const restaurantId = getRestaurantIdFromPath(path);
  if (req.method === "GET" && restaurantId) {
    return await getRestaurant(req, requestId, corsHeaders, restaurantId);
  }

  if (req.method === "POST" && path === "/v1/reservations/preview") {
    return await previewReservation(req, requestId, corsHeaders);
  }

  if (req.method === "POST" && path === "/v1/reservations") {
    return await createReservation(req, requestId, corsHeaders);
  }

  const cancelReservationMutationId = getCancelReservationMutationId(path);
  if (req.method === "POST" && cancelReservationMutationId) {
    return await cancelReservation(req, requestId, corsHeaders, cancelReservationMutationId);
  }

  const cancelReservationPreviewId = getCancelReservationPreviewId(path);
  if (req.method === "POST" && cancelReservationPreviewId) {
    return await previewCancellation(req, requestId, corsHeaders, cancelReservationPreviewId);
  }

  if (req.method === "GET" && path === "/v1/credits/balance") {
    return await getCredits(req, requestId, corsHeaders);
  }

  if (req.method === "POST" && path === "/v1/campaigns/preview") {
    return await previewCampaign(req, requestId, corsHeaders);
  }

  throw new HttpError(404, "tok_connect_route_not_found");
}

Deno.serve(async (req) => {
  const corsHeaders = buildCorsHeaders(req);
  const preflight = handleCorsPreflight(req, corsHeaders);
  if (preflight) return preflight;

  const requestId = makeTokConnectRequestId();
  const startedAt = Date.now();
  let context: TokConnectTokenContext | null = null;
  let statusCode = 500;
  let route = stripFunctionPrefix(new URL(req.url).pathname);
  let scopes: string[] = [];
  let restaurantId: string | null = null;
  let idempotencyKey: string | null = null;
  let errorCode: string | null = null;
  let response: Response;

  try {
    const result = await dispatch(req, requestId, corsHeaders);
    context = result.context;
    route = result.route;
    scopes = result.scopes;
    restaurantId = result.restaurantId || null;
    idempotencyKey = result.idempotencyKey || req.headers.get("Idempotency-Key");
    response = result.response;
    statusCode = response.status;
  } catch (error) {
    statusCode = error instanceof HttpError ? error.status : 500;
    errorCode = error instanceof Error ? error.message : "tok_connect_api_error";
    response = jsonResponse(
      buildTokConnectEnvelope({
        requestId,
        error: { code: errorCode, message: errorCode },
      }),
      statusCode,
      corsHeaders,
    );
  }

  await recordTokConnectApiRequest({
    context,
    request: req,
    requestId,
    route,
    statusCode,
    startedAt,
    scopes,
    restaurantId,
    idempotencyKey,
    errorCode,
  });

  return response;
});
