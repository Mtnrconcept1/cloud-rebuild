import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { Plus, Pencil, Trash2 } from "lucide-react";
import ImageUpload from "@/components/ImageUpload";
import { useDashboardRestaurant } from "./DashboardContext";

const emptyItem = { name: "", description: "", price: 0, category: "", image_url: "", is_available: true };

export default function DashboardMenu() {
  const { selectedId } = useDashboardRestaurant();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyItem);

  const restaurant = selectedId ? { id: selectedId } : null;

  const { data: items } = useQuery({
    queryKey: ["my-menu-items", restaurant?.id],
    queryFn: async () => {
      const { data } = await supabase.from("menu_items").select("*").eq("restaurant_id", restaurant!.id).order("category").order("name");
      return data || [];
    },
    enabled: !!restaurant,
  });

  const openNew = () => { setEditingId(null); setForm(emptyItem); setDialogOpen(true); };
  const openEdit = (item: any) => {
    setEditingId(item.id);
    setForm({ name: item.name, description: item.description || "", price: Number(item.price), category: item.category || "", image_url: item.image_url || "", is_available: item.is_available });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!restaurant) return;
    if (editingId) {
      const { error } = await supabase.from("menu_items").update(form).eq("id", editingId);
      if (error) return toast({ title: "Erreur", description: error.message, variant: "destructive" });
    } else {
      const { error } = await supabase.from("menu_items").insert({ ...form, restaurant_id: restaurant.id });
      if (error) return toast({ title: "Erreur", description: error.message, variant: "destructive" });
    }
    toast({ title: editingId ? "Plat mis à jour" : "Plat ajouté" });
    setDialogOpen(false);
    queryClient.invalidateQueries({ queryKey: ["my-menu-items"] });
  };

  const handleDelete = async (id: string) => {
    await supabase.from("menu_items").delete().eq("id", id);
    queryClient.invalidateQueries({ queryKey: ["my-menu-items"] });
    toast({ title: "Plat supprimé" });
  };

  const toggleAvailability = async (id: string, current: boolean) => {
    await supabase.from("menu_items").update({ is_available: !current }).eq("id", id);
    queryClient.invalidateQueries({ queryKey: ["my-menu-items"] });
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="font-display text-3xl font-bold">Menu</h1>
          <Button onClick={openNew}><Plus className="h-4 w-4 mr-2" />Ajouter un plat</Button>
        </div>
        <div className="space-y-3">
          {items?.map((item) => (
            <div key={item.id} className="flex items-center gap-4 p-4 border rounded-xl bg-card">
              {item.image_url && <img src={item.image_url} alt={item.name} className="w-16 h-16 rounded-lg object-cover" />}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <h4 className="font-semibold text-sm">{item.name}</h4>
                  {item.category && <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded">{item.category}</span>}
                </div>
                <p className="text-sm text-primary font-bold">{Number(item.price).toFixed(2)} CHF</p>
              </div>
              <Switch checked={item.is_available ?? true} onCheckedChange={() => toggleAvailability(item.id, item.is_available ?? true)} />
              <Button size="icon" variant="ghost" onClick={() => openEdit(item)}><Pencil className="h-4 w-4" /></Button>
              <Button size="icon" variant="ghost" className="text-destructive" onClick={() => handleDelete(item.id)}><Trash2 className="h-4 w-4" /></Button>
            </div>
          ))}
          {(!items || items.length === 0) && <p className="text-muted-foreground text-center py-8">Aucun plat dans le menu</p>}
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent>
            <DialogHeader><DialogTitle>{editingId ? "Modifier le plat" : "Nouveau plat"}</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2"><Label>Nom</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required /></div>
                <div className="space-y-2"><Label>Prix (CHF)</Label><Input type="number" step="0.01" value={form.price} onChange={(e) => setForm({ ...form, price: Number(e.target.value) })} required /></div>
              </div>
              <div className="space-y-2"><Label>Catégorie</Label><Input value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} placeholder="Entrées, Plats, Desserts..." /></div>
              <div className="space-y-2"><Label>Description</Label><Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
              <ImageUpload label="Photo du plat" value={form.image_url} onChange={(url) => setForm({ ...form, image_url: url })} />
            </div>
            <DialogFooter><Button onClick={handleSave}>Sauvegarder</Button></DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}
