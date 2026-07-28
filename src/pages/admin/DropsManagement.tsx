import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getSupabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import DashboardPageHero from "@/components/dashboard/DashboardPageHero";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { MIAMZ_VIP_TABLE_DEFAULT_THRESHOLD } from "@/lib/loyaltyBenefits";
import { Crown, Plus, Trash2, UtensilsCrossed, Pencil } from "lucide-react";

const supabase = getSupabase();
const DROPS_PAGE_SIZE = 50;

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
  is_vip: false,
  required_miamz_points: String(MIAMZ_VIP_TABLE_DEFAULT_THRESHOLD),
};

export default function DropsManagement() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [form, setForm] = useState(EMPTY_DROP);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [page, setPage] = useState(0);

  const { data: dropsPage } = useQuery({
    queryKey: ["admin-drops", page],
    queryFn: async () => {
      const { data, error, count } = await supabase
        .from("chef_table_drops" as any)
        .select("id, restaurant_id, chef_name, dish_name, description, image_url, price, original_price, total_portions, remaining_portions, drop_time, is_active, is_vip, required_miamz_points, created_at, archived_at, restaurants(name)", { count: "exact" })
        .is("archived_at", null)
        .order("created_at", { ascending: false })
        .range(page * DROPS_PAGE_SIZE, ((page + 1) * DROPS_PAGE_SIZE) - 1);
      if (error) throw error;
      return { rows: data || [], count: count || 0 };
    },
  });
  const drops = dropsPage?.rows || [];
  const dropsCount = dropsPage?.count || 0;

  const { data: restaurants = [] } = useQuery({
    queryKey: ["admin-restaurants-list"],
    queryFn: async () => {
      const { data, error } = await supabase.from("restaurants").select("id, name").eq("is_active", true).order("name").limit(200);
      if (error) throw error;
      return data || [];
    },
  });

  const createOrUpdateMutation = useMutation({
    mutationFn: async (payload: any) => {
      const { error } = await (supabase.rpc as any)("admin_save_chef_table_drop", {
        p_drop_id: editingId,
        p_payload: payload,
        p_reason: editingId ? "Mise a jour drop La Table du Chef" : "Creation drop La Table du Chef",
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-drops"] });
      toast({ title: editingId ? "Expérience mise à jour" : "Expérience créée" });
      setEditingId(null);
      setForm(EMPTY_DROP);
    },
    onError: (error: any) => {
      toast({ title: "Erreur", description: error.message || "Operation impossible.", variant: "destructive" });
    },
  });

  const deleteDropMutation = useMutation({
    mutationFn: async ({ id, reason }: { id: string; reason: string }) => {
      const { error } = await (supabase.rpc as any)("admin_archive_chef_table_drop", {
        p_drop_id: id,
        p_reason: reason,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-drops"] });
      toast({ title: "Expérience archivée" });
    },
    onError: (error: any) => {
      toast({ title: "Erreur", description: error.message || "Suppression impossible.", variant: "destructive" });
    },
  });

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!form.restaurant_id) {
      toast({ title: "Validation", description: "Sélectionnez un restaurant.", variant: "destructive" });
      return;
    }

    const requiredMiamzPoints = Math.max(0, Math.floor(Number(form.required_miamz_points || 0)));

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
      is_vip: form.is_vip,
      required_miamz_points: form.is_vip
        ? (requiredMiamzPoints || MIAMZ_VIP_TABLE_DEFAULT_THRESHOLD)
        : 0,
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
      is_vip: drop.is_vip ?? false,
      required_miamz_points: String(drop.required_miamz_points || MIAMZ_VIP_TABLE_DEFAULT_THRESHOLD),
    });
  };

  return (
    <div className="container py-8 space-y-8">
      <DashboardPageHero
        badge="Experiences"
        title="La Table du Chef"
        description="Créez, modifiez et désactivez les expériences exclusives proposées par vos chefs avec une vue claire des drops actifs."
        icon={UtensilsCrossed}
        tone="rose"
        visualLabel="Chef"
        stats={[
          { label: "Experiences", value: drops.length, icon: UtensilsCrossed },
          { label: "Actives", value: drops.filter((drop: any) => drop.is_active).length, icon: Plus },
          { label: "Restaurants", value: restaurants.length, icon: UtensilsCrossed },
        ]}
      />

      <Card>
        <CardHeader>
          <CardTitle>{editingId ? "Modifier l'expérience" : "Nouvelle expérience La Table du Chef"}</CardTitle>
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
                <option value="">Sélectionner...</option>
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
                Quantite limitée, comme une vente flash. Le compteur diminue à chaque réservation confirmée.
              </p>
            </div>
            <div className="space-y-2">
              <Label>Date de référence</Label>
              <Input
                type="datetime-local"
                value={form.drop_time}
                onChange={(event) => setForm({ ...form, drop_time: event.target.value })}
                required
              />
              <p className="text-xs text-muted-foreground">
                Sert de date par défaut. Le client choisira son créneau parmi les horaires du restaurant.
              </p>
            </div>
            <div className="space-y-2">
              <Label>Image URL</Label>
              <Input
                value={form.image_url}
                onChange={(event) => setForm({ ...form, image_url: event.target.value })}
              />
            </div>
            <label className="flex items-start gap-3 rounded-lg border px-3 py-3 text-sm">
              <input
                type="checkbox"
                className="mt-1"
                checked={form.is_vip}
                onChange={() => {
                  const nextIsVip = !form.is_vip;
                  setForm({
                    ...form,
                    is_vip: nextIsVip,
                    required_miamz_points: nextIsVip
                      ? (form.required_miamz_points || String(MIAMZ_VIP_TABLE_DEFAULT_THRESHOLD))
                      : "0",
                  });
                }}
              />
              <span>
                <span className="block font-medium">Table VIP</span>
                <span className="block text-xs text-muted-foreground">
                  Reservee aux clients ayant assez de Miamz pour debloquer l'acces VIP.
                </span>
              </span>
            </label>
            <div className="space-y-2">
              <Label>Seuil Miamz VIP</Label>
              <Input
                type="number"
                min={form.is_vip ? 1 : 0}
                step="1"
                value={form.required_miamz_points}
                disabled={!form.is_vip}
                onChange={(event) => setForm({ ...form, required_miamz_points: event.target.value })}
              />
              <p className="text-xs text-muted-foreground">
                Par defaut, l'acces VIP correspond au palier Platinum ({MIAMZ_VIP_TABLE_DEFAULT_THRESHOLD} Miamz).
              </p>
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
              <span>Expérience active</span>
            </label>
            <div className="md:col-span-2 flex gap-2">
              <Button className="flex-1 bg-pink-500 hover:bg-pink-600" disabled={createOrUpdateMutation.isPending}>
                <Plus className="h-4 w-4 mr-2" />
                {editingId ? "Mettre à jour l'expérience" : "Créer l'expérience"}
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

      {dropsCount > DROPS_PAGE_SIZE ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-card p-3">
          <p className="text-sm text-muted-foreground">
            Expériences {page * DROPS_PAGE_SIZE + 1}–{Math.min((page + 1) * DROPS_PAGE_SIZE, dropsCount)} sur {dropsCount}
          </p>
          <div className="flex gap-2">
            <Button type="button" variant="outline" disabled={page === 0} onClick={() => setPage((current) => Math.max(0, current - 1))}>Précédent</Button>
            <Button type="button" variant="outline" disabled={(page + 1) * DROPS_PAGE_SIZE >= dropsCount} onClick={() => setPage((current) => current + 1)}>Suivant</Button>
          </div>
        </div>
      ) : null}

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
                  {drop.is_vip ? (
                    <p className="inline-flex items-center gap-1 text-xs font-medium text-amber-700">
                      <Crown className="h-3 w-3" />
                      Table VIP dès {Number(drop.required_miamz_points || MIAMZ_VIP_TABLE_DEFAULT_THRESHOLD).toLocaleString("fr-CH")} Miamz
                    </p>
                  ) : null}
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
                  onClick={() => {
                    const reason = window.prompt("Raison obligatoire pour archiver ce drop.");
                    if (!reason?.trim()) return;
                    deleteDropMutation.mutate({ id: drop.id, reason: reason.trim() });
                  }}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
        {drops.length === 0 ? (
          <p className="text-sm text-muted-foreground">Aucune expérience définie.</p>
        ) : null}
      </div>
    </div>
  );
}
