import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Stripe from "npm:stripe@18.5.0";
import { getEnv, writeAuditLog } from "../_shared/auth.ts";
import { makeLogger } from "../_shared/logging.ts";
import { finalizeChefsTableCheckout } from "../_shared/chefs-table.ts";
import {
  enqueueNotification,
  triggerNotificationDispatch,
} from "../_shared/notifications.ts";
import {
  allocateAmounts,
  finalizePaidOrderCheckout,
  getStripePaymentMethodDetails,
  markOrderCheckoutSessionState,
} from "../_shared/order-checkout.ts";
import { recordZeroAttenteChargeIfMissing } from "../_shared/payment-transactions.ts";
import {
  isTokOneEntitledStatus,
  syncTokOneSubscriptionRecord,
} from "../_shared/tok-one.ts";
import { computeDisabledDashboardFeatures } from "../_shared/pack-entitlements.ts";

type JsonRecord = Record<string, unknown>;

type PaymentTransactionRow = {
  order_id: string | null;
  user_id: string | null;
  metadata?: JsonRecord | null;
  amount?: number | null;
};

type LoggerLike = {
  error?: (event: string, data?: Record<string, unknown>) => void;
};

function isJsonRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function getCampaignId(metadata: unknown) {
  return isJsonRecord(metadata) && typeof metadata.campaign_id === "string"
    ? metadata.campaign_id
    : null;
}

function parseMoney(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function splitWebhookSecrets(value: string | null) {
  if (!value) return [];

  return value
    .split(/[,\n]/)
    .map((secret) => secret.trim())
    .filter(Boolean);
}

function getStripeWebhookSecrets() {
  return Array.from(
    new Set([
      ...splitWebhookSecrets(getEnv("STRIPE_WEBHOOK_SECRET")),
      ...splitWebhookSecrets(getEnv("STRIPE_WEBHOOK_SIGNING_SECRET")),
    ]),
  );
}

async function recordTokOnePaymentIfMissing(input: {
  adminClient: ReturnType<typeof createClient>;
  session: Stripe.Checkout.Session;
  userId: string;
  planId: string;
  billingPeriod: string;
  stripeSubscriptionId: string | null;
  eventId: string;
  log?: LoggerLike;
}) {
  const {
    adminClient,
    session,
    userId,
    planId,
    billingPeriod,
    stripeSubscriptionId,
    eventId,
    log,
  } = input;

  const amount = (session.amount_total || 0) / 100;
  if (amount <= 0) return;

  const { data: existingTransaction, error: existingTransactionError } = await adminClient
    .from("payment_transactions")
    .select("id")
    .eq("stripe_checkout_session_id", session.id)
    .eq("type", "subscription")
    .eq("status", "succeeded")
    .limit(1)
    .maybeSingle();

  if (existingTransactionError) {
    log?.error?.("tok_one_payment_check_failed", { message: existingTransactionError.message });
    return;
  }

  if (existingTransaction?.id) return;

  await adminClient
    .from("payment_transactions")
    .insert({
      order_id: null,
      user_id: userId,
      stripe_checkout_session_id: session.id,
      stripe_payment_intent_id: typeof session.payment_intent === "string" ? session.payment_intent : null,
      amount,
      currency: (session.currency || "chf").toLowerCase(),
      type: "subscription",
      status: "succeeded",
      metadata: {
        checkout_kind: "tok-one",
        plan_id: planId,
        billing_period: billingPeriod,
        stripe_subscription_id: stripeSubscriptionId,
        stripe_event_id: eventId,
      },
    });
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
  cardBrand?: string;
  cardLast4?: string;
  twintPhoneNumber?: string;
}) {
  const parts = [
    `[Zero Attente] ${input.count} plat(s) precommande(s)`,
    `Sous-total: ${input.subtotal.toFixed(2)} CHF`,
    `Reduction formule: ${input.formulaDiscount.toFixed(2)} CHF`,
    ...(input.tokOneDiscount > 0
      ? [`Reduction Tok One${input.tokOneDiscountPercent > 0 ? ` (${input.tokOneDiscountPercent.toFixed(0)}%)` : ""}: ${input.tokOneDiscount.toFixed(2)} CHF`]
      : []),
    ...(input.pointsDiscount > 0
      ? [`Miamz: ${input.pointsDiscount.toFixed(2)} CHF`]
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

function isZeroAttenteCheckoutKind(checkoutKind: string | null | undefined) {
  return checkoutKind === "zero-attente" || checkoutKind === "reservation_zero_attente";
}

Deno.serve(async (req) => {
  const log = makeLogger("stripe-webhook");

  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const stripeSecretKey = getEnv("STRIPE_SECRET_KEY");
  if (!stripeSecretKey) {
    return new Response("STRIPE_SECRET_KEY not configured", { status: 503 });
  }

  const stripe = new Stripe(stripeSecretKey, {
    apiVersion: "2025-08-27.basil",
  });

  const supabaseAdmin = createClient(
    getEnv("SUPABASE_URL"),
    getEnv("SUPABASE_SERVICE_ROLE_KEY"),
  );

  const body = await req.text();
  const signature = req.headers.get("stripe-signature");
  const webhookSecrets = getStripeWebhookSecrets();

  if (webhookSecrets.length === 0) {
    await writeAuditLog({
      adminClient: supabaseAdmin,
      actor: { roles: ["service_role"], isServiceRole: true },
      request: req,
      functionName: "stripe-webhook",
      action: "verify_signature",
      status: "failure",
      targetEntityType: "stripe_event",
      errorMessage: "STRIPE_WEBHOOK_SECRET not configured",
    });
    return new Response("STRIPE_WEBHOOK_SECRET not configured", { status: 503 });
  }

  if (!signature) {
    await writeAuditLog({
      adminClient: supabaseAdmin,
      actor: { roles: ["service_role"], isServiceRole: true },
      request: req,
      functionName: "stripe-webhook",
      action: "verify_signature",
      status: "failure",
      targetEntityType: "stripe_event",
      errorMessage: "Missing stripe-signature header",
    });
    return new Response("Missing stripe signature", { status: 400 });
  }

  let event: Stripe.Event;
  let signatureError: unknown = null;
  try {
    let verifiedEvent: Stripe.Event | null = null;

    for (const webhookSecret of webhookSecrets) {
      try {
        verifiedEvent = await stripe.webhooks.constructEventAsync(
          body,
          signature,
          webhookSecret,
        );
        break;
      } catch (error) {
        signatureError = error;
      }
    }

    if (!verifiedEvent) {
      throw signatureError ?? new Error("Invalid webhook signature");
    }

    event = verifiedEvent;
  } catch (error) {
    log.warn("signature_verification_failed", { message: error instanceof Error ? error.message : "unknown" });
    await writeAuditLog({
      adminClient: supabaseAdmin,
      actor: { roles: ["service_role"], isServiceRole: true },
      request: req,
      functionName: "stripe-webhook",
      action: "verify_signature",
      status: "failure",
      targetEntityType: "stripe_event",
      errorMessage: error instanceof Error ? error.message : "Invalid webhook signature",
    });
    return new Response("Invalid webhook signature", { status: 400 });
  }

  // Idempotency: skip duplicate Stripe events (replays, retries).
  const { data: existingEvent } = await supabaseAdmin
    .from("stripe_webhook_events")
    .select("event_id")
    .eq("event_id", event.id)
    .maybeSingle();

  if (existingEvent) {
    log.info("duplicate_event_skipped", { eventId: event.id, type: event.type });
    return new Response(JSON.stringify({ received: true, duplicate: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Record the event ID before processing so concurrent retries are also blocked.
  await supabaseAdmin
    .from("stripe_webhook_events")
    .insert({ event_id: event.id, event_type: event.type, livemode: event.livemode });

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        const checkoutKind = String(session.metadata?.checkout_kind || "order");
        const userId = session.metadata?.user_id || null;
        const campaignId = session.metadata?.campaign_id || null;

        if (checkoutKind === "campaign" && campaignId) {
          const { cardBrand, cardLast4 } = await getStripePaymentMethodDetails(stripe, session, log);
          const { data: campaign } = await supabaseAdmin
            .from("ad_campaigns")
            .select("id, restaurant_id, title")
            .eq("id", campaignId)
            .maybeSingle();

          if (campaign) {
            await supabaseAdmin
              .from("ad_campaigns")
              .update({
                status: "active",
                payment_status: "paid",
                payment_method: session.metadata?.payment_method_label || null,
                paid_amount: (session.amount_total || 0) / 100,
                stripe_checkout_session_id: session.id,
                stripe_payment_intent_id: typeof session.payment_intent === "string" ? session.payment_intent : null,
                paid_at: new Date().toISOString(),
                activated_at: new Date().toISOString(),
              })
              .eq("id", campaign.id);

            await supabaseAdmin.from("payment_transactions").insert({
              user_id: userId,
              stripe_checkout_session_id: session.id,
              stripe_payment_intent_id: typeof session.payment_intent === "string" ? session.payment_intent : null,
              amount: (session.amount_total || 0) / 100,
              currency: (session.currency || "chf").toLowerCase(),
              type: "charge",
              status: "succeeded",
              metadata: {
                campaign_id: campaign.id,
                campaign_title: campaign.title,
                restaurant_id: campaign.restaurant_id,
                checkout_kind: "campaign",
                card_brand: cardBrand,
                card_last4: cardLast4,
              },
            });

            const paidAmount = ((session.amount_total || 0) / 100).toFixed(2);
            const paymentMethodLabel = session.metadata?.payment_method_label || "carte";

            const { data: campaignRestaurant } = await supabaseAdmin
              .from("restaurants")
              .select("owner_id, name")
              .eq("id", campaign.restaurant_id)
              .maybeSingle();

            if (campaignRestaurant?.owner_id) {
              await enqueueNotification({
                adminClient: supabaseAdmin,
                userId: campaignRestaurant.owner_id,
                title: "Paiement de campagne confirme",
                body: `Votre campagne "${campaign.title}" a ete payee avec succes (${paidAmount} CHF via ${paymentMethodLabel}). Elle est maintenant active.`,
                type: "campaign",
                category: "transactional",
                data: {
                  campaign_id: campaign.id,
                  restaurant_id: campaign.restaurant_id,
                  restaurant_name: campaignRestaurant.name,
                  paid_amount: paidAmount,
                  payment_method: paymentMethodLabel,
                  url: "/dashboard/campagnes",
                },
              });
            }

            try {
              await triggerNotificationDispatch({ source: "stripe-webhook-campaign-paid", push: true, email: true });
            } catch (error) {
              log.error("campaign_notification_failed", { message: error instanceof Error ? error.message : "unknown" });
            }
          }
          break;
        }

        if (checkoutKind === "tok-one") {
          const userId = session.metadata?.user_id || null;
          const planId = session.metadata?.plan_id || null;
          const billingPeriod = session.metadata?.billing_period || "monthly";

          if (!userId || !planId) {
            log.warn("tok_one_missing_metadata", { sessionId: session.id });
            break;
          }

          let stripeSubscription: Stripe.Subscription | null = null;
          if (typeof session.subscription === "string") {
            stripeSubscription = await stripe.subscriptions.retrieve(session.subscription);
            await syncTokOneSubscriptionRecord({
              adminClient: supabaseAdmin,
              subscription: stripeSubscription,
              fallbackUserId: userId,
              fallbackPlanId: planId,
            });
          } else {
            log.warn("tok_one_no_subscription", { sessionId: session.id });
          }

          await recordTokOnePaymentIfMissing({
            adminClient: supabaseAdmin,
            session,
            userId,
            planId,
            billingPeriod,
            stripeSubscriptionId: stripeSubscription?.id || null,
            eventId: event.id,
            log,
          });

          // Notify user
          try {
            const isTrialing = stripeSubscription?.status === "trialing";
            await enqueueNotification({
              adminClient: supabaseAdmin,
              userId,
              title: "Bienvenue dans Tok One !",
              body: isTrialing
                ? `Votre essai gratuit Tok One (${billingPeriod === "yearly" ? "annuel" : "mensuel"}) est actif. Vous profitez deja de vos avantages premium jusqu'a la fin de la periode d'essai.`
                : `Votre abonnement Tok One (${billingPeriod === "yearly" ? "annuel" : "mensuel"}) est maintenant actif. Profitez de la livraison gratuite et de tous vos avantages premium.`,
              type: "subscription",
              category: "transactional",
              data: {
                plan_id: planId,
                billing_period: billingPeriod,
                stripe_subscription_id: stripeSubscription?.id || null,
              },
            });
            await triggerNotificationDispatch({ source: "stripe-webhook-tok-one", push: true, email: true });
          } catch (error) {
            log.error("tok_one_notification_failed", { message: error instanceof Error ? error.message : "unknown" });
          }

          break;
        }

        if (checkoutKind === "launch-pack") {
          const restaurantLaunchPackId = session.metadata?.restaurant_launch_pack_id || null;
          const packId = session.metadata?.pack_id || null;

          if (!restaurantLaunchPackId || !packId) {
            log.warn("launch_pack_missing_metadata", { sessionId: session.id });
            break;
          }

          const { cardBrand, cardLast4 } = await getStripePaymentMethodDetails(stripe, session, log);

          // Update purchase record to paid
          await supabaseAdmin
            .from("restaurant_launch_packs")
            .update({
              status: "paid",
              stripe_checkout_session_id: session.id,
              stripe_payment_intent_id: typeof session.payment_intent === "string" ? session.payment_intent : null,
              paid_at: new Date().toISOString(),
            })
            .eq("id", restaurantLaunchPackId);

          // Fetch pack services to create fulfillment records
          const { data: pack } = await supabaseAdmin
            .from("launch_packs")
            .select("services")
            .eq("id", packId)
            .maybeSingle();

          if (pack?.services && Array.isArray(pack.services)) {
            const fulfillments = (pack.services as Array<{ service: string; label: string }>).map((svc) => ({
              restaurant_pack_id: restaurantLaunchPackId,
              service_slug: svc.service,
              service_label: svc.label,
              status: "pending",
            }));

            if (fulfillments.length > 0) {
              await supabaseAdmin
                .from("launch_pack_service_fulfillments")
                .insert(fulfillments);
            }

            // Auto-configure dashboard feature gating based on pack services
            const disabledFeatures = computeDisabledDashboardFeatures(
              pack.services as Array<{ service?: string | null }>,
            );

            const restaurantId = session.metadata?.restaurant_id || null;
            if (restaurantId) {
              await supabaseAdmin
                .from("restaurants")
                .update({ disabled_dashboard_features: disabledFeatures })
                .eq("id", restaurantId);
            }
          }

          // Record payment transaction
          await supabaseAdmin.from("payment_transactions").insert({
            user_id: userId,
            stripe_checkout_session_id: session.id,
            stripe_payment_intent_id: typeof session.payment_intent === "string" ? session.payment_intent : null,
            amount: (session.amount_total || 0) / 100,
            currency: (session.currency || "chf").toLowerCase(),
            type: "charge",
            status: "succeeded",
            metadata: {
              checkout_kind: "launch-pack",
              pack_id: packId,
              restaurant_launch_pack_id: restaurantLaunchPackId,
              restaurant_id: session.metadata?.restaurant_id || null,
              card_brand: cardBrand,
              card_last4: cardLast4,
            },
          });

          // Notify restaurant owner
          const restaurantId = session.metadata?.restaurant_id || null;
          if (restaurantId) {
            const { data: restaurant } = await supabaseAdmin
              .from("restaurants")
              .select("owner_id, name")
              .eq("id", restaurantId)
              .maybeSingle();

            const { data: packInfo } = await supabaseAdmin
              .from("launch_packs")
              .select("name")
              .eq("id", packId)
              .maybeSingle();

            if (restaurant?.owner_id) {
              const paidAmount = ((session.amount_total || 0) / 100).toFixed(2);
              await enqueueNotification({
                adminClient: supabaseAdmin,
                userId: restaurant.owner_id,
                title: "Pack de lancement active",
                body: `Votre ${packInfo?.name || "pack"} a ete paye avec succes (${paidAmount} CHF). Notre equipe va vous contacter sous 48h pour planifier les services.`,
                type: "payment",
                category: "transactional",
                data: {
                  restaurant_launch_pack_id: restaurantLaunchPackId,
                  pack_id: packId,
                  restaurant_id: restaurantId,
                  restaurant_name: restaurant.name,
                  paid_amount: paidAmount,
                  url: "/dashboard/pack",
                },
              });

              try {
                await triggerNotificationDispatch({ source: "stripe-webhook-launch-pack", push: true, email: true });
              } catch (error) {
                log.error("launch_pack_notification_failed", { message: error instanceof Error ? error.message : "unknown" });
              }
            }
          }
          break;
        }

        if (isZeroAttenteCheckoutKind(checkoutKind)) {
          if (!userId) {
            log.warn("zero_attente_missing_user", { sessionId: session.id });
            break;
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
            log.warn("zero_attente_incomplete_metadata", { sessionId: session.id });
            break;
          }

          const lineItems = await stripe.checkout.sessions.listLineItems(session.id, {
            limit: 100,
            expand: ["data.price.product"],
          });
          const preorderItems = buildPreorderItems(lineItems);
          const { cardBrand, cardLast4, billingPhone } = await getStripePaymentMethodDetails(stripe, session, log);
          const twintPhoneNumber = paymentMethod === "twint"
            ? String(session.customer_details?.phone || billingPhone || "")
            : "";
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
            stripe_payment_intent: typeof session.payment_intent === "string" ? session.payment_intent : null,
          };
          const storedReservationMetadata = { ...reservationPayload };
          delete storedReservationMetadata._internal_user_id;

          const { data: existingZeroAttenteReservation } = await supabaseAdmin
            .from("reservations")
            .select("id")
            .eq("user_id", userId)
            .eq("feature", "zero-attente")
            .filter("metadata->>checkout_session_id", "eq", session.id)
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle();

          const reservationAlreadyExisted = Boolean(existingZeroAttenteReservation?.id);
          let reservationId = existingZeroAttenteReservation?.id || null;

          if (reservationId) {
            await supabaseAdmin
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
            const { data: createdReservationId, error: reservationError } = await supabaseAdmin.rpc(
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
            adminClient: supabaseAdmin,
            userId,
            sessionId: session.id,
            paymentIntentId: typeof session.payment_intent === "string"
              ? session.payment_intent
              : null,
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

          if (pointsToRedeem > 0 && reservationId) {
            const { error: pointsError } = await supabaseAdmin.rpc("apply_reservation_loyalty_points", {
              p_user_id: userId,
              p_reservation_id: reservationId,
              p_points_to_redeem: pointsToRedeem,
              p_description: `Paiement Zero Attente ${orderReference}`,
            });

            if (pointsError) {
              throw pointsError;
            }
          }

          const { data: zaRestaurant } = await supabaseAdmin
            .from("restaurants")
            .select("owner_id, name")
            .eq("id", restaurantId)
            .maybeSingle();

          const { data: zaProfile } = userId
            ? await supabaseAdmin
              .from("profiles")
              .select("full_name")
              .eq("user_id", userId)
              .maybeSingle()
            : { data: null };

          const zaItemCount = preorderItems.reduce((sum: number, item: { quantity: number }) => sum + Number(item.quantity || 0), 0);

          if (!reservationAlreadyExisted && zaRestaurant?.owner_id) {
            await enqueueNotification({
              adminClient: supabaseAdmin,
              userId: zaRestaurant.owner_id,
              title: "Nouvelle reservation Zero Attente",
              body: `${zaProfile?.full_name || "Client"} - ${partySize} convive(s) le ${arrivalDate} a ${arrivalTime} - ${zaItemCount} plat(s) - ${total.toFixed(2)} CHF`,
              type: "reservation",
              category: "transactional",
              data: {
                reservation_id: reservationId,
                restaurant_id: restaurantId,
                restaurant_name: zaRestaurant.name,
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

          if (!reservationAlreadyExisted && userId) {
            await enqueueNotification({
              adminClient: supabaseAdmin,
              userId,
              title: "Reservation confirmee et payee",
              body: `Votre table chez ${zaRestaurant?.name || "le restaurant"} est reservee le ${arrivalDate} a ${arrivalTime} pour ${partySize} convive(s). ${zaItemCount} plat(s) precommande(s) - ${total.toFixed(2)} CHF.`,
              type: "reservation",
              category: "transactional",
              data: {
                reservation_id: reservationId,
                restaurant_id: restaurantId,
                restaurant_name: zaRestaurant?.name || null,
                party_size: partySize,
                arrival_date: arrivalDate,
                arrival_time: arrivalTime,
                items_count: zaItemCount,
                total_amount: total,
                feature: "zero-attente",
                url: "/reservations",
              },
            });
          }

          if (!reservationAlreadyExisted) {
            try {
              await triggerNotificationDispatch({ source: "stripe-webhook-zero-attente", push: true, email: true });
            } catch (error) {
              log.error("zero_attente_notification_failed", { message: error instanceof Error ? error.message : "unknown" });
            }
          }
          break;
        }

        if (checkoutKind === "chefs-table") {
          if (!userId) {
            log.warn("chefs_table_missing_user", { sessionId: session.id });
            break;
          }

          const paymentDetails = await getStripePaymentMethodDetails(stripe, session, log);
          await finalizeChefsTableCheckout({
            adminClient: supabaseAdmin,
            session,
            userId,
            cardBrand: paymentDetails.cardBrand,
            cardLast4: paymentDetails.cardLast4,
            log,
            shouldDispatchNotifications: true,
            fetchLineItems: () => stripe.checkout.sessions.listLineItems(session.id, {
              limit: 100,
              expand: ["data.price.product"],
            }),
          });
          break;
        }

        const paymentDetails = await getStripePaymentMethodDetails(stripe, session, log);
        const finalizedOrders = await finalizePaidOrderCheckout({
          adminClient: supabaseAdmin,
          session,
          cardBrand: paymentDetails.cardBrand,
          cardLast4: paymentDetails.cardLast4,
          billingPhone: paymentDetails.billingPhone,
          log,
          shouldDispatchNotifications: true,
        });

        if (!finalizedOrders.orders.length) {
          log.warn("no_order_for_checkout_session", { sessionId: session.id });
        }
        break;
      }

      case "checkout.session.expired": {
        const session = event.data.object as Stripe.Checkout.Session;
        const checkoutKind = String(session.metadata?.checkout_kind || "order");

        if (checkoutKind === "order") {
          await markOrderCheckoutSessionState({
            adminClient: supabaseAdmin,
            session,
            orderStatus: "payment_failed",
            paymentStatus: "expired",
            checkoutState: "expired",
            failureMessage: "Session Stripe expiree avant paiement.",
          });
        }
        break;
      }

      case "payment_intent.payment_failed": {
        const paymentIntent = event.data.object as Stripe.PaymentIntent;
        const { data: transactions } = await supabaseAdmin
          .from("payment_transactions")
          .select("order_id, user_id, metadata")
          .eq("stripe_payment_intent_id", paymentIntent.id)
          .eq("type", "charge");
        const paymentTransactions = (transactions || []) as PaymentTransactionRow[];

        for (const transaction of paymentTransactions) {
          if (transaction.order_id) {
            await supabaseAdmin
              .from("orders")
              .update({ status: "payment_failed", payment_status: "failed", updated_at: new Date().toISOString() })
              .eq("id", transaction.order_id);
          }

          await supabaseAdmin.from("payment_transactions").insert({
            order_id: transaction.order_id,
            user_id: transaction.user_id,
            stripe_payment_intent_id: paymentIntent.id,
            amount: (paymentIntent.amount || 0) / 100,
            currency: paymentIntent.currency || "chf",
            type: "charge",
            status: "failed",
            metadata: {
              failure_code: paymentIntent.last_payment_error?.code,
              failure_message: paymentIntent.last_payment_error?.message,
            },
          });

          const campaignId = getCampaignId(transaction.metadata);

          if (campaignId) {
            await supabaseAdmin
              .from("ad_campaigns")
              .update({ payment_status: "failed" })
              .eq("id", campaignId);
          }
        }

        if (paymentTransactions.some((transaction) => transaction.order_id)) {
          try {
            await triggerNotificationDispatch({ source: "stripe-webhook-payment-failed", push: true, email: true });
          } catch (error) {
            log.error("payment_failure_notification_failed", { message: error instanceof Error ? error.message : "unknown" });
          }
        }
        break;
      }

      case "charge.refunded": {
        const charge = event.data.object as Stripe.Charge;
        const paymentIntentId = typeof charge.payment_intent === "string" ? charge.payment_intent : null;
        if (!paymentIntentId) break;

        const { data: chargeTransactions } = await supabaseAdmin
          .from("payment_transactions")
          .select("order_id, user_id, amount")
          .eq("stripe_payment_intent_id", paymentIntentId)
          .eq("type", "charge")
          .eq("status", "succeeded");
        const successfulChargeTransactions = (chargeTransactions || []) as PaymentTransactionRow[];

        const refundAmount = (charge.amount_refunded || 0) / 100;
        const allocations = allocateAmounts(
          refundAmount,
          successfulChargeTransactions.map((transaction) => ({ amount: Number(transaction.amount || 0) })),
        );

        const creditedUsers = new Set<string>();

        for (const [index, transaction] of successfulChargeTransactions.entries()) {
          await supabaseAdmin.from("payment_transactions").insert({
            order_id: transaction.order_id,
            user_id: transaction.user_id,
            stripe_payment_intent_id: paymentIntentId,
            amount: allocations[index] || 0,
            currency: charge.currency || "chf",
            type: "refund",
            status: "succeeded",
          });

          if (transaction.user_id && !creditedUsers.has(transaction.user_id)) {
            creditedUsers.add(transaction.user_id);
          }
        }

        for (const userId of creditedUsers) {
          const { data: wallet } = await supabaseAdmin
            .from("user_wallets")
            .select("id, balance")
            .eq("user_id", userId)
            .maybeSingle();

          if (wallet) {
            await supabaseAdmin
              .from("user_wallets")
              .update({ balance: wallet.balance + refundAmount, updated_at: new Date().toISOString() })
              .eq("id", wallet.id);
          } else {
            await supabaseAdmin.from("user_wallets").insert({
              user_id: userId,
              balance: refundAmount,
            });
          }

          await enqueueNotification({
            adminClient: supabaseAdmin,
            userId,
            title: "Remboursement effectue",
            body: `${refundAmount.toFixed(2)} CHF ont ete credites sur votre portefeuille.`,
            type: "payment",
            category: "transactional",
            data: {
              amount: refundAmount,
              url: "/notifications",
            },
          });
        }

        if (creditedUsers.size > 0) {
          try {
            await triggerNotificationDispatch({ source: "stripe-webhook-refund", push: true, email: true });
          } catch (error) {
            log.error("refund_notification_failed", { message: error instanceof Error ? error.message : "unknown" });
          }
        }
        break;
      }

      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted": {
        const subscription = event.data.object as Stripe.Subscription;
        const syncResult = await syncTokOneSubscriptionRecord({
          adminClient: supabaseAdmin,
          subscription,
        });

        if (!syncResult.updated) {
          log.warn("tok_one_subscription_skipped", { subscriptionId: subscription.id });
          break;
        }

        if (
          event.type === "customer.subscription.updated" &&
          !isTokOneEntitledStatus(syncResult.row?.status || null) &&
          syncResult.row?.user_id
        ) {
          await enqueueNotification({
            adminClient: supabaseAdmin,
            userId: syncResult.row.user_id,
            title: "Abonnement Tok One mis a jour",
            body: "Votre abonnement Tok One n'est plus actif. Mettez a jour votre moyen de paiement pour retrouver vos avantages.",
            type: "subscription",
            category: "transactional",
            data: {
              stripe_subscription_id: subscription.id,
              status: syncResult.row?.status || null,
            },
          });
          try {
            await triggerNotificationDispatch({ source: "stripe-webhook-subscription-update", push: true, email: true });
          } catch (error) {
            log.error("subscription_notification_failed", { message: error instanceof Error ? error.message : "unknown" });
          }
        }

        log.info("subscription_synced", { eventType: event.type, subscriptionId: subscription.id });
        break;
      }

      default:
        log.info("unhandled_event_type", { eventType: event.type });
    }

    await writeAuditLog({
      adminClient: supabaseAdmin,
      actor: { roles: ["service_role"], isServiceRole: true },
      request: req,
      functionName: "stripe-webhook",
      action: event.type,
      status: "success",
      targetEntityType: "stripe_event",
      targetEntityId: event.id,
      metadata: {
        livemode: event.livemode,
        type: event.type,
      },
    });
  } catch (error) {
    log.error("event_processing_error", { eventType: event.type, message: error instanceof Error ? error.message : "unknown" });
    await writeAuditLog({
      adminClient: supabaseAdmin,
      actor: { roles: ["service_role"], isServiceRole: true },
      request: req,
      functionName: "stripe-webhook",
      action: event.type,
      status: "failure",
      targetEntityType: "stripe_event",
      targetEntityId: event.id,
      errorMessage: error instanceof Error ? error.message : "Erreur interne",
      metadata: {
        livemode: event.livemode,
        type: event.type,
      },
    });
  }

  return new Response(JSON.stringify({ received: true }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
});
