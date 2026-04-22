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
} from "@/lib/comptaCommissionSources";
import { buildRestaurantAccountingSummary } from "@/lib/comptaFlow";
import { splitInvoicesByPaymentState } from "@/lib/dashboardInvoices";
import { getSupabase } from "@/integrations/supabase/client";
import { useDashboardRestaurant } from "./DashboardContext";

const supabase = getSupabase();

export type RestaurantInvoiceRow = {
  id: string;
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
  restaurant_id: string;
  invoice_type: "payout" | "reservation_fees" | "payable" | null;
};

export type RestaurantOrderRow = {
  id: string;
  created_at: string;
  total_amount: number | string | null;
  payment_status?: string | null;
  status: string;
  order_number: string | null;
  metadata: Record<string, unknown> | null;
  restaurant_id: string;
  restaurant_invoice_id: string | null;
};

export type RestaurantReservationPaymentRow = {
  id: string;
  date: string;
  feature: string | null;
  metadata: Record<string, unknown> | null;
  total_amount: number | string | null;
  status: string;
  restaurant_id: string;
  restaurant_invoice_id: string | null;
};

type RestaurantReservationFeeRow = {
  id: string;
  restaurant_id: string;
  confirmed_at: string | null;
  billing_fee_chf: number | string | null;
  cancelled_by: string | null;
  reservation_fee_invoice_id: string | null;
};

type RestaurantPayableLineItemRow = {
  id: string;
  restaurant_id: string;
  item_kind: string;
  source_id: string | null;
  source_table: string | null;
  amount_ttc: number | string | null;
};

export type RestaurantPaidCampaignRow = {
  id: string;
  created_at: string;
  payment_status: string;
  paid_amount: number | null;
  total_budget: number | null;
  title: string | null;
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
  zero_attente: { label: "Zero attente", className: "bg-cyan-100 text-cyan-700" },
  chefs_table: { label: "Chef's Table", className: "bg-violet-100 text-violet-700" },
  flash_sales: { label: "Vente flash", className: "bg-amber-100 text-amber-700" },
  anti_gaspi: { label: "Anti-gaspi", className: "bg-emerald-100 text-emerald-700" },
  other: { label: "Autre", className: "bg-slate-100 text-slate-600" },
};

type ReservationFeeSummary = {
  count: number;
  amount: number;
};

type PayableAccrualSummary = {
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

export function toAmount(value: number | string | null | undefined) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function formatAmount(value: number | string | null | undefined, currency = "CHF") {
  return `${toAmount(value).toFixed(2)} ${currency}`;
}

function getCampaignPaidAmount(campaign: Pick<RestaurantPaidCampaignRow, "paid_amount" | "total_budget">) {
  const paidAmount = toAmount(campaign.paid_amount);
  if (paidAmount > 0) return paidAmount;
  return toAmount(campaign.total_budget);
}

function isBillableReservationFee(cancelledBy: string | null | undefined) {
  const normalized = String(cancelledBy || "").trim().toLowerCase();
  return normalized === "" || (normalized !== "customer" && normalized !== "admin");
}

function createEmptyPayableAccrualSummary(): PayableAccrualSummary {
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

function buildBilledSourceLookup(lineItems: readonly RestaurantPayableLineItemRow[]) {
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

function buildPayableAccrualSummary(input: {
  orders: readonly RestaurantOrderRow[];
  reservationPayments: readonly RestaurantReservationPaymentRow[];
  reservationFeeRows: readonly RestaurantReservationFeeRow[];
  paidCampaigns: readonly RestaurantPaidCampaignRow[];
  billedLineItems: readonly RestaurantPayableLineItemRow[];
}) {
  const summary = createEmptyPayableAccrualSummary();
  const billedSourceLookup = buildBilledSourceLookup(input.billedLineItems);

  input.orders.forEach((order) => {
    if (billedSourceLookup.orderCommissionIds.has(order.id)) return;

    const commissionBase = toAmount(order.total_amount) + getPointsDiscountAmount(order.metadata);
    const commissionAmount = commissionBase * 0.1;
    if (commissionAmount <= 0) return;

    summary.orderCommissionAmount += commissionAmount;
    summary.orderCommissionCount += 1;
  });

  input.reservationPayments.forEach((reservation) => {
    if (billedSourceLookup.reservationCommissionIds.has(reservation.id)) return;

    const commissionAmount = toAmount(reservation.total_amount) * 0.1;
    if (commissionAmount <= 0) return;

    summary.reservationCommissionAmount += commissionAmount;
    summary.reservationCommissionCount += 1;
  });

  input.reservationFeeRows.forEach((reservationFee) => {
    const amount = toAmount(reservationFee.billing_fee_chf);
    if (amount <= 0) return;
    if (!isBillableReservationFee(reservationFee.cancelled_by)) return;
    if (reservationFee.reservation_fee_invoice_id) return;

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

export function formatDate(value: string | null | undefined) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return format(date, "dd MMM yyyy", { locale: fr });
}

export function formatPeriod(start: string, end: string) {
  return `${format(new Date(start), "dd MMM", { locale: fr })} - ${format(new Date(end), "dd MMM", { locale: fr })}`;
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

function buildCommissionBases(
  orders: readonly RestaurantOrderRow[],
  reservations: readonly RestaurantReservationPaymentRow[],
) {
  const totals = createEmptyCommissionBaseTotals();

  orders.forEach((order) => {
    const source = classifyOrderCommissionSource(order);
    if (!source) return;

    const grossAmount = toAmount(order.total_amount) + getPointsDiscountAmount(order.metadata);
    totals[source] += grossAmount;
  });

  reservations.forEach((reservation) => {
    const source = classifyReservationCommissionSource(reservation);
    if (!source) return;
    totals[source] += toAmount(reservation.total_amount);
  });

  return totals;
}

function buildRestaurantShareBySource(bases: Record<string, number>) {
  return COMMISSION_SOURCE_ORDER.reduce(
    (accumulator, source) => ({
      ...accumulator,
      [source]: toAmount(bases[source]) * 0.9,
    }),
    {} as Record<typeof COMMISSION_SOURCE_ORDER[number], number>,
  );
}

export function useDashboardPayoutInvoiceDetailLines(invoiceId: string | null) {
  return useQuery({
    queryKey: ["dashboard-payout-invoice-lines", invoiceId],
    queryFn: async () => {
      if (!invoiceId) return [] as PayoutInvoiceDetailLine[];

      const { data, error } = await supabase.rpc("get_payout_invoice_lines", { p_invoice_id: invoiceId });
      if (error) throw error;

      return (data || []).map((row) => ({
        lineId: String(row.line_id),
        lineType: normalizeInvoiceDetailLineType(row.line_type),
        source: normalizeInvoiceDetailSource(row.source),
        reference: String(row.reference || ""),
        label: String(row.label || ""),
        occurredAt: String(row.occurred_at || ""),
        grossAmount: toAmount(row.gross_amount),
        rateApplied: toAmount(row.rate_applied),
        invoicedAmount: toAmount(row.invoiced_amount),
      })) as PayoutInvoiceDetailLine[];
    },
    enabled: !!invoiceId,
  });
}

export function useDashboardReservationFeeInvoiceDetailLines(invoiceId: string | null) {
  return useQuery({
    queryKey: ["dashboard-reservation-fee-invoice-lines", invoiceId],
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

export function useDashboardFacturesData() {
  const { selectedId, restaurants, loading: restaurantsLoading, error: restaurantsError } = useDashboardRestaurant();

  const selectedRestaurant = useMemo(
    () => restaurants.find((restaurant) => restaurant.id === selectedId) || null,
    [restaurants, selectedId],
  );

  const invoicesQuery = useQuery({
    queryKey: ["dashboard-invoices-v2", selectedId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("restaurant_invoices")
        .select("*")
        .eq("restaurant_id", selectedId!)
        .order("period_end", { ascending: false });

      if (error) throw error;
      return (data || []) as RestaurantInvoiceRow[];
    },
    enabled: !!selectedId && !restaurantsLoading,
  });

  const ordersQuery = useQuery({
    queryKey: ["dashboard-compta-orders-v2", selectedId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orders")
        .select("id, created_at, total_amount, payment_status, status, order_number, metadata, restaurant_id, restaurant_invoice_id")
        .eq("restaurant_id", selectedId!)
        .in("payment_status", ["paid", "captured"])
        .not("status", "in", "(cancelled,payment_failed,refused,pending,pending_payment)")
        .order("created_at", { ascending: false });

      if (error) throw error;
      return (data || []) as RestaurantOrderRow[];
    },
    enabled: !!selectedId && !restaurantsLoading,
  });

  const reservationsQuery = useQuery({
    queryKey: ["dashboard-compta-reservations-v2", selectedId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("reservations")
        .select("id, date, feature, metadata, total_amount, status, restaurant_id, restaurant_invoice_id")
        .eq("restaurant_id", selectedId!)
        .gt("total_amount", 0)
        .not("status", "in", "(cancelled,no_show,pending)")
        .order("date", { ascending: false });

      if (error) throw error;
      return (data || []) as RestaurantReservationPaymentRow[];
    },
    enabled: !!selectedId && !restaurantsLoading,
  });

  const reservationFeeRowsQuery = useQuery({
    queryKey: ["dashboard-reservation-fee-rows-v3", selectedId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("reservations")
        .select("id, restaurant_id, confirmed_at, billing_fee_chf, cancelled_by, reservation_fee_invoice_id")
        .eq("restaurant_id", selectedId!)
        .not("confirmed_at", "is", null)
        .order("confirmed_at", { ascending: false });
      if (error) throw error;
      return (data || []) as RestaurantReservationFeeRow[];
    },
    enabled: !!selectedId && !restaurantsLoading,
  });

  const paidCampaignsQuery = useQuery({
    queryKey: ["dashboard-paid-campaigns-v1", selectedId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ad_campaigns")
        .select("id, created_at, payment_status, paid_amount, total_budget, title")
        .eq("restaurant_id", selectedId!)
        .eq("payment_status", "paid")
        .order("created_at", { ascending: false });

      if (error) throw error;
      return (data || []) as RestaurantPaidCampaignRow[];
    },
    enabled: !!selectedId && !restaurantsLoading,
  });

  const payableLineItemsQuery = useQuery({
    queryKey: ["dashboard-payable-line-items-v1", selectedId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("restaurant_invoice_line_items")
        .select("id, restaurant_id, item_kind, source_id, source_table, amount_ttc")
        .eq("restaurant_id", selectedId!)
        .order("occurred_at", { ascending: false });

      if (error) throw error;
      return (data || []) as RestaurantPayableLineItemRow[];
    },
    enabled: !!selectedId && !restaurantsLoading,
  });

  const payoutInvoices = useMemo(
    () => (invoicesQuery.data || []).filter((invoice) => (invoice.invoice_type || "payout") === "payout"),
    [invoicesQuery.data],
  );
  const payableInvoices = useMemo(
    () => (invoicesQuery.data || []).filter((invoice) => invoice.invoice_type === "payable" || invoice.invoice_type === "reservation_fees"),
    [invoicesQuery.data],
  );

  const payoutInvoiceSections = useMemo(
    () => splitInvoicesByPaymentState(payoutInvoices),
    [payoutInvoices],
  );
  const payableInvoiceSections = useMemo(
    () => splitInvoicesByPaymentState(payableInvoices),
    [payableInvoices],
  );
  const invoiceTypeById = useMemo(
    () => new Map((invoicesQuery.data || []).map((invoice) => [invoice.id, invoice.invoice_type || "payout"])),
    [invoicesQuery.data],
  );
  const reservationFees = useMemo(() => {
    return (reservationFeeRowsQuery.data || []).reduce<ReservationFeeSummary>((accumulator, reservation) => {
      if (!isBillableReservationFee(reservation.cancelled_by)) {
        return accumulator;
      }

      if (reservation.reservation_fee_invoice_id) {
        return accumulator;
      }

      accumulator.count += 1;
      accumulator.amount += toAmount(reservation.billing_fee_chf);
      return accumulator;
    }, { count: 0, amount: 0 });
  }, [reservationFeeRowsQuery.data]);

  const commissionBases = useMemo(
    () => buildCommissionBases(ordersQuery.data || [], reservationsQuery.data || []),
    [ordersQuery.data, reservationsQuery.data],
  );

  const uninvoicedCommissionBases = useMemo(
    () => buildCommissionBases(
      (ordersQuery.data || []).filter((order) => !order.restaurant_invoice_id),
      (reservationsQuery.data || []).filter((reservation) => {
        if (!reservation.restaurant_invoice_id) return true;
        return invoiceTypeById.get(reservation.restaurant_invoice_id) !== "payout";
      }),
    ),
    [invoiceTypeById, ordersQuery.data, reservationsQuery.data],
  );
  const payableAccruals = useMemo(
    () => buildPayableAccrualSummary({
      orders: ordersQuery.data || [],
      reservationPayments: reservationsQuery.data || [],
      reservationFeeRows: reservationFeeRowsQuery.data || [],
      paidCampaigns: paidCampaignsQuery.data || [],
      billedLineItems: payableLineItemsQuery.data || [],
    }),
    [
      ordersQuery.data,
      paidCampaignsQuery.data,
      payableLineItemsQuery.data,
      reservationFeeRowsQuery.data,
      reservationsQuery.data,
    ],
  );

  const summary = useMemo(
    () => buildRestaurantAccountingSummary({
      commissionBases,
      payableInvoices: payableInvoiceSections,
      reservationFeeInvoices: payableInvoiceSections,
      payoutInvoices: payoutInvoiceSections,
      payableAccruedAmount: payableAccruals.totalAmount,
    }),
    [commissionBases, payableAccruals.totalAmount, payableInvoiceSections, payoutInvoiceSections],
  );

  const uninvoicedRestaurantShareBySource = useMemo(
    () => buildRestaurantShareBySource(uninvoicedCommissionBases),
    [uninvoicedCommissionBases],
  );
  const uninvoicedRestaurantShareTotal = useMemo(
    () => Object.values(uninvoicedRestaurantShareBySource).reduce((sum, amount) => sum + amount, 0),
    [uninvoicedRestaurantShareBySource],
  );
  const paidCampaignsTotal = useMemo(
    () => (paidCampaignsQuery.data || []).reduce((sum, campaign) => sum + getCampaignPaidAmount(campaign), 0),
    [paidCampaignsQuery.data],
  );
  const paidCampaignsCount = paidCampaignsQuery.data?.length || 0;
  const miamzReimbursementsTotal = useMemo(
    () => (ordersQuery.data || []).reduce((sum, order) => sum + getPointsDiscountAmount(order.metadata), 0),
    [ordersQuery.data],
  );
  const miamzReimbursementsOutstanding = useMemo(
    () => (ordersQuery.data || []).reduce((sum, order) => (
      order.restaurant_invoice_id
        ? sum
        : sum + getPointsDiscountAmount(order.metadata)
    ), 0),
    [ordersQuery.data],
  );
  const miamzReimbursementsCount = useMemo(
    () => (ordersQuery.data || []).filter((order) => getPointsDiscountAmount(order.metadata) > 0).length,
    [ordersQuery.data],
  );

  return {
    restaurants,
    selectedRestaurant,
    invoices: invoicesQuery.data || [],
    payoutInvoices,
    payableInvoices,
    tokFeeInvoices: payableInvoices,
    orders: ordersQuery.data || [],
    reservationPayments: reservationsQuery.data || [],
    payoutInvoiceSections,
    payableInvoiceSections,
    tokFeeInvoiceSections: payableInvoiceSections,
    reservationFees,
    payableAccruals,
    paidCampaigns: paidCampaignsQuery.data || [],
    paidCampaignsTotal,
    paidCampaignsCount,
    miamzReimbursementsTotal,
    miamzReimbursementsOutstanding,
    miamzReimbursementsCount,
    commissionBases,
    uninvoicedCommissionBases,
    uninvoicedRestaurantShareBySource,
    uninvoicedRestaurantShareTotal,
    summary,
    isLoading: restaurantsLoading
      || invoicesQuery.isLoading
      || ordersQuery.isLoading
      || reservationsQuery.isLoading
      || reservationFeeRowsQuery.isLoading
      || payableLineItemsQuery.isLoading
      || paidCampaignsQuery.isLoading,
    error: restaurantsError
      || invoicesQuery.error
      || ordersQuery.error
      || reservationsQuery.error
      || reservationFeeRowsQuery.error
      || payableLineItemsQuery.error
      || paidCampaignsQuery.error,
  };
}
