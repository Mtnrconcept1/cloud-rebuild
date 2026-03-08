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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Plus, Leaf, Trash2, Edit2 } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

const OFFER_TYPES = [
  { value: "regular", label: "Standard" },
  { value: "surprise_bag", label: "Panier surprise" },
  { value: "solidarity", label: "Solidaire" },
];

export default function DashboardOffres() {
  const { restaurantIds } = useOwnerRestaurants();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);

  const { data: offers, isLoading } = useQuery({
    queryKey: ["dashboard-offers", restaurantIds],
    queryFn: async () => {
      if (!restaurantIds.length) return [];
      const { data } = await supabase
        .from("anti_waste_offers")
        .select("*")
        .in("restaurant_id", restaurantIds)
        .order("available_date", { ascending: false });
      return data || [];
    },
    enabled: restaurantIds.length > 0,
  });

  const toggleActive = async (id: string, current: boolean) => {
    await supabase.from("anti_waste_offers").update({ is_active: !current }).eq("id", id);
    queryClient.invalidateQueries({ queryKey: ["dashboard-offers"] });
    toast({ title: current ? "Offre désactivée" : "Offre activée" });
  };

  const deleteOffer = async (id: string) => {
    await supabase.from("anti_waste_offers").delete().eq("id", id);
    queryClient.invalidateQueries({ queryKey: ["dashboard-offers"] });
    toast({ title: "Offre supprimée" });
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Leaf className="h-6 w-6 text-green-600" />
            <h1 className="font-display text-3xl font-bold">Offres Anti-gaspi</h1>
          </div>
          <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) setEditing(null); }}>
            <DialogTrigger asChild>
              <Button className="gap-2"><Plus className="h-4 w-4" /> Nouvelle offre</Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg">
              <DialogHeader><DialogTitle>{editing ? "Modifier l'offre" : "Nouvelle offre anti-gaspi"}</DialogTitle></DialogHeader>
              <OfferForm
                restaurantIds={restaurantIds}
                initial={editing}
                onSaved={() => {
                  setOpen(false);
                  setEditing(null);
                  queryClient.invalidateQueries({ queryKey: ["dashboard-offers"] });
                  toast({ title: editing ? "Offre modifiée" : "Offre créée" });
                }}
              />
            </DialogContent>
          </Dialog>
        </div>

        {isLoading ? (
          <div className="space-y-3">{[1,2,3].map(i => <div key={i} className="h-20 bg-muted animate-pulse rounded-xl" />)}</div>
        ) : !offers?.length ? (
          <Card><CardContent className="py-12 text-center text-muted-foreground">Aucune offre anti-gaspi. Créez-en une pour réduire le gaspillage !</CardContent></Card>
        ) : (
          <div className="space-y-3">
            {offers.map((offer: any) => (
              <Card key={offer.id}>
                <CardContent className="flex items-center gap-4 py-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <p className="font-semibold text-sm truncate">{offer.title}</p>
                      <Badge variant="outline" className="text-[10px]">{OFFER_TYPES.find(t => t.value === offer.offer_type)?.label}</Badge>
                      {!offer.is_active && <Badge variant="secondary" className="text-[10px]">Inactive</Badge>}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {offer.available_date} · {offer.pickup_start}–{offer.pickup_end} · {offer.quantity_available} dispo
                    </p>
                    <p className="text-xs font-semibold text-primary">
                      <span className="line-through text-muted-foreground mr-1">{Number(offer.original_price).toFixed(2)} CHF</span>
                      {Number(offer.discounted_price).toFixed(2)} CHF
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Switch checked={offer.is_active} onCheckedChange={() => toggleActive(offer.id, offer.is_active)} />
                    <Button size="icon" variant="ghost" onClick={() => { setEditing(offer); setOpen(true); }}><Edit2 className="h-4 w-4" /></Button>
                    <Button size="icon" variant="ghost" className="text-destructive" onClick={() => deleteOffer(offer.id)}><Trash2 className="h-4 w-4" /></Button>
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

function OfferForm({ restaurantIds, initial, onSaved }: { restaurantIds: string[]; initial?: any; onSaved: () => void }) {
  const [title, setTitle] = useState(initial?.title || "");
  const [description, setDescription] = useState(initial?.description || "");
  const [offerType, setOfferType] = useState(initial?.offer_type || "regular");
  const [originalPrice, setOriginalPrice] = useState(initial?.original_price?.toString() || "");
  const [discountedPrice, setDiscountedPrice] = useState(initial?.discounted_price?.toString() || "");
  const [quantity, setQuantity] = useState(initial?.quantity_available?.toString() || "1");
  const [availableDate, setAvailableDate] = useState(initial?.available_date || new Date().toISOString().split("T")[0]);
  const [pickupStart, setPickupStart] = useState(initial?.pickup_start || "17:00");
  const [pickupEnd, setPickupEnd] = useState(initial?.pickup_end || "20:00");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const payload = {
      restaurant_id: initial?.restaurant_id || restaurantIds[0],
      title, description, offer_type: offerType,
      original_price: Number(originalPrice), discounted_price: Number(discountedPrice),
      quantity_available: Number(quantity), available_date: availableDate,
      pickup_start: pickupStart, pickup_end: pickupEnd,
    };
    if (initial) {
      await supabase.from("anti_waste_offers").update(payload).eq("id", initial.id);
    } else {
      await supabase.from("anti_waste_offers").insert(payload);
    }
    setLoading(false);
    onSaved();
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2"><Label>Titre</Label><Input value={title} onChange={e => setTitle(e.target.value)} required /></div>
      <div className="space-y-2"><Label>Description</Label><Textarea value={description} onChange={e => setDescription(e.target.value)} /></div>
      <div className="space-y-2">
        <Label>Type</Label>
        <Select value={offerType} onValueChange={setOfferType}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>{OFFER_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent>
        </Select>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2"><Label>Prix original (CHF)</Label><Input type="number" step="0.01" value={originalPrice} onChange={e => setOriginalPrice(e.target.value)} required /></div>
        <div className="space-y-2"><Label>Prix réduit (CHF)</Label><Input type="number" step="0.01" value={discountedPrice} onChange={e => setDiscountedPrice(e.target.value)} required /></div>
      </div>
      <div className="grid grid-cols-3 gap-4">
        <div className="space-y-2"><Label>Date</Label><Input type="date" value={availableDate} onChange={e => setAvailableDate(e.target.value)} required /></div>
        <div className="space-y-2"><Label>Début retrait</Label><Input type="time" value={pickupStart} onChange={e => setPickupStart(e.target.value)} required /></div>
        <div className="space-y-2"><Label>Fin retrait</Label><Input type="time" value={pickupEnd} onChange={e => setPickupEnd(e.target.value)} required /></div>
      </div>
      <div className="space-y-2"><Label>Quantité disponible</Label><Input type="number" min="1" value={quantity} onChange={e => setQuantity(e.target.value)} required /></div>
      <Button type="submit" disabled={loading} className="w-full">{loading ? "Enregistrement..." : initial ? "Modifier" : "Créer l'offre"}</Button>
    </form>
  );
}