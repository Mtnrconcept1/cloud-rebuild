import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { getSupabase } from "@/integrations/supabase/client";
import { useDashboardRestaurant } from "./useDashboardRestaurant";
import type { Database, Json } from "@/integrations/supabase/types";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import DashboardLayout from "@/components/DashboardLayout";
import DashboardPageHero from "@/components/dashboard/DashboardPageHero";
import { CommercialDemoReservations } from "@/components/dashboard/CommercialDemoScenario";
import { useCommercialDemoFrame } from "@/components/commercial/CommercialDemoFrameProvider";
import RestaurantCancellationDialog from "@/components/RestaurantCancellationDialog";
import SortControls from "@/components/list/SortControls";
import OperationViewToggle, { type OperationViewMode } from "@/components/operations/OperationViewToggle";
import DayNotificationBadge from "@/components/notifications/DayNotificationBadge";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import OrderStatusBadge from "@/components/OrderStatusBadge";
import { useToast } from "@/hooks/use-toast";
import { useNotificationCenter } from "@/hooks/useNotificationCenter";
import { dispatchQueuedNotifications } from "@/lib/notificationDispatch";
import {
  cancelReservationByRestaurant,
  type CancellationReasonCode,
  updateRestaurantReservationStatus,
} from "@/lib/reservationMutations";
import {
  getRemainingRefundAmount as getRefundRemainingAmount,
  processRefund,
} from "@/lib/refundMutations";
import { getReservationStatusLockMessage } from "@/lib/statusLocks";
import { AlertTriangle, Ban, CalendarDays, Check, CreditCard, Dot, MoonStar, Search, ShieldAlert, SunMedium, UserCheck, Utensils, X } from "lucide-react";
import { getServicePeriodFromMetadata, getServicePeriodLabel } from "@/lib/serviceSettings";
import { countUnreadOperationNotificationsByDate } from "@/lib/dashboardNotificationBadges";
import { sortByColumn, type SortColumn, type SortDirection } from "@/lib/listSorting";
import {
  DASHBOARD_TIME_RANGE_OPTIONS,
  formatDashboardDateHeading,
  getTodayReferenceDate,
  isDateInDashboardTimeRange,
  type DashboardTimeRange,
} from "@/lib/dashboardTimeRange";
import {
  transitionCommercialDemoReservation,
  type CommercialDemoReservation,
  type CommercialDemoReservationTransitionAction,
  type CommercialDemoSnapshot,
} from "@/lib/commercialDemoJourney";

const supabase = getSupabase();
const DASHBOARD_RESERVATIONS_FETCH_LIMIT = 300;

type ReservationRow = Database["public"]["Tables"]["reservations"]["Row"];
type ProfileRow = Database["public"]["Tables"]["profiles"]["Row"];
type ReservationOperationalFields = {
  deposit_amount_chf?: number | null;
  deposit_status?: string | null;
  no_show_review_at?: string | null;
  progressive_offer_id?: string | null;
  progressive_offer_discount_percent?: number | null;
  progressive_offer_discount_status?: string | null;
  reservation_confirmation_deadline_at?: string | null;
  restaurant_confirmation_required?: boolean | null;
  restaurant_confirmed_at?: string | null;
};
type ReservationWithProfile = ReservationRow & ReservationOperationalFields & { customer: Pick<ProfileRow, "full_name" | "phone"> | null };
type ReservationMetadata = {
  service?: string;
  promo?: string;
  discount?: number;
  formula_applied?: string;
  formula_discount_percent?: number;
  formula_discount_amount?: number;
  progressive_offer_name?: string;
  progressive_offer_discount_percent?: number;
  progressive_offer_discount_status?: string;
  risk_level?: string;
  no_show_risk?: boolean;
  key_notes?: string[];
  payment_method?: string;
  card_last4?: string;
  preorder_items?: Array<{ name: string; quantity: number }>;
};
type ServiceFilter = "all" | "lunch" | "dinner";
type ReservationSortKey = "date" | "time" | "order_reference" | "customer" | "party_size" | "status";

const isJsonRecord = (value: Json): value is Record<string, Json> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const getSafeTime = (value: string | null | undefined) => (value && value.slice(0, 5)) || "00:00";

const formatDateTime = (value: string | null | undefined) => {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toLocaleString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const toNumber = (value: Json | undefined): number | undefined => {
  if (typeof value === "number") return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
};

const getReservationRefundSnapshot = (reservation: ReservationRow | ReservationWithProfile) => {
  const dynamicReservation = reservation as ReservationRow & Record<string, unknown>;
  const refundedAmount = Number(dynamicReservation.refunded_amount_chf || 0);
  const refundStatus = String(dynamicReservation.refund_status || "").trim().toLowerCase();
  const remainingAmount = getRefundRemainingAmount(reservation.total_amount, refundedAmount);

  return {
    refundedAmount,
    remainingAmount,
    eligible: remainingAmount > 0.009 && refundStatus !== "refunded",
  };
};

const getReservationOpsSnapshot = (reservation: ReservationRow | ReservationWithProfile) => {
  const row = reservation as ReservationWithProfile;
  const depositAmount = Math.max(0, Number(row.deposit_amount_chf || 0));
  const depositStatus = String(row.deposit_status || "not_required").toLowerCase();
  const deadlineLabel = formatDateTime(row.reservation_confirmation_deadline_at);
  const confirmedLabel = formatDateTime(row.restaurant_confirmed_at);
  const noShowReviewLabel = formatDateTime(row.no_show_review_at);
  const deadlineMs = row.reservation_confirmation_deadline_at
    ? new Date(row.reservation_confirmation_deadline_at).getTime()
    : Number.NaN;

  return {
    depositAmount,
    depositStatus,
    depositStatusLabel: depositStatus === "paid"
      ? "payé"
      : depositStatus === "pending"
        ? "en attente"
        : depositStatus === "forfeited"
          ? "conservé"
          : depositStatus === "refunded"
            ? "remboursé"
            : "non requis",
    deadlineLabel,
    confirmedLabel,
    noShowReviewLabel,
    requiresConfirmation: Boolean(row.restaurant_confirmation_required),
    confirmationOverdue: Number.isFinite(deadlineMs) && deadlineMs < Date.now() && String(reservation.status).toLowerCase() === "pending",
  };
};

const extractMetadata = (reservation: ReservationRow): ReservationMetadata => {
  const metadata = isJsonRecord(reservation.metadata) ? reservation.metadata : {};
  const riskValue = metadata.risk_level;
  const keyNotes = metadata.key_notes;
  const columnItems = Array.isArray(reservation.preorder_items) ? reservation.preorder_items : [];
  const metadataItems = Array.isArray(metadata.preorder_items) ? metadata.preorder_items : [];
  const preorderItems = columnItems.length > 0 ? columnItems : metadataItems;

  return {
    service: typeof metadata.service === "string" ? metadata.service.toLowerCase() : undefined,
    promo: typeof metadata.promo === "string" ? metadata.promo : undefined,
    discount: toNumber(metadata.discount) ?? toNumber(metadata.promo_discount_percent),
    formula_applied: typeof metadata.formula_applied === "string" ? metadata.formula_applied : undefined,
    formula_discount_percent: toNumber(metadata.formula_discount_percent),
    formula_discount_amount: toNumber(metadata.formula_discount_amount),
    progressive_offer_name: typeof metadata.progressive_offer_name === "string" ? metadata.progressive_offer_name : undefined,
    progressive_offer_discount_percent: toNumber(metadata.progressive_offer_discount_percent),
    progressive_offer_discount_status: typeof metadata.progressive_offer_discount_status === "string" ? metadata.progressive_offer_discount_status : undefined,
    risk_level: typeof riskValue === "string" ? riskValue : undefined,
    no_show_risk: typeof metadata.no_show_risk === "boolean" ? metadata.no_show_risk : undefined,
    key_notes: Array.isArray(keyNotes) && keyNotes.every((item) => typeof item === "string") ? (keyNotes as string[]) : undefined,
    payment_method: typeof metadata.payment_method === "string" ? metadata.payment_method : undefined,
    card_last4: typeof metadata.card_last4 === "string" ? metadata.card_last4 : undefined,
    preorder_items: preorderItems.length > 0 ? (preorderItems as any[]) : undefined,
  };
};

const DASHBOARD_RESERVATION_SORT_COLUMNS: SortColumn<ReservationWithProfile, ReservationSortKey>[] = [
  { key: "date", label: "Date", type: "date", getValue: (reservation) => `${reservation.date}T${getSafeTime(reservation.time)}` },
  { key: "time", label: "Heure", type: "number", getValue: (reservation) => Number(getSafeTime(reservation.time).replace(":", "")) },
  { key: "order_reference", label: "Numero", type: "text", getValue: (reservation) => reservation.order_reference || reservation.id },
  { key: "customer", label: "Nom client", type: "text", getValue: (reservation) => reservation.customer?.full_name || reservation.customer?.phone || "" },
  { key: "party_size", label: "Couverts", type: "number", getValue: (reservation) => reservation.party_size },
  { key: "status", label: "Statut", type: "text", getValue: (reservation) => reservation.status },
];

function getCommercialDemoReservationTransition(
  reservation: CommercialDemoReservation,
  targetStatus: string,
): CommercialDemoReservationTransitionAction | null {
  if (reservation.status === "pending" && targetStatus === "confirmed") return "restaurant_confirm";
  if (reservation.status === "confirmed" && targetStatus === "arrived") return "restaurant_mark_arrived";
  if (reservation.status === "confirmed" && targetStatus === "no_show") return "restaurant_mark_no_show";
  return null;
}

function buildCommercialDemoDashboardReservations(snapshot: CommercialDemoSnapshot): ReservationWithProfile[] {
  return snapshot.reservations.map((reservation) => ({
    id: reservation.id,
    restaurant_id: snapshot.session.demo_restaurant_id,
    user_id: "commercial-demo-client",
    date: reservation.reservation_date,
    time: reservation.reservation_time,
    party_size: reservation.party_size,
    status: reservation.status,
    notes: reservation.notes || null,
    order_reference: reservation.reference,
    total_amount: 0,
    feature: "classic",
    preorder_items: [],
    metadata: {
      commercial_demo: true,
      commercial_demo_version: reservation.version,
      service: Number(reservation.reservation_time.slice(0, 2)) < 17 ? "lunch" : "dinner",
    } as Json,
    created_at: reservation.created_at,
    updated_at: reservation.updated_at,
    customer: {
      full_name: reservation.customer_name,
      phone: reservation.customer_phone || null,
    },
  } as unknown as ReservationWithProfile));
}

export default function DashboardReservations() {
  const commercialDemoFrame = useCommercialDemoFrame();
  const { isDemoMode } = useDashboardRestaurant();
  if (commercialDemoFrame?.surface === "restaurant") return <LiveDashboardReservations />;
  return isDemoMode ? <CommercialDemoReservations /> : <LiveDashboardReservations />;
}

function LiveDashboardReservations() {
  const commercialDemoFrame = useCommercialDemoFrame();
  const commercialDemoSnapshot = commercialDemoFrame?.surface === "restaurant"
    ? commercialDemoFrame.snapshot
    : null;
  const isCommercialDemoRestaurant = Boolean(commercialDemoSnapshot);
  const { selectedId, restaurants, loading: restaurantsLoading, error: restaurantsError } = useDashboardRestaurant();
  const [searchParams] = useSearchParams();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [referenceDate, setReferenceDate] = useState(getTodayReferenceDate());
  const [timeRange, setTimeRange] = useState<DashboardTimeRange>("all");
  const [serviceFilter, setServiceFilter] = useState<ServiceFilter>("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [sortKey, setSortKey] = useState<ReservationSortKey>("date");
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");
  const [isCompactMode, setIsCompactMode] = useState(false);
  const [openDayKey, setOpenDayKey] = useState<string | null>(null);
  const [cancelTarget, setCancelTarget] = useState<ReservationWithProfile | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [viewMode, setViewMode] = useState<OperationViewMode>("details");
  const { unreadNotifications } = useNotificationCenter(100, { realtime: true });

  useEffect(() => {
    const reservationTarget = searchParams.get("reservation");
    if (reservationTarget) setSearchTerm(reservationTarget);
  }, [searchParams]);

  const effectiveSelectedId = commercialDemoSnapshot?.session.demo_restaurant_id || selectedId;
  const selectedRestaurant = commercialDemoSnapshot?.demo_restaurant
    || restaurants.find((restaurant) => restaurant.id === selectedId);
  const effectiveRestaurantsLoading = isCommercialDemoRestaurant ? false : restaurantsLoading;
  const effectiveRestaurantsError = isCommercialDemoRestaurant ? null : restaurantsError;
  const hasRestaurant = isCommercialDemoRestaurant || restaurants.length > 0;

  useEffect(() => {
    if (typeof window !== "undefined" && window.matchMedia("(max-width: 640px)").matches) {
      setIsCompactMode(true);
    }
  }, []);

  const productionReservationsQuery = useQuery({
    queryKey: ["dashboard-all-reservations", effectiveSelectedId],
    queryFn: async () => {
      const { data: reservationRows, error: reservationError } = await supabase
        .from("reservations")
        .select("*")
        .eq("restaurant_id", effectiveSelectedId!)
        .order("date", { ascending: false })
        .order("time", { ascending: false })
        .limit(DASHBOARD_RESERVATIONS_FETCH_LIMIT);

      if (reservationError) throw reservationError;
      if (!reservationRows?.length) return [] as ReservationWithProfile[];

      const { data: profilesData } = await supabase.rpc("get_reservation_customers" as any, {
        p_restaurant_id: effectiveSelectedId!,
      });
      const profilesByUserId = new Map(
        (profilesData || []).map((profile: any) => [
          profile.user_id,
          { full_name: profile.full_name, phone: profile.phone },
        ])
      );

      return reservationRows.map((reservation) => ({
        ...reservation,
        customer: (profilesByUserId.get(reservation.user_id) as Pick<ProfileRow, "full_name" | "phone">) || null,
      })) as ReservationWithProfile[];
    },
    enabled: Boolean(effectiveSelectedId && !isCommercialDemoRestaurant),
  });
  const commercialDemoReservations = useMemo(
    () => commercialDemoSnapshot ? buildCommercialDemoDashboardReservations(commercialDemoSnapshot) : [],
    [commercialDemoSnapshot],
  );
  const reservations = useMemo(
    () => isCommercialDemoRestaurant
      ? commercialDemoReservations
      : (productionReservationsQuery.data || []),
    [commercialDemoReservations, isCommercialDemoRestaurant, productionReservationsQuery.data],
  );
  const reservationsError = isCommercialDemoRestaurant ? null : productionReservationsQuery.error;

  const updateStatusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      if (commercialDemoSnapshot && commercialDemoFrame) {
        const demoReservation = commercialDemoSnapshot.reservations.find((reservation) => reservation.id === id);
        const action = demoReservation
          ? getCommercialDemoReservationTransition(demoReservation, status)
          : null;

        if (!demoReservation || !action) {
          throw new Error("Cette étape n'est pas disponible dans le parcours de réservation simulé.");
        }

        await transitionCommercialDemoReservation({
          reservationId: demoReservation.id,
          action,
          expectedVersion: demoReservation.version,
        });
        await commercialDemoFrame.refresh();
        return { id, status };
      }

      const result = await updateRestaurantReservationStatus(id, status);
      if (!result.ok) {
        throw new Error(result.errorMessage);
      }

      try {
        await dispatchQueuedNotifications("dashboard-reservation-status");
      } catch (dispatchError) {
        console.error("Reservation status notification dispatch failed:", dispatchError);
      }

      return { id, status };
    },
    onMutate: async ({ id, status }) => {
      if (isCommercialDemoRestaurant) {
        return { previousReservations: [] as ReservationWithProfile[], queryKey: null };
      }
      const queryKey = ["dashboard-all-reservations", selectedId];
      await queryClient.cancelQueries({ queryKey });
      const previousReservations = queryClient.getQueryData<ReservationWithProfile[]>(queryKey) || [];
      queryClient.setQueryData<ReservationWithProfile[]>(queryKey, (current = []) =>
        current.map((reservation) => (reservation.id === id ? { ...reservation, status } : reservation))
      );
      return { previousReservations, queryKey };
    },
    onError: (error: Error, _variables, context) => {
      if (context?.queryKey) queryClient.setQueryData(context.queryKey, context.previousReservations);
      toast({ title: "Erreur de mise à jour", description: error.message, variant: "destructive" });
    },
    onSuccess: ({ status }) => {
      toast({ title: "Statut mis à jour", description: `La réservation est maintenant "${status}".` });
    },
    onSettled: (_data, _error, _variables, context) => {
      if (context?.queryKey) queryClient.invalidateQueries({ queryKey: context.queryKey });
    },
  });

  const cancelMutation = useMutation({
    mutationFn: async ({
      id,
      reasonCode,
      details,
      refundNow,
      refundEligible,
    }: {
      id: string;
      reasonCode: CancellationReasonCode;
      details: string | null;
      refundNow: boolean;
      refundEligible: boolean;
    }) => {
      if (isCommercialDemoRestaurant) {
        throw new Error("L'annulation restaurateur est désactivée dans ce parcours de démonstration isolé.");
      }
      const result = await cancelReservationByRestaurant(id, reasonCode, details);
      if (!result.ok) {
        throw new Error(result.errorMessage);
      }

      const refundResult = refundNow && refundEligible
        ? await processRefund({
          targetType: "reservation",
          targetId: id,
          reason: details || reasonCode,
        })
        : null;

      try {
        await dispatchQueuedNotifications("dashboard-reservation-status");
      } catch (dispatchError) {
        console.error("Reservation cancellation notification dispatch failed:", dispatchError);
      }

      return {
        id,
        refundAttempted: refundNow && refundEligible,
        refundEligible,
        refundResult,
      };
    },
    onSuccess: (data) => {
      if (data.refundAttempted && data.refundResult?.ok) {
        toast({
          title: "Reservation annulée",
          description: `Remboursement lance pour ${Number(data.refundResult.refundAmountChf || 0).toFixed(2)} CHF.`,
        });
      } else if (data.refundAttempted && !data.refundResult?.ok) {
        toast({
          title: "Reservation annulée, remboursement en attente",
          description: data.refundResult?.errorMessage || "Le remboursement reste disponible dans la file admin.",
          variant: "destructive",
        });
      } else if (data.refundEligible) {
        toast({
          title: "Reservation annulée",
          description: "La demande de remboursement reste disponible dans la file admin.",
        });
      } else {
        toast({ title: "Reservation annulée", description: "La raison a été enregistrée." });
      }
      queryClient.invalidateQueries({ queryKey: ["dashboard-all-reservations", selectedId] });
      setCancelTarget(null);
    },
    onError: (error: Error) => {
      toast({ title: "Annulation impossible", description: error.message, variant: "destructive" });
    },
  });

  const statusOptions = useMemo(() => {
    const uniqueStatuses = Array.from(new Set(reservations.map((reservation) => reservation.status))).sort();
    return ["all", ...uniqueStatuses];
  }, [reservations]);

  const filteredReservations = useMemo(() => {
    const normalizedSearch = searchTerm.trim().toLowerCase();
    return reservations.filter((reservation) => {
      // Hide only reservations whose Stripe checkout was abandoned. 'pending' is the
      // default state for classique reservations that the restaurateur still needs
      // to confirm - those MUST stay visible.
      const status = String(reservation.status || "").toLowerCase();
      if (status === "pending_payment") return false;
      if (!isDateInDashboardTimeRange(reservation.date, timeRange, referenceDate, { dateOnly: true })) return false;
      if (serviceFilter !== "all") {
        const metadataService = extractMetadata(reservation).service;
        const derivedService =
          metadataService === "lunch" || metadataService === "dinner"
            ? metadataService
            : getServicePeriodFromMetadata(reservation.metadata, reservation.time);
        if (derivedService !== serviceFilter) return false;
      }
      if (statusFilter !== "all" && reservation.status !== statusFilter) return false;
      if (normalizedSearch) {
        const orderRef = (reservation.order_reference || "").toLowerCase();
        const customerName = (reservation.customer?.full_name || "").toLowerCase();
        const customerPhone = (reservation.customer?.phone || "").toLowerCase();
        const reservationNotes = (reservation.notes || "").toLowerCase();
        const reservationId = reservation.id.toLowerCase();
        if (
          !orderRef.includes(normalizedSearch) &&
          !customerName.includes(normalizedSearch) &&
          !customerPhone.includes(normalizedSearch) &&
          !reservationNotes.includes(normalizedSearch) &&
          !reservationId.startsWith(normalizedSearch)
        ) {
          return false;
        }
      }
      return true;
    });
  }, [referenceDate, reservations, searchTerm, serviceFilter, statusFilter, timeRange]);

  const unreadReservationNotificationsByDate = useMemo(() => (
    countUnreadOperationNotificationsByDate({
      notifications: unreadNotifications,
      items: filteredReservations,
      kind: "reservation",
      getItemId: (reservation) => reservation.id,
      getDateKey: (reservation) => reservation.date,
    })
  ), [filteredReservations, unreadNotifications]);

  const groupedReservations = useMemo(() => {
    const sorted = sortByColumn(filteredReservations, DASHBOARD_RESERVATION_SORT_COLUMNS, {
      key: sortKey,
      direction: sortDirection,
    });

    const grouped = new Map<string, Map<string, ReservationWithProfile[]>>();
    sorted.forEach((reservation) => {
      const dateKey = reservation.date;
      const slot = getSafeTime(reservation.time);
      const dateGroups = grouped.get(dateKey) || new Map<string, ReservationWithProfile[]>();
      dateGroups.set(slot, [...(dateGroups.get(slot) || []), reservation]);
      grouped.set(dateKey, dateGroups);
    });

    return Array.from(grouped.entries()).map(([dateKey, slotGroups]) => {
      const groups = Array.from(slotGroups.entries()).map(([slot, items]) => ({
        slot,
        items,
        reservationCount: items.length,
        totalGuests: items.reduce((sum, item) => sum + (item.party_size || 0), 0),
      }));

      return {
        dateKey,
        dateLabel: formatDashboardDateHeading(dateKey),
        groups,
        reservationCount: groups.reduce((sum, group) => sum + group.reservationCount, 0),
        totalGuests: groups.reduce((sum, group) => sum + group.totalGuests, 0),
        unreadNotificationCount: unreadReservationNotificationsByDate.get(dateKey) || 0,
      };
    });
  }, [filteredReservations, sortDirection, sortKey, unreadReservationNotificationsByDate]);

  const serviceBreakdown = useMemo(() => {
    return filteredReservations.reduce(
      (acc, reservation) => {
        const period = getServicePeriodFromMetadata(reservation.metadata, reservation.time);
        acc[period].count += 1;
        acc[period].covers += Number(reservation.party_size || 0);
        return acc;
      },
      {
        lunch: { count: 0, covers: 0 },
        dinner: { count: 0, covers: 0 },
      },
    );
  }, [filteredReservations]);

  const canUpdateReservationTo = (reservation: ReservationWithProfile, targetStatus: string) => {
    if (!commercialDemoSnapshot) return true;
    const demoReservation = commercialDemoSnapshot.reservations.find((item) => item.id === reservation.id);
    return Boolean(
      demoReservation
      && getCommercialDemoReservationTransition(demoReservation, targetStatus),
    );
  };

  return (
    <DashboardLayout>
      <div
        className="space-y-6"
        data-commercial-demo-source={isCommercialDemoRestaurant ? "isolated-snapshot" : undefined}
      >
        <DashboardPageHero
          badge="Salle et couverts"
          title="Reservations"
          description="Suivez les tables a confirmer, les services midi/soir, les risques de no-show et les détails de paiement par jour."
          icon={CalendarDays}
          tone="amber"
          visualLabel="Planning"
          stats={[
            { label: "Restaurant", value: selectedRestaurant?.name || "Aucun", icon: CalendarDays },
            { label: "Reservations visibles", value: filteredReservations.length, icon: UserCheck },
            { label: "Jours groupes", value: groupedReservations.length, icon: SunMedium },
          ]}
          actions={(
          <Button variant="outline" size="sm" className="sm:hidden" onClick={() => setIsCompactMode((value) => !value)}>
            {isCompactMode ? "Vue detaillee" : "Mode compact"}
          </Button>
          )}
        />

        {isCommercialDemoRestaurant ? (
          <div className="rounded-2xl border border-sky-200 bg-sky-50/80 px-4 py-3 text-sm text-sky-950 dark:border-sky-500/30 dark:bg-sky-500/10 dark:text-sky-50" role="status">
            <strong>Vrai écran Réservations.</strong> Les réservations et changements de statut restent exclusivement dans la session commerciale simulée.
          </div>
        ) : null}

        {effectiveRestaurantsLoading ? <p className="text-muted-foreground">Chargement des restaurants...</p> : null}
        {effectiveRestaurantsError ? <p className="text-destructive">Erreur lors du chargement des restaurants : {effectiveRestaurantsError}</p> : null}
        {!effectiveRestaurantsLoading && !effectiveRestaurantsError && !hasRestaurant ? (
          <p className="text-muted-foreground">Aucun restaurant lié à votre compte.</p>
        ) : null}
        {!effectiveRestaurantsLoading && !effectiveRestaurantsError && hasRestaurant && !selectedRestaurant ? (
          <p className="text-muted-foreground">Sélectionnez un restaurant depuis la barre latérale pour afficher les réservations.</p>
        ) : null}
        {reservationsError ? (
          <p className="text-destructive">Erreur lors du chargement des réservations : {(reservationsError as Error).message}</p>
        ) : null}

        {selectedRestaurant && !reservationsError ? (
          <>
            <div className="grid grid-cols-1 gap-3 rounded-xl border bg-card p-3 shadow-sm sm:grid-cols-2 sm:p-4 xl:grid-cols-7">
              <div className="space-y-1">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Rechercher</p>
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    type="text"
                    placeholder="N° réservation, client..."
                    value={searchTerm}
                    onChange={(event) => setSearchTerm(event.target.value)}
                    className="pl-8"
                  />
                </div>
              </div>
              <div className="space-y-1">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Période</p>
                <Select value={timeRange} onValueChange={(value) => setTimeRange(value as DashboardTimeRange)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Toutes" />
                  </SelectTrigger>
                  <SelectContent>
                    {DASHBOARD_TIME_RANGE_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Date de référence</p>
                <Input type="date" value={referenceDate} onChange={(event) => setReferenceDate(event.target.value)} />
              </div>
              <div className="space-y-1">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Service</p>
                <Select value={serviceFilter} onValueChange={(value) => setServiceFilter(value as ServiceFilter)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Tous les services" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Tous</SelectItem>
                    <SelectItem value="lunch">Midi</SelectItem>
                    <SelectItem value="dinner">Soir</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Statut</p>
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger>
                    <SelectValue placeholder="Tous les statuts" />
                  </SelectTrigger>
                  <SelectContent>
                    {statusOptions.map((status) => (
                      <SelectItem key={status} value={status}>
                        {status === "all" ? "Tous" : status}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <SortControls
                columns={DASHBOARD_RESERVATION_SORT_COLUMNS}
                sortKey={sortKey}
                direction={sortDirection}
                onSortKeyChange={(key) => setSortKey(key as ReservationSortKey)}
                onDirectionChange={setSortDirection}
                className="xl:col-span-2"
              />
            </div>

            <div className="grid grid-cols-3 gap-2 md:gap-3">
              <Card className="rounded-xl">
                <CardContent className="flex items-center justify-between gap-2 p-3 sm:py-4">
                  <div>
                    <p className="text-[11px] font-medium text-muted-foreground sm:text-sm">Visibles</p>
                    <p className="text-xl font-bold sm:text-2xl">{filteredReservations.length}</p>
                    <p className="text-xs text-muted-foreground">
                      {filteredReservations.reduce((sum, reservation) => sum + Number(reservation.party_size || 0), 0)} couverts
                    </p>
                  </div>
                  <Dot className="hidden h-5 w-5 text-primary sm:block" />
                </CardContent>
              </Card>
              <Card className="rounded-xl">
                <CardContent className="flex items-center justify-between gap-2 p-3 sm:py-4">
                  <div>
                    <p className="text-[11px] font-medium text-muted-foreground sm:text-sm">Midi</p>
                    <p className="text-xl font-bold sm:text-2xl">{serviceBreakdown.lunch.count}</p>
                    <p className="text-xs text-muted-foreground">{serviceBreakdown.lunch.covers} couverts</p>
                  </div>
                  <SunMedium className="hidden h-5 w-5 text-amber-500 sm:block" />
                </CardContent>
              </Card>
              <Card className="rounded-xl">
                <CardContent className="flex items-center justify-between gap-2 p-3 sm:py-4">
                  <div>
                    <p className="text-[11px] font-medium text-muted-foreground sm:text-sm">Soir</p>
                    <p className="text-xl font-bold sm:text-2xl">{serviceBreakdown.dinner.count}</p>
                    <p className="text-xs text-muted-foreground">{serviceBreakdown.dinner.covers} couverts</p>
                  </div>
                  <MoonStar className="hidden h-5 w-5 text-sky-500 sm:block" />
                </CardContent>
              </Card>
            </div>

            <div className="flex flex-col gap-3 rounded-xl border bg-card p-3 shadow-sm sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm font-semibold">Vue des réservations</p>
                <p className="text-xs text-muted-foreground">Galerie pour distinguer les types, liste pour traiter vite, détails pour ouvrir les jours.</p>
              </div>
              <OperationViewToggle value={viewMode} onChange={setViewMode} ariaLabel="Mode de vue des réservations restaurant" />
            </div>

            {viewMode !== "details" && groupedReservations.length > 0 ? (
              <div className="space-y-5">
                {groupedReservations.map((dateGroup) => (
                  <section key={dateGroup.dateKey} className="rounded-2xl border bg-card/70 p-3 shadow-sm sm:p-4">
                    <div className="mb-3 flex flex-col gap-1 border-b pb-3 sm:flex-row sm:items-end sm:justify-between">
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-bold capitalize">{dateGroup.dateLabel}</p>
                          <DayNotificationBadge count={dateGroup.unreadNotificationCount} label="nouvelle réservation" />
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {dateGroup.reservationCount} réservation(s) - {dateGroup.totalGuests} couverts
                        </p>
                      </div>
                      <Badge variant="outline" className="w-fit bg-background">
                        {dateGroup.groups.length} service{dateGroup.groups.length > 1 ? "s" : ""}
                      </Badge>
                    </div>
                    <div className={viewMode === "gallery" ? "grid grid-cols-1 gap-3 lg:grid-cols-2 2xl:grid-cols-3" : "space-y-3"}>
                      {dateGroup.groups.flatMap((group) => group.items).map((reservation) => {
                  const metadata = extractMetadata(reservation);
                  const servicePeriod = getServicePeriodFromMetadata(reservation.metadata, reservation.time);
                  const progressiveDiscountPercent = Number(
                    reservation.progressive_offer_discount_percent
                    || metadata.progressive_offer_discount_percent
                    || 0,
                  );
                  const isZeroAttente = reservation.feature === "zero-attente";
                  const isChefTable = reservation.feature === "chefs_table";
                  const hasFormula = Boolean(metadata.formula_applied || metadata.promo || progressiveDiscountPercent);
                  const typeLabel = isZeroAttente
                    ? "Zéro Attente"
                    : isChefTable
                      ? "La Table du Chef"
                      : progressiveDiscountPercent
                        ? "Promo progressive"
                        : hasFormula
                          ? "Formule promo"
                          : "À la carte";
                  const typeClass = isZeroAttente
                    ? "border-indigo-300 bg-indigo-50/70"
                    : isChefTable
                      ? "border-amber-300 bg-amber-50/70"
                      : progressiveDiscountPercent
                        ? "border-orange-300 bg-orange-50/70"
                        : hasFormula
                          ? "border-emerald-300 bg-emerald-50/70"
                          : "border-border bg-card";
                  const statusLockMessage = getReservationStatusLockMessage(reservation);
                  const opsSnapshot = getReservationOpsSnapshot(reservation);
                  const isArrived = reservation.status === "arrived";
                  const isCardLocked = Boolean(statusLockMessage) || isArrived;
                  const isConfirmedAck = reservation.status === "confirmed";

                  return (
                    <article key={reservation.id} className={`flex h-full min-w-0 flex-col justify-between overflow-hidden rounded-2xl border p-4 shadow-sm ${typeClass}`}>
                      <div className="min-w-0 space-y-3">
                        <div className="min-w-0 space-y-2">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="min-w-0 break-words text-base font-semibold">{reservation.customer?.full_name || "Client inconnu"}</span>
                            <OrderStatusBadge status={reservation.status} />
                            <Badge variant="outline" className="bg-white/70">{typeLabel}</Badge>
                            <Badge variant="secondary">{reservation.party_size} pers.</Badge>
                          </div>
                          <div className="grid grid-cols-1 gap-2 text-xs min-[520px]:grid-cols-3">
                            <div className="rounded-lg border bg-white/70 p-2">
                              <p className="text-muted-foreground">Date</p>
                              <p className="font-semibold">{new Date(reservation.date).toLocaleDateString("fr-FR", { day: "2-digit", month: "short" })}</p>
                            </div>
                            <div className="rounded-lg border bg-white/70 p-2">
                              <p className="text-muted-foreground">Heure</p>
                              <p className="font-semibold">{getSafeTime(reservation.time)}</p>
                            </div>
                            <div className="rounded-lg border bg-white/70 p-2">
                              <p className="text-muted-foreground">Service</p>
                              <p className="font-semibold">{getServicePeriodLabel(servicePeriod)}</p>
                            </div>
                          </div>
                          {viewMode === "gallery" && (metadata.preorder_items?.length || reservation.notes) ? (
                            <p className="line-clamp-2 text-xs text-muted-foreground">
                              {metadata.preorder_items?.slice(0, 2).map((item) => `${item.quantity}x ${item.name}`).join(" · ") || reservation.notes}
                            </p>
                          ) : null}
                        </div>
                        <div className="grid grid-cols-1 gap-2 border-t pt-3 sm:grid-cols-3">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => updateStatusMutation.mutate({ id: reservation.id, status: "arrived" })}
                            disabled={updateStatusMutation.isPending || isCardLocked || !canUpdateReservationTo(reservation, "arrived")}
                            className={isArrived ? "border-emerald-200 bg-emerald-600 text-white hover:bg-emerald-600 disabled:opacity-100" : undefined}
                          >
                            <UserCheck className="mr-1 h-4 w-4" />
                            Arrivée
                          </Button>
                          <Button
                            size="sm"
                            onClick={() => updateStatusMutation.mutate({ id: reservation.id, status: "confirmed" })}
                            disabled={updateStatusMutation.isPending || isCardLocked || isConfirmedAck || !canUpdateReservationTo(reservation, "confirmed")}
                            className={isConfirmedAck ? "bg-emerald-600 text-white hover:bg-emerald-600 disabled:opacity-100" : undefined}
                          >
                            <Check className="mr-1 h-4 w-4" />
                            Confirmée
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setCancelTarget(reservation)}
                            disabled={isCommercialDemoRestaurant || isArrived || reservation.status === "cancelled" || reservation.status === "no_show" || cancelMutation.isPending}
                            className="text-destructive"
                          >
                            <Ban className="mr-1 h-4 w-4" />
                            Annuler
                          </Button>
                        </div>
                      </div>
                      {opsSnapshot.requiresConfirmation ? (
                        <p className="mt-3 text-xs text-muted-foreground">
                          Confirmation restaurant{opsSnapshot.deadlineLabel ? ` avant ${opsSnapshot.deadlineLabel}` : ""}
                        </p>
                      ) : null}
                    </article>
                  );
                      })}
                    </div>
                  </section>
                ))}
              </div>
            ) : null}

            {viewMode === "details" && groupedReservations.length > 0 ? (
              <Accordion
                type="single"
                collapsible
                className="space-y-4"
                value={openDayKey ?? undefined}
                onValueChange={(value) => setOpenDayKey(value || null)}
              >
                {groupedReservations.map((dateGroup) => (
                  <AccordionItem
                    key={dateGroup.dateKey}
                    value={dateGroup.dateKey}
                    className="overflow-hidden rounded-xl border bg-card shadow-sm"
                  >
                    <AccordionTrigger className="px-4 py-3 text-left hover:no-underline">
                      <div className="flex flex-1 flex-wrap items-center justify-between gap-2 pr-4">
                        <div>
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-semibold capitalize">{dateGroup.dateLabel}</p>
                            <DayNotificationBadge count={dateGroup.unreadNotificationCount} label="nouvelle réservation" />
                          </div>
                          <p className="text-xs text-muted-foreground">
                            {dateGroup.reservationCount} réservation(s) - {dateGroup.totalGuests} couverts
                          </p>
                        </div>
                      </div>
                    </AccordionTrigger>
                    <AccordionContent className="px-4 pb-4">
                      <div className="space-y-3">
                        {dateGroup.groups.map((group) => (
                          <div key={`${dateGroup.dateKey}-${group.slot}`} className="space-y-2">
                            <div className="flex items-center justify-between rounded-lg border border-dashed bg-background/80 px-3 py-2 text-sm">
                              <div className="flex items-center gap-2 font-semibold">
                                <Dot className="h-4 w-4" />
                                <span>{group.slot}</span>
                              </div>
                              <p className="text-muted-foreground">
                                {group.reservationCount} réservation(s) - {group.totalGuests} couverts
                              </p>
                            </div>
                            <div className="space-y-2">
                              {group.items.map((reservation) => {
                                const metadata = extractMetadata(reservation);
                                const servicePeriod = getServicePeriodFromMetadata(reservation.metadata, reservation.time);
                                const hasNoShowRisk = metadata.no_show_risk || metadata.risk_level === "high";
                                const keyNotes = metadata.key_notes || [];
                                const progressiveDiscountPercent = Number(
                                  reservation.progressive_offer_discount_percent
                                  || metadata.progressive_offer_discount_percent
                                  || 0,
                                );
                                const progressiveStatus = String(
                                  reservation.progressive_offer_discount_status
                                  || metadata.progressive_offer_discount_status
                                  || "",
                                );
                                const offerName = metadata.progressive_offer_name || metadata.formula_applied || metadata.promo;
                                const offerDiscountPercent = progressiveDiscountPercent || metadata.formula_discount_percent || metadata.discount;
                                const offerDiscountAmount = metadata.formula_discount_amount;
                                const offerLabel = progressiveDiscountPercent
                                  ? progressiveStatus === "finalized"
                                    ? "Offre progressive finale"
                                    : "Offre progressive en cours"
                                  : metadata.formula_applied
                                    ? "Formule"
                                    : "Promo";
                                const compactBase = isCompactMode ? "p-3" : "p-4";
                                const statusLockMessage = getReservationStatusLockMessage(reservation);
                                const refundSnapshot = getReservationRefundSnapshot(reservation);
                                const opsSnapshot = getReservationOpsSnapshot(reservation);
                                const isArrived = reservation.status === "arrived";
                                const isReservationLocked = Boolean(statusLockMessage);
                                const isCardLocked = isReservationLocked || isArrived;
                                const isConfirmedAck = reservation.status === "confirmed";
                                const effectiveLockMessage = isArrived
                                  ? "Carte verrouillée après l'arrivée du client."
                                  : statusLockMessage;

                                const isZeroAttente = reservation.feature === "zero-attente";
                                const isChefTable = reservation.feature === "chefs_table";
                                const articleClass = isZeroAttente
                                  ? `rounded-2xl border-2 border-l-4 border-indigo-300 bg-indigo-50/40 shadow-sm ${compactBase}`
                                  : isChefTable
                                    ? `rounded-2xl border-2 border-l-4 border-amber-300 bg-amber-50/40 shadow-sm ${compactBase}`
                                    : `rounded-2xl border border-l-4 bg-card shadow-sm ${compactBase}`;

                                return (
                                  <article key={reservation.id} className={articleClass}>
                                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                                      <div className="space-y-2">
                                        <div className="flex flex-wrap items-center gap-2">
                                          <span className="font-semibold">{reservation.customer?.full_name || "Client inconnu"}</span>
                                          {reservation.order_reference ? (
                                            <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground">{reservation.order_reference}</span>
                                          ) : null}
                                          <OrderStatusBadge status={reservation.status} />
                                          <Badge variant="secondary">{reservation.party_size} pers.</Badge>
                                          <Badge variant="outline">{getServicePeriodLabel(servicePeriod)}</Badge>
                                          {isZeroAttente && (
                                            <Badge className="border-indigo-300 bg-indigo-500 text-[10px] uppercase tracking-widest text-white">Zéro Attente</Badge>
                                          )}
                                          {isChefTable && (
                                            <Badge className="border-amber-300 bg-amber-500 text-[10px] uppercase tracking-widest text-white">La Table du Chef</Badge>
                                          )}
                                        </div>
                                        {!isCompactMode ? (
                                          <p className="text-sm text-muted-foreground">
                                            {new Date(reservation.date).toLocaleDateString("fr-FR")} - {getSafeTime(reservation.time)}
                                            {reservation.customer?.phone ? ` - ${reservation.customer.phone}` : ""}
                                          </p>
                                        ) : null}
                                        <div className="grid gap-2 text-xs sm:grid-cols-3">
                                          <div className="rounded-xl border bg-background/80 p-3">
                                            <p className="text-muted-foreground">Date</p>
                                            <p className="font-semibold">{new Date(reservation.date).toLocaleDateString("fr-FR")} - {getSafeTime(reservation.time)}</p>
                                          </div>
                                          <div className="rounded-xl border bg-background/80 p-3">
                                            <p className="text-muted-foreground">Service</p>
                                            <p className="font-semibold">{getServicePeriodLabel(servicePeriod)}</p>
                                          </div>
                                          <div className="rounded-xl border bg-background/80 p-3">
                                            <p className="text-muted-foreground">Montant</p>
                                            <p className="font-semibold text-primary">{reservation.total_amount > 0 ? `${Number(reservation.total_amount).toFixed(2)} CHF` : "Sur place"}</p>
                                          </div>
                                        </div>
                                        <div className="flex flex-wrap gap-2">
                                          {offerName || typeof offerDiscountPercent === "number" ? (
                                            <Badge variant="outline" className="text-[11px]">
                                              {offerLabel}
                                              {offerName ? ` - ${offerName}` : ""}
                                              {typeof offerDiscountPercent === "number" ? ` - -${offerDiscountPercent}%` : ""}
                                              {typeof offerDiscountAmount === "number" && offerDiscountAmount > 0
                                                ? ` - -${offerDiscountAmount.toFixed(2)} CHF`
                                                : ""}
                                            </Badge>
                                          ) : null}
                                          {hasNoShowRisk ? (
                                            <Badge variant="destructive" className="text-[11px]">
                                              <ShieldAlert className="mr-1 h-3 w-3" />
                                              Risque no-show
                                            </Badge>
                                          ) : null}
                                          {keyNotes.slice(0, 2).map((note) => (
                                            <Badge key={note} variant="outline" className="text-[11px]">
                                              {note}
                                            </Badge>
                                          ))}
                                          {opsSnapshot.requiresConfirmation ? (
                                            <Badge
                                              variant={opsSnapshot.confirmationOverdue ? "destructive" : "outline"}
                                              className="text-[11px]"
                                            >
                                              Confirmation restaurant
                                              {opsSnapshot.deadlineLabel ? ` avant ${opsSnapshot.deadlineLabel}` : ""}
                                            </Badge>
                                          ) : null}
                                          {opsSnapshot.confirmedLabel ? (
                                            <Badge variant="outline" className="border-emerald-200 bg-emerald-50 text-[11px] text-emerald-700">
                                              Confirmée restaurant le {opsSnapshot.confirmedLabel}
                                            </Badge>
                                          ) : null}
                                          {opsSnapshot.depositAmount > 0 ? (
                                            <Badge variant="outline" className="text-[11px]">
                                              Acompte {opsSnapshot.depositAmount.toFixed(2)} CHF - {opsSnapshot.depositStatusLabel}
                                            </Badge>
                                          ) : null}
                                          {opsSnapshot.noShowReviewLabel ? (
                                            <Badge variant="destructive" className="text-[11px]">
                                              No-show a revoir le {opsSnapshot.noShowReviewLabel}
                                            </Badge>
                                          ) : null}
                                          {reservation.notes && !isCompactMode ? (
                                            <Badge variant="outline" className="text-[11px]">
                                              <AlertTriangle className="mr-1 h-3 w-3" />
                                              {reservation.notes}
                                            </Badge>
                                          ) : null}
                                        </div>

                                        {!isCompactMode ? (
                                          <div className="mt-4 space-y-3 border-t pt-3">
                                            {metadata.preorder_items && metadata.preorder_items.length > 0 ? (
                                              <div className="space-y-1.5">
                                                <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase text-muted-foreground">
                                                  <Utensils className="h-3 w-3" />
                                                  Plats réservés
                                                </p>
                                                <div className="grid grid-cols-1 gap-1.5">
                                                  {metadata.preorder_items.map((item, index) => (
                                                    <div key={index} className="flex items-center gap-2 rounded-lg bg-muted/20 p-2 text-sm">
                                                      <span className="text-xs font-bold text-primary">x{item.quantity}</span>
                                                      <span className="font-medium">{item.name}</span>
                                                    </div>
                                                  ))}
                                                </div>
                                              </div>
                                            ) : null}

                                            <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                                              {metadata.payment_method ? (
                                                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                                                  <CreditCard className="h-3.5 w-3.5" />
                                                  <span>
                                                    Paiement : <strong className="uppercase text-foreground">{metadata.payment_method}</strong>
                                                  </span>
                                                  {metadata.card_last4 ? (
                                                    <span className="rounded bg-secondary px-1.5 py-0.5 font-mono">**** {metadata.card_last4}</span>
                                                  ) : null}
                                                </div>
                                              ) : null}
                                              {opsSnapshot.depositAmount > 0 ? (
                                                <div className="text-sm font-semibold text-foreground">
                                                  Acompte : {opsSnapshot.depositAmount.toFixed(2)} CHF ({opsSnapshot.depositStatusLabel})
                                                </div>
                                              ) : null}
                                            </div>
                                          </div>
                                        ) : null}
                                      </div>

                                      <div className="flex flex-wrap gap-2 sm:justify-end">
                                        <Button
                                          size="sm"
                                          variant="outline"
                                          onClick={() => updateStatusMutation.mutate({ id: reservation.id, status: "arrived" })}
                                          disabled={updateStatusMutation.isPending || isCardLocked || !canUpdateReservationTo(reservation, "arrived")}
                                          className={isArrived ? "border-emerald-200 bg-emerald-600 text-white hover:bg-emerald-600 disabled:opacity-100" : undefined}
                                        >
                                          <UserCheck className="mr-1 h-4 w-4" />
                                          Arrivee
                                        </Button>
                                        <Button
                                          size="sm"
                                          variant="outline"
                                          onClick={() => setCancelTarget(reservation)}
                                          disabled={
                                            isCommercialDemoRestaurant ||
                                            isArrived ||
                                            reservation.status === "cancelled" ||
                                            reservation.status === "no_show" ||
                                            cancelMutation.isPending
                                          }
                                          className="text-destructive"
                                        >
                                          <Ban className="mr-1 h-4 w-4" />
                                          Annuler
                                        </Button>
                                        {refundSnapshot.eligible ? (
                                          <p className="w-full text-xs text-destructive sm:text-right">
                                            Remboursement possible: {refundSnapshot.remainingAmount.toFixed(2)} CHF
                                          </p>
                                        ) : null}
                                        <Button
                                          size="sm"
                                          variant="outline"
                                          onClick={() => updateStatusMutation.mutate({ id: reservation.id, status: "no_show" })}
                                          disabled={updateStatusMutation.isPending || isCardLocked || !canUpdateReservationTo(reservation, "no_show")}
                                          className="text-destructive"
                                        >
                                          <X className="mr-1 h-4 w-4" />
                                          No-show
                                        </Button>
                                        <Button
                                          size="sm"
                                          onClick={() => updateStatusMutation.mutate({ id: reservation.id, status: "confirmed" })}
                                          disabled={updateStatusMutation.isPending || isCardLocked || isConfirmedAck || !canUpdateReservationTo(reservation, "confirmed")}
                                          className={isConfirmedAck ? "bg-emerald-600 text-white hover:bg-emerald-600 disabled:opacity-100" : undefined}
                                        >
                                          <Check className="mr-1 h-4 w-4" />
                                          Confirmée
                                          {isConfirmedAck ? (
                                            <span className="ml-2 rounded-full bg-white/20 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide">
                                              Vu
                                            </span>
                                          ) : null}
                                        </Button>
                                      </div>
                                      {effectiveLockMessage ? (
                                        <p className="text-xs text-muted-foreground sm:text-right">
                                          {effectiveLockMessage}
                                        </p>
                                      ) : null}
                                    </div>
                                  </article>
                                );
                              })}
                            </div>
                          </div>
                        ))}
                      </div>
                    </AccordionContent>
                  </AccordionItem>
                ))}
              </Accordion>
            ) : (
              <p className="py-10 text-center text-muted-foreground">Aucune réservation pour les filtres sélectionnés.</p>
            )}
          </>
        ) : null}
      </div>
      <RestaurantCancellationDialog
        open={Boolean(cancelTarget) && !isCommercialDemoRestaurant}
        targetLabel={
          cancelTarget
            ? `${cancelTarget.customer?.full_name ?? "Client"} - ${cancelTarget.date} ${getSafeTime(cancelTarget.time)}`
            : undefined
        }
        submitting={cancelMutation.isPending}
        refundEligible={cancelTarget ? getReservationRefundSnapshot(cancelTarget).eligible : false}
        refundAmountChf={cancelTarget ? getReservationRefundSnapshot(cancelTarget).remainingAmount : 0}
        refundHint={cancelTarget && getReservationRefundSnapshot(cancelTarget).eligible
          ? "Decochez pour laisser le remboursement en file admin."
          : null}
        onOpenChange={(open) => {
          if (!open) {
            setCancelTarget(null);
          }
        }}
        onConfirm={({ reasonCode, details, refundNow }) => {
          if (!cancelTarget || isCommercialDemoRestaurant) return;
          const refundSnapshot = getReservationRefundSnapshot(cancelTarget);
          cancelMutation.mutate({
            id: cancelTarget.id,
            reasonCode,
            details,
            refundNow,
            refundEligible: refundSnapshot.eligible,
          });
        }}
      />
    </DashboardLayout>
  );
}
