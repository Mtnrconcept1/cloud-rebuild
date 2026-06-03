import { useEffect, useMemo, useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import DashboardPageHero from "@/components/dashboard/DashboardPageHero";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getSupabase } from "@/integrations/supabase/client";
import { useOwnerRestaurants } from "./useOwnerRestaurants";
import { MessageSquareText, ShieldCheck, Star, Store } from "lucide-react";

const supabase = getSupabase();

type ReviewItem = {
  id: string;
  comment: string | null;
  rating: number;
  quality_rating: number;
  service_rating: number;
  speed_rating: number;
  created_at: string;
  restaurant_id: string;
};

export default function DashboardAvis() {
  const { restaurants, restaurantIds, loading: loadingRestaurants, error: restaurantError } = useOwnerRestaurants();
  const [items, setItems] = useState<ReviewItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const restaurantNameById = useMemo(
    () => new Map(restaurants.map((restaurant) => [restaurant.id, restaurant.name])),
    [restaurants],
  );

  const loadReviews = async () => {
    if (!restaurantIds.length) {
      setItems([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    const { data, error: queryError } = await supabase
      .from("reviews")
      .select("id, comment, rating, quality_rating, service_rating, speed_rating, created_at, restaurant_id")
      .in("restaurant_id", restaurantIds)
      .order("created_at", { ascending: false })
      .limit(100);

    if (queryError) setError(queryError.message);
    else setItems((data || []) as ReviewItem[]);
    setLoading(false);
  };

  useEffect(() => {
    if (!loadingRestaurants) {
      loadReviews();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadingRestaurants, restaurantIds.join(",")]);

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <DashboardPageHero
          badge="Relation client"
          title="Avis clients"
          description="Suivez les retours, gardez les notes visibles et preparez les reponses sans melanger moderation et lecture operationnelle."
          icon={MessageSquareText}
          tone="sky"
          visualLabel="Reputation"
          stats={[
            { label: "Avis charges", value: items.length, icon: Star },
            { label: "Restaurants", value: restaurants.length, icon: Store },
            { label: "Mode", value: "Lecture", icon: ShieldCheck },
          ]}
        />

        <Card>
          <CardHeader><CardTitle>Lecture des avis clients</CardTitle></CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Les avis publics sont crees uniquement par les clients via le flux verifie. Le dashboard restaurateur sert au suivi de reputation et a la preparation des reponses.
          </CardContent>
        </Card>

        {loadingRestaurants || loading ? <p>Chargement...</p> : null}
        {restaurantError || error ? <p className="text-destructive">Erreur: {restaurantError || error}</p> : null}
        {!loading && !restaurantError && !error && !items.length ? <p>Aucun avis disponible.</p> : null}

        <div className="grid gap-3">
          {items.map((review) => (
            <Card key={review.id}>
              <CardContent className="space-y-3 pt-6">
                <div className="flex items-center justify-between">
                  <Badge>{review.rating}/5</Badge>
                  <span className="text-xs text-muted-foreground">{new Date(review.created_at).toLocaleString()}</span>
                </div>
                <p className="text-xs font-medium text-muted-foreground">
                  {restaurantNameById.get(review.restaurant_id) || "Restaurant"}
                </p>
                <p className="text-sm">{review.comment || "Aucun commentaire"}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </DashboardLayout>
  );
}
