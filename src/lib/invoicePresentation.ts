export function getInvoiceStatusLabel(status: string | null | undefined) {
  switch (String(status || "").trim().toLowerCase()) {
    case "paid":
      return "Payée";
    case "overdue":
      return "En retard";
    case "draft":
      return "Brouillon";
    case "cancelled":
    case "canceled":
      return "Annulée";
    case "pending":
    case "open":
      return "À régler";
    default:
      return "À traiter";
  }
}
