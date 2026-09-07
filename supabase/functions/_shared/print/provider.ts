import type {
  PrintProviderCancelResult,
  PrintProviderCreateOrderRequest,
  PrintProviderCreateOrderResult,
  PrintProviderOrderInfo,
  PrintProviderPrice,
  PrintProviderProductDetails,
  PrintProviderProductSummary,
  PrintProviderQuote,
  PrintProviderQuoteRequest,
  PrintProviderReorderRequest,
} from "./types.ts";

export interface PrintProvider {
  getProducts(): Promise<PrintProviderProductSummary[]>;
  getProduct(reference: string): Promise<PrintProviderProductDetails>;
  getPrice(request: PrintProviderQuoteRequest): Promise<PrintProviderPrice>;
  getQuote(request: PrintProviderQuoteRequest): Promise<PrintProviderQuote>;
  createOrder(request: PrintProviderCreateOrderRequest): Promise<PrintProviderCreateOrderResult>;
  getOrder(reference: string): Promise<PrintProviderOrderInfo | null>;
  cancelOrder(reference: string): Promise<PrintProviderCancelResult>;
  reorder(request: PrintProviderReorderRequest): Promise<PrintProviderCreateOrderResult>;
}
