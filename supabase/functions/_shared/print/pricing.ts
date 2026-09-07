import { HttpError } from "../auth.ts";
import type { PrintRetailPricing, PrintRetailPricingInput } from "./types.ts";

function toMoneyCents(value: number) {
  if (!Number.isFinite(value) || value < 0) throw new HttpError(502, "PRINT_PROVIDER_PRICE_INVALID");
  return Math.round(value * 100);
}

function roundUp(value: number, increment: number) {
  const safeIncrement = Math.max(1, Math.round(increment));
  return Math.ceil(value / safeIncrement) * safeIncrement;
}

/**
 * Cloudprinter `/orders/quote` returns the root product `price` excluding VAT
 * and shipping, with product `vat` shown separately. Each shipping quote
 * `price` already includes its VAT and exposes the `vat` part for accounting.
 * Therefore provider cost is: product price + product VAT + shipping price.
 * Shipping VAT must never be added a second time.
 *
 * The first TheTok launch is CHF-only. We request CHF from Cloudprinter and
 * reject a quote returned in another currency rather than inventing an FX rate.
 */
export function calculatePrintRetailPrice(input: PrintRetailPricingInput): PrintRetailPricing {
  const providerCurrency = String(input.providerCurrency || "").trim().toUpperCase();
  if (providerCurrency !== "CHF") {
    throw new HttpError(409, "PRINT_QUOTE_CURRENCY_UNSUPPORTED");
  }

  const productCents = toMoneyCents(input.providerProductAmount);
  const productVatCents = toMoneyCents(input.providerProductVat);
  const shippingCents = toMoneyCents(input.providerShippingAmount);
  // Validate for accounting consistency; already included in shippingCents.
  toMoneyCents(input.providerShippingVat);
  const providerCostCents = productCents + productVatCents + shippingCents;

  const marginBps = Math.max(0, Math.min(50_000, Math.round(input.marginBps)));
  const percentageMargin = Math.ceil(providerCostCents * marginBps / 10_000);
  const marginCents = Math.max(Math.max(0, Math.round(input.minimumMarginCents)), percentageMargin);
  const customerAmountCents = roundUp(
    providerCostCents + marginCents,
    input.roundingIncrementCents,
  );

  return {
    providerCurrency,
    providerCostCents,
    customerCurrency: "CHF",
    customerAmountCents,
    marginCents: customerAmountCents - providerCostCents,
    marginBps,
  };
}
