import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Plus, Trash2, UtensilsCrossed } from "lucide-react";

export default function DropsManagement() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [newDrop, setNewDrop] = useState({
    restaurant_id: "", chef_name: "", dish_name: "", price: "",
    total_portions: "20", drop_time: new Date(Date.now() + 3600000).toISOString().slice(0, 16)
  });

  const { data: drops } = useQuery({
    queryKey: ["admin-drops"],
    queryFn: async () => {
      const { data, error } = await supabase.from("chef_table_drops" as any).select("*, restaurants(name)").order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const { data: restaurants } = useQuery({
    queryKey: ["admin-restaurants-list"],
    queryFn: async () => {
      const { data } = await supabase.from("restaurants").select("id, name").eq("is_active", true);
      return data || [];
    },
  });

  const createDropMutation = useMutation({
    mutationFn: async (drop: any) => {
      const { error } = await supabase.from("chef_table_drops" as any).insert([drop]);
      if (error) throw error;
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["admin-drops"] }); toast({ title: "Drop créé !" }); },
  });

  const deleteDropMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("chef_table_drops" as any).delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["admin-drops"] }); toast({ title: "Drop supprimé" }); },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newDrop.restaurant_id) return;
    createDropMutation.mutate({
      ...newDrop, price: parseFloat(newDrop.price), total_portions: parseInt(newDrop.total_portions),
      remaining_portions: parseInt(newDrop.total_portions), drop_time: new Date(newDrop.drop_time).toISOString()
    });
  };

  return (
    <div className="container py-8 space-y-8">
      <div className="flex items-center gap-3">
        <UtensilsCrossed className="h-8 w-8 text-pink-500" />
        <h1 className="text-3xl font-bold font-display">Gestion des Drops</h1>
      </div>
      <Card>
        <CardHeader><CardTitle>Nouveau Drop Chef's Table</CardTitle></CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Restaurant</Label>
              <select className="w-full rounded-md border p-2 text-sm" value={newDrop.restaurant_id} onChange={(e) => setNewDrop({ ...newDrop, restaurant_id: e.target.value })}>
                <option value="">Sélectionner...</option>
                {restaurants?.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
              </select>
            </div>
            <div className="space-y-2"><Label>Chef</Label><Input value={newDrop.chef_name} onChange={e => setNewDrop({ ...newDrop, chef_name: e.target.value })} placeholder="Nom du Chef" /></div>
            <div className="space-y-2"><Label>Plat</Label><Input value={newDrop.dish_name} onChange={e => setNewDrop({ ...newDrop, dish_name: e.target.value })} placeholder="Nom du plat" /></div>
            <div className="space-y-2"><Label>Prix (CHF)</Label><Input type="number" step="0.01" value={newDrop.price} onChange={e => setNewDrop({ ...newDrop, price: e.target.value })} /></div>
            <div className="space-y-2"><Label>Portions</Label><Input type="number" value={newDrop.total_portions} onChange={e => setNewDrop({ ...newDrop, total_portions: e.target.value })} /></div>
            <div className="space-y-2"><Label>Heure du Drop</Label><Input type="datetime-local" value={newDrop.drop_time} onChange={e => setNewDrop({ ...newDrop, drop_time: e.target.value })} /></div>
            <Button className="md:col-span-2 bg-pink-500 hover:bg-pink-600" disabled={createDropMutation.isPending}><Plus className="h-4 w-4 mr-2" /> Créer le Drop</Button>
          </form>
        </CardContent>
      </Card>
      <div className="grid grid-cols-1 gap-4">
        {drops?.map((drop: any) => (
          <Card key={drop.id}>
            <CardContent className="flex items-center justify-between p-6">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-xl bg-pink-100 flex items-center justify-center text-pink-600"><UtensilsCrossed className="h-6 w-6" /></div>
                <div>
                  <p className="font-bold">{drop.dish_name} par {drop.chef_name}</p>
                  <p className="text-sm text-muted-foreground">{drop.restaurants?.name} · {drop.price} CHF</p>
                  <p className="text-xs text-muted-foreground">Restant: {drop.remaining_portions}/{drop.total_portions} · {new Date(drop.drop_time).toLocaleString()}</p>
                </div>
              </div>
              <Button variant="ghost" size="icon" className="text-destructive" onClick={() => deleteDropMutation.mutate(drop.id)}><Trash2 className="h-4 w-4" /></Button>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
