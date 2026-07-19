import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

import {
  HttpError,
  authenticateRequest,
  jsonResponse,
  writeAuditLog,
} from "../_shared/auth.ts";
import {
  buildCorsHeaders,
  handleCorsPreflight,
  isRequestOriginAllowed,
} from "../_shared/cors.ts";

const FUNCTION_NAME = "provision-commercial-demo-project-session";
const PRODUCTION_PROJECT_URL = "https://wwcrtyoueexyxkkikaos.supabase.co";
const DEMO_PROJECT_REF = "hzldfhjfgjcadmpghhhf";
const DEMO_PROJECT_URL = `https://${DEMO_PROJECT_REF}.supabase.co`;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function requireProductionRuntime() {
  if ((Deno.env.get("SUPABASE_URL") || "").trim() !== PRODUCTION_PROJECT_URL) {
    throw new HttpError(403, "This provisioning endpoint is production-only");
  }
}

function getDemoAdminClient() {
  const url = (Deno.env.get("DEMO_SUPABASE_URL") || "").trim();
  const secretKey = (Deno.env.get("DEMO_SUPABASE_SECRET_KEY") || "").trim();
  const projectRef = (Deno.env.get("DEMO_SUPABASE_PROJECT_REF") || "").trim();

  if (url !== DEMO_PROJECT_URL || projectRef !== DEMO_PROJECT_REF || !secretKey) {
    throw new HttpError(503, "Dedicated commercial demo project is not configured");
  }

  return createClient(url, secretKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

Deno.serve(async (req) => {
  const corsHeaders = buildCorsHeaders(req);
  const preflight = handleCorsPreflight(req, corsHeaders);
  if (preflight) return preflight;

  let actor: Awaited<ReturnType<typeof authenticateRequest>> | null = null;
  try {
    if (req.method !== "POST") throw new HttpError(405, "Method not allowed");
    if (!isRequestOriginAllowed(req)) throw new HttpError(403, "Origin not allowed");
    requireProductionRuntime();

    actor = await authenticateRequest(req);
    const canPresentDemo = Boolean(
      actor.userId
      && (actor.isAdmin || actor.roles.includes("commercial")),
    );
    if (!canPresentDemo || !UUID_PATTERN.test(actor.userId || "")) {
      throw new HttpError(403, "An active commercial or administrator account is required");
    }

    const body = await req.json().catch(() => ({}));
    if (body?.requested_project_ref !== DEMO_PROJECT_REF) {
      throw new HttpError(400, "Invalid demo project");
    }

    const userId = actor.userId as string;
    const syntheticEmail = `commercial-${userId}@demo.thetok.invalid`;
    const demo = getDemoAdminClient();

    const { data: existingUser, error: lookupError } =
      await demo.auth.admin.getUserById(userId);
    if (lookupError && !/not found/i.test(lookupError.message || "")) {
      throw new HttpError(502, "Unable to verify demo identity");
    }

    if (existingUser?.user) {
      const { error } = await demo.auth.admin.updateUserById(userId, {
        email: syntheticEmail,
        email_confirm: true,
        app_metadata: {
          ...(existingUser.user.app_metadata || {}),
          account_type: "commercial_demo",
          source_project_ref: "wwcrtyoueexyxkkikaos",
        },
        user_metadata: { display_name: "Commercial Démo TOK" },
      });
      if (error) throw new HttpError(502, "Unable to refresh demo identity");
    } else {
      const { error } = await demo.auth.admin.createUser({
        id: userId,
        email: syntheticEmail,
        email_confirm: true,
        app_metadata: {
          account_type: "commercial_demo",
          source_project_ref: "wwcrtyoueexyxkkikaos",
        },
        user_metadata: { display_name: "Commercial Démo TOK" },
      });
      if (error) throw new HttpError(502, "Unable to create demo identity");
    }

    const { data: restaurant, error: restaurantError } = await demo
      .from("restaurants")
      .select("id")
      .eq("is_demo", true)
      .eq("is_active", true)
      .eq("status", "demo")
      .is("stripe_account_id", null)
      .eq("stripe_connect_details_submitted", false)
      .eq("stripe_connect_charges_enabled", false)
      .eq("stripe_connect_payouts_enabled", false)
      .limit(1)
      .maybeSingle();
    if (restaurantError || !restaurant?.id) {
      throw new HttpError(503, "Shared demo restaurant is unavailable");
    }

    const results = await Promise.all([
      demo.from("profiles").upsert(
        { user_id: userId, full_name: "Commercial Démo TOK" },
        { onConflict: "user_id" },
      ),
      demo.from("user_roles").upsert(
        ["client", "restaurateur", "courier", "commercial", "admin"].map((role) => ({
          user_id: userId,
          role,
        })),
        { onConflict: "user_id,role" },
      ),
      demo.from("commercial_demo_accounts").upsert(
        {
          user_id: userId,
          demo_restaurant_id: restaurant.id,
          is_active: true,
          template_version: 1,
          created_by: userId,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id" },
      ),
    ]);
    if (results.some((result) => result.error)) {
      throw new HttpError(502, "Unable to affiliate commercial account to demo restaurant");
    }

    const { data: link, error: linkError } = await demo.auth.admin.generateLink({
      type: "magiclink",
      email: syntheticEmail,
      options: {
        redirectTo: "https://commercial.thetok.ch/commercial/demo-live",
      },
    });
    const tokenHash = link?.properties?.hashed_token || "";
    if (linkError || tokenHash.length < 20) {
      throw new HttpError(502, "Unable to issue demo session");
    }

    await writeAuditLog({
      adminClient: actor.adminClient,
      functionName: FUNCTION_NAME,
      status: "success",
      action: "provision_demo_session",
      actor,
      request: req,
      targetEntityType: "commercial_demo_project",
      targetEntityId: restaurant.id,
      metadata: { demo_project_ref: DEMO_PROJECT_REF },
    });

    return jsonResponse({
      project_ref: DEMO_PROJECT_REF,
      user_id: userId,
      token_hash: tokenHash,
      verification_type: "magiclink",
    }, 200, {
      ...corsHeaders,
      "Cache-Control": "no-store",
    });
  } catch (error) {
    const status = error instanceof HttpError ? error.status : 500;
    const message = error instanceof Error ? error.message : "Unexpected error";

    if (actor) {
      await writeAuditLog({
        adminClient: actor.adminClient,
        functionName: FUNCTION_NAME,
        status: "failure",
        action: "provision_demo_session",
        actor,
        request: req,
        errorMessage: message,
      });
    }

    return jsonResponse({ error: message }, status, {
      ...corsHeaders,
      "Cache-Control": "no-store",
    });
  }
});
