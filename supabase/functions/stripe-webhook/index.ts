import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Stripe from "npm:stripe@18.5.0";
import { getEnv, writeAuditLog } from "../_shared/auth.ts";
import { makeLogger } from "../_shared/logging.ts";
import { finalizeChefsTableCheckout } from "../_shared/chefs-table.ts";
import { finalizeZeroAttenteCheckout } from "../_shared/zero-attente.ts";
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
import {
  isTokOneEntitledStatus,
  syncTokOneSubscriptionRecord,
} from "../_shared/tok-one.ts";
import {
  getStripeVerificationRuntime,
  getStripeWebhookSigningSecrets,
  getTokOneStripeRuntime,
} from "../_shared/stripe-client.ts";
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

async function recordTokOnePaymentIfMissing(input: {
  adminClient: ReturnType<typeof createClient>;
  session: Stripe.Checkout.Session;
  userId: string;
  planId: string;
  billingPeriod: string;
  stripeSubscriptionId: string | null;
  stripeMode: "live" | "test";
  eventId: string;
  amountOverride?: number | null;
  checkoutKind?: string;
  metadata?: JsonRecord;
  log?: LoggerLike;
}) {
  const {
    adminClient,
    session,
    userId,
    planId,
    billingPeriod,
    stripeSubscriptionId,
    stripeMode,
    eventId,
    amountOverride = null,
    checkoutKind = "tok-one",
    metadata = {},
    log,
  } = input;

  const amount = amountOverride !== null && Number.isFinite(amountOverride)
    ? Number(amountOverride)
    : (session.amount_total || 0) / 100;
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
        checkout_kind: checkoutKind,
        plan_id: planId,
        billing_period: billingPeriod,
        stripe_subscription_id: stripeSubscriptionId,
        stripe_mode: stripeMode,
        stripe_event_id: eventId,
        ...metadata,
      },
    });
}

function isZeroAttenteCheckoutKind(checkoutKind: string | null | undefined) {
  return checkoutKind === "zero-attente" || checkoutKind === "reservation_zero_attente";
}

function finiteUnixTimestamp(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : null;
}

function toIsoFromUnix(timestamp: number | null | undefined, fallback: Date) {
  return typeof timestamp === "number" && Number.isFinite(timestamp)
    ? new Date(timestamp * 1000).toISOString()
    : fallback.toISOString();
}

function resolveRestaurantSubscriptionPeriod(subscription: Stripe.Subscription | null) {
  const fallbackDate = new Date();
  if (!subscription) {
    const periodEnd = new Date(fallbackDate);
    periodEnd.setMonth(periodEnd.getMonth() + 1);
    return {
      currentPeriodStart: fallbackDate.toISOString(),
      currentPeriodEnd: periodEnd.toISOString(),
    };
  }

  const itemPeriodStarts = (subscription.items?.data || [])
    .map((item) => finiteUnixTimestamp((item as { current_period_start?: unknown }).current_period_start))
    .filter((value): value is number => value !== null);
  const itemPeriodEnds = (subscription.items?.data || [])
    .map((item) => finiteUnixTimestamp((item as { current_period_end?: unknown }).current_period_end))
    .filter((value): value is number => value !== null);
  const currentPeriodStart =
    finiteUnixTimestamp((subscription as { current_period_start?: unknown }).current_period_start) ||
    (itemPeriodStarts.length > 0 ? Math.min(...itemPeriodStarts) : null) ||
    finiteUnixTimestamp(subscription.start_date);
  const currentPeriodEnd =
    finiteUnixTimestamp((subscription as { current_period_end?: unknown }).current_period_end) ||
    (itemPeriodEnds.length > 0 ? Math.max(...itemPeriodEnds) : null);

  if (currentPeriodStart && currentPeriodEnd && currentPeriodEnd > currentPeriodStart) {
    return {
      currentPeriodStart: toIsoFromUnix(currentPeriodStart, fallbackDate),
      currentPeriodEnd: toIsoFromUnix(currentPeriodEnd, fallbackDate),
    };
  }

  const fallbackEnd = new Date(fallbackDate);
  fallbackEnd.setMonth(fallbackEnd.getMonth() + 1);
  return {
    currentPeriodStart: toIsoFromUnix(currentPeriodStart, fallbackDate),
    currentPeriodEnd: fallbackEnd.toISOString(),
  };
}

function normalizeRestaurantSubscriptionStatus(status: string | null | undefined) {
  const normalized = String(status || "").toLowerCase();
  if (normalized === "canceled") return "cancelled";
  if (["trialing", "active", "past_due", "paused", "cancelled"].includes(normalized)) {
    return normalized;
  }
  return "active";
}

async function syncRestaurantSubscriptionRecord(input: {
  adminClient: ReturnType<typeof createClient>;
  subscription: Stripe.Subscription;
  stripeMode: "live" | "test";
  stripeCheckoutSessionId?: string | null;
  log?: LoggerLike;
}) {
  const {
    adminClient,
    subscription,
    stripeMode,
    stripeCheckoutSessionId = null,
    log,
  } = input;
  const metadata = subscription.metadata || {};
  const checkoutKind = String(metadata.checkout_kind || "");

  let restaurantId = String(metadata.restaurant_id || "");
  let planId = String(metadata.restaurant_subscription_plan_id || metadata.plan_id || "");
  let planSlug = String(metadata.restaurant_subscription_plan_slug || metadata.plan_slug || "");

  const { data: existing, error: existingError } = await adminClient
    .from("restaurant_ai_subscriptions")
    .select("id, restaurant_id, restaurant_subscription_plan_id, plan, metadata")
    .eq("stripe_subscription_id", subscription.id)
    .maybeSingle();

  if (existingError) {
    log?.error?.("restaurant_subscription_lookup_failed", { message: existingError.message });
    return { updated: false, row: null };
  }

  restaurantId = restaurantId || String(existing?.restaurant_id || "");
  planId = planId || String(existing?.restaurant_subscription_plan_id || "");
  planSlug = planSlug || String(existing?.plan || "");

  if (!restaurantId || (!planId && !planSlug)) {
    return { updated: false, row: null };
  }

  const planQuery = adminClient
    .from("restaurant_subscription_plans")
    .select("id, slug, name, price_monthly_chf, campaign_credit_chf, ai_tool_credits, ai_photo_credits, monthly_conversation_limit, monthly_text_tool_limit, monthly_image_limit, monthly_premium_image_limit, monthly_voice_minutes_limit")
    .limit(1);
  const { data: plans, error: planError } = planId
    ? await planQuery.eq("id", planId)
    : await planQuery.eq("slug", planSlug);

  if (planError) {
    log?.error?.("restaurant_subscription_plan_lookup_failed", { message: planError.message });
    return { updated: false, row: null };
  }

  const plan = Array.isArray(plans) ? plans[0] : null;
  if (!plan) {
    return { updated: false, row: null };
  }

  const period = resolveRestaurantSubscriptionPeriod(subscription);
  const payload = {
    restaurant_id: restaurantId,
    restaurant_subscription_plan_id: plan.id,
    plan: plan.slug,
    status: normalizeRestaurantSubscriptionStatus(subscription.status),
    monthly_conversation_limit: Number(plan.monthly_conversation_limit || 0),
    monthly_text_tool_limit: Number(plan.monthly_text_tool_limit || 0),
    monthly_image_limit: Number(plan.monthly_image_limit || 0),
    monthly_premium_image_limit: Number(plan.monthly_premium_image_limit || 0),
    monthly_voice_minutes_limit: Number(plan.monthly_voice_minutes_limit || 0),
    monthly_campaign_credit_chf: Number(plan.campaign_credit_chf || 0),
    monthly_ai_tool_credits: Number(plan.ai_tool_credits || 0),
    monthly_photo_retouch_credits: Number(plan.ai_photo_credits || 0),
    current_period_start: period.currentPeriodStart,
    current_period_end: period.currentPeriodEnd,
    started_at: period.currentPeriodStart,
    billing_period: "monthly",
    stripe_subscription_id: subscription.id,
    stripe_checkout_session_id: stripeCheckoutSessionId || String(metadata.stripe_checkout_session_id || ""),
    stripe_mode: stripeMode,
    metadata: {
      ...(isJsonRecord(existing?.metadata) ? existing.metadata : {}),
      ...metadata,
      checkout_kind: checkoutKind || "restaurant-subscription-sync",
      restaurant_subscription_plan_id: plan.id,
      restaurant_subscription_plan_slug: plan.slug,
      stripe_subscription_id: subscription.id,
      stripe_checkout_session_id: stripeCheckoutSessionId || String(metadata.stripe_checkout_session_id || ""),
      stripe_subscription_status: subscription.status,
    },
  };

  const { data: row, error: upsertError } = await adminClient
    .from("restaurant_ai_subscriptions")
    .upsert(payload, { onConflict: "restaurant_id" })
    .select("id, restaurant_id, plan, status")
    .maybeSingle();

  if (upsertError) {
    log?.error?.("restaurant_subscription_sync_failed", { message: upsertError.message });
    return { updated: false, row: null };
  }

  return { updated: true, row };
}

Deno.serve(async (req) => {
  const log = makeLogger("stripe-webhook");

  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  let stripeRuntime: ReturnType<typeof getStripeVerificationRuntime>;
  try {
    stripeRuntime = getStripeVerificationRuntime();
  } catch {
    return new Response("Stripe verification secret not configured", { status: 503 });
  }
  const stripe = stripeRuntime.stripe;

  const supabaseAdmin = createClient(
    getEnv("SUPABASE_URL"),
    getEnv("SUPABASE_SERVICE_ROLE_KEY"),
  );

  const body = await req.text();
  const signature = req.headers.get("stripe-signature");
  const webhookSecrets = getStripeWebhookSigningSecrets();

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
          const tokOneStripeRuntime = getTokOneStripeRuntime(event.livemode ? "live" : "test");

          if (!userId || !planId) {
            log.warn("tok_one_missing_metadata", { sessionId: session.id });
            break;
          }

          let stripeSubscription: Stripe.Subscription | null = null;
          if (typeof session.subscription === "string") {
            stripeSubscription = await tokOneStripeRuntime.stripe.subscriptions.retrieve(session.subscription);
            await syncTokOneSubscriptionRecord({
              adminClient: supabaseAdmin,
              subscription: stripeSubscription,
              fallbackUserId: userId,
              fallbackPlanId: planId,
              stripeMode: tokOneStripeRuntime.mode,
              stripeCheckoutSessionId: session.id,
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
            stripeMode: tokOneStripeRuntime.mode,
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
                stripe_mode: tokOneStripeRuntime.mode,
              },
            });
            await triggerNotificationDispatch({ source: "stripe-webhook-tok-one", push: true, email: true });
          } catch (error) {
            log.error("tok_one_notification_failed", { message: error instanceof Error ? error.message : "unknown" });
          }

          break;
        }

        if (checkoutKind === "restaurant-onboarding") {
          const restaurantLaunchPackId = session.metadata?.restaurant_launch_pack_id || null;
          const packId = session.metadata?.pack_id || null;
          const planId = session.metadata?.plan_id || null;
          const planSlug = session.metadata?.restaurant_subscription_plan_slug || null;
          const billingPeriod = "monthly";
          const restaurantId = session.metadata?.restaurant_id || null;
          const signupApplicationId = session.metadata?.signup_application_id || null;
          const packAmount = Number(session.metadata?.launch_pack_amount || 0);
          const subscriptionAmount = Number(session.metadata?.subscription_amount || 0);
          const campaignCreditChf = Number(session.metadata?.campaign_credit_chf || 0);
          const aiToolCredits = Number(session.metadata?.ai_tool_credits || 0);
          const aiPhotoCredits = Number(session.metadata?.ai_photo_credits || 0);

          if (!userId || !restaurantLaunchPackId || !packId || !planId || !planSlug || !restaurantId) {
            log.warn("restaurant_onboarding_missing_metadata", { sessionId: session.id });
            break;
          }

          let stripeSubscription: Stripe.Subscription | null = null;
          if (typeof session.subscription === "string") {
            stripeSubscription = await stripe.subscriptions.retrieve(session.subscription);
          } else {
            log.warn("restaurant_onboarding_no_subscription", { sessionId: session.id });
          }

          const { cardBrand, cardLast4 } = await getStripePaymentMethodDetails(stripe, session, log);
          const period = resolveRestaurantSubscriptionPeriod(stripeSubscription);

          await supabaseAdmin
            .from("restaurant_launch_packs")
            .update({
              status: "paid",
              stripe_checkout_session_id: session.id,
              stripe_payment_intent_id: typeof session.payment_intent === "string" ? session.payment_intent : null,
              paid_at: new Date().toISOString(),
              metadata: {
                checkout_kind: "restaurant-onboarding",
                signup_application_id: signupApplicationId,
                plan_id: planId,
                restaurant_subscription_plan_id: planId,
                restaurant_subscription_plan_slug: planSlug,
                billing_period: billingPeriod,
                stripe_subscription_id: stripeSubscription?.id || null,
              },
            })
            .eq("id", restaurantLaunchPackId);

          await supabaseAdmin
            .from("restaurant_ai_subscriptions")
            .upsert({
              restaurant_id: restaurantId,
              restaurant_subscription_plan_id: planId,
              plan: planSlug,
              status: normalizeRestaurantSubscriptionStatus(stripeSubscription?.status || "active"),
              monthly_conversation_limit: Number(session.metadata?.monthly_conversation_limit || 0),
              monthly_text_tool_limit: Number(session.metadata?.monthly_text_tool_limit || 0),
              monthly_image_limit: Number(session.metadata?.monthly_image_limit || 0),
              monthly_premium_image_limit: Number(session.metadata?.monthly_premium_image_limit || 0),
              monthly_voice_minutes_limit: Number(session.metadata?.monthly_voice_minutes_limit || 0),
              monthly_campaign_credit_chf: campaignCreditChf,
              monthly_ai_tool_credits: aiToolCredits,
              monthly_photo_retouch_credits: aiPhotoCredits,
              current_period_start: period.currentPeriodStart,
              current_period_end: period.currentPeriodEnd,
              started_at: period.currentPeriodStart,
              billing_period: "monthly",
              stripe_subscription_id: stripeSubscription?.id || null,
              stripe_checkout_session_id: session.id,
              stripe_mode: event.livemode ? "live" : "test",
              metadata: {
                checkout_kind: "restaurant-onboarding",
                signup_application_id: signupApplicationId,
                restaurant_launch_pack_id: restaurantLaunchPackId,
                pack_id: packId,
                plan_id: planId,
                plan_slug: planSlug,
                campaign_credit_chf: campaignCreditChf,
                ai_tool_credits: aiToolCredits,
                ai_photo_credits: aiPhotoCredits,
              },
            }, { onConflict: "restaurant_id" });

          const { data: pack } = await supabaseAdmin
            .from("launch_packs")
            .select("name, services")
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
                .upsert(fulfillments, { onConflict: "restaurant_pack_id,service_slug" });
            }

            const disabledFeatures = computeDisabledDashboardFeatures(
              pack.services as Array<{ service?: string | null }>,
            );

            await supabaseAdmin
              .from("restaurants")
              .update({ disabled_dashboard_features: disabledFeatures })
              .eq("id", restaurantId);
          }

          await supabaseAdmin.from("payment_transactions").insert({
            user_id: userId,
            stripe_checkout_session_id: session.id,
            stripe_payment_intent_id: typeof session.payment_intent === "string" ? session.payment_intent : null,
            amount: packAmount > 0 ? packAmount : (session.amount_total || 0) / 100,
            currency: (session.currency || "chf").toLowerCase(),
            type: "charge",
            status: "succeeded",
            metadata: {
              checkout_kind: "restaurant-onboarding",
              charge_component: "launch-pack",
              pack_id: packId,
              restaurant_launch_pack_id: restaurantLaunchPackId,
              restaurant_id: restaurantId,
              plan_id: planId,
              restaurant_subscription_plan_id: planId,
              restaurant_subscription_plan_slug: planSlug,
              billing_period: billingPeriod,
              card_brand: cardBrand,
              card_last4: cardLast4,
            },
          });

          await recordTokOnePaymentIfMissing({
            adminClient: supabaseAdmin,
            session,
            userId,
            planId,
            billingPeriod,
            stripeSubscriptionId: stripeSubscription?.id || null,
            stripeMode: event.livemode ? "live" : "test",
            eventId: event.id,
            amountOverride: subscriptionAmount,
            checkoutKind: "restaurant-onboarding",
            metadata: {
              charge_component: "subscription",
              restaurant_id: restaurantId,
              pack_id: packId,
              restaurant_subscription_plan_id: planId,
              restaurant_subscription_plan_slug: planSlug,
              restaurant_launch_pack_id: restaurantLaunchPackId,
            },
            log,
          });

          if (signupApplicationId) {
            const { data: application } = await supabaseAdmin
              .from("signup_applications")
              .select("metadata")
              .eq("id", signupApplicationId)
              .maybeSingle();
            const metadata = isJsonRecord(application?.metadata) ? application.metadata : {};

            await supabaseAdmin
              .from("signup_applications")
              .update({
                metadata: {
                  ...metadata,
                  onboarding_payment_status: "paid",
                  onboarding_checkout_session_id: session.id,
                  onboarding_paid_at: new Date().toISOString(),
                  restaurant_launch_pack_id: restaurantLaunchPackId,
                  restaurant_subscription_plan_id: planId,
                  restaurant_subscription_plan_slug: planSlug,
                  stripe_subscription_id: stripeSubscription?.id || null,
                },
              })
              .eq("id", signupApplicationId);
          }

          try {
            const { data: restaurant } = await supabaseAdmin
              .from("restaurants")
              .select("owner_id, name")
              .eq("id", restaurantId)
              .maybeSingle();

            if (restaurant?.owner_id) {
              const paidAmount = ((session.amount_total || 0) / 100).toFixed(2);
              await enqueueNotification({
                adminClient: supabaseAdmin,
                userId: restaurant.owner_id,
                title: "Onboarding restaurateur paye",
                body: `Votre pack ${pack?.name || "de lancement"} et votre abonnement TOK ont ete payes avec succes (${paidAmount} CHF). L'administration peut finaliser la validation de votre compte.`,
                type: "payment",
                category: "transactional",
                data: {
                  signup_application_id: signupApplicationId,
                  restaurant_launch_pack_id: restaurantLaunchPackId,
                  pack_id: packId,
                  plan_id: planId,
                  restaurant_id: restaurantId,
                  restaurant_name: restaurant.name,
                  paid_amount: paidAmount,
                  url: "/dashboard",
                },
              });
              await triggerNotificationDispatch({ source: "stripe-webhook-restaurant-onboarding", push: true, email: true });
            }
          } catch (error) {
            log.error("restaurant_onboarding_notification_failed", { message: error instanceof Error ? error.message : "unknown" });
          }

          break;
        }

        if (checkoutKind === "restaurant-subscription-upgrade") {
          const planId = session.metadata?.plan_id || session.metadata?.restaurant_subscription_plan_id || null;
          const planSlug = session.metadata?.restaurant_subscription_plan_slug || null;
          const restaurantId = session.metadata?.restaurant_id || null;
          const previousStripeSubscriptionId = session.metadata?.previous_stripe_subscription_id || null;
          const subscriptionAmount = Number(session.metadata?.subscription_amount || 0);

          if (!userId || !planId || !planSlug || !restaurantId) {
            log.warn("restaurant_subscription_upgrade_missing_metadata", { sessionId: session.id });
            break;
          }

          let stripeSubscription: Stripe.Subscription | null = null;
          if (typeof session.subscription === "string") {
            stripeSubscription = await stripe.subscriptions.retrieve(session.subscription);
          } else {
            log.warn("restaurant_subscription_upgrade_no_subscription", { sessionId: session.id });
            break;
          }

          const syncResult = await syncRestaurantSubscriptionRecord({
            adminClient: supabaseAdmin,
            subscription: stripeSubscription,
            stripeMode: event.livemode ? "live" : "test",
            stripeCheckoutSessionId: session.id,
            log,
          });

          if (!syncResult.updated) {
            log.warn("restaurant_subscription_upgrade_sync_skipped", { sessionId: session.id });
            break;
          }

          await recordTokOnePaymentIfMissing({
            adminClient: supabaseAdmin,
            session,
            userId,
            planId,
            billingPeriod: "monthly",
            stripeSubscriptionId: stripeSubscription.id,
            stripeMode: event.livemode ? "live" : "test",
            eventId: event.id,
            amountOverride: subscriptionAmount,
            checkoutKind: "restaurant-subscription-upgrade",
            metadata: {
              charge_component: "restaurant_subscription_upgrade",
              restaurant_id: restaurantId,
              restaurant_subscription_plan_id: planId,
              restaurant_subscription_plan_slug: planSlug,
              previous_stripe_subscription_id: previousStripeSubscriptionId,
            },
            log,
          });

          if (previousStripeSubscriptionId && previousStripeSubscriptionId !== stripeSubscription.id) {
            try {
              await stripe.subscriptions.cancel(previousStripeSubscriptionId, {
                invoice_now: false,
                prorate: false,
              });
            } catch (error) {
              log.error("restaurant_subscription_previous_cancel_failed", {
                previousStripeSubscriptionId,
                message: error instanceof Error ? error.message : "unknown",
              });
            }
          }

          try {
            const { data: restaurant } = await supabaseAdmin
              .from("restaurants")
              .select("owner_id, name")
              .eq("id", restaurantId)
              .maybeSingle();

            if (restaurant?.owner_id) {
              await enqueueNotification({
                adminClient: supabaseAdmin,
                userId: restaurant.owner_id,
                title: "Abonnement restaurateur upgrade",
                body: `Votre abonnement TOK est passe sur l'offre ${planSlug}. Vos nouveaux credits sont en cours d'activation.`,
                type: "subscription",
                category: "transactional",
                data: {
                  restaurant_id: restaurantId,
                  restaurant_name: restaurant.name,
                  plan_id: planId,
                  plan_slug: planSlug,
                  stripe_subscription_id: stripeSubscription.id,
                  url: "/dashboard/mon-compte-facturation",
                },
              });
              await triggerNotificationDispatch({ source: "stripe-webhook-restaurant-subscription-upgrade", push: true, email: true });
            }
          } catch (error) {
            log.error("restaurant_subscription_upgrade_notification_failed", { message: error instanceof Error ? error.message : "unknown" });
          }

          log.info("restaurant_subscription_upgrade_completed", {
            restaurantId,
            planSlug,
            subscriptionId: stripeSubscription.id,
          });

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

          const paymentDetails = await getStripePaymentMethodDetails(stripe, session, log);
          await finalizeZeroAttenteCheckout({
            adminClient: supabaseAdmin,
            session,
            userId,
            cardBrand: paymentDetails.cardBrand,
            cardLast4: paymentDetails.cardLast4,
            billingPhone: paymentDetails.billingPhone,
            log,
            shouldDispatchNotifications: true,
            fetchLineItems: () => stripe.checkout.sessions.listLineItems(session.id, {
              limit: 100,
              expand: ["data.price.product"],
            }),
          });
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
        } else if (isZeroAttenteCheckoutKind(checkoutKind)) {
          const { error: releaseError } = await supabaseAdmin
            .from("reservations")
            .update({
              status: "cancelled",
              metadata: {
                ...(session.metadata || {}),
                checkout_session_id: session.id,
                checkout_session_state: "expired",
                hold_released_at: new Date().toISOString(),
              },
              updated_at: new Date().toISOString(),
            })
            .eq("feature", "zero-attente")
            .eq("status", "pending")
            .filter("metadata->>checkout_session_id", "eq", session.id);

          if (releaseError) {
            log.error("zero_attente_hold_release_failed", {
              sessionId: session.id,
              message: releaseError.message,
            });
          }
        } else if (checkoutKind === "chefs-table") {
          const { error: releaseError } = await supabaseAdmin.rpc(
            "release_chef_table_checkout_hold",
            { p_session_id: session.id },
          );

          if (releaseError) {
            log.error("chef_table_hold_release_failed", {
              sessionId: session.id,
              message: releaseError.message,
            });
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
          stripeMode: event.livemode ? "live" : "test",
        });

        if (!syncResult.updated) {
          const restaurantSyncResult = await syncRestaurantSubscriptionRecord({
            adminClient: supabaseAdmin,
            subscription,
            stripeMode: event.livemode ? "live" : "test",
            log,
          });

          if (!restaurantSyncResult.updated) {
            log.warn("tok_one_subscription_skipped", { subscriptionId: subscription.id });
            break;
          }

          log.info("restaurant_subscription_synced", {
            eventType: event.type,
            subscriptionId: subscription.id,
            restaurantId: restaurantSyncResult.row?.restaurant_id || null,
          });
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
            title: "Abonnement Tok One mis à jour",
            body: "Votre abonnement Tok One n'est plus actif. Mettez à jour votre moyen de paiement pour retrouver vos avantages.",
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
