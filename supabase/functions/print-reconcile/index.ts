import {
  HttpError,
  authenticateRequest,
  createAdminClient,
  jsonResponse,
  requireRole,
  writeAuditLog,
} from "../_shared/auth.ts";
import { buildCorsHeaders, handleCorsPreflight } from "../_shared/cors.ts";
import { getPrintProvider } from "../_shared/print/cloudprinter.ts";

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function normalizeCoreState(value: string | null) {
  const code = Number(value);
  if (code === 500) return "canceled";
  if (code === 100) return "shipped";
  if (code === 501) return "produced";
  if ([7, 11, 31, 35, 39, 41].includes(code)) return "production_error";
  if (code >= 10 && code <= 45) return "producing";
  if (code === 6) return "validated";
  if (code === 1 || code === 5) return "submitted";
  return null;
}

Deno.serve(async (req) => {
  const cors = buildCorsHeaders(req);
  const preflight = handleCorsPreflight(req, cors);
  if (preflight) return preflight;
  let actor: Awaited<ReturnType<typeof authenticateRequest>> | null = null;
  const adminClient = createAdminClient();

  try {
    if (req.method !== "POST") throw new HttpError(405, "Method not allowed");
    actor = await authenticateRequest(req, { allowServiceRole: true, allowSchedulerSecret: true });
    if (actor.authMode === "user_jwt") requireRole(actor, ["admin"]);
    const body = asRecord(await req.json().catch(() => ({})));
    const limit = Math.max(1, Math.min(50, Math.round(Number(body.limit || 20))));
    const staleBefore = new Date(Date.now() - 10 * 60 * 1000).toISOString();

    const { data: orders, error } = await adminClient
      .from("print_orders")
      .select("id, status, provider_reference")
      .eq("provider", "cloudprinter")
      .not("provider_reference", "is", null)
      .in("status", ["submitted", "validated", "producing", "produced", "packed", "shipped", "production_error", "delivery_failed", "cancellation_requested"])
      .lt("updated_at", staleBefore)
      .order("updated_at", { ascending: true })
      .limit(limit);
    if (error) throw error;

    const provider = getPrintProvider();
    const results: Array<Record<string, unknown>> = [];
    for (const order of orders || []) {
      try {
        const info = await provider.getOrder(order.provider_reference);
        if (!info) {
          results.push({ orderId: order.id, status: "not_found" });
          continue;
        }
        const state = normalizeCoreState(info.stateCode || info.state);
        const tracking = info.items.find((item) => item.tracking)?.tracking || null;
        if (state) {
          const { error: advanceError } = await adminClient.rpc("advance_print_order_state", {
            p_order_id: order.id,
            p_state: state,
            p_provider_state: info.stateCode || info.state,
            p_tracking_code: tracking,
            p_tracking_url: null,
            p_carrier: null,
            p_provider_event_id: null,
            p_message: "État fournisseur réconcilié",
            p_metadata: { reconciliation: true },
          });
          if (advanceError) throw advanceError;
        } else {
          await adminClient.from("print_orders").update({
            provider_state: info.stateCode || info.state,
            updated_at: new Date().toISOString(),
          }).eq("id", order.id);
        }
        results.push({ orderId: order.id, status: state || "provider_state_only" });
      } catch (reconcileError) {
        results.push({
          orderId: order.id,
          status: "error",
          error: reconcileError instanceof Error ? reconcileError.message.slice(0, 200) : "reconciliation_error",
        });
      }
    }

    await writeAuditLog({
      adminClient,
      actor,
      request: req,
      functionName: "print-reconcile",
      action: "reconcile",
      status: "success",
      targetEntityType: "print_orders",
      metadata: { limit, processed: results.length, failures: results.filter((row) => row.status === "error").length },
    });
    return jsonResponse({ ok: true, results }, 200, cors);
  } catch (error) {
    const status = error instanceof HttpError ? error.status : 500;
    const message = error instanceof Error ? error.message.replace(/[\r\n]+/g, " ").slice(0, 500) : "Erreur réconciliation impression";
    await writeAuditLog({
      adminClient,
      actor,
      request: req,
      functionName: "print-reconcile",
      action: "reconcile",
      status: "failure",
      targetEntityType: "print_orders",
      errorMessage: message,
    });
    return jsonResponse({ error: status >= 500 ? "Erreur interne réconciliation impression" : message }, status, cors);
  }
});
