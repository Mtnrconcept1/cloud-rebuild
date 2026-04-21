import Stripe from "npm:stripe@18.5.0";

import {
  HttpError,
  authenticateRequest,
  createAdminClient,
  getEnv,
  jsonResponse,
  writeAuditLog,
} from "../_shared/auth.ts";
import { finalizeChefsTableCheckout } from "../_shared/chefs-table.ts";
import { buildCorsHeaders, handleCorsPreflight } from "../_shared/cors.ts";
import { makeLogger } from "../_shared/logging.ts";
import { getStripePaymentMethodDetails } from "../_shared/order-checkout.ts";

Deno.serve(async (req) => {
  const corsHeaders = buildCorsHeaders(req);
  const preflight = handleCorsPreflight(req, corsHeaders);
  if (preflight) return preflight;

  const log = makeLogger("create-chefs-table-reservation");
  let actor: Awaited<ReturnType<typeof authenticateRequest>> | null = null;
  let sessionId = "";

  try {
    actor = await authenticateRequest(req, { allowServiceRole: false });
    if (!actor.userId) {
      throw new HttpError(401, "Unauthorized");
    }

    const body = await req.json().catch(() => ({}));
    sessionId = typeof body?.session_id === "string" ? body.session_id.trim() : "";
    if (!sessionId) {
      throw new HttpError(400, "session_id requis");
    }

    const stripeSecretKey = getEnv("STRIPE_SECRET_KEY");
    if (!stripeSecretKey) {
      throw new HttpError(503, "STRIPE_SECRET_KEY not configured");
    }

    const stripe = new Stripe(stripeSecretKey, {
      apiVersion: "2025-08-27.basil",
    });

    const session = await stripe.checkout.sessions.retrieve(sessionId, {
      expand: ["payment_intent.payment_method"],
    });

    if (!session || session.payment_status !== "paid") {
      throw new HttpError(400, "Session Stripe non payee.");
    }

    const checkoutKind = String(session.metadata?.checkout_kind || "");
    if (checkoutKind !== "chefs-table") {
      throw new HttpError(400, "Session Stripe invalide pour Chef's Table.");
    }

    if (String(session.metadata?.user_id || "") !== actor.userId) {
      throw new HttpError(403, "Forbidden");
    }

    const paymentDetails = await getStripePaymentMethodDetails(stripe, session, log);
    const result = await finalizeChefsTableCheckout({
      adminClient: actor.adminClient,
      session,
      userId: actor.userId,
      cardBrand: paymentDetails.cardBrand,
      cardLast4: paymentDetails.cardLast4,
      log,
      shouldDispatchNotifications: true,
      fetchLineItems: () => stripe.checkout.sessions.listLineItems(session.id, {
        limit: 100,
        expand: ["data.price.product"],
      }),
    });

    await writeAuditLog({
      adminClient: actor.adminClient,
      actor,
      request: req,
      functionName: "create-chefs-table-reservation",
      action: "finalize_chefs_table_checkout",
      status: "success",
      targetEntityType: "stripe_session",
      targetEntityId: session.id,
      metadata: {
        reservation_ids: result.reservations.map((reservation) => reservation.id),
      },
    });

    return jsonResponse(result, 200, corsHeaders);
  } catch (error) {
    log.error("create-chefs-table-reservation error", {
      message: error instanceof Error ? error.message : "unknown",
      sessionId,
    });

    await writeAuditLog({
      adminClient: actor?.adminClient || createAdminClient(),
      actor,
      request: req,
      functionName: "create-chefs-table-reservation",
      action: "finalize_chefs_table_checkout",
      status: "failure",
      targetEntityType: sessionId ? "stripe_session" : "reservations",
      targetEntityId: sessionId || null,
      errorMessage: error instanceof Error ? error.message : "Erreur interne",
    });

    if (error instanceof HttpError) {
      return jsonResponse({ error: error.message }, error.status, corsHeaders);
    }

    return jsonResponse(
      { error: error instanceof Error ? error.message : "Erreur interne" },
      500,
      corsHeaders,
    );
  }
});
