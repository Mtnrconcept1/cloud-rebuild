import { FormEvent, useEffect, useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useOwnerRestaurants } from "./useOwnerRestaurants";

type Invoice = { id: string; created_at: string; total_amount: number | null; status: string; restaurant_id: string; user_id: string };

export default function DashboardFactures() {
  const { toast } = useToast();
  const { restaurants, restaurantIds, loading: loadingRestaurants, error: restaurantError } = useOwnerRestaurants();
  const [items, setItems] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [amount, setAmount] = useState("50");

  const load = async () => {
    if (!restaurantIds.length) return setLoading(false);
    setLoading(true);
    const { data, error } = await supabase.from("orders").select("id,created_at,total_amount,payment_method,status,restaurant_id,user_id,date,time,party_size").in("restaurant_id", restaurantIds).order("created_at", { ascending: false }).limit(25);
    setError(error?.message || null); setItems((data || []) as Invoice[]); setLoading(false);
  };

  useEffect(() => { if (!loadingRestaurants) load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [loadingRestaurants, restaurantIds.join(",")]);

  const create = async (event: FormEvent) => {
    event.preventDefault();
    const total = Number(amount);
    if (!restaurants[0]?.id) return toast({ title: "Aucun restaurant", variant: "destructive" });
    if (!Number.isFinite(total) || total <= 0) return toast({ title: "Validation", description: "Montant invalide.", variant: "destructive" });
    const now = new Date();
    const payload = { restaurant_id: restaurants[0].id, user_id: "00000000-0000-0000-0000-000000000000", total_amount: total, payment_method: "virement", status: "pending", date: now.toISOString().slice(0, 10), time: "00:00", party_size: 1, feature: "invoice_manual" };
    const { error } = await supabase.from("orders").insert(payload);
    if (error) return toast({ title: "Erreur", description: error.message, variant: "destructive" });
    toast({ title: "Facture enregistrée" }); load();
  };

  return (
    <DashboardLayout><div className="space-y-6"><h1 className="font-display text-3xl font-bold">Factures</h1>
      <Card><CardHeader><CardTitle>Créer une facture manuelle</CardTitle></CardHeader><CardContent><form onSubmit={create} className="flex items-end gap-3"><div><Label>Montant (€)</Label><Input value={amount} onChange={(e) => setAmount(e.target.value)} /></div><Button type="submit">Créer</Button></form></CardContent></Card>
      {loadingRestaurants || loading ? <p>Chargement...</p> : null}
      {restaurantError || error ? <p className="text-destructive">Erreur: {restaurantError || error}</p> : null}
      {!loading && !error && !items.length ? <p>Aucune facture.</p> : null}
      <div className="space-y-2">{items.map((item) => <Card key={item.id}><CardContent className="pt-4 flex flex-wrap justify-between gap-2"><p className="text-sm">#{item.id.slice(0, 8)} · {item.total_amount || 0}€ · {item.payment_method || "-"}</p><div className="flex gap-2"><Button size="sm" variant="outline" onClick={async () => { const next = item.status === "paid" ? "pending" : "paid"; const { error } = await supabase.from("orders").update({ status: next }).eq("id", item.id); if (error) toast({ title: "Erreur", description: error.message, variant: "destructive" }); else { toast({ title: `Statut: ${next}` }); load(); } }}>Activer</Button><Button size="sm" variant="destructive" onClick={async () => { const { error } = await supabase.from("orders").delete().eq("id", item.id); if (error) toast({ title: "Erreur", description: error.message, variant: "destructive" }); else { toast({ title: "Facture supprimée" }); load(); } }}>Supprimer</Button></div></CardContent></Card>)}</div>
    </div></DashboardLayout>
  );
}
