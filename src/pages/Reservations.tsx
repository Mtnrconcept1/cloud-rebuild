import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { CalendarDays, ChevronDown, ChevronRight, Clock, Receipt, Users, Utensils } from "lucide-react";

import CustomerDashboardLayout from "@/components/CustomerDashboardLayout";
import OrderStatusBadge from "@/components/OrderStatusBadge";
import ReservationDetailModal from "@/components/ReservationDetailModal";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { getSupabase } from "@/integrations/supabase/client";
import type { Database, Json } from "@/integrations/supabase/types";
import { useAuth } from "@/lib/auth-context";

const supabase = getSupabase();

type ReservationSort =
  | "reservation_date_desc"
  | "reservation_date_asc"
  | "created_at_desc"
  | "created_at_asc";

type ReservationRow = Database["public"]["Tables"]["reservations"]["Row"];
type RestaurantName = Pick<Database["public"]["Tables"]["restaurants"]["Row"], "name">;
type ReservationWithRestaurant = ReservationRow & {
  restaurants: RestaurantName | RestaurantName[] | null;
};

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
    default: return null;
  }
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

export default function Reservations() {
  const { user } = useAuth();
  const [searchParams] = useSearchParams();
  const [sortBy, setSortBy] = useState<ReservationSort>("reservation_date_desc");
  const [selectedReservation, setSelectedReservation] = useState<ReservationWithRestaurant | null>(null);
  const [expandedReservations, setExpandedReservations] = useState<Set<string>>(new Set());

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
    const list = [...(reservations || [])];
    list.sort((a, b) => {
      const reservedA = getReservedDateTimeMs(a);
      const reservedB = getReservedDateTimeMs(b);
      const createdA = new Date(a.created_at).getTime();
      const createdB = new Date(b.created_at).getTime();
      switch (sortBy) {
        case "reservation_date_asc": return reservedA - reservedB;
        case "created_at_desc": return createdB - createdA;
        case "created_at_asc": return createdA - createdB;
        case "reservation_date_desc":
        default: return reservedB - reservedA;
      }
    });
    return list;
  }, [reservations, sortBy]);

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
  } : null;

  return (
    <CustomerDashboardLayout>
      <div className="space-y-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h1 className="font-display text-3xl font-bold">Mes réservations</h1>
          <div className="w-full sm:w-[320px]">
            <Select value={sortBy} onValueChange={(value) => setSortBy(value as ReservationSort)}>
              <SelectTrigger>
                <SelectValue placeholder="Trier les réservations" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="reservation_date_desc">Date de table : plus récente</SelectItem>
                <SelectItem value="reservation_date_asc">Date de table : plus ancienne</SelectItem>
                <SelectItem value="created_at_desc">Date de creation : plus récente</SelectItem>
                <SelectItem value="created_at_asc">Date de creation : plus ancienne</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {isLoading ? (
          <div className="space-y-4">{[1, 2, 3].map((i) => <div key={i} className="h-20 animate-pulse rounded-xl bg-muted" />)}</div>
        ) : sortedReservations.length > 0 ? (
          <div className="space-y-3">
            {sortedReservations.map((reservation) => {
              const isZeroAttente = isZeroAttenteReservation(reservation);
              const timeValue = getDisplayTime(reservation);
              const restaurantName = getRestaurantName(reservation.restaurants);
              const featureBadge = getFeatureBadge(reservation.feature);
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
                      </div>
                      <ChevronIcon className="h-5 w-5 text-muted-foreground" />
                    </div>
                  </button>

                  {isExpanded ? (
                    <div className="space-y-4 border-t p-4">
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
