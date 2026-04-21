type InvoiceLike = {
  status?: string | null;
};

export function isInvoicePaid(status: string | null | undefined) {
  return String(status || "").trim().toLowerCase() === "paid";
}

export function splitInvoicesByPaymentState<T extends InvoiceLike>(invoices: readonly T[]) {
  return invoices.reduce(
    (acc, invoice) => {
      if (isInvoicePaid(invoice.status)) {
        acc.history.push(invoice);
      } else {
        acc.actionable.push(invoice);
      }

      return acc;
    },
    { actionable: [] as T[], history: [] as T[] },
  );
}
