import { HttpError, authenticateRequest, getEnv, jsonResponse, writeAuditLog } from "../_shared/auth.ts";
import { buildCorsHeaders, handleCorsPreflight } from "../_shared/cors.ts";
import { normalizeCheckoutReturnUrl } from "../_shared/return-url.ts";
import { getStripeRuntimeForCheckoutKind } from "../_shared/stripe-client.ts";

const cents = (value: unknown) => Math.max(50, Math.round(Math.max(0, Number(value) || 0) * 100));

Deno.serve(async (req) => {
  const corsHeaders = buildCorsHeaders(req);
  const preflight = handleCorsPreflight(req, corsHeaders);
  if (preflight) return preflight;

  let actor: Awaited<ReturnType<typeof authenticateRequest>> | null = null;
  let targetId = "";

  try {
    actor = await authenticateRequest(req);
    const { group_member_order_id, return_url } = await req.json();
    if (!actor.userId) throw new HttpError(401, "Connexion requise");
    if (!group_member_order_id) throw new HttpError(400, "group_member_order_id requis");

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

    const items = Array.isArray(order.items) ? order.items : [];
    const { stripe } = getStripeRuntimeForCheckoutKind("match-group");
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      payment_method_types: ["card"],
      line_items: items.length > 0 ? items.map((item) => ({
        price_data: {
          currency: "chf",
          product_data: { name: String(item.name || "Article Match groupe") },
          unit_amount: cents(item.original_price),
        },
        quantity: Math.max(1, Number(item.quantity || 1)),
      })) : [{ price_data: { currency: "chf", product_data: { name: "Autorisation Match groupe" }, unit_amount: cents(order.subtotal) }, quantity: 1 }],
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
        stripe_checkout_session_id: session.id,
        authorization_amount: Number(order.subtotal || 0),
        payment_status: "pending",
        metadata: { ...(order.metadata || {}), checkout_kind: "match-group" },
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
      metadata: { group_id: order.group_id, session_id: session.id },
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
