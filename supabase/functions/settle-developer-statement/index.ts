import Stripe from "npm:stripe@18.5.0";

import {
  HttpError,
  authenticateRequest,
  assertProductionFlowAllowed,
  createAdminClient,
  jsonResponse,
  writeAuditLog,
} from "../_shared/auth.ts";
import { buildCorsHeaders, handleCorsPreflight } from "../_shared/cors.ts";
import { makeLogger } from "../_shared/logging.ts";
import {
  getStripeRuntimeForCheckoutKindAndMode,
  type StripeRuntimeMode,
} from "../_shared/stripe-client.ts";

type DeveloperTransferClaim = {
  claimed: boolean;
  duplicate: boolean;
  in_progress: boolean;
  transfer_id?: string | null;
  lock_token?: string | null;
  statement_id?: string | null;
  stripe_mode?: StripeRuntimeMode | null;
  destination_account_id?: string | null;
  amount_cents?: number | null;
  currency?: string | null;
  idempotency_key?: string | null;
  stripe_transfer_id?: string | null;
};

function normalizeStripeMode(value: unknown): StripeRuntimeMode {
  return String(value || "live").trim().toLowerCase() === "test" ? "test" : "live";
}

function readClaim(value: unknown): DeveloperTransferClaim {
  const candidate = Array.isArray(value) ? value[0] : value;
  if (!candidate || typeof candidate !== "object") {
    throw new HttpError(500, "DEVELOPER_TRANSFER_CLAIM_INVALID");
  }

  return candidate as DeveloperTransferClaim;
}

function requireClaimString(value: unknown, code: string) {
  const normalized = String(value || "").trim();
  if (!normalized) throw new HttpError(500, code);
  return normalized;
}

function requirePositiveInteger(value: unknown, code: string) {
  const amount = Number(value);
  if (!Number.isInteger(amount) || amount <= 0) {
    throw new HttpError(500, code);
  }
  return amount;
}

function assertDeveloperConnectAccountReady(account: Stripe.Account | Stripe.DeletedAccount) {
  if ("deleted" in account && account.deleted) {
    throw new HttpError(409, "Le compte Stripe Connect du developpeur a ete supprime.");
  }

  const activeAccount = account as Stripe.Account;
  const requirementsDue = activeAccount.requirements?.currently_due?.filter(Boolean) || [];
  const disabledReason = activeAccount.requirements?.disabled_reason || null;
  const transfersCapability = activeAccount.capabilities?.transfers;

  if (
    !activeAccount.details_submitted
    || !activeAccount.payouts_enabled
    || requirementsDue.length > 0
    || disabledReason
    || (transfersCapability && transfersCapability !== "active")
  ) {
    throw new HttpError(
      409,
      "Le compte Stripe Connect du developpeur doit terminer sa verification et activer les virements.",
    );
  }
}

Deno.serve(async (req) => {
  const corsHeaders = buildCorsHeaders(req);
  const preflight = handleCorsPreflight(req, corsHeaders);
  if (preflight) return preflight;

  const log = makeLogger("settle-developer-statement");
  let actor: Awaited<ReturnType<typeof authenticateRequest>> | null = null;
  let auditStatementId: string | null = null;
  let activeClaim: {
    transferId: string;
    lockToken: string;
    stripeMode: StripeRuntimeMode;
  } | null = null;
  let stripeTransferReturned = false;

  try {
    actor = await authenticateRequest(req, { allowServiceRole: false });
    if (!actor.userId) throw new HttpError(401, "Unauthorized");
    if (!actor.isAdmin) throw new HttpError(403, "Admin access required.");

    const body = await req.json().catch(() => ({}));
    const statementId = String(body?.statement_id || "").trim();
    const stripeMode = normalizeStripeMode(body?.stripe_mode);
    auditStatementId = statementId || null;

    if (!statementId) {
      throw new HttpError(400, "statement_id requis.");
    }

    if (stripeMode === "live") {
      await assertProductionFlowAllowed(actor, "versement developpeur reel");
    }

    const { data: claimData, error: claimError } = await actor.adminClient.rpc(
      "claim_developer_statement_transfer",
      {
        p_statement_id: statementId,
        p_stripe_mode: stripeMode,
        p_lease_seconds: 300,
      },
    );

    if (claimError) {
      const status = /disabled|must_be_validated|no_positive_payable|destination/i.test(claimError.message)
        ? 409
        : 500;
      throw new HttpError(status, claimError.message);
    }

    const claim = readClaim(claimData);
    if (claim.duplicate) {
      return jsonResponse(
        {
          ok: true,
          duplicate: true,
          statement_id: statementId,
          stripe_mode: stripeMode,
          stripe_transfer_id: claim.stripe_transfer_id || null,
          amount_cents: claim.amount_cents || null,
          currency: claim.currency || "CHF",
        },
        200,
        corsHeaders,
      );
    }

    if (claim.in_progress || !claim.claimed) {
      throw new HttpError(409, "Un versement developpeur est deja en cours.");
    }

    const transferId = requireClaimString(claim.transfer_id, "DEVELOPER_TRANSFER_ID_MISSING");
    const lockToken = requireClaimString(claim.lock_token, "DEVELOPER_TRANSFER_LOCK_MISSING");
    const destinationAccountId = requireClaimString(
      claim.destination_account_id,
      "DEVELOPER_TRANSFER_DESTINATION_MISSING",
    );
    const idempotencyKey = requireClaimString(
      claim.idempotency_key,
      "DEVELOPER_TRANSFER_IDEMPOTENCY_KEY_MISSING",
    );
    const amountCents = requirePositiveInteger(
      claim.amount_cents,
      "DEVELOPER_TRANSFER_AMOUNT_INVALID",
    );
    const currency = String(claim.currency || "CHF").trim().toUpperCase();

    if (!/^[A-Z]{3}$/.test(currency)) {
      throw new HttpError(500, "DEVELOPER_TRANSFER_CURRENCY_INVALID");
    }

    activeClaim = { transferId, lockToken, stripeMode };

    const { stripe } = getStripeRuntimeForCheckoutKindAndMode(
      "developer-statement-transfer",
      stripeMode,
    );
    const account = await stripe.accounts.retrieve(destinationAccountId);
    assertDeveloperConnectAccountReady(account);

    const transferParams: Stripe.TransferCreateParams = {
      amount: amountCents,
      currency: currency.toLowerCase(),
      destination: destinationAccountId,
      transfer_group: `tok_dev_statement_${statementId}`.slice(0, 500),
      metadata: {
        statement_id: statementId,
        transfer_record_id: transferId,
        allocation_rule: "tok_revenue_10_percent",
        reservation_fee_example: "500=>tok450+developer50",
        order_example: "gross=>restaurant90%+tok9%+developer1%",
        stripe_mode: stripeMode,
      },
    };

    const stripeTransfer = await stripe.transfers.create(
      transferParams,
      { idempotencyKey: idempotencyKey.slice(0, 255) },
    );
    stripeTransferReturned = true;

    if (stripeTransfer.livemode !== (stripeMode === "live")) {
      throw new HttpError(409, "Le mode du virement Stripe ne correspond pas au releve.");
    }
    if (stripeTransfer.destination !== destinationAccountId) {
      throw new HttpError(409, "Le destinataire du virement Stripe ne correspond pas a la configuration.");
    }
    if (stripeTransfer.amount !== amountCents) {
      throw new HttpError(409, "Le montant du virement Stripe ne correspond pas au releve valide.");
    }

    const { data: completedData, error: completedError } = await actor.adminClient.rpc(
      "complete_developer_statement_transfer",
      {
        p_transfer_id: transferId,
        p_lock_token: lockToken,
        p_success: true,
        p_stripe_transfer_id: stripeTransfer.id,
        p_error: null,
        p_metadata: {
          stripe_balance_transaction_id:
            typeof stripeTransfer.balance_transaction === "string"
              ? stripeTransfer.balance_transaction
              : null,
          stripe_transfer_group: stripeTransfer.transfer_group || null,
          completed_by: actor.userId,
        },
      },
    );

    if (completedError) {
      // Do not mark the database transfer failed after Stripe has returned a
      // successful transfer. The processing lease will expire and the exact
      // same Stripe idempotency key will safely recover the result.
      throw new Error(`DEVELOPER_TRANSFER_COMPLETION_FAILED:${completedError.message}`);
    }

    activeClaim = null;

    await writeAuditLog({
      adminClient: actor.adminClient,
      actor,
      request: req,
      functionName: "settle-developer-statement",
      action: "stripe_developer_transfer",
      status: "success",
      targetEntityType: "developer_statements",
      targetEntityId: statementId,
      metadata: {
        stripe_mode: stripeMode,
        stripe_transfer_id: stripeTransfer.id,
        destination_account_id: destinationAccountId,
        amount_cents: amountCents,
        currency,
        completion: completedData,
      },
    });

    return jsonResponse(
      {
        ok: true,
        duplicate: false,
        statement_id: statementId,
        stripe_mode: stripeMode,
        stripe_transfer_id: stripeTransfer.id,
        amount_cents: amountCents,
        currency,
        statement_status: stripeMode === "live" ? "paid" : "validated",
      },
      200,
      corsHeaders,
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erreur interne";

    if (activeClaim && !stripeTransferReturned) {
      try {
        await (actor?.adminClient || createAdminClient()).rpc(
          "complete_developer_statement_transfer",
          {
            p_transfer_id: activeClaim.transferId,
            p_lock_token: activeClaim.lockToken,
            p_success: false,
            p_stripe_transfer_id: null,
            p_error: message,
            p_metadata: {
              failed_by: actor?.userId || null,
              stripe_mode: activeClaim.stripeMode,
            },
          },
        );
      } catch (completionError) {
        log.error("developer_transfer_failure_completion_failed", {
          message: completionError instanceof Error ? completionError.message : "unknown",
        });
      }
    }

    log.error("settle-developer-statement error", {
      message,
      statementId: auditStatementId,
    });

    await writeAuditLog({
      adminClient: actor?.adminClient || createAdminClient(),
      actor,
      request: req,
      functionName: "settle-developer-statement",
      action: "stripe_developer_transfer",
      status: "failure",
      targetEntityType: "developer_statements",
      targetEntityId: auditStatementId,
      errorMessage: message,
    });

    if (error instanceof HttpError) {
      return jsonResponse({ error: error.message }, error.status, corsHeaders);
    }

    return jsonResponse({ error: message }, 500, corsHeaders);
  }
});
