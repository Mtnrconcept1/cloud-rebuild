import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Stripe from "npm:stripe@18.5.0";
import { getEnv, writeAuditLog } from "../_shared/auth.ts";
import { makeLogger } from "../_shared/logging.ts";
import {
  enrichDeliveryMetadata,
  getEstimatedArrivalTime,
  isDeliveryOrder,
} from "../_shared/delivery-dispatch.ts";
import {
  enqueueNotification,
  triggerNotificationDispatch,
} from "../_shared/notifications.ts";
import {
  isTokOneEntitledStatus,
  syncTokOneSubscriptionRecord,
} from "../_shared/tok-one.ts";

type JsonRecord = Record<string, unknown>;

type OrderLookupRow = {
  id: string;
  status: string | null;
  user_id: string | null;
  restaurant_id: string;
  delivery_address: string | null;
  total_amount: number | null;
  order_number: string | null;
  metadata: JsonRecord | null;
  scheduled_at: string | null;
  notes: string | null;
};

type ReservationLookupRow = {
  id: string;
  metadata: JsonRecord | null;
};

type PaymentTransactionRow = {
  order_id: string | null;
  user_id: string | null;
  metadata?: JsonRecord | null;
  amount?: number | null;
};

function isJsonRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function getCampaignId(metadata: unknown) {
  return isJsonRecord(metadata) && typeof metadata.campaign_id === "string"
    ? metadata.campaign_id
    : null;
}

function allocateAmounts(totalAmount: number, rows: Array<{ amount: number }>) {
  const totalBase = rows.reduce((sum, row) => sum + Math.max(0, Number(row.amount || 0)), 0);
  let remaining = Math.round(totalAmount * 100) / 100;

  return rows.map((row, index) => {
    const share = totalBase > 0 ? Math.max(0, Number(row.amount || 0)) / totalBase : (rows.length > 0 ? 1 / rows.length : 0);
    const value = index === rows.length - 1
      ? Math.max(0, remaining)
      : Math.round((totalAmount * share) * 100) / 100;
    remaining = Math.max(0, Math.round((remaining - value) * 100) / 100);
    return value;
  });
}

async function getCardDetails(stripe: Stripe, session: Stripe.Checkout.Session) {
  let cardBrand = "";
  let cardLast4 = "";
  if (session.payment_intent && typeof session.payment_intent === "string") {
    try {
      const paymentIntent = await stripe.paymentIntents.retrieve(session.payment_intent, {
        expand: ["payment_method"],
      });
      const paymentMethod = paymentIntent.payment_method;
      if (paymentMethod && typeof paymentMethod !== "string" && paymentMethod.card) {
        cardBrand = paymentMethod.card.brand;
        cardLast4 = paymentMethod.card.last4;
      }
    } catch (error) {
      log.error("card_details_fetch_error", { message: error instanceof Error ? error.message : "unknown" });
    }
  }
  return { cardBrand, cardLast4 };
}

function parseMoney(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function getStripeWebhookSecret() {
  return getEnv("STRIPE_WEBHOOK_SECRET") || getEnv("STRIPE_WEBHOOK_SIGNING_SECRET");
}

async function recordTokOnePaymentIfMissing(input: {
  adminClient: ReturnType<typeof createClient>;
  session: Stripe.Checkout.Session;
  userId: string;
  planId: string;
  billingPeriod: string;
  stripeSubscriptionId: string | null;
  eventId: string;
}) {
  const {
    adminClient,
    session,
    userId,
    planId,
    billingPeriod,
    stripeSubscriptionId,
    eventId,
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
    log.error("tok_one_payment_check_failed", { message: existingTransactionError.message });
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

function getOrderJourneyLabel(input: {
  isDelivery: boolean;
  metadata: Record<string, unknown>;
}) {
  if (input.isDelivery) return "livraison";
  if (typeof input.metadata.pickup_time === "string" && input.metadata.pickup_time) return "a emporter";
  return "commande";
}

function isZeroAttenteCheckoutKind(checkoutKind: string | null | undefined) {
  return checkoutKind === "zero-attente" || checkoutKind === "reservation_zero_attente";
}

async function findOrdersForSession(
  supabaseAdmin: ReturnType<typeof createClient>,
  session: Stripe.Checkout.Session,
) : Promise<OrderLookupRow[]> {
  const orderRef = session.metadata?.order_reference || null;
  const checkoutId = session.metadata?.checkout_id || null;
  const checkoutGroupId = session.metadata?.checkout_group_id || null;
  const ordersById = new Map<string, OrderLookupRow>();

  const appendOrders = (rows: OrderLookupRow[] | null | undefined) => {
    for (const row of rows || []) {
      if (row?.id) ordersById.set(String(row.id), row);
    }
  };

  const baseSelect = "id, status, user_id, restaurant_id, delivery_address, total_amount, order_number, metadata, scheduled_at, notes";

  const { data: sessionOrders } = await supabaseAdmin
    .from("orders")
    .select(baseSelect)
    .filter("metadata->>stripe_session_id", "eq", session.id);
  appendOrders(sessionOrders as OrderLookupRow[] | null | undefined);

  if (checkoutGroupId) {
    const { data: groupOrders } = await supabaseAdmin
      .from("orders")
      .select(baseSelect)
      .filter("metadata->>checkout_group_id", "eq", checkoutGroupId);
    appendOrders(groupOrders as OrderLookupRow[] | null | undefined);
  }

  if (checkoutId) {
    const { data: checkoutOrders } = await supabaseAdmin
      .from("orders")
      .select(baseSelect)
      .eq("checkout_id", checkoutId);
    appendOrders(checkoutOrders as OrderLookupRow[] | null | undefined);
  }

  if (orderRef) {
    const { data: refOrders } = await supabaseAdmin
      .from("orders")
      .select(baseSelect)
      .eq("order_number", orderRef);
    appendOrders(refOrders as OrderLookupRow[] | null | undefined);
  }

  return Array.from(ordersById.values());
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
  const webhookSecret = getStripeWebhookSecret();

  if (!webhookSecret) {
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
  try {
    event = await stripe.webhooks.constructEventAsync(
      body,
      signature,
      webhookSecret,
    );
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
        let shouldDispatchNotifications = false;

        if (checkoutKind === "campaign" && campaignId) {
          const { cardBrand, cardLast4 } = await getCardDetails(stripe, session);
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

          const { cardBrand, cardLast4 } = await getCardDetails(stripe, session);

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
            const SERVICE_FEATURES: Record<string, string[]> = {
              mise_en_place: ["dashboard-overview","dashboard-restaurant","dashboard-menu","dashboard-commandes","dashboard-reservations","dashboard-service","dashboard-formules","dashboard-offres","dashboard-ventes-flash","dashboard-avis","dashboard-factures","dashboard-support","dashboard-pack"],
              menu_creation: ["dashboard-menu"],
              product_photography: ["dashboard-photos"],
              social_media_setup: ["dashboard-reseaux-sociaux"],
              advertising_campaign: ["dashboard-campagne-overview","dashboard-campagnes"],
              floor_plan_design: ["dashboard-plan-salle"],
              account_manager: ["dashboard-advisor","dashboard-recommandations","dashboard-performances","dashboard-comparaison"],
            };
            const ALL_FEATURES = ["dashboard-overview","dashboard-advisor","dashboard-restaurant","dashboard-menu","dashboard-photos","dashboard-commandes","dashboard-reservations","dashboard-recommandations","dashboard-performances","dashboard-comparaison","dashboard-avis","dashboard-campagne-overview","dashboard-reseaux-sociaux","dashboard-campagnes","dashboard-factures","dashboard-offres","dashboard-ventes-flash","dashboard-formules","dashboard-service","dashboard-plan-salle","dashboard-support","dashboard-pack"];
            const ALWAYS_ENABLED = new Set(["dashboard-overview","dashboard-pack","dashboard-support"]);

            const enabledByPack = new Set<string>(ALWAYS_ENABLED);
            for (const svc of pack.services as Array<{ service: string }>) {
              for (const f of (SERVICE_FEATURES[svc.service] || [])) enabledByPack.add(f);
            }
            const disabledFeatures = ALL_FEATURES.filter((f) => !enabledByPack.has(f));

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
          const { cardBrand, cardLast4 } = await getCardDetails(stripe, session);
          const note = buildReservationNote({
            count: preorderItems.reduce((sum, item) => sum + Number(item.quantity || 0), 0),
            subtotal,
            formulaDiscount,
            total,
            paymentMethod,
          });

          const { data: reservationId, error: reservationError } = await supabaseAdmin.rpc(
            "validate_and_create_reservation",
            {
              p_restaurant_id: restaurantId,
              p_date: arrivalDate,
              p_time: arrivalTime,
              p_party_size: partySize,
              p_feature: "zero-attente",
              p_metadata: {
                _internal_user_id: userId,
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
            throw new Error(reservationError?.message || "Creation de reservation Zero Attente impossible.");
          }

          const { data: existingTransaction } = await supabaseAdmin
            .from("payment_transactions")
            .select("id")
            .eq("stripe_checkout_session_id", session.id)
            .eq("type", "charge")
            .maybeSingle();

          if (!existingTransaction) {
            await supabaseAdmin.from("payment_transactions").insert({
              user_id: userId,
              stripe_checkout_session_id: session.id,
              stripe_payment_intent_id: typeof session.payment_intent === "string" ? session.payment_intent : null,
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

          if (zaRestaurant?.owner_id) {
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

          if (userId) {
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

          try {
            await triggerNotificationDispatch({ source: "stripe-webhook-zero-attente", push: true, email: true });
          } catch (error) {
            log.error("zero_attente_notification_failed", { message: error instanceof Error ? error.message : "unknown" });
          }
          break;
        }

        const orders = await findOrdersForSession(supabaseAdmin, session);
        const { data: reservation } = await supabaseAdmin
          .from("reservations")
          .select("id, metadata")
          .filter("metadata->>checkout_session_id", "eq", session.id)
          .maybeSingle();
        const reservationRecord = reservation as ReservationLookupRow | null;

        const { cardBrand, cardLast4 } = await getCardDetails(stripe, session);

        for (const order of orders) {
          const existingMeta = isJsonRecord(order.metadata) ? order.metadata : {};
          const isDelivery = isDeliveryOrder({
            deliveryAddress: order.delivery_address,
            metadata: existingMeta,
            orderType: String((existingMeta as Record<string, unknown>).type || ""),
          });
          const deliveryMetadata = isDelivery ? enrichDeliveryMetadata(existingMeta) : existingMeta;
          const scheduledAt = isDelivery
            ? String((deliveryMetadata as Record<string, unknown>).scheduled_delivery_at || order.scheduled_at || "") || null
            : null;
          const estimatedDeliveryAt = isDelivery
            ? getEstimatedArrivalTime(deliveryMetadata, scheduledAt)
            : null;

          await supabaseAdmin
            .from("orders")
            .update({
              status: "confirmed",
              payment_status: "captured",
              estimated_delivery_at: estimatedDeliveryAt,
              metadata: {
                ...deliveryMetadata,
                stripe_session_id: session.id,
                stripe_payment_intent: session.payment_intent,
                payment_status: session.payment_status,
                card_brand: cardBrand,
                card_last4: cardLast4,
              },
              updated_at: new Date().toISOString(),
            })
            .eq("id", order.id);
        }

        if (reservationRecord) {
          const existingMeta = isJsonRecord(reservationRecord.metadata) ? reservationRecord.metadata : {};
          await supabaseAdmin
            .from("reservations")
            .update({
              status: "confirmed",
              metadata: {
                ...existingMeta,
                checkout_session_id: session.id,
                card_brand: cardBrand,
                card_last4: cardLast4,
                paid: true,
              },
            })
            .eq("id", reservationRecord.id);
          shouldDispatchNotifications = true;
        }

        const allocations = allocateAmounts(
          (session.amount_total || 0) / 100,
          orders.map((order) => ({ amount: Number(order.total_amount || 0) })),
        );

        for (const [index, order] of orders.entries()) {
          const existingMeta = isJsonRecord(order.metadata) ? order.metadata : {};
          const isDelivery = isDeliveryOrder({
            deliveryAddress: order.delivery_address,
            metadata: existingMeta,
            orderType: String((existingMeta as Record<string, unknown>).type || ""),
          });
          const deliveryMetadata = isDelivery ? enrichDeliveryMetadata(existingMeta) : existingMeta;
          const scheduledAt = isDelivery
            ? String((deliveryMetadata as Record<string, unknown>).scheduled_delivery_at || order.scheduled_at || "") || null
            : null;
          const estimatedDeliveryAt = isDelivery
            ? getEstimatedArrivalTime(deliveryMetadata, scheduledAt)
            : null;

          await supabaseAdmin.from("payment_transactions").insert({
            order_id: order.id,
            user_id: userId,
            stripe_checkout_session_id: session.id,
            stripe_payment_intent_id: typeof session.payment_intent === "string" ? session.payment_intent : null,
            amount: allocations[index] || 0,
            currency: (session.currency || "chf").toLowerCase(),
            type: "charge",
            status: "succeeded",
            metadata: {
              card_brand: cardBrand,
              card_last4: cardLast4,
              order_reference: order.order_number || session.metadata?.order_reference || null,
              reservation_id: reservationRecord?.id || null,
            },
          });

          if (isDelivery && scheduledAt) {
            await supabaseAdmin.from("delivery_tracking").upsert({
              order_id: order.id,
              status: "scheduled",
              estimated_arrival: estimatedDeliveryAt,
            });
          }

          const { data: restaurant } = await supabaseAdmin
            .from("restaurants")
            .select("owner_id, name")
            .eq("id", order.restaurant_id)
            .maybeSingle();
          const { data: profile } = order.user_id
            ? await supabaseAdmin
              .from("profiles")
              .select("full_name")
              .eq("user_id", order.user_id)
              .maybeSingle()
            : { data: null };

          if (restaurant?.owner_id) {
            const journeyLabel = getOrderJourneyLabel({
              isDelivery,
              metadata: deliveryMetadata as Record<string, unknown>,
            });

            await enqueueNotification({
              adminClient: supabaseAdmin,
              userId: restaurant.owner_id,
              title: "Nouvelle commande",
              body: `${journeyLabel} - ${order.order_number || session.metadata?.order_reference || order.id} - ${order.total_amount} CHF`,
              type: "order",
              category: "transactional",
              data: {
                order_id: order.id,
                order_number: order.order_number || session.metadata?.order_reference || null,
                restaurant_id: order.restaurant_id,
                restaurant_name: restaurant.name,
                delivery_address: order.delivery_address || null,
                customer_name: profile?.full_name || null,
                items_count: deliveryMetadata.items_count || null,
                items_summary: deliveryMetadata.items_summary || null,
                scheduled_delivery_at: scheduledAt,
                scheduled_delivery_label: deliveryMetadata.scheduled_delivery_label || null,
                delivery_window_label: deliveryMetadata.delivery_window_label || null,
                service_mode: journeyLabel,
                pickup_time: deliveryMetadata.pickup_time || null,
                total_amount: order.total_amount,
                url: "/dashboard/commandes",
              },
            });
          }

          shouldDispatchNotifications = true;
        }

        if (!orders.length && !reservation) {
          log.warn("no_order_or_reservation", { sessionId: session.id });
        }

        if (shouldDispatchNotifications) {
          try {
            await triggerNotificationDispatch({ source: "stripe-webhook-checkout", push: true, email: true });
          } catch (error) {
            log.error("order_notification_failed", { message: error instanceof Error ? error.message : "unknown" });
          }
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
