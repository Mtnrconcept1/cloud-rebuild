import {
  HttpError,
  assertProductionFlowAllowed,
  authenticateRequest,
  getEnv,
  jsonResponse,
  writeAuditLog,
} from "../_shared/auth.ts";
import { buildCorsHeaders, handleCorsPreflight } from "../_shared/cors.ts";
import { normalizeCheckoutReturnUrl } from "../_shared/return-url.ts";
import { getStripeRuntimeForCheckoutKind } from "../_shared/stripe-client.ts";
import { resolveMarketplaceRouting } from "../_shared/marketplace-finance.ts";
import { isClientCheckoutRestaurantEligible } from "../_shared/order-pricing.ts";

const toCents = (value: number) => Math.round(value * 100);

Deno.serve(async (req) => {
  const corsHeaders = buildCorsHeaders(req);
  const preflight = handleCorsPreflight(req, corsHeaders);
  if (preflight) return preflight;

  let actor: Awaited<ReturnType<typeof authenticateRequest>> | null = null;
  let targetId = "";

  try {
    actor = await authenticateRequest(req);
    if (!actor.userId) throw new HttpError(401, "Connexion requise");
    await assertProductionFlowAllowed(actor, "commande de groupe réelle");

    const { group_member_order_id, return_url } = await req.json();
    if (!group_member_order_id) throw new HttpError(400, "group_member_order_id requis");

    const { data: featureFlag, error: featureFlagError } = await actor.adminClient
      .from("feature_flags")
      .select("is_active")
      .eq("name", "match-groupes")
      .maybeSingle();
    if (featureFlagError) throw new HttpError(500, featureFlagError.message);
    if (featureFlag?.is_active !== true) throw new HttpError(404, "Match groupes indisponible");

    const safeReturnUrl = normalizeCheckoutReturnUrl(return_url || `${getEnv("PUBLIC_APP_URL") || getEnv("SITE_URL")}/match-groupes`);
    if (!safeReturnUrl) throw new HttpError(400, "URL de retour invalide");

    const { data: order, error } = await actor.adminClient
      .from("group_member_orders")
      .select("*, order_groups(status,is_active,lock_at,expires_at)")
      .eq("id", group_member_order_id)
      .maybeSingle();
    if (error) throw new HttpError(500, error.message);
    if (!order) throw new HttpError(404, "Commande de groupe introuvable");

    targetId = order.id;
    if (order.user_id !== actor.userId) throw new HttpError(403, "Acces interdit");
    if (order.status !== "joined") throw new HttpError(409, "Commande de groupe non autorisable");
    if (order.payment_status === "authorized") return jsonResponse({ already_authorized: true }, 200, corsHeaders);

    const group = order.order_groups;
    const lockAt = group?.lock_at || group?.expires_at;
    if (!group || group.status !== "open" || group.is_active !== true || (lockAt && new Date(lockAt).getTime() <= Date.now())) {
      throw new HttpError(409, "Le groupe est ferme");
    }

    const requestedItems = Array.isArray(order.items) ? order.items : [];
    if (requestedItems.length === 0 || requestedItems.length > 50) {
      throw new HttpError(400, "Panier Match groupe invalide");
    }

    const normalizedItems = requestedItems.map((item) => {
      const menuItemId = String(item?.menu_item_id || "");
      const quantity = Number(item?.quantity);
      if (!menuItemId || !Number.isInteger(quantity) || quantity < 1 || quantity > 20) {
        throw new HttpError(400, "Article ou quantité invalide");
      }
      return { menuItemId, quantity };
    });
    const itemIds = normalizedItems.map((item) => item.menuItemId);
    if (new Set(itemIds).size !== itemIds.length) {
      throw new HttpError(400, "Un article ne peut apparaître qu’une fois");
    }
    if (normalizedItems.reduce((total, item) => total + item.quantity, 0) > 100) {
      throw new HttpError(400, "Quantité totale trop élevée");
    }

    const { data: menuRows, error: menuError } = await actor.adminClient
      .from("menu_items")
      .select("id,name,price,restaurant_id,is_available")
      .in("id", itemIds);
    if (menuError) throw new HttpError(500, menuError.message);
    if (!menuRows || menuRows.length !== itemIds.length) {
      throw new HttpError(409, "Un article n’est plus disponible");
    }

    const menuById = new Map(menuRows.map((item) => [item.id, item]));
    const canonicalItems = normalizedItems.map(({ menuItemId, quantity }) => {
      const menuItem = menuById.get(menuItemId);
      const price = Number(menuItem?.price);
      if (!menuItem || menuItem.is_available !== true || menuItem.restaurant_id !== order.restaurant_id
        || !Number.isFinite(price) || price <= 0) {
        throw new HttpError(409, "Un article n’est plus disponible dans ce restaurant");
      }
      return {
        menu_item_id: menuItem.id,
        name: String(menuItem.name || "Article Match groupe"),
        quantity,
        original_price: price,
        restaurant_id: menuItem.restaurant_id,
      };
    });
    const canonicalSubtotal = canonicalItems.reduce(
      (total, item) => total + item.original_price * item.quantity,
      0,
    );
    if (!Number.isFinite(canonicalSubtotal) || canonicalSubtotal <= 0 || canonicalSubtotal > 5000) {
      throw new HttpError(400, "Montant Match groupe invalide");
    }

    const stripeRuntime = getStripeRuntimeForCheckoutKind("match-group");
    const { stripe } = stripeRuntime;
    const grossCents = toCents(canonicalSubtotal);
    const marketplaceRouting = await resolveMarketplaceRouting({
      adminClient: actor.adminClient,
      checkoutKind: "match-group",
      restaurantId: order.restaurant_id,
      grossCents,
      commissionableCents: grossCents,
      tipCents: 0,
      deliveryPassThroughCents: 0,
      stripeMode: stripeRuntime.mode,
    });
    if (!marketplaceRouting.enabled || !marketplaceRouting.destinationAccountId) {
      throw new HttpError(503, "MATCH_GROUP_CONNECT_ROUTING_NOT_READY");
    }

    const loadCheckoutRestaurant = async () => {
      const { data: restaurant, error: restaurantError } = await actor.adminClient
        .from("restaurants")
        .select("id,is_active,status,is_demo")
        .eq("id", order.restaurant_id)
        .maybeSingle();
      if (restaurantError) throw new HttpError(500, restaurantError.message);
      return restaurant;
    };

    const terminateUnavailableAuthorization = async (sessionId: string) => {
      const existingSession = await stripe.checkout.sessions.retrieve(sessionId, {
        expand: ["payment_intent"],
      });
      const identityMatches = existingSession.livemode === (stripeRuntime.mode === "live")
        && existingSession.metadata?.checkout_kind === "match-group"
        && existingSession.metadata?.group_member_order_id === order.id
        && existingSession.metadata?.group_id === order.group_id
        && existingSession.metadata?.restaurant_id === order.restaurant_id
        && existingSession.metadata?.user_id === actor.userId;
      if (!identityMatches) {
        throw new HttpError(409, "MATCH_GROUP_CHECKOUT_IDENTITY_MISMATCH");
      }

      if (existingSession.status === "open") {
        await stripe.checkout.sessions.expire(existingSession.id, {}, {
          idempotencyKey: `match-group:expire-unavailable:${order.id}:${existingSession.id}`.slice(0, 255),
        });
      }

      const paymentIntentId = typeof existingSession.payment_intent === "string"
        ? existingSession.payment_intent
        : existingSession.payment_intent?.id || null;
      const paymentIntent = existingSession.payment_intent && typeof existingSession.payment_intent === "object"
        ? existingSession.payment_intent
        : paymentIntentId
          ? await stripe.paymentIntents.retrieve(paymentIntentId)
          : null;
      if (paymentIntent?.status === "requires_capture" && paymentIntentId) {
        try {
          await stripe.paymentIntents.cancel(paymentIntentId, {
            cancellation_reason: "abandoned",
          }, {
            idempotencyKey: `match-group:cancel-unavailable:${order.id}:${paymentIntentId}`.slice(0, 255),
          });
        } catch (cancelError) {
          const recoveredIntent = await stripe.paymentIntents.retrieve(paymentIntentId);
          if (recoveredIntent.status !== "canceled") throw cancelError;
        }
      } else if (paymentIntent?.status === "succeeded") {
        throw new HttpError(409, "MATCH_GROUP_PAYMENT_ALREADY_CAPTURED");
      }

      const { error: terminalError } = await actor.adminClient.rpc(
        "mark_match_group_member_capture_failed",
        {
          p_member_order_id: order.id,
          p_error: "MATCH_GROUP_RESTAURANT_UNAVAILABLE",
          p_terminal: true,
        },
      );
      if (terminalError) throw new HttpError(500, terminalError.message);
    };

    const checkoutRestaurant = await loadCheckoutRestaurant();
    if (!isClientCheckoutRestaurantEligible(checkoutRestaurant)) {
      if (order.stripe_checkout_session_id) {
        await terminateUnavailableAuthorization(order.stripe_checkout_session_id);
      }
      throw new HttpError(409, "MATCH_GROUP_RESTAURANT_UNAVAILABLE");
    }

    const paymentMetadata = {
      checkout_kind: "match-group",
      group_id: String(order.group_id),
      group_member_order_id: String(order.id),
      user_id: actor.userId,
      restaurant_id: String(order.restaurant_id),
      payment_method_label: "card",
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

    let idempotencyGeneration = "initial";
    if (order.stripe_checkout_session_id) {
      const existingSession = await stripe.checkout.sessions.retrieve(order.stripe_checkout_session_id);
      if (
        existingSession.livemode !== (stripeRuntime.mode === "live")
        || existingSession.metadata?.group_member_order_id !== order.id
        || existingSession.metadata?.restaurant_id !== order.restaurant_id
      ) {
        throw new HttpError(409, "MATCH_GROUP_CHECKOUT_IDENTITY_MISMATCH");
      }
      const restaurantBeforeReuse = await loadCheckoutRestaurant();
      if (!isClientCheckoutRestaurantEligible(restaurantBeforeReuse)) {
        await terminateUnavailableAuthorization(existingSession.id);
        throw new HttpError(409, "MATCH_GROUP_RESTAURANT_UNAVAILABLE");
      }
      if (existingSession.status === "open" && existingSession.url) {
        return jsonResponse({ url: existingSession.url, session_id: existingSession.id, reused: true }, 200, corsHeaders);
      }
      if (existingSession.status === "complete") {
        return jsonResponse({ already_authorized: true, session_id: existingSession.id }, 200, corsHeaders);
      }
      idempotencyGeneration = existingSession.id;
    }

    const restaurantBeforeStripeWrite = await loadCheckoutRestaurant();
    if (!isClientCheckoutRestaurantEligible(restaurantBeforeStripeWrite)) {
      if (order.stripe_checkout_session_id) {
        await terminateUnavailableAuthorization(order.stripe_checkout_session_id);
      }
      throw new HttpError(409, "MATCH_GROUP_RESTAURANT_UNAVAILABLE");
    }

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      payment_method_types: ["card"],
      line_items: canonicalItems.map((item) => ({
        price_data: {
          currency: "chf",
          product_data: { name: item.name },
          unit_amount: toCents(item.original_price),
        },
        quantity: item.quantity,
      })),
      success_url: `${safeReturnUrl}${safeReturnUrl.includes("?") ? "&" : "?"}match_group_authorized=1&member_order_id=${order.id}`,
      cancel_url: `${safeReturnUrl}${safeReturnUrl.includes("?") ? "&" : "?"}match_group_authorized=0&member_order_id=${order.id}`,
      client_reference_id: actor.userId,
      payment_intent_data: {
        capture_method: "manual",
        application_fee_amount: marketplaceRouting.stripeApplicationFeeCents,
        transfer_data: {
          destination: marketplaceRouting.destinationAccountId,
        },
        metadata: paymentMetadata,
      },
      metadata: paymentMetadata,
    }, {
      idempotencyKey: `match-group-authorization:${order.id}:${idempotencyGeneration}:${grossCents}`.slice(0, 255),
    });

    const restaurantAfterStripeWrite = await loadCheckoutRestaurant();
    if (!isClientCheckoutRestaurantEligible(restaurantAfterStripeWrite)) {
      if (session.status === "open") {
        await stripe.checkout.sessions.expire(session.id, {}, {
          idempotencyKey: `match-group:expire-unavailable:${order.id}:${session.id}`.slice(0, 255),
        });
      }
      const { error: terminalError } = await actor.adminClient.rpc(
        "mark_match_group_member_capture_failed",
        {
          p_member_order_id: order.id,
          p_error: "MATCH_GROUP_RESTAURANT_UNAVAILABLE",
          p_terminal: true,
        },
      );
      if (terminalError) throw new HttpError(500, terminalError.message);
      throw new HttpError(409, "MATCH_GROUP_RESTAURANT_UNAVAILABLE");
    }

    const { error: mappingError } = await actor.adminClient
      .from("group_member_orders")
      .update({
        items: canonicalItems,
        subtotal: canonicalSubtotal,
        stripe_checkout_session_id: session.id,
        authorization_amount: canonicalSubtotal,
        payment_status: "pending",
        metadata: {
          ...(order.metadata || {}),
          ...paymentMetadata,
          stripe_mode: stripeRuntime.mode,
          canonical_pricing_at: new Date().toISOString(),
        },
      })
      .eq("id", order.id);

    if (mappingError) {
      if (session.status === "open") {
        await stripe.checkout.sessions.expire(session.id).catch(() => undefined);
      }
      throw new HttpError(500, `MATCH_GROUP_SESSION_MAPPING_FAILED:${mappingError.message}`);
    }

    await writeAuditLog({
      adminClient: actor.adminClient,
      actor,
      request: req,
      functionName: "authorize-match-group-order",
      action: "create_authorization_session",
      status: "success",
      targetEntityType: "group_member_orders",
      targetEntityId: order.id,
      metadata: { group_id: order.group_id, session_id: session.id, canonical_subtotal: canonicalSubtotal },
    });

    return jsonResponse({ url: session.url, session_id: session.id }, 200, corsHeaders);
  } catch (error) {
    const status = error instanceof HttpError ? error.status : 500;
    const message = error instanceof Error ? error.message : "Erreur autorisation Match groupe";
    if (actor) {
      await writeAuditLog({
        adminClient: actor.adminClient,
        actor,
        request: req,
        functionName: "authorize-match-group-order",
        action: "create_authorization_session",
        status: "failure",
        targetEntityType: "group_member_orders",
        targetEntityId: targetId || null,
        errorMessage: message,
      });
    }
    return jsonResponse({ error: message }, status, corsHeaders);
  }
});

