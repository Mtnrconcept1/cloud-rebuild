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
        // Reserved subscriptions have not started; drafts, void and cancelled
        // invoices are not amounts currently owed by the restaurant.
        const status = String(invoice.status || "").trim().toLowerCase();
        if (!["reserved", "draft", "cancelled", "canceled", "void", "refunded"].includes(status)) {
          acc.actionable.push(invoice);
        }
      }

      return acc;
    },
    { actionable: [] as T[], history: [] as T[] },
  );
}
