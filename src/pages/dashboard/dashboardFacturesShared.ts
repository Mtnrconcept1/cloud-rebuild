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
  invoice_type: "payout" | "reservation_fees" | null;
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
  restaurant_invoice_id: string | null;
};

export type RestaurantPaidCampaignRow = {
  id: string;
  created_at: string;
  payment_status: string;
  paid_amount: number | null;
  total_budget: number | null;
  title: string | null;
};

type ReservationFeeSummary = {
  count: number;
  amount: number;
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
        .select("id, restaurant_id, confirmed_at, billing_fee_chf, cancelled_by, restaurant_invoice_id")
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

  const payoutInvoices = useMemo(
    () => (invoicesQuery.data || []).filter((invoice) => (invoice.invoice_type || "payout") === "payout"),
    [invoicesQuery.data],
  );
  const tokFeeInvoices = useMemo(
    () => (invoicesQuery.data || []).filter((invoice) => invoice.invoice_type === "reservation_fees"),
    [invoicesQuery.data],
  );

  const payoutInvoiceSections = useMemo(
    () => splitInvoicesByPaymentState(payoutInvoices),
    [payoutInvoices],
  );
  const tokFeeInvoiceSections = useMemo(
    () => splitInvoicesByPaymentState(tokFeeInvoices),
    [tokFeeInvoices],
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

      const linkedInvoiceType = reservation.restaurant_invoice_id
        ? invoiceTypeById.get(reservation.restaurant_invoice_id) || null
        : null;

      if (linkedInvoiceType === "reservation_fees") {
        return accumulator;
      }

      accumulator.count += 1;
      accumulator.amount += toAmount(reservation.billing_fee_chf);
      return accumulator;
    }, { count: 0, amount: 0 });
  }, [invoiceTypeById, reservationFeeRowsQuery.data]);

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

  const summary = useMemo(
    () => buildRestaurantAccountingSummary({
      commissionBases,
      reservationFeeInvoices: tokFeeInvoiceSections,
      payoutInvoices: payoutInvoiceSections,
      reservationFeeAccruedAmount: reservationFees.amount,
    }),
    [commissionBases, payoutInvoiceSections, reservationFees.amount, tokFeeInvoiceSections],
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
    tokFeeInvoices,
    orders: ordersQuery.data || [],
    reservationPayments: reservationsQuery.data || [],
    payoutInvoiceSections,
    tokFeeInvoiceSections,
    reservationFees,
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
      || paidCampaignsQuery.isLoading,
    error: restaurantsError
      || invoicesQuery.error
      || ordersQuery.error
      || reservationsQuery.error
      || reservationFeeRowsQuery.error
      || paidCampaignsQuery.error,
  };
}
