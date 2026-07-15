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

    const { stripe } = getStripeRuntimeForCheckoutKind("match-group");
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
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
        metadata: {
          checkout_kind: "match-group",
          group_id: order.group_id,
          group_member_order_id: order.id,
          user_id: actor.userId,
          restaurant_id: order.restaurant_id,
        },
      },
      metadata: {
        checkout_kind: "match-group",
        group_id: order.group_id,
        group_member_order_id: order.id,
        user_id: actor.userId,
        restaurant_id: order.restaurant_id,
      },
    });

    await actor.adminClient
      .from("group_member_orders")
      .update({
        items: canonicalItems,
        subtotal: canonicalSubtotal,
        stripe_checkout_session_id: session.id,
        authorization_amount: canonicalSubtotal,
        payment_status: "pending",
        metadata: {
          ...(order.metadata || {}),
          checkout_kind: "match-group",
          canonical_pricing_at: new Date().toISOString(),
        },
      })
      .eq("id", order.id);

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

