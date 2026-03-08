import { FormEvent, useEffect, useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useOwnerRestaurants } from "./useOwnerRestaurants";

type Order = { id: string; status: string; total_amount: number | null; created_at: string; restaurant_id: string; user_id: string };
type PerformanceTotals = { orders_count: number; reservations_count: number; revenue: number; avg_ticket: number; cancel_rate: number };
type PerformanceDaily = { date: string; orders_count: number; reservations_count: number; revenue: number; avg_ticket: number; cancel_rate: number };
type PerformancePayload = { period: { from: string; to: string }; totals: PerformanceTotals; daily: PerformanceDaily[] };

export default function DashboardPerformances() {
  const { toast } = useToast();
  const { restaurants, restaurantIds, loading: loadingRestaurants, error: restaurantError } = useOwnerRestaurants();
  const [items, setItems] = useState<Order[]>([]);
  const [performance, setPerformance] = useState<PerformancePayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [amount, setAmount] = useState("35");

  const load = async () => {
    if (!restaurantIds.length) return setLoading(false);
    setLoading(true);
    const selectedRestaurant = restaurantIds[0];
    const now = new Date(); const from = new Date(now); from.setDate(now.getDate() - 29);
    const [ordersRes, perfRes] = await Promise.all([
      supabase.from("orders").select("id,status,total_amount,created_at,restaurant_id,user_id").eq("restaurant_id", selectedRestaurant).order("created_at", { ascending: false }).limit(30),
      supabase.rpc("get_restaurant_performance", { p_restaurant_id: selectedRestaurant, p_from: from.toISOString().slice(0, 10), p_to: now.toISOString().slice(0, 10) }),
    ]);
    setError(ordersRes.error?.message || perfRes.error?.message || null);
    setItems((ordersRes.data || []) as Order[]);
    setPerformance((perfRes.data as PerformancePayload) || null);
    setLoading(false);
  };

  useEffect(() => { if (!loadingRestaurants) load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [loadingRestaurants, restaurantIds.join(",")]);

  const createOrder = async (event: FormEvent) => {
    event.preventDefault();
    const value = Number(amount);
    if (!restaurants[0]?.id) return toast({ title: "Aucun restaurant", variant: "destructive" });
    if (!Number.isFinite(value) || value <= 0) return toast({ title: "Validation", description: "Montant invalide.", variant: "destructive" });
    const now = new Date();
    const payload = { restaurant_id: restaurants[0].id, user_id: "00000000-0000-0000-0000-000000000000", status: "pending", total_amount: value, date: now.toISOString().slice(0, 10), time: now.toTimeString().slice(0, 5), party_size: 1, feature: "performance_manual" };
    const { error } = await supabase.from("orders").insert(payload);
    if (error) return toast({ title: "Erreur", description: error.message, variant: "destructive" });
    toast({ title: "Ligne de performance créée" }); load();
  };

  const totals = performance?.totals;
  return (
    <DashboardLayout><div className="space-y-6"><h1 className="font-display text-3xl font-bold">Performances</h1>
      <div className="grid gap-3 md:grid-cols-3"><Card><CardHeader><CardTitle>CA (30j)</CardTitle></CardHeader><CardContent>{Number(totals?.revenue || 0).toFixed(2)}€</CardContent></Card><Card><CardHeader><CardTitle>Panier moyen</CardTitle></CardHeader><CardContent>{Number(totals?.avg_ticket || 0).toFixed(2)}€</CardContent></Card><Card><CardHeader><CardTitle>Taux d'annulation</CardTitle></CardHeader><CardContent>{(Number(totals?.cancel_rate || 0) * 100).toFixed(1)}%</CardContent></Card></div>
      <Card><CardHeader><CardTitle>Ajouter une ligne de suivi</CardTitle></CardHeader><CardContent><form onSubmit={createOrder} className="flex items-end gap-3"><div className="space-y-1"><Label>Montant</Label><Input value={amount} onChange={(e) => setAmount(e.target.value)} /></div><Button type="submit">Créer</Button></form></CardContent></Card>
      {loadingRestaurants || loading ? <p>Chargement...</p> : null}
      {restaurantError || error ? <p className="text-destructive">Erreur: {restaurantError || error}</p> : null}
      {!loading && !error && !items.length ? <p>Aucune donnée de performance.</p> : null}
      <div className="space-y-2">{items.map((item) => <Card key={item.id}><CardContent className="pt-4 flex flex-wrap justify-between gap-2"><p className="text-sm">{item.created_at.slice(0, 10)} · {item.total_amount || 0}€ · {item.status}</p><div className="flex gap-2"><Button size="sm" variant="outline" onClick={async () => { const next = item.status === "delivered" ? "pending" : "delivered"; const { error } = await supabase.from("orders").update({ status: next }).eq("id", item.id); if (error) toast({ title: "Erreur", description: error.message, variant: "destructive" }); else { toast({ title: `Statut: ${next}` }); load(); } }}>Activer</Button><Button size="sm" variant="destructive" onClick={async () => { const { error } = await supabase.from("orders").delete().eq("id", item.id); if (error) toast({ title: "Erreur", description: error.message, variant: "destructive" }); else { toast({ title: "Ligne supprimée" }); load(); } }}>Supprimer</Button></div></CardContent></Card>)}</div>
    </div></DashboardLayout>
  );
}
