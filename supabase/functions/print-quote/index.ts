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
import { buildCorsHeaders, handleCorsPreflight } from "../_shared/cors.ts";
import { CloudprinterError, getPrintProvider } from "../_shared/print/cloudprinter.ts";
import { getCloudprinterDefaultOptions } from "../_shared/print/options.ts";
import { calculatePrintRetailPrice } from "../_shared/print/pricing.ts";
import { isCloudprinterOrderQuantityValid } from "../_shared/print/quantity.ts";

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function requireString(value: unknown, field: string) {
  const normalized = String(value || "").trim();
  if (!normalized) throw new HttpError(400, `${field} requis`);
  return normalized;
}

function requireQuantity(value: unknown) {
  const quantity = Math.round(Number(value));
  if (!Number.isFinite(quantity) || quantity < 1 || quantity > 1_000_000) throw new HttpError(400, "Quantité invalide");
  return quantity;
}

function providerHttpStatus(error: CloudprinterError) {
  const providerStatus = error.status;
  if (providerStatus === 429) return 503;
  if (providerStatus && providerStatus >= 400 && providerStatus < 500) return 422;
  return 502;
}

Deno.serve(async (req) => {
  const cors = buildCorsHeaders(req);
  const preflight = handleCorsPreflight(req, cors);
  if (preflight) return preflight;
  let actor: Awaited<ReturnType<typeof authenticateRequest>> | null = null;
  const adminClient = createAdminClient();

  try {
    if (req.method !== "POST") throw new HttpError(405, "Method not allowed");
    actor = await authenticateRequest(req);
    requireRole(actor, ["restaurateur", "admin"]);
    await assertProductionFlowAllowed(actor, "devis impression");
    const body = asRecord(await req.json().catch(() => ({})));
    const restaurantId = requireString(body.restaurantId, "restaurantId");
    await requireRestaurantAccess(actor, restaurantId);
    const exportId = requireString(body.exportId, "exportId");
    const quantity = requireQuantity(body.quantity);
    const country = String(body.country || "CH").trim().toUpperCase();
    const state = String(body.state || "").trim() || null;
    if (country !== "CH") throw new HttpError(400, "TheTok Print est actuellement disponible uniquement en Suisse");

    const { data: settings, error: settingsError } = await adminClient
      .from("print_settings")
      .select("enabled, new_orders_enabled, default_margin_bps, minimum_margin_cents, rounding_increment_cents")
      .eq("id", "global")
      .single();
    if (settingsError) throw settingsError;
    if (!settings.enabled || !settings.new_orders_enabled) throw new HttpError(503, "Les nouvelles impressions sont temporairement suspendues");

    const { data: exportRow, error: exportError } = await adminClient
      .from("print_exports")
      .select("id, restaurant_id, status, provider_product_id, product_spec_snapshot, md5, sha256")
      .eq("id", exportId)
      .eq("restaurant_id", restaurantId)
      .maybeSingle();
    if (exportError) throw exportError;
    if (!exportRow) throw new HttpError(404, "Export impression introuvable");
    if (exportRow.status !== "approved") throw new HttpError(409, "Le BAT doit être approuvé avant le devis final");

    const { data: providerProduct, error: providerError } = await adminClient
      .from("print_provider_products")
      .select("id, print_product_id, provider, provider_reference, minimum_quantity, quantity_step, active")
      .eq("id", exportRow.provider_product_id)
      .eq("active", true)
      .maybeSingle();
    if (providerError) throw providerError;
    if (!providerProduct?.print_product_id) throw new HttpError(409, "Produit fournisseur non mappé");
    if (providerProduct.provider !== "cloudprinter") throw new HttpError(409, "Fournisseur impression non supporté");

    const minimumQuantity = Math.max(1, Math.round(Number(providerProduct.minimum_quantity || 1)));
    const quantityStep = Math.max(1, Math.round(Number(providerProduct.quantity_step || 1)));
    if (!isCloudprinterOrderQuantityValid(quantity, minimumQuantity, quantityStep)) {
      throw new HttpError(400, `Quantité invalide : minimum ${minimumQuantity}, pas ${quantityStep}`);
    }

    const providerOptions = getCloudprinterDefaultOptions(exportRow.product_spec_snapshot);
    const provider = getPrintProvider();
    const providerQuote = await provider.getQuote({
      country,
      state,
      currency: "CHF",
      items: [{
        reference: `quote-${exportId}`,
        product: providerProduct.provider_reference,
        count: quantity,
        options: providerOptions,
      }],
    });
    if (providerQuote.currency !== "CHF") throw new HttpError(409, "PRINT_QUOTE_CURRENCY_UNSUPPORTED");
    if (!providerQuote.shipping.length) throw new HttpError(409, "Aucune livraison disponible pour ce produit");

    const requestedShippingQuote = String(body.shippingQuote || "").trim();
    const selected = requestedShippingQuote
      ? providerQuote.shipping.find((quote) => quote.quote === requestedShippingQuote)
      : [...providerQuote.shipping].sort((left, right) => left.price - right.price)[0];
    if (!selected) throw new HttpError(400, "Mode de livraison invalide ou expiré");
    if (selected.currency !== "CHF") throw new HttpError(409, "PRINT_QUOTE_CURRENCY_UNSUPPORTED");

    const retail = calculatePrintRetailPrice({
      providerProductAmount: providerQuote.productPrice,
      providerProductVat: providerQuote.productVat,
      providerShippingAmount: selected.price,
      providerShippingVat: selected.vat,
      providerCurrency: providerQuote.currency,
      marginBps: Number(settings.default_margin_bps || 0),
      minimumMarginCents: Number(settings.minimum_margin_cents || 0),
      roundingIncrementCents: Number(settings.rounding_increment_cents || 1),
    });

    const expiresAt = providerQuote.expiresAt ? new Date(providerQuote.expiresAt) : null;
    if (!expiresAt || Number.isNaN(expiresAt.getTime()) || expiresAt.getTime() <= Date.now()) {
      throw new HttpError(502, "Le fournisseur n’a pas retourné une expiration de devis valide");
    }

    const { data: quote, error: insertError } = await adminClient.from("print_quotes").insert({
      restaurant_id: restaurantId,
      print_export_id: exportId,
      provider_product_id: providerProduct.id,
      provider: "cloudprinter",
      quantity,
      country,
      state,
      provider_currency: providerQuote.currency,
      provider_product_amount: providerQuote.productPrice,
      provider_product_vat: providerQuote.productVat,
      provider_invoice_currency: selected.invoiceCurrency,
      provider_invoice_exchange_rate: selected.invoiceExchangeRate,
      provider_quote_snapshot: providerQuote.raw,
      selected_shipping_quote: selected.quote,
      selected_shipping_level: selected.shippingLevel,
      selected_shipping_option: selected.shippingOption,
      selected_shipping_amount: selected.price,
      selected_shipping_vat: selected.vat,
      customer_currency: retail.customerCurrency,
      customer_amount_cents: retail.customerAmountCents,
      margin_cents: retail.marginCents,
      margin_bps: retail.marginBps,
      expires_at: expiresAt.toISOString(),
    }).select("id, quantity, customer_currency, customer_amount_cents, expires_at").single();
    if (insertError) throw insertError;

    await writeAuditLog({
      adminClient,
      actor,
      request: req,
      functionName: "print-quote",
      action: "create_quote",
      status: "success",
      targetEntityType: "print_quotes",
      targetEntityId: quote.id,
      metadata: {
        restaurant_id: restaurantId,
        quantity,
        provider_option_count: providerOptions.length,
        customer_currency: retail.customerCurrency,
        customer_amount_cents: retail.customerAmountCents,
      },
    });

    return jsonResponse({
      quoteId: quote.id,
      quantity: quote.quantity,
      shipping: {
        quote: selected.quote,
        service: selected.service,
        shippingLevel: selected.shippingLevel,
        shippingOption: selected.shippingOption,
      },
      customerCurrency: quote.customer_currency,
      customerAmountCents: quote.customer_amount_cents,
      expiresAt: quote.expires_at,
    }, 201, cors);
  } catch (error) {
    const providerFailure = error instanceof CloudprinterError ? error : null;
    const providerStatus = providerFailure?.status ?? null;
    const status = providerFailure
      ? providerHttpStatus(providerFailure)
      : error instanceof HttpError
        ? error.status
        : 500;
    const message = error instanceof Error
      ? error.message.replace(/[\r\n\t]+/g, " ").replace(/\s{2,}/g, " ").trim().slice(0, 500)
      : "Erreur devis impression";
    await writeAuditLog({
      adminClient,
      actor,
      request: req,
      functionName: "print-quote",
      action: "quote",
      status: "failure",
      targetEntityType: "print_quotes",
      errorMessage: message,
      ...(providerFailure
        ? {
          metadata: {
            provider_error: {
              code: providerFailure.code,
              providerStatus,
              transportCode: providerFailure.transportCode,
              retryable: providerFailure.retryable,
            },
          },
        }
        : {}),
    });
    return jsonResponse({
      error: providerFailure || status < 500 ? message : "Erreur interne devis impression",
      ...(providerFailure
        ? {
          providerError: {
            code: providerFailure.code,
            providerStatus,
          },
        }
        : {}),
    }, status, cors);
  }
});
