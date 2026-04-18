import Stripe from "npm:stripe@18.5.0";

import {
  HttpError,
  authenticateRequest,
  createAdminClient,
  getEnv,
  jsonResponse,
  writeAuditLog,
} from "../_shared/auth.ts";
import {
  enqueueNotification,
  triggerNotificationDispatch,
} from "../_shared/notifications.ts";
import { buildCorsHeaders, handleCorsPreflight } from "../_shared/cors.ts";
import { makeLogger } from "../_shared/logging.ts";

function parseMoney(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function buildReservationNote(input: {
  count: number;
  subtotal: number;
  formulaDiscount: number;
  tokOneDiscount: number;
  tokOneDiscountPercent: number;
  total: number;
  paymentMethod: string;
  cardBrand?: string | null;
  cardLast4?: string | null;
  twintPhoneNumber?: string | null;
}) {
  const parts = [
    `[Zero Attente] ${input.count} plat(s) precommande(s)`,
    `Sous-total: ${input.subtotal.toFixed(2)} CHF`,
    `Reduction formule: ${input.formulaDiscount.toFixed(2)} CHF`,
    ...(input.tokOneDiscount > 0
      ? [`Reduction Tok One${input.tokOneDiscountPercent > 0 ? ` (${input.tokOneDiscountPercent.toFixed(0)}%)` : ""}: ${input.tokOneDiscount.toFixed(2)} CHF`]
      : []),
    `Total: ${input.total.toFixed(2)} CHF`,
    `Paiement: ${input.paymentMethod} (paye)`,
  ];

  if (input.cardBrand || input.cardLast4) {
    parts.push(
      `Carte: ${[input.cardBrand, input.cardLast4 ? `**** ${input.cardLast4}` : ""].filter(Boolean).join(" ")}`,
    );
  }

  if (input.twintPhoneNumber) {
    parts.push(`TWINT: ${input.twintPhoneNumber}`);
  }

  return parts.join(" - ");
}

function buildPreorderItems(lineItems: Stripe.ApiList<Stripe.LineItem>) {
  return lineItems.data
    .filter((lineItem) => {
      const name = String(lineItem.description || "").toLowerCase();
      return name !== "frais de livraison" && name !== "garantie qualite";
    })
    .map((lineItem) => {
      const product = lineItem.price?.product && typeof lineItem.price.product === "object"
        ? lineItem.price.product
        : null;
      const productMetadata = product?.metadata || {};
      const quantity = Math.max(1, Number(lineItem.quantity || 1));
      const unitAmount = parseMoney(lineItem.price?.unit_amount, 0) / 100;

      return {
        menu_item_id: String(productMetadata.menu_item_id || ""),
        name: lineItem.description || product?.name || "Article",
        quantity,
        unit_price: unitAmount,
        total_price: unitAmount * quantity,
        source: String(productMetadata.source || "menu_item"),
        metadata: {
          anti_waste_offer_id: String(productMetadata.anti_waste_offer_id || ""),
          flash_sale_id: String(productMetadata.flash_sale_id || ""),
        },
      };
    });
}

Deno.serve(async (req) => {
  const corsHeaders = buildCorsHeaders(req);
  const preflight = handleCorsPreflight(req, corsHeaders);
  if (preflight) return preflight;

  const log = makeLogger("create-zero-attente-reservation");

  let actor: Awaited<ReturnType<typeof authenticateRequest>> | null = null;
  let sessionId = "";

  try {
    actor = await authenticateRequest(req, { allowServiceRole: false });
    if (!actor.userId) {
      throw new HttpError(401, "Unauthorized");
    }

    const body = await req.json().catch(() => ({}));
    sessionId = typeof body?.session_id === "string" ? body.session_id.trim() : "";
    if (!sessionId) {
      throw new HttpError(400, "session_id requis");
    }

    const stripeSecretKey = getEnv("STRIPE_SECRET_KEY");
    if (!stripeSecretKey) {
      throw new HttpError(503, "STRIPE_SECRET_KEY not configured");
    }

    const stripe = new Stripe(stripeSecretKey, {
      apiVersion: "2025-08-27.basil",
    });

    const session = await stripe.checkout.sessions.retrieve(sessionId, {
      expand: ["payment_intent.payment_method"],
    });

    if (!session || session.payment_status !== "paid") {
      throw new HttpError(400, "Session Stripe non payee.");
    }

    const checkoutKind = String(session.metadata?.checkout_kind || "");
    if (!["zero-attente", "reservation_zero_attente"].includes(checkoutKind)) {
      throw new HttpError(400, "Session Stripe invalide pour Zero Attente.");
    }

    if (String(session.metadata?.user_id || "") !== actor.userId) {
      throw new HttpError(403, "Forbidden");
    }

    const restaurantId = String(session.metadata?.restaurant_id || "");
    const arrivalDate = String(session.metadata?.arrival_date || "");
    const arrivalTime = String(session.metadata?.arrival_time || "");
    const partySize = Math.max(1, Number(session.metadata?.party_size || 1));
    const paymentMethod = String(session.metadata?.payment_method_label || "card");
    const subtotal = parseMoney(session.metadata?.pre_discount_subtotal);
    const formulaDiscount = parseMoney(session.metadata?.formula_discount_amount);
    const formulaDiscountPercent = parseMoney(session.metadata?.formula_discount_percent);
    const tokOneDiscount = parseMoney(session.metadata?.tok_one_discount_amount);
    const tokOneDiscountPercent = parseMoney(session.metadata?.tok_one_discount_percent);
    const tokOneDeliverySaved = parseMoney(session.metadata?.tok_one_delivery_saved);
    const tokOneTotalSaved = parseMoney(
      session.metadata?.tok_one_total_saved,
      tokOneDiscount + tokOneDeliverySaved,
    );
    const tokOneMember = String(session.metadata?.tok_one_member || "").toLowerCase() === "true";
    const total = parseMoney(session.metadata?.authoritative_total, (session.amount_total || 0) / 100);
    const orderReference = String(session.metadata?.order_reference || `ZA-${Date.now()}`);

    if (!restaurantId || !arrivalDate || !arrivalTime) {
      throw new HttpError(400, "Metadonnees Stripe incompletes.");
    }

    const lineItems = await stripe.checkout.sessions.listLineItems(session.id, {
      limit: 100,
      expand: ["data.price.product"],
    });
    const preorderItems = buildPreorderItems(lineItems);

    const paymentMethodData = session.payment_intent && typeof session.payment_intent === "object"
      ? (session.payment_intent.payment_method as Stripe.PaymentMethod | null)
      : null;
    const cardBrand = paymentMethodData?.card?.brand || null;
    const cardLast4 = paymentMethodData?.card?.last4 || null;
    const billingPhone = paymentMethodData?.billing_details?.phone || null;
    const twintPhoneNumber = paymentMethod === "twint"
      ? String(session.customer_details?.phone || billingPhone || "")
      : "";

    const { data: restaurant, error: restaurantError } = await actor.adminClient
      .from("restaurants")
      .select("owner_id, name")
      .eq("id", restaurantId)
      .maybeSingle();
    if (restaurantError) {
      throw new HttpError(500, restaurantError.message);
    }

    const note = buildReservationNote({
      count: preorderItems.reduce((sum, item) => sum + Number(item.quantity || 0), 0),
      subtotal,
      formulaDiscount,
      tokOneDiscount,
      tokOneDiscountPercent,
      total,
      paymentMethod,
      cardBrand,
      cardLast4,
      twintPhoneNumber,
    });

    const reservationPayload = {
      _internal_user_id: actor.userId,
      feature: "zero-attente",
      preorder_items: preorderItems,
      pre_discount_subtotal: subtotal,
      formula_applied: String(session.metadata?.formula_applied || "") || null,
      formula_discount_amount: formulaDiscount,
      formula_discount_percent: formulaDiscountPercent,
      tok_one_member: tokOneMember,
      tok_one_discount_amount: tokOneDiscount,
      tok_one_discount_percent: tokOneDiscountPercent,
      tok_one_delivery_saved: tokOneDeliverySaved,
      tok_one_total_saved: tokOneTotalSaved,
      total_amount: total,
      arrival_date: arrivalDate,
      arrival_time: arrivalTime,
      payment_method: paymentMethod,
      checkout_session_id: session.id,
      paid: true,
      card_brand: cardBrand,
      card_last4: cardLast4,
      twint_phone_number: twintPhoneNumber || null,
      order_reference: orderReference,
    };
    const storedReservationMetadata = { ...reservationPayload };
    delete storedReservationMetadata._internal_user_id;

    const { data: existingReservation } = await actor.adminClient
      .from("reservations")
      .select("id")
      .eq("user_id", actor.userId)
      .eq("feature", "zero-attente")
      .filter("metadata->>checkout_session_id", "eq", session.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const reservationAlreadyExisted = Boolean(existingReservation?.id);
    let reservationId = existingReservation?.id || null;

    if (reservationId) {
      await actor.adminClient
        .from("reservations")
        .update({
          status: "confirmed",
          total_amount: total,
          payment_method: paymentMethod,
          preorder_items: preorderItems,
          notes: note,
          metadata: storedReservationMetadata,
          updated_at: new Date().toISOString(),
        })
        .eq("id", reservationId);
    } else {
      const { data: createdReservationId, error: reservationError } = await actor.adminClient.rpc(
        "validate_and_create_reservation",
        {
          p_restaurant_id: restaurantId,
          p_date: arrivalDate,
          p_time: arrivalTime,
          p_party_size: partySize,
          p_feature: "zero-attente",
          p_metadata: reservationPayload,
          p_notes: note,
        },
      );

      if (reservationError || !createdReservationId) {
        throw new HttpError(500, reservationError?.message || "Creation de reservation impossible.");
      }
      reservationId = createdReservationId;
    }

    const { data: existingTransaction } = await actor.adminClient
      .from("payment_transactions")
      .select("id")
      .eq("stripe_checkout_session_id", session.id)
      .eq("type", "charge")
      .maybeSingle();

    if (!existingTransaction) {
      await actor.adminClient.from("payment_transactions").insert({
        user_id: actor.userId,
        stripe_checkout_session_id: session.id,
        stripe_payment_intent_id: typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id || null,
        amount: total,
        currency: (session.currency || "chf").toLowerCase(),
        type: "charge",
        status: "succeeded",
        metadata: {
          reservation_id: reservationId,
          feature: "zero-attente",
          restaurant_id: restaurantId,
          payment_method: paymentMethod,
          card_brand: cardBrand,
          card_last4: cardLast4,
          twint_phone_number: twintPhoneNumber || null,
          tok_one_member: tokOneMember,
          tok_one_discount_amount: tokOneDiscount,
          tok_one_discount_percent: tokOneDiscountPercent,
          tok_one_delivery_saved: tokOneDeliverySaved,
          tok_one_total_saved: tokOneTotalSaved,
        },
      });
    }

    const zaItemCount = preorderItems.reduce((sum: number, item: { quantity: number }) => sum + Number(item.quantity || 0), 0);

    const { data: zaProfile } = await actor.adminClient
      .from("profiles")
      .select("full_name")
      .eq("user_id", actor.userId)
      .maybeSingle();

    if (!reservationAlreadyExisted && restaurant?.owner_id) {
      await enqueueNotification({
        adminClient: actor.adminClient,
        userId: restaurant.owner_id,
        title: "Nouvelle reservation Zero Attente",
        body: `${zaProfile?.full_name || "Client"} - ${partySize} convive(s) le ${arrivalDate} a ${arrivalTime} - ${zaItemCount} plat(s) - ${total.toFixed(2)} CHF`,
        type: "reservation",
        category: "transactional",
        data: {
          reservation_id: reservationId,
          restaurant_id: restaurantId,
          restaurant_name: restaurant.name,
          customer_name: zaProfile?.full_name || null,
          party_size: partySize,
          arrival_date: arrivalDate,
          arrival_time: arrivalTime,
          items_count: zaItemCount,
          total_amount: total,
          feature: "zero-attente",
          url: "/dashboard/reservations",
        },
      });
    }

    if (!reservationAlreadyExisted) {
      await enqueueNotification({
        adminClient: actor.adminClient,
        userId: actor.userId,
        title: "Reservation confirmee et payee",
        body: `Votre table chez ${restaurant?.name || "le restaurant"} est reservee le ${arrivalDate} a ${arrivalTime} pour ${partySize} convive(s). ${zaItemCount} plat(s) precommande(s) - ${total.toFixed(2)} CHF.`,
        type: "reservation",
        category: "transactional",
        data: {
          reservation_id: reservationId,
          restaurant_id: restaurantId,
          restaurant_name: restaurant?.name || null,
          party_size: partySize,
          arrival_date: arrivalDate,
          arrival_time: arrivalTime,
          items_count: zaItemCount,
          total_amount: total,
          feature: "zero-attente",
          url: "/reservations",
        },
      });
      try {
        await triggerNotificationDispatch({
          source: "create-zero-attente-reservation",
          push: true,
          email: true,
        });
      } catch (dispatchError) {
        log.error("create-zero-attente-reservation notification dispatch failed", { message: dispatchError instanceof Error ? dispatchError.message : "unknown" });
      }
    }

    await writeAuditLog({
      adminClient: actor.adminClient,
      actor,
      request: req,
      functionName: "create-zero-attente-reservation",
      action: "create_zero_attente_reservation",
      status: "success",
      targetEntityType: "reservations",
      targetEntityId: String(reservationId),
      metadata: {
        restaurant_id: restaurantId,
        stripe_session_id: session.id,
      },
    });

    return jsonResponse({
      reservation_id: reservationId,
      restaurant_id: restaurantId,
      restaurant_name: restaurant?.name || null,
      arrival_date: arrivalDate,
      arrival_time: arrivalTime,
      party_size: partySize,
      payment_method: paymentMethod,
      pre_discount_subtotal: subtotal,
      total_amount: total,
      formula_applied: String(session.metadata?.formula_applied || "") || null,
      formula_discount_amount: formulaDiscount,
      formula_discount_percent: formulaDiscountPercent,
      tok_one_member: tokOneMember,
      tok_one_discount_amount: tokOneDiscount,
      tok_one_discount_percent: tokOneDiscountPercent,
      twint_phone_number: twintPhoneNumber || null,
      preorder_items: preorderItems,
    }, 200, corsHeaders);
  } catch (error) {
    log.error("create-zero-attente-reservation error", { message: error instanceof Error ? error.message : "unknown" });
    await writeAuditLog({
      adminClient: actor?.adminClient || createAdminClient(),
      actor,
      request: req,
      functionName: "create-zero-attente-reservation",
      action: "create_zero_attente_reservation",
      status: "failure",
      targetEntityType: sessionId ? "stripe_session" : "reservations",
      targetEntityId: sessionId || null,
      errorMessage: error instanceof Error ? error.message : "Erreur interne",
    });

    if (error instanceof HttpError) {
      return jsonResponse({ error: error.message }, error.status, corsHeaders);
    }

    return jsonResponse(
      { error: error instanceof Error ? error.message : "Erreur interne" },
      500,
      corsHeaders,
    );
  }
});
