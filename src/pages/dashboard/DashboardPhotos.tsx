import { FormEvent, useEffect, useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import DashboardPageHero from "@/components/dashboard/DashboardPageHero";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { getSupabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { useDashboardRestaurant } from "./useDashboardRestaurant";
import ImageUpload from "@/components/ImageUpload";
import { Star, Trash2, Pencil, Image as ImageIcon } from "lucide-react";

const supabase = getSupabase();

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

export default function DashboardPhotos() {
  const { user } = useAuth();
  const { toast } = useToast();
  const { selectedId, loading: loadingRestaurant } = useDashboardRestaurant();
  const [items, setItems] = useState<MediaItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({ media_url: "", alt_text: "", media_type: "photo" });

  const load = async () => {
    if (!selectedId) { setItems([]); setLoading(false); return; }
    setLoading(true);
    const { data, error } = await supabase
      .from("restaurant_media")
      .select("id, restaurant_id, media_url, alt_text, media_type, is_cover, position, created_at")
      .eq("restaurant_id", selectedId)
      .order("position", { ascending: true });
    setError(error?.message || null);
    setItems((data || []) as MediaItem[]);
    setLoading(false);
  };

  useEffect(() => {
    if (!loadingRestaurant && selectedId) {
      setEditingId(null);
      setForm({ media_url: "", alt_text: "", media_type: "photo" });
      load();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadingRestaurant, selectedId]);

  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (!selectedId || !form.media_url.trim()) {
      return toast({ title: "Validation", description: "L'URL de l'image est requise.", variant: "destructive" });
    }
    const payload = {
      restaurant_id: selectedId,
      media_url: form.media_url.trim(),
      alt_text: form.alt_text.trim() || null,
      media_type: form.media_type,
      uploaded_by: user?.id || null,
      position: items.length,
    };
    const { error } = editingId
      ? await supabase.from("restaurant_media").update(payload).eq("id", editingId)
      : await supabase.from("restaurant_media").insert(payload);
    if (error) return toast({ title: "Erreur", description: error.message, variant: "destructive" });
    toast({ title: editingId ? "Photo mise à jour" : "Photo ajoutée" });
    setEditingId(null);
    setForm({ media_url: "", alt_text: "", media_type: "photo" });
    load();
  };

  const setCover = async (id: string) => {
    if (!selectedId) return;
    // Remove cover from all other media of this restaurant
    await supabase.from("restaurant_media").update({ is_cover: false }).eq("restaurant_id", selectedId);
    await supabase.from("restaurant_media").update({ is_cover: true }).eq("id", id);

    // Sync cover photo to restaurants.image_url so it appears on search & profile
    const coverItem = items.find((item) => item.id === id);
    if (coverItem) {
      await supabase.from("restaurants").update({ image_url: coverItem.media_url }).eq("id", selectedId);
    }

    toast({ title: "Photo de couverture définie" });
    load();
  };

  const remove = async (id: string) => {
    const itemToRemove = items.find((item) => item.id === id);
    const { error } = await supabase.from("restaurant_media").delete().eq("id", id);
    if (error) return toast({ title: "Erreur", description: error.message, variant: "destructive" });

    // If the deleted photo was the cover, clear restaurants.image_url
    if (itemToRemove?.is_cover && selectedId) {
      await supabase.from("restaurants").update({ image_url: null }).eq("id", selectedId);
    }

    toast({ title: "Photo supprimée" });
    load();
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <DashboardPageHero
          badge="Media restaurant"
          title="Galerie photos"
          description="Preparez la couverture et les visuels du restaurant pour que la page client reste claire, actuelle et convaincante."
          icon={ImageIcon}
          tone="sky"
          visualLabel="Galerie"
          stats={[
            { label: "Photos", value: items.length, icon: ImageIcon },
            { label: "Couverture", value: items.some((item) => item.is_cover) ? "Definie" : "A choisir", icon: Star },
            { label: "Mode", value: editingId ? "Édition" : "Ajout", icon: Pencil },
          ]}
        />

        <Card>
          <CardHeader>
            <CardTitle>{editingId ? "Modifier" : "Ajouter"} une photo</CardTitle>
          </CardHeader>
          <CardContent>
            <form className="grid gap-4 md:grid-cols-2" onSubmit={save}>
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
                  <Button type="button" variant="outline" onClick={() => { setEditingId(null); setForm({ media_url: "", alt_text: "", media_type: "photo" }); }}>
                    Annuler
                  </Button>
                )}
              </div>
            </form>
          </CardContent>
        </Card>

        {loadingRestaurant || loading ? <p className="text-muted-foreground">Chargement...</p> : null}
        {error ? <p className="text-destructive">Erreur: {error}</p> : null}
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
                    <Button size="sm" variant="outline" onClick={() => setCover(item.id)}>
                      <Star className="h-3 w-3 mr-1" /> Couverture
                    </Button>
                  )}
                  <Button size="sm" variant="outline" onClick={() => {
                    setEditingId(item.id);
                    setForm({ media_url: item.media_url, alt_text: item.alt_text || "", media_type: item.media_type });
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
