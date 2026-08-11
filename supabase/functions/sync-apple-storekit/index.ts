import {
  HttpError,
  assertProductionFlowAllowed,
  authenticateRequest,
  errorDiagnostics,
  jsonResponse,
  requireUserRole,
  writeAuditLog,
} from "../_shared/auth.ts";
import { buildCorsHeaders, handleCorsPreflight } from "../_shared/cors.ts";
import {
  assertTokOneAppleTransaction,
  persistAppleTokOneTransaction,
  verifyAppleSignedTransaction,
} from "../_shared/apple-storekit.ts";

Deno.serve(async (req) => {
  const corsHeaders = buildCorsHeaders(req);
  const preflight = handleCorsPreflight(req, corsHeaders);
  if (preflight) return preflight;

  let actor: Awaited<ReturnType<typeof authenticateRequest>> | null = null;
  let appleTransactionId: string | null = null;

  try {
    if (req.method !== "POST") {
      throw new HttpError(405, "Method not allowed");
    }

    actor = await authenticateRequest(req, { allowServiceRole: false });
    requireUserRole(actor, ["client"], "Un compte client TOK est requis pour Tok One.");
    await assertProductionFlowAllowed(actor, "abonnement Tok One Apple");

    const body = await req.json() as {
      signed_transaction?: unknown;
      plan_id?: unknown;
      billing_period?: unknown;
      payment_attempt_id?: unknown;
      source?: unknown;
    };

    if (typeof body.signed_transaction !== "string" || !body.signed_transaction.trim()) {
      throw new HttpError(400, "Transaction Apple signée requise.");
    }
    if (typeof body.plan_id !== "string" || !body.plan_id.trim()) {
      throw new HttpError(400, "Formule Tok One requise.");
    }

    const { transaction } = await verifyAppleSignedTransaction(body.signed_transaction);
    const identity = assertTokOneAppleTransaction(transaction);
    appleTransactionId = identity.transactionId;

    if (!actor.userId || identity.userId !== actor.userId.toLowerCase()) {
      throw new HttpError(403, "Cette transaction Apple n’appartient pas à ce compte TOK.");
    }

    const requestedBillingPeriod =
      typeof body.billing_period === "string" && body.billing_period.trim()
        ? body.billing_period.trim().toLowerCase()
        : null;
    if (requestedBillingPeriod && requestedBillingPeriod !== identity.billingPeriod) {
      throw new HttpError(400, "La période de facturation Apple ne correspond pas à la formule demandée.");
    }

    const persisted = await persistAppleTokOneTransaction({
      adminClient: actor.adminClient,
      transaction,
      requestedPlanId: body.plan_id,
    });

    if (!persisted.updated || !persisted.row) {
      throw new HttpError(409, "Impossible d’associer la transaction Apple à une formule Tok One.");
    }

    await writeAuditLog({
      adminClient: actor.adminClient,
      functionName: "sync-apple-storekit",
      status: "success",
      action: "sync_tok_one_apple_purchase",
      actor,
      request: req,
      targetEntityType: "tok_one_subscriptions",
      targetEntityId: String(persisted.row.id),
      metadata: {
        apple_transaction_id: identity.transactionId,
        apple_original_transaction_id: identity.originalTransactionId,
        apple_product_id: identity.productId,
        apple_environment: transaction.environment || null,
        payment_attempt_id: typeof body.payment_attempt_id === "string" ? body.payment_attempt_id : null,
        source: typeof body.source === "string" ? body.source : "ios_storekit",
      },
    });

    return jsonResponse({
      success: true,
      subscription: persisted.row,
      apple_transaction_id: identity.transactionId,
      apple_original_transaction_id: identity.originalTransactionId,
      billing_period: identity.billingPeriod,
    }, 200, corsHeaders);
  } catch (error) {
    const status = error instanceof HttpError ? error.status : 500;
    const message = error instanceof Error ? error.message : "StoreKit sync failed";

    if (actor) {
      await writeAuditLog({
        adminClient: actor.adminClient,
        functionName: "sync-apple-storekit",
        status: "failure",
        action: "sync_tok_one_apple_purchase",
        actor,
        request: req,
        targetEntityType: "apple_storekit_transaction",
        targetEntityId: appleTransactionId,
        errorMessage: message,
        metadata: errorDiagnostics(error),
      });
    }

    return jsonResponse({
      error: status >= 500 ? "La validation Apple est momentanément indisponible." : message,
      error_code: status >= 500 ? "APPLE_STOREKIT_SYNC_FAILED" : "APPLE_STOREKIT_INVALID_TRANSACTION",
      retryable: status >= 500,
    }, status, corsHeaders);
  }
});
