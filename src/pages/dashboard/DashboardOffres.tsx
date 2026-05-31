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
import { Leaf, Percent, Plus, Trash2 } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useDashboardRestaurant } from "./useDashboardRestaurant";
import {
  isSpecialOfferEffectivelyActive,
  isSpecialOfferSoldOut,
} from "@/lib/specialOffers";

const supabase = getSupabase();

type OfferRecord = {
  id: string;
  restaurant_id: string;
  title: string;
  offer_type: string | null;
  original_price: number | string;
  discounted_price: number | string;
  quantity_available: number;
  is_active: boolean | null;
  available_date: string | null;
  pickup_start: string | null;
  pickup_end: string | null;
};

function todayIso() {
  return new Date().toISOString().split("T")[0];
}

type MenuOption = {
  id: string;
  restaurant_id: string;
  name: string;
  price: number | string;
  category: string | null;
};

const OFFER_TYPES = [
  { value: "regular", label: "Standard" },
  { value: "surprise_bag", label: "Panier surprise" },
  { value: "solidarity", label: "Solidaire" },
];

export default function DashboardOffres() {
  const { selectedId } = useDashboardRestaurant();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);

  const { data: offers, isLoading } = useQuery<OfferRecord[]>({
    queryKey: ["dashboard-offers", selectedId],
    queryFn: async () => {
      if (!selectedId) return [];

      const { data, error } = await supabase
        .from("anti_waste_offers")
        .select("*")
        .eq("restaurant_id", selectedId)
        .order("created_at", { ascending: false });

      if (error) throw error;
      return data || [];
    },
    enabled: !!selectedId,
  });

  const toggleActive = async (id: string, current: boolean, isSoldOut: boolean) => {
    if (!selectedId) return;
    if (isSoldOut) {
      toast({
        title: "Offre epuisee",
        description: "Ajoutez a nouveau du stock avant de reactiver cette offre.",
        variant: "destructive",
      });
      return;
    }

    const { error } = await supabase
      .from("anti_waste_offers")
      .update({ is_active: !current })
      .eq("id", id)
      .eq("restaurant_id", selectedId);

    if (error) {
      toast({ title: "Erreur", description: error.message, variant: "destructive" });
      return;
    }

    queryClient.invalidateQueries({ queryKey: ["dashboard-offers", selectedId] });
    toast({ title: current ? "Offre desactivee" : "Offre activee" });
  };

  const deleteOffer = async (id: string) => {
    if (!selectedId) return;

    const { error } = await supabase
      .from("anti_waste_offers")
      .delete()
      .eq("id", id)
      .eq("restaurant_id", selectedId);

    if (error) {
      toast({ title: "Erreur", description: error.message, variant: "destructive" });
      return;
    }

    queryClient.invalidateQueries({ queryKey: ["dashboard-offers", selectedId] });
    toast({ title: "Offre supprimee" });
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <DashboardPageHero
          badge="Offres restaurant"
          title="Offres Anti-gaspi"
          description="Publiez les stocks courts, surveillez les offres epuisees et gardez la disponibilite client sous controle."
          icon={Leaf}
          tone="emerald"
          visualLabel="Anti-gaspi"
          stats={[
            { label: "Offres", value: offers?.length || 0, icon: Leaf },
            { label: "Actives", value: offers?.filter((offer) => isSpecialOfferEffectivelyActive(offer)).length || 0, icon: Percent },
            { label: "Restaurant", value: selectedId ? "Selectionne" : "Aucun", icon: Leaf },
          ]}
          actions={(
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button className="gap-2" disabled={!selectedId}>
                <Plus className="h-4 w-4" />
                Nouvelle offre
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>Nouvelle offre anti-gaspi</DialogTitle>
              </DialogHeader>
              <OfferForm
                restaurantId={selectedId}
                onSaved={() => {
                  setOpen(false);
                  queryClient.invalidateQueries({ queryKey: ["dashboard-offers", selectedId] });
                  toast({ title: "Offre creee" });
                }}
              />
            </DialogContent>
          </Dialog>
          )}
        />

        {!selectedId ? (
          <Card>
            <CardContent className="py-12 text-center text-muted-foreground">
              Selectionnez un restaurant pour gerer ses offres anti-gaspi.
            </CardContent>
          </Card>
        ) : isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-20 animate-pulse rounded-xl bg-muted" />
            ))}
          </div>
        ) : !offers?.length ? (
          <Card>
            <CardContent className="py-12 text-center text-muted-foreground">
              Aucune offre anti-gaspi. Creez-en une pour reduire le gaspillage.
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {offers.map((offer) => {
              const isSoldOut = isSpecialOfferSoldOut(offer);
              const isEffectivelyActive = isSpecialOfferEffectivelyActive(offer);
              const discount = offer.original_price > 0
                ? Math.round((1 - offer.discounted_price / offer.original_price) * 100)
                : 0;

              return (
                <Card key={offer.id}>
                  <CardContent className="flex items-center gap-4 py-4">
                    <div className="min-w-0 flex-1">
                      <div className="mb-1 flex items-center gap-2">
                        <p className="truncate text-sm font-semibold">{offer.title}</p>
                        <Badge variant="outline" className="text-[10px]">
                          {OFFER_TYPES.find((type) => type.value === offer.offer_type)?.label}
                        </Badge>
                        <Badge className="border-green-500/20 bg-green-500/10 text-[10px] text-green-700">
                          -{discount}%
                        </Badge>
                        {isSoldOut && (
                          <Badge variant="destructive" className="text-[10px]">
                            Epuisee
                          </Badge>
                        )}
                        {!isSoldOut && !offer.is_active && (
                          <Badge variant="secondary" className="text-[10px]">
                            Inactive
                          </Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {offer.quantity_available} restant(s)
                        {offer.available_date ? ` · ${offer.available_date}` : ""}
                        {offer.pickup_start && offer.pickup_end ? ` · ${offer.pickup_start.slice(0, 5)}-${offer.pickup_end.slice(0, 5)}` : ""}
                      </p>
                      <p className="text-xs font-semibold text-primary">
                        <span className="mr-1 text-muted-foreground line-through">
                          {Number(offer.original_price).toFixed(2)} CHF
                        </span>
                        {Number(offer.discounted_price).toFixed(2)} CHF
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Switch
                        checked={isEffectivelyActive}
                        disabled={isSoldOut}
                        onCheckedChange={() => toggleActive(offer.id, isEffectivelyActive, isSoldOut)}
                      />
                      <Button
                        size="icon"
                        variant="ghost"
                        className="text-destructive"
                        onClick={() => deleteOffer(offer.id)}
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

function OfferForm({ restaurantId, onSaved }: { restaurantId: string | null; onSaved: () => void }) {
  const [selectedItemId, setSelectedItemId] = useState("");
  const [offerType, setOfferType] = useState("regular");
  const [discountPercent, setDiscountPercent] = useState(40);
  const [quantity, setQuantity] = useState(3);
  const [availableDate, setAvailableDate] = useState(todayIso());
  const [pickupStart, setPickupStart] = useState("17:00");
  const [pickupEnd, setPickupEnd] = useState("20:00");
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  const { data: menuItems } = useQuery<MenuOption[]>({
    queryKey: ["menu-items-for-offers", restaurantId],
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
        description: "Choisissez un produit du restaurant selectionne.",
        variant: "destructive",
      });
      return;
    }

    if (!availableDate || !pickupStart || !pickupEnd) {
      toast({ title: "Creneau invalide", description: "Renseignez date et horaires de retrait.", variant: "destructive" });
      return;
    }
    if (pickupStart >= pickupEnd) {
      toast({ title: "Creneau invalide", description: "L'heure de fin doit etre apres le debut.", variant: "destructive" });
      return;
    }

    setLoading(true);

    const { error } = await supabase.from("anti_waste_offers").insert({
      restaurant_id: restaurantId,
      title: selectedItem.name,
      description: `Anti-gaspi -${discountPercent}%`,
      offer_type: offerType,
      original_price: originalPrice,
      discounted_price: discountedPrice,
      quantity_available: quantity,
      available_date: availableDate,
      pickup_start: pickupStart,
      pickup_end: pickupEnd,
      is_active: true,
    });

    setLoading(false);

    if (error) {
      toast({ title: "Erreur", description: error.message, variant: "destructive" });
      return;
    }

    onSaved();
  };

  if (!restaurantId) {
    return <p className="text-sm text-muted-foreground">Selectionnez un restaurant pour choisir ses produits.</p>;
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

      <div className="space-y-2">
        <Label>Type d'offre</Label>
        <Select value={offerType} onValueChange={setOfferType}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {OFFER_TYPES.map((type) => (
              <SelectItem key={type.value} value={type.value}>
                {type.label}
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
              Reduction (%)
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
              <Badge className="border-green-500/20 bg-green-500/10 text-[10px] text-green-700">
                -{discountPercent}%
              </Badge>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Quantite disponible</Label>
            <Input type="number" min={1} value={quantity} onChange={(e) => setQuantity(Number(e.target.value))} />
          </div>

          <div className="space-y-2">
            <Label>Date de disponibilite</Label>
            <Input type="date" value={availableDate} min={todayIso()} onChange={(e) => setAvailableDate(e.target.value)} />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-2">
              <Label>Retrait des</Label>
              <Input type="time" value={pickupStart} onChange={(e) => setPickupStart(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Jusqu'a</Label>
              <Input type="time" value={pickupEnd} onChange={(e) => setPickupEnd(e.target.value)} />
            </div>
          </div>
          <p className="text-[11px] text-muted-foreground">
            L'offre apparaitra aux clients pendant ce creneau et disparaitra a la fin.
          </p>

          <Button type="submit" disabled={loading} className="w-full gap-2">
            <Leaf className="h-4 w-4" />
            {loading ? "Creation..." : "Activer l'offre anti-gaspi"}
          </Button>
        </>
      )}
    </form>
  );
}
