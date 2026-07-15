import Stripe from "npm:stripe@18.5.0";

import {
  HttpError,
  authenticateRequest,
  assertProductionFlowAllowed,
  createAdminClient,
  jsonResponse,
  requireRestaurantAccess,
  writeAuditLog,
} from "../_shared/auth.ts";
import { buildCorsHeaders, handleCorsPreflight } from "../_shared/cors.ts";
import { makeLogger } from "../_shared/logging.ts";
import {
  getRemainingRefundAmount,
  getStripeRefundReason,
  normalizeRefundTargetType,
  pickFirstNonEmptyString,
  toMoney,
  type RefundTargetType,
} from "./refund-utils.ts";
import { getStripeRuntimeForCheckoutKind } from "../_shared/stripe-client.ts";

type RefundableEntity = {
  targetType: RefundTargetType;
  id: string;
  restaurantId: string;
  userId: string | null;
  status: string | null;
  cancelledBy: string | null;
  refundStatus: string | null;
  refundReason: string | null;
  totalAmount: number;
  refundedAmount: number;
  paymentStatus: string | null;
  paymentMethod: string | null;
  paymentIntentId: string | null;
  reference: string | null;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalize(value: unknown) {
  return String(value || "").trim().toLowerCase();
}

function isPaidOrder(paymentStatus: unknown) {
  const normalized = normalize(paymentStatus);
  return normalized === "paid" || normalized === "captured";
}

const FINAL_ORDER_STATUSES = ["delivered", "picked_up", "completed"] as const;
const FINAL_RESERVATION_STATUSES = ["completed", "served", "no_show"] as const;
const ADMIN_REFUND_REASON_MIN_LENGTH = 12;

async function hasFinalServiceEvidence(
  adminClient: ReturnType<typeof createAdminClient>,
  entity: RefundableEntity,
) {
  if (entity.targetType === "order") {
    const { data, error } = await adminClient
      .from("order_status_history")
      .select("id")
      .eq("order_id", entity.id)
      .in("status", FINAL_ORDER_STATUSES as unknown as string[])
      .limit(1)
      .maybeSingle();

    if (error) throw new HttpError(500, error.message);
    return Boolean(data);
  }

  const { data, error } = await adminClient
    .from("reservation_status_history")
    .select("id")
    .eq("reservation_id", entity.id)
    .in("status", FINAL_RESERVATION_STATUSES as unknown as string[])
    .limit(1)
    .maybeSingle();

  if (error) throw new HttpError(500, error.message);
  return Boolean(data);
}

async function lookupOrder(adminClient: ReturnType<typeof createAdminClient>, orderId: string) {
  const { data, error } = await adminClient
    .from("orders")
    .select("id, restaurant_id, user_id, status, cancelled_by, refund_status, refund_reason, total_amount, refunded_amount_chf, payment_status, metadata, order_number")
    .eq("id", orderId)
    .maybeSingle();

  if (error) throw new HttpError(500, error.message);
  if (!data) throw new HttpError(404, "Commande introuvable.");

  const metadata = isRecord(data.metadata) ? data.metadata : {};
  const paymentIntentId = pickFirstNonEmptyString(
    metadata.stripe_payment_intent,
  );

  let resolvedPaymentIntentId = paymentIntentId;
  if (!resolvedPaymentIntentId) {
    const { data: chargeTx, error: txError } = await adminClient
      .from("payment_transactions")
      .select("stripe_payment_intent_id")
      .eq("order_id", orderId)
      .eq("type", "charge")
      .eq("status", "succeeded")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (txError) throw new HttpError(500, txError.message);
    resolvedPaymentIntentId = pickFirstNonEmptyString(chargeTx?.stripe_payment_intent_id);
  }

  return {
    targetType: "order" as const,
    id: data.id,
    restaurantId: data.restaurant_id,
    userId: data.user_id,
    status: data.status,
    cancelledBy: (data as Record<string, unknown>).cancelled_by as string | null,
    refundStatus: (data as Record<string, unknown>).refund_status as string | null,
    refundReason: (data as Record<string, unknown>).refund_reason as string | null,
    totalAmount: toMoney(data.total_amount),
    refundedAmount: toMoney((data as Record<string, unknown>).refunded_amount_chf),
    paymentStatus: data.payment_status,
    paymentMethod: pickFirstNonEmptyString(metadata.payment_method, metadata.payment_method_label),
    paymentIntentId: resolvedPaymentIntentId,
    reference: data.order_number,
  } satisfies RefundableEntity;
}

async function lookupReservation(adminClient: ReturnType<typeof createAdminClient>, reservationId: string) {
  const { data, error } = await adminClient
    .from("reservations")
    .select("id, restaurant_id, user_id, status, cancelled_by, refund_status, refund_reason, total_amount, refunded_amount_chf, payment_method, metadata, order_reference")
    .eq("id", reservationId)
    .maybeSingle();

  if (error) throw new HttpError(500, error.message);
  if (!data) throw new HttpError(404, "Reservation introuvable.");

  const metadata = isRecord(data.metadata) ? data.metadata : {};
  const paymentIntentId = pickFirstNonEmptyString(metadata.stripe_payment_intent);

  let resolvedPaymentIntentId = paymentIntentId;
  if (!resolvedPaymentIntentId) {
    const { data: chargeTx, error: txError } = await adminClient
      .from("payment_transactions")
      .select("stripe_payment_intent_id")
      .eq("type", "charge")
      .eq("status", "succeeded")
      .filter("metadata->>reservation_id", "eq", reservationId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (txError) throw new HttpError(500, txError.message);
    resolvedPaymentIntentId = pickFirstNonEmptyString(chargeTx?.stripe_payment_intent_id);
  }

  return {
    targetType: "reservation" as const,
    id: data.id,
    restaurantId: data.restaurant_id,
    userId: data.user_id,
    status: data.status,
    cancelledBy: (data as Record<string, unknown>).cancelled_by as string | null,
    refundStatus: (data as Record<string, unknown>).refund_status as string | null,
    refundReason: (data as Record<string, unknown>).refund_reason as string | null,
    totalAmount: toMoney(data.total_amount),
    refundedAmount: toMoney((data as Record<string, unknown>).refunded_amount_chf),
    paymentStatus: toMoney(data.total_amount) > 0 ? "paid" : null,
    paymentMethod: pickFirstNonEmptyString(data.payment_method, metadata.payment_method),
    paymentIntentId: resolvedPaymentIntentId,
    reference: data.order_reference,
  } satisfies RefundableEntity;
}

async function markRefundFailed(
  adminClient: ReturnType<typeof createAdminClient>,
  entity: RefundableEntity,
  reason: string,
) {
  const tableName = entity.targetType === "order" ? "orders" : "reservations";
  const { error } = await adminClient
    .from(tableName)
    .update({
      refund_status: "failed",
      refund_reason: reason,
      updated_at: new Date().toISOString(),
    } as never)
    .eq("id", entity.id);

  if (error) {
    console.error("[process-refund] failed to persist refund failure", error);
  }
}

Deno.serve(async (req) => {
  const corsHeaders = buildCorsHeaders(req);
  const preflight = handleCorsPreflight(req, corsHeaders);
  if (preflight) return preflight;

  const log = makeLogger("process-refund");
  let actor: Awaited<ReturnType<typeof authenticateRequest>> | null = null;
  let auditTargetId: string | null = null;
  let auditTargetType: string | null = null;
  let persistFailureState = false;

  try {
    actor = await authenticateRequest(req, { allowServiceRole: false });
    if (!actor.userId) {
      throw new HttpError(401, "Unauthorized");
    }
    await assertProductionFlowAllowed(actor, "remboursement réel");

    const body = await req.json().catch(() => ({}));
    const targetType = normalizeRefundTargetType(body?.target_type);
    const targetId = typeof body?.target_id === "string" ? body.target_id.trim() : "";
    const reason = typeof body?.reason === "string" ? body.reason.trim() : "";
    const requestedAmount = body?.amount_chf == null ? null : toMoney(body.amount_chf);

    auditTargetType = targetType;
    auditTargetId = targetId || null;

    if (!targetType || !targetId) {
      throw new HttpError(400, "target_type et target_id sont requis.");
    }

    const entity = targetType === "order"
      ? await lookupOrder(actor.adminClient, targetId)
      : await lookupReservation(actor.adminClient, targetId);

    await requireRestaurantAccess(actor, entity.restaurantId);

    if (normalize(entity.cancelledBy) === "customer" && !actor.isAdmin) {
      throw new HttpError(403, "Seul un administrateur peut rembourser une annulation client.");
    }

    if (normalize(entity.status) !== "cancelled") {
      throw new HttpError(409, "Le remboursement n'est possible qu'apres annulation.");
    }

    const finalServiceEvidence = await hasFinalServiceEvidence(actor.adminClient, entity);
    if (finalServiceEvidence && !actor.isAdmin) {
      throw new HttpError(403, "Une commande ou reservation deja servie requiert un remboursement admin.");
    }
    if (finalServiceEvidence && reason.length < ADMIN_REFUND_REASON_MIN_LENGTH) {
      throw new HttpError(400, "Un motif admin detaille est requis pour rembourser un service deja execute.");
    }

    if (entity.targetType === "order" && !isPaidOrder(entity.paymentStatus)) {
      throw new HttpError(400, "Cette commande n'a pas de paiement capture a rembourser.");
    }

    const remainingAmount = getRemainingRefundAmount(entity.totalAmount, entity.refundedAmount);
    const refundAmount = requestedAmount == null ? remainingAmount : Math.min(remainingAmount, requestedAmount);

    if (refundAmount <= 0) {
      throw new HttpError(400, "Aucun montant restant a rembourser.");
    }

    if (!entity.paymentIntentId) {
      throw new HttpError(400, "PaymentIntent Stripe introuvable pour ce remboursement.");
    }

    const { stripe } = getStripeRuntimeForCheckoutKind("refund");

    persistFailureState = true;
    const refundIdempotencyKey = [
      "tok-refund",
      entity.targetType,
      entity.id,
      Math.round(entity.refundedAmount * 100),
      Math.round(refundAmount * 100),
    ].join(":");
    const originalPaymentIntent = await stripe.paymentIntents.retrieve(entity.paymentIntentId);
    const isDestinationCharge = Boolean(originalPaymentIntent.transfer_data?.destination);
    const refundParams: Stripe.RefundCreateParams = {
      payment_intent: entity.paymentIntentId,
      amount: Math.round(refundAmount * 100),
      reason: getStripeRefundReason(entity.cancelledBy),
      ...(isDestinationCharge
        ? {
            reverse_transfer: true,
            refund_application_fee: true,
          }
        : {}),
      metadata: {
        target_type: entity.targetType,
        target_id: entity.id,
        restaurant_id: entity.restaurantId,
        cancelled_by: entity.cancelledBy || "",
        reference: entity.reference || "",
        idempotency_key: refundIdempotencyKey,
        connect_destination_charge: isDestinationCharge ? "true" : "false",
      },
    };
    const stripeRefund = await stripe.refunds.create(refundParams, {
      idempotencyKey: refundIdempotencyKey,
    });
    persistFailureState = false;

    const { data: markData, error: markError } = await actor.adminClient.rpc("mark_refund_applied", {
      p_target_type: entity.targetType,
      p_target_id: entity.id,
      p_actor: actor.isAdmin ? "admin" : "restaurant",
      p_reason: reason || entity.refundReason || null,
      p_amount_chf: refundAmount,
      p_stripe_refund_id: stripeRefund.id,
    });

    if (markError) {
      throw new HttpError(500, markError.message);
    }

    const markResult = Array.isArray(markData) ? markData[0] : markData;
    if (!markResult?.ok) {
      throw new HttpError(500, markResult?.error_message || "Impossible d'enregistrer le remboursement.");
    }

    await writeAuditLog({
      adminClient: actor.adminClient,
      actor,
      request: req,
      functionName: "process-refund",
      action: "refund_payment",
      status: "success",
      targetEntityType: entity.targetType,
      targetEntityId: entity.id,
      metadata: {
        refund_amount_chf: refundAmount,
        stripe_refund_id: stripeRefund.id,
        connect_destination_charge: isDestinationCharge,
        reverse_transfer: isDestinationCharge,
        refund_application_fee: isDestinationCharge,
      },
    });

    return jsonResponse({
      ok: true,
      target_type: entity.targetType,
      target_id: entity.id,
      refund_amount_chf: refundAmount,
      remaining_amount_chf: Math.max(0, remainingAmount - refundAmount),
      stripe_refund_id: stripeRefund.id,
      refund_status: remainingAmount - refundAmount <= 0 ? "refunded" : "partial",
    }, 200, corsHeaders);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erreur interne";
    log.error("process-refund error", { message, targetId: auditTargetId, targetType: auditTargetType });

    if (persistFailureState && actor && auditTargetId && auditTargetType && normalizeRefundTargetType(auditTargetType)) {
      try {
        const entity = auditTargetType === "order"
          ? await lookupOrder(actor.adminClient, auditTargetId)
          : await lookupReservation(actor.adminClient, auditTargetId);
        await markRefundFailed(actor.adminClient, entity, message);
      } catch (persistError) {
        log.error("process-refund persist failure", {
          message: persistError instanceof Error ? persistError.message : "unknown",
        });
      }
    }

    await writeAuditLog({
      adminClient: actor?.adminClient || createAdminClient(),
      actor,
      request: req,
      functionName: "process-refund",
      action: "refund_payment",
      status: "failure",
      targetEntityType: auditTargetType,
      targetEntityId: auditTargetId,
      errorMessage: message,
    });

    if (error instanceof HttpError) {
      return jsonResponse({ error: error.message }, error.status, corsHeaders);
    }

    return jsonResponse({ error: message }, 500, corsHeaders);
  }
});
