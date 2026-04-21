import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { fr } from "date-fns/locale";

import {
  classifyOrderCommissionSource,
  classifyReservationCommissionSource,
  COMMISSION_SOURCE_ORDER,
  createEmptyCommissionBaseTotals,
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
  const monthStart = `${selectedMonth}-01`;
  const monthStartDate = new Date(`${selectedMonth}-01T00:00:00Z`);
  const monthEnd = new Date(monthStartDate.getFullYear(), monthStartDate.getMonth() + 1, 0)
    .toISOString()
    .slice(0, 10);

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

    const metadata = order.metadata && typeof order.metadata === "object" ? order.metadata : {};
    const grossAmount = toAmount(order.total_amount) + toAmount(metadata.points_discount_amount);
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
    }),
    [commissionBases, payoutInvoiceSections, tokFeeInvoiceSections],
  );

  const paidEventGross = useMemo(
    () => sumBySource(commissionBases, 1),
    [commissionBases],
  );

  return {
    restaurants: restaurantsQuery.data || [],
    orders: ordersQuery.data || [],
    reservationPayments: reservationsQuery.data || [],
    payoutInvoices: payoutInvoicesQuery.data || [],
    tokFeeInvoices: tokFeeInvoicesQuery.data || [],
    payoutInvoiceSections,
    tokFeeInvoiceSections,
    commissionBases,
    summary,
    paidEventGross,
    monthOptions,
    isLoading: restaurantsQuery.isLoading
      || ordersQuery.isLoading
      || reservationsQuery.isLoading
      || payoutInvoicesQuery.isLoading
      || tokFeeInvoicesQuery.isLoading,
    error: restaurantsQuery.error
      || ordersQuery.error
      || reservationsQuery.error
      || payoutInvoicesQuery.error
      || tokFeeInvoicesQuery.error,
  };
}
