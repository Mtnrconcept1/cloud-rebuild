import {
  classifyOrderCommissionSource,
  classifyReservationCommissionSource,
  COMMISSION_SOURCE_LABELS,
  getNetOrderCommissionBase,
  getNetReservationCommissionBase,
  getTokCoveredMiamzAmount,
} from "@/lib/comptaCommissionSources";
import { calculateRestaurantShare, calculateTokCommission } from "@/lib/comptaFlow";

export type AccountingExportPerspective = "admin" | "restaurant";

export type AccountingPeriodPreset =
  | "current_month"
  | "previous_month"
  | "current_quarter"
  | "current_year"
  | "since_registration";

export type AccountingPeriodRange = {
  preset: AccountingPeriodPreset;
  label: string;
  startDate: string | null;
  endDate: string;
};

export type AccountingStatementKind = "balance_sheet" | "income_statement" | "journal";

export type AccountingStatementClass = "income" | "expense" | "asset" | "liability" | "memo";

export type AccountingExportEntry = {
  date: string;
  direction: "inflow" | "outflow";
  category: string;
  label: string;
  restaurantName: string;
  reference: string;
  amount: number;
  status: string;
  source: string;
  statementClass: AccountingStatementClass;
};

type RestaurantRelation = { name?: string | null } | null | undefined;

type AccountingOrderSource = {
  id: string;
  created_at: string | null;
  total_amount?: number | string | null;
  payment_status?: string | null;
  refunded_amount_chf?: number | string | null;
  refund_status?: string | null;
  refunded_at?: string | null;
  status?: string | null;
  order_number?: string | null;
  metadata?: Record<string, unknown> | null;
  restaurant_id?: string | null;
  restaurants?: RestaurantRelation;
};

type AccountingReservationSource = {
  id: string;
  created_at: string | null;
  date?: string | null;
  feature?: string | null;
  metadata?: Record<string, unknown> | null;
  total_amount?: number | string | null;
  refunded_amount_chf?: number | string | null;
  refund_status?: string | null;
  refunded_at?: string | null;
  status?: string | null;
  restaurant_id?: string | null;
  restaurants?: RestaurantRelation;
};

type AccountingReservationFeeSource = {
  id: string;
  restaurant_id?: string | null;
  confirmed_at: string | null;
  billing_fee_chf?: number | string | null;
  cancelled_by?: string | null;
  reservation_fee_invoice_id?: string | null;
  restaurants?: RestaurantRelation;
};

type AccountingCampaignSource = {
  id: string;
  restaurant_id?: string | null;
  created_at: string | null;
  payment_status?: string | null;
  paid_amount?: number | string | null;
  total_budget?: number | string | null;
  title?: string | null;
  restaurants?: RestaurantRelation;
};

type AccountingInvoiceSource = {
  id: string;
  restaurant_id?: string | null;
  invoice_number?: string | null;
  period_start?: string | null;
  period_end?: string | null;
  amount_ttc?: number | string | null;
  status?: string | null;
  created_at?: string | null;
  invoice_type?: "payout" | "reservation_fees" | "payable" | string | null;
  restaurants?: RestaurantRelation;
};

type AccountingTokOnePaymentSource = {
  id: string;
  created_at: string | null;
  amount?: number | string | null;
  status?: string | null;
  type?: string | null;
  metadata?: unknown;
};

export type AccountingExportSources = {
  orders?: readonly AccountingOrderSource[];
  reservations?: readonly AccountingReservationSource[];
  reservationFees?: readonly AccountingReservationFeeSource[];
  paidCampaigns?: readonly AccountingCampaignSource[];
  invoices?: readonly AccountingInvoiceSource[];
  tokOnePayments?: readonly AccountingTokOnePaymentSource[];
};

export type AccountingStatementSummary = {
  incomeTotal: number;
  expenseTotal: number;
  resultTotal: number;
  openReceivableTotal: number;
  openPayableTotal: number;
  balanceNetTotal: number;
};

const PERIOD_LABELS: Record<AccountingPeriodPreset, string> = {
  current_month: "Mois courant",
  previous_month: "Mois précédent",
  current_quarter: "Trimestre courant",
  current_year: "Année courante",
  since_registration: "Depuis inscription",
};

export const ACCOUNTING_PERIOD_PRESETS: Array<{ value: AccountingPeriodPreset; label: string }> = [
  { value: "current_month", label: PERIOD_LABELS.current_month },
  { value: "previous_month", label: PERIOD_LABELS.previous_month },
  { value: "current_quarter", label: PERIOD_LABELS.current_quarter },
  { value: "current_year", label: PERIOD_LABELS.current_year },
  { value: "since_registration", label: PERIOD_LABELS.since_registration },
];

function pad2(value: number) {
  return String(value).padStart(2, "0");
}

function formatDatePartUtc(date: Date) {
  return `${date.getUTCFullYear()}-${pad2(date.getUTCMonth() + 1)}-${pad2(date.getUTCDate())}`;
}

function buildUtcDate(year: number, monthIndex: number, day: number) {
  return new Date(Date.UTC(year, monthIndex, day));
}

function toDateOnly(value: string | null | undefined) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value.slice(0, 10);
  }

  return formatDatePartUtc(date);
}

function toAmount(value: unknown) {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function normalize(value: unknown) {
  return String(value || "").trim().toLowerCase();
}

function isPaidStatus(status: unknown) {
  const normalized = normalize(status);
  return normalized === "paid" || normalized === "reglee" || normalized === "réglée";
}

function restaurantName(row: { restaurants?: RestaurantRelation }) {
  return String(row.restaurants?.name || "").trim() || "-";
}

function getCampaignPaidAmount(campaign: AccountingCampaignSource) {
  const paidAmount = toAmount(campaign.paid_amount);
  return paidAmount > 0 ? paidAmount : toAmount(campaign.total_budget);
}

function isTokOnePayment(payment: AccountingTokOnePaymentSource) {
  if (normalize(payment.type) !== "subscription") return false;
  const metadata = payment.metadata;
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return false;
  return normalize((metadata as Record<string, unknown>).checkout_kind) === "tok-one";
}

function addEntry(entries: AccountingExportEntry[], entry: AccountingExportEntry) {
  if (entry.amount <= 0) return;
  entries.push({
    ...entry,
    amount: roundMoney(entry.amount),
    date: entry.date || "-",
    restaurantName: entry.restaurantName || "-",
    reference: entry.reference || "-",
    status: entry.status || "-",
  });
}

function buildSourceLabel(source: string | null) {
  if (!source) return "Autre";
  return COMMISSION_SOURCE_LABELS[source as keyof typeof COMMISSION_SOURCE_LABELS] || "Autre";
}

export function buildAccountingPeriodRange(
  preset: AccountingPeriodPreset,
  now = new Date(),
): AccountingPeriodRange {
  const year = now.getUTCFullYear();
  const monthIndex = now.getUTCMonth();

  if (preset === "since_registration") {
    return {
      preset,
      label: PERIOD_LABELS[preset],
      startDate: null,
      endDate: formatDatePartUtc(now),
    };
  }

  if (preset === "current_year") {
    return {
      preset,
      label: PERIOD_LABELS[preset],
      startDate: `${year}-01-01`,
      endDate: `${year}-12-31`,
    };
  }

  if (preset === "current_quarter") {
    const quarterStartMonth = Math.floor(monthIndex / 3) * 3;
    return {
      preset,
      label: PERIOD_LABELS[preset],
      startDate: formatDatePartUtc(buildUtcDate(year, quarterStartMonth, 1)),
      endDate: formatDatePartUtc(buildUtcDate(year, quarterStartMonth + 3, 0)),
    };
  }

  if (preset === "previous_month") {
    return {
      preset,
      label: PERIOD_LABELS[preset],
      startDate: formatDatePartUtc(buildUtcDate(year, monthIndex - 1, 1)),
      endDate: formatDatePartUtc(buildUtcDate(year, monthIndex, 0)),
    };
  }

  return {
    preset,
    label: PERIOD_LABELS.current_month,
    startDate: formatDatePartUtc(buildUtcDate(year, monthIndex, 1)),
    endDate: formatDatePartUtc(buildUtcDate(year, monthIndex + 1, 0)),
  };
}

export function isDateInAccountingPeriod(value: string | null | undefined, period: AccountingPeriodRange) {
  const date = toDateOnly(value);
  if (!date) return false;
  if (period.startDate && date < period.startDate) return false;
  return date <= period.endDate;
}

export function buildAccountingExportEntries({
  perspective,
  sources,
}: {
  perspective: AccountingExportPerspective;
  sources: AccountingExportSources;
}) {
  const entries: AccountingExportEntry[] = [];

  (sources.orders || []).forEach((order) => {
    const source = classifyOrderCommissionSource(order);
    if (!source) return;

    const commissionBase = getNetOrderCommissionBase(order);
    const commissionAmount = calculateTokCommission(commissionBase);
    const restaurantShare = calculateRestaurantShare(commissionBase);
    const miamzAmount = getTokCoveredMiamzAmount(order);
    const reference = order.order_number || order.id;
    const sourceLabel = buildSourceLabel(source);
    const date = toDateOnly(order.created_at);
    const name = restaurantName(order);

    addEntry(entries, {
      date,
      direction: perspective === "admin" ? "inflow" : "outflow",
      category: "Commission commande",
      label: `Commission TOK 10% - ${sourceLabel}`,
      restaurantName: name,
      reference,
      amount: commissionAmount,
      status: String(order.status || order.payment_status || "-"),
      source: "orders",
      statementClass: perspective === "admin" ? "income" : "expense",
    });

    addEntry(entries, {
      date,
      direction: perspective === "admin" ? "outflow" : "inflow",
      category: "Reversement commande",
      label: `Part restaurant 90% - ${sourceLabel}`,
      restaurantName: name,
      reference,
      amount: restaurantShare,
      status: String(order.status || order.payment_status || "-"),
      source: "orders",
      statementClass: perspective === "admin" ? "expense" : "income",
    });

    addEntry(entries, {
      date,
      direction: perspective === "admin" ? "outflow" : "inflow",
      category: "Miamz pris en charge",
      label: "Avantage fidélité financé par TOK",
      restaurantName: name,
      reference,
      amount: miamzAmount,
      status: String(order.status || order.payment_status || "-"),
      source: "orders",
      statementClass: perspective === "admin" ? "expense" : "income",
    });

    addEntry(entries, {
      date: toDateOnly(order.refunded_at || order.created_at),
      direction: "outflow",
      category: "Remboursement commande",
      label: "Remboursement client",
      restaurantName: name,
      reference,
      amount: toAmount(order.refunded_amount_chf),
      status: String(order.refund_status || "-"),
      source: "orders",
      statementClass: "expense",
    });
  });

  (sources.reservations || []).forEach((reservation) => {
    const source = classifyReservationCommissionSource(reservation);
    if (!source) return;

    const commissionBase = getNetReservationCommissionBase(reservation);
    const commissionAmount = calculateTokCommission(commissionBase);
    const restaurantShare = calculateRestaurantShare(commissionBase);
    const reference = reservation.id;
    const sourceLabel = buildSourceLabel(source);
    const date = toDateOnly(reservation.created_at || reservation.date);
    const name = restaurantName(reservation);

    addEntry(entries, {
      date,
      direction: perspective === "admin" ? "inflow" : "outflow",
      category: "Commission reservation",
      label: `Commission TOK 10% - ${sourceLabel}`,
      restaurantName: name,
      reference,
      amount: commissionAmount,
      status: String(reservation.status || "-"),
      source: "reservations",
      statementClass: perspective === "admin" ? "income" : "expense",
    });

    addEntry(entries, {
      date,
      direction: perspective === "admin" ? "outflow" : "inflow",
      category: "Reversement reservation",
      label: `Part restaurant 90% - ${sourceLabel}`,
      restaurantName: name,
      reference,
      amount: restaurantShare,
      status: String(reservation.status || "-"),
      source: "reservations",
      statementClass: perspective === "admin" ? "expense" : "income",
    });

    addEntry(entries, {
      date: toDateOnly(reservation.refunded_at || reservation.created_at),
      direction: "outflow",
      category: "Remboursement reservation",
      label: "Remboursement reservation client",
      restaurantName: name,
      reference,
      amount: toAmount(reservation.refunded_amount_chf),
      status: String(reservation.refund_status || "-"),
      source: "reservations",
      statementClass: "expense",
    });
  });

  (sources.reservationFees || []).forEach((reservationFee) => {
    if (normalize(reservationFee.cancelled_by)) return;
    if (reservationFee.reservation_fee_invoice_id) return;

    addEntry(entries, {
      date: toDateOnly(reservationFee.confirmed_at),
      direction: perspective === "admin" ? "inflow" : "outflow",
      category: "Frais reservation",
      label: "Frais de réservation TOK",
      restaurantName: restaurantName(reservationFee),
      reference: reservationFee.id,
      amount: toAmount(reservationFee.billing_fee_chf),
      status: "a_facturer",
      source: "reservations",
      statementClass: perspective === "admin" ? "income" : "expense",
    });
  });

  (sources.paidCampaigns || []).forEach((campaign) => {
    if (normalize(campaign.payment_status) !== "paid") return;

    addEntry(entries, {
      date: toDateOnly(campaign.created_at),
      direction: perspective === "admin" ? "inflow" : "outflow",
      category: "Campagne publicitaire",
      label: campaign.title || "Campagne publicitaire",
      restaurantName: restaurantName(campaign),
      reference: campaign.id,
      amount: getCampaignPaidAmount(campaign),
      status: String(campaign.payment_status || "-"),
      source: "ad_campaigns",
      statementClass: perspective === "admin" ? "income" : "expense",
    });
  });

  (sources.invoices || []).forEach((invoice) => {
    const invoiceType = normalize(invoice.invoice_type || "payout");
    const isPayout = invoiceType === "payout";
    const adminDirection = isPayout ? "outflow" : "inflow";
    const direction = perspective === "admin"
      ? adminDirection
      : adminDirection === "inflow" ? "outflow" : "inflow";

    addEntry(entries, {
      date: toDateOnly(invoice.created_at || invoice.period_end || invoice.period_start),
      direction,
      category: isPayout ? "Facture de reversement" : "Facture TOK",
      label: isPayout ? "Facture de reversement restaurant" : "Facture payable TOK",
      restaurantName: restaurantName(invoice),
      reference: invoice.invoice_number || invoice.id,
      amount: toAmount(invoice.amount_ttc),
      status: String(invoice.status || "-"),
      source: "restaurant_invoices",
      statementClass: direction === "inflow" ? "asset" : "liability",
    });
  });

  if (perspective === "admin") {
    (sources.tokOnePayments || []).forEach((payment) => {
      if (!isTokOnePayment(payment)) return;

      addEntry(entries, {
        date: toDateOnly(payment.created_at),
        direction: "inflow",
        category: "Abonnement Tok One",
        label: "Abonnement client Tok One",
        restaurantName: "Plateforme TOK",
        reference: payment.id,
        amount: toAmount(payment.amount),
        status: String(payment.status || "-"),
        source: "payment_transactions",
        statementClass: "income",
      });
    });
  }

  return entries;
}

export function buildAccountingCsvRows(entries: readonly AccountingExportEntry[]) {
  return [
    [
      "Date",
      "Sens",
      "Categorie",
      "Libelle",
      "Restaurant",
      "Reference",
      "Montant CHF",
      "Statut",
      "Source",
    ],
    ...entries.map((entry) => [
      entry.date,
      entry.direction === "inflow" ? "Entree" : "Sortie",
      entry.category,
      entry.label,
      entry.restaurantName,
      entry.reference,
      entry.amount.toFixed(2),
      entry.status,
      entry.source,
    ]),
  ];
}

export function buildAccountingStatementSummary(entries: readonly AccountingExportEntry[]): AccountingStatementSummary {
  return entries.reduce<AccountingStatementSummary>(
    (summary, entry) => {
      if (entry.statementClass === "income") {
        summary.incomeTotal += entry.amount;
      }

      if (entry.statementClass === "expense") {
        summary.expenseTotal += entry.amount;
      }

      if (entry.statementClass === "asset" && !isPaidStatus(entry.status)) {
        summary.openReceivableTotal += entry.amount;
      }

      if (entry.statementClass === "liability" && !isPaidStatus(entry.status)) {
        summary.openPayableTotal += entry.amount;
      }

      summary.incomeTotal = roundMoney(summary.incomeTotal);
      summary.expenseTotal = roundMoney(summary.expenseTotal);
      summary.openReceivableTotal = roundMoney(summary.openReceivableTotal);
      summary.openPayableTotal = roundMoney(summary.openPayableTotal);
      summary.resultTotal = roundMoney(summary.incomeTotal - summary.expenseTotal);
      summary.balanceNetTotal = roundMoney(summary.openReceivableTotal - summary.openPayableTotal);

      return summary;
    },
    {
      incomeTotal: 0,
      expenseTotal: 0,
      resultTotal: 0,
      openReceivableTotal: 0,
      openPayableTotal: 0,
      balanceNetTotal: 0,
    },
  );
}

function csvEscape(value: unknown) {
  const text = value == null ? "" : String(value);
  return `"${text.replace(/"/g, '""')}"`;
}

export function downloadAccountingExportCsv(filename: string, entries: readonly AccountingExportEntry[]) {
  const csv = buildAccountingCsvRows(entries).map((row) => row.map(csvEscape).join(",")).join("\n");
  const blob = new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function formatMoney(value: number) {
  return `${roundMoney(value).toFixed(2)} CHF`;
}

function groupEntriesByCategory(entries: readonly AccountingExportEntry[], statementClass: AccountingStatementClass) {
  const totals = new Map<string, number>();
  entries
    .filter((entry) => entry.statementClass === statementClass)
    .forEach((entry) => {
      totals.set(entry.category, roundMoney((totals.get(entry.category) || 0) + entry.amount));
    });

  return [...totals.entries()].sort(([left], [right]) => left.localeCompare(right));
}

function buildSummaryTable(entries: readonly AccountingExportEntry[], statementClass: AccountingStatementClass) {
  const rows = groupEntriesByCategory(entries, statementClass);
  if (rows.length === 0) {
      return "<tr><td>Aucune ligne</td><td class=\"amount\">0.00 CHF</td></tr>";
  }

  return rows
    .map(([category, amount]) => `<tr><td>${escapeHtml(category)}</td><td class="amount">${escapeHtml(formatMoney(amount))}</td></tr>`)
    .join("");
}

function buildJournalRows(entries: readonly AccountingExportEntry[]) {
  if (entries.length === 0) {
    return "<tr><td colspan=\"7\">Aucune écriture sur cette période.</td></tr>";
  }

  return entries.map((entry) => `
    <tr>
      <td>${escapeHtml(entry.date)}</td>
      <td>${escapeHtml(entry.direction === "inflow" ? "Entrée" : "Sortie")}</td>
      <td>${escapeHtml(entry.category)}</td>
      <td>${escapeHtml(entry.label)}</td>
      <td>${escapeHtml(entry.restaurantName)}</td>
      <td>${escapeHtml(entry.reference)}</td>
      <td class="amount">${escapeHtml(formatMoney(entry.amount))}</td>
    </tr>
  `).join("");
}

export function exportAccountingStatementPdf({
  entries,
  statement,
  title,
  scopeLabel,
  periodLabel,
}: {
  entries: readonly AccountingExportEntry[];
  statement: AccountingStatementKind;
  title: string;
  scopeLabel: string;
  periodLabel: string;
}) {
  const printWindow = window.open("", "_blank");
  if (!printWindow) return;

  const summary = buildAccountingStatementSummary(entries);
  const statementTitle = statement === "balance_sheet"
    ? "Bilan"
    : statement === "income_statement"
      ? "Compte de résultat"
      : "Journal comptable";

  const body = statement === "journal"
    ? `
      <table>
        <thead>
          <tr>
            <th>Date</th>
            <th>Sens</th>
            <th>Categorie</th>
            <th>Libelle</th>
            <th>Restaurant</th>
            <th>Reference</th>
            <th class="amount">Montant</th>
          </tr>
        </thead>
        <tbody>${buildJournalRows(entries)}</tbody>
      </table>
    `
    : statement === "balance_sheet"
      ? `
        <section class="kpis">
          <div><span>Créances ouvertes</span><strong>${escapeHtml(formatMoney(summary.openReceivableTotal))}</strong></div>
          <div><span>Dettes ouvertes</span><strong>${escapeHtml(formatMoney(summary.openPayableTotal))}</strong></div>
          <div><span>Net bilan</span><strong>${escapeHtml(formatMoney(summary.balanceNetTotal))}</strong></div>
        </section>
        <h2>Créances</h2>
        <table><tbody>${buildSummaryTable(entries.filter((entry) => !isPaidStatus(entry.status)), "asset")}</tbody></table>
        <h2>Dettes</h2>
        <table><tbody>${buildSummaryTable(entries.filter((entry) => !isPaidStatus(entry.status)), "liability")}</tbody></table>
      `
      : `
        <section class="kpis">
          <div><span>Produits</span><strong>${escapeHtml(formatMoney(summary.incomeTotal))}</strong></div>
          <div><span>Charges</span><strong>${escapeHtml(formatMoney(summary.expenseTotal))}</strong></div>
          <div><span>Résultat</span><strong>${escapeHtml(formatMoney(summary.resultTotal))}</strong></div>
        </section>
        <h2>Produits</h2>
        <table><tbody>${buildSummaryTable(entries, "income")}</tbody></table>
        <h2>Charges</h2>
        <table><tbody>${buildSummaryTable(entries, "expense")}</tbody></table>
      `;

  printWindow.document.write(`<!doctype html>
<html lang="fr">
  <head>
    <meta charset="utf-8" />
    <title>${escapeHtml(statementTitle)} - ${escapeHtml(title)}</title>
    <style>
      body { color: #111827; font-family: Arial, sans-serif; line-height: 1.45; margin: 32px; }
      h1 { font-size: 24px; margin: 0 0 4px; }
      h2 { border-bottom: 1px solid #e5e7eb; font-size: 16px; margin-top: 24px; padding-bottom: 6px; }
      table { border-collapse: collapse; margin-top: 12px; width: 100%; }
      th, td { border-bottom: 1px solid #e5e7eb; font-size: 12px; padding: 8px; text-align: left; vertical-align: top; }
      th { background: #f9fafb; color: #374151; }
      .amount { text-align: right; white-space: nowrap; }
      .meta { color: #6b7280; font-size: 12px; margin-bottom: 24px; }
      .kpis { display: grid; gap: 12px; grid-template-columns: repeat(3, 1fr); margin: 20px 0; }
      .kpis div { border: 1px solid #e5e7eb; border-radius: 10px; padding: 12px; }
      .kpis span { color: #6b7280; display: block; font-size: 11px; text-transform: uppercase; }
      .kpis strong { display: block; font-size: 18px; margin-top: 6px; }
      @media print { body { margin: 20mm; } .kpis { break-inside: avoid; } }
    </style>
  </head>
  <body>
    <h1>${escapeHtml(statementTitle)}</h1>
    <div class="meta">${escapeHtml(title)} · ${escapeHtml(scopeLabel)} · ${escapeHtml(periodLabel)} · Export généré le ${escapeHtml(formatDatePartUtc(new Date()))}</div>
    ${body}
  </body>
</html>`);
  printWindow.document.close();
  printWindow.focus();
  const print = printWindow.print || window.print;
  print.call(printWindow);
}

export function sanitizeAccountingFilePart(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9_-]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase() || "export";
}
