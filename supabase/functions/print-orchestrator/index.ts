import {
  HttpError,
  assertProductionFlowAllowed,
  authenticateRequest,
  createAdminClient,
  jsonResponse,
  requireRole,
  writeAuditLog,
} from "../_shared/auth.ts";
import { buildCorsHeaders, handleCorsPreflight } from "../_shared/cors.ts";
import { CloudprinterError, getPrintProvider } from "../_shared/print/cloudprinter.ts";

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function backoffIso(attempt: number) {
  const seconds = Math.min(3600, Math.max(60, 60 * (2 ** Math.max(0, attempt - 1))));
  return new Date(Date.now() + seconds * 1000).toISOString();
}

async function reconcileFinalizedPayments(adminClient: any, limit: number) {
  const { data: orders, error } = await adminClient
    .from("print_orders")
    .select("id, payment_attempt_id")
    .eq("payment_status", "pending")
    .not("payment_attempt_id", "is", null)
    .order("created_at", { ascending: true })
    .limit(limit);
  if (error) throw error;
  const attemptIds = (orders || []).map((row: any) => row.payment_attempt_id).filter(Boolean);
  if (!attemptIds.length) return 0;

  const { data: attempts, error: attemptError } = await adminClient
    .from("payment_attempts")
    .select("id, kind, state")
    .in("id", attemptIds);
  if (attemptError) throw attemptError;
  const finalized = new Set((attempts || [])
    .filter((row: any) => row.kind === "marketing_print_order" && row.state === "finalized")
    .map((row: any) => row.id));

  let count = 0;
  for (const order of orders || []) {
    if (!finalized.has(order.payment_attempt_id)) continue;
    const { error: finalizeError } = await adminClient.rpc("finalize_paid_print_order", {
      p_order_id: order.id,
      p_payment_attempt_id: order.payment_attempt_id,
      p_stripe_event_id: null,
    });
    if (finalizeError) throw finalizeError;
    count += 1;
  }
  return count;
}

async function currentQuoteHash(input: {
  adminClient: any;
  provider: ReturnType<typeof getPrintProvider>;
  quote: any;
  item: any;
}) {
  const expiresAt = new Date(input.quote.expires_at).getTime();
  if (Number.isFinite(expiresAt) && expiresAt > Date.now() + 15 * 60 * 1000) {
    return input.quote.selected_shipping_quote as string;
  }

  const refreshed = await input.provider.getQuote({
    country: input.quote.country,
    state: input.quote.state,
    currency: "CHF",
    items: [{
      reference: `fulfill-${input.item.print_order_id}`,
      product: input.item.provider_product_reference,
      count: input.item.quantity,
      options: Array.isArray(input.item.options) ? input.item.options : [],
    }],
  });
  if (refreshed.currency !== "CHF") throw new HttpError(409, "PRINT_QUOTE_CURRENCY_UNSUPPORTED");
  const shipping = refreshed.shipping.find((row) => row.shippingLevel === input.quote.selected_shipping_level)
    || refreshed.shipping.find((row) => row.shippingOption === input.quote.selected_shipping_option)
    || [...refreshed.shipping].sort((left, right) => left.price - right.price)[0];
  if (!shipping) throw new HttpError(409, "Aucune livraison fournisseur disponible");
  const expires = refreshed.expiresAt ? new Date(refreshed.expiresAt) : null;
  if (!expires || Number.isNaN(expires.getTime())) throw new HttpError(502, "Expiration devis fournisseur invalide");

  const { error } = await input.adminClient.from("print_quotes").update({
    provider_currency: refreshed.currency,
    provider_product_amount: refreshed.productPrice,
    provider_product_vat: refreshed.productVat,
    provider_invoice_currency: shipping.invoiceCurrency,
    provider_invoice_exchange_rate: shipping.invoiceExchangeRate,
    provider_quote_snapshot: refreshed.raw,
    selected_shipping_quote: shipping.quote,
    selected_shipping_level: shipping.shippingLevel,
    selected_shipping_option: shipping.shippingOption,
    selected_shipping_amount: shipping.price,
    selected_shipping_vat: shipping.vat,
    expires_at: expires.toISOString(),
  }).eq("id", input.quote.id);
  if (error) throw error;
  return shipping.quote;
}

async function completeJob(adminClient: any, job: any, input: {
  status: "retrying" | "completed" | "failed" | "canceled";
  errorCode?: string | null;
  error?: string | null;
  result?: Record<string, unknown>;
}) {
  const { error } = await adminClient.rpc("complete_print_fulfillment_job", {
    p_job_id: job.id,
    p_lease_token: job.lease_token,
    p_status: input.status,
    p_error_code: input.errorCode || null,
    p_error: input.error || null,
    p_result: input.result || {},
    p_next_attempt_at: input.status === "retrying" ? backoffIso(job.attempt_count) : null,
  });
  if (error) throw error;
}

async function processSubmitJob(adminClient: any, actor: any, job: any) {
  await assertProductionFlowAllowed(actor, "soumission Cloudprinter");
  const { data: settings, error: settingsError } = await adminClient
    .from("print_settings")
    .select("enabled, new_orders_enabled")
    .eq("id", "global")
    .single();
  if (settingsError) throw settingsError;
  if (!settings.enabled || !settings.new_orders_enabled) {
    await completeJob(adminClient, job, { status: "retrying", errorCode: "print_kill_switch", error: "Nouvelles soumissions suspendues" });
    return { id: job.id, status: "retrying", reason: "kill_switch" };
  }

  const { data: order, error: orderError } = await adminClient
    .from("print_orders")
    .select("id, restaurant_id, owner_user_id, print_quote_id, print_export_id, payment_attempt_id, payment_status, status, provider_reference, shipping_address")
    .eq("id", job.print_order_id)
    .maybeSingle();
  if (orderError) throw orderError;
  if (!order) throw new HttpError(404, "Commande impression introuvable");
  if (order.payment_status !== "paid") throw new HttpError(409, "PRINT_ORDER_NOT_PAID");
  if (["submitted", "validated", "producing", "produced", "packed", "shipped", "delivered"].includes(order.status)) {
    await completeJob(adminClient, job, { status: "completed", result: { already_submitted: true } });
    return { id: job.id, status: "completed", alreadySubmitted: true };
  }

  let providerReference = String(order.provider_reference || "").trim();
  if (!providerReference) {
    providerReference = `TOKP_${order.id.replace(/-/g, "").toUpperCase()}`;
    const { error } = await adminClient.from("print_orders").update({ provider_reference: providerReference }).eq("id", order.id);
    if (error) throw error;
  }

  const { data: item, error: itemError } = await adminClient
    .from("print_order_items")
    .select("id, print_order_id, item_reference, quantity, provider_product_reference, options, file_snapshot")
    .eq("print_order_id", order.id)
    .limit(1)
    .maybeSingle();
  if (itemError) throw itemError;
  if (!item) throw new HttpError(409, "Article impression introuvable");

  const { data: quote, error: quoteError } = await adminClient
    .from("print_quotes")
    .select("id, country, state, expires_at, selected_shipping_quote, selected_shipping_level, selected_shipping_option")
    .eq("id", order.print_quote_id)
    .single();
  if (quoteError) throw quoteError;

  const { data: exportRow, error: exportError } = await adminClient
    .from("print_exports")
    .select("id, production_storage_path, md5, sha256, status")
    .eq("id", order.print_export_id)
    .single();
  if (exportError) throw exportError;
  if (exportRow.status !== "approved") throw new HttpError(409, "BAT impression non approuvé");

  const provider = getPrintProvider();
  // Always reconcile by the immutable TheTok reference before createOrder.
  // This makes a retry safe after an ambiguous /orders/add timeout.
  const existing = await provider.getOrder(providerReference);
  if (existing) {
    await adminClient.rpc("advance_print_order_state", {
      p_order_id: order.id,
      p_state: "submitted",
      p_provider_state: existing.stateCode || existing.state,
      p_tracking_code: existing.items.find((entry) => entry.tracking)?.tracking || null,
      p_tracking_url: null,
      p_carrier: null,
      p_provider_event_id: null,
      p_message: "Commande fournisseur réconciliée",
      p_metadata: { reconciled: true },
    });
    await completeJob(adminClient, job, { status: "completed", result: { reconciled: true } });
    return { id: job.id, status: "completed", reconciled: true };
  }

  const quoteHash = await currentQuoteHash({ adminClient, provider, quote, item });
  const { data: signed, error: signedError } = await adminClient.storage
    .from("print-production-files")
    .createSignedUrl(exportRow.production_storage_path, 24 * 60 * 60);
  if (signedError || !signed?.signedUrl) throw new HttpError(503, "URL de production indisponible");

  const address = asRecord(order.shipping_address);
  const createOrder = () => provider.createOrder({
    reference: providerReference,
    email: Deno.env.get("PRINT_SUPPORT_EMAIL")?.trim() || "support@thetok.ch",
    address: address as any,
    items: [{
      reference: item.item_reference,
      product: item.provider_product_reference,
      count: item.quantity,
      quote: quoteHash,
      options: Array.isArray(item.options) ? item.options : [],
      files: [{ type: "product", url: signed.signedUrl, md5sum: exportRow.md5 }],
    }],
  });

  try {
    await createOrder();
  } catch (error) {
    if (error instanceof CloudprinterError && error.ambiguous) {
      const reconciled = await provider.getOrder(providerReference);
      if (reconciled) {
        await adminClient.rpc("advance_print_order_state", {
          p_order_id: order.id,
          p_state: "submitted",
          p_provider_state: reconciled.stateCode || reconciled.state,
          p_tracking_code: reconciled.items.find((entry) => entry.tracking)?.tracking || null,
          p_tracking_url: null,
          p_carrier: null,
          p_provider_event_id: null,
          p_message: "Commande retrouvée après réponse fournisseur ambiguë",
          p_metadata: { reconciled_after_ambiguous_create: true },
        });
        await completeJob(adminClient, job, { status: "completed", result: { reconciled_after_timeout: true } });
        return { id: job.id, status: "completed", reconciledAfterTimeout: true };
      }
    }
    throw error;
  }

  await adminClient.rpc("advance_print_order_state", {
    p_order_id: order.id,
    p_state: "submitted",
    p_provider_state: "submitted",
    p_tracking_code: null,
    p_tracking_url: null,
    p_carrier: null,
    p_provider_event_id: null,
    p_message: "Commande transmise au réseau d’impression",
    p_metadata: { provider_reference: providerReference },
  });
  await completeJob(adminClient, job, { status: "completed", result: { provider_reference: providerReference } });
  return { id: job.id, status: "completed", providerReference };
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
    const limit = Math.max(1, Math.min(50, Math.round(Number(body.limit || 10))));

    const finalizedPayments = await reconcileFinalizedPayments(adminClient, Math.min(50, limit * 5));
    const { data: jobs, error: claimError } = await adminClient.rpc("claim_print_fulfillment_jobs", {
      p_limit: limit,
      p_worker_id: `print-orchestrator:${crypto.randomUUID()}`,
      p_lease_seconds: 180,
    });
    if (claimError) throw claimError;

    const results: unknown[] = [];
    for (const job of Array.isArray(jobs) ? jobs : []) {
      try {
        if (job.job_type === "submit_order") results.push(await processSubmitJob(adminClient, actor, job));
        else {
          await completeJob(adminClient, job, { status: "failed", errorCode: "unsupported_job_type", error: `Unsupported job ${job.job_type}` });
          results.push({ id: job.id, status: "failed" });
        }
      } catch (error) {
        const retryable = !(error instanceof HttpError && error.status >= 400 && error.status < 500)
          || (error instanceof CloudprinterError && error.retryable);
        const status = retryable && job.attempt_count < job.max_attempts ? "retrying" : "failed";
        await completeJob(adminClient, job, {
          status,
          errorCode: error instanceof CloudprinterError ? error.code : "print_orchestrator_error",
          error: error instanceof Error ? error.message.slice(0, 500) : "Erreur fulfillment",
        }).catch(() => undefined);
        results.push({ id: job.id, status });
      }
    }

    await writeAuditLog({
      adminClient,
      actor,
      request: req,
      functionName: "print-orchestrator",
      action: "run",
      status: "success",
      targetEntityType: "print_fulfillment_jobs",
      metadata: { finalized_payments: finalizedPayments, claimed_jobs: Array.isArray(jobs) ? jobs.length : 0 },
    });
    return jsonResponse({ ok: true, finalizedPayments, results }, 200, cors);
  } catch (error) {
    const status = error instanceof HttpError ? error.status : 500;
    const message = error instanceof Error ? error.message.replace(/[\r\n]+/g, " ").slice(0, 500) : "Erreur orchestrateur impression";
    await writeAuditLog({
      adminClient,
      actor,
      request: req,
      functionName: "print-orchestrator",
      action: "run",
      status: "failure",
      targetEntityType: "print_fulfillment_jobs",
      errorMessage: message,
    });
    return jsonResponse({ error: status >= 500 ? "Erreur interne orchestrateur impression" : message }, status, cors);
  }
});
