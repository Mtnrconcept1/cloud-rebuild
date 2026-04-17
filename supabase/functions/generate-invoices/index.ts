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

Deno.serve(async (req) => {
  const corsHeaders = buildCorsHeaders(req);
  const preflight = handleCorsPreflight(req, corsHeaders);
  if (preflight) return preflight;

  let actor: Awaited<ReturnType<typeof authenticateRequest>> | null = null;

  try {
    actor = await authenticateRequest(req, { allowSchedulerSecret: true });
    requireRole(actor, ["admin"]);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const body = await req.json().catch(() => ({}));
    const month = body.month || null; // optional: "2026-02-01"

    const { data, error } = await supabase.rpc("generate_monthly_invoices", { p_month: month });

    if (error) throw error;

    await writeAuditLog({
      adminClient: actor.adminClient,
      actor,
      request: req,
      functionName: "generate-invoices",
      action: "generate_monthly_invoices",
      status: "success",
      targetEntityType: "restaurant_invoices",
      metadata: { month, generated: data },
    });

    return jsonResponse({ generated: data }, 200, corsHeaders);
  } catch (err) {
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
