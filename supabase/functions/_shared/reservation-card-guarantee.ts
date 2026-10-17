import { nativeStripeMode } from "./isolated-test-environment.ts";
import type Stripe from "npm:stripe@22.3.2";

import { HttpError } from "./auth.ts";
import { triggerNotificationDispatch } from "./notifications.ts";
import { queueReservationConfirmationEmails } from "./transactional-emails.ts";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type GuaranteeSetup = {
  id: string;
  user_id: string;
  restaurant_id: string;
  status: string;
  reservation_id: string | null;
  stripe_customer_id: string | null;
  stripe_checkout_session_id: string | null;
};

type GuaranteeFinalizeRow = {
  reservation_id: string | null;
  error_code: string | null;
  error_message: string | null;
  newly_confirmed: boolean | null;
};

function stripeId(input: string | { id: string } | null | undefined) {
  return typeof input === "string" ? input : input?.id || null;
}

function appBaseUrl() {
  return (Deno.env.get("PUBLIC_APP_URL")
    || Deno.env.get("APP_BASE_URL")
    || Deno.env.get("SITE_URL")
    || "https://www.thetok.ch").replace(/\/+$/, "");
}

async function sendReservationConfirmation(adminClient: any, reservationId: string, userId: string) {
  const { data: reservation, error: reservationError } = await adminClient
    .from("reservations")
    .select("id, restaurant_id, date, time, party_size, feature, total_amount, notes, preorder_items")
    .eq("id", reservationId)
    .maybeSingle();
  if (reservationError || !reservation) throw new Error("Reservation confirmation lookup failed");

  const [{ data: restaurant }, { data: profile }] = await Promise.all([
    adminClient.from("restaurants")
      .select("id, owner_id, name, address, city, phone")
      .eq("id", reservation.restaurant_id).maybeSingle(),
    adminClient.from("profiles").select("full_name").eq("user_id", userId).maybeSingle(),
  ]);
  const [{ data: customer }, { data: restaurantOwner }] = await Promise.all([
    adminClient.auth.admin.getUserById(userId),
    restaurant?.owner_id ? adminClient.auth.admin.getUserById(restaurant.owner_id) : Promise.resolve({ data: null }),
  ]);
  const items = Array.isArray(reservation.preorder_items)
    ? reservation.preorder_items as Array<Record<string, unknown>>
    : [];
  await queueReservationConfirmationEmails({
    adminClient,
    appBaseUrl: appBaseUrl(),
    reservation: {
      id: reservation.id,
      date: String(reservation.date),
      time: String(reservation.time).slice(0, 5),
      party_size: Number(reservation.party_size),
      feature: String(reservation.feature),
      total_amount: Number(reservation.total_amount || 0),
      notes: typeof reservation.notes === "string" ? reservation.notes : null,
    },
    restaurant: {
      id: reservation.restaurant_id,
      name: restaurant?.name || null,
      address: restaurant?.address || null,
      city: restaurant?.city || null,
      phone: restaurant?.phone || null,
    },
    customer: {
      name: profile?.full_name || null,
      email: customer?.user?.email || null,
    },
    restaurantEmail: restaurantOwner?.user?.email || null,
    featureLabel: String(reservation.feature) === "promo-progressive"
      ? "Offre progressive"
      : String(reservation.feature) === "promo-formule"
        ? "Formule"
        : "Réservation classique",
    items: items.map((item) => ({
      name: String(item.name || "Article précommandé"),
      description: typeof item.source === "string" ? item.source : null,
      quantity: Math.max(1, Number(item.quantity || 1)),
      unitPrice: Number(item.unit_price || 0),
      totalPrice: Number(item.total_price || 0),
    })),
  });
  await triggerNotificationDispatch({
    source: "reservation-card-guarantee",
    push: true,
    email: true,
  });
}

/**
 * Both the Stripe webhook and the customer's return URL call this helper.
 * Stripe's completed Checkout + succeeded SetupIntent are checked before the
 * service-role-only SQL finalizer atomically inserts exactly one reservation.
 *
 * Never trust a session id or PaymentMethod id supplied by a browser.
 */
export async function finalizeReservationCardGuarantee(input: {
  adminClient: any;
  stripe: Stripe;
  checkoutSessionId: string;
  authenticatedUserId?: string | null;
}) {
  if (!new RegExp(`^cs_${nativeStripeMode()}_[a-zA-Z0-9_]+$`).test(input.checkoutSessionId)) {
    throw new HttpError(400, "Session Stripe invalide.");
  }
  const session = await input.stripe.checkout.sessions.retrieve(input.checkoutSessionId);
  const setupId = session.metadata?.reservation_card_guarantee_setup_id || "";
  const checkoutKind = session.metadata?.checkout_kind || "";
  if (!UUID_PATTERN.test(setupId)
    || checkoutKind !== "reservation-card-guarantee"
    || session.mode !== "setup"
    || session.status !== "complete"
    || (session as Stripe.Checkout.Session & { livemode?: boolean }).livemode !== (nativeStripeMode() === "live")) {
    throw new HttpError(409, "Garantie bancaire Stripe non validée.");
  }

  const { data: setup, error: lookupError } = await input.adminClient
    .from("reservation_card_guarantee_setups")
    .select("id, user_id, restaurant_id, status, reservation_id, stripe_customer_id, stripe_checkout_session_id")
    .eq("id", setupId)
    .maybeSingle();
  if (lookupError || !setup) throw new HttpError(404, "Garantie bancaire introuvable.");
  const row = setup as GuaranteeSetup;
  if (input.authenticatedUserId && row.user_id !== input.authenticatedUserId) {
    throw new HttpError(403, "Cette garantie bancaire appartient à un autre client.");
  }
  if (row.stripe_checkout_session_id !== session.id
    || !row.stripe_customer_id
    || stripeId(session.customer) !== row.stripe_customer_id
    || session.metadata?.user_id !== row.user_id
    || session.metadata?.restaurant_id !== row.restaurant_id) {
    throw new HttpError(409, "La session Stripe ne correspond pas à la réservation.");
  }

  if (row.status === "confirmed" && row.reservation_id) {
    return { ok: true as const, reservationId: row.reservation_id, alreadyConfirmed: true };
  }
  if (row.status !== "checkout_ready") {
    throw new HttpError(409, "Cette garantie bancaire ne peut plus être validée.");
  }

  const setupIntentId = stripeId(session.setup_intent);
  if (!setupIntentId) throw new HttpError(409, "Vérification de carte incomplète.");
  const setupIntent = await input.stripe.setupIntents.retrieve(setupIntentId);
  const paymentMethodId = stripeId(setupIntent.payment_method);
  if (setupIntent.status !== "succeeded" || !paymentMethodId
    || stripeId(setupIntent.customer) !== row.stripe_customer_id) {
    throw new HttpError(409, "La carte n'a pas été authentifiée par Stripe.");
  }
  const paymentMethod = await input.stripe.paymentMethods.retrieve(paymentMethodId);
  if (paymentMethod.type !== "card" || stripeId(paymentMethod.customer) !== row.stripe_customer_id) {
    throw new HttpError(409, "La carte enregistrée ne correspond pas au client.");
  }

  const { data, error } = await input.adminClient.rpc("finalize_reservation_card_guarantee", {
    p_setup_id: setupId,
    p_checkout_session_id: session.id,
    p_customer_id: row.stripe_customer_id,
    p_setup_intent_id: setupIntent.id,
    p_payment_method_id: paymentMethod.id,
  });
  if (error) throw new HttpError(500, "Erreur de confirmation bancaire.");
  const result = (Array.isArray(data) ? data[0] : data) as GuaranteeFinalizeRow | null;
  if (!result?.reservation_id) {
    return {
      ok: false as const,
      errorCode: result?.error_code || "reservation_unavailable",
      errorMessage: result?.error_message || "Le créneau n'est plus disponible. Aucun montant n'a été prélevé.",
    };
  }

  if (result.newly_confirmed) {
    try {
      await sendReservationConfirmation(input.adminClient, result.reservation_id, row.user_id);
    } catch (error) {
      console.error("[reservation-card-guarantee] reservation confirmation notification failed", {
        reservation_id: result.reservation_id,
        reason: error instanceof Error ? error.name : "unknown",
      });
    }
  }
  return {
    ok: true as const,
    reservationId: result.reservation_id,
    alreadyConfirmed: !result.newly_confirmed,
  };
}
