import { useEffect, useRef } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, Loader2, Search } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { getSupabase } from "@/integrations/supabase/client";
import { trackGoogleBookingEvent } from "@/hooks/useGoogleBusinessBooking";

const supabase = getSupabase();

type ResolvedGoogleBookingRestaurant = {
  restaurant_id: string;
  restaurant_name: string;
  city: string | null;
  slug: string | null;
  booking_slug: string;
  is_active: boolean | null;
  status: string | null;
  supports_reservation: boolean | null;
};

function firstRow<T>(data: T[] | T | null | undefined): T | null {
  if (Array.isArray(data)) return data[0] ?? null;
  return data ?? null;
}

function buildRedirectPath(restaurant: ResolvedGoogleBookingRestaurant) {
  return `/restaurant/${restaurant.restaurant_id}?open=reservation&utm_source=google_business&utm_medium=booking_button`;
}

export default function RestaurantBookingRedirect() {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const trackedRef = useRef(false);

  const { data: restaurant, isLoading } = useQuery({
    queryKey: ["google-booking-slug", slug],
    enabled: Boolean(slug),
    retry: false,
    queryFn: async () => {
      const { data, error } = await (supabase.rpc as any)("resolve_google_booking_slug", {
        p_booking_slug: slug,
      });
      if (error) throw error;
      return firstRow<ResolvedGoogleBookingRestaurant>(data);
    },
  });

  const isReservable = Boolean(
    restaurant?.is_active
      && restaurant?.supports_reservation
      && !["archived", "suspended", "paused"].includes(String(restaurant?.status || "").toLowerCase()),
  );

  useEffect(() => {
    if (!restaurant || !isReservable || trackedRef.current) return;
    trackedRef.current = true;

    void trackGoogleBookingEvent(restaurant.restaurant_id, "google_booking_link_clicked", {
      source: "google_business",
      medium: "booking_button",
      booking_slug: restaurant.booking_slug,
    }).finally(() => {
      navigate(buildRedirectPath(restaurant), { replace: true });
    });
  }, [isReservable, navigate, restaurant]);

  if (isLoading) {
    return (
      <main className="min-h-screen bg-background">
        <div className="container flex min-h-[70vh] items-center justify-center py-12">
          <Card className="w-full max-w-xl rounded-3xl">
            <CardContent className="flex items-center justify-center p-10 text-sm text-muted-foreground">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Ouverture de la réservation TOK...
            </CardContent>
          </Card>
        </div>
      </main>
    );
  }

  if (!restaurant) {
    return (
      <main className="min-h-screen bg-background">
        <div className="container flex min-h-[70vh] items-center justify-center py-12">
          <Card className="w-full max-w-xl rounded-3xl">
            <CardContent className="space-y-5 p-8 text-center">
              <AlertTriangle className="mx-auto h-10 w-10 text-amber-600" />
              <div className="space-y-2">
                <h1 className="font-display text-2xl font-bold">Lien de réservation introuvable</h1>
                <p className="text-sm text-muted-foreground">
                  Ce lien Google Business TOK n'est pas encore actif ou a été remplacé.
                </p>
              </div>
              <Button asChild>
                <Link to="/recherche">
                  <Search className="mr-2 h-4 w-4" />
                  Rechercher un restaurant
                </Link>
              </Button>
            </CardContent>
          </Card>
        </div>
      </main>
    );
  }

  if (!isReservable) {
    return (
      <main className="min-h-screen bg-background">
        <div className="container flex min-h-[70vh] items-center justify-center py-12">
          <Card className="w-full max-w-xl rounded-3xl">
            <CardContent className="space-y-5 p-8 text-center">
              <AlertTriangle className="mx-auto h-10 w-10 text-amber-600" />
              <div className="space-y-2">
                <h1 className="font-display text-2xl font-bold">Restaurant indisponible</h1>
                <p className="text-sm text-muted-foreground">
                  {restaurant.restaurant_name} ne prend pas de réservation TOK depuis Google Business pour le moment.
                </p>
              </div>
              <Button asChild variant="outline">
                <Link to="/recherche">Voir d'autres restaurants</Link>
              </Button>
            </CardContent>
          </Card>
        </div>
      </main>
    );
  }

  return null;
}
