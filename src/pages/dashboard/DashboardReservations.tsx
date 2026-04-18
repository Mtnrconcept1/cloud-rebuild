import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useDashboardRestaurant } from "./DashboardContext";
import type { Database, Json } from "@/integrations/supabase/types";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import DashboardLayout from "@/components/DashboardLayout";
import RestaurantCancellationDialog from "@/components/RestaurantCancellationDialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import OrderStatusBadge from "@/components/OrderStatusBadge";
import { useToast } from "@/hooks/use-toast";
import { dispatchQueuedNotifications } from "@/lib/notificationDispatch";
import {
  cancelReservationByRestaurant,
  type CancellationReasonCode,
  updateRestaurantReservationStatus,
} from "@/lib/reservationMutations";
import { getReservationStatusLockMessage } from "@/lib/statusLocks";
import { AlertTriangle, Ban, Check, CreditCard, Dot, MoonStar, ShieldAlert, SunMedium, UserCheck, Utensils, X } from "lucide-react";
import { getServicePeriodFromMetadata, getServicePeriodLabel } from "@/lib/serviceSettings";
import {
  DASHBOARD_TIME_RANGE_OPTIONS,
  formatDashboardDateHeading,
  getTodayReferenceDate,
  isDateInDashboardTimeRange,
  type DashboardTimeRange,
} from "@/lib/dashboardTimeRange";

type ReservationRow = Database["public"]["Tables"]["reservations"]["Row"];
type ProfileRow = Database["public"]["Tables"]["profiles"]["Row"];
type ReservationWithProfile = ReservationRow & { customer: Pick<ProfileRow, "full_name" | "phone"> | null };
type ReservationMetadata = {
  service?: string;
  promo?: string;
  discount?: number;
  formula_applied?: string;
  formula_discount_percent?: number;
  formula_discount_amount?: number;
  risk_level?: string;
  no_show_risk?: boolean;
  key_notes?: string[];
  payment_method?: string;
  card_last4?: string;
  preorder_items?: Array<{ name: string; quantity: number }>;
};
type ServiceFilter = "all" | "lunch" | "dinner";
type SortBy = "time" | "party_size" | "status";

const isJsonRecord = (value: Json): value is Record<string, Json> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const getSafeTime = (value: string | null | undefined) => (value && value.slice(0, 5)) || "00:00";

const toNumber = (value: Json | undefined): number | undefined => {
  if (typeof value === "number") return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
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
    risk_level: typeof riskValue === "string" ? riskValue : undefined,
    no_show_risk: typeof metadata.no_show_risk === "boolean" ? metadata.no_show_risk : undefined,
    key_notes: Array.isArray(keyNotes) && keyNotes.every((item) => typeof item === "string") ? (keyNotes as string[]) : undefined,
    payment_method: typeof metadata.payment_method === "string" ? metadata.payment_method : undefined,
    card_last4: typeof metadata.card_last4 === "string" ? metadata.card_last4 : undefined,
    preorder_items: preorderItems.length > 0 ? (preorderItems as any[]) : undefined,
  };
};

export default function DashboardReservations() {
  const { selectedId, restaurants, loading: restaurantsLoading, error: restaurantsError } = useDashboardRestaurant();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [referenceDate, setReferenceDate] = useState(getTodayReferenceDate());
  const [timeRange, setTimeRange] = useState<DashboardTimeRange>("all");
  const [serviceFilter, setServiceFilter] = useState<ServiceFilter>("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [sortBy, setSortBy] = useState<SortBy>("time");
  const [isCompactMode, setIsCompactMode] = useState(false);
  const [cancelTarget, setCancelTarget] = useState<ReservationWithProfile | null>(null);

  const selectedRestaurant = restaurants.find((restaurant) => restaurant.id === selectedId);

  useEffect(() => {
    if (typeof window !== "undefined" && window.matchMedia("(max-width: 640px)").matches) {
      setIsCompactMode(true);
    }
  }, []);

  const { data: reservations = [], error: reservationsError } = useQuery({
    queryKey: ["dashboard-all-reservations", selectedId],
    queryFn: async () => {
      const { data: reservationRows, error: reservationError } = await supabase
        .from("reservations")
        .select("*")
        .eq("restaurant_id", selectedId!)
        .order("date", { ascending: true })
        .order("time", { ascending: true });

      if (reservationError) throw reservationError;
      if (!reservationRows?.length) return [] as ReservationWithProfile[];

      const { data: profilesData } = await supabase.rpc("get_reservation_customers" as any, {
        p_restaurant_id: selectedId!,
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
    enabled: !!selectedId,
  });

  const updateStatusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
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
      toast({ title: "Erreur de mise a jour", description: error.message, variant: "destructive" });
    },
    onSuccess: ({ status }) => {
      toast({ title: "Statut mis a jour", description: `La reservation est maintenant "${status}".` });
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
    }: {
      id: string;
      reasonCode: CancellationReasonCode;
      details: string | null;
    }) => {
      const result = await cancelReservationByRestaurant(id, reasonCode, details);
      if (!result.ok) {
        throw new Error(result.errorMessage);
      }

      try {
        await dispatchQueuedNotifications("dashboard-reservation-status");
      } catch (dispatchError) {
        console.error("Reservation cancellation notification dispatch failed:", dispatchError);
      }

      return { id };
    },
    onSuccess: () => {
      toast({ title: "Reservation annulee", description: "La raison a ete enregistree." });
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

  const filteredReservations = useMemo(() => (
    reservations.filter((reservation) => {
      // Hide reservations that never reached confirmation (Stripe still pending or
      // restaurateur hasn't confirmed manually). They are not actionable yet.
      const status = String(reservation.status || "").toLowerCase();
      if (status === "pending" || status === "pending_payment") return false;
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
      return true;
    })
  ), [referenceDate, reservations, serviceFilter, statusFilter, timeRange]);

  const groupedReservations = useMemo(() => {
    const sorted = [...filteredReservations].sort((a, b) => {
      const byDate = a.date.localeCompare(b.date, "fr");
      if (byDate !== 0) return byDate;
      if (sortBy === "party_size" && b.party_size !== a.party_size) return b.party_size - a.party_size;
      if (sortBy === "status") {
        const byStatus = a.status.localeCompare(b.status, "fr");
        if (byStatus !== 0) return byStatus;
      }
      return getSafeTime(a.time).localeCompare(getSafeTime(b.time), "fr");
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
      };
    });
  }, [filteredReservations, sortBy]);

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

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h1 className="font-display text-3xl font-bold">Reservations</h1>
          <Button variant="outline" size="sm" className="sm:hidden" onClick={() => setIsCompactMode((value) => !value)}>
            {isCompactMode ? "Vue detaillee" : "Mode compact"}
          </Button>
        </div>

        {restaurantsLoading ? <p className="text-muted-foreground">Chargement des restaurants...</p> : null}
        {restaurantsError ? <p className="text-destructive">Erreur lors du chargement des restaurants : {restaurantsError}</p> : null}
        {!restaurantsLoading && !restaurantsError && restaurants.length === 0 ? (
          <p className="text-muted-foreground">Aucun restaurant lie a votre compte.</p>
        ) : null}
        {!restaurantsLoading && !restaurantsError && restaurants.length > 0 && !selectedRestaurant ? (
          <p className="text-muted-foreground">Selectionnez un restaurant depuis la barre laterale pour afficher les reservations.</p>
        ) : null}
        {selectedRestaurant ? (
          <div className="space-y-1">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Restaurant actif</p>
            <p className="text-sm font-semibold">{selectedRestaurant.name}</p>
          </div>
        ) : null}
        {reservationsError ? (
          <p className="text-destructive">Erreur lors du chargement des reservations : {(reservationsError as Error).message}</p>
        ) : null}

        {selectedRestaurant && !reservationsError ? (
          <>
            <div className="grid grid-cols-1 gap-3 rounded-xl border bg-card p-4 sm:grid-cols-2 xl:grid-cols-5">
              <div className="space-y-1">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Periode</p>
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
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Date de reference</p>
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
              <div className="space-y-1">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Tri</p>
                <Select value={sortBy} onValueChange={(value) => setSortBy(value as SortBy)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Trier" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="time">Heure d'arrivee</SelectItem>
                    <SelectItem value="party_size">Taille du groupe</SelectItem>
                    <SelectItem value="status">Statut</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-3">
              <Card>
                <CardContent className="flex items-center justify-between py-4">
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Reservations visibles</p>
                    <p className="text-2xl font-bold">{filteredReservations.length}</p>
                    <p className="text-xs text-muted-foreground">
                      {filteredReservations.reduce((sum, reservation) => sum + Number(reservation.party_size || 0), 0)} couverts
                    </p>
                  </div>
                  <Dot className="h-5 w-5 text-primary" />
                </CardContent>
              </Card>
              <Card>
                <CardContent className="flex items-center justify-between py-4">
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Service midi</p>
                    <p className="text-2xl font-bold">{serviceBreakdown.lunch.count}</p>
                    <p className="text-xs text-muted-foreground">{serviceBreakdown.lunch.covers} couverts</p>
                  </div>
                  <SunMedium className="h-5 w-5 text-amber-500" />
                </CardContent>
              </Card>
              <Card>
                <CardContent className="flex items-center justify-between py-4">
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Service soir</p>
                    <p className="text-2xl font-bold">{serviceBreakdown.dinner.count}</p>
                    <p className="text-xs text-muted-foreground">{serviceBreakdown.dinner.covers} couverts</p>
                  </div>
                  <MoonStar className="h-5 w-5 text-sky-500" />
                </CardContent>
              </Card>
            </div>

            {groupedReservations.length > 0 ? (
              <div className="space-y-4">
                {groupedReservations.map((dateGroup) => (
                  <section key={dateGroup.dateKey} className="space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border bg-muted/20 px-4 py-3">
                      <div>
                        <p className="text-sm font-semibold capitalize">{dateGroup.dateLabel}</p>
                        <p className="text-xs text-muted-foreground">
                          {dateGroup.reservationCount} reservation(s) - {dateGroup.totalGuests} couverts
                        </p>
                      </div>
                    </div>

                    {dateGroup.groups.map((group) => (
                      <div key={`${dateGroup.dateKey}-${group.slot}`} className="space-y-2">
                        <div className="flex items-center justify-between rounded-lg border border-dashed px-3 py-2 text-sm">
                          <div className="flex items-center gap-2 font-semibold">
                            <Dot className="h-4 w-4" />
                            <span>{group.slot}</span>
                          </div>
                          <p className="text-muted-foreground">
                            {group.reservationCount} reservation(s) - {group.totalGuests} couverts
                          </p>
                        </div>
                        <div className="space-y-2">
                          {group.items.map((reservation) => {
                        const metadata = extractMetadata(reservation);
                        const servicePeriod = getServicePeriodFromMetadata(reservation.metadata, reservation.time);
                        const hasNoShowRisk = metadata.no_show_risk || metadata.risk_level === "high";
                        const keyNotes = metadata.key_notes || [];
                        const offerName = metadata.formula_applied || metadata.promo;
                        const offerDiscountPercent = metadata.formula_discount_percent ?? metadata.discount;
                        const offerDiscountAmount = metadata.formula_discount_amount;
                        const offerLabel = metadata.formula_applied ? "Formule" : "Promo";
                        const compactBase = isCompactMode ? "p-3" : "p-4";
                        const statusLockMessage = getReservationStatusLockMessage(reservation);
                        const isReservationLocked = Boolean(statusLockMessage);

                        const isZeroAttente = reservation.feature === "zero-attente";
                        const isChefTable = reservation.feature === "chefs_table";
                        const articleClass = isZeroAttente
                          ? `rounded-xl border-2 border-indigo-300 bg-indigo-50/40 ${compactBase}`
                          : isChefTable
                          ? `rounded-xl border-2 border-amber-300 bg-amber-50/40 ${compactBase}`
                          : `rounded-xl border bg-card ${compactBase}`;

                            return (
                              <article key={reservation.id} className={articleClass}>
                                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                                  <div className="space-y-2">
                                    <div className="flex flex-wrap items-center gap-2">
                                      <span className="font-semibold">{reservation.customer?.full_name || "Client inconnu"}</span>
                                      <OrderStatusBadge status={reservation.status} />
                                      <Badge variant="secondary">{reservation.party_size} pers.</Badge>
                                      <Badge variant="outline">{getServicePeriodLabel(servicePeriod)}</Badge>
                                      {isZeroAttente && (
                                        <Badge className="text-[10px] uppercase tracking-widest border-indigo-300 text-white bg-indigo-500">Zero Attente</Badge>
                                      )}
                                      {isChefTable && (
                                        <Badge className="text-[10px] uppercase tracking-widest border-amber-300 text-white bg-amber-500">Chef's Table</Badge>
                                      )}
                                    </div>
                                    {!isCompactMode ? (
                                      <p className="text-sm text-muted-foreground">
                                        {new Date(reservation.date).toLocaleDateString("fr-FR")} - {getSafeTime(reservation.time)}
                                        {reservation.customer?.phone ? ` - ${reservation.customer.phone}` : ""}
                                      </p>
                                    ) : null}
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
                                              Plats reserves
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
                                          {reservation.total_amount > 0 ? (
                                            <div className="text-sm font-bold text-primary">
                                              Total : {Number(reservation.total_amount).toFixed(2)} CHF
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
                                      disabled={updateStatusMutation.isPending || isReservationLocked}
                                    >
                                      <UserCheck className="mr-1 h-4 w-4" />
                                      Arrivee
                                    </Button>
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      onClick={() => setCancelTarget(reservation)}
                                      disabled={
                                        isReservationLocked ||
                                        reservation.status === "no_show" ||
                                        cancelMutation.isPending
                                      }
                                      className="text-destructive"
                                    >
                                      <Ban className="mr-1 h-4 w-4" />
                                      Annuler
                                    </Button>
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      onClick={() => updateStatusMutation.mutate({ id: reservation.id, status: "no_show" })}
                                      disabled={updateStatusMutation.isPending || isReservationLocked}
                                      className="text-destructive"
                                    >
                                      <X className="mr-1 h-4 w-4" />
                                      No-show
                                    </Button>
                                    <Button
                                      size="sm"
                                      onClick={() =>
                                        updateStatusMutation.mutate({
                                          id: reservation.id,
                                          status: reservation.status === "confirmed" ? "pending" : "confirmed",
                                        })
                                      }
                                      disabled={updateStatusMutation.isPending || isReservationLocked}
                                    >
                                      <Check className="mr-1 h-4 w-4" />
                                      {reservation.status === "confirmed" ? "Reservee" : "Confirmee"}
                                    </Button>
                                  </div>
                                  {statusLockMessage ? (
                                    <p className="text-xs text-muted-foreground sm:text-right">
                                      {statusLockMessage}
                                    </p>
                                  ) : null}
                                </div>
                              </article>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </section>
                ))}
              </div>
            ) : (
              <p className="py-10 text-center text-muted-foreground">Aucune reservation pour les filtres selectionnes.</p>
            )}
          </>
        ) : null}
      </div>
      <RestaurantCancellationDialog
        open={Boolean(cancelTarget)}
        reservationLabel={
          cancelTarget
            ? `${cancelTarget.customer?.full_name ?? "Client"} - ${cancelTarget.date} ${getSafeTime(cancelTarget.time)}`
            : undefined
        }
        submitting={cancelMutation.isPending}
        onOpenChange={(open) => {
          if (!open) {
            setCancelTarget(null);
          }
        }}
        onConfirm={(reasonCode, details) => {
          if (!cancelTarget) return;
          cancelMutation.mutate({ id: cancelTarget.id, reasonCode, details });
        }}
      />
    </DashboardLayout>
  );
}
