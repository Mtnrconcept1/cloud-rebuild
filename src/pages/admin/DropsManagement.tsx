import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getSupabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { Plus, Trash2, UtensilsCrossed, Pencil } from "lucide-react";

const supabase = getSupabase();

const EMPTY_DROP = {
  restaurant_id: "",
  chef_name: "",
  dish_name: "",
  description: "",
  image_url: "",
  price: "",
  original_price: "",
  total_portions: "20",
  drop_time: new Date(Date.now() + 3600000).toISOString().slice(0, 16),
  is_active: true,
};

export default function DropsManagement() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [form, setForm] = useState(EMPTY_DROP);
  const [editingId, setEditingId] = useState<string | null>(null);

  const { data: drops = [] } = useQuery({
    queryKey: ["admin-drops"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("chef_table_drops" as any)
        .select("*, restaurants(name)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
  });

  const { data: restaurants = [] } = useQuery({
    queryKey: ["admin-restaurants-list"],
    queryFn: async () => {
      const { data, error } = await supabase.from("restaurants").select("id, name").eq("is_active", true).order("name");
      if (error) throw error;
      return data || [];
    },
  });

  const createOrUpdateMutation = useMutation({
    mutationFn: async (payload: any) => {
      if (editingId) {
        const { error } = await supabase.from("chef_table_drops" as any).update(payload).eq("id", editingId);
        if (error) throw error;
        return;
      }
      const { error } = await supabase.from("chef_table_drops" as any).insert([payload]);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-drops"] });
      toast({ title: editingId ? "Experience mise a jour" : "Experience creee" });
      setEditingId(null);
      setForm(EMPTY_DROP);
    },
    onError: (error: any) => {
      toast({ title: "Erreur", description: error.message || "Operation impossible.", variant: "destructive" });
    },
  });

  const deleteDropMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("chef_table_drops" as any).delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-drops"] });
      toast({ title: "Experience supprimee" });
    },
    onError: (error: any) => {
      toast({ title: "Erreur", description: error.message || "Suppression impossible.", variant: "destructive" });
    },
  });

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!form.restaurant_id) {
      toast({ title: "Validation", description: "Selectionnez un restaurant.", variant: "destructive" });
      return;
    }

    createOrUpdateMutation.mutate({
      restaurant_id: form.restaurant_id,
      chef_name: form.chef_name,
      dish_name: form.dish_name,
      description: form.description || null,
      image_url: form.image_url || null,
      price: Number(form.price || 0),
      original_price: form.original_price ? Number(form.original_price) : null,
      total_portions: Number(form.total_portions || 0),
      remaining_portions: editingId ? undefined : Number(form.total_portions || 0),
      drop_time: new Date(form.drop_time).toISOString(),
      is_active: form.is_active,
    });
  };

  const startEdit = (drop: any) => {
    setEditingId(drop.id);
    setForm({
      restaurant_id: drop.restaurant_id || "",
      chef_name: drop.chef_name || "",
      dish_name: drop.dish_name || "",
      description: drop.description || "",
      image_url: drop.image_url || "",
      price: String(drop.price ?? ""),
      original_price: String(drop.original_price ?? ""),
      total_portions: String(drop.total_portions ?? 0),
      drop_time: new Date(drop.drop_time).toISOString().slice(0, 16),
      is_active: drop.is_active ?? true,
    });
  };

  return (
    <div className="container py-8 space-y-8">
      <div className="flex items-center gap-3">
        <UtensilsCrossed className="h-8 w-8 text-pink-500" />
        <div>
          <h1 className="text-3xl font-bold font-display">La Table du Chef</h1>
          <p className="text-sm text-muted-foreground">
            Creez, modifiez et desactivez les experiences exclusives proposees par vos chefs.
          </p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{editingId ? "Modifier l'experience" : "Nouvelle experience La Table du Chef"}</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Restaurant</Label>
              <select
                className="w-full rounded-md border p-2 text-sm"
                value={form.restaurant_id}
                onChange={(event) => setForm({ ...form, restaurant_id: event.target.value })}
              >
                <option value="">Selectionner...</option>
                {restaurants.map((restaurant: any) => (
                  <option key={restaurant.id} value={restaurant.id}>
                    {restaurant.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label>Chef</Label>
              <Input
                value={form.chef_name}
                onChange={(event) => setForm({ ...form, chef_name: event.target.value })}
                placeholder="Nom du chef"
                required
              />
            </div>
            <div className="space-y-2">
              <Label>Plat</Label>
              <Input
                value={form.dish_name}
                onChange={(event) => setForm({ ...form, dish_name: event.target.value })}
                placeholder="Nom du plat"
                required
              />
            </div>
            <div className="space-y-2">
              <Label>Prix (CHF)</Label>
              <Input
                type="number"
                step="0.01"
                value={form.price}
                onChange={(event) => setForm({ ...form, price: event.target.value })}
                required
              />
            </div>
            <div className="space-y-2">
              <Label>Prix d'origine (CHF)</Label>
              <Input
                type="number"
                step="0.01"
                value={form.original_price}
                onChange={(event) => setForm({ ...form, original_price: event.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>Portions disponibles</Label>
              <Input
                type="number"
                value={form.total_portions}
                onChange={(event) => setForm({ ...form, total_portions: event.target.value })}
                required
              />
              <p className="text-xs text-muted-foreground">
                Quantite limitee, comme une vente flash. Le compteur diminue a chaque reservation confirmee.
              </p>
            </div>
            <div className="space-y-2">
              <Label>Date de reference</Label>
              <Input
                type="datetime-local"
                value={form.drop_time}
                onChange={(event) => setForm({ ...form, drop_time: event.target.value })}
                required
              />
              <p className="text-xs text-muted-foreground">
                Sert de date par defaut. Le client choisira son creneau parmi les horaires du restaurant.
              </p>
            </div>
            <div className="space-y-2">
              <Label>Image URL</Label>
              <Input
                value={form.image_url}
                onChange={(event) => setForm({ ...form, image_url: event.target.value })}
              />
            </div>
            <div className="md:col-span-2 space-y-2">
              <Label>Description</Label>
              <Textarea
                value={form.description}
                onChange={(event) => setForm({ ...form, description: event.target.value })}
              />
            </div>

            <label className="md:col-span-2 flex items-center gap-2 rounded-lg border px-3 py-2 text-sm">
              <input
                type="checkbox"
                checked={form.is_active}
                onChange={() => setForm({ ...form, is_active: !form.is_active })}
              />
              <span>Experience active</span>
            </label>
            <div className="md:col-span-2 flex gap-2">
              <Button className="flex-1 bg-pink-500 hover:bg-pink-600" disabled={createOrUpdateMutation.isPending}>
                <Plus className="h-4 w-4 mr-2" />
                {editingId ? "Mettre a jour l'experience" : "Creer l'experience"}
              </Button>
              {editingId ? (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setEditingId(null);
                    setForm(EMPTY_DROP);
                  }}
                >
                  Annuler
                </Button>
              ) : null}
            </div>
          </form>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-4">
        {drops.map((drop: any) => (
          <Card key={drop.id}>
            <CardContent className="flex flex-col gap-4 p-6 md:flex-row md:items-center md:justify-between">
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 rounded-xl bg-pink-100 flex items-center justify-center text-pink-600">
                  <UtensilsCrossed className="h-6 w-6" />
                </div>
                <div className="space-y-1">
                  <p className="font-bold">
                    {drop.dish_name} par {drop.chef_name}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {drop.restaurants?.name} | {drop.price} CHF
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Restant: {drop.remaining_portions}/{drop.total_portions} | Date:{" "}
                    {new Date(drop.drop_time).toLocaleString()}
                  </p>
                  <p className="text-xs text-muted-foreground">{drop.is_active ? "Active" : "Inactive"}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="icon" onClick={() => startEdit(drop)}>
                  <Pencil className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="text-destructive"
                  onClick={() => deleteDropMutation.mutate(drop.id)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
        {drops.length === 0 ? (
          <p className="text-sm text-muted-foreground">Aucune experience definie.</p>
        ) : null}
      </div>
    </div>
  );
}
