import Stripe from "npm:stripe@18.5.0";

import {
  HttpError,
  authenticateRequest,
  assertProductionFlowAllowed,
  buildRequestMetadata,
  createAdminClient,
  jsonResponse,
  requireRestaurantAccess,
  writeAuditLog,
} from "../_shared/auth.ts";
import { buildCorsHeaders, handleCorsPreflight } from "../_shared/cors.ts";
import {
  isCommercialDemoHostRequest,
  isCommercialDemoUrl,
} from "../_shared/commercial-demo-host.ts";
import { makeLogger } from "../_shared/logging.ts";
import { normalizeCheckoutReturnUrl } from "../_shared/return-url.ts";
import { getStripeRuntimeForCheckoutKind } from "../_shared/stripe-client.ts";
import {
  abandonPaymentAttemptSession,
  acquirePaymentAttempt,
  assertCheckoutSessionIntegrity,
  bindPaymentAttemptStripe,
  cancelPaymentAttempt as cancelPersistedPaymentAttempt,
  failPaymentAttempt,
  fingerprintPaymentAttemptRequest,
  readStripeObjectId,
  requireClientPaymentAttemptId,
  sealPaymentAttemptRequest,
  type AcquiredPaymentAttempt,
} from "../_shared/payment-attempts.ts";
import { getLatestTokOneSubscription, isTokOneEntitledStatus } from "../_shared/tok-one.ts";
import { createRateLimiter } from "../_shared/rate-limit.ts";
import {
  assertPaymentMethodAllowed,
  getEffectiveFeatureFlagSet,
} from "../_shared/feature-flags.ts";
import {
  FAIR_GROWTH_ANNUAL_MONTHS_CHARGED,
  getRestaurantSubscriptionAmountCents,
  getRestaurantSubscriptionStripeInterval,
  isFairGrowthAnnualBillingEnabled,
  parseRestaurantSubscriptionBillingPeriod,
  type RestaurantSubscriptionBillingPeriod,
} from "../_shared/restaurant-subscription-billing.ts";
import {
  buildVerifiedOrderPricing,
  isClientCheckoutRestaurantEligible,
} from "../_shared/order-pricing.ts";
import {
  MARKETPLACE_CHECKOUT_KINDS,
  resolveMarketplaceRouting,
} from "../_shared/marketplace-finance.ts";
import {
  markOrderCheckoutSessionState,
  persistOrderCheckoutSessionMapping,
} from "../_shared/order-checkout.ts";

const toMoney = (value: unknown) => Math.max(0, Number(value) || 0);
type CheckoutItem = Record<string, unknown>;
const CLIENT_STRIPE_CHECKOUT_KINDS = new Set(["order", "zero-attente", "chefs-table"]);
const RESTAURANT_CREDIT_ONLY_CHECKOUT_KINDS = new Set(["campaign"]);
const RECOGNIZED_CHECKOUT_KINDS = new Set([
  "order",
  "zero-attente",
  "chefs-table",
  "restaurant-onboarding",
  "restaurant-subscription-upgrade",
  "restaurant-credit-pack",
  "tok-one",
  // Retain legacy kinds only so their explicit, user-facing rejection paths
  // below remain reachable. They never proceed to Stripe.
  "launch-pack",
  "campaign",
]);
const STRIPE_CHECKOUT_PAYMENT_METHODS = new Set(["card", "twint"]);
const TWINT_MAX_CHECKOUT_AMOUNT_CENTS = 500_000;
const CHECKOUT_CURRENCY = "CHF";

function normalizeCheckoutKind(value: unknown) {
  return String(value || "order").trim().toLowerCase();
}

function normalizePaymentMethod(value: unknown) {
  return String(value || "card").trim().toLowerCase();
}

function assertRestaurantOnboardingSetupSessionIntegrity(input: {
  session: Stripe.Checkout.Session;
  livemode: boolean;
  userId: string;
  paymentAttemptId: string;
  operationKey: string;
  stripeCustomerId: string;
  billingPeriod: RestaurantSubscriptionBillingPeriod;
  reservedAmountCents: number;
}) {
  const { session } = input;
  const metadata = session.metadata || {};
  const actualMode = input.livemode ? "live" : "test";
  const sessionLivemode = (session as Stripe.Checkout.Session & { livemode?: boolean }).livemode;

  if (session.mode !== "setup") {
    throw new Error(`STRIPE_SETUP_MODE_MISMATCH:${session.mode}`);
  }
  if (metadata.checkout_kind !== "restaurant-onboarding") {
    throw new Error("STRIPE_SETUP_CHECKOUT_KIND_MISMATCH");
  }
  if (metadata.stripe_mode && metadata.stripe_mode !== actualMode) {
    throw new Error(`STRIPE_MODE_MISMATCH:${metadata.stripe_mode}:${actualMode}`);
  }
  if (typeof sessionLivemode === "boolean" && sessionLivemode !== input.livemode) {
    throw new Error("STRIPE_SESSION_EVENT_MODE_MISMATCH");
  }
  if (session.payment_status !== "no_payment_required") {
    throw new Error(`STRIPE_SETUP_PAYMENT_STATUS_MISMATCH:${session.payment_status}`);
  }
  if (session.amount_total != null && Number(session.amount_total) !== 0) {
    throw new Error(`STRIPE_SETUP_AMOUNT_MISMATCH:${session.amount_total}`);
  }
  const sessionCurrency = String(session.currency || "").toLowerCase();
  if (sessionCurrency && sessionCurrency !== "chf") {
    throw new Error(`STRIPE_SETUP_CURRENCY_MISMATCH:${sessionCurrency}`);
  }
  if (readStripeObjectId(session.payment_intent) || readStripeObjectId(session.subscription)) {
    throw new Error("STRIPE_SETUP_UNEXPECTED_PAYMENT_RESOURCE");
  }
  if (readStripeObjectId(session.customer) !== input.stripeCustomerId) {
    throw new Error("STRIPE_SETUP_CUSTOMER_MISMATCH");
  }
  if (
    metadata.user_id !== input.userId
    || metadata.payment_attempt_id !== input.paymentAttemptId
    || metadata.operation_key !== input.operationKey
  ) {
    throw new Error("STRIPE_SETUP_ATTEMPT_IDENTITY_MISMATCH");
  }
  if (
    !metadata.signup_application_id
    || !metadata.restaurant_id
    || !metadata.plan_id
    || !metadata.restaurant_subscription_plan_slug
  ) {
    throw new Error("STRIPE_SETUP_BUSINESS_IDENTITY_MISSING");
  }
  if (Number(metadata.authoritative_total_cents || 0) !== 0) {
    throw new Error("STRIPE_SETUP_AUTHORITATIVE_TOTAL_MISMATCH");
  }
  if (Number(metadata.reserved_subscription_amount_cents || 0) <= 0) {
    throw new Error("STRIPE_SETUP_RESERVED_SUBSCRIPTION_AMOUNT_MISSING");
  }
  if (
    metadata.billing_period !== input.billingPeriod
    || Number(metadata.reserved_subscription_amount_cents || 0) !== input.reservedAmountCents
  ) {
    throw new Error("STRIPE_SETUP_RESERVED_SUBSCRIPTION_SNAPSHOT_MISMATCH");
  }
}

function getCheckoutItemRestaurantId(item: CheckoutItem, fallbackRestaurantId: string) {
  return String(item?.restaurant_id || item?.restaurantId || fallbackRestaurantId);
}

function getCheckoutItemPaymentGroupKey(item: CheckoutItem, fallbackRestaurantId: string) {
  const restaurantId = getCheckoutItemRestaurantId(item, fallbackRestaurantId);
  const metadata = item?.metadata && typeof item.metadata === "object" && !Array.isArray(item.metadata)
    ? item.metadata as Record<string, unknown>
    : {};

  if (metadata.is_meal_subscription) {
    const deliveryDate = String(metadata.delivery_date || metadata.subscription_day || "jour");
    const deliveryTime = String(metadata.delivery_time || metadata.preferred_time || "12:00");
    return `${restaurantId}|abonnement|${deliveryDate}|${deliveryTime}`;
  }

  return restaurantId;
}

Deno.serve(async (req) => {
  const corsHeaders = buildCorsHeaders(req);
  const preflight = handleCorsPreflight(req, corsHeaders);
  if (preflight) return preflight;

  const log = makeLogger("create-checkout");

  let actor: Awaited<ReturnType<typeof authenticateRequest>> | null = null;
  let auditKind = "order";
  let auditTargetEntityType = "restaurants";
  let auditTargetEntityId = "";
  let activeAttempt: (AcquiredPaymentAttempt & { adminClient: any; stripeSessionId?: string | null }) | null = null;

  try {
    // Origin/Referer is only defense in depth; the authoritative account
    // check below is still required because non-browser clients can omit it.
    if (isCommercialDemoHostRequest(req)) {
      throw new HttpError(
        403,
        "COMMERCIAL_DEMO_LIVE_CHECKOUT_BLOCKED: utilisez le paiement Stripe Test de la démonstration commerciale.",
      );
    }

    actor = await authenticateRequest(req, { allowServiceRole: false });
    if (!actor.userId) {
      throw new HttpError(401, "Unauthorized");
    }
    await assertProductionFlowAllowed(actor, "paiement réel");

    const requestMetadata = buildRequestMetadata(req);
    const rateLimiter = createRateLimiter(actor.adminClient, "create-checkout");
    await rateLimiter.consume(`user:${actor.userId}`, { maxRequests: 12, windowSeconds: 300 });
    if (requestMetadata.ip) {
      await rateLimiter.consume(`ip:${requestMetadata.ip}`, { maxRequests: 60, windowSeconds: 300 });
    }
    await rateLimiter.consume("global", { maxRequests: 500, windowSeconds: 60 });

    const {
      items,
      payment_method,
      return_url,
      order_metadata,
      checkout_kind,
      payment_attempt_id,
    } = await req.json();

    // The client creates this UUID once per business operation and persists it
    // until Stripe reaches a terminal state. A retry/refresh must reuse it.
    const clientPaymentAttemptId = requireClientPaymentAttemptId(
      payment_attempt_id || order_metadata?.payment_attempt_id,
    );
    const idempotencySource = clientPaymentAttemptId;
    // Legacy contract markers: idempotencyKey: `tok-checkout: and
    // stripe.checkout.sessions.create(sessionParams, checkoutRequestOptions)
    // are superseded by a sealed snapshot and generation-safe database key.

    if (isCommercialDemoUrl(return_url)) {
      throw new HttpError(
        403,
        "COMMERCIAL_DEMO_LIVE_CHECKOUT_BLOCKED: une URL commerciale ne peut pas être utilisée par le paiement réel.",
      );
    }

    const effectiveKind = normalizeCheckoutKind(checkout_kind || order_metadata?.checkout_kind || "order");
    if (effectiveKind === "commercial-demo-order" || effectiveKind === "commercial_demo_order") {
      throw new HttpError(
        400,
        "Les commandes de demonstration commerciale utilisent exclusivement le paiement Stripe Test dedie.",
      );
    }
    if (!RECOGNIZED_CHECKOUT_KINDS.has(effectiveKind)) {
      throw new HttpError(400, "Type de checkout non pris en charge.");
    }
    const normalizedPaymentMethod = normalizePaymentMethod(payment_method);
    if (RESTAURANT_CREDIT_ONLY_CHECKOUT_KINDS.has(effectiveKind)) {
      throw new HttpError(
        400,
        "Les campagnes se reglent uniquement avec les credits TOK. Rechargez votre solde depuis Mon compte/Facturation ou attendez le prochain renouvellement.",
      );
    }
    if (CLIENT_STRIPE_CHECKOUT_KINDS.has(effectiveKind) && ["cash", "credits"].includes(normalizedPaymentMethod)) {
      throw new HttpError(400, "Ce parcours client doit etre regle avec un moyen de paiement Stripe.");
    }

    const isRestaurantOnboardingSetup = effectiveKind === "restaurant-onboarding";
    const isSubscriptionCheckout =
      effectiveKind === "tok-one"
      || effectiveKind === "restaurant-subscription-upgrade";
    const isSubscriptionLifecycleCheckout = isSubscriptionCheckout || isRestaurantOnboardingSetup;
    const stripeRuntime = getStripeRuntimeForCheckoutKind(effectiveKind);
    const stripe = stripeRuntime.stripe;
    const { data: preexistingAttempt, error: preexistingAttemptError } = await actor.adminClient
      .from("payment_attempts")
      .select("id, operation_key, owner_user_id, kind, mode, amount_cents, currency, request_fingerprint, request_snapshot")
      .eq("operation_key", clientPaymentAttemptId)
      .eq("owner_user_id", actor.userId)
      .maybeSingle();
    if (preexistingAttemptError) throw new HttpError(500, preexistingAttemptError.message);
    if (
      preexistingAttempt
      && (preexistingAttempt.kind !== effectiveKind || preexistingAttempt.mode !== stripeRuntime.mode)
    ) {
      throw new HttpError(409, "PAYMENT_ATTEMPT_IDENTITY_MISMATCH");
    }
    const safeReturnUrl = normalizeCheckoutReturnUrl(return_url);
    if (!safeReturnUrl) {
      throw new HttpError(400, "URL de retour invalide");
    }
    const requestIdentity = {
      checkout_kind: effectiveKind,
      payment_method: normalizedPaymentMethod,
      return_url: safeReturnUrl,
      items: Array.isArray(items) ? items : [],
      order_metadata: order_metadata || {},
    };
    const requestFingerprint = await fingerprintPaymentAttemptRequest(requestIdentity);
    if (
      preexistingAttempt?.request_fingerprint
      && preexistingAttempt.request_fingerprint !== requestFingerprint
    ) {
      throw new HttpError(409, "PAYMENT_ATTEMPT_REQUEST_MISMATCH");
    }

    auditKind = effectiveKind;
    const activeFlags = await getEffectiveFeatureFlagSet(actor.adminClient);
    try {
      assertPaymentMethodAllowed({
        activeFlags,
        paymentMethod: normalizedPaymentMethod,
        cashAllowed: false,
      });
    } catch (error) {
      throw new HttpError(400, error instanceof Error ? error.message : "Moyen de paiement indisponible.");
    }

    if (["postfinance_card", "postfinance_efinance"].includes(normalizedPaymentMethod)) {
      throw new HttpError(
        400,
        "Les paiements PostFinance sont temporairement indisponibles. Utilisez la carte bancaire ou TWINT.",
      );
    }
    if (!STRIPE_CHECKOUT_PAYMENT_METHODS.has(normalizedPaymentMethod)) {
      throw new HttpError(400, "Moyen de paiement Stripe non pris en charge.");
    }


    let lineItems: Stripe.Checkout.SessionCreateParams.LineItem[] = [];
    let discountCents = 0;
    let zeroAttenteHoldReservationId = "";
    let chefTableHoldCount = 0;
    let creditPackPurchaseId = "";
    let creditPackPurchaseDraft: Record<string, unknown> | null = null;
    let marketplaceRestaurantId = "";
    let marketplaceDeliveryPassThroughCents = 0;
    // Tips remain zero until a dedicated server-priced Stripe line item exists.
    // Never trust an arbitrary client metadata amount for the restaurant's tip.
    const marketplaceTipCents = 0;
    let restaurantOnboardingStripeCustomerId = "";
    let restaurantOnboardingBillingPeriod: RestaurantSubscriptionBillingPeriod = "monthly";
    let restaurantOnboardingReservedAmountCents = 0;
    const chefTableHoldItems: Array<{ drop_id: string; quantity: number }> = [];
    let sessionMetadata: Record<string, string> = {
      user_id: actor.userId || "",
      checkout_kind: effectiveKind,
      stripe_mode: stripeRuntime.mode,
      stripe_key_scope: stripeRuntime.isolatedTokOneKey ? "tok_one" : "default",
      payment_method_label: normalizedPaymentMethod,
      order_reference: String(order_metadata?.order_reference || ""),
      restaurant_id: String(order_metadata?.restaurant_id || ""),
      campaign_id: String(order_metadata?.campaign_id || ""),
      campaign_title: String(order_metadata?.campaign_title || ""),
      checkout_id: String(order_metadata?.checkout_id || ""),
      checkout_group_id: String(order_metadata?.checkout_group_id || ""),
      primary_order_id: String(order_metadata?.primary_order_id || ""),
      checkout_session_state: String(order_metadata?.checkout_session_state || ""),
      formula_applied: String(order_metadata?.formula_applied || ""),
      formula_discount_amount: "0.00",
      formula_discount_percent: String(order_metadata?.formula_discount_percent || ""),
      promo_applied: "",
      promo_discount_amount: "0.00",
      promo_code_id: String(order_metadata?.promo_code_id || ""),
      promo_code_discount_amount: "0.00",
      points_to_redeem: String(order_metadata?.points_to_redeem || 0),
      points_discount_amount: "0.00",
      flex_discount_amount: "0.00",
      miamz_delivery_discount_amount: "0.00",
      miamz_delivery_discount_percent: "0.00",
      miamz_benefits_applied: "",
      miamz_points_multiplier: "1.00",
      authoritative_total: "0.00",
      pre_discount_subtotal: String(order_metadata?.pre_discount_subtotal || ""),
      arrival_date: String(order_metadata?.arrival_date || ""),
      arrival_time: String(order_metadata?.arrival_time || ""),
      party_size: String(order_metadata?.party_size || ""),
      delivery_date: String(order_metadata?.delivery_date || ""),
      delivery_time: String(order_metadata?.delivery_time || ""),
      pickup_date: String(order_metadata?.pickup_date || ""),
      pickup_time: String(order_metadata?.pickup_time || ""),
      scheduled_delivery_label: String(order_metadata?.scheduled_delivery_label || ""),
    };

    if (effectiveKind === "launch-pack") {
      throw new HttpError(410, "Les packs de lancement ne sont plus commercialises. Choisissez un abonnement ou un pack de credits IA.");
    } else if (effectiveKind === "restaurant-onboarding") {
      const planId = String(order_metadata?.plan_id || "");
      const restaurantId = String(order_metadata?.restaurant_id || "");
      const signupApplicationId = String(order_metadata?.signup_application_id || "");
      const billingPeriod = parseRestaurantSubscriptionBillingPeriod(
        order_metadata?.billing_period || "monthly",
      );
      let applicationSubscriptionId = "";

      if (!planId) throw new HttpError(400, "plan_id requis");
      if (!restaurantId) throw new HttpError(400, "restaurant_id requis");
      if (!signupApplicationId) throw new HttpError(400, "signup_application_id requis");
      if (!billingPeriod) throw new HttpError(400, "La periode d'abonnement restaurateur est invalide");
      if (billingPeriod === "yearly" && !isFairGrowthAnnualBillingEnabled(activeFlags)) {
        throw new HttpError(503, "La facturation annuelle Fair Growth n'est pas encore activee");
      }
      if (normalizedPaymentMethod !== "card") {
        throw new HttpError(400, "L'onboarding restaurateur requiert un paiement par carte");
      }

      auditKind = "restaurant-onboarding";
      auditTargetEntityType = "signup_applications";
      auditTargetEntityId = signupApplicationId || restaurantId;

      await requireRestaurantAccess(actor, restaurantId);

      if (signupApplicationId) {
        const { data: application, error: applicationError } = await actor.adminClient
          .from("signup_applications")
          .select("id, user_id, requested_role, selected_subscription_plan_id, selected_subscription_billing_period, restaurant_subscription_id, metadata")
          .eq("id", signupApplicationId)
          .maybeSingle();

        if (applicationError) throw new HttpError(500, applicationError.message);
        if (!application) throw new HttpError(404, "Dossier d'inscription introuvable");
        if (application.user_id !== actor.userId || application.requested_role !== "restaurateur") {
          throw new HttpError(403, "Dossier d'inscription invalide");
        }

        const applicationMetadata = application.metadata && typeof application.metadata === "object"
          ? application.metadata as Record<string, unknown>
          : {};
        const applicationRestaurantId = String(applicationMetadata.restaurant_id || "");
        const selectedPlanId = String(
          application.selected_subscription_plan_id
          || applicationMetadata.selected_subscription_plan_id
          || "",
        );
        const selectedBillingPeriod = String(
          application.selected_subscription_billing_period
          || applicationMetadata.selected_subscription_billing_period
          || "monthly",
        );
        applicationSubscriptionId = String(application.restaurant_subscription_id || "");

        if (applicationRestaurantId && applicationRestaurantId !== restaurantId) {
          throw new HttpError(403, "Restaurant du dossier invalide");
        }
        if (selectedPlanId && selectedPlanId !== planId) {
          throw new HttpError(400, "L'abonnement choisi ne correspond pas au dossier");
        }
        if (selectedBillingPeriod && selectedBillingPeriod !== billingPeriod) {
          throw new HttpError(400, "La periode d'abonnement ne correspond pas au dossier");
        }
      }

      const { data: plan, error: planError } = await actor.adminClient
        .from("restaurant_subscription_plans")
        .select("id, slug, name, description, price_monthly_chf, campaign_credit_chf, ai_tool_credits, ai_photo_credits, monthly_conversation_limit, monthly_text_tool_limit, monthly_image_limit, monthly_premium_image_limit, monthly_voice_minutes_limit, is_active")
        .eq("id", planId)
        .eq("is_active", true)
        .maybeSingle();

      if (planError) throw new HttpError(500, planError.message);
      if (!plan) throw new HttpError(404, "Plan introuvable ou inactif");

      const { data: existingSub, error: existingSubError } = await actor.adminClient
        .from("restaurant_ai_subscriptions")
        .select("id, status, current_period_end, signup_application_id, restaurant_subscription_plan_id, billing_period, price_monthly_chf_snapshot, billing_amount_chf_snapshot, annual_months_charged_snapshot, pricing_version_snapshot")
        .eq("restaurant_id", restaurantId)
        .eq("signup_application_id", signupApplicationId)
        .eq("restaurant_subscription_plan_id", planId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (existingSubError) throw new HttpError(500, existingSubError.message);
      if (!existingSub) {
        throw new HttpError(409, "Le contrat d'abonnement réservé n'est pas encore prêt");
      }
      if (applicationSubscriptionId && existingSub.id !== applicationSubscriptionId) {
        throw new HttpError(409, "Le contrat d'abonnement ne correspond pas au dossier");
      }
      if (existingSub.billing_period !== billingPeriod) {
        throw new HttpError(409, "La periode d'abonnement ne correspond pas au contrat reserve");
      }

      const subscriptionAmountCents = Math.round(Number(existingSub.billing_amount_chf_snapshot) * 100);
      const expectedSubscriptionAmountCents = getRestaurantSubscriptionAmountCents(
        existingSub.price_monthly_chf_snapshot,
        billingPeriod,
      );
      if (
        !Number.isSafeInteger(subscriptionAmountCents)
        || subscriptionAmountCents <= 0
        || subscriptionAmountCents !== expectedSubscriptionAmountCents
        || (billingPeriod === "yearly"
          && Number(existingSub.annual_months_charged_snapshot) !== FAIR_GROWTH_ANNUAL_MONTHS_CHARGED)
      ) {
        throw new HttpError(409, "Le montant reserve de l'abonnement est invalide");
      }
      const subscriptionAmount = subscriptionAmountCents / 100;
      restaurantOnboardingBillingPeriod = billingPeriod;
      restaurantOnboardingReservedAmountCents = subscriptionAmountCents;

      const existingSubscriptionStatus = String(existingSub.status || "").toLowerCase();
      if (!["awaiting_payment_method", "past_due"].includes(existingSubscriptionStatus)) {
        if (["awaiting_activation", "activation_pending"].includes(existingSubscriptionStatus)) {
          throw new HttpError(409, "Votre carte est déjà enregistrée pour cet abonnement");
        }
        if (isTokOneEntitledStatus(existingSubscriptionStatus)) {
          throw new HttpError(409, "Vous avez deja un abonnement actif");
        }
        throw new HttpError(409, "Ce parcours d'onboarding n'est plus disponible pour cet abonnement");
      }

      if (existingSub?.id) {
        const { data: savedPaymentMethod, error: savedPaymentMethodError } = await actor.adminClient
          .from("restaurant_subscription_payment_methods")
          .select("stripe_customer_id")
          .eq("subscription_id", existingSub.id)
          .maybeSingle();
        if (savedPaymentMethodError) {
          throw new HttpError(500, savedPaymentMethodError.message);
        }
        restaurantOnboardingStripeCustomerId = String(savedPaymentMethod?.stripe_customer_id || "");
      }
      if (
        restaurantOnboardingStripeCustomerId
        && !restaurantOnboardingStripeCustomerId.startsWith("cus_")
      ) {
        throw new HttpError(500, "Identifiant client Stripe restaurateur invalide");
      }

      if (!restaurantOnboardingStripeCustomerId) {
        const customerSearch = await stripe.customers.search({
          query: `metadata['signup_application_id']:'${signupApplicationId}'`,
          limit: 10,
        });
        const matchingCustomer = customerSearch.data.find((customer) =>
          customer.metadata?.restaurant_id === restaurantId
          && customer.metadata?.user_id === actor.userId
        );

        if (matchingCustomer) {
          restaurantOnboardingStripeCustomerId = matchingCustomer.id;
        } else {
          const onboardingUser = actor.userClient
            ? await actor.userClient.auth.getUser()
            : null;
          const customer = await stripe.customers.create(
            {
              email: onboardingUser?.data.user?.email || undefined,
              metadata: {
                checkout_kind: "restaurant-onboarding",
                signup_application_id: signupApplicationId,
                restaurant_id: restaurantId,
                user_id: actor.userId,
              },
            },
            {
              idempotencyKey: `tok-restaurant-onboarding-customer:${signupApplicationId}`,
            },
          );
          restaurantOnboardingStripeCustomerId = customer.id;
        }
      }
      // Onboarding only saves a reusable card for a future off-session charge.
      // No subscription, invoice or card authorization is created here: the
      // durable activation worker starts billing after the first qualifying
      // reservation/order.
      lineItems = [];

      // A Stripe object accepts at most 50 metadata pairs. Keep the setup
      // session deliberately small and authoritative: entitlements are read
      // from the versioned plan in Postgres when the deferred worker starts
      // the real subscription.
      sessionMetadata = {
        user_id: actor.userId,
        checkout_kind: effectiveKind,
        stripe_mode: stripeRuntime.mode,
        stripe_key_scope: stripeRuntime.isolatedTokOneKey ? "tok_one" : "default",
        payment_method_label: "card",
        restaurant_id: restaurantId,
        signup_application_id: signupApplicationId,
        plan_id: plan.id,
        restaurant_subscription_plan_id: plan.id,
        restaurant_subscription_plan_slug: plan.slug,
        plan_name: plan.name,
        billing_period: billingPeriod,
        subscription_amount: subscriptionAmount.toFixed(2),
        reserved_subscription_amount_cents: String(subscriptionAmountCents),
        annual_months_charged: billingPeriod === "yearly"
          ? String(FAIR_GROWTH_ANNUAL_MONTHS_CHARGED)
          : "1",
        service_months: billingPeriod === "yearly" ? "12" : "1",
        entitlement_reset_period: "monthly",
        pricing_version: String(existingSub.pricing_version_snapshot || ""),
        billing_start_trigger: "first_real_reservation_or_order",
        activation_recovery: existingSubscriptionStatus === "past_due" ? "true" : "false",
        authoritative_total: "0.00",
      };
    } else if (effectiveKind === "restaurant-subscription-upgrade") {
      const planId = String(order_metadata?.plan_id || "");
      const restaurantId = String(order_metadata?.restaurant_id || "");
      const activeChangeRequiresSchedulingCode = "restaurant_subscription_active_change_requires_scheduling";

      if (!planId) throw new HttpError(400, "plan_id requis");
      if (!restaurantId) throw new HttpError(400, "restaurant_id requis");
      if (normalizedPaymentMethod !== "card") {
        throw new HttpError(400, "L'upgrade d'abonnement restaurateur requiert un paiement par carte");
      }

      auditKind = "restaurant-subscription-upgrade";
      auditTargetEntityType = "restaurant_ai_subscriptions";
      auditTargetEntityId = restaurantId;

      await requireRestaurantAccess(actor, restaurantId);

      const { data: plan, error: planError } = await actor.adminClient
        .from("restaurant_subscription_plans")
        .select("id, slug, name, description, price_monthly_chf, campaign_credit_chf, ai_tool_credits, ai_photo_credits, monthly_conversation_limit, monthly_text_tool_limit, monthly_image_limit, monthly_premium_image_limit, monthly_voice_minutes_limit, is_active, position")
        .eq("id", planId)
        .eq("is_active", true)
        .maybeSingle();

      if (planError) throw new HttpError(500, planError.message);
      if (!plan) throw new HttpError(404, "Plan introuvable ou inactif");

      const { data: existingSub, error: existingSubError } = await actor.adminClient
        .from("restaurant_ai_subscriptions")
        .select("id, plan, status, billing_period, current_period_end, restaurant_subscription_plan_id, stripe_subscription_id")
        .eq("restaurant_id", restaurantId)
        .maybeSingle();

      if (existingSubError) throw new HttpError(500, existingSubError.message);

      const billingPeriod = parseRestaurantSubscriptionBillingPeriod(
        order_metadata?.billing_period || existingSub?.billing_period || "monthly",
      );
      if (!billingPeriod) throw new HttpError(400, "La periode d'abonnement restaurateur est invalide");
      if (billingPeriod === "yearly" && !isFairGrowthAnnualBillingEnabled(activeFlags)) {
        throw new HttpError(503, "La facturation annuelle Fair Growth n'est pas encore activee");
      }
      const subscriptionAmountCents = getRestaurantSubscriptionAmountCents(
        plan.price_monthly_chf,
        billingPeriod,
      );
      if (subscriptionAmountCents <= 0) throw new HttpError(400, "Prix du plan invalide");
      const subscriptionAmount = subscriptionAmountCents / 100;

      const hasActiveSubscription = Boolean(
        existingSub &&
        isTokOneEntitledStatus(existingSub.status) &&
        (!existingSub.current_period_end || new Date(existingSub.current_period_end) > new Date()),
      );

      // Never create a second full-price subscription over an already-paid
      // monthly or annual period. Every active plan change is scheduled on the
      // existing Stripe subscription by manage-restaurant-subscription.
      if (hasActiveSubscription) {
        log.warn(activeChangeRequiresSchedulingCode, {
          restaurantId,
          currentPlan: existingSub?.plan || null,
          requestedPlan: plan.slug,
          billingPeriod: existingSub?.billing_period || null,
        });
        throw new HttpError(
          409,
          "Un abonnement actif doit etre modifie depuis le changement programme en fin de periode payee.",
        );
      }

      lineItems = [
        {
          price_data: {
            currency: "chf",
            product_data: {
              name: `Abonnement restaurateur TOK - ${plan.name}`,
              description: String(plan.description || ""),
              metadata: {
                restaurant_subscription_plan_id: plan.id,
                restaurant_subscription_plan_slug: plan.slug,
              },
            },
            recurring: {
              interval: getRestaurantSubscriptionStripeInterval(billingPeriod),
            },
            unit_amount: subscriptionAmountCents,
          },
          quantity: 1,
        },
      ];

      sessionMetadata = {
        user_id: actor.userId,
        checkout_kind: effectiveKind,
        stripe_mode: stripeRuntime.mode,
        stripe_key_scope: stripeRuntime.isolatedTokOneKey ? "tok_one" : "default",
        payment_method_label: "card",
        restaurant_id: restaurantId,
        plan_id: plan.id,
        restaurant_subscription_plan_id: plan.id,
        restaurant_subscription_plan_slug: plan.slug,
        plan_name: plan.name,
        billing_period: billingPeriod,
        annual_months_charged: billingPeriod === "yearly"
          ? String(FAIR_GROWTH_ANNUAL_MONTHS_CHARGED)
          : "1",
        service_months: billingPeriod === "yearly" ? "12" : "1",
        entitlement_reset_period: "monthly",
        previous_restaurant_ai_subscription_id: String(existingSub?.id || ""),
        previous_stripe_subscription_id: String(existingSub?.stripe_subscription_id || ""),
        previous_subscription_plan_slug: String(existingSub?.plan || ""),
        subscription_amount: subscriptionAmount.toFixed(2),
        campaign_credit_chf: Number(plan.campaign_credit_chf || 0).toFixed(2),
        ai_tool_credits: String(plan.ai_tool_credits || 0),
        ai_photo_credits: String(plan.ai_photo_credits || 0),
        monthly_conversation_limit: String(plan.monthly_conversation_limit || 0),
        monthly_text_tool_limit: String(plan.monthly_text_tool_limit || 0),
        monthly_image_limit: String(plan.monthly_image_limit || 0),
        monthly_premium_image_limit: String(plan.monthly_premium_image_limit || 0),
        monthly_voice_minutes_limit: String(plan.monthly_voice_minutes_limit || 0),
        authoritative_total: subscriptionAmount.toFixed(2),
      };
    } else if (effectiveKind === "restaurant-credit-pack") {
      const packId = String(order_metadata?.credit_pack_id || order_metadata?.pack_id || "");
      const restaurantId = String(order_metadata?.restaurant_id || "");

      if (!packId) throw new HttpError(400, "credit_pack_id requis");
      if (!restaurantId) throw new HttpError(400, "restaurant_id requis");
      if (!["card", "twint"].includes(normalizedPaymentMethod)) {
        throw new HttpError(400, "Les packs de credits acceptent la carte bancaire ou TWINT");
      }

      auditKind = "restaurant-credit-pack";
      auditTargetEntityType = "restaurant_credit_packs";
      auditTargetEntityId = packId;

      await requireRestaurantAccess(actor, restaurantId);

      const { data: pack, error: packError } = await actor.adminClient
        .from("restaurant_credit_packs")
        .select("id, slug, name, description, price_chf, campaign_credit_chf, ai_tool_credits, ai_photo_credits, is_active")
        .eq("id", packId)
        .eq("is_active", true)
        .maybeSingle();

      if (packError) throw new HttpError(500, packError.message);
      if (!pack) throw new HttpError(404, "Pack de credits introuvable ou inactif");

      const packAmount = Number(pack.price_chf || 0);
      if (packAmount <= 0) throw new HttpError(400, "Prix du pack de credits invalide");

      // This row is created only after the durable attempt lease is acquired.
      // A retry looks it up through payment_attempt_id instead of inserting a
      // second pending purchase before Stripe is even contacted.
      creditPackPurchaseDraft = {
        restaurant_id: restaurantId,
        credit_pack_id: pack.id,
        purchased_by: actor.userId,
        status: "pending_payment",
        price_chf: packAmount,
        currency: "chf",
        campaign_credit_chf: Number(pack.campaign_credit_chf || 0),
        ai_tool_credits: Number(pack.ai_tool_credits || 0),
        ai_photo_credits: Number(pack.ai_photo_credits || 0),
        metadata: {
          checkout_kind: "restaurant-credit-pack",
          pack_slug: pack.slug,
          pack_name: pack.name,
          client_payment_attempt_id: clientPaymentAttemptId,
        },
      };

      lineItems = [{
        price_data: {
          currency: "chf",
          product_data: {
            name: `Pack de credits TOK - ${pack.name}`,
            description: String(pack.description || ""),
            metadata: {
              restaurant_credit_pack_id: pack.id,
              restaurant_credit_pack_slug: pack.slug,
            },
          },
          unit_amount: Math.round(packAmount * 100),
        },
        quantity: 1,
      }];

      sessionMetadata = {
        ...sessionMetadata,
        restaurant_id: restaurantId,
        credit_pack_id: pack.id,
        restaurant_credit_pack_id: pack.id,
        restaurant_credit_pack_slug: pack.slug,
        pack_name: pack.name,
        campaign_credit_chf: Number(pack.campaign_credit_chf || 0).toFixed(2),
        ai_tool_credits: String(pack.ai_tool_credits || 0),
        ai_photo_credits: String(pack.ai_photo_credits || 0),
        authoritative_total: packAmount.toFixed(2),
      };
    } else if (effectiveKind === "tok-one") {
      // ── Tok One premium subscription ──
      const planId = String(order_metadata?.plan_id || "");
      if (!planId) throw new HttpError(400, "plan_id requis");

      auditKind = "tok-one";
      auditTargetEntityType = "user_subscription_plans";
      auditTargetEntityId = planId;

      const { data: plan, error: planError } = await actor.adminClient
        .from("user_subscription_plans")
        .select("id, name, price_monthly, stripe_product_id, status")
        .eq("id", planId)
        .eq("status", "active")
        .maybeSingle();

      if (planError) throw new HttpError(500, planError.message);
      if (!plan) throw new HttpError(404, "Plan introuvable ou inactif");

      const billingPeriod = String(order_metadata?.billing_period || "monthly");
      if (billingPeriod !== "monthly") {
        throw new HttpError(400, "Les abonnements Tok One sont mensuels et renouveles automatiquement.");
      }
      const amount = Number(plan.price_monthly);

      if (amount <= 0) throw new HttpError(400, "Prix du plan invalide");

      // Check no existing active subscription
      if (normalizedPaymentMethod !== "card") {
        throw new HttpError(400, "Tok One requiert un paiement par carte");
      }

      const { data: existingSub, error: existingSubError } = await actor.adminClient
        .from("tok_one_subscriptions")
        .select("id, status, current_period_end")
        .eq("user_id", actor.userId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (existingSubError) throw new HttpError(500, existingSubError.message);

      const now = new Date();
      const hasActiveSubscription = Boolean(
        existingSub &&
        isTokOneEntitledStatus(existingSub.status) &&
        (!existingSub.current_period_end || new Date(existingSub.current_period_end) > now),
      );

      if (hasActiveSubscription) {
        throw new HttpError(409, "Vous avez deja un abonnement actif");
      }

      lineItems = [{
        price_data: {
          currency: "chf",
          product_data: {
            name: `Tok One - ${plan.name} (Mensuel)`,
          },
          recurring: {
            interval: "month",
          },
          unit_amount: Math.round(amount * 100),
        },
        quantity: 1,
      }];

      sessionMetadata = {
        ...sessionMetadata,
        plan_id: plan.id,
        plan_name: plan.name,
        billing_period: billingPeriod,
        billing_renewal: "auto_monthly",
        cancellation_notice_days: "3",
        stripe_mode: stripeRuntime.mode,
        stripe_key_scope: stripeRuntime.isolatedTokOneKey ? "tok_one" : "default",
        authoritative_total: amount.toFixed(2),
      };
    } else if (effectiveKind === "campaign") {
      throw new HttpError(
        400,
        "Les campagnes se reglent uniquement avec les credits TOK. Rechargez votre solde depuis Mon compte/Facturation ou attendez le prochain renouvellement.",
      );
    } else if (effectiveKind === "chefs-table") {
      if (!Array.isArray(items) || items.length === 0) {
        throw new HttpError(400, "Aucune experience La Table du Chef.");
      }

      auditTargetEntityType = "chef_table_drops";
      auditTargetEntityId = String(order_metadata?.checkout_group_id || "");

      const dropIds = Array.from(new Set(
        (items as CheckoutItem[])
          .map((item) => String(item?.metadata?.chef_table_drop_id || ""))
          .filter(Boolean),
      ));

      if (dropIds.length === 0) {
        throw new HttpError(400, "Drop La Table du Chef introuvable.");
      }

      const { data: dropRows, error: dropsError } = await actor.adminClient
        .from("chef_table_drops")
        .select("id, restaurant_id, chef_name, dish_name, price, original_price, drop_time, remaining_portions, is_active, is_vip, required_miamz_points, restaurants(name)")
        .in("id", dropIds);

      if (dropsError) throw new HttpError(500, dropsError.message);

      const tokOneSubscription = await getLatestTokOneSubscription(actor.adminClient, actor.userId);
      const tokOnePeriodEnd = tokOneSubscription?.current_period_end
        ? new Date(tokOneSubscription.current_period_end)
        : null;
      const hasActiveTokOneSubscription = Boolean(
        tokOneSubscription &&
        isTokOneEntitledStatus(tokOneSubscription.status) &&
        tokOnePeriodEnd &&
        tokOnePeriodEnd > new Date(),
      );
      const dropMap = new Map((dropRows || []).map((row: any) => [row.id, row]));
      const dropRestaurantIds = Array.from(new Set(
        (dropRows || []).map((row: any) => String(row.restaurant_id || "")).filter(Boolean),
      ));
      if (dropRestaurantIds.length !== 1) {
        throw new HttpError(
          400,
          "Une session La Table du Chef doit concerner un seul restaurant. Separez les reservations.",
        );
      }
      marketplaceRestaurantId = dropRestaurantIds[0];
      const requestedRestaurantId = String(order_metadata?.restaurant_id || "");
      if (requestedRestaurantId && requestedRestaurantId !== marketplaceRestaurantId) {
        throw new HttpError(400, "Le restaurant de la session ne correspond pas aux experiences selectionnees.");
      }
      let authoritativeTotal = 0;
      let totalPartySize = 0;
      let vipDropCount = 0;
      let maxRequiredMiamzPoints = 0;

      for (const item of items as CheckoutItem[]) {
        const dropId = String(item?.metadata?.chef_table_drop_id || "");
        const quantity = Math.max(1, Number(item?.metadata?.party_size || item?.quantity || 1));
        const drop = dropMap.get(dropId);

        if (!drop) {
          throw new HttpError(404, "Drop La Table du Chef introuvable.");
        }
        if (!drop.is_active) {
          throw new HttpError(409, "Ce drop La Table du Chef n'est plus disponible.");
        }
        if (Number(drop.remaining_portions || 0) < quantity) {
          throw new HttpError(409, "Le nombre de portions disponibles a change pour ce drop.");
        }

        const isVipDrop = drop.is_vip === true;
        const requiredMiamzPoints = Math.max(1, Number(drop.required_miamz_points || 0));
        if (isVipDrop) {
          vipDropCount += 1;
          maxRequiredMiamzPoints = Math.max(maxRequiredMiamzPoints, requiredMiamzPoints);
          if (!hasActiveTokOneSubscription) {
            throw new HttpError(
              403,
              "Ce drop VIP La Table du Chef est reserve aux abonnes Tok One actifs.",
            );
          }
        }

        const unitAmount = Math.round(Number(drop.price || 0) * 100);
        if (unitAmount <= 0) {
          throw new HttpError(400, "Prix La Table du Chef invalide.");
        }

        chefTableHoldItems.push({ drop_id: drop.id, quantity });

        lineItems.push({
          price_data: {
            currency: "chf",
            product_data: {
              name: String(drop.dish_name || item?.name || "Experience La Table du Chef"),
              description: String(drop.restaurants?.name || item?.restaurant_name || "La Table du Chef"),
              metadata: {
                chef_table_drop_id: drop.id,
                restaurant_id: drop.restaurant_id,
                drop_time: String(drop.drop_time || ""),
                party_size: String(quantity),
                source: "chef_table_drop",
                is_vip: isVipDrop ? "true" : "false",
                vip_access: isVipDrop ? "tok_one" : "standard",
                required_miamz_points: isVipDrop ? String(requiredMiamzPoints) : "0",
              },
            },
            unit_amount: unitAmount,
          },
          quantity,
        });

        authoritativeTotal += Number(drop.price || 0) * quantity;
        totalPartySize += quantity;
      }

      sessionMetadata = {
        ...sessionMetadata,
        restaurant_id: marketplaceRestaurantId,
        authoritative_total: authoritativeTotal.toFixed(2),
        party_size: String(totalPartySize),
        chef_table_vip_drop_count: String(vipDropCount),
        chef_table_vip_access: vipDropCount > 0 ? "tok_one" : "",
        chef_table_vip_required_miamz_points: String(maxRequiredMiamzPoints),
        tok_one_member: hasActiveTokOneSubscription ? "true" : "false",
      };
    } else {
      const primaryRestaurantId = String(order_metadata?.restaurant_id || "");
      if (!primaryRestaurantId) throw new HttpError(400, "restaurant_id requis");
      if (!Array.isArray(items) || items.length === 0) throw new HttpError(400, "Aucun article");
      auditTargetEntityType = "restaurants";
      auditTargetEntityId = primaryRestaurantId;

      const { data: primaryRestaurant, error: primaryRestaurantError } = await actor.adminClient
        .from("restaurants")
        .select("id, stripe_account_id")
        .eq("id", primaryRestaurantId)
        .maybeSingle();
      if (primaryRestaurantError) throw new HttpError(500, primaryRestaurantError.message);
      if (!primaryRestaurant) throw new HttpError(404, "Restaurant introuvable");

      const groupedItems = new Map<string, { groupRestaurantId: string; items: CheckoutItem[] }>();
      for (const item of items as CheckoutItem[]) {
        const groupRestaurantId = getCheckoutItemRestaurantId(item, primaryRestaurantId);
        if (!groupRestaurantId) throw new HttpError(400, "restaurant_id manquant sur un article");
        const paymentGroupKey = getCheckoutItemPaymentGroupKey(item, primaryRestaurantId);
        if (!groupedItems.has(paymentGroupKey)) {
          groupedItems.set(paymentGroupKey, { groupRestaurantId, items: [] });
        }
        groupedItems.get(paymentGroupKey)!.items.push(item);
      }

      const paymentGroupKeys = Array.from(groupedItems.keys());
      const checkoutRestaurantIds = Array.from(new Set(
        Array.from(groupedItems.values()).map((group) => group.groupRestaurantId).filter(Boolean),
      ));
      if (checkoutRestaurantIds.length !== 1 || checkoutRestaurantIds[0] !== primaryRestaurantId) {
        throw new HttpError(
          400,
          "Une session de paiement doit concerner un seul restaurant. Separez le panier par restaurant.",
        );
      }
      marketplaceRestaurantId = primaryRestaurantId;
      const totalDeliveryFee = effectiveKind === "zero-attente"
        ? 0
        : toMoney(order_metadata?.delivery_fee);
      const requestedPointsToRedeem = Math.max(0, Math.floor(Number(order_metadata?.points_to_redeem || 0)));
      const requestedPointsDiscount = toMoney(order_metadata?.points_discount_amount || order_metadata?.points_discount);
      const totalPointsDiscount = Math.min(requestedPointsDiscount, requestedPointsToRedeem / 100);
      const totalFlexDiscount = toMoney(order_metadata?.flex_discount_amount || order_metadata?.flex_discount);
      const pointsByPaymentGroup = new Map<string, number>();
      const flexByPaymentGroup = new Map<string, number>();

      const perPaymentGroupSubtotals = Array.from(groupedItems.entries()).map(([paymentGroupKey, group]) => ({
        paymentGroupKey,
        subtotal: group.items.reduce(
          (sum, item) => sum + (toMoney(item?.price ?? item?.unit_price) * Math.max(1, Number(item?.quantity || 1))),
          0,
        ),
      }));
      const totalSubtotal = perPaymentGroupSubtotals.reduce((sum, row) => sum + row.subtotal, 0);

      const allocateDiscount = (totalDiscount: number, targetMap: Map<string, number>) => {
        let remaining = Math.round(totalDiscount * 100) / 100;
        perPaymentGroupSubtotals.forEach((row, index) => {
          const share = totalSubtotal > 0 ? row.subtotal / totalSubtotal : (paymentGroupKeys.length > 0 ? 1 / paymentGroupKeys.length : 0);
          const allocated = index === perPaymentGroupSubtotals.length - 1
            ? Math.max(0, remaining)
            : Math.round((totalDiscount * share) * 100) / 100;
          remaining = Math.max(0, Math.round((remaining - allocated) * 100) / 100);
          targetMap.set(row.paymentGroupKey, allocated);
        });
      };

      allocateDiscount(totalPointsDiscount, pointsByPaymentGroup);
      allocateDiscount(totalFlexDiscount, flexByPaymentGroup);

      let authoritativeTotal = 0;
      let verifiedDeliveryPassThroughTotal = 0;
      let formulaDiscountTotal = 0;
      let promoDiscountTotal = 0;
      let promoCodeDiscountTotal = 0;
      let appliedPromoCodeId = "";
      let tokOneDiscountTotal = 0;
      let tokOneDeliveryDiscountTotal = 0;
      let tokOneMemberAny = false;
      let tokOneDiscountPercentMax = 0;
      let miamzDeliveryDiscountTotal = 0;
      let miamzDeliveryDiscountPercentMax = 0;
      let miamzPointsMultiplierMax = 1;
      let pointsDiscountTotal = 0;
      let flexDiscountTotal = 0;
      const primaryFormulaNames: string[] = [];
      const primaryPromoNames: string[] = [];
      const miamzBenefitsApplied = new Set<string>();

      for (const [index, [paymentGroupKey, group]] of Array.from(groupedItems.entries()).entries()) {
        const { groupRestaurantId, items: restaurantItems } = group;
        const deliveryFeeShare = paymentGroupKeys.length > 0 ? totalDeliveryFee / paymentGroupKeys.length : totalDeliveryFee;
        const groupMetadata = {
          ...(order_metadata || {}),
          payment_method: normalizedPaymentMethod,
          delivery_fee: deliveryFeeShare,
          points_to_redeem: Math.round((pointsByPaymentGroup.get(paymentGroupKey) || 0) * 100),
          points_discount: pointsByPaymentGroup.get(paymentGroupKey) || 0,
          points_discount_amount: pointsByPaymentGroup.get(paymentGroupKey) || 0,
          flex_discount_amount: flexByPaymentGroup.get(paymentGroupKey) || 0,
          formula_discount_amount: groupRestaurantId === primaryRestaurantId ? order_metadata?.formula_discount_amount || order_metadata?.formula_discount : 0,
          formula_discount: groupRestaurantId === primaryRestaurantId ? order_metadata?.formula_discount || 0 : 0,
          promotion_discount_amount: groupRestaurantId === primaryRestaurantId ? order_metadata?.promotion_discount_amount || 0 : 0,
          promotion_applied: groupRestaurantId === primaryRestaurantId ? order_metadata?.promotion_applied || null : null,
          promo_code_id: groupRestaurantId === primaryRestaurantId ? order_metadata?.promo_code_id || null : null,
        };

        const pricing = await buildVerifiedOrderPricing({
          adminClient: actor.adminClient,
          userId: actor.userId,
          restaurantId: groupRestaurantId,
          items: restaurantItems,
          deliveryFee: deliveryFeeShare,
          metadata: groupMetadata,
          context: effectiveKind === "zero-attente" ? "zero-attente" : "cart",
        });

        lineItems.push(...pricing.validatedItems.map((item) => ({
          price_data: {
            currency: "chf",
            product_data: {
              name: item.name,
              description: item.source === "menu_item" ? undefined : item.source,
              metadata: {
                menu_item_id: String(item.menuItemId || ""),
                source: String(item.source || ""),
                anti_waste_offer_id: String(item.metadata?.anti_waste_offer_id || item.metadata?.offer_id || ""),
                flash_sale_id: String(item.metadata?.flash_sale_id || ""),
              },
            },
            unit_amount: Math.round(item.unitPrice * 100),
          },
          quantity: item.quantity,
        })));

        if (pricing.qualityFee > 0) {
          lineItems.push({
            price_data: {
              currency: "chf",
              product_data: { name: "Garantie qualite" },
              unit_amount: Math.round(pricing.qualityFee * 100),
            },
            quantity: 1,
          });
        }

        if (pricing.deliveryFee > 0) {
          lineItems.push({
            price_data: {
              currency: "chf",
              product_data: { name: "Frais de livraison" },
              unit_amount: Math.round(pricing.deliveryFee * 100),
            },
            quantity: 1,
          });
        }

        authoritativeTotal += pricing.total;
        verifiedDeliveryPassThroughTotal += Math.max(
          0,
          pricing.deliveryFee
            - pricing.tokOneDeliveryDiscount
            - pricing.miamzDeliveryDiscount,
        );
        formulaDiscountTotal += pricing.formulaDiscount;
        promoDiscountTotal += pricing.promoDiscount;
        promoCodeDiscountTotal += pricing.promoCodeDiscount;
        if (!appliedPromoCodeId && pricing.promoCodeId) {
          appliedPromoCodeId = pricing.promoCodeId;
        }
        tokOneDiscountTotal += pricing.tokOneDiscount;
        tokOneDeliveryDiscountTotal += pricing.tokOneDeliveryDiscount;
        if (pricing.tokOneMember) tokOneMemberAny = true;
        if (pricing.tokOneDiscountPercent > tokOneDiscountPercentMax) {
          tokOneDiscountPercentMax = pricing.tokOneDiscountPercent;
        }
        miamzDeliveryDiscountTotal += pricing.miamzDeliveryDiscount;
        if (pricing.miamzDeliveryDiscountPercent > miamzDeliveryDiscountPercentMax) {
          miamzDeliveryDiscountPercentMax = pricing.miamzDeliveryDiscountPercent;
        }
        if (pricing.miamzPointsMultiplier > miamzPointsMultiplierMax) {
          miamzPointsMultiplierMax = pricing.miamzPointsMultiplier;
        }
        pricing.miamzBenefitsApplied.forEach((benefitId) => miamzBenefitsApplied.add(benefitId));
        pointsDiscountTotal += pricing.pointsDiscount;
        flexDiscountTotal += pricing.flexDiscount;

        if (index === 0 && primaryRestaurantId === groupRestaurantId && pricing.formulaName) primaryFormulaNames.push(pricing.formulaName);
        if (index === 0 && primaryRestaurantId === groupRestaurantId && pricing.promoName) primaryPromoNames.push(pricing.promoName);
      }


      discountCents = Math.round((
        formulaDiscountTotal
        + promoDiscountTotal
        + tokOneDiscountTotal
        + tokOneDeliveryDiscountTotal
        + miamzDeliveryDiscountTotal
        + pointsDiscountTotal
        + flexDiscountTotal
      ) * 100);
      marketplaceDeliveryPassThroughCents = Math.max(
        0,
        Math.round(verifiedDeliveryPassThroughTotal * 100),
      );
      sessionMetadata = {
        ...sessionMetadata,
        restaurant_id: primaryRestaurantId,
        formula_applied: String(primaryFormulaNames[0] || ""),
        formula_discount_amount: formulaDiscountTotal.toFixed(2),
        promo_applied: String(primaryPromoNames[0] || ""),
        promo_discount_amount: promoDiscountTotal.toFixed(2),
        promo_code_id: appliedPromoCodeId,
        promo_code_discount_amount: promoCodeDiscountTotal.toFixed(2),
        tok_one_member: tokOneMemberAny ? "true" : "false",
        tok_one_discount_amount: tokOneDiscountTotal.toFixed(2),
        tok_one_discount_percent: tokOneDiscountPercentMax.toFixed(2),
        tok_one_delivery_saved: tokOneDeliveryDiscountTotal.toFixed(2),
        tok_one_total_saved: (tokOneDiscountTotal + tokOneDeliveryDiscountTotal).toFixed(2),
        miamz_delivery_discount_amount: miamzDeliveryDiscountTotal.toFixed(2),
        miamz_delivery_discount_percent: miamzDeliveryDiscountPercentMax.toFixed(2),
        miamz_benefits_applied: Array.from(miamzBenefitsApplied).join(","),
        miamz_points_multiplier: miamzPointsMultiplierMax.toFixed(2),
        points_discount_amount: pointsDiscountTotal.toFixed(2),
        flex_discount_amount: flexDiscountTotal.toFixed(2),
        authoritative_total: authoritativeTotal.toFixed(2),
      };
    }

    const clientCheckoutRestaurantId = String(
      marketplaceRestaurantId || sessionMetadata.restaurant_id || "",
    ).trim();

    if (CLIENT_STRIPE_CHECKOUT_KINDS.has(effectiveKind)) {
      if (!clientCheckoutRestaurantId) {
        throw new HttpError(
          409,
          "Ce restaurant n’est pas disponible pour un paiement client.",
        );
      }

      const { data: checkoutRestaurant, error: checkoutRestaurantError } =
        await actor.adminClient
          .from("restaurants")
          .select("id, is_active, status, is_demo")
          .eq("id", clientCheckoutRestaurantId)
          .maybeSingle();

      if (checkoutRestaurantError) {
        throw new HttpError(500, checkoutRestaurantError.message);
      }

      if (!isClientCheckoutRestaurantEligible(checkoutRestaurant)) {
        throw new HttpError(
          409,
          "Ce restaurant n’est pas disponible pour un paiement client.",
        );
      }
    }

    const totalBeforeDiscountCents = lineItems.reduce(
      (sum, lineItem) => sum + ((lineItem.price_data?.unit_amount || 0) * (lineItem.quantity || 1)),
      0,
    );
    discountCents = Math.min(discountCents, totalBeforeDiscountCents);
    const finalCheckoutTotalCents = Math.max(0, totalBeforeDiscountCents - discountCents);

    if (normalizedPaymentMethod === "twint") {
      if (isSubscriptionLifecycleCheckout) {
        throw new HttpError(400, "TWINT ne peut pas etre utilise avec ce parcours d'abonnement.");
      }
      if (CHECKOUT_CURRENCY !== "CHF") {
        throw new HttpError(400, "TWINT requiert un paiement en francs suisses.");
      }
      if (finalCheckoutTotalCents > TWINT_MAX_CHECKOUT_AMOUNT_CENTS) {
        throw new HttpError(400, "TWINT est limite a CHF 5'000 par paiement.");
      }
    }

    marketplaceDeliveryPassThroughCents = Math.min(
      marketplaceDeliveryPassThroughCents,
      finalCheckoutTotalCents,
    );
    const marketplaceCommissionableCents = Math.max(
      0,
      finalCheckoutTotalCents
        - marketplaceTipCents
        - marketplaceDeliveryPassThroughCents,
    );

    const marketplaceRouting = await resolveMarketplaceRouting({
      adminClient: actor.adminClient,
      checkoutKind: effectiveKind,
      restaurantId: marketplaceRestaurantId || sessionMetadata.restaurant_id,
      grossCents: finalCheckoutTotalCents,
      commissionableCents: marketplaceCommissionableCents,
      tipCents: marketplaceTipCents,
      deliveryPassThroughCents: marketplaceDeliveryPassThroughCents,
      stripeMode: stripeRuntime.mode,
    });

    if (MARKETPLACE_CHECKOUT_KINDS.has(effectiveKind)) {
      sessionMetadata = {
        ...sessionMetadata,
        finance_snapshot_version: "fair_growth_v1",
        finance_routing_mode: marketplaceRouting.mode,
        gross_amount_cents: String(marketplaceRouting.grossCents),
        commissionable_cents: String(marketplaceRouting.commissionableCents),
        tip_cents: String(marketplaceRouting.tipCents),
        delivery_pass_through_cents: String(marketplaceRouting.deliveryPassThroughCents),
        platform_fee_bps: String(marketplaceRouting.platformFeeBps),
        platform_fee_amount_cents: String(marketplaceRouting.platformFeeCents),
        stripe_application_fee_amount_cents: String(marketplaceRouting.stripeApplicationFeeCents),
        restaurant_share_amount_cents: String(marketplaceRouting.restaurantShareCents),
        restaurant_transfer_amount_cents: String(marketplaceRouting.restaurantTransferCents),
        developer_order_bps: String(marketplaceRouting.developerOrderBps),
        developer_share_bps: String(marketplaceRouting.developerOrderBps),
        developer_share_amount_cents: String(marketplaceRouting.developerShareCents),
        tok_net_amount_cents: String(marketplaceRouting.tokNetRevenueCents),
        pricing_plan_id: String(marketplaceRouting.pricingPlanId || ""),
        pricing_plan_slug: String(marketplaceRouting.pricingPlanSlug || ""),
        pricing_version: marketplaceRouting.pricingVersion,
        pricing_rate_source: marketplaceRouting.pricingRateSource,
      };
    }

    const attemptRestaurantId = String(
      marketplaceRestaurantId || sessionMetadata.restaurant_id || "",
    ).trim() || null;

    // A different client UUID must not create a second simultaneous
    // subscription. The database also enforces this invariant to close the
    // race between these read and acquire calls.
    if (isSubscriptionLifecycleCheckout) {
      const subscriptionKinds = effectiveKind === "tok-one"
        ? ["tok-one"]
        : ["restaurant-onboarding", "restaurant-subscription-upgrade"];
      let conflictQuery = actor.adminClient
        .from("payment_attempts")
        .select("id, operation_key")
        .eq("owner_user_id", actor.userId)
        .eq("mode", stripeRuntime.mode)
        .in("kind", subscriptionKinds)
        .in("state", ["pending", "session_bound"])
        .neq("operation_key", clientPaymentAttemptId)
        .limit(1);
      if (attemptRestaurantId) conflictQuery = conflictQuery.eq("restaurant_id", attemptRestaurantId);
      const { data: conflictingAttempts, error: conflictingAttemptError } = await conflictQuery;
      if (conflictingAttemptError) throw new HttpError(500, conflictingAttemptError.message);
      if (conflictingAttempts?.length) {
        throw new HttpError(409, "Un paiement d'abonnement est deja en cours. Reprenez la tentative existante.");
      }
    }

    const acquireAttemptInput = {
      adminClient: actor.adminClient,
      operationKey: idempotencySource,
      ownerUserId: actor.userId,
      restaurantId: attemptRestaurantId,
      kind: effectiveKind,
      mode: stripeRuntime.mode,
      amountCents: preexistingAttempt?.amount_cents ?? finalCheckoutTotalCents,
      currency: preexistingAttempt?.currency || "CHF",
      metadata: {
        checkout_kind: effectiveKind,
        checkout_id: sessionMetadata.checkout_id || null,
        checkout_group_id: sessionMetadata.checkout_group_id || null,
        primary_order_id: sessionMetadata.primary_order_id || null,
        order_reference: sessionMetadata.order_reference || null,
        restaurant_id: attemptRestaurantId,
        finance_snapshot_version: sessionMetadata.finance_snapshot_version || null,
        pricing_version: sessionMetadata.pricing_version || null,
        platform_fee_bps: sessionMetadata.platform_fee_bps || null,
        commissionable_cents: sessionMetadata.commissionable_cents || null,
        tip_cents: sessionMetadata.tip_cents || null,
        delivery_pass_through_cents: sessionMetadata.delivery_pass_through_cents || null,
        stripe_application_fee_amount_cents:
          sessionMetadata.stripe_application_fee_amount_cents || null,
      },
    } as const;
    let acquiredAttempt = await acquirePaymentAttempt(acquireAttemptInput);
    if (acquiredAttempt.operationKey !== clientPaymentAttemptId) {
      // The database returns the already-active subscription attempt when a
      // second UUID races on the same logical subscription scope.
      throw new HttpError(409, "PAYMENT_ATTEMPT_OPERATION_CONFLICT");
    }
    activeAttempt = { ...acquiredAttempt, adminClient: actor.adminClient };

    sessionMetadata = {
      ...sessionMetadata,
      payment_attempt_version: "2",
      payment_attempt_id: acquiredAttempt.attemptId,
      operation_key: acquiredAttempt.operationKey,
      client_payment_attempt_id: clientPaymentAttemptId,
      authoritative_total_cents: String(finalCheckoutTotalCents),
      authoritative_currency: "CHF",
    };

    if (acquiredAttempt.stripeCheckoutSessionId) {
      let existingSession: Stripe.Checkout.Session;
      try {
        existingSession = await stripe.checkout.sessions.retrieve(
          acquiredAttempt.stripeCheckoutSessionId,
        );
      } catch (error) {
        throw new HttpError(
          503,
          `PAYMENT_ATTEMPT_INDETERMINATE:${error instanceof Error ? error.message : "Stripe indisponible"}`,
        );
      }

      if (String(existingSession.metadata?.user_id || "") !== actor.userId) {
        throw new HttpError(409, "La session Stripe existante n'appartient pas a cet utilisateur");
      }
      if (String(existingSession.metadata?.operation_key || "") !== acquiredAttempt.operationKey) {
        throw new HttpError(409, "La session Stripe existante ne correspond pas a cette tentative");
      }
      if (isRestaurantOnboardingSetup) {
        assertRestaurantOnboardingSetupSessionIntegrity({
          session: existingSession,
          livemode: stripeRuntime.mode === "live",
          userId: actor.userId,
          paymentAttemptId: acquiredAttempt.attemptId,
          operationKey: acquiredAttempt.operationKey,
          stripeCustomerId: restaurantOnboardingStripeCustomerId,
          billingPeriod: restaurantOnboardingBillingPeriod,
          reservedAmountCents: restaurantOnboardingReservedAmountCents,
        });
      } else {
        assertCheckoutSessionIntegrity({
          session: existingSession,
          livemode: stripeRuntime.mode === "live",
          expectedAmountCents: acquiredAttempt.amountCents,
          expectedCurrency: acquiredAttempt.currency,
        });
      }

      if (existingSession.status === "open" && existingSession.url) {
        return jsonResponse({
          payment_attempt_id: clientPaymentAttemptId,
          server_payment_attempt_id: acquiredAttempt.attemptId,
          sessionId: existingSession.id,
          session_id: existingSession.id,
          url: existingSession.url,
          reused: true,
          state: "session_bound",
        }, 200, corsHeaders);
      }

      if (isRestaurantOnboardingSetup && existingSession.status === "complete") {
        const setupIntentId = readStripeObjectId(existingSession.setup_intent);
        if (!setupIntentId) {
          throw new HttpError(503, "PAYMENT_ATTEMPT_SETUP_INTENT_INDETERMINATE");
        }
        return jsonResponse({
          payment_attempt_id: clientPaymentAttemptId,
          server_payment_attempt_id: acquiredAttempt.attemptId,
          sessionId: existingSession.id,
          session_id: existingSession.id,
          setup_intent_id: setupIntentId,
          url: null,
          reused: true,
          state: acquiredAttempt.state === "finalized" ? "finalized" : "setup_complete",
        }, 200, corsHeaders);
      }

      if (existingSession.payment_status === "paid") {
        return jsonResponse({
          payment_attempt_id: clientPaymentAttemptId,
          server_payment_attempt_id: acquiredAttempt.attemptId,
          sessionId: existingSession.id,
          session_id: existingSession.id,
          url: null,
          reused: true,
          state: acquiredAttempt.state === "finalized" ? "finalized" : "paid",
        }, 200, corsHeaders);
      }

      if (existingSession.status === "expired") {
        if (effectiveKind === "order") {
          await markOrderCheckoutSessionState({
            adminClient: actor.adminClient,
            session: existingSession,
            orderStatus: "cancelled",
            paymentStatus: "cancelled",
            checkoutState: "expired",
            failureCode: "checkout_session_expired",
            failureMessage: "La session de paiement a expire; la commande doit etre recreee.",
          });
        }
        await abandonPaymentAttemptSession({
          adminClient: actor.adminClient,
          attemptId: acquiredAttempt.attemptId,
          sessionId: existingSession.id,
          reason: "stripe_session_expired_before_payment",
        });
        if (effectiveKind === "order") {
          await cancelPersistedPaymentAttempt({
            adminClient: actor.adminClient,
            attemptId: acquiredAttempt.attemptId,
            reason: "expired_order_requires_new_operation",
          });
          activeAttempt = null;
          throw new HttpError(409, "PAYMENT_ATTEMPT_ORDER_EXPIRED_RECREATE");
        }
        acquiredAttempt = await acquirePaymentAttempt(acquireAttemptInput);
        if (
          acquiredAttempt.operationKey !== clientPaymentAttemptId
          || !acquiredAttempt.leaseAcquired
          || !acquiredAttempt.leaseToken
        ) {
          throw new HttpError(409, "PAYMENT_ATTEMPT_REACQUIRE_FAILED");
        }
        activeAttempt = { ...acquiredAttempt, adminClient: actor.adminClient };
        sessionMetadata = {
          ...sessionMetadata,
          payment_attempt_id: acquiredAttempt.attemptId,
          operation_key: acquiredAttempt.operationKey,
        };
      } else {
        // A completed-but-unpaid session may still be settling asynchronously.
        // Never abandon it or create another payable subscription/order.
        throw new HttpError(
          409,
          `PAYMENT_ATTEMPT_SESSION_${String(existingSession.status || "closed").toUpperCase()}`,
        );
      }
    }

    if (!acquiredAttempt.leaseAcquired || !acquiredAttempt.leaseToken) {
      throw new HttpError(409, "PAYMENT_ATTEMPT_ALREADY_IN_PROGRESS");
    }

    if (creditPackPurchaseDraft) {
      const { data: existingPurchase, error: existingPurchaseError } = await actor.adminClient
        .from("restaurant_credit_purchases")
        .select("id")
        .eq("payment_attempt_id", acquiredAttempt.attemptId)
        .maybeSingle();
      if (existingPurchaseError) throw new HttpError(500, existingPurchaseError.message);

      if (existingPurchase?.id) {
        creditPackPurchaseId = existingPurchase.id;
        const { error: resetPurchaseError } = await actor.adminClient
          .from("restaurant_credit_purchases")
          .update({
            status: "pending_payment",
            stripe_checkout_session_id: null,
            stripe_payment_intent_id: null,
            stripe_mode: stripeRuntime.mode,
            updated_at: new Date().toISOString(),
          })
          .eq("id", creditPackPurchaseId)
          .in("status", ["cancelled", "failed", "pending_payment"]);
        if (resetPurchaseError) throw new HttpError(500, resetPurchaseError.message);
      } else {
        const draftMetadata = creditPackPurchaseDraft.metadata as Record<string, unknown>;
        const { data: purchaseRecord, error: purchaseError } = await actor.adminClient
          .from("restaurant_credit_purchases")
          .insert({
            ...creditPackPurchaseDraft,
            payment_attempt_id: acquiredAttempt.attemptId,
            metadata: {
              ...draftMetadata,
              payment_attempt_id: acquiredAttempt.attemptId,
              operation_key: acquiredAttempt.operationKey,
            },
          })
          .select("id")
          .single();
        if (purchaseError) throw new HttpError(500, purchaseError.message);
        creditPackPurchaseId = purchaseRecord.id;
      }

      sessionMetadata = {
        ...sessionMetadata,
        restaurant_credit_purchase_id: creditPackPurchaseId,
        credit_pack_purchase_id: creditPackPurchaseId,
      };
    }

    const urlSeparator = safeReturnUrl.includes("?") ? "&" : "?";
    const userLookup = actor.userClient ? await actor.userClient.auth.getUser() : null;
    const userEmail = userLookup?.data.user?.email || undefined;

    const sessionParams: Stripe.Checkout.SessionCreateParams = {
      mode: isSubscriptionCheckout ? "subscription" : "payment",
      success_url: `${safeReturnUrl}${urlSeparator}session_id={CHECKOUT_SESSION_ID}&payment_attempt_id=${encodeURIComponent(clientPaymentAttemptId)}&status=success`,
      cancel_url: `${safeReturnUrl}${urlSeparator}payment_attempt_id=${encodeURIComponent(clientPaymentAttemptId)}&status=cancelled`,
      customer_email: isRestaurantOnboardingSetup && restaurantOnboardingStripeCustomerId
        ? undefined
        : userEmail,
      client_reference_id: actor.userId || undefined,
      payment_method_types: [normalizedPaymentMethod === "twint" ? "twint" : "card"],
      metadata: sessionMetadata,
    };

    // Scarce inventory/capacity holds live for 35 minutes in Postgres. Keep
    // the payable Stripe URL strictly inside that window (Stripe requires at
    // least 30 minutes), otherwise a stale browser tab could pay after stock
    // or a reservation slot has been released to another customer.
    if (CLIENT_STRIPE_CHECKOUT_KINDS.has(effectiveKind)) {
      sessionParams.expires_at = Math.floor(Date.now() / 1000) + (31 * 60);
    }

    if (!isRestaurantOnboardingSetup) {
      sessionParams.line_items = lineItems;
    }

    // Checkout payments capture immediately. Match Group is the only manual
    // capture flow and is handled by authorize-match-group-order.
    if (!isRestaurantOnboardingSetup && !isSubscriptionCheckout) {
      sessionParams.payment_intent_data = {
        capture_method: "automatic",
        metadata: sessionMetadata,
      };
    }

    // A SetupIntent does not move money. Marketplace and developer revenue
    // allocation is applied only to the future subscription invoice.
    if (
      !isRestaurantOnboardingSetup
      && marketplaceRouting.enabled
      && marketplaceRouting.destinationAccountId
    ) {
      sessionParams.payment_intent_data = {
        ...sessionParams.payment_intent_data,
        capture_method: "automatic",
        application_fee_amount: marketplaceRouting.stripeApplicationFeeCents,
        transfer_data: {
          destination: marketplaceRouting.destinationAccountId,
        },
        metadata: sessionMetadata,
      };
    }

    if (isSubscriptionCheckout) {
      sessionParams.payment_method_collection = "always";
      sessionParams.subscription_data = {
        metadata: sessionMetadata,
      };
      if (effectiveKind === "tok-one") {
        sessionParams.subscription_data.trial_period_days = 14;
        sessionParams.subscription_data.trial_settings = {
          end_behavior: {
            missing_payment_method: "cancel",
          },
        };
      }
    }

    if (isRestaurantOnboardingSetup) {
      sessionParams.mode = "setup";
      sessionParams.customer = restaurantOnboardingStripeCustomerId;
      sessionParams.payment_method_types = ["card"];
      sessionParams.custom_text = {
        submit: {
          message: "Aucun montant n’est débité ni bloqué aujourd’hui. En enregistrant cette carte, vous autorisez TOK à débiter l’abonnement lors de la première réservation ou commande client.",
        },
      };
      sessionParams.setup_intent_data = {
        description: "Abonnement restaurateur TOK à activer à la première activité client",
        metadata: sessionMetadata,
      };
    }

    let couponParams: Stripe.CouponCreateParams | null = null;
    if (discountCents > 0) {
      const hasTokOneDiscount = toMoney(sessionMetadata.tok_one_discount_amount) > 0
        || toMoney(sessionMetadata.tok_one_delivery_saved) > 0;
      const hasMiamzDiscount = toMoney(sessionMetadata.miamz_delivery_discount_amount) > 0;
      const couponName = hasTokOneDiscount
        ? "Avantage Tok One"
        : hasMiamzDiscount
          ? "Avantage Miamz"
          : sessionMetadata.formula_applied
          ? `Reduction ${sessionMetadata.formula_applied}`
          : "Reduction commande";
      couponParams = {
        amount_off: discountCents,
        currency: "chf",
        duration: "once",
        name: couponName,
        metadata: {
          payment_attempt_id: acquiredAttempt.attemptId,
          operation_key: acquiredAttempt.operationKey,
        },
      };
    }

    const computedRequestSnapshot = {
      version: 1,
      session_params: sessionParams as unknown as Record<string, unknown>,
      coupon_params: couponParams as unknown as Record<string, unknown> | null,
    };
    // Identity is derived from the client business operation, while the
    // sealed snapshot contains authoritative server prices and Stripe params.
    // Thus a later price/config change cannot alter a lost-response retry, but
    // changing items/plan/restaurant under the same UUID is rejected.
    const sealed = await sealPaymentAttemptRequest({
      adminClient: actor.adminClient,
      attemptId: acquiredAttempt.attemptId,
      leaseToken: acquiredAttempt.leaseToken!,
      fingerprint: requestFingerprint,
      requestSnapshot: computedRequestSnapshot,
    });
    const sealedRequestSnapshot = sealed.requestSnapshot;

    const sealedSessionParams = sealedRequestSnapshot.session_params;
    if (!sealedSessionParams || typeof sealedSessionParams !== "object" || Array.isArray(sealedSessionParams)) {
      throw new Error("PAYMENT_ATTEMPT_SESSION_SNAPSHOT_INVALID");
    }
    const sealedMetadata = (sealedSessionParams as Record<string, any>).metadata;
    if (
      String(sealedMetadata?.payment_attempt_id || "") !== acquiredAttempt.attemptId
      || String(sealedMetadata?.operation_key || "") !== acquiredAttempt.operationKey
      || String(sealedMetadata?.user_id || "") !== actor.userId
    ) {
      throw new Error("PAYMENT_ATTEMPT_SESSION_SNAPSHOT_IDENTITY_MISMATCH");
    }
    sessionMetadata = sealedMetadata as Record<string, string>;

    const stripeSessionParams = sealedSessionParams as unknown as Stripe.Checkout.SessionCreateParams;
    const sealedCouponParams = sealedRequestSnapshot.coupon_params;
    if (sealedCouponParams && typeof sealedCouponParams === "object" && !Array.isArray(sealedCouponParams)) {
      const coupon = await stripe.coupons.create(
        sealedCouponParams as unknown as Stripe.CouponCreateParams,
        { idempotencyKey: `${acquiredAttempt.stripeIdempotencyKey}:coupon`.slice(0, 255) },
      );
      stripeSessionParams.discounts = [{ coupon: coupon.id }];
    }

    const session = await stripe.checkout.sessions.create(
      stripeSessionParams,
      { idempotencyKey: acquiredAttempt.stripeIdempotencyKey.slice(0, 255) },
    );
    activeAttempt.stripeSessionId = session.id;

    const releaseCreatedBusinessPrerequisites = async (reason: string) => {
      if (effectiveKind === "order") {
        await markOrderCheckoutSessionState({
          adminClient: actor.adminClient,
          session,
          orderStatus: "cancelled",
          paymentStatus: "cancelled",
          checkoutState: "cancelled",
          failureCode: reason,
          failureMessage: "Session Stripe fermee avant redirection; ressources liberees.",
        });
      }

      if (effectiveKind === "restaurant-credit-pack" && creditPackPurchaseId) {
        const { error } = await actor.adminClient
          .from("restaurant_credit_purchases")
          .update({ status: "cancelled", updated_at: new Date().toISOString() })
          .eq("id", creditPackPurchaseId)
          .eq("status", "pending_payment");
        if (error) throw new Error(`CREDIT_PACK_HOLD_RELEASE_FAILED:${error.message}`);
      }

      if (effectiveKind === "zero-attente" && zeroAttenteHoldReservationId) {
        const { error } = await actor.adminClient.rpc("release_zero_attente_checkout_hold", {
          p_session_id: session.id,
          p_expected_attempt_id: acquiredAttempt.attemptId,
          p_reason: reason,
        });
        if (error) throw new Error(`ZERO_ATTENTE_HOLD_RELEASE_FAILED:${error.message}`);
      }

      if (effectiveKind === "chefs-table" && chefTableHoldCount > 0) {
        const { error } = await actor.adminClient.rpc("release_chef_table_checkout_hold", {
          p_session_id: session.id,
        });
        if (error) throw new Error(`CHEF_TABLE_HOLD_RELEASE_FAILED:${error.message}`);
      }
    };

    const expireAndAbandonKnownSession = async (reason: string, terminalCancel = false) => {
      let terminalSession = session;
      if (terminalSession.status === "open") {
        terminalSession = await stripe.checkout.sessions.expire(session.id);
      }
      if (terminalSession.status !== "expired") {
        throw new Error(`STRIPE_SESSION_NOT_ABANDONABLE:${terminalSession.status}`);
      }
      await releaseCreatedBusinessPrerequisites(reason);
      await abandonPaymentAttemptSession({
        adminClient: actor.adminClient,
        attemptId: acquiredAttempt.attemptId,
        sessionId: session.id,
        reason,
        leaseToken: acquiredAttempt.leaseToken,
      });
      if (terminalCancel || effectiveKind === "order") {
        await cancelPersistedPaymentAttempt({
          adminClient: actor.adminClient,
          attemptId: acquiredAttempt.attemptId,
          reason,
        });
      }
      // Do not let the generic catch release/mutate the newly advanced
      // generation with the lease token that belonged to the old one.
      activeAttempt = null;
    };

    // An ambiguous prior response can make Stripe replay the same idempotent
    // create call. Never bind or expose a replayed terminal session. An
    // expired replay advances the generation explicitly; a completed replay
    // remains indeterminate so the webhook can perform the authoritative
    // paid/unpaid transition without creating a second payable session.
    if (session.status === "expired") {
      await expireAndAbandonKnownSession("stripe_replayed_expired_session");
      throw new HttpError(409, "PAYMENT_ATTEMPT_SESSION_EXPIRED_RETRY");
    }
    if (session.status !== "open") {
      throw new HttpError(503, `PAYMENT_ATTEMPT_SESSION_${String(session.status).toUpperCase()}`);
    }

    try {
      if (isRestaurantOnboardingSetup) {
        assertRestaurantOnboardingSetupSessionIntegrity({
          session,
          livemode: stripeRuntime.mode === "live",
          userId: actor.userId,
          paymentAttemptId: acquiredAttempt.attemptId,
          operationKey: acquiredAttempt.operationKey,
          stripeCustomerId: restaurantOnboardingStripeCustomerId,
          billingPeriod: restaurantOnboardingBillingPeriod,
          reservedAmountCents: restaurantOnboardingReservedAmountCents,
        });
      } else {
        assertCheckoutSessionIntegrity({
          session,
          livemode: stripeRuntime.mode === "live",
          expectedAmountCents: acquiredAttempt.amountCents,
          expectedCurrency: acquiredAttempt.currency,
        });
      }
    } catch (integrityError) {
      try {
        await expireAndAbandonKnownSession("stripe_session_integrity_mismatch");
      } catch (abandonError) {
        log.error("invalid_checkout_session_abandon_failed", {
          session_id: session.id,
          message: abandonError instanceof Error ? abandonError.message : "unknown",
        });
      }
      throw integrityError;
    }

    if (effectiveKind === "order") {
      try {
        await persistOrderCheckoutSessionMapping({
          adminClient: actor.adminClient,
          session,
          paymentAttemptId: acquiredAttempt.attemptId,
          clientPaymentAttemptId,
        });
      } catch (mappingError) {
        try {
          await expireAndAbandonKnownSession("order_session_mapping_failed");
        } catch (abandonError) {
          log.error("order_checkout_session_abandon_failed", {
            session_id: session.id,
            message: abandonError instanceof Error ? abandonError.message : "unknown",
          });
        }
        throw mappingError;
      }
    }

    if (effectiveKind === "restaurant-credit-pack" && creditPackPurchaseId) {
      const { error: purchaseUpdateError } = await actor.adminClient
        .from("restaurant_credit_purchases")
        .update({
          stripe_checkout_session_id: session.id,
          stripe_mode: stripeRuntime.mode,
          metadata: {
            ...sessionMetadata,
            checkout_session_id: session.id,
          },
        })
        .eq("id", creditPackPurchaseId);

      if (purchaseUpdateError) {
        try {
          await expireAndAbandonKnownSession("credit_pack_session_persist_failed");
        } catch (expireError) {
          log.warn("credit_pack_checkout_session_expire_failed", {
            session_id: session.id,
            message: expireError instanceof Error ? expireError.message : "unknown",
          });
        }

        throw new HttpError(500, purchaseUpdateError.message);
      }
    }

    if (effectiveKind === "zero-attente") {
      const { data: holdReservationId, error: holdError } = await actor.adminClient.rpc(
        "create_zero_attente_checkout_hold",
        {
          p_restaurant_id: sessionMetadata.restaurant_id,
          p_date: sessionMetadata.arrival_date,
          p_time: sessionMetadata.arrival_time,
          p_party_size: Math.max(1, Number(sessionMetadata.party_size || 1)),
          p_session_id: session.id,
          p_metadata: {
            ...sessionMetadata,
            _internal_user_id: actor.userId,
            checkout_session_id: session.id,
            checkout_session_state: "pending_payment",
            paid: false,
            total_amount: sessionMetadata.authoritative_total,
            payment_method: normalizedPaymentMethod,
          },
          p_notes: "Hold Zero Attente cree avant redirection Stripe.",
        },
      );

      if (holdError || !holdReservationId) {
        try {
          await expireAndAbandonKnownSession("zero_attente_hold_failed");
        } catch (expireError) {
          log.warn("zero_attente_checkout_session_expire_failed", {
            session_id: session.id,
            message: expireError instanceof Error ? expireError.message : "unknown",
          });
        }

        throw new HttpError(
          409,
          holdError?.message || "Ce creneau Zero Attente n'est plus disponible.",
        );
      }

      zeroAttenteHoldReservationId = String(holdReservationId);
    }

    if (effectiveKind === "chefs-table") {
      const { data: heldCount, error: holdError } = await actor.adminClient.rpc(
        "create_chef_table_checkout_hold",
        {
          p_session_id: session.id,
          p_user_id: actor.userId,
          p_items: chefTableHoldItems,
          p_metadata: {
            checkout_kind: "chefs-table",
            checkout_session_id: session.id,
            restaurant_id: sessionMetadata.restaurant_id,
            authoritative_total: sessionMetadata.authoritative_total,
          },
        },
      );

      if (holdError || !heldCount) {
        try {
          await expireAndAbandonKnownSession("chef_table_hold_failed");
        } catch (expireError) {
          log.warn("chef_table_checkout_session_expire_failed", {
            session_id: session.id,
            message: expireError instanceof Error ? expireError.message : "unknown",
          });
        }

        throw new HttpError(
          409,
          holdError?.message || "Certaines experiences La Table du Chef ne sont plus disponibles.",
        );
      }

      chefTableHoldCount = Number(heldCount || 0);
    }

    // A session only becomes resumable/exposable after every business-side
    // prerequisite (order mapping, stock/capacity hold, purchase mapping) is
    // durable. If the process crashes earlier, the same Stripe idempotency key
    // returns the unexposed session and the prerequisites are replayed.
    try {
      await bindPaymentAttemptStripe({
        adminClient: actor.adminClient,
        attemptId: acquiredAttempt.attemptId,
        leaseToken: acquiredAttempt.leaseToken!,
        checkoutSessionId: session.id,
        paymentIntentId: readStripeObjectId(session.payment_intent),
        subscriptionId: readStripeObjectId(session.subscription),
        sessionExpiresAt: session.expires_at
          ? new Date(session.expires_at * 1000).toISOString()
          : null,
        metadata: {
          checkout_kind: effectiveKind,
          client_payment_attempt_id: clientPaymentAttemptId,
          business_ready: true,
        },
      });
    } catch (bindError) {
      const cancellationRequested = String(
        bindError instanceof Error ? bindError.message : bindError,
      ).includes("payment_attempt_cancellation_requested");
      try {
        await expireAndAbandonKnownSession(
          cancellationRequested ? "payment_attempt_cancelled_during_create" : "payment_attempt_bind_failed",
          cancellationRequested,
        );
      } catch (expireError) {
        log.error("unbound_checkout_session_expire_failed", {
          session_id: session.id,
          message: expireError instanceof Error ? expireError.message : "unknown",
        });
      }
      throw bindError;
    }

    await writeAuditLog({
      adminClient: actor.adminClient,
      actor,
      request: req,
      functionName: "create-checkout",
      action: `create_${auditKind}_checkout`,
      status: "success",
      targetEntityType: auditTargetEntityType,
      targetEntityId: auditTargetEntityId || null,
      metadata: {
        checkout_kind: auditKind,
        session_id: session.id,
        payment_method: normalizedPaymentMethod,
        stripe_mode: stripeRuntime.mode,
        stripe_key_scope: stripeRuntime.isolatedTokOneKey ? "tok_one" : "default",
        finance_routing_mode: marketplaceRouting.mode,
        platform_fee_cents: marketplaceRouting.platformFeeCents,
        restaurant_share_cents: marketplaceRouting.restaurantShareCents,
        developer_share_cents: marketplaceRouting.developerShareCents,
        tok_net_revenue_cents: marketplaceRouting.tokNetRevenueCents,
        line_items: lineItems.length,
        zero_attente_hold_reservation_id: zeroAttenteHoldReservationId || null,
        chef_table_hold_count: chefTableHoldCount || null,
        payment_attempt_id: acquiredAttempt.attemptId,
        client_payment_attempt_id: clientPaymentAttemptId,
        reused: acquiredAttempt.reused,
      },
    });
    return jsonResponse(
      {
        payment_attempt_id: clientPaymentAttemptId,
        server_payment_attempt_id: acquiredAttempt.attemptId,
        sessionId: session.id,
        session_id: session.id,
        url: session.url,
        reused: acquiredAttempt.reused,
        state: "session_bound",
      },
      200,
      corsHeaders,
    );
  } catch (error) {
    log.error("create-checkout error", { message: error instanceof Error ? error.message : "unknown" });

    // A timeout/error is retryable and must never be interpreted as a failed
    // payment by the client. Releasing the lease lets the same operation key
    // safely resume; the generation-specific Stripe key prevents replaying an
    // expired/abandoned Checkout Session.
    if (activeAttempt?.leaseAcquired && activeAttempt.leaseToken) {
      try {
        await failPaymentAttempt({
          adminClient: activeAttempt.adminClient,
          attemptId: activeAttempt.attemptId,
          leaseToken: activeAttempt.leaseToken,
          errorCode: error instanceof HttpError ? `http_${error.status}` : "checkout_create_error",
          errorMessage: error instanceof Error ? error.message : "Erreur interne",
          retryable: true,
        });
      } catch (attemptError) {
        log.error("payment_attempt_release_failed", {
          payment_attempt_id: activeAttempt.attemptId,
          stripe_session_id: activeAttempt.stripeSessionId || null,
          message: attemptError instanceof Error ? attemptError.message : "unknown",
        });
      }
    }
    await writeAuditLog({
      adminClient: actor?.adminClient || createAdminClient(),
      actor,
      request: req,
      functionName: "create-checkout",
      action: `create_${auditKind}_checkout`,
      status: "failure",
      targetEntityType: auditTargetEntityType || null,
      targetEntityId: auditTargetEntityId || null,
      errorMessage: error instanceof Error ? error.message : "Erreur interne",
    });
    if (error instanceof HttpError) {
      return jsonResponse({ error: error.message }, error.status, corsHeaders);
    }
    const message = error instanceof Error ? error.message : "Erreur interne";
    return jsonResponse({ error: message }, 500, corsHeaders);
  }
});
