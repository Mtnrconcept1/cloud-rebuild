import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import DashboardLayout from "@/components/DashboardLayout";
import { useOwnerRestaurants } from "./useOwnerRestaurants";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Plus, Zap, Trash2, Edit2 } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

export default function DashboardVentesFlash() {
  const { restaurantIds } = useOwnerRestaurants();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);

  const { data: sales, isLoading } = useQuery({
    queryKey: ["dashboard-flash-sales", restaurantIds],
    queryFn: async () => {
      if (!restaurantIds.length) return [];
      const { data } = await supabase.from("flash_sales").select("*").in("restaurant_id", restaurantIds).order("sale_date", { ascending: false });
      return data || [];
    },
    enabled: restaurantIds.length > 0,
  });

  const toggleActive = async (id: string, current: boolean) => {
    await supabase.from("flash_sales").update({ is_active: !current }).eq("id", id);
    queryClient.invalidateQueries({ queryKey: ["dashboard-flash-sales"] });
    toast({ title: current ? "Vente désactivée" : "Vente activée" });
  };

  const deleteSale = async (id: string) => {
    await supabase.from("flash_sales").delete().eq("id", id);
    queryClient.invalidateQueries({ queryKey: ["dashboard-flash-sales"] });
    toast({ title: "Vente supprimée" });
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Zap className="h-6 w-6 text-amber-500" />
            <h1 className="font-display text-3xl font-bold">Ventes Flash</h1>
          </div>
          <Dialog open={open} onOpenChange={v => { setOpen(v); if (!v) setEditing(null); }}>
            <DialogTrigger asChild><Button className="gap-2"><Plus className="h-4 w-4" /> Nouvelle vente</Button></DialogTrigger>
            <DialogContent className="max-w-lg">
              <DialogHeader><DialogTitle>{editing ? "Modifier la vente" : "Nouvelle vente flash"}</DialogTitle></DialogHeader>
              <FlashForm restaurantIds={restaurantIds} initial={editing} onSaved={() => { setOpen(false); setEditing(null); queryClient.invalidateQueries({ queryKey: ["dashboard-flash-sales"] }); toast({ title: editing ? "Modifiée" : "Vente créée" }); }} />
            </DialogContent>
          </Dialog>
        </div>

        {isLoading ? (
          <div className="space-y-3">{[1,2,3].map(i => <div key={i} className="h-20 bg-muted animate-pulse rounded-xl" />)}</div>
        ) : !sales?.length ? (
          <Card><CardContent className="py-12 text-center text-muted-foreground">Aucune vente flash. Créez-en une pour booster vos ventes !</CardContent></Card>
        ) : (
          <div className="space-y-3">
            {sales.map((sale: any) => (
              <Card key={sale.id}>
                <CardContent className="flex items-center gap-4 py-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <p className="font-semibold text-sm truncate">{sale.title}</p>
                      {!sale.is_active && <Badge variant="secondary" className="text-[10px]">Inactive</Badge>}
                    </div>
                    <p className="text-xs text-muted-foreground">{sale.sale_date} · {sale.sale_start}–{sale.sale_end} · {sale.quantity_available} dispo</p>
                    <p className="text-xs font-semibold text-primary">
                      <span className="line-through text-muted-foreground mr-1">{Number(sale.original_price).toFixed(2)} CHF</span>
                      {Number(sale.discounted_price).toFixed(2)} CHF
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Switch checked={sale.is_active} onCheckedChange={() => toggleActive(sale.id, sale.is_active)} />
                    <Button size="icon" variant="ghost" onClick={() => { setEditing(sale); setOpen(true); }}><Edit2 className="h-4 w-4" /></Button>
                    <Button size="icon" variant="ghost" className="text-destructive" onClick={() => deleteSale(sale.id)}><Trash2 className="h-4 w-4" /></Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}

function FlashForm({ restaurantIds, initial, onSaved }: { restaurantIds: string[]; initial?: any; onSaved: () => void }) {
  const [title, setTitle] = useState(initial?.title || "");
  const [description, setDescription] = useState(initial?.description || "");
  const [originalPrice, setOriginalPrice] = useState(initial?.original_price?.toString() || "");
  const [discountedPrice, setDiscountedPrice] = useState(initial?.discounted_price?.toString() || "");
  const [quantity, setQuantity] = useState(initial?.quantity_available?.toString() || "1");
  const [saleDate, setSaleDate] = useState(initial?.sale_date || new Date().toISOString().split("T")[0]);
  const [saleStart, setSaleStart] = useState(initial?.sale_start || "11:00");
  const [saleEnd, setSaleEnd] = useState(initial?.sale_end || "14:00");
  const [delivery, setDelivery] = useState(initial?.delivery_available ?? true);
  const [takeaway, setTakeaway] = useState(initial?.takeaway_available ?? true);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const payload = {
      restaurant_id: initial?.restaurant_id || restaurantIds[0],
      title, description, original_price: Number(originalPrice),
      discounted_price: Number(discountedPrice), quantity_available: Number(quantity),
      sale_date: saleDate, sale_start: saleStart, sale_end: saleEnd,
      delivery_available: delivery, takeaway_available: takeaway,
    };
    if (initial) {
      await supabase.from("flash_sales").update(payload).eq("id", initial.id);
    } else {
      await supabase.from("flash_sales").insert(payload);
    }
    setLoading(false);
    onSaved();
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2"><Label>Titre</Label><Input value={title} onChange={e => setTitle(e.target.value)} required /></div>
      <div className="space-y-2"><Label>Description</Label><Textarea value={description} onChange={e => setDescription(e.target.value)} /></div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2"><Label>Prix original (CHF)</Label><Input type="number" step="0.01" value={originalPrice} onChange={e => setOriginalPrice(e.target.value)} required /></div>
        <div className="space-y-2"><Label>Prix flash (CHF)</Label><Input type="number" step="0.01" value={discountedPrice} onChange={e => setDiscountedPrice(e.target.value)} required /></div>
      </div>
      <div className="grid grid-cols-3 gap-4">
        <div className="space-y-2"><Label>Date</Label><Input type="date" value={saleDate} onChange={e => setSaleDate(e.target.value)} required /></div>
        <div className="space-y-2"><Label>Début</Label><Input type="time" value={saleStart} onChange={e => setSaleStart(e.target.value)} required /></div>
        <div className="space-y-2"><Label>Fin</Label><Input type="time" value={saleEnd} onChange={e => setSaleEnd(e.target.value)} required /></div>
      </div>
      <div className="space-y-2"><Label>Quantité disponible</Label><Input type="number" min="1" value={quantity} onChange={e => setQuantity(e.target.value)} required /></div>
      <div className="flex gap-6">
        <div className="flex items-center gap-2"><Switch checked={delivery} onCheckedChange={setDelivery} /><Label>Livraison</Label></div>
        <div className="flex items-center gap-2"><Switch checked={takeaway} onCheckedChange={setTakeaway} /><Label>Emporter</Label></div>
      </div>
      <Button type="submit" disabled={loading} className="w-full">{loading ? "Enregistrement..." : initial ? "Modifier" : "Créer la vente"}</Button>
    </form>
  );
}