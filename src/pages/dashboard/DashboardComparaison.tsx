import { FormEvent, useEffect, useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useOwnerRestaurants } from "./useOwnerRestaurants";

type Reservation = { id: string; date: string; party_size: number; status: string; created_at: string; restaurant_id: string; user_id: string; time: string };
type ComparisonMetrics = { revenue: number; orders_count: number; reservations_count: number; avg_ticket: number; cancel_rate: number };
type ComparisonPayload = { current: ComparisonMetrics; previous: ComparisonMetrics; delta: ComparisonMetrics; period: string };

export default function DashboardComparaison() {
  const { toast } = useToast();
  const { restaurants, restaurantIds, loading: loadingRestaurants, error: restaurantError } = useOwnerRestaurants();
  const [items, setItems] = useState<Reservation[]>([]);
  const [comparison, setComparison] = useState<ComparisonPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [partySize, setPartySize] = useState("2");

  const load = async () => {
    if (!restaurantIds.length) return setLoading(false);
    setLoading(true);
    const selectedRestaurant = restaurantIds[0];
    const [reservationsRes, comparisonRes] = await Promise.all([
      supabase.from("reservations").select("id,date,party_size,status,created_at,restaurant_id,user_id,time").eq("restaurant_id", selectedRestaurant).order("date", { ascending: false }).limit(40),
      supabase.rpc("get_restaurant_comparison", { p_restaurant_id: selectedRestaurant, p_period: "30d" }),
    ]);
    setError(reservationsRes.error?.message || comparisonRes.error?.message || null);
    setItems((reservationsRes.data || []) as Reservation[]);
    setComparison((comparisonRes.data as ComparisonPayload) || null);
    setLoading(false);
  };

  useEffect(() => { if (!loadingRestaurants) load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [loadingRestaurants, restaurantIds.join(",")]);

  const create = async (event: FormEvent) => {
    event.preventDefault();
    if (!restaurants[0]?.id) return toast({ title: "Aucun restaurant", variant: "destructive" });
    const size = Number(partySize);
    if (!Number.isFinite(size) || size < 1) return toast({ title: "Validation", description: "Nombre de couverts invalide.", variant: "destructive" });
    const now = new Date();
    const payload = { restaurant_id: restaurants[0].id, user_id: "00000000-0000-0000-0000-000000000000", date: now.toISOString().slice(0, 10), time: "20:00", party_size: size, status: "confirmed", feature: "comparison_manual" };
    const { error } = await supabase.from("reservations").insert(payload);
    if (error) return toast({ title: "Erreur", description: error.message, variant: "destructive" });
    toast({ title: "Réservation ajoutée" }); load();
  };

  return (
    <DashboardLayout><div className="space-y-6"><h1 className="font-display text-3xl font-bold">Comparaison</h1>
      <div className="grid gap-3 md:grid-cols-3"><Card><CardHeader><CardTitle>CA actuel</CardTitle></CardHeader><CardContent>{Number(comparison?.current?.revenue || 0).toFixed(2)}€</CardContent></Card><Card><CardHeader><CardTitle>CA précédent</CardTitle></CardHeader><CardContent>{Number(comparison?.previous?.revenue || 0).toFixed(2)}€</CardContent></Card><Card><CardHeader><CardTitle>Écart CA</CardTitle></CardHeader><CardContent>{Number(comparison?.delta?.revenue || 0) >= 0 ? "+" : ""}{Number(comparison?.delta?.revenue || 0).toFixed(2)}€</CardContent></Card></div>
      <Card><CardHeader><CardTitle>Ajouter une donnée</CardTitle></CardHeader><CardContent><form onSubmit={create} className="flex items-end gap-3"><div><Label>Couverts</Label><Input value={partySize} onChange={(e) => setPartySize(e.target.value)} /></div><Button type="submit">Créer</Button></form></CardContent></Card>
      {loadingRestaurants || loading ? <p>Chargement...</p> : null}
      {restaurantError || error ? <p className="text-destructive">Erreur: {restaurantError || error}</p> : null}
      {!loading && !error && !items.length ? <p>Aucune réservation.</p> : null}
      <div className="space-y-2">{items.map((item) => <Card key={item.id}><CardContent className="pt-4 flex justify-between"><p className="text-sm">{item.date} · {item.party_size} pers. · {item.status}</p><div className="flex gap-2"><Button size="sm" variant="outline" onClick={async () => { const next = item.status === "confirmed" ? "cancelled" : "confirmed"; const { error } = await supabase.from("reservations").update({ status: next }).eq("id", item.id); if (error) toast({ title: "Erreur", description: error.message, variant: "destructive" }); else { toast({ title: `Statut: ${next}` }); load(); } }}>Activer</Button><Button size="sm" variant="destructive" onClick={async () => { const { error } = await supabase.from("reservations").delete().eq("id", item.id); if (error) toast({ title: "Erreur", description: error.message, variant: "destructive" }); else { toast({ title: "Supprimée" }); load(); } }}>Supprimer</Button></div></CardContent></Card>)}</div>
    </div></DashboardLayout>
  );
}
