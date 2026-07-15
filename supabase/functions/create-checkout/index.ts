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
import { getLatestTokOneSubscription, isTokOneEntitledStatus } from "../_shared/tok-one.ts";
import { createRateLimiter } from "../_shared/rate-limit.ts";
import {
  assertPaymentMethodAllowed,
  getEffectiveFeatureFlagSet,
} from "../_shared/feature-flags.ts";
import { buildVerifiedOrderPricing } from "../_shared/order-pricing.ts";
import {
  MARKETPLACE_CHECKOUT_KINDS,
  resolveMarketplaceRouting,
} from "../_shared/marketplace-finance.ts";

const toMoney = (value: unknown) => Math.max(0, Number(value) || 0);
type CheckoutItem = Record<string, unknown>;
const CLIENT_STRIPE_CHECKOUT_KINDS = new Set(["order", "zero-attente", "chefs-table"]);
const RESTAURANT_CREDIT_ONLY_CHECKOUT_KINDS = new Set(["campaign"]);

function normalizeCheckoutKind(value: unknown) {
  return String(value || "order").trim().toLowerCase();
}

function normalizePaymentMethod(value: unknown) {
  return String(value || "card").trim().toLowerCase();
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
    } = await req.json();

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

    const isSubscriptionCheckout =
      effectiveKind === "tok-one"
      || effectiveKind === "restaurant-onboarding"
      || effectiveKind === "restaurant-subscription-upgrade";
    const stripeRuntime = getStripeRuntimeForCheckoutKind(effectiveKind);
    const stripe = stripeRuntime.stripe;
    const safeReturnUrl = normalizeCheckoutReturnUrl(return_url);
    if (!safeReturnUrl) {
      throw new HttpError(400, "URL de retour invalide");
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

    switch (normalizedPaymentMethod) {
      case "twint":
        break;
      case "postfinance_card":
      case "postfinance_efinance":
        throw new HttpError(
          400,
          "Les paiements PostFinance sont temporairement indisponibles. Utilisez la carte bancaire ou TWINT.",
        );
      case "card":
      default:
        break;
    }


    let lineItems: Stripe.Checkout.SessionCreateParams.LineItem[] = [];
    let discountCents = 0;
    let zeroAttenteHoldReservationId = "";
    let chefTableHoldCount = 0;
    let creditPackPurchaseId = "";
    let marketplaceRestaurantId = "";
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
      const billingPeriod = String(order_metadata?.billing_period || "monthly") === "yearly"
        ? "yearly"
        : "monthly";

      if (!planId) throw new HttpError(400, "plan_id requis");
      if (!restaurantId) throw new HttpError(400, "restaurant_id requis");
      if (billingPeriod !== "monthly") throw new HttpError(400, "Les abonnements restaurateur sont mensuels");
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
          .select("id, user_id, requested_role, metadata")
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
        const selectedPlanId = String(applicationMetadata.selected_subscription_plan_id || "");
        const selectedBillingPeriod = String(applicationMetadata.selected_subscription_billing_period || "monthly");

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

      const subscriptionAmount = Number(plan.price_monthly_chf);
      if (subscriptionAmount <= 0) throw new HttpError(400, "Prix du plan invalide");

      const { data: existingSub, error: existingSubError } = await actor.adminClient
        .from("restaurant_ai_subscriptions")
        .select("id, status, current_period_end")
        .eq("restaurant_id", restaurantId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (existingSubError) throw new HttpError(500, existingSubError.message);
      const hasActiveSubscription = Boolean(
        existingSub &&
        isTokOneEntitledStatus(existingSub.status) &&
        (!existingSub.current_period_end || new Date(existingSub.current_period_end) > new Date()),
      );
      if (hasActiveSubscription) {
        throw new HttpError(409, "Vous avez deja un abonnement actif");
      }

      lineItems = [{
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
            interval: "month",
          },
          unit_amount: Math.round(subscriptionAmount * 100),
        },
        quantity: 1,
      }];

      sessionMetadata = {
        ...sessionMetadata,
        restaurant_id: restaurantId,
        signup_application_id: signupApplicationId,
        plan_id: plan.id,
        restaurant_subscription_plan_id: plan.id,
        restaurant_subscription_plan_slug: plan.slug,
        plan_name: plan.name,
        billing_period: "monthly",
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
    } else if (effectiveKind === "restaurant-subscription-upgrade") {
      const planId = String(order_metadata?.plan_id || "");
      const restaurantId = String(order_metadata?.restaurant_id || "");
      const restaurantSubscriptionUpgradeSamePlanCode = "restaurant_subscription_upgrade_same_plan";

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

      const subscriptionAmount = Number(plan.price_monthly_chf);
      if (subscriptionAmount <= 0) throw new HttpError(400, "Prix du plan invalide");

      const { data: existingSub, error: existingSubError } = await actor.adminClient
        .from("restaurant_ai_subscriptions")
        .select("id, plan, status, current_period_end, restaurant_subscription_plan_id, stripe_subscription_id")
        .eq("restaurant_id", restaurantId)
        .maybeSingle();

      if (existingSubError) throw new HttpError(500, existingSubError.message);

      const hasActiveSubscription = Boolean(
        existingSub &&
        isTokOneEntitledStatus(existingSub.status) &&
        (!existingSub.current_period_end || new Date(existingSub.current_period_end) > new Date()),
      );

      let currentPlanPosition = 0;
      if (existingSub?.restaurant_subscription_plan_id) {
        const { data: currentPlan, error: currentPlanError } = await actor.adminClient
          .from("restaurant_subscription_plans")
          .select("id, slug, position, price_monthly_chf")
          .eq("id", existingSub.restaurant_subscription_plan_id)
          .maybeSingle();

        if (currentPlanError) throw new HttpError(500, currentPlanError.message);
        currentPlanPosition = Number(currentPlan?.position || 0);
      } else if (existingSub?.plan) {
        const { data: currentPlan, error: currentPlanError } = await actor.adminClient
          .from("restaurant_subscription_plans")
          .select("id, slug, position, price_monthly_chf")
          .eq("slug", existingSub.plan)
          .maybeSingle();

        if (currentPlanError) throw new HttpError(500, currentPlanError.message);
        currentPlanPosition = Number(currentPlan?.position || 0);
      }

      if (
        hasActiveSubscription &&
        (
          existingSub?.restaurant_subscription_plan_id === plan.id
          || existingSub?.plan === plan.slug
          || Number(plan.position || 0) <= currentPlanPosition
        )
      ) {
        log.warn(restaurantSubscriptionUpgradeSamePlanCode, {
          restaurantId,
          currentPlan: existingSub?.plan || null,
          requestedPlan: plan.slug,
        });
        throw new HttpError(409, "Vous etes deja sur ce plan ou un plan superieur");
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
              interval: "month",
            },
            unit_amount: Math.round(subscriptionAmount * 100),
          },
          quantity: 1,
        },
      ];

      sessionMetadata = {
        ...sessionMetadata,
        restaurant_id: restaurantId,
        plan_id: plan.id,
        restaurant_subscription_plan_id: plan.id,
        restaurant_subscription_plan_slug: plan.slug,
        plan_name: plan.name,
        billing_period: "monthly",
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

      const { data: purchaseRecord, error: purchaseError } = await actor.adminClient
        .from("restaurant_credit_purchases")
        .insert({
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
          },
        })
        .select("id")
        .single();

      if (purchaseError) throw new HttpError(500, purchaseError.message);
      creditPackPurchaseId = purchaseRecord.id;

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
        restaurant_credit_purchase_id: purchaseRecord.id,
        credit_pack_purchase_id: purchaseRecord.id,
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
      const totalDeliveryFee = toMoney(order_metadata?.delivery_fee);
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

    const totalBeforeDiscountCents = lineItems.reduce(
      (sum, lineItem) => sum + ((lineItem.price_data?.unit_amount || 0) * (lineItem.quantity || 1)),
      0,
    );
    discountCents = Math.min(discountCents, totalBeforeDiscountCents);
    const finalCheckoutTotalCents = Math.max(0, totalBeforeDiscountCents - discountCents);

    const marketplaceRouting = await resolveMarketplaceRouting({
      adminClient: actor.adminClient,
      checkoutKind: effectiveKind,
      restaurantId: marketplaceRestaurantId || sessionMetadata.restaurant_id,
      grossCents: finalCheckoutTotalCents,
    });

    if (MARKETPLACE_CHECKOUT_KINDS.has(effectiveKind)) {
      sessionMetadata = {
        ...sessionMetadata,
        finance_routing_mode: marketplaceRouting.mode,
        platform_fee_bps: String(marketplaceRouting.platformFeeBps),
        platform_fee_amount_cents: String(marketplaceRouting.platformFeeCents),
        restaurant_share_amount_cents: String(marketplaceRouting.restaurantShareCents),
        developer_share_bps: String(marketplaceRouting.developerShareBps || 1000),
      };
    }

    const urlSeparator = safeReturnUrl.includes("?") ? "&" : "?";
    const userLookup = actor.userClient ? await actor.userClient.auth.getUser() : null;
    const userEmail = userLookup?.data.user?.email || undefined;

    const sessionParams: Stripe.Checkout.SessionCreateParams = {
      line_items: lineItems,
      mode: isSubscriptionCheckout ? "subscription" : "payment",
      success_url: `${safeReturnUrl}${urlSeparator}session_id={CHECKOUT_SESSION_ID}&status=success`,
      cancel_url: `${safeReturnUrl}${urlSeparator}status=cancelled`,
      customer_email: userEmail,
      client_reference_id: actor.userId || undefined,
      metadata: sessionMetadata,
    };

    if (marketplaceRouting.enabled && marketplaceRouting.destinationAccountId) {
      sessionParams.payment_intent_data = {
        application_fee_amount: marketplaceRouting.platformFeeCents,
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
      const coupon = await stripe.coupons.create({
        amount_off: discountCents,
        currency: "chf",
        duration: "once",
        name: couponName,
      });
      sessionParams.discounts = [{ coupon: coupon.id }];
    }

    const idempotencySource = String(
      sessionMetadata.checkout_id
      || sessionMetadata.checkout_group_id
      || sessionMetadata.primary_order_id
      || sessionMetadata.order_reference
      || "",
    ).trim();
    const checkoutRequestOptions = idempotencySource
      ? { idempotencyKey: `tok-checkout:${effectiveKind}:${actor.userId}:${idempotencySource}`.slice(0, 255) }
      : undefined;

    const session = await stripe.checkout.sessions.create(sessionParams, checkoutRequestOptions);

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
          await stripe.checkout.sessions.expire(session.id);
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
          await stripe.checkout.sessions.expire(session.id);
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
          await stripe.checkout.sessions.expire(session.id);
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
        line_items: lineItems.length,
        zero_attente_hold_reservation_id: zeroAttenteHoldReservationId || null,
        chef_table_hold_count: chefTableHoldCount || null,
      },
    });
    return jsonResponse(
      { url: session.url, session_id: session.id },
      200,
      corsHeaders,
    );
  } catch (error) {
    log.error("create-checkout error", { message: error instanceof Error ? error.message : "unknown" });
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
