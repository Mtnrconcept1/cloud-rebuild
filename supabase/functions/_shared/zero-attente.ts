import Stripe from "npm:stripe@18.5.0";

import {
  enqueueNotification,
  triggerNotificationDispatch,
} from "./notifications.ts";
import { recordZeroAttenteChargeIfMissing } from "./payment-transactions.ts";

type LoggerLike = {
  error?: (event: string, data?: Record<string, unknown>) => void;
  warn?: (event: string, data?: Record<string, unknown>) => void;
};

type PreorderItem = {
  menu_item_id: string;
  name: string;
  quantity: number;
  unit_price: number;
  total_price: number;
  source: string;
  metadata: {
    anti_waste_offer_id: string;
    flash_sale_id: string;
  };
};

export type FinalizedZeroAttenteCheckout = {
  reservationId: string;
  restaurantId: string;
  restaurantName: string | null;
  arrivalDate: string;
  arrivalTime: string;
  partySize: number;
  paymentMethod: string;
  subtotal: number;
  total: number;
  formulaApplied: string | null;
  formulaDiscount: number;
  formulaDiscountPercent: number;
  tokOneMember: boolean;
  tokOneDiscount: number;
  tokOneDiscountPercent: number;
  pointsToRedeem: number;
  pointsDiscount: number;
  twintPhoneNumber: string | null;
  preorderItems: PreorderItem[];
  reservationAlreadyExisted: boolean;
};

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
  pointsDiscount: number;
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
    ...(input.pointsDiscount > 0 ? [`Miamz: ${input.pointsDiscount.toFixed(2)} CHF`] : []),
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

function isZeroAttenteCheckoutKind(checkoutKind: string | null | undefined) {
  return checkoutKind === "zero-attente" || checkoutKind === "reservation_zero_attente";
}

export async function finalizeZeroAttenteCheckout(input: {
  adminClient: any;
  session: Stripe.Checkout.Session;
  userId: string;
  cardBrand?: string | null;
  cardLast4?: string | null;
  billingPhone?: string | null;
  log?: LoggerLike;
  shouldDispatchNotifications?: boolean;
  fetchLineItems: () => Promise<Stripe.ApiList<Stripe.LineItem>>;
}): Promise<FinalizedZeroAttenteCheckout> {
  const {
    adminClient,
    session,
    userId,
    cardBrand = null,
    cardLast4 = null,
    billingPhone = null,
    log,
    shouldDispatchNotifications = true,
    fetchLineItems,
  } = input;

  if (!session || session.payment_status !== "paid") {
    throw new Error("Session Stripe non payee.");
  }

  const checkoutKind = String(session.metadata?.checkout_kind || "");
  if (!isZeroAttenteCheckoutKind(checkoutKind)) {
    throw new Error("Session Stripe invalide pour Zero Attente.");
  }

  if (String(session.metadata?.user_id || "") !== userId) {
    throw new Error("Forbidden");
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
  const pointsToRedeem = Math.max(0, Number(session.metadata?.points_to_redeem || 0));
  const pointsDiscount = parseMoney(session.metadata?.points_discount_amount || session.metadata?.points_discount);
  const total = parseMoney(session.metadata?.authoritative_total, (session.amount_total || 0) / 100);
  const orderReference = String(session.metadata?.order_reference || `ZA-${Date.now()}`);

  if (!restaurantId || !arrivalDate || !arrivalTime) {
    throw new Error("Metadonnees Stripe incompletes.");
  }

  const preorderItems = buildPreorderItems(await fetchLineItems());
  const twintPhoneNumber = paymentMethod === "twint"
    ? String(session.customer_details?.phone || billingPhone || "")
    : "";

  const { data: restaurant, error: restaurantError } = await adminClient
    .from("restaurants")
    .select("owner_id, name")
    .eq("id", restaurantId)
    .maybeSingle();
  if (restaurantError) throw restaurantError;

  const note = buildReservationNote({
    count: preorderItems.reduce((sum, item) => sum + Number(item.quantity || 0), 0),
    subtotal,
    formulaDiscount,
    tokOneDiscount,
    tokOneDiscountPercent,
    pointsDiscount,
    total,
    paymentMethod,
    cardBrand,
    cardLast4,
    twintPhoneNumber,
  });

  const reservationPayload = {
    _internal_user_id: userId,
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
    points_to_redeem: pointsToRedeem,
    points_discount: pointsDiscount,
    points_discount_amount: pointsDiscount,
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
    stripe_payment_intent: typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id || null,
  };
  const storedReservationMetadata = { ...reservationPayload };
  delete storedReservationMetadata._internal_user_id;

  const { data: existingReservation } = await adminClient
    .from("reservations")
    .select("id")
    .eq("user_id", userId)
    .eq("feature", "zero-attente")
    .filter("metadata->>checkout_session_id", "eq", session.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const reservationAlreadyExisted = Boolean(existingReservation?.id);
  let reservationId = existingReservation?.id || null;

  if (reservationId) {
    await adminClient
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
    const { data: createdReservationId, error: reservationError } = await adminClient.rpc(
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
      throw new Error(reservationError?.message || "Creation de reservation Zero Attente impossible.");
    }
    reservationId = createdReservationId;
  }

  await recordZeroAttenteChargeIfMissing({
    adminClient,
    userId,
    sessionId: session.id,
    paymentIntentId: typeof session.payment_intent === "string"
      ? session.payment_intent
      : session.payment_intent?.id || null,
    amount: total,
    currency: (session.currency || "chf").toLowerCase(),
    reservationId,
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
      points_to_redeem: pointsToRedeem,
      points_discount_amount: pointsDiscount,
    },
    log,
  });

  if (pointsToRedeem > 0) {
    const { error: pointsError } = await adminClient.rpc("apply_reservation_loyalty_points", {
      p_user_id: userId,
      p_reservation_id: reservationId,
      p_points_to_redeem: pointsToRedeem,
      p_description: `Paiement Zero Attente ${orderReference}`,
    });
    if (pointsError) throw pointsError;
  }

  const zaItemCount = preorderItems.reduce((sum, item) => sum + Number(item.quantity || 0), 0);
  const { data: zaProfile } = await adminClient
    .from("profiles")
    .select("full_name")
    .eq("user_id", userId)
    .maybeSingle();

  if (!reservationAlreadyExisted && restaurant?.owner_id) {
    await enqueueNotification({
      adminClient,
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
      adminClient,
      userId,
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

    if (shouldDispatchNotifications) {
      try {
        await triggerNotificationDispatch({
          source: "zero-attente-finalization",
          push: true,
          email: true,
        });
      } catch (dispatchError) {
        log?.error?.("zero_attente_notification_dispatch_failed", {
          message: dispatchError instanceof Error ? dispatchError.message : "unknown",
        });
      }
    }
  }

  return {
    reservationId,
    restaurantId,
    restaurantName: restaurant?.name || null,
    arrivalDate,
    arrivalTime,
    partySize,
    paymentMethod,
    subtotal,
    total,
    formulaApplied: String(session.metadata?.formula_applied || "") || null,
    formulaDiscount,
    formulaDiscountPercent,
    tokOneMember,
    tokOneDiscount,
    tokOneDiscountPercent,
    pointsToRedeem,
    pointsDiscount,
    twintPhoneNumber: twintPhoneNumber || null,
    preorderItems,
    reservationAlreadyExisted,
  };
}
