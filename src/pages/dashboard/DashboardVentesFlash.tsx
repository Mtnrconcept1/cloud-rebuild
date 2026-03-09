import { useState, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import DashboardLayout from "@/components/DashboardLayout";
import { useOwnerRestaurants } from "./useOwnerRestaurants";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Plus, Zap, Trash2, Percent } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

export default function DashboardVentesFlash() {
  const { restaurantIds } = useOwnerRestaurants();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);

  const { data: sales, isLoading } = useQuery({
    queryKey: ["dashboard-flash-sales", restaurantIds],
    queryFn: async () => {
      if (!restaurantIds.length) return [];
      const { data } = await supabase.from("flash_sales").select("*").in("restaurant_id", restaurantIds).order("created_at", { ascending: false });
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
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild><Button className="gap-2"><Plus className="h-4 w-4" /> Nouvelle vente</Button></DialogTrigger>
            <DialogContent className="max-w-md">
              <DialogHeader><DialogTitle>Nouvelle vente flash</DialogTitle></DialogHeader>
              <FlashForm restaurantIds={restaurantIds} onSaved={() => { setOpen(false); queryClient.invalidateQueries({ queryKey: ["dashboard-flash-sales"] }); toast({ title: "Vente créée !" }); }} />
            </DialogContent>
          </Dialog>
        </div>

        {isLoading ? (
          <div className="space-y-3">{[1, 2, 3].map(i => <div key={i} className="h-20 bg-muted animate-pulse rounded-xl" />)}</div>
        ) : !sales?.length ? (
          <Card><CardContent className="py-12 text-center text-muted-foreground">Aucune vente flash. Créez-en une pour booster vos ventes !</CardContent></Card>
        ) : (
          <div className="space-y-3">
            {sales.map((sale: any) => {
              const discount = sale.original_price > 0 ? Math.round((1 - sale.discounted_price / sale.original_price) * 100) : 0;
              return (
                <Card key={sale.id}>
                  <CardContent className="flex items-center gap-4 py-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <p className="font-semibold text-sm truncate">{sale.title}</p>
                        <Badge className="text-[10px] bg-amber-500/10 text-amber-700 border-amber-500/20">-{discount}%</Badge>
                        {!sale.is_active && <Badge variant="secondary" className="text-[10px]">Inactive</Badge>}
                      </div>
                      <p className="text-xs text-muted-foreground">{sale.quantity_available} restant(s)</p>
                      <p className="text-xs font-semibold text-primary">
                        <span className="line-through text-muted-foreground mr-1">{Number(sale.original_price).toFixed(2)} CHF</span>
                        {Number(sale.discounted_price).toFixed(2)} CHF
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Switch checked={sale.is_active} onCheckedChange={() => toggleActive(sale.id, sale.is_active)} />
                      <Button size="icon" variant="ghost" className="text-destructive" onClick={() => deleteSale(sale.id)}><Trash2 className="h-4 w-4" /></Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}

function FlashForm({ restaurantIds, onSaved }: { restaurantIds: string[]; onSaved: () => void }) {
  const [selectedItemId, setSelectedItemId] = useState("");
  const [discountPercent, setDiscountPercent] = useState(30);
  const [quantity, setQuantity] = useState(5);
  const [loading, setLoading] = useState(false);

  const { data: menuItems } = useQuery({
    queryKey: ["menu-items-for-flash", restaurantIds],
    queryFn: async () => {
      if (!restaurantIds.length) return [];
      const { data } = await supabase.from("menu_items").select("id, name, price, category, restaurant_id").in("restaurant_id", restaurantIds).eq("is_available", true).order("category").order("name");
      return data || [];
    },
    enabled: restaurantIds.length > 0,
  });

  const selectedItem = useMemo(() => menuItems?.find((m: any) => m.id === selectedItemId), [menuItems, selectedItemId]);
  const originalPrice = selectedItem ? Number(selectedItem.price) : 0;
  const discountedPrice = originalPrice > 0 ? Math.round(originalPrice * (1 - discountPercent / 100) * 100) / 100 : 0;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedItem) return;
    setLoading(true);

    const now = new Date();
    await supabase.from("flash_sales").insert({
      restaurant_id: selectedItem.restaurant_id,
      title: selectedItem.name,
      description: `Vente flash -${discountPercent}%`,
      original_price: originalPrice,
      discounted_price: discountedPrice,
      quantity_available: quantity,
      sale_date: now.toISOString().split("T")[0],
      sale_start: "00:00",
      sale_end: "23:59",
      is_active: true,
    });

    setLoading(false);
    onSaved();
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div className="space-y-2">
        <Label>Sélectionner un produit</Label>
        <Select value={selectedItemId} onValueChange={setSelectedItemId}>
          <SelectTrigger><SelectValue placeholder="Choisir un plat..." /></SelectTrigger>
          <SelectContent>
            {menuItems?.map((item: any) => (
              <SelectItem key={item.id} value={item.id}>
                {item.name} — {Number(item.price).toFixed(2)} CHF
                {item.category ? ` (${item.category})` : ""}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {selectedItem && (
        <>
          <div className="space-y-2">
            <Label className="flex items-center gap-1.5"><Percent className="h-3.5 w-3.5" /> Réduction (%)</Label>
            <Input type="number" min={5} max={90} step={5} value={discountPercent} onChange={e => setDiscountPercent(Number(e.target.value))} />
            <div className="flex items-center gap-2 text-sm">
              <span className="line-through text-muted-foreground">{originalPrice.toFixed(2)} CHF</span>
              <span className="font-bold text-primary">{discountedPrice.toFixed(2)} CHF</span>
              <Badge className="bg-amber-500/10 text-amber-700 border-amber-500/20 text-[10px]">-{discountPercent}%</Badge>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Quantité disponible</Label>
            <Input type="number" min={1} value={quantity} onChange={e => setQuantity(Number(e.target.value))} />
          </div>

          <Button type="submit" disabled={loading} className="w-full gap-2">
            <Zap className="h-4 w-4" />
            {loading ? "Création..." : "Activer la vente flash"}
          </Button>
        </>
      )}
    </form>
  );
}
