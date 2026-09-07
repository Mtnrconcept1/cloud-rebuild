import {
  HttpError,
  assertProductionFlowAllowed,
  authenticateRequest,
  createAdminClient,
  jsonResponse,
  requireRestaurantAccess,
  requireRole,
  writeAuditLog,
} from "../_shared/auth.ts";
import { buildCorsHeaders, handleCorsPreflight, isRequestOriginAllowed } from "../_shared/cors.ts";
import {
  acquirePaymentAttempt,
  bindPaymentAttemptStripe,
  failPaymentAttempt,
  fingerprintPaymentAttemptRequest,
  requireClientPaymentAttemptId,
  sealPaymentAttemptRequest,
} from "../_shared/payment-attempts.ts";
import { getStripeRuntimeForCheckoutKind } from "../_shared/stripe-client.ts";
import { validatePrintAddress } from "../_shared/print/security.ts";

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function requireString(value: unknown, field: string) {
  const normalized = String(value || "").trim();
  if (!normalized) throw new HttpError(400, `${field} requis`);
  return normalized;
}

function returnBase(req: Request) {
  if (!isRequestOriginAllowed(req)) throw new HttpError(403, "Origin non autorisée");
  const origin = req.headers.get("origin")?.trim();
  if (origin) return new URL(origin).origin;
  const site = Deno.env.get("SITE_URL")?.trim() || Deno.env.get("PUBLIC_APP_URL")?.trim() || "https://www.thetok.ch";
  return new URL(site).origin;
}

Deno.serve(async (req) => {
  const cors = buildCorsHeaders(req);
  const preflight = handleCorsPreflight(req, cors);
  if (preflight) return preflight;
  let actor: Awaited<ReturnType<typeof authenticateRequest>> | null = null;
  const adminClient = createAdminClient();
  let acquiredAttempt: Awaited<ReturnType<typeof acquirePaymentAttempt>> | null = null;

  try {
    if (req.method !== "POST") throw new HttpError(405, "Method not allowed");
    actor = await authenticateRequest(req);
    requireRole(actor, ["restaurateur", "admin"]);
    await assertProductionFlowAllowed(actor, "paiement impression");
    if (!actor.userId) throw new HttpError(401, "Unauthorized");

    const body = asRecord(await req.json().catch(() => ({})));
    const restaurantId = requireString(body.restaurantId, "restaurantId");
    await requireRestaurantAccess(actor, restaurantId);
    const quoteId = requireString(body.quoteId, "quoteId");
    const clientPaymentAttemptId = requireClientPaymentAttemptId(body.paymentAttemptId);
    const shippingAddress = validatePrintAddress(asRecord(body.shippingAddress) as any);

    const { data: settings, error: settingsError } = await adminClient
      .from("print_settings")
      .select("enabled, new_orders_enabled")
      .eq("id", "global")
      .single();
    if (settingsError) throw settingsError;
    if (!settings.enabled || !settings.new_orders_enabled) throw new HttpError(503, "Les nouvelles impressions sont temporairement suspendues");

    const { data: quote, error: quoteError } = await adminClient
      .from("print_quotes")
      .select("id, restaurant_id, print_export_id, provider_product_id, provider, quantity, country, state, customer_currency, customer_amount_cents, expires_at, selected_shipping_quote, selected_shipping_level, selected_shipping_option")
      .eq("id", quoteId)
      .eq("restaurant_id", restaurantId)
      .maybeSingle();
    if (quoteError) throw quoteError;
    if (!quote) throw new HttpError(404, "Devis impression introuvable");
    if (new Date(quote.expires_at).getTime() <= Date.now()) throw new HttpError(409, "Le devis a expiré. Recalculez le prix.");
    if (quote.customer_currency !== "CHF") throw new HttpError(409, "Devise impression non supportée");

    const { data: exportRow, error: exportError } = await adminClient
      .from("print_exports")
      .select("id, status, md5, sha256, provider_product_id, production_storage_path")
      .eq("id", quote.print_export_id)
      .eq("restaurant_id", restaurantId)
      .maybeSingle();
    if (exportError) throw exportError;
    if (!exportRow || exportRow.status !== "approved") throw new HttpError(409, "Le BAT approuvé est requis avant paiement");
    if (exportRow.provider_product_id !== quote.provider_product_id) throw new HttpError(409, "Le produit du devis ne correspond plus au BAT");

    const { data: providerProduct, error: providerError } = await adminClient
      .from("print_provider_products")
      .select("id, print_product_id, provider_reference")
      .eq("id", quote.provider_product_id)
      .eq("active", true)
      .maybeSingle();
    if (providerError) throw providerError;
    if (!providerProduct?.print_product_id) throw new HttpError(409, "Produit impression indisponible");

    const { data: logicalProduct, error: logicalError } = await adminClient
      .from("print_products")
      .select("id, display_name")
      .eq("id", providerProduct.print_product_id)
      .eq("active", true)
      .maybeSingle();
    if (logicalError) throw logicalError;
    if (!logicalProduct) throw new HttpError(409, "Produit TheTok indisponible");

    const stripeRuntime = getStripeRuntimeForCheckoutKind("marketing-print");
    acquiredAttempt = await acquirePaymentAttempt({
      adminClient,
      operationKey: clientPaymentAttemptId,
      ownerUserId: actor.userId,
      restaurantId,
      kind: "marketing_print_order",
      mode: stripeRuntime.mode,
      amountCents: Number(quote.customer_amount_cents),
      currency: "CHF",
      leaseSeconds: 180,
      metadata: { quote_id: quote.id, print_export_id: exportRow.id },
    });

    const { data: existingOrder, error: existingOrderError } = await adminClient
      .from("print_orders")
      .select("id, provider_reference, status, payment_status")
      .eq("payment_attempt_id", acquiredAttempt.attemptId)
      .maybeSingle();
    if (existingOrderError) throw existingOrderError;

    if (!acquiredAttempt.leaseAcquired) {
      if (acquiredAttempt.stripeCheckoutSessionId) {
        const session = await stripeRuntime.stripe.checkout.sessions.retrieve(acquiredAttempt.stripeCheckoutSessionId);
        if (session.url && session.status === "open") {
          return jsonResponse({
            orderId: existingOrder?.id || null,
            paymentAttemptId: clientPaymentAttemptId,
            checkoutSessionId: session.id,
            checkoutUrl: session.url,
            reused: true,
          }, 200, cors);
        }
      }
      throw new HttpError(409, acquiredAttempt.state === "finalized" ? "Cette impression est déjà payée" : "Paiement impression déjà en cours");
    }
    if (!acquiredAttempt.leaseToken) throw new HttpError(409, "Lease paiement indisponible");

    const requestSnapshot = {
      quote_id: quote.id,
      restaurant_id: restaurantId,
      export_id: exportRow.id,
      export_sha256: exportRow.sha256,
      provider_product_id: providerProduct.id,
      quantity: quote.quantity,
      customer_amount_cents: quote.customer_amount_cents,
      customer_currency: "CHF",
      shipping_address: shippingAddress,
    };
    const fingerprint = await fingerprintPaymentAttemptRequest(requestSnapshot);
    await sealPaymentAttemptRequest({
      adminClient,
      attemptId: acquiredAttempt.attemptId,
      leaseToken: acquiredAttempt.leaseToken,
      fingerprint,
      requestSnapshot,
    });

    let orderId = existingOrder?.id || null;
    let providerReference = existingOrder?.provider_reference || null;
    if (!orderId) {
      orderId = crypto.randomUUID();
      providerReference = `TOKP_${orderId.replace(/-/g, "").toUpperCase()}`;
      const { error: orderError } = await adminClient.from("print_orders").insert({
        id: orderId,
        restaurant_id: restaurantId,
        owner_user_id: actor.userId,
        print_quote_id: quote.id,
        print_export_id: exportRow.id,
        payment_attempt_id: acquiredAttempt.attemptId,
        status: "payment_pending",
        payment_status: "pending",
        provider: quote.provider,
        provider_reference: providerReference,
        customer_currency: "CHF",
        customer_amount_cents: quote.customer_amount_cents,
        quantity: quote.quantity,
        shipping_address: shippingAddress,
        selected_shipping: {
          quote: quote.selected_shipping_quote,
          shipping_level: quote.selected_shipping_level,
          shipping_option: quote.selected_shipping_option,
        },
      });
      if (orderError) throw orderError;

      const { error: itemError } = await adminClient.from("print_order_items").insert({
        print_order_id: orderId,
        restaurant_id: restaurantId,
        print_product_id: logicalProduct.id,
        provider_product_id: providerProduct.id,
        item_reference: `ITEM_${orderId.replace(/-/g, "").slice(0, 20).toUpperCase()}`,
        quantity: quote.quantity,
        title: logicalProduct.display_name,
        provider_product_reference: providerProduct.provider_reference,
        options: [],
        file_snapshot: {
          export_id: exportRow.id,
          md5: exportRow.md5,
          sha256: exportRow.sha256,
          storage_path: exportRow.production_storage_path,
        },
      });
      if (itemError) throw itemError;
    }

    const base = returnBase(req);
    const callbackPath = `/dashboard/photos?print_order_id=${encodeURIComponent(orderId)}`;
    const successUrl = `${base}${callbackPath}&payment_attempt_id=${encodeURIComponent(clientPaymentAttemptId)}&status=success`;
    const cancelUrl = `${base}${callbackPath}&payment_attempt_id=${encodeURIComponent(clientPaymentAttemptId)}&status=cancelled`;
    const metadata = {
      payment_attempt_version: "2",
      payment_attempt_id: acquiredAttempt.attemptId,
      client_payment_attempt_id: clientPaymentAttemptId,
      operation_key: clientPaymentAttemptId,
      checkout_kind: "marketing-print",
      print_order_id: orderId,
      restaurant_id: restaurantId,
    };

    try {
      const session = await stripeRuntime.stripe.checkout.sessions.create({
        mode: "payment",
        payment_method_types: ["card"],
        line_items: [{
          quantity: 1,
          price_data: {
            currency: "chf",
            unit_amount: Number(quote.customer_amount_cents),
            product_data: {
              name: `Impression TheTok — ${logicalProduct.display_name}`,
              description: `${quote.quantity} exemplaires`,
            },
          },
        }],
        success_url: successUrl,
        cancel_url: cancelUrl,
        metadata,
        payment_intent_data: { metadata },
      }, { idempotencyKey: acquiredAttempt.stripeIdempotencyKey });
      if (!session.url) throw new Error("STRIPE_CHECKOUT_URL_MISSING");

      await bindPaymentAttemptStripe({
        adminClient,
        attemptId: acquiredAttempt.attemptId,
        leaseToken: acquiredAttempt.leaseToken,
        checkoutSessionId: session.id,
        paymentIntentId: typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id || null,
        sessionExpiresAt: session.expires_at ? new Date(session.expires_at * 1000).toISOString() : null,
        metadata: { print_order_id: orderId, provider_reference: providerReference },
      });

      await writeAuditLog({
        adminClient,
        actor,
        request: req,
        functionName: "print-checkout",
        action: "create_checkout",
        status: "success",
        targetEntityType: "print_orders",
        targetEntityId: orderId,
        metadata: { restaurant_id: restaurantId, payment_attempt_id: acquiredAttempt.attemptId, amount_cents: quote.customer_amount_cents },
      });

      return jsonResponse({
        orderId,
        paymentAttemptId: clientPaymentAttemptId,
        checkoutSessionId: session.id,
        checkoutUrl: session.url,
      }, 200, cors);
    } catch (error) {
      await failPaymentAttempt({
        adminClient,
        attemptId: acquiredAttempt.attemptId,
        leaseToken: acquiredAttempt.leaseToken,
        errorCode: "print_checkout_create_failed",
        errorMessage: error instanceof Error ? error.message.slice(0, 500) : "Stripe checkout failed",
        retryable: true,
      }).catch(() => undefined);
      throw error;
    }
  } catch (error) {
    const status = error instanceof HttpError ? error.status : 500;
    const message = error instanceof Error ? error.message.replace(/[\r\n]+/g, " ").slice(0, 500) : "Erreur paiement impression";
    await writeAuditLog({
      adminClient,
      actor,
      request: req,
      functionName: "print-checkout",
      action: "checkout",
      status: "failure",
      targetEntityType: "print_orders",
      errorMessage: message,
    });
    return jsonResponse({ error: status >= 500 ? "Erreur interne paiement impression" : message }, status, cors);
  }
});
