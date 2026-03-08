import { FormEvent, useEffect, useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { useOwnerRestaurants } from "./useOwnerRestaurants";
import ImageUpload from "@/components/ImageUpload";
import { Star, Trash2, Pencil, Image as ImageIcon } from "lucide-react";

type MediaItem = {
  id: string;
  restaurant_id: string;
  media_url: string;
  alt_text: string | null;
  media_type: string;
  is_cover: boolean;
  position: number;
  created_at: string;
};

const initialForm = { restaurant_id: "", media_url: "", alt_text: "", media_type: "photo" };

export default function DashboardPhotos() {
  const { user } = useAuth();
  const { toast } = useToast();
  const { restaurants, restaurantIds, loading: loadingRestaurants, error: restaurantError } = useOwnerRestaurants();
  const [items, setItems] = useState<MediaItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(initialForm);

  const load = async () => {
    if (!restaurantIds.length) { setItems([]); setLoading(false); return; }
    setLoading(true);
    const { data, error } = await supabase
      .from("restaurant_media")
      .select("id, restaurant_id, media_url, alt_text, media_type, is_cover, position, created_at")
      .in("restaurant_id", restaurantIds)
      .order("position", { ascending: true });
    setError(error?.message || null);
    setItems((data || []) as MediaItem[]);
    setLoading(false);
  };

  useEffect(() => {
    if (!loadingRestaurants) {
      if (!form.restaurant_id && restaurants[0]?.id) setForm((v) => ({ ...v, restaurant_id: restaurants[0].id }));
      load();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadingRestaurants, restaurantIds.join(",")]);

  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (!form.restaurant_id || !form.media_url.trim()) {
      return toast({ title: "Validation", description: "Restaurant et URL de l'image sont requis.", variant: "destructive" });
    }
    const payload = {
      restaurant_id: form.restaurant_id,
      media_url: form.media_url.trim(),
      alt_text: form.alt_text.trim() || null,
      media_type: form.media_type,
      uploaded_by: user?.id || null,
      position: items.filter((i) => i.restaurant_id === form.restaurant_id).length,
    };
    const { error } = editingId
      ? await supabase.from("restaurant_media").update(payload).eq("id", editingId)
      : await supabase.from("restaurant_media").insert(payload);
    if (error) return toast({ title: "Erreur", description: error.message, variant: "destructive" });
    toast({ title: editingId ? "Photo mise à jour" : "Photo ajoutée" });
    setEditingId(null);
    setForm({ ...initialForm, restaurant_id: restaurants[0]?.id || "" });
    load();
  };

  const setCover = async (id: string, restaurantId: string) => {
    // Remove cover from all other media of this restaurant
    await supabase.from("restaurant_media").update({ is_cover: false }).eq("restaurant_id", restaurantId);
    await supabase.from("restaurant_media").update({ is_cover: true }).eq("id", id);
    toast({ title: "Photo de couverture définie" });
    load();
  };

  const remove = async (id: string) => {
    const { error } = await supabase.from("restaurant_media").delete().eq("id", id);
    if (error) return toast({ title: "Erreur", description: error.message, variant: "destructive" });
    toast({ title: "Photo supprimée" });
    load();
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <h1 className="font-display text-3xl font-bold">Galerie photos</h1>

        <Card>
          <CardHeader>
            <CardTitle>{editingId ? "Modifier" : "Ajouter"} une photo</CardTitle>
          </CardHeader>
          <CardContent>
            <form className="grid gap-4 md:grid-cols-2" onSubmit={save}>
              <div className="space-y-2">
                <Label>Restaurant</Label>
                <select
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                  value={form.restaurant_id}
                  onChange={(e) => setForm((v) => ({ ...v, restaurant_id: e.target.value }))}
                >
                  <option value="">Sélectionner</option>
                  {restaurants.map((r) => (
                    <option key={r.id} value={r.id}>{r.name}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <Label>Texte alternatif</Label>
                <Input
                  value={form.alt_text}
                  onChange={(e) => setForm((v) => ({ ...v, alt_text: e.target.value }))}
                  placeholder="Description de l'image"
                />
              </div>
              <div className="md:col-span-2">
                <ImageUpload
                  label="Image"
                  value={form.media_url}
                  onChange={(url) => setForm((v) => ({ ...v, media_url: url }))}
                />
              </div>
              <div className="flex gap-2">
                <Button type="submit">Enregistrer</Button>
                {editingId && (
                  <Button type="button" variant="outline" onClick={() => { setEditingId(null); setForm({ ...initialForm, restaurant_id: restaurants[0]?.id || "" }); }}>
                    Annuler
                  </Button>
                )}
              </div>
            </form>
          </CardContent>
        </Card>

        {loadingRestaurants || loading ? <p className="text-muted-foreground">Chargement...</p> : null}
        {restaurantError || error ? <p className="text-destructive">Erreur: {restaurantError || error}</p> : null}
        {!loading && !error && !items.length ? (
          <div className="text-center py-12 space-y-2">
            <ImageIcon className="h-10 w-10 mx-auto text-muted-foreground" />
            <p className="text-muted-foreground">Aucune photo dans la galerie</p>
          </div>
        ) : null}

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((item) => (
            <Card key={item.id} className="overflow-hidden">
              <div className="relative">
                <img src={item.media_url} alt={item.alt_text || "Photo restaurant"} className="h-48 w-full object-cover" />
                {item.is_cover && (
                  <div className="absolute top-2 left-2 bg-primary text-primary-foreground text-[10px] font-bold px-2 py-1 rounded-full flex items-center gap-1">
                    <Star className="h-3 w-3" /> Couverture
                  </div>
                )}
              </div>
              <CardContent className="pt-3 space-y-2">
                {item.alt_text && <p className="text-sm text-muted-foreground">{item.alt_text}</p>}
                <div className="flex gap-2 flex-wrap">
                  {!item.is_cover && (
                    <Button size="sm" variant="outline" onClick={() => setCover(item.id, item.restaurant_id)}>
                      <Star className="h-3 w-3 mr-1" /> Couverture
                    </Button>
                  )}
                  <Button size="sm" variant="outline" onClick={() => {
                    setEditingId(item.id);
                    setForm({ restaurant_id: item.restaurant_id, media_url: item.media_url, alt_text: item.alt_text || "", media_type: item.media_type });
                  }}>
                    <Pencil className="h-3 w-3 mr-1" /> Éditer
                  </Button>
                  <Button size="sm" variant="destructive" onClick={() => remove(item.id)}>
                    <Trash2 className="h-3 w-3 mr-1" /> Supprimer
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </DashboardLayout>
  );
}
