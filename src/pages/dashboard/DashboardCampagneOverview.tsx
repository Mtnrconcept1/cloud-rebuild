import { FormEvent, useEffect, useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useOwnerRestaurants } from "./useOwnerRestaurants";

type Campaign = { id: string; title: string; discounted_price: number; original_price: number; is_active: boolean | null; restaurant_id: string; available_date: string };
const initialForm = { restaurant_id: "", title: "", original_price: "30", discounted_price: "20", available_date: new Date().toISOString().slice(0, 10) };

export default function DashboardCampagneOverview() {
  const { toast } = useToast();
  const { restaurants, restaurantIds, loading: loadingRestaurants, error: restaurantError } = useOwnerRestaurants();
  const [items, setItems] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(initialForm);

  const load = async () => {
    if (!restaurantIds.length) return setLoading(false);
    setLoading(true);
    const { data, error } = await supabase.from("anti_waste_offers").select("id,title,discounted_price,original_price,is_active,restaurant_id,available_date").in("restaurant_id", restaurantIds).order("created_at", { ascending: false });
    setError(error?.message || null); setItems((data || []) as Campaign[]); setLoading(false);
  };

  useEffect(() => { if (!loadingRestaurants) { if (!form.restaurant_id && restaurants[0]?.id) setForm((v) => ({ ...v, restaurant_id: restaurants[0].id })); load(); } /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [loadingRestaurants, restaurantIds.join(",")]);

  const save = async (event: FormEvent) => {
    event.preventDefault();
    const original = Number(form.original_price); const discounted = Number(form.discounted_price);
    if (!form.restaurant_id || !form.title.trim()) return toast({ title: "Validation", description: "Restaurant et titre requis.", variant: "destructive" });
    if (!Number.isFinite(original) || !Number.isFinite(discounted) || discounted >= original) return toast({ title: "Validation", description: "Prix promotionnel invalide.", variant: "destructive" });
    const payload = { restaurant_id: form.restaurant_id, title: form.title.trim(), original_price: original, discounted_price: discounted, available_date: form.available_date, pickup_start: `${form.available_date}T12:00:00`, pickup_end: `${form.available_date}T14:00:00`, quantity_available: 20, is_active: true };
    const { error } = editingId ? await supabase.from("anti_waste_offers").update(payload).eq("id", editingId) : await supabase.from("anti_waste_offers").insert(payload);
    if (error) return toast({ title: "Erreur", description: error.message, variant: "destructive" });
    toast({ title: editingId ? "Campagne mise à jour" : "Campagne créée" });
    setEditingId(null); setForm({ ...initialForm, restaurant_id: restaurants[0]?.id || "" }); load();
  };

  return (
    <DashboardLayout><div className="space-y-6"><h1 className="font-display text-3xl font-bold">Campagnes overview</h1>
      <Card><CardHeader><CardTitle>{editingId ? "Éditer" : "Créer"} une campagne</CardTitle></CardHeader><CardContent><form className="grid gap-3 md:grid-cols-2" onSubmit={save}><div><Label>Restaurant</Label><select className="w-full rounded-md border bg-background px-3 py-2 text-sm" value={form.restaurant_id} onChange={(e) => setForm((v) => ({ ...v, restaurant_id: e.target.value }))}><option value="">Sélectionner</option>{restaurants.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</select></div><div><Label>Titre</Label><Input value={form.title} onChange={(e) => setForm((v) => ({ ...v, title: e.target.value }))} /></div><div><Label>Prix initial</Label><Input value={form.original_price} onChange={(e) => setForm((v) => ({ ...v, original_price: e.target.value }))} /></div><div><Label>Prix promo</Label><Input value={form.discounted_price} onChange={(e) => setForm((v) => ({ ...v, discounted_price: e.target.value }))} /></div><div><Label>Date</Label><Input type="date" value={form.available_date} onChange={(e) => setForm((v) => ({ ...v, available_date: e.target.value }))} /></div><Button type="submit" className="w-fit">Enregistrer</Button></form></CardContent></Card>
      {loadingRestaurants || loading ? <p>Chargement...</p> : null}
      {restaurantError || error ? <p className="text-destructive">Erreur: {restaurantError || error}</p> : null}
      {!loading && !error && !items.length ? <p>Aucune campagne.</p> : null}
      <div className="space-y-2">{items.map((item) => <Card key={item.id}><CardContent className="pt-4 flex flex-wrap justify-between gap-2"><p className="text-sm">{item.title} · {item.discounted_price}€ / {item.original_price}€ · {item.available_date}</p><div className="flex gap-2 items-center"><Switch checked={Boolean(item.is_active)} onCheckedChange={async (checked) => { const { error } = await supabase.from("anti_waste_offers").update({ is_active: checked }).eq("id", item.id); if (error) toast({ title: "Erreur", description: error.message, variant: "destructive" }); else { toast({ title: checked ? "Campagne activée" : "Campagne désactivée" }); load(); } }} /><Button size="sm" variant="outline" onClick={() => { setEditingId(item.id); setForm({ restaurant_id: item.restaurant_id, title: item.title, original_price: String(item.original_price), discounted_price: String(item.discounted_price), available_date: item.available_date }); }}>Éditer</Button><Button size="sm" variant="destructive" onClick={async () => { const { error } = await supabase.from("anti_waste_offers").delete().eq("id", item.id); if (error) toast({ title: "Erreur", description: error.message, variant: "destructive" }); else { toast({ title: "Campagne supprimée" }); load(); } }}>Supprimer</Button></div></CardContent></Card>)}</div>
    </div></DashboardLayout>
  );
}
