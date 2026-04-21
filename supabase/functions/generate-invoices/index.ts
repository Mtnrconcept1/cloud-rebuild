import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  HttpError,
  authenticateRequest,
  createAdminClient,
  jsonResponse,
  requireRestaurantAccess,
  requireRole,
  writeAuditLog,
} from "../_shared/auth.ts";
import { buildCorsHeaders, handleCorsPreflight } from "../_shared/cors.ts";
import { makeLogger } from "../_shared/logging.ts";

function formatErrorMessage(error: unknown) {
  if (!error || typeof error !== "object") {
    return error instanceof Error ? error.message : "Erreur interne";
  }

  const message = "message" in error ? String(error.message || "") : "";
  const code = "code" in error ? String(error.code || "") : "";
  const hint = "hint" in error ? String(error.hint || "") : "";

  return [message, code && `code=${code}`, hint && `hint=${hint}`]
    .filter(Boolean)
    .join(" | ");
}

Deno.serve(async (req) => {
  const corsHeaders = buildCorsHeaders(req);
  const preflight = handleCorsPreflight(req, corsHeaders);
  if (preflight) return preflight;

  const log = makeLogger("generate-invoices");

  let actor: Awaited<ReturnType<typeof authenticateRequest>> | null = null;
  let rpcMethod = "";

  try {
    actor = await authenticateRequest(req, { allowSchedulerSecret: true });
    // The dashboard uses the "restaurateur" role in production. Keep
    // "restaurant_owner" as a compatibility alias for any legacy accounts.
    requireRole(actor, ["admin", "restaurateur", "restaurant_owner"]);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const body = await req.json().catch(() => ({}));
    const month = body.month || null; // optional: "2026-02-01"
    const restaurantId = body.restaurant_id || null;
    const isRestaurantActor = actor.roles.some((role) =>
      role === "restaurateur" || role === "restaurant_owner"
    );

    if (isRestaurantActor && !restaurantId) {
      throw new HttpError(400, "restaurant_id required for restaurant owners");
    }

    let resultData;

    if (restaurantId) {
      if (isRestaurantActor) {
        await requireRestaurantAccess(actor, restaurantId);
      }

      // Call a non-overloaded RPC wrapper. PostgREST rejects overloaded
      // functions with the same argument names (PGRST203).
      rpcMethod = "generate_restaurant_payout_invoice_rpc";
      const { data, error } = await supabase.rpc(rpcMethod, { 
        p_restaurant_id: restaurantId,
        p_month: month 
      });
      if (error) throw error;
      resultData = data;
    } else {
      rpcMethod = "generate_monthly_invoices";
      const { data, error } = await supabase.rpc(rpcMethod, { p_month: month });
      if (error) throw error;
      resultData = data;
    }

    await writeAuditLog({
      adminClient: actor.adminClient,
      actor,
      request: req,
      functionName: "generate-invoices",
      action: rpcMethod,
      status: "success",
      targetEntityType: "restaurant_invoices",
      metadata: { month, restaurantId, generated: resultData },
    });

    return jsonResponse({ generated: resultData }, 200, corsHeaders);
  } catch (err) {
    const errorMessage = formatErrorMessage(err);
    log.error("generate-invoices error", { message: errorMessage });
    await writeAuditLog({
      adminClient: actor?.adminClient || createAdminClient(),
      actor,
      request: req,
      functionName: "generate-invoices",
      action: rpcMethod || "generate_monthly_invoices",
      status: "failure",
      targetEntityType: "restaurant_invoices",
      errorMessage,
    });
    if (err instanceof HttpError) {
      return jsonResponse({ error: err.message }, err.status, corsHeaders);
    }
    return jsonResponse({ error: errorMessage || "Erreur interne" }, 500, corsHeaders);
  }
});
