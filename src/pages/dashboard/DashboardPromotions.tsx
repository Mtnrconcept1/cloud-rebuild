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

type Promotion = { id: string; title: string; discounted_price: number; original_price: number; is_active: boolean; sale_date: string; restaurant_id: string };
const initialForm = { restaurant_id: "", title: "", original_price: "20", discounted_price: "15", sale_date: new Date().toISOString().slice(0, 10) };

export default function DashboardPromotions() {
  const { toast } = useToast();
  const { restaurants, restaurantIds, loading: loadingRestaurants, error: restaurantError } = useOwnerRestaurants();
  const [items, setItems] = useState<Promotion[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(initialForm);

  const load = async () => {
    if (!restaurantIds.length) return setLoading(false);
    setLoading(true);
    const { data, error } = await supabase.from("flash_sales").select("id,title,discounted_price,original_price,is_active,sale_date,restaurant_id").in("restaurant_id", restaurantIds).order("created_at", { ascending: false });
    setError(error?.message || null); setItems((data || []) as Promotion[]); setLoading(false);
  };

  useEffect(() => { if (!loadingRestaurants) { if (!form.restaurant_id && restaurants[0]?.id) setForm((v) => ({ ...v, restaurant_id: restaurants[0].id })); load(); } /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [loadingRestaurants, restaurantIds.join(",")]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!form.restaurant_id || !form.title.trim()) return toast({ title: "Validation", description: "Restaurant et titre requis.", variant: "destructive" });
    const original = Number(form.original_price); const discounted = Number(form.discounted_price);
    if (!Number.isFinite(original) || !Number.isFinite(discounted) || discounted >= original) return toast({ title: "Validation", description: "Le prix promo doit être inférieur au prix d'origine.", variant: "destructive" });
    const payload = { restaurant_id: form.restaurant_id, title: form.title.trim(), original_price: original, discounted_price: discounted, sale_date: form.sale_date, sale_start: `${form.sale_date}T10:00:00`, sale_end: `${form.sale_date}T22:00:00`, quantity_available: 50, takeaway_available: true, delivery_available: true, is_active: true };
    const { error } = editingId ? await supabase.from("flash_sales").update(payload).eq("id", editingId) : await supabase.from("flash_sales").insert(payload);
    if (error) return toast({ title: "Erreur", description: error.message, variant: "destructive" });
    toast({ title: editingId ? "Promotion mise à jour" : "Promotion créée" });
    setEditingId(null); setForm({ ...initialForm, restaurant_id: restaurants[0]?.id || "" }); load();
  };

  return (
    <DashboardLayout><div className="space-y-6"><h1 className="font-display text-3xl font-bold">Promotions</h1>
      <Card><CardHeader><CardTitle>{editingId ? "Éditer" : "Créer"} une promotion</CardTitle></CardHeader><CardContent>
        <form className="grid gap-3 md:grid-cols-2" onSubmit={submit}>
          <div><Label>Restaurant</Label><select className="w-full rounded-md border bg-background px-3 py-2 text-sm" value={form.restaurant_id} onChange={(e) => setForm((v) => ({ ...v, restaurant_id: e.target.value }))}><option value="">Sélectionner</option>{restaurants.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</select></div>
          <div><Label>Titre</Label><Input value={form.title} onChange={(e) => setForm((v) => ({ ...v, title: e.target.value }))} /></div>
          <div><Label>Prix initial</Label><Input value={form.original_price} onChange={(e) => setForm((v) => ({ ...v, original_price: e.target.value }))} /></div>
          <div><Label>Prix promo</Label><Input value={form.discounted_price} onChange={(e) => setForm((v) => ({ ...v, discounted_price: e.target.value }))} /></div>
          <div><Label>Date</Label><Input type="date" value={form.sale_date} onChange={(e) => setForm((v) => ({ ...v, sale_date: e.target.value }))} /></div>
          <div className="flex gap-2 items-end"><Button type="submit">Enregistrer</Button>{editingId && <Button type="button" variant="outline" onClick={() => { setEditingId(null); setForm({ ...initialForm, restaurant_id: restaurants[0]?.id || "" }); }}>Annuler</Button>}</div>
        </form>
      </CardContent></Card>
      {loadingRestaurants || loading ? <p>Chargement...</p> : null}
      {restaurantError || error ? <p className="text-destructive">Erreur: {restaurantError || error}</p> : null}
      {!loading && !error && !items.length ? <p>Aucune promotion.</p> : null}
      <div className="grid gap-3">{items.map((item) => (
        <Card key={item.id}><CardContent className="pt-6 space-y-3"><div className="flex justify-between"><p className="font-medium">{item.title}</p><p>{item.discounted_price}€ / <span className="line-through">{item.original_price}€</span></p></div>
          <div className="flex items-center gap-2"><Switch checked={item.is_active} onCheckedChange={async (checked) => { const { error } = await supabase.from("flash_sales").update({ is_active: checked }).eq("id", item.id); if (error) toast({ title: "Erreur", description: error.message, variant: "destructive" }); else { toast({ title: checked ? "Promotion activée" : "Promotion désactivée" }); load(); } }} /><span className="text-sm">Active</span></div>
          <div className="flex gap-2"><Button size="sm" variant="outline" onClick={() => { setEditingId(item.id); setForm({ restaurant_id: item.restaurant_id, title: item.title, original_price: String(item.original_price), discounted_price: String(item.discounted_price), sale_date: item.sale_date.slice(0, 10) }); }}>Éditer</Button><Button size="sm" variant="destructive" onClick={async () => { const { error } = await supabase.from("flash_sales").delete().eq("id", item.id); if (error) toast({ title: "Erreur", description: error.message, variant: "destructive" }); else { toast({ title: "Promotion supprimée" }); load(); } }}>Supprimer</Button></div>
        </CardContent></Card>
      ))}</div>
    </div></DashboardLayout>
  );
}
