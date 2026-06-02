import Stripe from "npm:stripe@18.5.0";

import {
  HttpError,
  authenticateRequest,
  createAdminClient,
  getEnv,
  jsonResponse,
  requireRole,
  writeAuditLog,
} from "../_shared/auth.ts";
import { buildCorsHeaders, handleCorsPreflight } from "../_shared/cors.ts";
import { makeLogger } from "../_shared/logging.ts";
import {
  finalizePaidOrderCheckout,
  getStripePaymentMethodDetails,
  markOrderCheckoutSessionState,
} from "../_shared/order-checkout.ts";

type JsonRecord = Record<string, unknown>;

type CandidateOrder = {
  id: string;
  order_number: string | null;
  status: string | null;
  payment_status: string | null;
  metadata: JsonRecord | null;
  created_at: string | null;
};

function clampInteger(value: unknown, fallback: number, min: number, max: number) {
  const parsed = Math.floor(Number(value));
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

function readSessionId(order: CandidateOrder) {
  const metadata = order.metadata && typeof order.metadata === "object" && !Array.isArray(order.metadata)
    ? order.metadata
    : {};
  const value = String(metadata.stripe_session_id || metadata.checkout_session_id || "").trim();
  return value || null;
}

function normalizeCheckoutKind(session: Stripe.Checkout.Session) {
  return String(session.metadata?.checkout_kind || "order").trim().toLowerCase() || "order";
}

Deno.serve(async (req) => {
  const corsHeaders = buildCorsHeaders(req);
  const preflight = handleCorsPreflight(req, corsHeaders);
  if (preflight) return preflight;

  const log = makeLogger("reconcile-paid-order-checkouts");
  let actor: Awaited<ReturnType<typeof authenticateRequest>> | null = null;
  let payload: JsonRecord = {};

  try {
    actor = await authenticateRequest(req, {
      allowServiceRole: true,
      allowSchedulerSecret: true,
    });
    requireRole(actor, ["admin"]);

    payload = await req.json().catch(() => ({}));
    const limit = clampInteger(payload.limit, 50, 1, 200);
    const hours = clampInteger(payload.hours, 72, 1, 720);
    const dryRun = payload.dry_run === true;
    const since = new Date(Date.now() - (hours * 60 * 60 * 1000)).toISOString();

    const stripeSecretKey = getEnv("STRIPE_SECRET_KEY");
    if (!stripeSecretKey) {
      throw new HttpError(503, "STRIPE_SECRET_KEY not configured");
    }

    const stripe = new Stripe(stripeSecretKey, {
      apiVersion: "2025-08-27.basil",
    });

    const { data: rows, error } = await actor.adminClient
      .from("orders")
      .select("id, order_number, status, payment_status, metadata, created_at")
      .or("status.eq.pending_payment,payment_status.eq.pending,payment_status.eq.pending_payment,payment_status.eq.requires_payment")
      .filter("metadata->>stripe_session_id", "not.is", "null")
      .gte("created_at", since)
      .order("created_at", { ascending: true })
      .limit(limit * 3);

    if (error) throw error;

    const sessionIds = new Set<string>();
    const sessions = (rows || [])
      .map((row: CandidateOrder) => readSessionId(row))
      .filter((sessionId): sessionId is string => Boolean(sessionId))
      .filter((sessionId) => {
        if (sessionIds.has(sessionId)) return false;
        sessionIds.add(sessionId);
        return true;
      })
      .slice(0, limit);

    let finalized = 0;
    let expired = 0;
    let skipped = 0;
    let failed = 0;
    const details: Array<Record<string, unknown>> = [];

    for (const sessionId of sessions) {
      try {
        const session = await stripe.checkout.sessions.retrieve(sessionId, {
          expand: ["payment_intent.payment_method"],
        });
        const checkoutKind = normalizeCheckoutKind(session);

        if (checkoutKind !== "order") {
          skipped += 1;
          details.push({ session_id: sessionId, status: "skipped", reason: `checkout_kind:${checkoutKind}` });
          continue;
        }

        if (session.payment_status === "paid") {
          if (dryRun) {
            skipped += 1;
            details.push({ session_id: sessionId, status: "would_finalize" });
            continue;
          }

          const paymentDetails = await getStripePaymentMethodDetails(stripe, session, log);
          const result = await finalizePaidOrderCheckout({
            adminClient: actor.adminClient,
            session,
            cardBrand: paymentDetails.cardBrand,
            cardLast4: paymentDetails.cardLast4,
            billingPhone: paymentDetails.billingPhone,
            log,
            shouldDispatchNotifications: true,
          });

          if (result.orders.length > 0) {
            finalized += result.orders.length;
            details.push({
              session_id: sessionId,
              status: "finalized",
              order_ids: result.orders.map((order) => order.id),
              newly_finalized: result.newlyFinalized,
            });
          } else {
            skipped += 1;
            details.push({ session_id: sessionId, status: "skipped", reason: "no_matching_orders" });
          }
          continue;
        }

        if (session.status === "expired") {
          if (!dryRun) {
            const orderIds = await markOrderCheckoutSessionState({
              adminClient: actor.adminClient,
              session,
              orderStatus: "payment_failed",
              paymentStatus: "failed",
              checkoutState: "expired",
              failureCode: "checkout_session_expired",
              failureMessage: "Session Stripe expiree pendant reconciliation.",
            });
            expired += orderIds.length;
            details.push({ session_id: sessionId, status: "expired", order_ids: orderIds });
          } else {
            expired += 1;
            details.push({ session_id: sessionId, status: "would_mark_expired" });
          }
          continue;
        }

        skipped += 1;
        details.push({
          session_id: sessionId,
          status: "skipped",
          payment_status: session.payment_status,
          stripe_status: session.status,
        });
      } catch (error) {
        failed += 1;
        details.push({
          session_id: sessionId,
          status: "error",
          error: error instanceof Error ? error.message : "unknown",
        });
      }
    }

    await writeAuditLog({
      adminClient: actor.adminClient,
      actor,
      request: req,
      functionName: "reconcile-paid-order-checkouts",
      action: dryRun ? "reconcile_paid_order_checkouts_dry_run" : "reconcile_paid_order_checkouts",
      status: failed > 0 ? "failure" : "success",
      targetEntityType: "orders",
      metadata: {
        checked: sessions.length,
        finalized,
        expired,
        skipped,
        failed,
        limit,
        hours,
        dry_run: dryRun,
        details: details.slice(0, 50),
      },
      errorMessage: failed > 0 ? `${failed} session(s) en echec pendant reconciliation.` : null,
    });

    return jsonResponse({
      ok: failed === 0,
      checked: sessions.length,
      finalized,
      expired,
      skipped,
      failed,
      details,
    }, failed > 0 ? 207 : 200, corsHeaders);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erreur reconciliation commandes payees";
    log.error("reconcile-paid-order-checkouts error", { message });

    await writeAuditLog({
      adminClient: actor?.adminClient || createAdminClient(),
      actor,
      request: req,
      functionName: "reconcile-paid-order-checkouts",
      action: "reconcile_paid_order_checkouts",
      status: "failure",
      targetEntityType: "orders",
      errorMessage: message,
      metadata: payload,
    });

    if (error instanceof HttpError) {
      return jsonResponse({ error: error.message }, error.status, corsHeaders);
    }

    return jsonResponse({ error: message }, 500, corsHeaders);
  }
});
