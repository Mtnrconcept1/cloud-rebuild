import { FormEvent, useEffect, useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import DashboardPageHero from "@/components/dashboard/DashboardPageHero";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth";
import { getSupabase } from "@/integrations/supabase/client";
import { useOwnerRestaurants } from "./useOwnerRestaurants";
import { MessageSquareText, Star, Store } from "lucide-react";

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

const initialForm = {
  restaurant_id: "",
  comment: "",
  rating: "5",
};

export default function DashboardAvis() {
  const { user } = useAuth();
  const { toast } = useToast();
  const { restaurants, restaurantIds, loading: loadingRestaurants, error: restaurantError } = useOwnerRestaurants();
  const [items, setItems] = useState<ReviewItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState(initialForm);
  const [editingId, setEditingId] = useState<string | null>(null);

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
      .order("created_at", { ascending: false });
    if (queryError) setError(queryError.message);
    else setItems((data || []) as ReviewItem[]);
    setLoading(false);
  };

  useEffect(() => {
    if (!loadingRestaurants) {
      if (!form.restaurant_id && restaurants[0]?.id) {
        setForm((prev) => ({ ...prev, restaurant_id: restaurants[0].id }));
      }
      loadReviews();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadingRestaurants, restaurantIds.join(",")]);

  const validate = () => {
    const rating = Number(form.rating);
    if (!form.restaurant_id) return "Sélectionnez un restaurant.";
    if (!form.comment.trim()) return "Le commentaire est requis.";
    if (!Number.isFinite(rating) || rating < 1 || rating > 5) return "La note doit être comprise entre 1 et 5.";
    return null;
  };

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    const validationError = validate();
    if (validationError) {
      toast({ title: "Validation", description: validationError, variant: "destructive" });
      return;
    }
    const rating = Number(form.rating);
    const payload = { restaurant_id: form.restaurant_id, comment: form.comment.trim(), rating, quality_rating: rating, service_rating: rating, speed_rating: rating, user_id: user!.id };
    const query = editingId ? supabase.from("reviews").update(payload).eq("id", editingId) : supabase.from("reviews").insert(payload);
    const { error: mutationError } = await query;
    if (mutationError) { toast({ title: "Erreur", description: mutationError.message, variant: "destructive" }); return; }
    toast({ title: editingId ? "Avis mis à jour" : "Avis créé" });
    setForm({ ...initialForm, restaurant_id: restaurants[0]?.id || "" });
    setEditingId(null);
    loadReviews();
  };

  const startEdit = (review: ReviewItem) => {
    setEditingId(review.id);
    setForm({ restaurant_id: review.restaurant_id, comment: review.comment || "", rating: String(review.rating) });
  };

  const remove = async (id: string) => {
    const { error: deleteError } = await supabase.from("reviews").delete().eq("id", id);
    if (deleteError) { toast({ title: "Erreur", description: deleteError.message, variant: "destructive" }); return; }
    toast({ title: "Avis supprimé" });
    loadReviews();
  };

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
            { label: "Mode", value: editingId ? "Edition" : "Creation", icon: MessageSquareText },
          ]}
        />
        <Card>
          <CardHeader><CardTitle>{editingId ? "Modifier un avis" : "Créer un avis test"}</CardTitle></CardHeader>
          <CardContent>
            <form className="grid gap-3 md:grid-cols-2" onSubmit={onSubmit}>
              <div className="space-y-1 md:col-span-1">
                <Label>Restaurant</Label>
                <select className="w-full rounded-md border bg-background px-3 py-2 text-sm" value={form.restaurant_id} onChange={(e) => setForm((prev) => ({ ...prev, restaurant_id: e.target.value }))}>
                  <option value="">Sélectionner</option>
                  {restaurants.map((restaurant) => (<option key={restaurant.id} value={restaurant.id}>{restaurant.name}</option>))}
                </select>
              </div>
              <div className="space-y-1 md:col-span-1">
                <Label>Note (1-5)</Label>
                <Input value={form.rating} onChange={(e) => setForm((prev) => ({ ...prev, rating: e.target.value }))} />
              </div>
              <div className="space-y-1 md:col-span-2">
                <Label>Commentaire</Label>
                <Textarea value={form.comment} onChange={(e) => setForm((prev) => ({ ...prev, comment: e.target.value }))} />
              </div>
              <div className="flex gap-2 md:col-span-2">
                <Button type="submit">{editingId ? "Mettre à jour" : "Créer"}</Button>
                {editingId && <Button type="button" variant="outline" onClick={() => { setEditingId(null); setForm({ ...initialForm, restaurant_id: restaurants[0]?.id || "" }); }}>Annuler</Button>}
              </div>
            </form>
          </CardContent>
        </Card>
        {loadingRestaurants || loading ? <p>Chargement...</p> : null}
        {restaurantError || error ? <p className="text-destructive">Erreur: {restaurantError || error}</p> : null}
        {!loading && !restaurantError && !error && !items.length ? <p>Aucun avis disponible.</p> : null}
        <div className="grid gap-3">
          {items.map((review) => (
            <Card key={review.id}>
              <CardContent className="pt-6 space-y-3">
                <div className="flex items-center justify-between">
                  <Badge>{review.rating}/5</Badge>
                  <span className="text-xs text-muted-foreground">{new Date(review.created_at).toLocaleString()}</span>
                </div>
                <p className="text-sm">{review.comment || "Aucun commentaire"}</p>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => startEdit(review)}>Éditer</Button>
                  <Button variant="destructive" size="sm" onClick={() => remove(review.id)}>Supprimer</Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </DashboardLayout>
  );
}
