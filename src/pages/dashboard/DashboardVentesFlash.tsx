import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getSupabase } from "@/integrations/supabase/client";
import DashboardLayout from "@/components/DashboardLayout";
import DashboardPageHero from "@/components/dashboard/DashboardPageHero";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Plus, Percent, Trash2, Zap } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useDashboardRestaurant } from "./useDashboardRestaurant";
import {
  isSpecialOfferEffectivelyActive,
  isSpecialOfferSoldOut,
} from "@/lib/specialOffers";

const supabase = getSupabase();

type FlashSaleRecord = {
  id: string;
  restaurant_id: string;
  title: string;
  original_price: number | string;
  discounted_price: number | string;
  quantity_available: number;
  is_active: boolean | null;
  sale_date: string | null;
  sale_start: string | null;
  sale_end: string | null;
};

type MenuOption = {
  id: string;
  restaurant_id: string;
  name: string;
  price: number | string;
  category: string | null;
};

export default function DashboardVentesFlash() {
  const { selectedId } = useDashboardRestaurant();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);

  const { data: sales, isLoading } = useQuery<FlashSaleRecord[]>({
    queryKey: ["dashboard-flash-sales", selectedId],
    queryFn: async () => {
      if (!selectedId) return [];

      const { data, error } = await supabase
        .from("flash_sales" as any)
        .select("*")
        .eq("restaurant_id", selectedId)
        .is("archived_at", null)
        .order("created_at", { ascending: false });

      if (error) throw error;
      return (data || []) as unknown as FlashSaleRecord[];
    },
    enabled: !!selectedId,
  });

  const toggleActive = async (id: string, current: boolean, isSoldOut: boolean) => {
    if (!selectedId) return;
    if (isSoldOut) {
      toast({
        title: "Vente epuisee",
        description: "Ajoutez à nouveau du stock avant de réactiver cette vente.",
        variant: "destructive",
      });
      return;
    }

    const { error } = await (supabase.rpc as any)("restaurant_update_flash_sale_status", {
      p_sale_id: id,
      p_is_active: !current,
      p_reason: "Changement statut vente flash",
    });

    if (error) {
      toast({ title: "Erreur", description: error.message, variant: "destructive" });
      return;
    }

    queryClient.invalidateQueries({ queryKey: ["dashboard-flash-sales", selectedId] });
    toast({ title: current ? "Vente désactivée" : "Vente activée" });
  };

  const deleteSale = async (id: string) => {
    if (!selectedId) return;
    const reason = window.prompt("Raison obligatoire pour archiver cette vente flash.");
    if (!reason?.trim()) return;

    const { error } = await (supabase.rpc as any)("restaurant_archive_flash_sale", {
      p_sale_id: id,
      p_reason: reason.trim(),
    });

    if (error) {
      toast({ title: "Erreur", description: error.message, variant: "destructive" });
      return;
    }

    queryClient.invalidateQueries({ queryKey: ["dashboard-flash-sales", selectedId] });
    toast({ title: "Vente supprimée" });
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <DashboardPageHero
          badge="Ventes courtes"
          title="Ventes Flash"
          description="Declenchez des offres limitées dans le temps, suivez le stock restant et gardez la mise en ligne sous contrôle."
          icon={Zap}
          tone="amber"
          visualLabel="Flash"
          stats={[
            { label: "Ventes", value: sales?.length || 0, icon: Zap },
            { label: "Actives", value: sales?.filter((sale) => isSpecialOfferEffectivelyActive(sale)).length || 0, icon: Percent },
            { label: "Restaurant", value: selectedId ? "Selectionne" : "Aucun", icon: Zap },
          ]}
          actions={(
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button className="gap-2" disabled={!selectedId}>
                <Plus className="h-4 w-4" />
                Nouvelle vente
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>Nouvelle vente flash</DialogTitle>
              </DialogHeader>
              <FlashForm
                restaurantId={selectedId}
                onSaved={() => {
                  setOpen(false);
                  queryClient.invalidateQueries({ queryKey: ["dashboard-flash-sales", selectedId] });
                  toast({ title: "Vente créée" });
                }}
              />
            </DialogContent>
          </Dialog>
          )}
        />

        {!selectedId ? (
          <Card>
            <CardContent className="py-12 text-center text-muted-foreground">
              Sélectionnez un restaurant pour gérer ses ventes flash.
            </CardContent>
          </Card>
        ) : isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-20 animate-pulse rounded-xl bg-muted" />
            ))}
          </div>
        ) : !sales?.length ? (
          <Card>
            <CardContent className="py-12 text-center text-muted-foreground">
              Aucune vente flash. Créez-en une pour booster vos ventes.
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {sales.map((sale) => {
              const isSoldOut = isSpecialOfferSoldOut(sale);
              const isEffectivelyActive = isSpecialOfferEffectivelyActive(sale);
              const originalPrice = Number(sale.original_price);
              const discountedPrice = Number(sale.discounted_price);
              const discount = originalPrice > 0
                ? Math.round((1 - discountedPrice / originalPrice) * 100)
                : 0;

              return (
                <Card key={sale.id}>
                  <CardContent className="flex items-center gap-4 py-4">
                    <div className="min-w-0 flex-1">
                      <div className="mb-1 flex items-center gap-2">
                        <p className="truncate text-sm font-semibold">{sale.title}</p>
                        <Badge className="border-amber-500/20 bg-amber-500/10 text-[10px] text-amber-700">
                          -{discount}%
                        </Badge>
                        {isSoldOut && (
                          <Badge variant="destructive" className="text-[10px]">
                            Epuisee
                          </Badge>
                        )}
                        {!isSoldOut && !sale.is_active && (
                          <Badge variant="secondary" className="text-[10px]">
                            Inactive
                          </Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {sale.quantity_available} restant(s)
                        {sale.sale_date ? ` · ${sale.sale_date}` : ""}
                        {sale.sale_start && sale.sale_end ? ` · ${sale.sale_start.slice(0, 5)}-${sale.sale_end.slice(0, 5)}` : ""}
                      </p>
                      <p className="text-xs font-semibold text-primary">
                        <span className="mr-1 text-muted-foreground line-through">
                          {Number(sale.original_price).toFixed(2)} CHF
                        </span>
                        {Number(sale.discounted_price).toFixed(2)} CHF
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Switch
                        checked={isEffectivelyActive}
                        disabled={isSoldOut}
                        onCheckedChange={() => toggleActive(sale.id, isEffectivelyActive, isSoldOut)}
                      />
                      <Button
                        size="icon"
                        variant="ghost"
                        className="text-destructive"
                        onClick={() => deleteSale(sale.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
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

function todayIso() {
  return new Date().toISOString().split("T")[0];
}

function nowHHmm(offsetMinutes = 0) {
  const d = new Date(Date.now() + offsetMinutes * 60_000);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function FlashForm({ restaurantId, onSaved }: { restaurantId: string | null; onSaved: () => void }) {
  const [selectedItemId, setSelectedItemId] = useState("");
  const [discountPercent, setDiscountPercent] = useState(30);
  const [quantity, setQuantity] = useState(5);
  const [saleDate, setSaleDate] = useState(todayIso());
  const [saleStart, setSaleStart] = useState(nowHHmm());
  const [saleEnd, setSaleEnd] = useState(nowHHmm(120));
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  const { data: menuItems } = useQuery<MenuOption[]>({
    queryKey: ["menu-items-for-flash", restaurantId],
    queryFn: async () => {
      if (!restaurantId) return [];

      const { data, error } = await supabase
        .from("menu_items")
        .select("id, name, price, category, restaurant_id")
        .eq("restaurant_id", restaurantId)
        .eq("is_available", true)
        .order("category")
        .order("name");

      if (error) throw error;
      return data || [];
    },
    enabled: !!restaurantId,
  });

  const selectedItem = useMemo(
    () => menuItems?.find((item) => item.id === selectedItemId),
    [menuItems, selectedItemId],
  );
  const originalPrice = selectedItem ? Number(selectedItem.price) : 0;
  const discountedPrice = originalPrice > 0
    ? Math.round(originalPrice * (1 - discountPercent / 100) * 100) / 100
    : 0;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!restaurantId || !selectedItem || selectedItem.restaurant_id !== restaurantId) {
      toast({
        title: "Produit invalide",
        description: "Choisissez un produit du restaurant sélectionné.",
        variant: "destructive",
      });
      return;
    }

    if (!saleDate || !saleStart || !saleEnd) {
      toast({ title: "Créneau invalide", description: "Renseignez date, début et fin.", variant: "destructive" });
      return;
    }
    if (saleStart >= saleEnd) {
      toast({ title: "Créneau invalide", description: "L'heure de fin doit être après le début.", variant: "destructive" });
      return;
    }

    setLoading(true);

    const { error } = await (supabase.rpc as any)("restaurant_upsert_flash_sale", {
      p_sale_id: null,
      p_payload: {
        restaurant_id: restaurantId,
        title: selectedItem.name,
        description: `Vente flash -${discountPercent}%`,
        original_price: originalPrice,
        discounted_price: discountedPrice,
        quantity_available: quantity,
        sale_date: saleDate,
        sale_start: saleStart,
        sale_end: saleEnd,
        is_active: true,
        delivery_available: true,
        takeaway_available: true,
      },
      p_reason: "Creation vente flash restaurateur",
    });

    setLoading(false);

    if (error) {
      toast({ title: "Erreur", description: error.message, variant: "destructive" });
      return;
    }

    onSaved();
  };

  if (!restaurantId) {
    return <p className="text-sm text-muted-foreground">Sélectionnez un restaurant pour choisir ses produits.</p>;
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div className="space-y-2">
        <Label>Selectionner un produit</Label>
        <Select value={selectedItemId} onValueChange={setSelectedItemId}>
          <SelectTrigger>
            <SelectValue placeholder="Choisir un plat..." />
          </SelectTrigger>
          <SelectContent>
            {menuItems?.map((item) => (
              <SelectItem key={item.id} value={item.id}>
                {item.name} - {Number(item.price).toFixed(2)} CHF
                {item.category ? ` (${item.category})` : ""}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {selectedItem && (
        <>
          <div className="space-y-2">
            <Label className="flex items-center gap-1.5">
              <Percent className="h-3.5 w-3.5" />
              Réduction (%)
            </Label>
            <Input
              type="number"
              min={5}
              max={90}
              step={5}
              value={discountPercent}
              onChange={(e) => setDiscountPercent(Number(e.target.value))}
            />
            <div className="flex items-center gap-2 text-sm">
              <span className="text-muted-foreground line-through">{originalPrice.toFixed(2)} CHF</span>
              <span className="font-bold text-primary">{discountedPrice.toFixed(2)} CHF</span>
              <Badge className="border-amber-500/20 bg-amber-500/10 text-[10px] text-amber-700">
                -{discountPercent}%
              </Badge>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Quantite disponible</Label>
            <Input type="number" min={1} value={quantity} onChange={(e) => setQuantity(Number(e.target.value))} />
          </div>

          <div className="space-y-2">
            <Label>Date de la vente</Label>
            <Input type="date" value={saleDate} min={todayIso()} onChange={(e) => setSaleDate(e.target.value)} />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-2">
              <Label>Debut</Label>
              <Input type="time" value={saleStart} onChange={(e) => setSaleStart(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Fin</Label>
              <Input type="time" value={saleEnd} onChange={(e) => setSaleEnd(e.target.value)} />
            </div>
          </div>
          <p className="text-[11px] text-muted-foreground">
            L'offre apparaîtra automatiquement aux clients au début du créneau et disparaîtra à la fin.
          </p>

          <Button type="submit" disabled={loading} className="w-full gap-2">
            <Zap className="h-4 w-4" />
            {loading ? "Création..." : "Activer la vente flash"}
          </Button>
        </>
      )}
    </form>
  );
}
