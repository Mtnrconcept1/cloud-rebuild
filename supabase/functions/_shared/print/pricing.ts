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
 * Cloudprinter documents the root product `price` and shipping quote `price`
 * as VAT-inclusive. The accompanying `vat` values are the VAT part already
 * contained in those prices and are persisted for accounting only; they MUST
 * NOT be added again to the provider cost.
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
  const shippingCents = toMoneyCents(input.providerShippingAmount);
  // Validate VAT fields even though they are informational/included in price.
  toMoneyCents(input.providerProductVat);
  toMoneyCents(input.providerShippingVat);
  const providerCostCents = productCents + shippingCents;

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
