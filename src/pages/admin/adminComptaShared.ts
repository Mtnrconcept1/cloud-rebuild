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
  type CommissionBaseTotals,
} from "@/lib/comptaCommissionSources";
import { buildTokAccountingSummary } from "@/lib/comptaFlow";
import { splitInvoicesByPaymentState } from "@/lib/dashboardInvoices";
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
  status: string;
  order_number: string | null;
  metadata: Record<string, unknown> | null;
  restaurant_id: string;
  restaurant_invoice_id: string | null;
  restaurants?: { name: string | null } | null;
};

export type AdminReservationPaymentRow = {
  id: string;
  date: string;
  feature: string | null;
  metadata: Record<string, unknown> | null;
  total_amount: number | string | null;
  status: string;
  restaurant_id: string;
  restaurants?: { name: string | null } | null;
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
  created_at: string;
  invoice_type: "payout" | "reservation_fees" | null;
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

export type AdminReservationFeeAccrualRow = {
  id: string;
  restaurant_id: string;
  confirmed_at: string | null;
  billing_fee_chf: number | string | null;
  cancelled_by: string | null;
  restaurant_invoice_id: string | null;
  invoice_type: "payout" | "reservation_fees" | null;
  restaurants?: { name: string | null } | null;
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

export function buildMonthOptions() {
  const options: Array<{ value: string; label: string }> = [];

  for (let index = 0; index < 6; index += 1) {
    const date = new Date();
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

function sumBySource(bases: CommissionBaseTotals, rate: number) {
  return COMMISSION_SOURCE_ORDER.reduce((sum, source) => sum + bases[source] * rate, 0);
}

function getCampaignPaidAmount(campaign: Pick<AdminCampaignRow, "paid_amount" | "total_budget">) {
  const paidAmount = toAmount(campaign.paid_amount);
  return paidAmount > 0 ? paidAmount : toAmount(campaign.total_budget);
}

function isBillableReservationFee(row: Pick<AdminReservationFeeAccrualRow, "cancelled_by" | "invoice_type">) {
  const cancelledBy = String(row.cancelled_by || "").trim().toLowerCase();
  if (!(cancelledBy === "" || (cancelledBy !== "customer" && cancelledBy !== "admin"))) {
    return false;
  }

  return row.invoice_type !== "reservation_fees";
}

export function useAdminComptaData(selectedRestaurant: string, selectedMonth: string) {
  const monthBounds = useMemo(() => buildMonthBounds(selectedMonth), [selectedMonth]);
  const monthOptions = useMemo(() => buildMonthOptions(), []);

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
      if (error) throw error;
      return (data || []) as AdminOrderRow[];
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
          restaurant_invoice_id,
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

      const rows = (data || []) as Array<Omit<AdminReservationFeeAccrualRow, "invoice_type">>;
      const invoiceIds = Array.from(new Set(rows.map((row) => row.restaurant_invoice_id).filter(Boolean))) as string[];
      const invoiceTypeById = new Map<string, "payout" | "reservation_fees" | null>();

      if (invoiceIds.length > 0) {
        const { data: invoices, error: invoicesError } = await supabase
          .from("restaurant_invoices")
          .select("id, invoice_type")
          .in("id", invoiceIds);

        if (invoicesError) throw invoicesError;

        (invoices || []).forEach((invoice) => {
          invoiceTypeById.set(invoice.id, (invoice.invoice_type || "payout") as "payout" | "reservation_fees");
        });
      }

      return rows
        .map((row) => ({
          ...row,
          invoice_type: row.restaurant_invoice_id ? invoiceTypeById.get(row.restaurant_invoice_id) || null : null,
        }) satisfies AdminReservationFeeAccrualRow)
        .filter(isBillableReservationFee);
    },
  });

  const reservationsQuery = useQuery({
    queryKey: ["admin-compta-reservation-payments-v2", selectedRestaurant, selectedMonth],
    queryFn: async () => {
      let query = supabase
        .from("reservations")
        .select(`
          id,
          date,
          feature,
          metadata,
          total_amount,
          status,
          restaurant_id,
          restaurants ( name )
        `)
        .gte("date", monthBounds.monthStart)
        .lte("date", monthBounds.monthEnd)
        .gt("total_amount", 0)
        .not("status", "in", "(cancelled,no_show,pending)");

      if (selectedRestaurant !== "all") {
        query = query.eq("restaurant_id", selectedRestaurant);
      }

      const { data, error } = await query.order("date", { ascending: false });
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

  const tokFeeInvoicesQuery = useQuery({
    queryKey: ["admin-compta-reservation-fee-invoices-v2", selectedRestaurant, selectedMonth],
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
          created_at,
          invoice_type,
          restaurants ( name )
        `)
        .eq("invoice_type", "reservation_fees")
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

  const commissionBases = useMemo(
    () => buildCommissionBases(ordersQuery.data || [], reservationsQuery.data || []),
    [ordersQuery.data, reservationsQuery.data],
  );

  const payoutInvoiceSections = useMemo(
    () => splitInvoicesByPaymentState(payoutInvoicesQuery.data || []),
    [payoutInvoicesQuery.data],
  );
  const tokFeeInvoiceSections = useMemo(
    () => splitInvoicesByPaymentState(tokFeeInvoicesQuery.data || []),
    [tokFeeInvoicesQuery.data],
  );

  const summary = useMemo(
    () => buildTokAccountingSummary({
      commissionBases,
      reservationFeeInvoices: tokFeeInvoiceSections,
      payoutInvoices: payoutInvoiceSections,
      reservationFeeAccruedAmount: (reservationFeeAccrualsQuery.data || []).reduce(
        (sum, row) => sum + toAmount(row.billing_fee_chf),
        0,
      ),
    }),
    [commissionBases, payoutInvoiceSections, reservationFeeAccrualsQuery.data, tokFeeInvoiceSections],
  );

  const paidEventGross = useMemo(
    () => sumBySource(commissionBases, 1),
    [commissionBases],
  );
  const reservationFeeAccrualCount = reservationFeeAccrualsQuery.data?.length || 0;
  const reservationFeeAccrualAmount = useMemo(
    () => (reservationFeeAccrualsQuery.data || []).reduce((sum, row) => sum + toAmount(row.billing_fee_chf), 0),
    [reservationFeeAccrualsQuery.data],
  );
  const paidCampaignsTotal = useMemo(
    () => (campaignsQuery.data || []).reduce((sum, campaign) => sum + getCampaignPaidAmount(campaign), 0),
    [campaignsQuery.data],
  );
  const paidCampaignsCount = campaignsQuery.data?.length || 0;
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
    restaurants: restaurantsQuery.data || [],
    orders: ordersQuery.data || [],
    reservationPayments: reservationsQuery.data || [],
    reservationFeeAccruals: reservationFeeAccrualsQuery.data || [],
    paidCampaigns: campaignsQuery.data || [],
    payoutInvoices: payoutInvoicesQuery.data || [],
    tokFeeInvoices: tokFeeInvoicesQuery.data || [],
    payoutInvoiceSections,
    tokFeeInvoiceSections,
    commissionBases,
    summary,
    paidEventGross,
    reservationFeeAccrualCount,
    reservationFeeAccrualAmount,
    paidCampaignsTotal,
    paidCampaignsCount,
    miamzReimbursementsTotal,
    miamzReimbursementsOutstanding,
    miamzReimbursementsCount,
    monthOptions,
    isLoading: restaurantsQuery.isLoading
      || ordersQuery.isLoading
      || reservationsQuery.isLoading
      || reservationFeeAccrualsQuery.isLoading
      || campaignsQuery.isLoading
      || payoutInvoicesQuery.isLoading
      || tokFeeInvoicesQuery.isLoading,
    error: restaurantsQuery.error
      || ordersQuery.error
      || reservationsQuery.error
      || reservationFeeAccrualsQuery.error
      || campaignsQuery.error
      || payoutInvoicesQuery.error
      || tokFeeInvoicesQuery.error,
  };
}
