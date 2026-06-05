import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { fr } from "date-fns/locale";

import {
  classifyOrderCommissionSource,
  classifyReservationCommissionSource,
  COMMISSION_SOURCE_ORDER,
  createEmptyCommissionBaseTotals,
  getPointsDiscountAmount,
  getNetOrderCommissionBase,
  getNetReservationCommissionBase,
  getTokCoveredMiamzAmount,
  type CommissionBaseTotals,
} from "@/lib/comptaCommissionSources";
import { buildTokAccountingSummary, buildTokRevenueSummary } from "@/lib/comptaFlow";
import {
  buildAccountingExportEntries,
  type AccountingExportEntry,
  type AccountingExportPerspective,
  type AccountingPeriodRange,
} from "@/lib/accountingExports";
import { splitInvoicesByPaymentState } from "@/lib/dashboardInvoices";
import { summarizeFinancialHealth, type FinancialHealthRow } from "@/lib/financialHealth";
import { isRefundColumnsMissingError, withDefaultRefundFields } from "@/lib/refundSchemaCompat";
import { getSupabase } from "@/integrations/supabase/client";

const supabase = getSupabase();

export type RestaurantFilterRow = {
  id: string;
  name: string;
};

export type AdminOrderRow = {
  id: string;
  created_at: string;
  total_amount: number | string | null;
  payment_status?: string | null;
  refunded_amount_chf?: number | string | null;
  refund_status?: string | null;
  refunded_at?: string | null;
  status: string;
  order_number: string | null;
  metadata: Record<string, unknown> | null;
  restaurant_id: string;
  restaurant_invoice_id: string | null;
  restaurants?: { name: string | null } | null;
};

export type AdminReservationPaymentRow = {
  id: string;
  created_at: string;
  date: string;
  feature: string | null;
  metadata: Record<string, unknown> | null;
  total_amount: number | string | null;
  refunded_amount_chf?: number | string | null;
  refund_status?: string | null;
  refunded_at?: string | null;
  status: string;
  restaurant_id: string;
  restaurants?: { name: string | null } | null;
};

type RefundOperationRow = {
  id: string;
  restaurant_id: string;
  total_amount: number | string | null;
  refunded_amount_chf: number | string | null;
  refund_status: string | null;
  refunded_at: string | null;
};

export type AdminInvoiceRow = {
  id: string;
  restaurant_id: string;
  invoice_number: string | null;
  period_start: string;
  period_end: string;
  amount_ht: number | string | null;
  amount_tva: number | string | null;
  amount_ttc: number | string | null;
  status: string | null;
  due_at: string | null;
  paid_at: string | null;
  pdf_url: string | null;
  created_at: string;
  invoice_type: "payout" | "reservation_fees" | "payable" | null;
  restaurants?: { name: string | null } | null;
};

export type AdminCampaignRow = {
  id: string;
  restaurant_id: string;
  created_at: string | null;
  payment_status: string;
  paid_amount: number;
  total_budget: number | null;
  title: string;
  restaurants?: { name: string | null } | null;
};

type AdminTokOnePaymentRow = {
  id: string;
  created_at: string;
  amount: number | string | null;
  status: string;
  type: string;
  metadata: unknown;
};

export type AccountingStripeReconciliationRow = {
  item_kind: string;
  expected_count: number;
  expected_amount: number | string | null;
  received_count: number;
  received_amount: number | string | null;
  refunded_amount: number | string | null;
  orphan_count: number;
  mismatch_count: number;
  details: Record<string, unknown> | null;
};

export type AccountingMonthLockRow = {
  period_month: string;
  status: "open" | "closed" | "reopened";
  reason: string | null;
  official_totals: Record<string, unknown> | null;
  closed_by: string | null;
  closed_at: string | null;
  reopened_by: string | null;
  reopened_at: string | null;
  updated_by: string | null;
  updated_at: string | null;
};

export type AccountingPeriodControl = {
  period_month: string;
  status: "open" | "closed" | "reopened";
  is_closed: boolean;
  lock: AccountingMonthLockRow | null;
  stripe_reconciliation: AccountingStripeReconciliationRow[];
};

export type AdminReservationFeeAccrualRow = {
  id: string;
  restaurant_id: string;
  confirmed_at: string | null;
  billing_fee_chf: number | string | null;
  cancelled_by: string | null;
  reservation_fee_invoice_id: string | null;
  restaurants?: { name: string | null } | null;
};

export type AdminPayableLineItemRow = {
  id: string;
  restaurant_id: string;
  item_kind: string;
  source_id: string | null;
  source_table: string | null;
  amount_ttc: number | string | null;
};

export type AdminPayableAccrualSummary = {
  orderCommissionAmount: number;
  orderCommissionCount: number;
  reservationCommissionAmount: number;
  reservationCommissionCount: number;
  reservationFeeAmount: number;
  reservationFeeCount: number;
  campaignAmount: number;
  campaignCount: number;
  totalAmount: number;
  totalCount: number;
};

export type InvoiceDetailLineType = "order" | "reservation";

export type InvoiceDetailSource =
  | "orders"
  | "zero_attente"
  | "chefs_table"
  | "flash_sales"
  | "anti_gaspi"
  | "other";

export type InvoiceDetailSourcePresentation = {
  label: string;
  className: string;
};

export type PayoutInvoiceDetailLine = {
  lineId: string;
  lineType: InvoiceDetailLineType;
  source: InvoiceDetailSource;
  reference: string;
  label: string;
  occurredAt: string;
  grossAmount: number;
  rateApplied: number;
  invoicedAmount: number;
  tokCoveredMiamzAmount: number;
};

export type ReservationFeeInvoiceDetailLine = {
  reservationId: string;
  reservationDate: string;
  reservationTime: string;
  partySize: number;
  status: string;
  cancelledBy: string | null;
  cancellationReasonCode: string | null;
  billingFeeChf: number;
};

export const INVOICE_DETAIL_SOURCE_PRESENTATION: Record<InvoiceDetailSource, InvoiceDetailSourcePresentation> = {
  orders: { label: "Commande", className: "bg-slate-100 text-slate-700" },
  zero_attente: { label: "Zéro attente", className: "bg-cyan-100 text-cyan-700" },
  chefs_table: { label: "La Table du Chef", className: "bg-violet-100 text-violet-700" },
  flash_sales: { label: "Vente flash", className: "bg-amber-100 text-amber-700" },
  anti_gaspi: { label: "Anti-gaspi", className: "bg-emerald-100 text-emerald-700" },
  other: { label: "Autre", className: "bg-slate-100 text-slate-600" },
};

export function toAmount(value: number | string | null | undefined) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function formatAmount(value: number | string | null | undefined, currency = "CHF") {
  return `${toAmount(value).toFixed(2)} ${currency}`;
}

export function formatDate(value: string | null | undefined) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return format(date, "dd MMM yyyy", { locale: fr });
}

export function formatPeriod(start: string, end: string) {
  return `${format(new Date(start), "dd MMM", { locale: fr })} - ${format(new Date(end), "dd MMM", { locale: fr })}`;
}

function csvEscape(value: unknown) {
  const text = value == null ? "" : String(value);
  return `"${text.replace(/"/g, '""')}"`;
}

export function downloadAccountingCsv(filename: string, rows: Array<Array<unknown>>) {
  const csv = rows.map((row) => row.map(csvEscape).join(",")).join("\n");
  const blob = new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export function isAccountingPeriodClosed(periodControl: AccountingPeriodControl | null | undefined) {
  return Boolean(periodControl?.is_closed || periodControl?.status === "closed");
}

export function getInvoiceStatusClass(status: string | null) {
  const normalizedStatus = String(status || "").trim().toLowerCase();

  if (normalizedStatus === "paid") {
    return "bg-emerald-100 text-emerald-700";
  }

  if (normalizedStatus === "overdue") {
    return "bg-red-100 text-red-700";
  }

  return "bg-amber-100 text-amber-700";
}

function normalizeInvoiceDetailLineType(value: unknown): InvoiceDetailLineType {
  const normalized = String(value || "").trim().toLowerCase();

  if (normalized === "order" || normalized === "reservation") {
    return normalized;
  }

  throw new Error(`Unexpected payout invoice line type: ${String(value)}`);
}

function normalizeInvoiceDetailSource(value: unknown): InvoiceDetailSource {
  const normalized = String(value || "").trim().toLowerCase();

  if (
    normalized === "orders"
    || normalized === "zero_attente"
    || normalized === "chefs_table"
    || normalized === "flash_sales"
    || normalized === "anti_gaspi"
    || normalized === "other"
  ) {
    return normalized;
  }

  throw new Error(`Unexpected payout invoice source: ${String(value)}`);
}

export function getInvoiceDetailSourcePresentation(source: InvoiceDetailSource) {
  return INVOICE_DETAIL_SOURCE_PRESENTATION[source];
}

export function getPayoutInvoiceOrderSubtotal(lines: readonly PayoutInvoiceDetailLine[]) {
  return lines.reduce((sum, line) => sum + (line.lineType === "order" ? line.invoicedAmount : 0), 0);
}

export function getPayoutInvoiceReservationSubtotal(lines: readonly PayoutInvoiceDetailLine[]) {
  return lines.reduce((sum, line) => sum + (line.lineType === "reservation" ? line.invoicedAmount : 0), 0);
}

export function getPayoutInvoiceLinesTotal(lines: readonly PayoutInvoiceDetailLine[]) {
  return lines.reduce((sum, line) => sum + line.invoicedAmount, 0);
}

export function getPayoutInvoiceRoundingDelta(
  invoiceAmountTtc: number | string | null | undefined,
  lines: readonly PayoutInvoiceDetailLine[],
) {
  const delta = toAmount(invoiceAmountTtc) - getPayoutInvoiceLinesTotal(lines);
  return Math.abs(delta) < 0.005 ? null : delta;
}

export function getReservationFeeInvoiceLinesTotal(lines: readonly ReservationFeeInvoiceDetailLine[]) {
  return lines.reduce((sum, line) => sum + line.billingFeeChf, 0);
}

export function buildMonthOptions() {
  const options: Array<{ value: string; label: string }> = [];
  const currentMonthStart = new Date();
  currentMonthStart.setDate(1);
  currentMonthStart.setHours(0, 0, 0, 0);

  for (let index = 0; index < 6; index += 1) {
    const date = new Date(currentMonthStart);
    date.setMonth(date.getMonth() - index);
    const value = format(date, "yyyy-MM");
    const label = format(date, "MMMM yyyy", { locale: fr });

    options.push({
      value,
      label: label.charAt(0).toUpperCase() + label.slice(1),
    });
  }

  return options;
}

function buildMonthBounds(selectedMonth: string) {
  const [yearPart, monthPart] = selectedMonth.split("-");
  const year = Number(yearPart);
  const monthIndex = Number(monthPart) - 1;
  const monthStart = `${selectedMonth}-01`;
  const monthStartDate = new Date(Date.UTC(year, monthIndex, 1));
  const monthEnd = new Date(Date.UTC(year, monthIndex + 1, 0)).toISOString().slice(0, 10);

  return {
    monthStart,
    monthEnd,
    monthStartDate,
  };
}

function buildCommissionBases(orders: readonly AdminOrderRow[], reservations: readonly AdminReservationPaymentRow[]) {
  const totals = createEmptyCommissionBaseTotals();

  orders.forEach((order) => {
    const source = classifyOrderCommissionSource(order);
    if (!source) return;

    totals[source] += getNetOrderCommissionBase(order);
  });

  reservations.forEach((reservation) => {
    const source = classifyReservationCommissionSource(reservation);
    if (!source) return;
    totals[source] += getNetReservationCommissionBase(reservation);
  });

  return totals;
}

function sumBySource(bases: CommissionBaseTotals, rate: number) {
  return COMMISSION_SOURCE_ORDER.reduce((sum, source) => sum + bases[source] * rate, 0);
}

function getCampaignPaidAmount(campaign: Pick<AdminCampaignRow, "paid_amount" | "total_budget">) {
  const paidAmount = toAmount(campaign.paid_amount);
  return paidAmount > 0 ? paidAmount : toAmount(campaign.total_budget);
}

function isBillableReservationFee(row: Pick<AdminReservationFeeAccrualRow, "cancelled_by" | "reservation_fee_invoice_id">) {
  const cancelledBy = String(row.cancelled_by || "").trim().toLowerCase();
  if (cancelledBy !== "") {
    return false;
  }

  return !row.reservation_fee_invoice_id;
}

function createEmptyPayableAccrualSummary(): AdminPayableAccrualSummary {
  return {
    orderCommissionAmount: 0,
    orderCommissionCount: 0,
    reservationCommissionAmount: 0,
    reservationCommissionCount: 0,
    reservationFeeAmount: 0,
    reservationFeeCount: 0,
    campaignAmount: 0,
    campaignCount: 0,
    totalAmount: 0,
    totalCount: 0,
  };
}

function buildBilledSourceLookup(lineItems: readonly AdminPayableLineItemRow[]) {
  const orderCommissionIds = new Set<string>();
  const reservationCommissionIds = new Set<string>();
  const campaignPaymentIds = new Set<string>();

  lineItems.forEach((lineItem) => {
    if (!lineItem.source_id) return;

    if (lineItem.item_kind === "order_commission") {
      orderCommissionIds.add(lineItem.source_id);
      return;
    }

    if (lineItem.item_kind === "reservation_commission") {
      reservationCommissionIds.add(lineItem.source_id);
      return;
    }

    if (lineItem.item_kind === "campaign_payment") {
      campaignPaymentIds.add(lineItem.source_id);
    }
  });

  return {
    orderCommissionIds,
    reservationCommissionIds,
    campaignPaymentIds,
  };
}

function buildAdminPayableAccrualSummary(input: {
  orders: readonly AdminOrderRow[];
  reservationPayments: readonly AdminReservationPaymentRow[];
  reservationFeeAccruals: readonly AdminReservationFeeAccrualRow[];
  paidCampaigns: readonly AdminCampaignRow[];
  billedLineItems: readonly AdminPayableLineItemRow[];
}) {
  const summary = createEmptyPayableAccrualSummary();
  const billedSourceLookup = buildBilledSourceLookup(input.billedLineItems);

  input.orders.forEach((order) => {
    if (billedSourceLookup.orderCommissionIds.has(order.id)) return;

    const commissionBase = getNetOrderCommissionBase(order);
    const commissionAmount = commissionBase * 0.1;
    if (commissionAmount <= 0) return;

    summary.orderCommissionAmount += commissionAmount;
    summary.orderCommissionCount += 1;
  });

  input.reservationPayments.forEach((reservation) => {
    if (billedSourceLookup.reservationCommissionIds.has(reservation.id)) return;

    const commissionAmount = getNetReservationCommissionBase(reservation) * 0.1;
    if (commissionAmount <= 0) return;

    summary.reservationCommissionAmount += commissionAmount;
    summary.reservationCommissionCount += 1;
  });

  input.reservationFeeAccruals.forEach((reservationFee) => {
    const amount = toAmount(reservationFee.billing_fee_chf);
    if (amount <= 0) return;

    summary.reservationFeeAmount += amount;
    summary.reservationFeeCount += 1;
  });

  input.paidCampaigns.forEach((campaign) => {
    if (billedSourceLookup.campaignPaymentIds.has(campaign.id)) return;

    const amount = getCampaignPaidAmount(campaign);
    if (amount <= 0) return;

    summary.campaignAmount += amount;
    summary.campaignCount += 1;
  });

  summary.totalAmount = summary.orderCommissionAmount
    + summary.reservationCommissionAmount
    + summary.reservationFeeAmount
    + summary.campaignAmount;
  summary.totalCount = summary.orderCommissionCount
    + summary.reservationCommissionCount
    + summary.reservationFeeCount
    + summary.campaignCount;

  return summary;
}

type SupabasePagedQuery<T> = {
  range: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>;
};

function applyAccountingPeriodRange<TQuery>(
  query: TQuery,
  column: string,
  period: AccountingPeriodRange,
  valueKind: "date" | "timestamp" = "timestamp",
) {
  let filteredQuery = query as any;
  if (period.startDate) {
    filteredQuery = filteredQuery.gte(
      column,
      valueKind === "date" ? period.startDate : `${period.startDate}T00:00:00.000Z`,
    );
  }

  return filteredQuery.lte(
    column,
    valueKind === "date" ? period.endDate : `${period.endDate}T23:59:59.999Z`,
  ) as TQuery;
}

function applyAdminRestaurantFilter<TQuery>(query: TQuery, selectedRestaurant: string) {
  if (selectedRestaurant === "all") {
    return query;
  }

  return (query as any).eq("restaurant_id", selectedRestaurant) as TQuery;
}

async function fetchPagedRows<T>(buildQuery: () => SupabasePagedQuery<T>, pageSize = 1000) {
  const rows: T[] = [];

  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await buildQuery().range(offset, offset + pageSize - 1);
    if (error) throw error;

    const page = data || [];
    rows.push(...page);

    if (page.length < pageSize) {
      break;
    }
  }

  return rows;
}

async function fetchAdminExportOrders(selectedRestaurant: string, period: AccountingPeriodRange) {
  const buildQuery = () => {
    const query = supabase
      .from("orders")
      .select(`
        id,
        created_at,
        total_amount,
        payment_status,
        refunded_amount_chf,
        refund_status,
        refunded_at,
        status,
        order_number,
        metadata,
        restaurant_id,
        restaurant_invoice_id,
        restaurants ( name )
      `)
      .in("payment_status", ["paid", "captured"])
      .not("status", "in", "(cancelled,payment_failed,refused,pending,pending_payment)");

    return applyAccountingPeriodRange(
      applyAdminRestaurantFilter(query, selectedRestaurant),
      "created_at",
      period,
    ).order("created_at", { ascending: true });
  };

  try {
    return await fetchPagedRows<AdminOrderRow>(buildQuery);
  } catch (error) {
    if (!isRefundColumnsMissingError(error)) {
      throw error;
    }

    const fallbackBuildQuery = () => {
      const query = supabase
        .from("orders")
        .select(`
          id,
          created_at,
          total_amount,
          payment_status,
          status,
          order_number,
          metadata,
          restaurant_id,
          restaurant_invoice_id,
          restaurants ( name )
        `)
        .in("payment_status", ["paid", "captured"])
        .not("status", "in", "(cancelled,payment_failed,refused,pending,pending_payment)");

      return applyAccountingPeriodRange(
        applyAdminRestaurantFilter(query, selectedRestaurant),
        "created_at",
        period,
      ).order("created_at", { ascending: true });
    };

    return withDefaultRefundFields(await fetchPagedRows<AdminOrderRow>(fallbackBuildQuery)) as AdminOrderRow[];
  }
}

async function fetchAdminExportReservations(selectedRestaurant: string, period: AccountingPeriodRange) {
  const buildQuery = () => {
    const query = supabase
      .from("reservations")
      .select(`
        id,
        created_at,
        date,
        feature,
        metadata,
        total_amount,
        refunded_amount_chf,
        refund_status,
        refunded_at,
        status,
        restaurant_id,
        restaurants ( name )
      `)
      .gt("total_amount", 0)
      .not("status", "in", "(cancelled,no_show,pending)");

    return applyAccountingPeriodRange(
      applyAdminRestaurantFilter(query, selectedRestaurant),
      "created_at",
      period,
    ).order("created_at", { ascending: true });
  };

  try {
    return await fetchPagedRows<AdminReservationPaymentRow>(buildQuery);
  } catch (error) {
    if (!isRefundColumnsMissingError(error)) {
      throw error;
    }

    const fallbackBuildQuery = () => {
      const query = supabase
        .from("reservations")
        .select(`
          id,
          created_at,
          date,
          feature,
          metadata,
          total_amount,
          status,
          restaurant_id,
          restaurants ( name )
        `)
        .gt("total_amount", 0)
        .not("status", "in", "(cancelled,no_show,pending)");

      return applyAccountingPeriodRange(
        applyAdminRestaurantFilter(query, selectedRestaurant),
        "created_at",
        period,
      ).order("created_at", { ascending: true });
    };

    return withDefaultRefundFields(await fetchPagedRows<AdminReservationPaymentRow>(fallbackBuildQuery)) as AdminReservationPaymentRow[];
  }
}

async function fetchAdminExportReservationFees(selectedRestaurant: string, period: AccountingPeriodRange) {
  const buildQuery = () => {
    const query = supabase
      .from("reservations")
      .select(`
        id,
        restaurant_id,
        confirmed_at,
        billing_fee_chf,
        cancelled_by,
        reservation_fee_invoice_id,
        restaurants ( name )
      `)
      .not("confirmed_at", "is", null);

    return applyAccountingPeriodRange(
      applyAdminRestaurantFilter(query, selectedRestaurant),
      "confirmed_at",
      period,
    ).order("confirmed_at", { ascending: true });
  };

  return fetchPagedRows<AdminReservationFeeAccrualRow>(buildQuery);
}

async function fetchAdminExportCampaigns(selectedRestaurant: string, period: AccountingPeriodRange) {
  const buildQuery = () => {
    const query = supabase
      .from("ad_campaigns")
      .select(`
        id,
        restaurant_id,
        created_at,
        payment_status,
        paid_amount,
        total_budget,
        title,
        restaurants ( name )
      `)
      .eq("payment_status", "paid");

    return applyAccountingPeriodRange(
      applyAdminRestaurantFilter(query, selectedRestaurant),
      "created_at",
      period,
    ).order("created_at", { ascending: true });
  };

  return fetchPagedRows<AdminCampaignRow>(buildQuery);
}

async function fetchAdminExportInvoices(selectedRestaurant: string, period: AccountingPeriodRange) {
  const buildQuery = () => {
    const query = supabase
      .from("restaurant_invoices")
      .select(`
        id,
        restaurant_id,
        invoice_number,
        period_start,
        period_end,
        amount_ttc,
        status,
        created_at,
        invoice_type,
        restaurants ( name )
      `);

    return applyAccountingPeriodRange(
      applyAdminRestaurantFilter(query, selectedRestaurant),
      "period_end",
      period,
      "date",
    ).order("period_end", { ascending: true });
  };

  return fetchPagedRows<AdminInvoiceRow>(buildQuery);
}

async function fetchAdminExportTokOnePayments(period: AccountingPeriodRange) {
  const buildQuery = () => {
    const query = (supabase as any)
      .from("payment_transactions")
      .select("id, created_at, amount, status, type, metadata")
      .eq("type", "subscription")
      .in("status", ["paid", "succeeded"]);

    return applyAccountingPeriodRange(query, "created_at", period).order("created_at", { ascending: true });
  };

  return fetchPagedRows<any>(buildQuery);
}

export async function fetchAdminAccountingExportEntries({
  selectedRestaurant,
  period,
  perspective = "admin",
}: {
  selectedRestaurant: string;
  period: AccountingPeriodRange;
  perspective?: AccountingExportPerspective;
}): Promise<AccountingExportEntry[]> {
  const [
    orders,
    reservations,
    reservationFees,
    paidCampaigns,
    invoices,
    tokOnePayments,
  ] = await Promise.all([
    fetchAdminExportOrders(selectedRestaurant, period),
    fetchAdminExportReservations(selectedRestaurant, period),
    fetchAdminExportReservationFees(selectedRestaurant, period),
    fetchAdminExportCampaigns(selectedRestaurant, period),
    fetchAdminExportInvoices(selectedRestaurant, period),
    selectedRestaurant === "all" ? fetchAdminExportTokOnePayments(period) : Promise.resolve([]),
  ]);

  return buildAccountingExportEntries({
    perspective,
    sources: {
      orders,
      reservations,
      reservationFees,
      paidCampaigns,
      invoices,
      tokOnePayments,
    },
  });
}

export function useAdminPayoutInvoiceDetailLines(invoiceId: string | null) {
  return useQuery({
    queryKey: ["admin-compta-payout-invoice-lines", invoiceId],
    queryFn: async () => {
      if (!invoiceId) return [] as PayoutInvoiceDetailLine[];

      const { data, error } = await supabase.rpc("get_payout_invoice_lines", { p_invoice_id: invoiceId });
      if (error) throw error;

      const rows = data || [];
      const orderIds = Array.from(new Set(
        rows
          .filter((row) => String(row.line_type || "").trim().toLowerCase() === "order")
          .map((row) => String(row.line_id || "").trim())
          .filter(Boolean),
      ));
      let tokCoveredMiamzByOrderId = new Map<string, number>();

      if (orderIds.length > 0) {
        const ordersQuery = await supabase
          .from("orders")
          .select("id, metadata")
          .in("id", orderIds);

        if (ordersQuery.error) throw ordersQuery.error;

        tokCoveredMiamzByOrderId = new Map(
          (ordersQuery.data || []).map((order) => [
            String(order.id),
            getPointsDiscountAmount(order.metadata as Record<string, unknown> | null),
          ]),
        );
      }

      return rows.map((row) => {
        const lineId = String(row.line_id);
        const lineType = normalizeInvoiceDetailLineType(row.line_type);

        return {
          lineId,
          lineType,
          source: normalizeInvoiceDetailSource(row.source),
          reference: String(row.reference || ""),
          label: String(row.label || ""),
          occurredAt: String(row.occurred_at || ""),
          grossAmount: toAmount(row.gross_amount),
          rateApplied: toAmount(row.rate_applied),
          invoicedAmount: toAmount(row.invoiced_amount),
          tokCoveredMiamzAmount: lineType === "order" ? tokCoveredMiamzByOrderId.get(lineId) || 0 : 0,
        };
      }) as PayoutInvoiceDetailLine[];
    },
    enabled: !!invoiceId,
  });
}

export function useAdminReservationFeeInvoiceDetailLines(invoiceId: string | null) {
  return useQuery({
    queryKey: ["admin-compta-reservation-fee-invoice-lines", invoiceId],
    queryFn: async () => {
      if (!invoiceId) return [] as ReservationFeeInvoiceDetailLine[];

      const { data, error } = await supabase.rpc("get_reservation_fee_invoice_lines", { p_invoice_id: invoiceId });
      if (error) throw error;

      return (data || []).map((row) => ({
        reservationId: String(row.reservation_id),
        reservationDate: String(row.reservation_date || ""),
        reservationTime: row.reservation_time ? String(row.reservation_time) : "",
        partySize: toAmount(row.party_size),
        status: String(row.status || ""),
        cancelledBy: row.cancelled_by ? String(row.cancelled_by) : null,
        cancellationReasonCode: row.cancellation_reason_code ? String(row.cancellation_reason_code) : null,
        billingFeeChf: toAmount(row.billing_fee_chf),
      })) as ReservationFeeInvoiceDetailLine[];
    },
    enabled: !!invoiceId,
  });
}

export function useAdminComptaData(selectedRestaurant: string, selectedMonth: string) {
  const monthBounds = useMemo(() => buildMonthBounds(selectedMonth), [selectedMonth]);
  const monthOptions = useMemo(() => buildMonthOptions(), []);

  const periodControlQuery = useQuery({
    queryKey: ["admin-compta-period-control", selectedMonth],
    queryFn: async () => {
      const { data, error } = await (supabase.rpc as any)("admin_get_accounting_period_control", {
        p_month: monthBounds.monthStart,
      });

      if (error) throw error;
      return (data || null) as AccountingPeriodControl | null;
    },
  });

  const stripeReconciliationQuery = useQuery({
    queryKey: ["admin-compta-stripe-reconciliation", selectedMonth],
    queryFn: async () => {
      const { data, error } = await (supabase.rpc as any)("admin_get_accounting_stripe_reconciliation", {
        p_month: monthBounds.monthStart,
      });

      if (error) throw error;
      return (data || []) as AccountingStripeReconciliationRow[];
    },
  });

  const restaurantsQuery = useQuery({
    queryKey: ["admin-restaurants-list"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("restaurants")
        .select("id, name")
        .order("name");

      if (error) throw error;
      return (data || []) as RestaurantFilterRow[];
    },
  });

  const ordersQuery = useQuery({
    queryKey: ["admin-compta-orders-v2", selectedRestaurant, selectedMonth],
    queryFn: async () => {
      let query = supabase
        .from("orders")
        .select(`
          id,
          created_at,
          total_amount,
          payment_status,
          refunded_amount_chf,
          refund_status,
          refunded_at,
          status,
          order_number,
          metadata,
          restaurant_id,
          restaurant_invoice_id,
          restaurants ( name )
        `)
        .gte("created_at", monthBounds.monthStartDate.toISOString())
        .lte("created_at", `${monthBounds.monthEnd}T23:59:59.999Z`)
        .in("payment_status", ["paid", "captured"])
        .not("status", "in", "(cancelled,payment_failed,refused,pending,pending_payment)");

      if (selectedRestaurant !== "all") {
        query = query.eq("restaurant_id", selectedRestaurant);
      }

      const { data, error } = await query.order("created_at", { ascending: false });
      if (error && isRefundColumnsMissingError(error)) {
        let fallbackQuery = supabase
          .from("orders")
          .select(`
            id,
            created_at,
            total_amount,
            payment_status,
            status,
            order_number,
            metadata,
            restaurant_id,
            restaurant_invoice_id,
            restaurants ( name )
          `)
          .gte("created_at", monthBounds.monthStartDate.toISOString())
          .lte("created_at", `${monthBounds.monthEnd}T23:59:59.999Z`)
          .in("payment_status", ["paid", "captured"])
          .not("status", "in", "(cancelled,payment_failed,refused,pending,pending_payment)");

        if (selectedRestaurant !== "all") {
          fallbackQuery = fallbackQuery.eq("restaurant_id", selectedRestaurant);
        }

        const fallback = await fallbackQuery.order("created_at", { ascending: false });
        if (fallback.error) throw fallback.error;
        return withDefaultRefundFields(fallback.data || []) as AdminOrderRow[];
      }

      if (error) throw error;
      return (data || []) as AdminOrderRow[];
    },
  });

  const financialHealthOrdersQuery = useQuery({
    queryKey: ["admin-compta-financial-health-orders-v1", selectedRestaurant, selectedMonth],
    queryFn: async () => {
      let query = supabase
        .from("orders")
        .select("id, status, payment_status, refund_status")
        .gte("created_at", monthBounds.monthStartDate.toISOString())
        .lte("created_at", `${monthBounds.monthEnd}T23:59:59.999Z`);

      if (selectedRestaurant !== "all") {
        query = query.eq("restaurant_id", selectedRestaurant);
      }

      const { data, error } = await query.order("created_at", { ascending: false });
      if (error && isRefundColumnsMissingError(error)) {
        let fallbackQuery = supabase
          .from("orders")
          .select("id, status, payment_status")
          .gte("created_at", monthBounds.monthStartDate.toISOString())
          .lte("created_at", `${monthBounds.monthEnd}T23:59:59.999Z`);

        if (selectedRestaurant !== "all") {
          fallbackQuery = fallbackQuery.eq("restaurant_id", selectedRestaurant);
        }

        const fallback = await fallbackQuery.order("created_at", { ascending: false });
        if (fallback.error) throw fallback.error;
        return withDefaultRefundFields(fallback.data || []) as FinancialHealthRow[];
      }

      if (error) throw error;
      return (data || []) as FinancialHealthRow[];
    },
  });

  const reservationFeeAccrualsQuery = useQuery({
    queryKey: ["admin-compta-reservation-fee-accruals-v1", selectedRestaurant, selectedMonth],
    queryFn: async () => {
      let query = supabase
        .from("reservations")
        .select(`
          id,
          restaurant_id,
          confirmed_at,
          billing_fee_chf,
          cancelled_by,
          reservation_fee_invoice_id,
          restaurants ( name )
        `)
        .not("confirmed_at", "is", null)
        .gte("confirmed_at", `${monthBounds.monthStart}T00:00:00.000Z`)
        .lte("confirmed_at", `${monthBounds.monthEnd}T23:59:59.999Z`);

      if (selectedRestaurant !== "all") {
        query = query.eq("restaurant_id", selectedRestaurant);
      }

      const { data, error } = await query.order("confirmed_at", { ascending: false });
      if (error) throw error;

      return (data || []) as AdminReservationFeeAccrualRow[];
    },
  });

  const reservationsQuery = useQuery({
    queryKey: ["admin-compta-reservation-payments-v2", selectedRestaurant, selectedMonth],
    queryFn: async () => {
      let query = supabase
        .from("reservations")
        .select(`
          id,
          created_at,
          date,
          feature,
          metadata,
          total_amount,
          refunded_amount_chf,
          refund_status,
          refunded_at,
          status,
          restaurant_id,
          restaurants ( name )
        `)
        .gte("created_at", monthBounds.monthStartDate.toISOString())
        .lte("created_at", `${monthBounds.monthEnd}T23:59:59.999Z`)
        .gt("total_amount", 0)
        .not("status", "in", "(cancelled,no_show,pending)");

      if (selectedRestaurant !== "all") {
        query = query.eq("restaurant_id", selectedRestaurant);
      }

      const { data, error } = await query.order("created_at", { ascending: false });
      if (error && isRefundColumnsMissingError(error)) {
        let fallbackQuery = supabase
          .from("reservations")
          .select(`
            id,
            created_at,
            date,
            feature,
            metadata,
            total_amount,
            status,
            restaurant_id,
            restaurants ( name )
          `)
          .gte("created_at", monthBounds.monthStartDate.toISOString())
          .lte("created_at", `${monthBounds.monthEnd}T23:59:59.999Z`)
          .gt("total_amount", 0)
          .not("status", "in", "(cancelled,no_show,pending)");

        if (selectedRestaurant !== "all") {
          fallbackQuery = fallbackQuery.eq("restaurant_id", selectedRestaurant);
        }

        const fallback = await fallbackQuery.order("created_at", { ascending: false });
        if (fallback.error) throw fallback.error;
        return withDefaultRefundFields(fallback.data || []) as AdminReservationPaymentRow[];
      }

      if (error) throw error;
      return (data || []) as AdminReservationPaymentRow[];
    },
  });

  const payoutInvoicesQuery = useQuery({
    queryKey: ["admin-compta-payout-invoices-v2", selectedRestaurant, selectedMonth],
    queryFn: async () => {
      let query = supabase
        .from("restaurant_invoices")
        .select(`
          id,
          restaurant_id,
          invoice_number,
          period_start,
          period_end,
          amount_ht,
          amount_tva,
          amount_ttc,
          status,
          due_at,
          paid_at,
          pdf_url,
          created_at,
          invoice_type,
          restaurants ( name )
        `)
        .eq("invoice_type", "payout")
        .gte("period_start", monthBounds.monthStart)
        .lte("period_end", monthBounds.monthEnd)
        .order("created_at", { ascending: false });

      if (selectedRestaurant !== "all") {
        query = query.eq("restaurant_id", selectedRestaurant);
      }

      const { data, error } = await query;
      if (error) throw error;
      return (data || []) as AdminInvoiceRow[];
    },
  });

  const payableInvoicesQuery = useQuery({
    queryKey: ["admin-compta-payable-invoices-v3", selectedRestaurant, selectedMonth],
    queryFn: async () => {
      let query = supabase
        .from("restaurant_invoices")
        .select(`
          id,
          restaurant_id,
          invoice_number,
          period_start,
          period_end,
          amount_ht,
          amount_tva,
          amount_ttc,
          status,
          due_at,
          paid_at,
          pdf_url,
          created_at,
          invoice_type,
          restaurants ( name )
        `)
        .in("invoice_type", ["payable", "reservation_fees"])
        .gte("period_start", monthBounds.monthStart)
        .lte("period_end", monthBounds.monthEnd)
        .order("created_at", { ascending: false });

      if (selectedRestaurant !== "all") {
        query = query.eq("restaurant_id", selectedRestaurant);
      }

      const { data, error } = await query;
      if (error) throw error;
      return (data || []) as AdminInvoiceRow[];
    },
  });

  const payableLineItemsQuery = useQuery({
    queryKey: ["admin-compta-payable-line-items-v1", selectedRestaurant, selectedMonth],
    queryFn: async () => {
      let query = supabase
        .from("restaurant_invoice_line_items")
        .select("id, restaurant_id, item_kind, source_id, source_table, amount_ttc")
        .gte("occurred_at", `${monthBounds.monthStart}T00:00:00.000Z`)
        .lte("occurred_at", `${monthBounds.monthEnd}T23:59:59.999Z`)
        .order("occurred_at", { ascending: false });

      if (selectedRestaurant !== "all") {
        query = query.eq("restaurant_id", selectedRestaurant);
      }

      const { data, error } = await query;
      if (error) throw error;
      return (data || []) as AdminPayableLineItemRow[];
    },
  });

  const campaignsQuery = useQuery({
    queryKey: ["admin-compta-paid-campaigns", selectedRestaurant, selectedMonth],
    queryFn: async () => {
      let query = supabase
        .from("ad_campaigns")
        .select(`
          id,
          restaurant_id,
          created_at,
          payment_status,
          paid_amount,
          total_budget,
          title,
          restaurants ( name )
        `)
        .eq("payment_status", "paid")
        .gte("created_at", monthBounds.monthStartDate.toISOString())
        .lte("created_at", `${monthBounds.monthEnd}T23:59:59.999Z`)
        .order("created_at", { ascending: false });

      if (selectedRestaurant !== "all") {
        query = query.eq("restaurant_id", selectedRestaurant);
      }

      const { data, error } = await query;
      if (error) throw error;
      return (data || []) as AdminCampaignRow[];
    },
  });

  const tokOnePaymentsQuery = useQuery({
    queryKey: ["admin-compta-tok-one-payments-v1", selectedMonth],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("payment_transactions")
        .select("id, created_at, amount, status, type, metadata")
        .eq("type", "subscription")
        .in("status", ["paid", "succeeded"])
        .gte("created_at", monthBounds.monthStartDate.toISOString())
        .lte("created_at", `${monthBounds.monthEnd}T23:59:59.999Z`)
        .order("created_at", { ascending: false });

      if (error) throw error;
      return (data || []) as AdminTokOnePaymentRow[];
    },
  });

  const refundedOrdersQuery = useQuery({
    queryKey: ["admin-compta-refunded-orders-v1", selectedRestaurant, selectedMonth],
    queryFn: async () => {
      let query = supabase
        .from("orders")
        .select("id, restaurant_id, total_amount, refunded_amount_chf, refund_status, refunded_at")
        .gt("refunded_amount_chf", 0)
        .gte("refunded_at", `${monthBounds.monthStart}T00:00:00.000Z`)
        .lte("refunded_at", `${monthBounds.monthEnd}T23:59:59.999Z`)
        .order("refunded_at", { ascending: false });

      if (selectedRestaurant !== "all") {
        query = query.eq("restaurant_id", selectedRestaurant);
      }

      const { data, error } = await query;
      if (error && isRefundColumnsMissingError(error)) {
        return [] as RefundOperationRow[];
      }

      if (error) throw error;
      return (data || []) as RefundOperationRow[];
    },
  });

  const refundedReservationsQuery = useQuery({
    queryKey: ["admin-compta-refunded-reservations-v1", selectedRestaurant, selectedMonth],
    queryFn: async () => {
      let query = supabase
        .from("reservations")
        .select("id, restaurant_id, total_amount, refunded_amount_chf, refund_status, refunded_at")
        .gt("refunded_amount_chf", 0)
        .gte("refunded_at", `${monthBounds.monthStart}T00:00:00.000Z`)
        .lte("refunded_at", `${monthBounds.monthEnd}T23:59:59.999Z`)
        .order("refunded_at", { ascending: false });

      if (selectedRestaurant !== "all") {
        query = query.eq("restaurant_id", selectedRestaurant);
      }

      const { data, error } = await query;
      if (error && isRefundColumnsMissingError(error)) {
        return [] as RefundOperationRow[];
      }

      if (error) throw error;
      return (data || []) as RefundOperationRow[];
    },
  });

  const commissionBases = useMemo(
    () => buildCommissionBases(ordersQuery.data || [], reservationsQuery.data || []),
    [ordersQuery.data, reservationsQuery.data],
  );
  const reservationFeeAccruals = useMemo(
    () => (reservationFeeAccrualsQuery.data || []).filter(isBillableReservationFee),
    [reservationFeeAccrualsQuery.data],
  );

  const payoutInvoiceSections = useMemo(
    () => splitInvoicesByPaymentState(payoutInvoicesQuery.data || []),
    [payoutInvoicesQuery.data],
  );
  const payableInvoiceSections = useMemo(
    () => splitInvoicesByPaymentState(payableInvoicesQuery.data || []),
    [payableInvoicesQuery.data],
  );
  const payableAccruals = useMemo(
    () => buildAdminPayableAccrualSummary({
      orders: ordersQuery.data || [],
      reservationPayments: reservationsQuery.data || [],
      reservationFeeAccruals,
      paidCampaigns: campaignsQuery.data || [],
      billedLineItems: payableLineItemsQuery.data || [],
    }),
    [
      campaignsQuery.data,
      ordersQuery.data,
      payableLineItemsQuery.data,
      reservationFeeAccruals,
      reservationsQuery.data,
    ],
  );

  const summary = useMemo(
    () => buildTokAccountingSummary({
      commissionBases,
      payableInvoices: payableInvoiceSections,
      reservationFeeInvoices: payableInvoiceSections,
      payoutInvoices: payoutInvoiceSections,
      payableAccruedAmount: payableAccruals.totalAmount,
    }),
    [commissionBases, payableAccruals.totalAmount, payableInvoiceSections, payoutInvoiceSections],
  );

  const paidEventGross = useMemo(
    () => sumBySource(commissionBases, 1),
    [commissionBases],
  );
  const reservationFeeAccrualCount = reservationFeeAccruals.length;
  const reservationFeeAccrualAmount = useMemo(
    () => reservationFeeAccruals.reduce((sum, row) => sum + toAmount(row.billing_fee_chf), 0),
    [reservationFeeAccruals],
  );
  const reservationFeeRevenueAmount = useMemo(
    () => (reservationFeeAccrualsQuery.data || []).reduce((sum, row) => {
      const cancelledBy = String(row.cancelled_by || "").trim().toLowerCase();
      if (cancelledBy !== "") return sum;

      return sum + toAmount(row.billing_fee_chf);
    }, 0),
    [reservationFeeAccrualsQuery.data],
  );
  const paidCampaignsTotal = useMemo(
    () => (campaignsQuery.data || []).reduce((sum, campaign) => sum + getCampaignPaidAmount(campaign), 0),
    [campaignsQuery.data],
  );
  const paidCampaignsCount = campaignsQuery.data?.length || 0;
  const tokCoveredMiamz = useMemo(
    () => (ordersQuery.data || []).reduce((accumulator, order) => {
      const amount = getTokCoveredMiamzAmount(order);
      if (amount <= 0) {
        return accumulator;
      }

      return {
        amount: accumulator.amount + amount,
        count: accumulator.count + 1,
      };
    }, { amount: 0, count: 0 }),
    [ordersQuery.data],
  );
  const tokOneRevenue = useMemo(() => {
    if (selectedRestaurant !== "all") {
      return { amount: 0, count: 0 };
    }

    return (tokOnePaymentsQuery.data || []).reduce((accumulator, payment) => {
      const metadata = payment.metadata;
      const isTokOnePayment = metadata
        && typeof metadata === "object"
        && !Array.isArray(metadata)
        && String((metadata as Record<string, unknown>).checkout_kind || "").trim().toLowerCase() === "tok-one";

      if (!isTokOnePayment) {
        return accumulator;
      }

      return {
        amount: accumulator.amount + toAmount(payment.amount),
        count: accumulator.count + 1,
      };
    }, { amount: 0, count: 0 });
  }, [selectedRestaurant, tokOnePaymentsQuery.data]);
  const totalRevenueSummary = useMemo(
    () => buildTokRevenueSummary({
      commissionAmount: summary.inflow.totalCommissions,
      reservationFeeAmount: reservationFeeRevenueAmount,
      campaignAmount: paidCampaignsTotal,
      tokOneSubscriptionAmount: tokOneRevenue.amount,
    }),
    [paidCampaignsTotal, reservationFeeRevenueAmount, summary.inflow.totalCommissions, tokOneRevenue.amount],
  );
  const refundOperations = useMemo(
    () => [...(refundedOrdersQuery.data || []), ...(refundedReservationsQuery.data || [])],
    [refundedOrdersQuery.data, refundedReservationsQuery.data],
  );
  const refundsIssuedTotal = useMemo(
    () => refundOperations.reduce((sum, item) => sum + toAmount(item.refunded_amount_chf), 0),
    [refundOperations],
  );
  const refundsIssuedCount = refundOperations.length;
  const refundsPendingAmount = useMemo(
    () => refundOperations.reduce((sum, item) => {
      const normalizedStatus = String(item.refund_status || "").trim().toLowerCase();
      if (normalizedStatus === "refunded") {
        return sum;
      }

      return sum + Math.max(0, toAmount(item.total_amount) - toAmount(item.refunded_amount_chf));
    }, 0),
    [refundOperations],
  );
  const refundsPendingCount = useMemo(
    () => refundOperations.filter((item) => String(item.refund_status || "").trim().toLowerCase() !== "refunded").length,
    [refundOperations],
  );
  const financialHealth = useMemo(
    () => summarizeFinancialHealth(financialHealthOrdersQuery.data || []),
    [financialHealthOrdersQuery.data],
  );

  return {
    restaurants: restaurantsQuery.data || [],
    orders: ordersQuery.data || [],
    reservationPayments: reservationsQuery.data || [],
    reservationFeeAccruals,
    payableAccruals,
    paidCampaigns: campaignsQuery.data || [],
    payoutInvoices: payoutInvoicesQuery.data || [],
    payableInvoices: payableInvoicesQuery.data || [],
    tokFeeInvoices: payableInvoicesQuery.data || [],
    payoutInvoiceSections,
    payableInvoiceSections,
    tokFeeInvoiceSections: payableInvoiceSections,
    commissionBases,
    summary,
    paidEventGross,
    reservationFeeAccrualCount,
    reservationFeeAccrualAmount,
    reservationFeeRevenueAmount,
    paidCampaignsTotal,
    paidCampaignsCount,
    tokCoveredMiamzAmount: tokCoveredMiamz.amount,
    tokCoveredMiamzCount: tokCoveredMiamz.count,
    tokOneSubscriptionAmount: tokOneRevenue.amount,
    tokOneSubscriptionCount: tokOneRevenue.count,
    totalRevenue: totalRevenueSummary.totalRevenue,
    developerReservedShare: totalRevenueSummary.developerReservedShare,
    refundsIssuedTotal,
    refundsIssuedCount,
    refundsPendingAmount,
    refundsPendingCount,
    financialHealth,
    periodControl: periodControlQuery.data || null,
    stripeReconciliation: stripeReconciliationQuery.data || [],
    isPeriodClosed: isAccountingPeriodClosed(periodControlQuery.data),
    monthOptions,
    isLoading: periodControlQuery.isLoading
      || stripeReconciliationQuery.isLoading
      || restaurantsQuery.isLoading
      || ordersQuery.isLoading
      || financialHealthOrdersQuery.isLoading
      || reservationsQuery.isLoading
      || reservationFeeAccrualsQuery.isLoading
      || campaignsQuery.isLoading
      || tokOnePaymentsQuery.isLoading
      || payoutInvoicesQuery.isLoading
      || payableInvoicesQuery.isLoading
      || payableLineItemsQuery.isLoading
      || refundedOrdersQuery.isLoading
      || refundedReservationsQuery.isLoading,
    error: periodControlQuery.error
      || stripeReconciliationQuery.error
      || restaurantsQuery.error
      || ordersQuery.error
      || financialHealthOrdersQuery.error
      || reservationsQuery.error
      || reservationFeeAccrualsQuery.error
      || campaignsQuery.error
      || tokOnePaymentsQuery.error
      || payoutInvoicesQuery.error
      || payableInvoicesQuery.error
      || payableLineItemsQuery.error
      || refundedOrdersQuery.error
      || refundedReservationsQuery.error,
  };
}
