import Stripe from "npm:stripe@18.5.0";

import {
  HttpError,
  authenticateRequest,
  createAdminClient,
  getEnv,
  jsonResponse,
  requireRestaurantAccess,
  writeAuditLog,
} from "../_shared/auth.ts";
import { buildCorsHeaders, handleCorsPreflight } from "../_shared/cors.ts";
import { makeLogger } from "../_shared/logging.ts";
import { isTokOneEntitledStatus } from "../_shared/tok-one.ts";
import {
  assertPaymentMethodAllowed,
  getEffectiveFeatureFlagSet,
} from "../_shared/feature-flags.ts";
import { buildVerifiedOrderPricing } from "../_shared/order-pricing.ts";

const toMoney = (value: unknown) => Math.max(0, Number(value) || 0);
type CheckoutItem = Record<string, unknown>;

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
    actor = await authenticateRequest(req, { allowServiceRole: false });
    const {
      items,
      payment_method,
      return_url,
      order_metadata,
      checkout_kind,
    } = await req.json();

    if (!return_url) {
      throw new HttpError(400, "URL de retour requise");
    }

    const stripeSecretKey = getEnv("STRIPE_SECRET_KEY");
    if (!stripeSecretKey) {
      throw new HttpError(503, "STRIPE_SECRET_KEY not configured");
    }

    const stripe = new Stripe(stripeSecretKey, {
      apiVersion: "2025-08-27.basil",
    });

    const effectiveKind = checkout_kind || order_metadata?.checkout_kind || "order";
    auditKind = effectiveKind;
    const activeFlags = await getEffectiveFeatureFlagSet(actor.adminClient);
    assertPaymentMethodAllowed({
      activeFlags,
      paymentMethod: payment_method,
      cashAllowed: effectiveKind === "campaign",
    });

    const paymentMethodTypes: string[] = [];
    switch (payment_method) {
      case "twint":
        paymentMethodTypes.push("twint");
        break;
      case "postfinance_card":
      case "postfinance_efinance":
        throw new HttpError(
          400,
          "Les paiements PostFinance sont temporairement indisponibles. Utilisez la carte bancaire ou TWINT.",
        );
      case "card":
      default:
        paymentMethodTypes.push("card");
        break;
    }


    let lineItems: Stripe.Checkout.SessionCreateParams.LineItem[] = [];
    let discountCents = 0;
    let sessionMetadata: Record<string, string> = {
      user_id: actor.userId || "",
      checkout_kind: effectiveKind,
      payment_method_label: String(payment_method || "card"),
      order_reference: String(order_metadata?.order_reference || ""),
      restaurant_id: String(order_metadata?.restaurant_id || ""),
      campaign_id: String(order_metadata?.campaign_id || ""),
      campaign_title: String(order_metadata?.campaign_title || ""),
      checkout_id: String(order_metadata?.checkout_id || ""),
      checkout_group_id: String(order_metadata?.checkout_group_id || ""),
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
      const packId = String(order_metadata?.pack_id || "");
      const restaurantId = String(order_metadata?.restaurant_id || "");
      if (!packId) throw new HttpError(400, "pack_id requis");
      if (!restaurantId) throw new HttpError(400, "restaurant_id requis");

      auditTargetEntityType = "launch_packs";
      auditTargetEntityId = packId;

      await requireRestaurantAccess(actor, restaurantId);

      const { data: pack, error: packError } = await actor.adminClient
        .from("launch_packs")
        .select("id, slug, name, price_chf, services, is_active")
        .eq("id", packId)
        .eq("is_active", true)
        .maybeSingle();

      if (packError) throw new HttpError(500, packError.message);
      if (!pack) throw new HttpError(404, "Pack introuvable ou inactif");

      const packAmount = Number(pack.price_chf);
      if (packAmount <= 0) throw new HttpError(400, "Prix du pack invalide");

      // Check no existing active pack for this restaurant
      const { data: existingPack } = await actor.adminClient
        .from("restaurant_launch_packs")
        .select("id, status")
        .eq("restaurant_id", restaurantId)
        .eq("pack_id", packId)
        .not("status", "eq", "cancelled")
        .maybeSingle();

      if (existingPack) throw new HttpError(409, "Ce pack est deja achete pour ce restaurant");

      // Create pending record
      const { data: purchaseRecord, error: purchaseError } = await actor.adminClient
        .from("restaurant_launch_packs")
        .insert({
          restaurant_id: restaurantId,
          pack_id: packId,
          purchased_by: actor.userId,
          status: "pending_payment",
        })
        .select("id")
        .single();

      if (purchaseError) throw new HttpError(500, purchaseError.message);

      lineItems = [{
        price_data: {
          currency: "chf",
          product_data: {
            name: `Pack de lancement - ${pack.name}`,
          },
          unit_amount: Math.round(packAmount * 100),
        },
        quantity: 1,
      }];

      sessionMetadata = {
        ...sessionMetadata,
        restaurant_id: restaurantId,
        pack_id: pack.id,
        pack_slug: pack.slug,
        restaurant_launch_pack_id: purchaseRecord.id,
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
        .select("id, name, price_monthly, price_yearly, stripe_product_id, status")
        .eq("id", planId)
        .eq("status", "active")
        .maybeSingle();

      if (planError) throw new HttpError(500, planError.message);
      if (!plan) throw new HttpError(404, "Plan introuvable ou inactif");

      const billingPeriod = String(order_metadata?.billing_period || "monthly");
      const amount = billingPeriod === "yearly"
        ? Number(plan.price_yearly)
        : Number(plan.price_monthly);

      if (amount <= 0) throw new HttpError(400, "Prix du plan invalide");

      // Check no existing active subscription
      if (payment_method !== "card") {
        throw new HttpError(400, "Tok One requiert un paiement par carte");
      }

      const { data: existingSub, error: existingSubError } = await actor.adminClient
        .from("tok_one_subscriptions")
        .select("id, status, current_period_end")
        .eq("user_id", actor.userId!)
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
            name: `Tok One - ${plan.name} (${billingPeriod === "yearly" ? "Annuel" : "Mensuel"})`,
          },
          recurring: {
            interval: billingPeriod === "yearly" ? "year" : "month",
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
        authoritative_total: amount.toFixed(2),
      };
    } else if (effectiveKind === "campaign") {
      const campaignId = String(order_metadata?.campaign_id || "");
      if (!campaignId) {
        throw new HttpError(400, "campaign_id requis");
      }
      auditTargetEntityType = "ad_campaigns";
      auditTargetEntityId = campaignId;

      const { data: campaign, error: campaignError } = await actor.adminClient
        .from("ad_campaigns")
        .select("id, restaurant_id, title, total_budget")
        .eq("id", campaignId)
        .maybeSingle();

      if (campaignError) throw new HttpError(500, campaignError.message);
      if (!campaign) throw new HttpError(404, "Campagne introuvable");

      const restaurant = await requireRestaurantAccess(actor, campaign.restaurant_id);
      const campaignAmount = toMoney(campaign.total_budget);
      if (campaignAmount <= 0) {
        throw new HttpError(400, "Budget de campagne invalide");
      }

      lineItems = [{
        price_data: {
          currency: "chf",
          product_data: {
            name: `Campagne publicitaire - ${campaign.title}`,
            description: restaurant.name || undefined,
          },
          unit_amount: Math.round(campaignAmount * 100),
        },
        quantity: 1,
      }];

      sessionMetadata = {
        ...sessionMetadata,
        restaurant_id: campaign.restaurant_id,
        campaign_id: campaign.id,
        campaign_title: campaign.title,
        authoritative_total: campaignAmount.toFixed(2),
      };
    } else if (effectiveKind === "chefs-table") {
      if (!Array.isArray(items) || items.length === 0) {
        throw new HttpError(400, "Aucune experience Chef's Table.");
      }

      auditTargetEntityType = "chef_table_drops";
      auditTargetEntityId = String(order_metadata?.checkout_group_id || "");

      const dropIds = Array.from(new Set(
        (items as CheckoutItem[])
          .map((item) => String(item?.metadata?.chef_table_drop_id || ""))
          .filter(Boolean),
      ));

      if (dropIds.length === 0) {
        throw new HttpError(400, "Drop Chef's Table introuvable.");
      }

      const { data: dropRows, error: dropsError } = await actor.adminClient
        .from("chef_table_drops")
        .select("id, restaurant_id, chef_name, dish_name, price, original_price, drop_time, remaining_portions, is_active, restaurants(name)")
        .in("id", dropIds);

      if (dropsError) throw new HttpError(500, dropsError.message);

      const dropMap = new Map((dropRows || []).map((row: any) => [row.id, row]));
      let authoritativeTotal = 0;

      for (const item of items as CheckoutItem[]) {
        const dropId = String(item?.metadata?.chef_table_drop_id || "");
        const quantity = Math.max(1, Number(item?.quantity || 1));
        const drop = dropMap.get(dropId);

        if (!drop) {
          throw new HttpError(404, "Drop Chef's Table introuvable.");
        }
        if (!drop.is_active) {
          throw new HttpError(409, "Ce drop Chef's Table n'est plus disponible.");
        }
        if (Number(drop.remaining_portions || 0) < quantity) {
          throw new HttpError(409, "Le nombre de portions disponibles a change pour ce drop.");
        }

        const unitAmount = Math.round(Number(drop.price || 0) * 100);
        if (unitAmount <= 0) {
          throw new HttpError(400, "Prix Chef's Table invalide.");
        }

        lineItems.push({
          price_data: {
            currency: "chf",
            product_data: {
              name: String(drop.dish_name || item?.name || "Experience Chef's Table"),
              description: String(drop.restaurants?.name || item?.restaurant_name || "Chef's Table"),
              metadata: {
                chef_table_drop_id: drop.id,
                restaurant_id: drop.restaurant_id,
                drop_time: String(drop.drop_time || ""),
                source: "chef_table_drop",
              },
            },
            unit_amount: unitAmount,
          },
          quantity,
        });

        authoritativeTotal += Number(drop.price || 0) * quantity;
      }

      sessionMetadata = {
        ...sessionMetadata,
        restaurant_id: String(order_metadata?.restaurant_id || ""),
        authoritative_total: authoritativeTotal.toFixed(2),
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

      const groupedItems = new Map<string, CheckoutItem[]>();
      for (const item of items as CheckoutItem[]) {
        const restaurantId = String(item?.restaurant_id || item?.restaurantId || primaryRestaurantId);
        if (!restaurantId) throw new HttpError(400, "restaurant_id manquant sur un article");
        if (!groupedItems.has(restaurantId)) groupedItems.set(restaurantId, []);
        groupedItems.get(restaurantId)!.push(item);
      }

      const restaurantIds = Array.from(groupedItems.keys());
      const totalDeliveryFee = toMoney(order_metadata?.delivery_fee);
      const totalPointsDiscount = toMoney(order_metadata?.points_discount_amount || order_metadata?.points_discount);
      const totalFlexDiscount = toMoney(order_metadata?.flex_discount_amount || order_metadata?.flex_discount);
      const pointsByRestaurant = new Map<string, number>();
      const flexByRestaurant = new Map<string, number>();

      const perRestaurantSubtotals = Array.from(groupedItems.entries()).map(([restaurantId, restaurantItems]) => ({
        restaurantId,
        subtotal: restaurantItems.reduce(
          (sum, item) => sum + (toMoney(item?.price ?? item?.unit_price) * Math.max(1, Number(item?.quantity || 1))),
          0,
        ),
      }));
      const totalSubtotal = perRestaurantSubtotals.reduce((sum, row) => sum + row.subtotal, 0);

      const allocateDiscount = (totalDiscount: number, targetMap: Map<string, number>) => {
        let remaining = Math.round(totalDiscount * 100) / 100;
        perRestaurantSubtotals.forEach((row, index) => {
          const share = totalSubtotal > 0 ? row.subtotal / totalSubtotal : (restaurantIds.length > 0 ? 1 / restaurantIds.length : 0);
          const allocated = index === perRestaurantSubtotals.length - 1
            ? Math.max(0, remaining)
            : Math.round((totalDiscount * share) * 100) / 100;
          remaining = Math.max(0, Math.round((remaining - allocated) * 100) / 100);
          targetMap.set(row.restaurantId, allocated);
        });
      };

      allocateDiscount(totalPointsDiscount, pointsByRestaurant);
      allocateDiscount(totalFlexDiscount, flexByRestaurant);

      let authoritativeTotal = 0;
      let formulaDiscountTotal = 0;
      let promoDiscountTotal = 0;
      let promoCodeDiscountTotal = 0;
      let appliedPromoCodeId = "";
      let tokOneDiscountTotal = 0;
      let tokOneDeliveryDiscountTotal = 0;
      let tokOneMemberAny = false;
      let tokOneDiscountPercentMax = 0;
      let pointsDiscountTotal = 0;
      let flexDiscountTotal = 0;
      const primaryFormulaNames: string[] = [];
      const primaryPromoNames: string[] = [];

      for (const [index, [restaurantId, restaurantItems]] of Array.from(groupedItems.entries()).entries()) {
        const deliveryFeeShare = restaurantIds.length > 0 ? totalDeliveryFee / restaurantIds.length : totalDeliveryFee;
        const groupMetadata = {
          ...(order_metadata || {}),
          payment_method,
          delivery_fee: deliveryFeeShare,
          points_discount_amount: pointsByRestaurant.get(restaurantId) || 0,
          flex_discount_amount: flexByRestaurant.get(restaurantId) || 0,
          formula_discount_amount: restaurantId === primaryRestaurantId ? order_metadata?.formula_discount_amount || order_metadata?.formula_discount : 0,
          formula_discount: restaurantId === primaryRestaurantId ? order_metadata?.formula_discount || 0 : 0,
          promotion_discount_amount: restaurantId === primaryRestaurantId ? order_metadata?.promotion_discount_amount || 0 : 0,
          promotion_applied: restaurantId === primaryRestaurantId ? order_metadata?.promotion_applied || null : null,
          promo_code_id: restaurantId === primaryRestaurantId ? order_metadata?.promo_code_id || null : null,
        };

        const pricing = await buildVerifiedOrderPricing({
          adminClient: actor.adminClient,
          userId: actor.userId!,
          restaurantId,
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
        pointsDiscountTotal += pricing.pointsDiscount;
        flexDiscountTotal += pricing.flexDiscount;

        if (index === 0 && primaryRestaurantId === restaurantId && pricing.formulaName) primaryFormulaNames.push(pricing.formulaName);
        if (index === 0 && primaryRestaurantId === restaurantId && pricing.promoName) primaryPromoNames.push(pricing.promoName);
      }


      discountCents = Math.round((formulaDiscountTotal + promoDiscountTotal + tokOneDiscountTotal + tokOneDeliveryDiscountTotal + pointsDiscountTotal + flexDiscountTotal) * 100);
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

    const urlSeparator = return_url.includes("?") ? "&" : "?";
    const userLookup = actor.userClient ? await actor.userClient.auth.getUser() : null;
    const userEmail = userLookup?.data.user?.email || undefined;

    const sessionParams: Stripe.Checkout.SessionCreateParams = {
      payment_method_types: effectiveKind === "tok-one" ? ["card"] : paymentMethodTypes,
      line_items: lineItems,
      mode: effectiveKind === "tok-one" ? "subscription" : "payment",
      success_url: `${return_url}${urlSeparator}session_id={CHECKOUT_SESSION_ID}&status=success`,
      cancel_url: `${return_url}${urlSeparator}status=cancelled`,
      customer_email: userEmail,
      client_reference_id: actor.userId || undefined,
      metadata: sessionMetadata,
    };

    if (effectiveKind === "tok-one") {
      sessionParams.subscription_data = {
        trial_period_days: 14,
        metadata: sessionMetadata,
      };
    }

    if (discountCents > 0) {
      const hasTokOneDiscount = toMoney(sessionMetadata.tok_one_discount_amount) > 0
        || toMoney(sessionMetadata.tok_one_delivery_saved) > 0;
      const couponName = hasTokOneDiscount
        ? "Avantage Tok One"
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

    // Tok encaisse 100% du paiement via Stripe.
    // Le restaurateur genere ensuite ses factures de reversement (90%) depuis son dashboard.

    const session = await stripe.checkout.sessions.create(sessionParams);
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
        payment_method: payment_method || "card",
        line_items: lineItems.length,
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
