import { useState } from "react";
import { getSupabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import DashboardLayout from "@/components/DashboardLayout";
import DashboardPageHero from "@/components/dashboard/DashboardPageHero";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { BookOpen, Pencil, Plus, Trash2 } from "lucide-react";
import ImageUpload from "@/components/ImageUpload";
import { useDashboardRestaurant } from "./DashboardContext";

const supabase = getSupabase();

type MenuItemForm = {
  name: string;
  description: string;
  price: number;
  category: string;
  image_url: string;
  is_available: boolean;
};

type MenuItemRecord = {
  id: string;
  restaurant_id: string;
  name: string;
  description: string | null;
  price: number | string;
  category: string | null;
  image_url: string | null;
  is_available: boolean | null;
};

const emptyItem = {
  name: "",
  description: "",
  price: 0,
  category: "",
  image_url: "",
  is_available: true,
} satisfies MenuItemForm;

export default function DashboardMenu() {
  const { selectedId } = useDashboardRestaurant();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<MenuItemForm>(emptyItem);

  const restaurant = selectedId ? { id: selectedId } : null;

  const { data: items } = useQuery<MenuItemRecord[]>({
    queryKey: ["my-menu-items", restaurant?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("menu_items")
        .select("*")
        .eq("restaurant_id", restaurant!.id)
        .order("category")
        .order("name");

      if (error) throw error;
      return data || [];
    },
    enabled: !!restaurant,
  });

  const openNew = () => {
    setEditingId(null);
    setForm(emptyItem);
    setDialogOpen(true);
  };

  const openEdit = (item: MenuItemRecord) => {
    setEditingId(item.id);
    setForm({
      name: item.name,
      description: item.description || "",
      price: Number(item.price),
      category: item.category || "",
      image_url: item.image_url || "",
      is_available: item.is_available,
    });
    setDialogOpen(true);
  };

  const refreshMenu = () => {
    if (!restaurant) return;
    queryClient.invalidateQueries({ queryKey: ["my-menu-items", restaurant.id] });
  };

  const handleSave = async () => {
    if (!restaurant) return;

    if (editingId) {
      const { error } = await supabase
        .from("menu_items")
        .update(form)
        .eq("id", editingId)
        .eq("restaurant_id", restaurant.id);

      if (error) {
        toast({ title: "Erreur", description: error.message, variant: "destructive" });
        return;
      }
    } else {
      const { error } = await supabase.from("menu_items").insert({ ...form, restaurant_id: restaurant.id });
      if (error) {
        toast({ title: "Erreur", description: error.message, variant: "destructive" });
        return;
      }
    }

    toast({ title: editingId ? "Plat mis a jour" : "Plat ajoute" });
    setDialogOpen(false);
    refreshMenu();
  };

  const handleDelete = async (id: string) => {
    if (!restaurant) return;

    const { error } = await supabase
      .from("menu_items")
      .delete()
      .eq("id", id)
      .eq("restaurant_id", restaurant.id);

    if (error) {
      toast({ title: "Erreur", description: error.message, variant: "destructive" });
      return;
    }

    refreshMenu();
    toast({ title: "Plat supprime" });
  };

  const toggleAvailability = async (id: string, current: boolean) => {
    if (!restaurant) return;

    const { error } = await supabase
      .from("menu_items")
      .update({ is_available: !current })
      .eq("id", id)
      .eq("restaurant_id", restaurant.id);

    if (error) {
      toast({ title: "Erreur", description: error.message, variant: "destructive" });
      return;
    }

    refreshMenu();
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <DashboardPageHero
          badge="Carte restaurant"
          title="Menu"
          description="Organisez les plats, les prix, les photos et la disponibilite avant qu'ils apparaissent dans les parcours client."
          icon={BookOpen}
          tone="emerald"
          visualLabel="Catalogue"
          stats={[
            { label: "Plats", value: items?.length || 0, icon: BookOpen },
            { label: "Disponibles", value: items?.filter((item) => item.is_available).length || 0, icon: Plus },
            { label: "Restaurant", value: restaurant ? "Selectionne" : "Aucun", icon: BookOpen },
          ]}
          actions={(
          <Button onClick={openNew} disabled={!restaurant}>
            <Plus className="mr-2 h-4 w-4" />
            Ajouter un plat
          </Button>
          )}
        />

        {!restaurant ? (
          <p className="py-8 text-center text-muted-foreground">Selectionnez un restaurant pour gerer ses produits.</p>
        ) : (
          <div className="space-y-3">
            {items?.map((item) => (
              <div key={item.id} className="flex items-center gap-4 rounded-xl border bg-card p-4">
                {item.image_url && (
                  <img src={item.image_url} alt={item.name} className="h-16 w-16 rounded-lg object-cover" />
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <h4 className="text-sm font-semibold">{item.name}</h4>
                    {item.category && (
                      <span className="rounded bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                        {item.category}
                      </span>
                    )}
                  </div>
                  <p className="text-sm font-bold text-primary">{Number(item.price).toFixed(2)} CHF</p>
                </div>
                <Switch
                  checked={item.is_available ?? true}
                  onCheckedChange={() => toggleAvailability(item.id, item.is_available ?? true)}
                />
                <Button size="icon" variant="ghost" onClick={() => openEdit(item)}>
                  <Pencil className="h-4 w-4" />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  className="text-destructive"
                  onClick={() => handleDelete(item.id)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
            {(!items || items.length === 0) && (
              <p className="py-8 text-center text-muted-foreground">Aucun plat dans le menu</p>
            )}
          </div>
        )}

        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editingId ? "Modifier le plat" : "Nouveau plat"}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Nom</Label>
                  <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
                </div>
                <div className="space-y-2">
                  <Label>Prix (CHF)</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={form.price}
                    onChange={(e) => setForm({ ...form, price: Number(e.target.value) })}
                    required
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Categorie</Label>
                <Input
                  value={form.category}
                  onChange={(e) => setForm({ ...form, category: e.target.value })}
                  placeholder="Entrees, Plats, Desserts..."
                />
              </div>
              <div className="space-y-2">
                <Label>Description</Label>
                <Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
              </div>
              <ImageUpload label="Photo du plat" value={form.image_url} onChange={(url) => setForm({ ...form, image_url: url })} />
            </div>
            <DialogFooter>
              <Button onClick={handleSave} disabled={!restaurant}>
                Sauvegarder
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}
