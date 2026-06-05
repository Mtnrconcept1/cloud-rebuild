type RpcError = {
  message?: string;
};

type RpcResult<T = unknown> = {
  data: T | null;
  error: RpcError | null;
};

export type AdminComptaRpcClient = {
  rpc: <T = unknown>(fn: string, args?: Record<string, unknown>) => Promise<RpcResult<T>>;
};

export function getAdminComptaActionErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (error && typeof error === "object" && "message" in error) {
    return String((error as { message?: unknown }).message || "");
  }
  return error ? String(error) : "";
}

function throwRpcError(error: RpcError | null, fallback: string): asserts error is null {
  if (!error) return;
  throw new Error(error.message || fallback);
}

export function normalizeGeneratedInvoiceCount(data: unknown, restaurantScoped: boolean) {
  if (restaurantScoped) {
    return data ? 1 : 0;
  }

  const generated = Number(data ?? 0);
  return Number.isFinite(generated) ? generated : 0;
}

export async function generateAdminTokPayableInvoices(
  client: AdminComptaRpcClient,
  input: {
    restaurantId: string;
    selectedMonth: string;
  },
) {
  const restaurantScoped = input.restaurantId !== "all";
  const firstOfMonth = `${input.selectedMonth}-01`;
  const rpcName = restaurantScoped
    ? "admin_generate_tok_payable_invoice"
    : "admin_generate_tok_payable_invoices_all";
  const rpcArgs = restaurantScoped
    ? { p_restaurant_id: input.restaurantId, p_month: firstOfMonth }
    : { p_month: firstOfMonth };

  const { data, error } = await client.rpc(rpcName, rpcArgs);
  throwRpcError(error, "Impossible de générer les factures TOK.");

  return normalizeGeneratedInvoiceCount(data, restaurantScoped);
}

export async function markAdminRestaurantInvoicePaid(
  client: AdminComptaRpcClient,
  input: {
    invoiceId: string;
    reference: string;
    paidAt?: string;
  },
) {
  const { data, error } = await client.rpc("admin_mark_restaurant_invoice_paid", {
    p_invoice_id: input.invoiceId,
    p_paid_at: input.paidAt || new Date().toISOString(),
    p_reference: input.reference,
  });

  throwRpcError(error, "Impossible de marquer la facture comme payée.");
  return data;
}
