import { FormEvent, useEffect, useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import { useOwnerRestaurants } from "./useOwnerRestaurants";

type RestaurantSocial = { id: string; name: string; is_active: boolean | null; opening_hours: Json | null };

export default function DashboardReseauxSociaux() {
  const { toast } = useToast();
  const { restaurantIds, loading: loadingRestaurants, error: restaurantError } = useOwnerRestaurants();
  const [items, setItems] = useState<RestaurantSocial[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [instagram, setInstagram] = useState("");

  const load = async () => {
    if (!restaurantIds.length) return setLoading(false);
    setLoading(true);
    const { data, error } = await supabase.from("restaurants").select("id,name,is_active,opening_hours").in("id", restaurantIds).order("name");
    setError(error?.message || null); setItems((data || []) as RestaurantSocial[]); setLoading(false);
  };

  useEffect(() => { if (!loadingRestaurants) load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [loadingRestaurants, restaurantIds.join(",")]);

  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (!editing) return;
    if (!instagram.trim()) return toast({ title: "Validation", description: "Le lien Instagram est requis.", variant: "destructive" });
    const target = items.find((item) => item.id === editing);
    const payload = { opening_hours: { ...((target?.opening_hours as any) || {}), social_instagram: instagram.trim() } };
    const { error } = await supabase.from("restaurants").update(payload).eq("id", editing);
    if (error) return toast({ title: "Erreur", description: error.message, variant: "destructive" });
    toast({ title: "Compte social enregistré" }); setEditing(null); setInstagram(""); load();
  };

  return (
    <DashboardLayout><div className="space-y-6"><h1 className="font-display text-3xl font-bold">Réseaux sociaux</h1>
      <Card><CardHeader><CardTitle>Connecter Instagram</CardTitle></CardHeader><CardContent><form onSubmit={save} className="grid gap-3 md:grid-cols-2"><div><Label>Restaurant</Label><select className="w-full rounded-md border bg-background px-3 py-2 text-sm" value={editing || ""} onChange={(e) => setEditing(e.target.value)}><option value="">Sélectionner</option>{items.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></div><div><Label>URL Instagram</Label><Input placeholder="https://instagram.com/moncompte" value={instagram} onChange={(e) => setInstagram(e.target.value)} /></div><Button type="submit" className="w-fit">Enregistrer</Button></form></CardContent></Card>
      {loadingRestaurants || loading ? <p>Chargement...</p> : null}
      {restaurantError || error ? <p className="text-destructive">Erreur: {restaurantError || error}</p> : null}
      {!loading && !error && !items.length ? <p>Aucun restaurant.</p> : null}
      <div className="space-y-2">{items.map((item) => (
        <Card key={item.id}><CardContent className="pt-4 flex flex-wrap items-center justify-between gap-2"><div><p className="font-medium">{item.name}</p><p className="text-sm text-muted-foreground">{(item.opening_hours as any)?.social_instagram || "Non connecté"}</p></div><div className="flex gap-2 items-center"><Switch checked={Boolean(item.is_active)} onCheckedChange={async (checked) => { const { error } = await supabase.from("restaurants").update({ is_active: checked }).eq("id", item.id); if (error) toast({ title: "Erreur", description: error.message, variant: "destructive" }); else { toast({ title: checked ? "Compte activé" : "Compte désactivé" }); load(); } }} /><Button size="sm" variant="destructive" onClick={async () => { const payload = { opening_hours: { ...((item.opening_hours as any) || {}), social_instagram: null } }; const { error } = await supabase.from("restaurants").update(payload).eq("id", item.id); if (error) toast({ title: "Erreur", description: error.message, variant: "destructive" }); else { toast({ title: "Compte supprimé" }); load(); } }}>Supprimer</Button></div></CardContent></Card>
      ))}</div>
    </div></DashboardLayout>
  );
}
