import { invokeSupabaseFunction } from "@/lib/session";
import type { MarketingPrintDocument, PrintProductSpec } from "./document";

export type PrintCatalogProduct = {
  id: string;
  slug: string;
  displayName: string;
  category: string;
  description: string | null;
  variants: PrintProductSpec[];
};

export type PrintExportResult = {
  exportId: string;
  status: "ready" | "approved";
  preflight: Record<string, unknown>;
  previewUrl: string | null;
};

export type PrintQuoteResult = {
  quoteId: string;
  quantity: number;
  shipping: {
    quote: string;
    service: string | null;
    shippingLevel: string | null;
    shippingOption: string | null;
  };
  customerCurrency: "CHF";
  customerAmountCents: number;
  expiresAt: string;
};

export type PrintOrderSummary = {
  id: string;
  status: string;
  payment_status: string;
  customer_currency: string;
  customer_amount_cents: number;
  quantity: number;
  provider_reference: string | null;
  tracking_code: string | null;
  tracking_url: string | null;
  carrier: string | null;
  created_at: string;
  updated_at: string;
};

async function invokePrint<T>(name: string, body: unknown): Promise<T> {
  const { data, error } = await invokeSupabaseFunction<T>(name, { body });
  if (error) throw error;
  if (!data) throw new Error("Réponse impression indisponible.");
  return data;
}

export async function getPrintCatalog(restaurantId: string) {
  return invokePrint<{ products: PrintCatalogProduct[] }>("print-catalog", {
    action: "list",
    restaurantId,
  });
}

export async function createPrintExport(input: {
  restaurantId: string;
  providerProductId: string;
  document: MarketingPrintDocument;
}) {
  return invokePrint<PrintExportResult>("print-export", { action: "create", ...input });
}

export async function approvePrintExport(input: { restaurantId: string; exportId: string }) {
  return invokePrint<PrintExportResult>("print-export", { action: "approve", ...input });
}

export async function createPrintQuote(input: {
  restaurantId: string;
  exportId: string;
  quantity: number;
  shippingQuote?: string | null;
  country?: string;
  state?: string | null;
}) {
  return invokePrint<PrintQuoteResult>("print-quote", {
    country: "CH",
    ...input,
  });
}

export async function listPrintOrders(input: { restaurantId: string; page?: number; pageSize?: number }) {
  return invokePrint<{ orders: PrintOrderSummary[]; pagination: { page: number; pageSize: number; hasMore: boolean } }>(
    "print-order-action",
    { action: "list", ...input },
  );
}

export async function getPrintOrder(input: { restaurantId: string; orderId: string }) {
  return invokePrint<{ order: PrintOrderSummary; events: Array<Record<string, unknown>> }>(
    "print-order-action",
    { action: "get", ...input },
  );
}

export async function requestPrintCancellation(input: { restaurantId: string; orderId: string }) {
  return invokePrint<{ ok: boolean; status: string }>("print-order-action", { action: "cancel", ...input });
}

export async function requestPrintReorder(input: {
  restaurantId: string;
  orderId: string;
  reason: string;
  description?: string;
}) {
  return invokePrint<{ ok: boolean; status: string }>("print-order-action", { action: "reorder", ...input });
}
