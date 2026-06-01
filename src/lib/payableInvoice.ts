import { format } from "date-fns";
import { fr } from "date-fns/locale";

import type { Database, Json } from "@/integrations/supabase/types";

export type RestaurantInvoiceRowBase = Database["public"]["Tables"]["restaurant_invoices"]["Row"];
export type RestaurantRowBase = Database["public"]["Tables"]["restaurants"]["Row"];
export type RestaurantInvoiceSettingsRow = Database["public"]["Tables"]["restaurant_invoice_settings"]["Row"];

export type PayableInvoiceType = "payable" | "reservation_fees";
export type PayableInvoiceStatus = "draft" | "issued" | "pending" | "overdue" | "paid";
export type PayableInvoiceItemKind =
  | "order_commission"
  | "reservation_commission"
  | "reservation_fee"
  | "campaign_payment"
  | "manual_adjustment";

export type PayableInvoiceRow = Pick<
  RestaurantInvoiceRowBase,
  | "id"
  | "restaurant_id"
  | "invoice_number"
  | "period_start"
  | "period_end"
  | "amount_ht"
  | "amount_tva"
  | "amount_ttc"
  | "status"
  | "due_at"
  | "paid_at"
  | "created_at"
  | "pdf_url"
  | "invoice_type"
> & {
  invoice_type: PayableInvoiceType;
  restaurants?: { name: string | null } | null;
};

export type PayableInvoiceLine = {
  lineId: string;
  itemKind: PayableInvoiceItemKind;
  sourceTable: string | null;
  sourceId: string | null;
  sourceLabel: string | null;
  occurredAt: string;
  quantity: number;
  unitAmount: number;
  baseAmount: number;
  rateLabel: string | null;
  rateValue: number | null;
  amountHt: number;
  amountTva: number;
  amountTtc: number;
  metadata: Json;
};

export type PayableInvoiceRecipient = {
  name: string;
  addressLine1: string | null;
  addressLine2: string | null;
  country: string | null;
  vatNumber: string | null;
  email: string | null;
  phone: string | null;
};

export type PayableInvoiceGroupSummary = {
  kind: PayableInvoiceItemKind;
  title: string;
  subtitle: string;
  detailLabel: string;
  quantityLabel: string;
  baseLabel: string;
  commissionLabel: string;
  footerLabel: string;
  countValue: number;
  quantity: number;
  unitAmount: number;
  baseAmount: number;
  amountTtc: number;
  sortOrder: number;
};

export type PayableInvoiceDocumentData = {
  invoice: PayableInvoiceRow;
  sender: PayableInvoiceRecipient & { website: string };
  recipient: PayableInvoiceRecipient;
  logoUrl: string;
  periodLabel: string;
  createdAtLabel: string;
  dueAtLabel: string;
  statusLabel: string;
  statusToneClassName: string;
  groups: PayableInvoiceGroupSummary[];
  totalHt: number;
  totalTva: number;
  totalTtc: number;
  paymentMessage: string;
  footerMessage: string;
};

const TOK_SENDER: PayableInvoiceRecipient & { website: string } = {
  name: "Newdogs Sarl",
  addressLine1: "Rue Moillebeau 59",
  addressLine2: "1209 Genève",
  country: "Suisse",
  vatNumber: "CHE-123.456.789",
  email: "facturation@tok.app",
  phone: "+41 22 123 45 67",
  website: "www.tok.app",
};

const GROUP_META: Record<
  PayableInvoiceItemKind,
  {
    sortOrder: number;
    title: string;
    subtitle: string;
    detailLabel: string;
    quantityUnit: string;
    footerLabel: string;
  }
> = {
  order_commission: {
    sortOrder: 10,
    title: "Commandes",
    subtitle: "TOK percoit 10%",
    detailLabel: "Montant total des commandes via TOK",
    quantityUnit: "commande",
    footerLabel: "Commission TOK (10%)",
  },
  reservation_commission: {
    sortOrder: 20,
    title: "Reservations payantes",
    subtitle: "TOK percoit 10%",
    detailLabel: "Montant des réservations payantes via TOK",
    quantityUnit: "reservation",
    footerLabel: "Commission TOK (10%)",
  },
  reservation_fee: {
    sortOrder: 30,
    title: "Reservations",
    subtitle: "TOK percoit un forfait par réservation",
    detailLabel: "Reservations effectuees via TOK",
    quantityUnit: "reservation",
    footerLabel: "Frais TOK",
  },
  campaign_payment: {
    sortOrder: 40,
    title: "Campagnes",
    subtitle: "Montants factures hors marketplace",
    detailLabel: "Campagnes publicitaires facturees",
    quantityUnit: "campagne",
    footerLabel: "Montant facturé",
  },
  manual_adjustment: {
    sortOrder: 50,
    title: "Ajustements",
    subtitle: "Regularisation manuelle",
    detailLabel: "Ajustements et regularisations",
    quantityUnit: "ligne",
    footerLabel: "Montant ajuste",
  },
};

export function toPayableAmount(value: number | string | null | undefined) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function isPayableInvoiceType(value: string | null | undefined): value is PayableInvoiceType {
  return value === "payable" || value === "reservation_fees";
}

export function formatPayableAmount(value: number | string | null | undefined, currency = "CHF") {
  return `${new Intl.NumberFormat("fr-CH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(toPayableAmount(value))} ${currency}`;
}

export function formatPayableDate(value: string | null | undefined) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return format(date, "dd MMMM yyyy", { locale: fr });
}

export function formatPayablePeriod(start: string, end: string) {
  return `${formatPayableDate(start)} - ${formatPayableDate(end)}`;
}

export function getPayableInvoiceStatusLabel(status: string | null | undefined) {
  const normalized = String(status || "").trim().toLowerCase();

  if (normalized === "paid") return "Payee";
  if (normalized === "overdue") return "En retard";
  if (normalized === "draft") return "Brouillon";
  if (normalized === "issued") return "Emise";

  return "En attente";
}

export function getPayableInvoiceStatusClass(status: string | null | undefined) {
  const normalized = String(status || "").trim().toLowerCase();

  if (normalized === "paid") {
    return "bg-emerald-100 text-emerald-700";
  }

  if (normalized === "overdue") {
    return "bg-red-100 text-red-700";
  }

  if (normalized === "draft") {
    return "bg-slate-100 text-slate-700";
  }

  return "bg-amber-100 text-amber-700";
}

export function getPayableInvoiceGroupMeta(kind: PayableInvoiceItemKind) {
  return GROUP_META[kind];
}

function formatQuantityLabel(quantity: number, unit: string) {
  const rounded = Math.round(quantity);
  const safeQuantity = Number.isFinite(quantity) ? quantity : 0;
  const displayQuantity = Math.abs(safeQuantity - rounded) < 0.001 ? rounded : safeQuantity;
  return `${displayQuantity} ${unit}${displayQuantity > 1 ? "s" : ""}`;
}

function formatBaseLabel(group: {
  kind: PayableInvoiceItemKind;
  quantity: number;
  unitAmount: number;
  baseAmount: number;
  amountTtc: number;
  rateLabel: string | null;
}) {
  if (group.kind === "reservation_fee" && group.quantity > 0 && group.unitAmount > 0) {
    return `${Math.round(group.quantity)} x ${formatPayableAmount(group.unitAmount)}`;
  }

  if (group.kind === "campaign_payment") {
    return formatPayableAmount(group.amountTtc);
  }

  return formatPayableAmount(group.baseAmount);
}

export function buildPayableInvoiceGroups(lines: readonly PayableInvoiceLine[]) {
  const groups = new Map<PayableInvoiceItemKind, {
    kind: PayableInvoiceItemKind;
    quantity: number;
    unitAmount: number;
    baseAmount: number;
    amountTtc: number;
    rateLabel: string | null;
  }>();

  lines.forEach((line) => {
    const current = groups.get(line.itemKind) || {
      kind: line.itemKind,
      quantity: 0,
      unitAmount: 0,
      baseAmount: 0,
      amountTtc: 0,
      rateLabel: null,
    };

    current.quantity += toPayableAmount(line.quantity) || 1;
    current.unitAmount = current.unitAmount || toPayableAmount(line.unitAmount);
    current.baseAmount += toPayableAmount(line.baseAmount);
    current.amountTtc += toPayableAmount(line.amountTtc);
    current.rateLabel = current.rateLabel || line.rateLabel;

    groups.set(line.itemKind, current);
  });

  return Array.from(groups.values())
    .map((group) => {
      const meta = getPayableInvoiceGroupMeta(group.kind);
      const countValue = Math.round(group.quantity);
      const quantityLabel = formatQuantityLabel(group.quantity, meta.quantityUnit);
      const rateLabel = group.rateLabel
        || (group.kind === "campaign_payment" ? "Montant paye" : group.kind === "manual_adjustment" ? "Ajustement" : "10%");

      return {
        kind: group.kind,
        title: meta.title,
        subtitle: meta.subtitle,
        detailLabel: meta.detailLabel,
        quantityLabel,
        baseLabel: formatBaseLabel(group),
        commissionLabel: rateLabel,
        footerLabel: meta.footerLabel,
        countValue,
        quantity: group.quantity,
        unitAmount: group.unitAmount,
        baseAmount: group.baseAmount,
        amountTtc: group.amountTtc,
        sortOrder: meta.sortOrder,
      } satisfies PayableInvoiceGroupSummary;
    })
    .sort((left, right) => left.sortOrder - right.sortOrder);
}

export function buildPayableInvoiceRecipient(
  restaurant: Pick<RestaurantRowBase, "name" | "legal_name" | "address" | "city" | "phone">,
  settings: Pick<
    RestaurantInvoiceSettingsRow,
    | "company_name"
    | "company_address"
    | "company_postal_code"
    | "company_city"
    | "company_country"
    | "vat_number"
    | "siret"
    | "email"
    | "phone"
  > | null,
) {
  const companyName = settings?.company_name || restaurant.legal_name || restaurant.name;
  const addressLine1 = settings?.company_address || restaurant.address || null;
  const addressLine2 = [settings?.company_postal_code, settings?.company_city || restaurant.city]
    .filter((part): part is string => !!part)
    .join(" ")
    || null;

  return {
    name: companyName,
    addressLine1,
    addressLine2,
    country: settings?.company_country || "Suisse",
    vatNumber: settings?.vat_number || settings?.siret || null,
    email: settings?.email || null,
    phone: settings?.phone || restaurant.phone || null,
  } satisfies PayableInvoiceRecipient;
}

export function buildPayableInvoiceDocumentData(input: {
  invoice: PayableInvoiceRow;
  lines: readonly PayableInvoiceLine[];
  restaurant: Pick<RestaurantRowBase, "name" | "legal_name" | "address" | "city" | "phone">;
  settings: Pick<
    RestaurantInvoiceSettingsRow,
    | "company_name"
    | "company_address"
    | "company_postal_code"
    | "company_city"
    | "company_country"
    | "vat_number"
    | "siret"
    | "email"
    | "phone"
  > | null;
}) {
  const statusLabel = getPayableInvoiceStatusLabel(input.invoice.status);
  const recipient = buildPayableInvoiceRecipient(input.restaurant, input.settings);
  const groups = buildPayableInvoiceGroups(input.lines);
  const totalTtc = toPayableAmount(input.invoice.amount_ttc);

  return {
    invoice: input.invoice,
    sender: TOK_SENDER,
    recipient,
    logoUrl: "/logo377.png",
    periodLabel: formatPayablePeriod(input.invoice.period_start, input.invoice.period_end),
    createdAtLabel: formatPayableDate(input.invoice.created_at),
    dueAtLabel: formatPayableDate(input.invoice.due_at),
    statusLabel,
    statusToneClassName: getPayableInvoiceStatusClass(input.invoice.status),
    groups,
    totalHt: toPayableAmount(input.invoice.amount_ht),
    totalTva: toPayableAmount(input.invoice.amount_tva),
    totalTtc,
    paymentMessage: statusLabel === "Payee"
      ? `Le montant de ${formatPayableAmount(totalTtc)} a déjà été regle. Aucune action n'est requise.`
      : `Le montant de ${formatPayableAmount(totalTtc)} doit être regle avant le ${formatPayableDate(input.invoice.due_at)}.`,
    footerMessage: "Merci d'utiliser TOK !",
  } satisfies PayableInvoiceDocumentData;
}
