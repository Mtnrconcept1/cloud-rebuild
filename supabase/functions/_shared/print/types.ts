export type PrintProviderName = "cloudprinter";
export type PrintProviderMode = "disabled" | "sandbox" | "live";

export type PrintProviderProductSummary = {
  reference: string;
  name: string;
  description?: string | null;
  raw: Record<string, unknown>;
};

export type PrintProviderProductDetails = PrintProviderProductSummary & {
  widthMm: number | null;
  heightMm: number | null;
  bleedMm: number | null;
  safeMarginMm: number | null;
  printableSides: number | null;
  orientation: string | null;
  printTechnology: string | null;
  minimumQuantity: number | null;
  quantityStep: number | null;
  options: Array<Record<string, unknown>>;
  specifications: Record<string, unknown>;
};

export type PrintAddress = {
  company?: string | null;
  firstname: string;
  lastname: string;
  street1: string;
  street2?: string | null;
  zip: string;
  city: string;
  state?: string | null;
  country: string;
  phone?: string | null;
};

export type PrintProviderFile = {
  type: "product" | "cover" | "book";
  url: string;
  md5sum: string;
};

export type PrintProviderOption = {
  type: string;
  count: number | string;
};

export type PrintProviderQuoteItem = {
  reference: string;
  product: string;
  count: number;
  options?: PrintProviderOption[];
};

export type PrintProviderQuoteRequest = {
  country: string;
  state?: string | null;
  currency: string;
  items: PrintProviderQuoteItem[];
};

export type PrintProviderShippingQuote = {
  quote: string;
  service: string | null;
  shippingLevel: string | null;
  shippingOption: string | null;
  price: number;
  vat: number;
  currency: string;
  invoiceCurrency: string | null;
  invoiceExchangeRate: number | null;
  raw: Record<string, unknown>;
};

export type PrintProviderQuote = {
  productPrice: number;
  productVat: number;
  currency: string;
  expiresAt: string | null;
  shipping: PrintProviderShippingQuote[];
  raw: Record<string, unknown>;
};

export type PrintProviderPrice = {
  amount: number;
  vat: number;
  currency: string;
  raw: Record<string, unknown>;
};

export type PrintProviderCreateOrderItem = {
  reference: string;
  product: string;
  count: number;
  quote?: string | null;
  shipping_level?: string | null;
  options?: PrintProviderOption[];
  files: PrintProviderFile[];
  reorder_cause?: string | null;
  reorder_desc?: string | null;
  reorder_order_reference?: string | null;
  reorder_item_reference?: string | null;
};

export type PrintProviderCreateOrderRequest = {
  reference: string;
  email: string;
  address: PrintAddress;
  items: PrintProviderCreateOrderItem[];
};

export type PrintProviderCreateOrderResult = {
  accepted: boolean;
  reference: string;
  raw: Record<string, unknown>;
};

export type PrintProviderOrderItemInfo = {
  reference: string | null;
  product: string | null;
  count: number | null;
  shippingOption: string | null;
  tracking: string | null;
  raw: Record<string, unknown>;
};

export type PrintProviderOrderInfo = {
  reference: string;
  state: string | null;
  stateCode: string | null;
  items: PrintProviderOrderItemInfo[];
  raw: Record<string, unknown>;
};

export type PrintProviderCancelResult = {
  accepted: boolean;
  reference: string;
  raw: Record<string, unknown>;
};

export type PrintProviderReorderRequest = PrintProviderCreateOrderRequest;

export type PrintRetailPricingInput = {
  providerProductAmount: number;
  providerProductVat: number;
  providerShippingAmount: number;
  providerShippingVat: number;
  providerCurrency: string;
  marginBps: number;
  minimumMarginCents: number;
  roundingIncrementCents: number;
};

export type PrintRetailPricing = {
  providerCurrency: string;
  providerCostCents: number;
  customerCurrency: "CHF";
  customerAmountCents: number;
  marginCents: number;
  marginBps: number;
};
