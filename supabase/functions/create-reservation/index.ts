import {
  HttpError,
  authenticateRequest,
  assertProductionFlowAllowed,
  buildRequestMetadata,
  createAdminClient,
  jsonResponse,
  writeAuditLog,
} from "../_shared/auth.ts";
import { buildCorsHeaders, handleCorsPreflight } from "../_shared/cors.ts";
import { makeLogger } from "../_shared/logging.ts";
import { triggerNotificationDispatch } from "../_shared/notifications.ts";
import { createRateLimiter } from "../_shared/rate-limit.ts";
import { queueReservationConfirmationEmails } from "../_shared/transactional-emails.ts";
import { getStripeRuntimeForCheckoutKind } from "../_shared/stripe-client.ts";
import { finalizeReservationCardGuarantee } from "../_shared/reservation-card-guarantee.ts";

type CreateReservationPayload = {
  restaurant_id?: string;
  date?: string;
  time?: string;
  party_size?: number;
  feature?: string;
  metadata?: Record<string, unknown>;
  acquisition_source?: string | null;
  acquisition_channel_token?: string | null;
  notes?: string | null;
  progressive_offer_id?: string | null;
  action?: "quote" | "create" | "finalize";
  guarantee_accepted?: boolean;
  checkout_session_id?: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isUuid(value: unknown) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(value || ""));
}

const ATTRIBUTION_METADATA_KEYS = new Set([
  "acquisition_source",
  "acquisition_channel_id",
  "acquisition_channel_token",
  "reservation_fee_chf",
  "billing_fee_chf",
  "paid",
  "checkout_session_id",
  "payment_method",
  "total_amount",
  "card_guarantee_setup_id",
  "card_guarantee_fee_chf",
  "card_guarantee_policy_version",
  "honored_at",
  "attributed_table_revenue_chf",
]);

function sanitizeReservationMetadata(value: Record<string, unknown>) {
  return Object.fromEntries(
    Object.entries(value).filter(([key]) => !ATTRIBUTION_METADATA_KEYS.has(key)),
  );
}

function getFirstRow<T>(data: T[] | T | null | undefined): T | null {
  if (Array.isArray(data)) return data[0] ?? null;
  return data ?? null;
}

async function cardGuaranteesEnabled(adminClient: any): Promise<boolean> {
  const { data, error } = await adminClient
    .from("feature_flags")
    .select("is_active")
    .eq("name", "reservation-card-guarantee")
    .maybeSingle();
  if (error) throw new HttpError(503, "Configuration des réservations indisponible.");
  return data?.is_active === true;
}

function getPublicAppBaseUrl() {
  return Deno.env.get("PUBLIC_APP_URL")
    || Deno.env.get("APP_BASE_URL")
    || Deno.env.get("SITE_URL")
    || "https://www.thetok.ch";
}

function featureLabel(feature: string, metadata: Record<string, unknown>) {
  const formula = typeof metadata.formula_applied === "string" ? metadata.formula_applied : "";
  const progressive = typeof metadata.progressive_offer_name === "string" ? metadata.progressive_offer_name : "";
  if (feature === "promo-progressive") return progressive || "Offre progressive";
  if (feature === "promo-formule") return formula || "Formule";
  if (feature === "zero-attente") return "Zéro Attente";
  if (feature === "chefs_table") return "La Table du Chef";
  return "Réservation classique";
}

async function getAuthUserEmail(adminClient: any, userId: string | null | undefined) {
  if (!userId) return null;
  const { data } = await adminClient.auth.admin.getUserById(userId);
  return data?.user?.email || null;
}

Deno.serve(async (req) => {
  const corsHeaders = buildCorsHeaders(req);
  const preflight = handleCorsPreflight(req, corsHeaders);
  if (preflight) return preflight;

  const log = makeLogger("create-reservation");
  let actor: Awaited<ReturnType<typeof authenticateRequest>> | null = null;
  let auditRestaurantId = "";
  let auditReservationId = "";

  try {
    actor = await authenticateRequest(req, { allowServiceRole: false });
    if (!actor.userId) throw new HttpError(401, "Unauthorized");
    await assertProductionFlowAllowed(actor, "réservation réelle");

    const requestMetadata = buildRequestMetadata(req);
    const rateLimiter = createRateLimiter(actor.adminClient, "create-reservation");
    await rateLimiter.consume(`user:${actor.userId}`, { maxRequests: 40, windowSeconds: 300 });
    if (requestMetadata.ip) {
      await rateLimiter.consume(`ip:${requestMetadata.ip}`, { maxRequests: 120, windowSeconds: 300 });
    }
    await rateLimiter.consume("global", { maxRequests: 1000, windowSeconds: 60 });

    const body: CreateReservationPayload = await req.json().catch(() => ({}));
    const action = String(body.action || "create").trim();
    if (action === "quote") {
      const requestedSize = Number(body.party_size);
      if (!Number.isInteger(requestedSize) || requestedSize < 1 || requestedSize > 50) {
        throw new HttpError(400, "Nombre de convives invalide.");
      }
      // The free-table flow must work if frontend/Edge is deployed before
      // the new migration. An absent or disabled flag means no guarantee.
      if (!await cardGuaranteesEnabled(actor.adminClient)) {
        return jsonResponse({
          ok: true, required: false, cancellation_count: 0,
          reason: "none", fee_amount_cents: 0,
        }, 200, corsHeaders);
      }

      const { data: quoteData, error: quoteError } = await actor.adminClient.rpc(
        "reservation_card_guarantee_quote",
        { p_user_id: actor.userId, p_party_size: requestedSize },
      );
      if (quoteError) throw new HttpError(503, "Vérification de garantie bancaire indisponible.");
      const quote = getFirstRow<{
        is_required: boolean;
        cancellation_count: number;
        reason: string;
        fee_amount_cents: number;
      }>(quoteData);
      if (!quote) throw new HttpError(503, "Vérification de garantie bancaire indisponible.");
      return jsonResponse({
        ok: true,
        required: Boolean(quote.is_required),
        cancellation_count: Number(quote.cancellation_count || 0),
        reason: quote.reason || "none",
        fee_amount_cents: Number(quote.fee_amount_cents || 0),
      }, 200, corsHeaders);
    }

    if (action === "finalize") {
      const checkoutSessionId = String(body.checkout_session_id || "").trim();
      if (!/^cs_live_[a-zA-Z0-9_]+$/.test(checkoutSessionId)) {
        throw new HttpError(400, "Session de garantie bancaire invalide.");
      }
      const runtime = getStripeRuntimeForCheckoutKind("reservation");
      if (runtime.mode !== "live") throw new HttpError(503, "Paiement sécurisé non configuré.");
      const result = await finalizeReservationCardGuarantee({
        adminClient: actor.adminClient,
        stripe: runtime.stripe,
        checkoutSessionId,
        authenticatedUserId: actor.userId,
      });
      return jsonResponse(result.ok
        ? { ok: true, reservation_id: result.reservationId, reservationId: result.reservationId }
        : { ok: false, error_code: result.errorCode, error_message: result.errorMessage },
        200, corsHeaders);
    }
    if (action !== "create") throw new HttpError(400, "Action inconnue.");

    // Paid experiences have their own verified Stripe checkout. Allowing a
    // caller to select those feature names here would bypass the free-table
    // card-guarantee policy without actually paying for the experience.
    const requestedFeature = String(body.feature || "classique").trim().toLowerCase();
    if (requestedFeature === "zero-attente" || requestedFeature === "chefs_table") {
      throw new HttpError(409, "Utilisez le parcours de réservation et de paiement dédié.");
    }

    const restaurantId = String(body.restaurant_id || "").trim();
    const date = String(body.date || "").trim();
    const time = String(body.time || "").trim().slice(0, 5);
    const partySize = Math.max(1, Math.floor(Number(body.party_size || 0)));
    const feature = String(body.feature || "classique").trim() || "classique";
    const metadata = sanitizeReservationMetadata(isRecord(body.metadata) ? body.metadata : {});
    const requestedAcquisitionSource = String(body.acquisition_source || "").trim().toLowerCase();
    const acquisitionChannelToken = String(body.acquisition_channel_token || "").trim();
    let acquisitionSource = "tok_marketplace";
    let acquisitionChannelId: string | null = null;
    const notes = typeof body.notes === "string" ? body.notes : null;
    const progressiveOfferId = body.progressive_offer_id && isUuid(body.progressive_offer_id)
      ? body.progressive_offer_id
      : null;

    auditRestaurantId = restaurantId;

    if (!isUuid(restaurantId)) throw new HttpError(400, "restaurant_id invalide");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new HttpError(400, "date invalide");
    if (!/^\d{2}:\d{2}$/.test(time)) throw new HttpError(400, "time invalide");
    if (!Number.isFinite(partySize) || partySize < 1 || partySize > 50) {
      throw new HttpError(400, "party_size invalide");
    }

    if (requestedAcquisitionSource) {
      if (requestedAcquisitionSource === "google") {
        if (!acquisitionChannelToken || acquisitionChannelToken.length > 160) {
          throw new HttpError(400, "Jeton de canal Google invalide.");
        }

        const { data: resolvedData, error: resolvedError } = await actor.adminClient.rpc(
          "resolve_google_booking_slug",
          { p_booking_slug: acquisitionChannelToken },
        );
        const resolved = getFirstRow<{
          restaurant_id: string;
          booking_slug: string;
          is_active: boolean | null;
          status: string | null;
          supports_reservation: boolean | null;
        }>(resolvedData);

        if (
          resolvedError
          || !resolved
          || resolved.restaurant_id !== restaurantId
          || resolved.booking_slug !== acquisitionChannelToken
          || !resolved.is_active
          || !resolved.supports_reservation
          || ["archived", "suspended", "paused"].includes(String(resolved.status || "").toLowerCase())
        ) {
          throw new HttpError(400, "Canal Google non vérifié pour ce restaurant.");
        }
        acquisitionSource = "google";
      } else if (["restaurant_website", "qr_code", "instagram"].includes(requestedAcquisitionSource)) {
        if (!isUuid(acquisitionChannelToken)) {
          throw new HttpError(400, "Jeton de canal direct invalide.");
        }

        const { data: channel, error: channelError } = await actor.adminClient
          .from("restaurant_booking_channels")
          .select("id, restaurant_id, source, is_active")
          .eq("public_token", acquisitionChannelToken)
          .eq("restaurant_id", restaurantId)
          .eq("source", requestedAcquisitionSource)
          .eq("is_active", true)
          .maybeSingle();

        if (channelError || !channel) {
          throw new HttpError(400, "Canal direct non vérifié pour ce restaurant.");
        }
        acquisitionSource = requestedAcquisitionSource;
        acquisitionChannelId = channel.id;
      } else if (requestedAcquisitionSource === "customer_file") {
        const { data: ownedRestaurant } = await actor.adminClient
          .from("restaurants")
          .select("id")
          .eq("id", restaurantId)
          .eq("owner_id", actor.userId)
          .maybeSingle();
        if (!ownedRestaurant) {
          throw new HttpError(403, "Le fichier client est réservé au propriétaire du restaurant.");
        }
        acquisitionSource = "customer_file";
      } else {
        throw new HttpError(400, "Source d'acquisition invalide.");
      }
    }

    // The quote is recalculated server-side at creation. A browser-provided
    // party size, cancellation count or "payment complete" flag is never trusted.
    let guaranteeQuote: {
      is_required: boolean; fee_amount_cents: number; reason: string;
    } = { is_required: false, fee_amount_cents: 0, reason: "none" };
    if (await cardGuaranteesEnabled(actor.adminClient)) {
      const { data: guaranteeQuoteData, error: guaranteeQuoteError } = await actor.adminClient.rpc(
        "reservation_card_guarantee_quote",
        { p_user_id: actor.userId, p_party_size: partySize },
      );
      if (guaranteeQuoteError) throw new HttpError(503, "Vérification de garantie bancaire indisponible.");
      const validated = getFirstRow<{
        is_required: boolean; fee_amount_cents: number; reason: string;
      }>(guaranteeQuoteData);
      if (!validated) throw new HttpError(503, "Vérification de garantie bancaire indisponible.");
      guaranteeQuote = validated;
    }

    const freeTableReservation = !["zero-attente", "chefs_table"].includes(feature.toLowerCase());
    if (freeTableReservation && guaranteeQuote.is_required) {
      if (body.guarantee_accepted !== true) {
        return jsonResponse({
          ok: false,
          error_code: "card_guarantee_consent_required",
          error_message: "Une carte bancaire et votre accord sur les frais d'annulation de 10 CHF par convive sont requis.",
        }, 200, corsHeaders);
      }
      if (notes && notes.length > 1500) throw new HttpError(400, "Notes trop longues.");

      const { data: setup, error: setupError } = await actor.adminClient
        .from("reservation_card_guarantee_setups")
        .insert({
          user_id: actor.userId,
          restaurant_id: restaurantId,
          date,
          time,
          party_size: partySize,
          feature,
          metadata: {
            ...metadata,
            acquisition_source: acquisitionSource,
            ...(acquisitionChannelId ? { acquisition_channel_id: acquisitionChannelId } : {}),
            ...(acquisitionSource === "google" ? { acquisition_channel_token: acquisitionChannelToken } : {}),
          },
          acquisition_source: acquisitionSource,
          acquisition_channel_token: acquisitionChannelToken || null,
          notes,
          progressive_offer_id: progressiveOfferId,
          fee_amount_cents: partySize * 1000,
          policy_version: "reservation-cancellation-v1",
          consented_at: new Date().toISOString(),
        })
        .select("id")
        .single();
      if (setupError || !setup?.id) throw new HttpError(500, "Impossible d'initialiser la garantie bancaire.");

      try {
        const runtime = getStripeRuntimeForCheckoutKind("reservation");
        if (runtime.mode !== "live") throw new HttpError(503, "Stripe Live indisponible.");
        const email = await getAuthUserEmail(actor.adminClient, actor.userId);
        const customer = await runtime.stripe.customers.create({
          email: email || undefined,
          metadata: { tok_user_id: actor.userId, card_guarantee_setup_id: setup.id },
        }, { idempotencyKey: `tok:reservation-guarantee:customer:${setup.id}` });
        const baseUrl = getPublicAppBaseUrl().replace(/\/+$/, "");
        const session = await runtime.stripe.checkout.sessions.create({
          mode: "setup",
          payment_method_types: ["card"],
          customer: customer.id,
          client_reference_id: setup.id,
          success_url: `${baseUrl}/reservations?guarantee_session_id={CHECKOUT_SESSION_ID}`,
          cancel_url: `${baseUrl}/restaurant/${encodeURIComponent(restaurantId)}?open=reservation`,
          metadata: {
            checkout_kind: "reservation-card-guarantee",
            reservation_card_guarantee_setup_id: setup.id,
            user_id: actor.userId,
            restaurant_id: restaurantId,
            stripe_mode: "live",
            fee_amount_cents: String(partySize * 1000),
            policy_version: "reservation-cancellation-v1",
          },
        }, { idempotencyKey: `tok:reservation-guarantee:session:${setup.id}` });
        if (!session.url) throw new HttpError(503, "La page bancaire n'est pas disponible.");

        const { error: bindingError } = await actor.adminClient
          .from("reservation_card_guarantee_setups")
          .update({
            stripe_customer_id: customer.id,
            stripe_checkout_session_id: session.id,
            status: "checkout_ready",
            updated_at: new Date().toISOString(),
          })
          .eq("id", setup.id).eq("user_id", actor.userId).eq("status", "pending");
        if (bindingError) throw new Error("Checkout binding failed");

        return jsonResponse({
          ok: true,
          requires_card_guarantee: true,
          checkout_url: session.url,
          fee_amount_cents: partySize * 1000,
        }, 200, corsHeaders);
      } catch (setupFailure) {
        await actor.adminClient.from("reservation_card_guarantee_setups")
          .update({ status: "failed", error_code: "checkout_setup_failed" })
          .eq("id", setup.id).eq("status", "pending");
        throw setupFailure;
      }
    }

    const { data, error } = await actor.adminClient.rpc("validate_and_create_reservation_safe", {
      p_restaurant_id: restaurantId,
      p_date: date,
      p_time: time,
      p_party_size: partySize,
      p_feature: feature,
      p_metadata: {
        ...metadata,
        acquisition_source: acquisitionSource,
        ...(acquisitionChannelId ? { acquisition_channel_id: acquisitionChannelId } : {}),
        ...(acquisitionSource === "google" ? { acquisition_channel_token: acquisitionChannelToken } : {}),
        _internal_user_id: actor.userId,
      },
      p_notes: notes,
      p_progressive_offer_id: progressiveOfferId,
    });

    if (error) throw new HttpError(500, error.message);

    const result = getFirstRow<{ reservation_id: string | null; error_code: string | null; error_message: string | null }>(data);
    if (!result) throw new HttpError(500, "Réponse serveur invalide.");

    if (result.error_message) {
      return jsonResponse({
        ok: false,
        error_code: result.error_code || "validation_error",
        error_message: result.error_message,
      }, 200, corsHeaders);
    }

    if (!result.reservation_id) {
      throw new HttpError(500, "Réservation non créée.");
    }

    auditReservationId = result.reservation_id;

    const { data: reservation } = await actor.adminClient
      .from("reservations")
      .select("id, restaurant_id, date, time, party_size, feature, total_amount, notes, preorder_items")
      .eq("id", result.reservation_id)
      .maybeSingle();
    const { data: restaurant } = await actor.adminClient
      .from("restaurants")
      .select("id, owner_id, name, address, city, phone")
      .eq("id", restaurantId)
      .maybeSingle();
    const { data: profile } = await actor.adminClient
      .from("profiles")
      .select("full_name")
      .eq("user_id", actor.userId)
      .maybeSingle();

    try {
      const customerEmail = await getAuthUserEmail(actor.adminClient, actor.userId);
      const restaurantEmail = await getAuthUserEmail(actor.adminClient, restaurant?.owner_id);
      const preorderItems = Array.isArray(reservation?.preorder_items)
        ? reservation.preorder_items as Array<Record<string, unknown>>
        : [];

      await queueReservationConfirmationEmails({
        adminClient: actor.adminClient,
        appBaseUrl: getPublicAppBaseUrl(),
        reservation: {
          id: result.reservation_id,
          date: String(reservation?.date || date),
          time: String(reservation?.time || time).slice(0, 5),
          party_size: Number(reservation?.party_size || partySize),
          feature: String(reservation?.feature || feature),
          total_amount: Number(reservation?.total_amount || 0),
          notes: typeof reservation?.notes === "string" ? reservation.notes : notes,
        },
        restaurant: {
          id: restaurantId,
          name: restaurant?.name || null,
          address: restaurant?.address || null,
          city: restaurant?.city || null,
          phone: restaurant?.phone || null,
        },
        customer: {
          name: profile?.full_name || null,
          email: customerEmail,
        },
        restaurantEmail,
        featureLabel: featureLabel(String(reservation?.feature || feature), metadata),
        items: preorderItems.map((item) => ({
          name: String(item.name || "Article précommandé"),
          description: typeof item.source === "string" ? item.source : null,
          quantity: Math.max(1, Number(item.quantity || 1)),
          unitPrice: Number(item.unit_price || 0),
          totalPrice: Number(item.total_price || 0),
        })),
      });
    } catch (emailError) {
      log.error("create-reservation transactional email queue failed", {
        reservation_id: result.reservation_id,
        message: emailError instanceof Error ? emailError.message : "unknown",
      });
    }

    try {
      await triggerNotificationDispatch({ source: "create-reservation", push: true, email: true });
    } catch (dispatchError) {
      log.error("create-reservation notification dispatch failed", {
        reservation_id: result.reservation_id,
        message: dispatchError instanceof Error ? dispatchError.message : "unknown",
      });
    }

    await writeAuditLog({
      adminClient: actor.adminClient,
      actor,
      request: req,
      functionName: "create-reservation",
      action: "validate_and_create_reservation",
      status: "success",
      targetEntityType: "reservations",
      targetEntityId: result.reservation_id,
      metadata: {
        restaurant_id: restaurantId,
        feature,
        acquisition_source: acquisitionSource,
        acquisition_channel_id: acquisitionChannelId,
        progressive_offer_id: progressiveOfferId,
      },
    });

    return jsonResponse({
      ok: true,
      reservation_id: result.reservation_id,
      reservationId: result.reservation_id,
    }, 200, corsHeaders);
  } catch (error) {
    log.error("create-reservation error", { message: error instanceof Error ? error.message : "unknown" });
    await writeAuditLog({
      adminClient: actor?.adminClient || createAdminClient(),
      actor,
      request: req,
      functionName: "create-reservation",
      action: "validate_and_create_reservation",
      status: "failure",
      targetEntityType: auditReservationId ? "reservations" : auditRestaurantId ? "restaurants" : null,
      targetEntityId: auditReservationId || auditRestaurantId || null,
      errorMessage: error instanceof Error ? error.message : "Erreur interne",
    });

    if (error instanceof HttpError) {
      return jsonResponse({ error: error.message }, error.status, corsHeaders);
    }

    return jsonResponse({ error: error instanceof Error ? error.message : "Erreur interne" }, 500, corsHeaders);
  }
});

