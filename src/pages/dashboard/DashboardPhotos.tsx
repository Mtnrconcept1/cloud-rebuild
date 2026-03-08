import { FormEvent, useEffect, useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useOwnerRestaurants } from "./useOwnerRestaurants";

type PhotoItem = { id: string; name: string; image_url: string | null; is_available: boolean | null; restaurant_id: string };
const initialForm = { restaurant_id: "", name: "", image_url: "" };

export default function DashboardPhotos() {
  const { toast } = useToast();
  const { restaurants, restaurantIds, loading: loadingRestaurants, error: restaurantError } = useOwnerRestaurants();
  const [items, setItems] = useState<PhotoItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(initialForm);

  const load = async () => {
    if (!restaurantIds.length) return setLoading(false);
    setLoading(true);
    const { data, error } = await supabase.from("menu_items").select("id,name,image_url,is_available,restaurant_id").in("restaurant_id", restaurantIds).order("created_at", { ascending: false });
    setError(error?.message || null); setItems((data || []) as PhotoItem[]); setLoading(false);
  };

  useEffect(() => { if (!loadingRestaurants) { if (!form.restaurant_id && restaurants[0]?.id) setForm((v) => ({ ...v, restaurant_id: restaurants[0].id })); load(); } /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [loadingRestaurants, restaurantIds.join(",")]);

  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (!form.restaurant_id || !form.name.trim() || !form.image_url.trim()) return toast({ title: "Validation", description: "Restaurant, nom et URL photo sont requis.", variant: "destructive" });
    const payload = { restaurant_id: form.restaurant_id, name: form.name.trim(), image_url: form.image_url.trim(), price: 0, category: "Galerie", is_available: true };
    const { error } = editingId ? await supabase.from("menu_items").update(payload).eq("id", editingId) : await supabase.from("menu_items").insert(payload);
    if (error) return toast({ title: "Erreur", description: error.message, variant: "destructive" });
    toast({ title: editingId ? "Photo mise à jour" : "Photo ajoutée" });
    setEditingId(null); setForm({ ...initialForm, restaurant_id: restaurants[0]?.id || "" }); load();
  };

  return (
    <DashboardLayout><div className="space-y-6"><h1 className="font-display text-3xl font-bold">Photos</h1>
      <Card><CardHeader><CardTitle>{editingId ? "Éditer" : "Ajouter"} une photo</CardTitle></CardHeader><CardContent><form className="grid gap-3 md:grid-cols-2" onSubmit={save}><div><Label>Restaurant</Label><select className="w-full rounded-md border bg-background px-3 py-2 text-sm" value={form.restaurant_id} onChange={(e) => setForm((v) => ({ ...v, restaurant_id: e.target.value }))}><option value="">Sélectionner</option>{restaurants.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</select></div><div><Label>Titre</Label><Input value={form.name} onChange={(e) => setForm((v) => ({ ...v, name: e.target.value }))} /></div><div className="md:col-span-2"><Label>URL image</Label><Input value={form.image_url} onChange={(e) => setForm((v) => ({ ...v, image_url: e.target.value }))} /></div><div className="flex gap-2"><Button type="submit">Enregistrer</Button>{editingId && <Button type="button" variant="outline" onClick={() => { setEditingId(null); setForm({ ...initialForm, restaurant_id: restaurants[0]?.id || "" }); }}>Annuler</Button>}</div></form></CardContent></Card>
      {loadingRestaurants || loading ? <p>Chargement...</p> : null}
      {restaurantError || error ? <p className="text-destructive">Erreur: {restaurantError || error}</p> : null}
      {!loading && !error && !items.length ? <p>Aucune photo.</p> : null}
      <div className="grid gap-3 md:grid-cols-2">{items.map((item) => <Card key={item.id}><CardContent className="pt-4 space-y-3">{item.image_url ? <img src={item.image_url} alt={item.name} className="h-40 w-full rounded object-cover" /> : <div className="h-40 rounded bg-muted" />}<p className="font-medium">{item.name}</p><div className="flex gap-2"><Button size="sm" variant="outline" onClick={() => { setEditingId(item.id); setForm({ restaurant_id: item.restaurant_id, name: item.name, image_url: item.image_url || "" }); }}>Éditer</Button><Button size="sm" variant="destructive" onClick={async () => { const { error } = await supabase.from("menu_items").delete().eq("id", item.id); if (error) toast({ title: "Erreur", description: error.message, variant: "destructive" }); else { toast({ title: "Photo supprimée" }); load(); } }}>Supprimer</Button></div></CardContent></Card>)}</div>
    </div></DashboardLayout>
  );
}
