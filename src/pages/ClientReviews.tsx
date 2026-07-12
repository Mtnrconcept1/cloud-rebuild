import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { MessageSquareReply, RefreshCcw, Search, Star } from "lucide-react";

import CustomerDashboardLayout from "@/components/CustomerDashboardLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getSupabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { cn } from "@/lib/utils";

const supabase = getSupabase();

type ReviewFilter = "all" | "published" | "pending";

type ReviewReply = {
  id: string;
  reply_text: string;
  author_type: string | null;
  created_at: string;
};

type ReviewRestaurant = {
  id: string;
  name: string;
  city: string | null;
  image_url: string | null;
};

type ClientReview = {
  id: string;
  restaurant_id: string;
  rating: number | null;
  restaurant_rating: number | null;
  food_rating: number | null;
  service_rating: number | null;
  speed_rating: number | null;
  comment: string | null;
  status: string | null;
  created_at: string;
  restaurants: ReviewRestaurant | ReviewRestaurant[] | null;
  review_replies: ReviewReply | ReviewReply[] | null;
};

const FILTERS: Array<{ id: ReviewFilter; label: string }> = [
  { id: "all", label: "Tous" },
  { id: "published", label: "Publiés" },
  { id: "pending", label: "En vérification" },
];

function firstRestaurant(value: ClientReview["restaurants"]) {
  if (!value) return null;
  return Array.isArray(value) ? value[0] || null : value;
}

function normalizeStatus(status: string | null) {
  return String(status || "published").toLowerCase();
}

function statusPresentation(status: string | null) {
  const normalized = normalizeStatus(status);
  if (["pending", "moderation", "under_review"].includes(normalized)) {
    return { label: "En vérification", className: "border-amber-200 bg-amber-50 text-amber-700" };
  }
  if (["rejected", "hidden", "archived"].includes(normalized)) {
    return { label: "Non publié", className: "border-slate-200 bg-slate-50 text-slate-600" };
  }
  return { label: "Publié", className: "border-emerald-200 bg-emerald-50 text-emerald-700" };
}

function matchesFilter(review: ClientReview, filter: ReviewFilter) {
  if (filter === "all") return true;
  const normalized = normalizeStatus(review.status);
  if (filter === "published") return normalized === "published";
  return ["pending", "moderation", "under_review"].includes(normalized);
}

function RatingStars({ value }: { value: number }) {
  const normalized = Math.max(0, Math.min(5, Math.round(value || 0)));
  return (
    <div className="flex items-center gap-0.5" aria-label={`${normalized} étoile${normalized > 1 ? "s" : ""} sur 5`}>
      {[1, 2, 3, 4, 5].map((star) => (
        <Star
          key={star}
          className={cn("h-4 w-4", star <= normalized ? "fill-amber-400 text-amber-400" : "text-muted-foreground/30")}
          aria-hidden="true"
        />
      ))}
    </div>
  );
}

export default function ClientReviews() {
  const { user } = useAuth();
  const [filter, setFilter] = useState<ReviewFilter>("all");

  const reviewsQuery = useQuery({
    queryKey: ["client-reviews", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("reviews")
        .select(`
          id,
          restaurant_id,
          rating,
          restaurant_rating,
          food_rating,
          service_rating,
          speed_rating,
          comment,
          status,
          created_at,
          restaurants(id, name, city, image_url),
          review_replies(id, reply_text, author_type, created_at)
        `)
        .eq("user_id", user!.id)
        .order("created_at", { ascending: false })
        .limit(100);

      if (error) throw error;
      return (data || []) as unknown as ClientReview[];
    },
    enabled: Boolean(user?.id),
  });

  const filteredReviews = useMemo(
    () => (reviewsQuery.data || []).filter((review) => matchesFilter(review, filter)),
    [filter, reviewsQuery.data],
  );

  return (
    <CustomerDashboardLayout>
      <div className="space-y-6">
        <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-sm font-semibold text-primary">Mon activité</p>
            <h1 className="mt-1 font-display text-3xl font-bold">Mes avis</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Retrouvez vos avis, leur statut de publication et les réponses des restaurants.
            </p>
          </div>
          <Button asChild variant="outline" className="min-h-11 w-full sm:w-auto">
            <Link to="/recherche"><Search className="mr-2 h-4 w-4" />Découvrir un restaurant</Link>
          </Button>
        </header>

        <div className="flex flex-wrap gap-2" role="group" aria-label="Filtrer les avis">
          {FILTERS.map((item) => (
            <Button
              key={item.id}
              type="button"
              size="sm"
              variant={filter === item.id ? "default" : "outline"}
              aria-pressed={filter === item.id}
              onClick={() => setFilter(item.id)}
            >
              {item.label}
            </Button>
          ))}
        </div>

        {reviewsQuery.isLoading ? (
          <div className="space-y-3" aria-label="Chargement des avis">
            {[1, 2, 3].map((item) => <div key={item} className="h-40 animate-pulse rounded-2xl bg-muted" />)}
          </div>
        ) : reviewsQuery.error ? (
          <div role="alert" className="rounded-2xl border border-destructive/30 bg-destructive/5 p-6 text-center">
            <p className="font-semibold text-destructive">Impossible de charger vos avis.</p>
            <p className="mt-1 text-sm text-muted-foreground">Vos avis restent enregistrés. Réessayez dans un instant.</p>
            <Button type="button" variant="outline" className="mt-4 gap-2" onClick={() => void reviewsQuery.refetch()}>
              <RefreshCcw className="h-4 w-4" />Réessayer
            </Button>
          </div>
        ) : filteredReviews.length === 0 ? (
          <div className="rounded-2xl border border-dashed p-8 text-center sm:p-12">
            <Star className="mx-auto h-10 w-10 text-muted-foreground/50" />
            <h2 className="mt-4 font-display text-xl font-bold">
              {filter === "all" ? "Aucun avis pour le moment" : "Aucun avis dans cette catégorie"}
            </h2>
            <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
              Après une commande ou une réservation terminée, vous pourrez partager votre expérience avec la communauté TOK.
            </p>
            {filter !== "all" ? (
              <Button type="button" variant="outline" className="mt-4" onClick={() => setFilter("all")}>Voir tous les avis</Button>
            ) : null}
          </div>
        ) : (
          <div className="space-y-4">
            {filteredReviews.map((review) => {
              const restaurant = firstRestaurant(review.restaurants);
              const status = statusPresentation(review.status);
              const rating = Number(review.rating || review.restaurant_rating || review.food_rating || 0);
              const rawReplies = review.review_replies;
              const replies = (Array.isArray(rawReplies) ? rawReplies : rawReplies ? [rawReplies] : [])
                .sort((left, right) => left.created_at.localeCompare(right.created_at));

              return (
                <article key={review.id} className="overflow-hidden rounded-2xl border bg-card shadow-sm">
                  <div className="p-4 sm:p-5">
                    <div className="flex min-w-0 items-start gap-3">
                      <img
                        src={restaurant?.image_url || "/images/kebab-box-spread.jpeg"}
                        alt=""
                        className="h-12 w-12 shrink-0 rounded-xl object-cover"
                        loading="lazy"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <div className="min-w-0">
                            <Link to={`/restaurant/${review.restaurant_id}`} className="break-words font-bold hover:text-primary hover:underline">
                              {restaurant?.name || "Restaurant"}
                            </Link>
                            <p className="text-xs text-muted-foreground">
                              {new Date(review.created_at).toLocaleDateString("fr-CH", { day: "numeric", month: "long", year: "numeric" })}
                              {restaurant?.city ? ` · ${restaurant.city}` : ""}
                            </p>
                          </div>
                          <Badge variant="outline" className={status.className}>{status.label}</Badge>
                        </div>
                        <div className="mt-3"><RatingStars value={rating} /></div>
                      </div>
                    </div>

                    {review.comment ? <p className="mt-4 whitespace-pre-wrap break-words text-sm leading-6">{review.comment}</p> : null}

                    <div className="mt-4 flex flex-wrap gap-2 text-xs text-muted-foreground">
                      {review.food_rating ? <span className="rounded-full bg-muted px-2.5 py-1">Cuisine {review.food_rating}/5</span> : null}
                      {review.service_rating ? <span className="rounded-full bg-muted px-2.5 py-1">Service {review.service_rating}/5</span> : null}
                      {review.speed_rating ? <span className="rounded-full bg-muted px-2.5 py-1">Rapidité {review.speed_rating}/5</span> : null}
                    </div>

                  </div>

                  {replies.length > 0 ? (
                    <div className="space-y-3 border-t bg-muted/25 p-4 sm:p-5">
                      <p className="flex items-center gap-2 text-sm font-semibold">
                        <MessageSquareReply className="h-4 w-4 text-primary" />Réponse du restaurant
                      </p>
                      {replies.map((reply) => (
                        <div key={reply.id} className="rounded-xl border bg-background p-3">
                          <p className="whitespace-pre-wrap break-words text-sm">{reply.reply_text}</p>
                          <p className="mt-2 text-xs text-muted-foreground">
                            {new Date(reply.created_at).toLocaleDateString("fr-CH", { day: "numeric", month: "short", year: "numeric" })}
                          </p>
                        </div>
                      ))}
                    </div>
                  ) : null}
                </article>
              );
            })}
          </div>
        )}
      </div>
    </CustomerDashboardLayout>
  );
}
