import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { CalendarDays, ChevronDown, ChevronRight, Clock, Receipt, Users, Utensils } from "lucide-react";

import CustomerDashboardLayout from "@/components/CustomerDashboardLayout";
import OrderStatusBadge from "@/components/OrderStatusBadge";
import ReservationDetailModal from "@/components/ReservationDetailModal";
import SortControls from "@/components/list/SortControls";
import OperationViewToggle, { type OperationViewMode } from "@/components/operations/OperationViewToggle";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getSupabase } from "@/integrations/supabase/client";
import type { Database, Json } from "@/integrations/supabase/types";
import { useAuth } from "@/lib/auth-context";
import { sortByColumn, type SortColumn, type SortDirection } from "@/lib/listSorting";

const supabase = getSupabase();

type ReservationSortKey = "reservation_date" | "created_at" | "restaurant" | "number" | "status";

type ReservationRow = Database["public"]["Tables"]["reservations"]["Row"];
type RestaurantName = Pick<Database["public"]["Tables"]["restaurants"]["Row"], "name">;
type ProgressiveReservationFields = {
  progressive_offer_id?: string | null;
  progressive_offer_discount_percent?: number | null;
  progressive_offer_discount_status?: string | null;
};
type ReservationWithRestaurant = ReservationRow & {
  restaurants: RestaurantName | RestaurantName[] | null;
} & ProgressiveReservationFields;

type ReservationMetadata = {
  feature?: string;
  arrival_time?: string;
  arrivalTime?: string;
};

type PreorderSummaryItem = {
  name: string;
  quantity: number;
  totalPrice: number;
};

const isJsonRecord = (value: Json): value is Record<string, Json> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const getReservationMetadata = (reservation: ReservationWithRestaurant): ReservationMetadata => {
  if (!isJsonRecord(reservation.metadata)) return {};
  const feature = typeof reservation.metadata.feature === "string" ? reservation.metadata.feature : undefined;
  const arrivalTimeSnake = typeof reservation.metadata.arrival_time === "string" ? reservation.metadata.arrival_time : undefined;
  const arrivalTimeCamel = typeof reservation.metadata.arrivalTime === "string" ? reservation.metadata.arrivalTime : undefined;
  return { feature, arrival_time: arrivalTimeSnake, arrivalTime: arrivalTimeCamel };
};

const isZeroAttenteReservation = (reservation: ReservationWithRestaurant) => {
  const metadata = getReservationMetadata(reservation);
  return reservation.feature === "zero-attente" || metadata.feature === "zero-attente";
};

const getDisplayTime = (reservation: ReservationWithRestaurant) => {
  if (!isZeroAttenteReservation(reservation)) return reservation.time;
  const metadata = getReservationMetadata(reservation);
  return metadata.arrival_time || metadata.arrivalTime || reservation.time;
};

const getReservedDateTimeMs = (reservation: ReservationWithRestaurant) => {
  const timeValue = getDisplayTime(reservation);
  const reservationDateTime = new Date(`${reservation.date}T${timeValue || "00:00:00"}`).getTime();
  if (!Number.isNaN(reservationDateTime)) return reservationDateTime;
  return new Date(reservation.date).getTime();
};

const getRestaurantName = (restaurant: ReservationWithRestaurant["restaurants"]) => {
  if (!restaurant) return "";
  return Array.isArray(restaurant) ? (restaurant[0]?.name || "") : restaurant.name;
};

const getFeatureBadge = (feature: string) => {
  switch (feature) {
    case "zero-attente": return { label: "Zéro attente", className: "border-indigo-200 text-indigo-600 bg-indigo-50" };
    case "chefs_table": return { label: "La Table du Chef", className: "border-amber-200 text-amber-600 bg-amber-50" };
    case "promo-formule": return { label: "Formule promo", className: "border-emerald-200 text-emerald-600 bg-emerald-50" };
    case "promo-offre": return { label: "Offre promo", className: "border-emerald-200 text-emerald-600 bg-emerald-50" };
    case "promo-progressive": return { label: "Offre progressive", className: "border-orange-200 text-orange-600 bg-orange-50" };
    default: return null;
  }
};

const getProgressiveDiscountSnapshot = (reservation: ReservationWithRestaurant) => {
  const metadata = isJsonRecord(reservation.metadata) ? reservation.metadata : {};
  const percent = Number(
    reservation.progressive_offer_discount_percent
    || metadata.progressive_offer_discount_percent
    || 0,
  );
  if (!percent) return null;
  const status = String(
    reservation.progressive_offer_discount_status
    || metadata.progressive_offer_discount_status
    || "pending",
  );
  return {
    percent,
    status,
    label: status === "finalized" ? "Remise finale" : "Remise en cours",
  };
};

const getPreorderItems = (reservation: ReservationWithRestaurant): PreorderSummaryItem[] => {
  const metadata = isJsonRecord(reservation.metadata) ? reservation.metadata : {};
  const fromColumn = Array.isArray(reservation.preorder_items) ? reservation.preorder_items : [];
  const fromMetadata = Array.isArray(metadata.preorder_items)
    ? metadata.preorder_items
    : Array.isArray(metadata.drops)
      ? metadata.drops
      : [];
  const source = fromColumn.length > 0 ? fromColumn : fromMetadata;

  return source
    .filter((item): item is Record<string, Json> => isJsonRecord(item as Json))
    .map((item) => {
      const quantity = Number(item.quantity || 1);
      const unitPrice = Number(item.unit_price || item.price || 0);
      const totalPrice = Number(item.total_price || unitPrice * Math.max(quantity, 1));
      return {
        name: String(item.name || item.dish || "Article"),
        quantity,
        totalPrice,
      };
    });
};

const formatShortDate = (date: string) => new Date(date).toLocaleDateString("fr-FR", {
  day: "2-digit",
  month: "short",
  year: "numeric",
});

const RESERVATION_SORT_COLUMNS: SortColumn<ReservationWithRestaurant, ReservationSortKey>[] = [
  { key: "reservation_date", label: "Date de table", type: "date", getValue: getReservedDateTimeMs },
  { key: "created_at", label: "Date de creation", type: "date", getValue: (reservation) => reservation.created_at },
  { key: "restaurant", label: "Nom du restaurant", type: "text", getValue: (reservation) => getRestaurantName(reservation.restaurants) },
  { key: "number", label: "Numero", type: "text", getValue: (reservation) => reservation.order_reference || reservation.id },
  { key: "status", label: "Statut", type: "text", getValue: (reservation) => reservation.status },
];

export default function Reservations() {
  const { user } = useAuth();
  const [searchParams] = useSearchParams();
  const [sortKey, setSortKey] = useState<ReservationSortKey>("reservation_date");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");
  const [selectedReservation, setSelectedReservation] = useState<ReservationWithRestaurant | null>(null);
  const [expandedReservations, setExpandedReservations] = useState<Set<string>>(new Set());
  const [viewMode, setViewMode] = useState<OperationViewMode>("details");

  const { data: reservations, isLoading } = useQuery({
    queryKey: ["my-reservations", user?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("reservations")
        .select("*, restaurants(name)")
        .eq("user_id", user!.id)
        .order("date", { ascending: false });
      return (data || []) as ReservationWithRestaurant[];
    },
    enabled: !!user,
  });

  useEffect(() => {
    const reservationId = searchParams.get("reservation");
    if (!reservationId || !reservations?.length) return;

    const reservation = reservations.find((item) => item.id === reservationId);
    if (reservation) setSelectedReservation(reservation);
  }, [reservations, searchParams]);

  const sortedReservations = useMemo(() => {
    return sortByColumn(reservations || [], RESERVATION_SORT_COLUMNS, {
      key: sortKey,
      direction: sortDirection,
    });
  }, [reservations, sortDirection, sortKey]);

  const toggleReservation = (reservationId: string) => {
    setExpandedReservations((current) => {
      const next = new Set(current);
      if (next.has(reservationId)) next.delete(reservationId);
      else next.add(reservationId);
      return next;
    });
  };

  const modalDetail = selectedReservation ? {
    id: selectedReservation.id,
    date: selectedReservation.date,
    time: getDisplayTime(selectedReservation) || selectedReservation.time,
    party_size: selectedReservation.party_size,
    status: selectedReservation.status,
    feature: selectedReservation.feature,
    notes: selectedReservation.notes,
    total_amount: selectedReservation.total_amount,
    created_at: selectedReservation.created_at,
    metadata: selectedReservation.metadata,
    preorder_items: selectedReservation.preorder_items,
    restaurant_name: getRestaurantName(selectedReservation.restaurants),
    progressive_offer_id: selectedReservation.progressive_offer_id,
    progressive_offer_discount_percent: selectedReservation.progressive_offer_discount_percent,
    progressive_offer_discount_status: selectedReservation.progressive_offer_discount_status,
  } : null;

  return (
    <CustomerDashboardLayout>
      <div className="space-y-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h1 className="font-display text-3xl font-bold">Mes réservations</h1>
          <SortControls
            columns={RESERVATION_SORT_COLUMNS}
            sortKey={sortKey}
            direction={sortDirection}
            onSortKeyChange={(key) => setSortKey(key as ReservationSortKey)}
            onDirectionChange={setSortDirection}
            className="w-full sm:w-[440px]"
          />
        </div>
        <div className="flex flex-col gap-3 rounded-2xl border bg-card p-3 shadow-sm sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-semibold">Présentation des réservations</p>
            <p className="text-xs text-muted-foreground">Galerie pour parcourir, liste pour comparer, détails pour ouvrir une réservation.</p>
          </div>
          <OperationViewToggle value={viewMode} onChange={setViewMode} ariaLabel="Mode de vue des réservations client" />
        </div>

        {isLoading ? (
          <div className="space-y-4">{[1, 2, 3].map((i) => <div key={i} className="h-20 animate-pulse rounded-xl bg-muted" />)}</div>
        ) : sortedReservations.length > 0 ? (
          viewMode !== "details" ? (
            <div className={viewMode === "gallery" ? "grid gap-3 md:grid-cols-2 xl:grid-cols-3" : "space-y-3"}>
              {sortedReservations.map((reservation) => {
                const isZeroAttente = isZeroAttenteReservation(reservation);
                const timeValue = getDisplayTime(reservation);
                const restaurantName = getRestaurantName(reservation.restaurants);
                const featureBadge = getFeatureBadge(reservation.feature);
                const progressiveDiscount = getProgressiveDiscountSnapshot(reservation);
                const preorderItems = getPreorderItems(reservation);
                const typeLabel = progressiveDiscount
                  ? "Offre progressive"
                  : featureBadge?.label || (isZeroAttente ? "Zéro attente" : "À la carte");

                return (
                  <article key={reservation.id} className="rounded-2xl border bg-card p-4 shadow-sm transition hover:border-primary/30">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 space-y-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="break-words font-bold">{restaurantName || "Restaurant"}</p>
                          <OrderStatusBadge status={reservation.status} />
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          <Badge variant="outline" className={featureBadge?.className}>{typeLabel}</Badge>
                          <Badge variant="secondary">{formatShortDate(reservation.date)}</Badge>
                          {timeValue ? <Badge variant="outline">{timeValue}</Badge> : null}
                          {reservation.party_size ? <Badge variant="outline">{reservation.party_size} personne(s)</Badge> : null}
                        </div>
                      </div>
                      <div className="shrink-0 text-right">
                        <p className="font-bold text-primary">
                          {Number(reservation.total_amount || 0) > 0 ? `${Number(reservation.total_amount).toFixed(2)} CHF` : "Sur place"}
                        </p>
                        {progressiveDiscount ? (
                          <p className="text-xs font-semibold text-orange-700">-{progressiveDiscount.percent}%</p>
                        ) : null}
                      </div>
                    </div>
                    {viewMode === "gallery" && preorderItems.length > 0 ? (
                      <p className="mt-3 line-clamp-2 text-xs text-muted-foreground">
                        {preorderItems.slice(0, 3).map((item) => `${item.quantity}x ${item.name}`).join(" · ")}
                      </p>
                    ) : null}
                    <Button type="button" variant="outline" size="sm" className="mt-3" onClick={() => setSelectedReservation(reservation)}>
                      Détails et annulation
                    </Button>
                  </article>
                );
              })}
            </div>
          ) : (
          <div className="space-y-3">
            {sortedReservations.map((reservation) => {
              const isZeroAttente = isZeroAttenteReservation(reservation);
              const timeValue = getDisplayTime(reservation);
              const restaurantName = getRestaurantName(reservation.restaurants);
              const featureBadge = getFeatureBadge(reservation.feature);
              const progressiveDiscount = getProgressiveDiscountSnapshot(reservation);
              const preorderItems = getPreorderItems(reservation);
              const isExpanded = expandedReservations.has(reservation.id);
              const ChevronIcon = isExpanded ? ChevronDown : ChevronRight;

              return (
                <div key={reservation.id} className="overflow-hidden rounded-xl border bg-card shadow-sm transition-all hover:border-primary/30">
                  <button
                    type="button"
                    onClick={() => toggleReservation(reservation.id)}
                    aria-expanded={isExpanded}
                    className="flex w-full items-center justify-between gap-4 p-4 text-left transition-colors hover:bg-muted/40"
                  >
                    <div className="min-w-0 space-y-1">
                      <div className="flex min-w-0 flex-wrap items-center gap-2">
                        <h3 className="truncate font-semibold">{restaurantName || "Restaurant"}</h3>
                        <OrderStatusBadge status={reservation.status} />
                      </div>
                      <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
                        <span>{formatShortDate(reservation.date)}</span>
                        {timeValue ? <span>{timeValue}</span> : null}
                        {reservation.party_size ? <span>{reservation.party_size} personne(s)</span> : null}
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-3 text-right">
                      <div>
                        <p className="text-sm font-bold text-primary">
                          {Number(reservation.total_amount || 0) > 0 ? `${Number(reservation.total_amount).toFixed(2)} CHF` : "A regler sur place"}
                        </p>
                        {featureBadge ? (
                          <Badge variant="outline" className={`mt-1 text-[10px] uppercase tracking-widest ${featureBadge.className}`}>
                            {featureBadge.label}
                          </Badge>
                        ) : !featureBadge && isZeroAttente ? (
                          <Badge variant="outline" className="mt-1 text-[10px] uppercase tracking-widest border-indigo-200 bg-indigo-50 text-indigo-600">
                            Zéro attente
                          </Badge>
                        ) : null}
                        {progressiveDiscount ? (
                          <Badge variant="outline" className="mt-1 border-orange-200 bg-orange-50 text-[10px] uppercase tracking-widest text-orange-700">
                            {progressiveDiscount.label} -{progressiveDiscount.percent}%
                          </Badge>
                        ) : null}
                      </div>
                      <ChevronIcon className="h-5 w-5 text-muted-foreground" />
                    </div>
                  </button>

                  {isExpanded ? (
                    <div className="space-y-4 border-t bg-muted/10 p-4">
                      <div className="grid gap-3 sm:grid-cols-3">
                        <div className="rounded-lg border bg-muted/20 p-3">
                          <CalendarDays className="mb-2 h-4 w-4 text-primary" />
                          <p className="text-xs text-muted-foreground">Date</p>
                          <p className="text-sm font-semibold">{formatShortDate(reservation.date)}</p>
                        </div>
                        <div className="rounded-lg border bg-muted/20 p-3">
                          <Clock className="mb-2 h-4 w-4 text-primary" />
                          <p className="text-xs text-muted-foreground">Heure</p>
                          <p className="text-sm font-semibold">{timeValue || "-"}</p>
                        </div>
                        <div className="rounded-lg border bg-muted/20 p-3">
                          <Users className="mb-2 h-4 w-4 text-primary" />
                          <p className="text-xs text-muted-foreground">Couverts</p>
                          <p className="text-sm font-semibold">{reservation.party_size || 0}</p>
                        </div>
                      </div>

                      {preorderItems.length > 0 ? (
                        <div className="space-y-2">
                          <h4 className="flex items-center gap-2 text-sm font-semibold">
                            <Utensils className="h-4 w-4 text-muted-foreground" />
                            Plats précommandés
                          </h4>
                          <div className="divide-y rounded-lg border">
                            {preorderItems.map((item, index) => (
                              <div key={`${item.name}-${index}`} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                                <span>{item.quantity}x {item.name}</span>
                                <span className="font-medium">{item.totalPrice.toFixed(2)} CHF</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      ) : null}

                      {reservation.notes ? (
                        <div className="rounded-lg bg-muted/30 p-3 text-sm">
                          <p className="mb-1 font-medium">Notes</p>
                          <p className="text-muted-foreground">{reservation.notes}</p>
                        </div>
                      ) : null}

                      {progressiveDiscount ? (
                        <div className="rounded-lg border border-orange-200 bg-orange-50 p-3 text-sm text-orange-800">
                          <p className="font-medium">Offre progressive</p>
                          <p>{progressiveDiscount.label}: -{progressiveDiscount.percent}% sur la reservation.</p>
                        </div>
                      ) : null}

                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <Receipt className="h-4 w-4" />
                          <span>Reservee le {formatShortDate(reservation.created_at)}</span>
                        </div>
                        <Button type="button" variant="outline" size="sm" onClick={() => setSelectedReservation(reservation)}>
                          Details et annulation
                        </Button>
                      </div>
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
          )
        ) : (
          <div className="space-y-2 py-12 text-center">
            <CalendarDays className="mx-auto h-10 w-10 text-muted-foreground" />
            <p className="text-muted-foreground">Aucune réservation pour le moment</p>
          </div>
        )}
      </div>

      <ReservationDetailModal
        reservation={modalDetail}
        open={!!selectedReservation}
        onOpenChange={(open) => { if (!open) setSelectedReservation(null); }}
      />
    </CustomerDashboardLayout>
  );
}
