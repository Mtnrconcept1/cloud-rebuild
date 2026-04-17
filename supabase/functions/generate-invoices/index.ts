import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  HttpError,
  authenticateRequest,
  createAdminClient,
  jsonResponse,
  requireRole,
  writeAuditLog,
} from "../_shared/auth.ts";
import { buildCorsHeaders, handleCorsPreflight } from "../_shared/cors.ts";
import { makeLogger } from "../_shared/logging.ts";

Deno.serve(async (req) => {
  const corsHeaders = buildCorsHeaders(req);
  const preflight = handleCorsPreflight(req, corsHeaders);
  if (preflight) return preflight;

  const log = makeLogger("generate-invoices");

  let actor: Awaited<ReturnType<typeof authenticateRequest>> | null = null;

  try {
    actor = await authenticateRequest(req, { allowSchedulerSecret: true });
    // On autorise "admin" ou "restaurant_owner"
    requireRole(actor, ["admin", "restaurant_owner"]);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const body = await req.json().catch(() => ({}));
    const month = body.month || null; // optional: "2026-02-01"
    const restaurantId = body.restaurant_id || null;

    if (actor.role === "restaurant_owner" && !restaurantId) {
      throw new HttpError(400, "restaurant_id required for restaurant owners");
    }

    let resultData;
    let rpcMethod = "";

    if (restaurantId) {
      rpcMethod = "generate_restaurant_payout_invoice";
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
    log.error("generate-invoices error", { message: err instanceof Error ? err.message : "unknown" });
    await writeAuditLog({
      adminClient: actor?.adminClient || createAdminClient(),
      actor,
      request: req,
      functionName: "generate-invoices",
      action: "generate_monthly_invoices",
      status: "failure",
      targetEntityType: "restaurant_invoices",
      errorMessage: err instanceof Error ? err.message : "Erreur interne",
    });
    if (err instanceof HttpError) {
      return jsonResponse({ error: err.message }, err.status, corsHeaders);
    }
    const message = err instanceof Error ? err.message : "Erreur interne";
    return jsonResponse({ error: message }, 500, corsHeaders);
  }
});
