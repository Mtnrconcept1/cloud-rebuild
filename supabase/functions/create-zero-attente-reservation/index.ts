import Stripe from "npm:stripe@18.5.0";

import {
  HttpError,
  authenticateRequest,
  createAdminClient,
  jsonResponse,
  writeAuditLog,
} from "../_shared/auth.ts";
import {
  enqueueNotification,
  triggerNotificationDispatch,
} from "../_shared/notifications.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function parseMoney(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function buildReservationNote(input: {
  count: number;
  subtotal: number;
  formulaDiscount: number;
  total: number;
  paymentMethod: string;
}) {
  return [
    `[Zero Attente] ${input.count} plat(s) precommande(s)`,
    `Sous-total: ${input.subtotal.toFixed(2)} CHF`,
    `Reduction: ${input.formulaDiscount.toFixed(2)} CHF`,
    `Total: ${input.total.toFixed(2)} CHF`,
    `Paiement: ${input.paymentMethod} (paye)`,
  ].join(" - ");
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
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

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

    const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, {
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
      total,
      paymentMethod,
    });

    const { data: reservationId, error: reservationError } = await actor.adminClient.rpc(
      "validate_and_create_reservation",
      {
        p_restaurant_id: restaurantId,
        p_date: arrivalDate,
        p_time: arrivalTime,
        p_party_size: partySize,
        p_feature: "zero-attente",
        p_metadata: {
          _internal_user_id: actor.userId,
          feature: "zero-attente",
          preorder_items: preorderItems,
          pre_discount_subtotal: subtotal,
          formula_applied: String(session.metadata?.formula_applied || "") || null,
          formula_discount_amount: formulaDiscount,
          formula_discount_percent: formulaDiscountPercent,
          total_amount: total,
          arrival_date: arrivalDate,
          arrival_time: arrivalTime,
          payment_method: paymentMethod,
          checkout_session_id: session.id,
          paid: true,
          card_brand: cardBrand,
          card_last4: cardLast4,
          order_reference: orderReference,
        },
        p_notes: note,
      },
    );

    if (reservationError || !reservationId) {
      throw new HttpError(500, reservationError?.message || "Creation de reservation impossible.");
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
          card_brand: cardBrand,
          card_last4: cardLast4,
        },
      });
    }

    const zaItemCount = preorderItems.reduce((sum: number, item: { quantity: number }) => sum + Number(item.quantity || 0), 0);

    const { data: zaProfile } = await actor.adminClient
      .from("profiles")
      .select("full_name")
      .eq("user_id", actor.userId)
      .maybeSingle();

    if (restaurant?.owner_id) {
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
      console.error("create-zero-attente-reservation notification dispatch failed:", dispatchError);
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
      preorder_items: preorderItems,
    }, 200, corsHeaders);
  } catch (error) {
    console.error("create-zero-attente-reservation error:", error);
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
