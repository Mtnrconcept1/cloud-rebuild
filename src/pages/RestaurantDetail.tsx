import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  CalendarDays,
  Clock,
  Heart,
  Info,
  MapPin,
  MessageSquare,
  Phone,
  Star,
} from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { trackEvent, trackImpression } from "@/lib/analytics";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import PriceRangeIcons from "@/components/PriceRangeIcons";
import ReservationDialog from "@/components/ReservationDialog";
import ReservationWidget from "@/components/ReservationWidget";
import ReviewForm from "@/components/ReviewForm";

export default function RestaurantDetail() {
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [reservationOpen, setReservationOpen] = useState(false);
  const [reservationDefaults, setReservationDefaults] = useState<{ date?: Date; time?: string; partySize?: number }>({});
  const impressionTracked = useRef(false);

  useEffect(() => {
    if (searchParams.get("reserve") === "true") {
      const timeParam = searchParams.get("time");
      if (timeParam) {
        setReservationDefaults({ date: new Date(), time: timeParam, partySize: 2 });
      }
      setReservationOpen(true);
    }
  }, [searchParams]);

  const { data: restaurant } = useQuery({
    queryKey: ["restaurant", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("restaurants").select("*").eq("id", id!).single();
      if (error) throw error;
      return data;
    },
    enabled: !!id,
  });

  useEffect(() => {
    if (id && restaurant && !impressionTracked.current) {
      impressionTracked.current = true;
      trackImpression("restaurant", id, "restaurant_detail");
      trackEvent({
        eventType: "page_view",
        eventData: { page: "restaurant_detail", restaurant_name: restaurant.name, mode: "reservation_only" },
        restaurantId: id,
      });
    }
  }, [id, restaurant]);

  const { data: reviews = [] } = useQuery({
    queryKey: ["reviews", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("reviews")
        .select("*")
        .eq("restaurant_id", id!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: !!id,
  });

  const { data: isFavorite } = useQuery({
    queryKey: ["favorite", id, user?.id],
    queryFn: async () => {
      if (!user) return false;
      const { data } = await supabase
        .from("favorites")
        .select("id")
        .eq("restaurant_id", id!)
        .eq("user_id", user.id)
        .maybeSingle();
      return !!data;
    },
    enabled: !!id && !!user,
  });

  const toggleFavorite = async () => {
    if (!user) {
      return toast({ title: "Connectez-vous", variant: "destructive" });
    }
    if (isFavorite) {
      await supabase.from("favorites").delete().eq("restaurant_id", id!).eq("user_id", user.id);
    } else {
      await supabase.from("favorites").insert({ restaurant_id: id!, user_id: user.id });
    }
    queryClient.invalidateQueries({ queryKey: ["favorite", id] });
  };

  const ratingDistribution = useMemo(() => {
    if (!reviews.length) return [];
    const counts = Array(10).fill(0) as number[];
    reviews.forEach((review) => {
      const index = Math.min(Math.max(Math.round(Number(review.rating) || 0) - 1, 0), 9);
      counts[index] += 1;
    });
    const max = Math.max(...counts, 1);
    return [10, 9, 8, 7, 6, 5, 4, 3, 2, 1].map((score) => ({
      score,
      count: counts[score - 1],
      percent: Math.round((counts[score - 1] / max) * 100),
    }));
  }, [reviews]);

  const avgRating10 = useMemo(() => {
    if (!reviews.length) return (Number(restaurant?.rating) || 0) * 2;
    const sum = reviews.reduce((acc, review) => acc + (Number(review.rating) || 0), 0);
    return sum / reviews.length;
  }, [reviews, restaurant?.rating]);

  if (!restaurant) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-primary" />
      </div>
    );
  }

  const avgRating = avgRating10.toFixed(1);
  const reviewCount = restaurant.review_count || reviews.length || 0;

  const handleWidgetReserve = (date: Date, time: string, partySize: number) => {
    setReservationDefaults({ date, time, partySize });
    setReservationOpen(true);
  };

  return (
    <main className="min-h-screen bg-background">
      <div className="relative h-72 md:h-96">
        <Button
          variant="ghost"
          size="icon"
          className="absolute left-4 top-4 z-20 rounded-full border-white/10 bg-black/30 text-white backdrop-blur-md hover:bg-black/50"
          onClick={() => navigate("/")}
        >
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="absolute right-4 top-4 z-20 rounded-full border-white/10 bg-black/30 text-white backdrop-blur-md hover:bg-black/50"
          onClick={toggleFavorite}
        >
          <Heart className={isFavorite ? "h-5 w-5 fill-red-500 text-red-500" : "h-5 w-5"} />
        </Button>
        <img src={restaurant.image_url || "/images/kebab-box-spread.jpeg"} alt={restaurant.name} className="h-full w-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
        <div className="absolute bottom-0 left-0 right-0 p-6 md:p-8">
          <div className="container">
            <div className="mb-2 flex items-center gap-2">
              {restaurant.cuisine_type ? (
                <Badge className="border-white/20 bg-white/20 text-white backdrop-blur-sm">{restaurant.cuisine_type}</Badge>
              ) : null}
              <Badge className="border-0 bg-primary/85 text-white">
                <CalendarDays className="mr-1 h-3 w-3" />
                Reservation
              </Badge>
            </div>
            <h1 className="font-display text-3xl font-bold text-white md:text-5xl">{restaurant.name}</h1>
            <div className="mt-3 flex items-center gap-4">
              <div className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5">
                <Star className="h-4 w-4 fill-primary-foreground text-primary-foreground" />
                <span className="text-sm font-bold text-primary-foreground">{avgRating}/10</span>
              </div>
              <span className="text-sm text-white/80">{reviewCount} avis</span>
              <span className="text-white/50">·</span>
              <span className="text-white/80"><PriceRangeIcons range={restaurant.price_range || 2} /></span>
            </div>
          </div>
        </div>
      </div>

      <div className="container py-6 md:py-8">
        <div className="flex flex-col gap-8 lg:flex-row">
          <div className="min-w-0 flex-1 space-y-6">
            <div className="flex flex-wrap items-center gap-x-5 gap-y-2 rounded-xl border bg-card p-4 text-sm text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <MapPin className="h-4 w-4 text-primary" />
                {restaurant.address}, {restaurant.city}
              </span>
              {restaurant.phone ? (
                <span className="flex items-center gap-1.5">
                  <Phone className="h-4 w-4 text-primary" />
                  {restaurant.phone}
                </span>
              ) : null}
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <button
                onClick={() => setReservationOpen(true)}
                className="group flex w-full items-center gap-3 rounded-xl border-2 border-primary/20 bg-primary/5 p-4 text-left transition-all hover:border-primary/40 hover:bg-primary/10"
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 transition-transform group-hover:scale-110">
                  <CalendarDays className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <span className="block text-sm font-bold">Reserver une table</span>
                  <span className="text-[10px] text-muted-foreground">Choisissez votre date, heure et nombre de convives.</span>
                </div>
              </button>
              <div className="flex items-center gap-3 rounded-xl border bg-secondary/30 p-4">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-secondary">
                  <Clock className="h-5 w-5 text-foreground" />
                </div>
                <div>
                  <span className="block text-sm font-bold">Confirmation immediate</span>
                  <span className="text-[10px] text-muted-foreground">Visualisez rapidement les horaires disponibles.</span>
                </div>
              </div>
            </div>

            <Tabs defaultValue="apropos" className="space-y-6">
              <TabsList className="h-auto w-full justify-start gap-0 rounded-none border-b bg-transparent p-0">
                <TabsTrigger value="apropos" className="gap-1.5 rounded-none border-b-2 border-transparent px-5 py-3 text-sm font-semibold data-[state=active]:border-primary data-[state=active]:bg-transparent">
                  <Info className="h-4 w-4" />
                  A propos
                </TabsTrigger>
                <TabsTrigger value="avis" className="gap-1.5 rounded-none border-b-2 border-transparent px-5 py-3 text-sm font-semibold data-[state=active]:border-primary data-[state=active]:bg-transparent">
                  <MessageSquare className="h-4 w-4" />
                  Avis ({reviewCount})
                </TabsTrigger>
              </TabsList>

              <TabsContent value="apropos" className="mt-0 space-y-6">
                {restaurant.description ? (
                  <div className="space-y-3">
                    <h2 className="font-display text-xl font-bold">L'histoire du restaurant</h2>
                    <p className="leading-relaxed text-muted-foreground">{restaurant.description}</p>
                  </div>
                ) : null}

                <div className="space-y-3">
                  <h2 className="font-display text-xl font-bold">Informations pratiques</h2>
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    <div className="flex items-start gap-3 rounded-xl bg-secondary/30 p-4">
                      <Clock className="mt-0.5 h-5 w-5 text-primary" />
                      <div>
                        <h3 className="mb-2 font-semibold">Horaires d'ouverture</h3>
                        {(() => {
                          const openingHours = restaurant.opening_hours as Record<string, any> | null;
                          const dayLabels: Record<string, string> = {
                            lundi: "Lundi",
                            mardi: "Mardi",
                            mercredi: "Mercredi",
                            jeudi: "Jeudi",
                            vendredi: "Vendredi",
                            samedi: "Samedi",
                            dimanche: "Dimanche",
                          };

                          if (openingHours && typeof openingHours === "object" && !Array.isArray(openingHours)) {
                            const entries = Object.keys(dayLabels)
                              .filter((dayKey) => openingHours[dayKey])
                              .map((dayKey) => {
                                const value = openingHours[dayKey];
                                if (typeof value === "string") return { day: dayLabels[dayKey], hours: value };
                                if (value && typeof value === "object" && value.open && value.close) {
                                  return { day: dayLabels[dayKey], hours: `${value.open} - ${value.close}` };
                                }
                                if (value === true || value === "true") {
                                  return { day: dayLabels[dayKey], hours: "Ouvert" };
                                }
                                return null;
                              })
                              .filter(Boolean) as { day: string; hours: string }[];

                            if (entries.length > 0) {
                              return (
                                <div className="space-y-1">
                                  {entries.map((entry) => (
                                    <p key={entry.day} className="text-sm text-muted-foreground">
                                      <span className="font-medium text-foreground">{entry.day}</span> : {entry.hours}
                                    </p>
                                  ))}
                                </div>
                              );
                            }
                          }

                          return <p className="text-sm text-muted-foreground">Lundi - Dimanche : 11h30 - 22h30</p>;
                        })()}
                      </div>
                    </div>

                    <div className="flex items-start gap-3 rounded-xl bg-secondary/30 p-4">
                      <Info className="mt-0.5 h-5 w-5 text-primary" />
                      <div>
                        <h3 className="mb-2 font-semibold">Details</h3>
                        <ul className="space-y-1 text-sm text-muted-foreground">
                          <li>Cuisine : {restaurant.cuisine_type || "Non specifie"}</li>
                          <li>Fourchette de prix : <PriceRangeIcons range={restaurant.price_range || 2} /></li>
                          <li>Reservation en ligne : {restaurant.supports_reservation === false ? "Indisponible" : "Disponible"}</li>
                        </ul>
                      </div>
                    </div>
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="avis" className="mt-0 space-y-8">
                <div className="grid grid-cols-1 gap-8 md:grid-cols-3">
                  <div className="space-y-6 md:col-span-1">
                    <div className="rounded-2xl border bg-secondary/20 p-6 text-center">
                      <p className="font-display text-5xl font-bold text-primary">{avgRating}</p>
                      <div className="my-2 flex justify-center">
                        {[1, 2, 3, 4, 5].map((score) => (
                          <Star
                            key={score}
                            className={`h-4 w-4 ${score <= Math.round(Number(avgRating) / 2) ? "fill-primary text-primary" : "text-muted"}`}
                          />
                        ))}
                      </div>
                      <p className="text-sm text-muted-foreground">{reviewCount} avis verifies</p>
                    </div>

                    <div className="space-y-2">
                      {ratingDistribution.map(({ score, count, percent }) => (
                        <div key={score} className="flex items-center gap-3 text-sm">
                          <span className="w-6 text-right font-medium">{score}</span>
                          <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-secondary">
                            <div className="h-full rounded-full bg-primary" style={{ width: `${percent}%` }} />
                          </div>
                          <span className="w-8 text-right text-muted-foreground">{count}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-6 md:col-span-2">
                    {user ? (
                      <ReviewForm
                        restaurantId={id!}
                        onSuccess={() => {
                          queryClient.invalidateQueries({ queryKey: ["reviews", id] });
                        }}
                      />
                    ) : null}

                    <div className="space-y-4">
                      {reviews.map((review) => (
                        <div key={review.id} className="space-y-3 rounded-xl border bg-card p-4">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-1.5 rounded bg-primary/10 px-2 py-0.5 text-sm font-bold text-primary">
                              <Star className="h-3.5 w-3.5 fill-primary" />
                              {(Number(review.rating) * 2).toFixed(1)}/10
                            </div>
                            <span className="text-xs text-muted-foreground">
                              {new Date(review.created_at).toLocaleDateString("fr-FR", { year: "numeric", month: "long" })}
                            </span>
                          </div>
                          {review.comment ? <p className="text-sm leading-relaxed">{review.comment}</p> : null}
                        </div>
                      ))}
                      {!reviews.length ? (
                        <p className="py-8 text-center text-muted-foreground">
                          Aucun avis pour ce restaurant. Soyez le premier.
                        </p>
                      ) : null}
                    </div>
                  </div>
                </div>
              </TabsContent>
            </Tabs>
          </div>

          <div className="w-full shrink-0 lg:w-80">
            <div className="sticky top-24 space-y-4">
              <ReservationWidget restaurantId={id!} restaurantName={restaurant.name} onReserve={handleWidgetReserve} />
            </div>
          </div>
        </div>
      </div>

      <ReservationDialog
        open={reservationOpen}
        onOpenChange={setReservationOpen}
        restaurantId={id!}
        restaurantName={restaurant.name}
        initialDate={reservationDefaults.date}
        initialTime={reservationDefaults.time}
        initialPartySize={reservationDefaults.partySize}
      />
    </main>
  );
}
