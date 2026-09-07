import {
  HttpError,
  assertProductionFlowAllowed,
  authenticateRequest,
  createAdminClient,
  jsonResponse,
  requireRestaurantAccess,
  requireRole,
  writeAuditLog,
} from "../_shared/auth.ts";
import { buildCorsHeaders, handleCorsPreflight } from "../_shared/cors.ts";
import { getPrintProvider } from "../_shared/print/cloudprinter.ts";

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function requireString(value: unknown, field: string) {
  const normalized = String(value || "").trim();
  if (!normalized) throw new HttpError(400, `${field} requis`);
  return normalized;
}

async function reconcileOwnedFinalizedPayments(adminClient: any, restaurantId: string) {
  const { data: orders, error } = await adminClient
    .from("print_orders")
    .select("id, payment_attempt_id")
    .eq("restaurant_id", restaurantId)
    .eq("payment_status", "pending")
    .not("payment_attempt_id", "is", null)
    .limit(25);
  if (error) throw error;
  const attemptIds = (orders || []).map((row: any) => row.payment_attempt_id).filter(Boolean);
  if (!attemptIds.length) return;
  const { data: attempts, error: attemptError } = await adminClient
    .from("payment_attempts")
    .select("id, kind, state")
    .in("id", attemptIds);
  if (attemptError) throw attemptError;
  const finalized = new Set((attempts || [])
    .filter((row: any) => row.kind === "marketing_print_order" && row.state === "finalized")
    .map((row: any) => row.id));
  for (const order of orders || []) {
    if (!finalized.has(order.payment_attempt_id)) continue;
    const { error: finalizeError } = await adminClient.rpc("finalize_paid_print_order", {
      p_order_id: order.id,
      p_payment_attempt_id: order.payment_attempt_id,
      p_stripe_event_id: null,
    });
    if (finalizeError) throw finalizeError;
  }
}

async function previewUrl(adminClient: any, orderId: string) {
  const { data: order } = await adminClient.from("print_orders").select("print_export_id").eq("id", orderId).maybeSingle();
  if (!order) return null;
  const { data: exportRow } = await adminClient.from("print_exports").select("production_storage_path").eq("id", order.print_export_id).maybeSingle();
  if (!exportRow?.production_storage_path) return null;
  const { data } = await adminClient.storage.from("print-production-files").createSignedUrl(exportRow.production_storage_path, 600);
  return data?.signedUrl || null;
}

Deno.serve(async (req) => {
  const cors = buildCorsHeaders(req);
  const preflight = handleCorsPreflight(req, cors);
  if (preflight) return preflight;
  let actor: Awaited<ReturnType<typeof authenticateRequest>> | null = null;
  const adminClient = createAdminClient();

  try {
    if (req.method !== "POST") throw new HttpError(405, "Method not allowed");
    actor = await authenticateRequest(req);
    requireRole(actor, ["restaurateur", "admin"]);
    const body = asRecord(await req.json().catch(() => ({})));
    const action = String(body.action || "list").trim().toLowerCase();
    const restaurantId = requireString(body.restaurantId, "restaurantId");
    await requireRestaurantAccess(actor, restaurantId);
    await reconcileOwnedFinalizedPayments(adminClient, restaurantId);

    if (action === "list") {
      const page = Math.max(1, Math.round(Number(body.page || 1)));
      const pageSize = Math.max(1, Math.min(50, Math.round(Number(body.pageSize || 12))));
      const from = (page - 1) * pageSize;
      const to = from + pageSize;
      const { data, error } = await adminClient
        .from("print_orders")
        .select("id, status, payment_status, customer_currency, customer_amount_cents, quantity, provider_reference, tracking_code, tracking_url, carrier, created_at, updated_at")
        .eq("restaurant_id", restaurantId)
        .order("created_at", { ascending: false })
        .range(from, to);
      if (error) throw error;
      const rows = data || [];
      return jsonResponse({
        orders: rows.slice(0, pageSize),
        pagination: { page, pageSize, hasMore: rows.length > pageSize },
      }, 200, cors);
    }

    const orderId = requireString(body.orderId, "orderId");
    const { data: order, error: orderError } = await adminClient
      .from("print_orders")
      .select("id, restaurant_id, status, payment_status, customer_currency, customer_amount_cents, quantity, provider_reference, tracking_code, tracking_url, carrier, created_at, updated_at")
      .eq("id", orderId)
      .eq("restaurant_id", restaurantId)
      .maybeSingle();
    if (orderError) throw orderError;
    if (!order) throw new HttpError(404, "Commande impression introuvable");

    if (action === "get") {
      const { data: events, error: eventError } = await adminClient
        .from("print_order_events")
        .select("id, event_type, state, message, metadata, created_at")
        .eq("print_order_id", orderId)
        .eq("restaurant_id", restaurantId)
        .order("created_at", { ascending: true })
        .limit(200);
      if (eventError) throw eventError;
      return jsonResponse({ order, events: events || [], previewUrl: await previewUrl(adminClient, orderId) }, 200, cors);
    }

    if (action === "cancel") {
      await assertProductionFlowAllowed(actor, "annulation impression");
      if (order.payment_status !== "paid") throw new HttpError(409, "Aucune commande fournisseur payée à annuler");
      if (!order.provider_reference) throw new HttpError(409, "Commande fournisseur pas encore soumise");
      if (["shipped", "delivered", "canceled", "refunded"].includes(order.status)) {
        throw new HttpError(409, "Cette commande ne peut plus être annulée");
      }
      const provider = getPrintProvider();
      const result = await provider.cancelOrder(order.provider_reference);
      if (!result.accepted) throw new HttpError(409, "Cloudprinter n’a pas accepté la demande d’annulation");
      const { error: advanceError } = await adminClient.rpc("advance_print_order_state", {
        p_order_id: order.id,
        p_state: "cancellation_requested",
        p_provider_state: "cancel_requested",
        p_tracking_code: null,
        p_tracking_url: null,
        p_carrier: null,
        p_provider_event_id: null,
        p_message: "Annulation demandée au fournisseur",
        p_metadata: {},
      });
      if (advanceError) throw advanceError;
      return jsonResponse({ ok: true, status: "cancellation_requested" }, 200, cors);
    }

    if (action === "reorder") {
      const reason = requireString(body.reason, "reason").slice(0, 120);
      const description = String(body.description || "").trim().slice(0, 1000);
      // A restaurant request is intentionally an intake only. Actual
      // provider.reorder is an admin/SAV action because it can create cost.
      const { error: eventError } = await adminClient.from("print_order_events").insert({
        print_order_id: order.id,
        restaurant_id: restaurantId,
        event_type: "reorder_requested",
        state: order.status,
        actor_user_id: actor.userId,
        provider: "cloudprinter",
        message: description || reason,
        metadata: { reason },
      });
      if (eventError) throw eventError;
      await writeAuditLog({
        adminClient,
        actor,
        request: req,
        functionName: "print-order-action",
        action: "reorder_request",
        status: "success",
        targetEntityType: "print_orders",
        targetEntityId: order.id,
        metadata: { restaurant_id: restaurantId, reason },
      });
      return jsonResponse({ ok: true, status: "pending_review" }, 202, cors);
    }

    throw new HttpError(400, "Action commande impression invalide");
  } catch (error) {
    const status = error instanceof HttpError ? error.status : 500;
    const message = error instanceof Error ? error.message.replace(/[\r\n]+/g, " ").slice(0, 500) : "Erreur commande impression";
    await writeAuditLog({
      adminClient,
      actor,
      request: req,
      functionName: "print-order-action",
      action: "order_action",
      status: "failure",
      targetEntityType: "print_orders",
      errorMessage: message,
    });
    return jsonResponse({ error: status >= 500 ? "Erreur interne commande impression" : message }, status, cors);
  }
});
