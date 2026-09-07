import { HttpError } from "../auth.ts";
import type { PrintProvider } from "./provider.ts";
import {
  CloudprinterError,
  type CloudprinterRequestOptions,
  type CloudprinterTransportResponse,
  cloudprinterRequestBody,
  requestCloudprinter,
} from "./request.ts";
import type {
  PrintProviderCancelResult,
  PrintProviderCreateOrderRequest,
  PrintProviderCreateOrderResult,
  PrintProviderMode,
  PrintProviderOrderInfo,
  PrintProviderPrice,
  PrintProviderProductDetails,
  PrintProviderProductSummary,
  PrintProviderQuote,
  PrintProviderQuoteRequest,
  PrintProviderReorderRequest,
  PrintProviderShippingQuote,
} from "./types.ts";
import { validatePrintAddress, validatePrintProviderFile } from "./security.ts";

export { CloudprinterError } from "./request.ts";

const CLOUDPRINTER_API_BASE = "https://api.cloudprinter.com/cloudcore/1.0";
const REQUEST_TIMEOUT_MS = 20_000;
const MAX_PROVIDER_RESPONSE_BYTES = 5_000_000;

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function asString(value: unknown) {
  return typeof value === "string" ? value.trim() : value == null ? "" : String(value).trim();
}

function asNullableString(value: unknown) {
  return asString(value) || null;
}

function asNumber(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function asNullableNumber(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function getCloudprinterMode(): PrintProviderMode {
  const value = String(Deno.env.get("CLOUDPRINTER_MODE") || "disabled").trim().toLowerCase();
  if (value === "sandbox" || value === "live") return value;
  return "disabled";
}

function getCloudprinterApiKey() {
  // This exact server-only access is intentionally easy to grep in security tests.
  const key = Deno.env.get("CLOUDPRINTER_API_KEY")?.trim() || "";
  if (!key) throw new HttpError(503, "CLOUDPRINTER_NOT_CONFIGURED");
  if (getCloudprinterMode() === "disabled") throw new HttpError(503, "CLOUDPRINTER_DISABLED");
  return key;
}

/**
 * Standard `fetch` over HTTPS.
 *
 * The previous transport built a custom HTTP/1.1-only client through Deno's
 * unstable HTTP client factory, which the Supabase Edge runtime does not
 * expose. That call threw inside the guarded block and surfaced as an
 * indistinguishable "Cloudprinter unavailable", so no unstable runtime API
 * belongs on this path. Cloudprinter answers `fetch` over TLS 1.2 with ALPN
 * h2 negotiated normally.
 */
async function cloudprinterTransport(path: string, body: string): Promise<CloudprinterTransportResponse> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(`${CLOUDPRINTER_API_BASE}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body,
      signal: controller.signal,
    });
    const declaredLength = Number(response.headers.get("content-length") || 0);
    if (Number.isFinite(declaredLength) && declaredLength > MAX_PROVIDER_RESPONSE_BYTES) {
      throw Object.assign(new Error("Cloudprinter response too large"), { code: "ERR_RESPONSE_TOO_LARGE" });
    }
    const text = response.status === 204 ? "" : await response.text();
    if (text.length > MAX_PROVIDER_RESPONSE_BYTES) {
      throw Object.assign(new Error("Cloudprinter response too large"), { code: "ERR_RESPONSE_TOO_LARGE" });
    }
    return { status: response.status, text };
  } finally {
    clearTimeout(timeout);
  }
}

function postCloudprinter(
  path: string,
  payload: Record<string, unknown>,
  options: CloudprinterRequestOptions,
): Promise<unknown | null> {
  // Credentials are resolved BEFORE the retry loop on purpose. A missing key or
  // a disabled mode is a TheTok configuration fault, not a provider outage: it
  // must reach the caller as CLOUDPRINTER_NOT_CONFIGURED / CLOUDPRINTER_DISABLED
  // instead of being retried and logged as a network failure.
  const body = cloudprinterRequestBody(payload, getCloudprinterApiKey());
  return requestCloudprinter({ transport: cloudprinterTransport, path, body, options });
}

function specMap(rawSpecs: unknown) {
  const map = new Map<string, string>();
  for (const entry of asArray(rawSpecs)) {
    const spec = asRecord(entry);
    const note = asString(spec.note).toLowerCase();
    const value = asString(spec.value);
    if (note) map.set(note, value);
  }
  return map;
}

function specNumber(specs: Map<string, string>, note: string) {
  return asNullableNumber(specs.get(note.toLowerCase()));
}

function parseProductDetails(body: unknown, fallbackReference: string): PrintProviderProductDetails {
  const raw = asRecord(body);
  const reference = asString(raw.reference) || fallbackReference;
  if (!reference) throw new CloudprinterError({ code: "cloudprinter_product_invalid", message: "Invalid Cloudprinter product" });
  const specs = specMap(raw.specs);
  return {
    reference,
    name: asString(raw.name) || reference,
    description: asNullableString(raw.note),
    widthMm: specNumber(specs, "The exact width of the item in mm."),
    heightMm: specNumber(specs, "The exact height of the item in mm."),
    bleedMm: specNumber(specs, "Bleed in mm"),
    safeMarginMm: specNumber(specs, "The page safety margin in mm"),
    printableSides: specNumber(specs, "Number of printable sides"),
    orientation: asNullableString(specs.get("orientation of the product")),
    printTechnology: asNullableString(specs.get("print technology")),
    minimumQuantity: specNumber(specs, "Minimum order quantity"),
    quantityStep: specNumber(specs, "Per set order quantity"),
    options: asArray(raw.options).map(asRecord),
    specifications: Object.fromEntries(specs.entries()),
    raw,
  };
}

function quotePayload(request: PrintProviderQuoteRequest) {
  const country = String(request.country || "").trim().toUpperCase();
  const currency = String(request.currency || "").trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(country)) throw new HttpError(400, "Pays de devis invalide");
  if (!/^[A-Z]{3}$/.test(currency)) throw new HttpError(400, "Devise de devis invalide");
  if (!Array.isArray(request.items) || request.items.length === 0) throw new HttpError(400, "Article d’impression requis");
  return {
    country,
    ...(request.state ? { state: String(request.state).trim() } : {}),
    currency,
    items: request.items.map((item) => ({
      reference: String(item.reference).trim(),
      product: String(item.product).trim(),
      count: String(Math.max(1, Math.round(item.count))),
      ...(item.options?.length
        ? { options: item.options.map((option) => ({ type: String(option.type).trim(), count: String(option.count) })) }
        : {}),
    })),
  };
}

function parseQuote(body: unknown): PrintProviderQuote {
  const raw = asRecord(body);
  const invoiceCurrency = asNullableString(raw.invoice_currency);
  const invoiceExchangeRate = asNullableNumber(raw.invoice_exchange_rate);
  const shipping: PrintProviderShippingQuote[] = [];
  for (const shipmentValue of asArray(raw.shipments)) {
    const shipment = asRecord(shipmentValue);
    for (const quoteValue of asArray(shipment.quotes)) {
      const quote = asRecord(quoteValue);
      const quoteId = asString(quote.quote);
      if (!quoteId) continue;
      shipping.push({
        quote: quoteId,
        service: asNullableString(quote.service),
        shippingLevel: asNullableString(quote.shipping_level),
        shippingOption: asNullableString(quote.shipping_option),
        price: asNumber(quote.price),
        vat: asNumber(quote.vat),
        currency: asString(quote.currency).toUpperCase(),
        invoiceCurrency,
        invoiceExchangeRate,
        raw: quote,
      });
    }
  }
  return {
    // Cloudprinter documents both product `price` and shipping quote `price` as
    // VAT-inclusive; `vat` is the included VAT part and must not be added again.
    productPrice: asNumber(raw.price),
    productVat: asNumber(raw.vat),
    currency: asString(raw.currency).toUpperCase(),
    expiresAt: asNullableString(raw.expire_date),
    shipping,
    raw,
  };
}

function normalizeCreateOrder(request: PrintProviderCreateOrderRequest) {
  const reference = String(request.reference || "").trim();
  const email = String(request.email || "").trim().toLowerCase();
  if (!reference || reference.length > 120) throw new HttpError(400, "Référence d’impression invalide");
  if (!email.includes("@") || email.length > 254) throw new HttpError(400, "Email de support impression invalide");
  const address = validatePrintAddress(request.address);
  if (!Array.isArray(request.items) || request.items.length === 0) throw new HttpError(400, "Article d’impression requis");

  return {
    reference,
    email,
    addresses: [{ type: "delivery", ...address }],
    items: request.items.map((item) => {
      const files = item.files.map(validatePrintProviderFile);
      if (files.length === 0) throw new HttpError(400, "Fichier d’impression requis");
      return {
        reference: String(item.reference || "").trim(),
        product: String(item.product || "").trim(),
        count: String(Math.max(1, Math.round(item.count))),
        ...(item.quote ? { quote: String(item.quote).trim() } : {}),
        ...(!item.quote && item.shipping_level ? { shipping_level: String(item.shipping_level).trim() } : {}),
        ...(item.options?.length
          ? { options: item.options.map((option) => ({ type: String(option.type).trim(), count: String(option.count) })) }
          : {}),
        files,
        ...(item.reorder_cause ? { reorder_cause: item.reorder_cause } : {}),
        ...(item.reorder_desc ? { reorder_desc: item.reorder_desc } : {}),
        ...(item.reorder_order_reference ? { reorder_order_reference: item.reorder_order_reference } : {}),
        ...(item.reorder_item_reference ? { reorder_item_reference: item.reorder_item_reference } : {}),
      };
    }),
  };
}

export class CloudprinterProvider implements PrintProvider {
  async getProducts(): Promise<PrintProviderProductSummary[]> {
    const body = await postCloudprinter("/products", {}, { expected: [200], safeRetry: true });
    return asArray(body).map((entry) => {
      const raw = asRecord(entry);
      const reference = asString(raw.reference);
      return {
        reference,
        name: asString(raw.name) || reference,
        description: asNullableString(raw.note),
        raw,
      };
    }).filter((product) => Boolean(product.reference));
  }

  async getProduct(reference: string): Promise<PrintProviderProductDetails> {
    const normalized = String(reference || "").trim();
    if (!normalized) throw new HttpError(400, "Référence produit requise");
    const body = await postCloudprinter("/products/info", { reference: normalized }, {
      expected: [200],
      notFound: [204, 410],
      safeRetry: true,
    });
    if (!body) throw new HttpError(404, "Produit Cloudprinter introuvable");
    return parseProductDetails(body, normalized);
  }

  async getPrice(request: PrintProviderQuoteRequest): Promise<PrintProviderPrice> {
    const body = await postCloudprinter("/prices/lookup", quotePayload(request), { expected: [200], safeRetry: true });
    const raw = asRecord(body);
    return {
      amount: asNumber(raw.price),
      vat: asNumber(raw.vat),
      currency: asString(raw.currency).toUpperCase(),
      raw,
    };
  }

  async getQuote(request: PrintProviderQuoteRequest): Promise<PrintProviderQuote> {
    const body = await postCloudprinter("/orders/quote", quotePayload(request), { expected: [200], safeRetry: true });
    return parseQuote(body);
  }

  async createOrder(request: PrintProviderCreateOrderRequest): Promise<PrintProviderCreateOrderResult> {
    const normalized = normalizeCreateOrder(request);
    // Deliberately no automatic retry: after a timeout/5xx the caller MUST run
    // getOrder(reference) before another /orders/add to prevent duplicate prints.
    const body = await postCloudprinter("/orders/add", normalized, {
      expected: [200, 201],
      safeRetry: false,
      ambiguousOnFailure: true,
    });
    return { accepted: true, reference: request.reference, raw: asRecord(body) };
  }

  async getOrder(reference: string): Promise<PrintProviderOrderInfo | null> {
    const normalized = String(reference || "").trim();
    if (!normalized) throw new HttpError(400, "Référence commande requise");
    const body = await postCloudprinter("/orders/info", { reference: normalized }, {
      expected: [200],
      notFound: [204, 410],
      safeRetry: true,
    });
    if (!body) return null;
    const raw = asRecord(body);
    return {
      reference: asString(raw.reference) || normalized,
      state: asNullableString(raw.state),
      stateCode: asNullableString(raw.state_code),
      items: asArray(raw.items).map((entry) => {
        const item = asRecord(entry);
        return {
          reference: asNullableString(item.reference),
          product: asNullableString(item.name || item.product),
          count: asNullableNumber(item.count),
          shippingOption: asNullableString(item.shipping_option),
          tracking: asNullableString(item.tracking),
          raw: item,
        };
      }),
      raw,
    };
  }

  async cancelOrder(reference: string): Promise<PrintProviderCancelResult> {
    const normalized = String(reference || "").trim();
    if (!normalized) throw new HttpError(400, "Référence commande requise");
    const body = await postCloudprinter("/orders/cancel", { reference: normalized }, {
      expected: [200],
      notFound: [410],
      safeRetry: false,
    });
    return { accepted: body !== null, reference: normalized, raw: asRecord(body) };
  }

  async reorder(request: PrintProviderReorderRequest): Promise<PrintProviderCreateOrderResult> {
    const hasReorderLink = request.items.every((item) =>
      Boolean(item.reorder_order_reference && item.reorder_item_reference && item.reorder_cause)
    );
    if (!hasReorderLink) throw new HttpError(400, "Référence de réimpression incomplète");
    return this.createOrder(request);
  }
}

export function getPrintProvider(): PrintProvider {
  return new CloudprinterProvider();
}
