import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { getSupabase } from "@/integrations/supabase/client";
import type { Database, Json } from "@/integrations/supabase/types";
import { useAuth } from "@/lib/auth";
import OrderStatusBadge from "@/components/OrderStatusBadge";
import { CalendarDays, ChevronRight } from "lucide-react";
import CustomerDashboardLayout from "@/components/CustomerDashboardLayout";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import ReservationDetailModal from "@/components/ReservationDetailModal";

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
    case "chefs_table": return { label: "Chef's Table", className: "border-amber-200 text-amber-600 bg-amber-50" };
    case "promo-formule": return { label: "Formule promo", className: "border-emerald-200 text-emerald-600 bg-emerald-50" };
    case "promo-offre": return { label: "Offre promo", className: "border-emerald-200 text-emerald-600 bg-emerald-50" };
    default: return null;
  }
};

export default function Reservations() {
  const { user } = useAuth();
  const [sortBy, setSortBy] = useState<ReservationSort>("reservation_date_desc");
  const [selectedReservation, setSelectedReservation] = useState<ReservationWithRestaurant | null>(null);

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
                <SelectItem value="created_at_desc">Date de création : plus récente</SelectItem>
                <SelectItem value="created_at_asc">Date de création : plus ancienne</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {isLoading ? (
          <div className="space-y-4">{[1, 2, 3].map((i) => <div key={i} className="h-24 rounded-xl bg-muted animate-pulse" />)}</div>
        ) : sortedReservations.length > 0 ? (
          <div className="space-y-3">
            {sortedReservations.map((reservation) => {
              const isZeroAttente = isZeroAttenteReservation(reservation);
              const timeValue = getDisplayTime(reservation);
              const restaurantName = getRestaurantName(reservation.restaurants);
              const featureBadge = getFeatureBadge(reservation.feature);

              return (
                <button
                  key={reservation.id}
                  onClick={() => setSelectedReservation(reservation)}
                  className="w-full text-left p-4 border rounded-xl bg-card space-y-2 hover:border-primary/30 hover:shadow-sm transition-all group"
                >
                  <div className="flex items-center justify-between">
                    <h3 className="font-semibold">{restaurantName}</h3>
                    <div className="flex items-center gap-2">
                      <OrderStatusBadge status={reservation.status} />
                      <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors" />
                    </div>
                  </div>
                  <div className="flex items-center gap-3 text-sm text-muted-foreground flex-wrap">
                    <span>{new Date(reservation.date).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })}</span>
                    {timeValue && <span>{timeValue}</span>}
                    {reservation.party_size && <span>{reservation.party_size} personne(s)</span>}
                    {featureBadge && (
                      <Badge variant="outline" className={`text-[10px] uppercase tracking-widest ${featureBadge.className}`}>
                        {featureBadge.label}
                      </Badge>
                    )}
                    {!featureBadge && isZeroAttente && (
                      <Badge variant="outline" className="text-[10px] uppercase tracking-widest border-indigo-200 text-indigo-600 bg-indigo-50">
                        Zéro attente
                      </Badge>
                    )}
                  </div>
                  {reservation.total_amount > 0 && (
                    <p className="text-sm font-semibold">{Number(reservation.total_amount).toFixed(2)} CHF</p>
                  )}
                </button>
              );
            })}
          </div>
        ) : (
          <div className="text-center py-12 space-y-2">
            <CalendarDays className="h-10 w-10 mx-auto text-muted-foreground" />
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

