import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getSupabase } from "@/integrations/supabase/client";
import DashboardLayout from "@/components/DashboardLayout";
import DashboardPageHero from "@/components/dashboard/DashboardPageHero";
import { DASHBOARD_ILLUSTRATIONS } from "@/lib/dashboardIllustrations";
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
import { useCommercialDemoFrame } from "@/components/commercial/CommercialDemoFrameProvider";
import { useDashboardRestaurant } from "./useDashboardRestaurant";
import SortControls from "@/components/list/SortControls";
import OperationViewToggle, { type OperationViewMode } from "@/components/operations/OperationViewToggle";
import type { SortDirection } from "@/lib/listSorting";
import { cn } from "@/lib/utils";
import {
  getCommercialDemoAntiWasteOffers,
  getCommercialDemoClientMenuItems,
} from "@/lib/commercialDemoClientCatalog";
import {
  readCommercialDemoToolState,
  writeCommercialDemoToolState,
} from "@/lib/commercialDemoRestaurantTools";
import type { CommercialDemoSnapshot } from "@/lib/commercialDemoJourney";
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

const COMMERCIAL_DEMO_OFFERS_TOOL = "anti-waste-offers";

function buildCommercialDemoOfferSeed(snapshot: CommercialDemoSnapshot): OfferRecord[] {
  return getCommercialDemoAntiWasteOffers(snapshot).map((offer) => ({
    id: `commercial-demo-offer-${snapshot.session.id}-${offer.id}`,
    restaurant_id: snapshot.demo_restaurant.id,
    title: offer.title,
    offer_type: offer.offer_type,
    original_price: offer.original_price,
    discounted_price: offer.discounted_price,
    quantity_available: offer.quantity_available,
    is_active: offer.is_active,
    available_date: offer.available_date,
    pickup_start: offer.pickup_start,
    pickup_end: offer.pickup_end,
  }));
}

function commercialDemoRecordId(kind: string, sessionId: string) {
  const suffix = typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `commercial-demo-${kind}-${sessionId}-${suffix}`;
}

type NewOfferRecord = Omit<OfferRecord, "id">;

export default function DashboardOffres() {
  const commercialDemoFrame = useCommercialDemoFrame();
  const isCommercialDemo = commercialDemoFrame?.surface === "restaurant";
  const demoSessionId = isCommercialDemo ? commercialDemoFrame.config.sessionId : null;
  const { selectedId } = useDashboardRestaurant();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [offerSearch, setOfferSearch] = useState("");
  const [offerStatus, setOfferStatus] = useState("all");
  const [offerTypeFilter, setOfferTypeFilter] = useState("all");
  const [offerSortKey, setOfferSortKey] = useState<"date" | "name" | "price" | "stock">("date");
  const [offerSortDirection, setOfferSortDirection] = useState<SortDirection>("desc");
  const [offerViewMode, setOfferViewMode] = useState<OperationViewMode>("details");
  const offersQueryKey = ["dashboard-offers", selectedId, demoSessionId] as const;

  const { data: offers, isLoading } = useQuery<OfferRecord[]>({
    queryKey: offersQueryKey,
    queryFn: async () => {
      if (!selectedId) return [];

      if (isCommercialDemo && commercialDemoFrame) {
        if (selectedId !== commercialDemoFrame.snapshot.demo_restaurant.id) return [];
        return readCommercialDemoToolState(
          commercialDemoFrame.config.sessionId,
          COMMERCIAL_DEMO_OFFERS_TOOL,
          buildCommercialDemoOfferSeed(commercialDemoFrame.snapshot),
        );
      }

      const { data, error } = await supabase
        .from("anti_waste_offers" as any)
        .select("*")
        .eq("restaurant_id", selectedId)
        .is("archived_at", null)
        .order("created_at", { ascending: false });

      if (error) throw error;
      return (data || []) as unknown as OfferRecord[];
    },
    enabled: !!selectedId,
  });

  const visibleOffers = useMemo(() => {
    const query = offerSearch.trim().toLocaleLowerCase("fr-CH");
    const collator = new Intl.Collator("fr-CH", { sensitivity: "base", numeric: true });
    return (offers || []).filter((offer) => {
      if (offerStatus === "active" && !isSpecialOfferEffectivelyActive(offer)) return false;
      if (offerStatus === "sold_out" && !isSpecialOfferSoldOut(offer)) return false;
      if (offerStatus === "inactive" && (isSpecialOfferEffectivelyActive(offer) || isSpecialOfferSoldOut(offer))) return false;
      if (offerTypeFilter !== "all" && offer.offer_type !== offerTypeFilter) return false;
      return !query || offer.title.toLocaleLowerCase("fr-CH").includes(query);
    }).sort((left, right) => {
      const comparison = offerSortKey === "name" ? collator.compare(left.title, right.title)
        : offerSortKey === "price" ? Number(left.discounted_price) - Number(right.discounted_price)
        : offerSortKey === "stock" ? left.quantity_available - right.quantity_available
        : (left.available_date || "").localeCompare(right.available_date || "");
      return (offerSortDirection === "asc" ? comparison : -comparison) || left.id.localeCompare(right.id);
    });
  }, [offers, offerSearch, offerStatus, offerTypeFilter, offerSortKey, offerSortDirection]);

  const updateCommercialDemoOffers = (updater: (current: OfferRecord[]) => OfferRecord[]) => {
    if (!isCommercialDemo || !commercialDemoFrame || selectedId !== commercialDemoFrame.snapshot.demo_restaurant.id) {
      return false;
    }

    const sessionId = commercialDemoFrame.config.sessionId;
    const fallback = buildCommercialDemoOfferSeed(commercialDemoFrame.snapshot);
    const current = queryClient.getQueryData<OfferRecord[]>(offersQueryKey)
      ?? readCommercialDemoToolState(sessionId, COMMERCIAL_DEMO_OFFERS_TOOL, fallback);
    const next = updater(current);
    writeCommercialDemoToolState(sessionId, COMMERCIAL_DEMO_OFFERS_TOOL, next);
    queryClient.setQueryData(offersQueryKey, next);
    return true;
  };

  const toggleActive = async (id: string, current: boolean, isSoldOut: boolean) => {
    if (!selectedId) return;
    if (isSoldOut) {
      toast({
        title: "Offre epuisee",
        description: "Ajoutez à nouveau du stock avant de réactiver cette offre.",
        variant: "destructive",
      });
      return;
    }

    if (isCommercialDemo) {
      const updated = updateCommercialDemoOffers((items) => items.map((offer) => (
        offer.id === id ? { ...offer, is_active: !current } : offer
      )));
      toast(updated
        ? { title: current ? "Offre désactivée" : "Offre activée" }
        : { title: "Démo indisponible", description: "Rechargez la session de démonstration.", variant: "destructive" });
      return;
    }

    const { error } = await (supabase.rpc as any)("restaurant_update_anti_waste_offer_status", {
      p_offer_id: id,
      p_is_active: !current,
      p_reason: "Changement statut offre anti-gaspi",
    });

    if (error) {
      toast({ title: "Erreur", description: error.message, variant: "destructive" });
      return;
    }

    queryClient.invalidateQueries({ queryKey: ["dashboard-offers", selectedId] });
    toast({ title: current ? "Offre désactivée" : "Offre activée" });
  };

  const deleteOffer = async (id: string) => {
    if (!selectedId) return;
    const reason = window.prompt("Raison obligatoire pour archiver cette offre anti-gaspi.");
    if (!reason?.trim()) return;

    if (isCommercialDemo) {
      const updated = updateCommercialDemoOffers((items) => items.filter((offer) => offer.id !== id));
      toast(updated
        ? { title: "Offre supprimée" }
        : { title: "Démo indisponible", description: "Rechargez la session de démonstration.", variant: "destructive" });
      return;
    }

    const { error } = await (supabase.rpc as any)("restaurant_archive_anti_waste_offer", {
      p_offer_id: id,
      p_reason: reason.trim(),
    });

    if (error) {
      toast({ title: "Erreur", description: error.message, variant: "destructive" });
      return;
    }

    queryClient.invalidateQueries({ queryKey: ["dashboard-offers", selectedId] });
    toast({ title: "Offre supprimée" });
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <DashboardPageHero
          badge="Offres restaurant"
          title="Offres Anti-gaspi"
          description="Publiez les stocks courts, surveillez les offres épuisées et gardez la disponibilité client sous contrôle."
          icon={Leaf}
          tone="emerald"
          visualLabel="Anti-gaspi"
          illustration={DASHBOARD_ILLUSTRATIONS.offers}
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
                onCreateDemo={isCommercialDemo && commercialDemoFrame ? (record) => {
                  updateCommercialDemoOffers((items) => [{
                    ...record,
                    id: commercialDemoRecordId("offer", commercialDemoFrame.config.sessionId),
                  }, ...items]);
                } : undefined}
                onSaved={() => {
                  setOpen(false);
                  queryClient.invalidateQueries({ queryKey: offersQueryKey });
                  toast({ title: "Offre créée" });
                }}
              />
            </DialogContent>
          </Dialog>
          )}
        />

        {selectedId && offers?.length ? (
          <Card>
            <CardContent className="space-y-4 p-4">
              <div className="grid gap-3 md:grid-cols-3">
                <Input aria-label="Rechercher une offre anti-gaspi" value={offerSearch} onChange={(event) => setOfferSearch(event.target.value)} placeholder="Rechercher une offre…" />
                <Select value={offerStatus} onValueChange={setOfferStatus}>
                  <SelectTrigger aria-label="Filtrer les offres par statut"><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="all">Tous les statuts</SelectItem><SelectItem value="active">Actives</SelectItem><SelectItem value="inactive">Inactives</SelectItem><SelectItem value="sold_out">Épuisées</SelectItem></SelectContent>
                </Select>
                <Select value={offerTypeFilter} onValueChange={setOfferTypeFilter}>
                  <SelectTrigger aria-label="Filtrer les offres par type"><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="all">Tous les types</SelectItem>{OFFER_TYPES.map((type) => <SelectItem key={type.value} value={type.value}>{type.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
                <SortControls<"date" | "name" | "price" | "stock">
                  className="w-full max-w-lg"
                  columns={[{ key: "date", label: "Date" }, { key: "name", label: "Titre" }, { key: "price", label: "Prix remisé" }, { key: "stock", label: "Stock" }]}
                  sortKey={offerSortKey}
                  direction={offerSortDirection}
                  onSortKeyChange={setOfferSortKey}
                  onDirectionChange={setOfferSortDirection}
                />
                <OperationViewToggle value={offerViewMode} onChange={setOfferViewMode} ariaLabel="Mode d’affichage des offres anti-gaspi" />
              </div>
              <div className="flex items-center justify-between gap-3">
                <p className="text-xs text-muted-foreground">{visibleOffers.length} offre(s) sur {offers.length}</p>
                <Button type="button" size="sm" variant="ghost" onClick={() => { setOfferSearch(""); setOfferStatus("all"); setOfferTypeFilter("all"); }}>Effacer les filtres</Button>
              </div>
            </CardContent>
          </Card>
        ) : null}

        {!selectedId ? (
          <Card>
            <CardContent className="py-12 text-center text-muted-foreground">
              Sélectionnez un restaurant pour gérer ses offres anti-gaspi.
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
              Aucune offre anti-gaspi. Créez-en une pour réduire le gaspillage.
            </CardContent>
          </Card>
        ) : (
          <div className={cn("gap-3", offerViewMode === "gallery" ? "grid md:grid-cols-2 xl:grid-cols-3" : "space-y-3")}>
            {visibleOffers.map((offer) => {
              const isSoldOut = isSpecialOfferSoldOut(offer);
              const isEffectivelyActive = isSpecialOfferEffectivelyActive(offer);
              const originalPrice = Number(offer.original_price);
              const discountedPrice = Number(offer.discounted_price);
              const discount = originalPrice > 0
                ? Math.round((1 - discountedPrice / originalPrice) * 100)
                : 0;

              return (
                <Card key={offer.id}>
                  <CardContent className={cn("flex gap-4", offerViewMode === "gallery" ? "flex-col py-5" : offerViewMode === "list" ? "items-center py-2.5" : "items-center py-4")}>
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
                      <p className={cn("text-xs text-muted-foreground", offerViewMode === "list" && "hidden")}>
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
                    <div className="flex shrink-0 items-center gap-2">
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
            {!visibleOffers.length ? <p className="rounded-xl border p-6 text-center text-sm text-muted-foreground">Aucune offre ne correspond aux filtres.</p> : null}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}

function OfferForm({
  restaurantId,
  onSaved,
  onCreateDemo,
}: {
  restaurantId: string | null;
  onSaved: () => void;
  onCreateDemo?: (record: NewOfferRecord) => void;
}) {
  const commercialDemoFrame = useCommercialDemoFrame();
  const isCommercialDemo = commercialDemoFrame?.surface === "restaurant";
  const demoSessionId = isCommercialDemo ? commercialDemoFrame.config.sessionId : null;
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
    queryKey: ["menu-items-for-offers", restaurantId, demoSessionId],
    queryFn: async () => {
      if (!restaurantId) return [];

      if (isCommercialDemo && commercialDemoFrame) {
        const fallback = getCommercialDemoClientMenuItems(commercialDemoFrame.snapshot, restaurantId).map((item) => ({
          id: item.id,
          restaurant_id: commercialDemoFrame.snapshot.demo_restaurant.id,
          name: item.name,
          price: item.price,
          category: item.category || null,
        }));
        return readCommercialDemoToolState<Array<MenuOption & { is_available?: boolean }>>(
          commercialDemoFrame.config.sessionId,
          "menu-items",
          fallback,
        ).filter((item) => item.restaurant_id === restaurantId && item.is_available !== false);
      }

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

    if (!availableDate || !pickupStart || !pickupEnd) {
      toast({ title: "Créneau invalide", description: "Renseignez date et horaires de retrait.", variant: "destructive" });
      return;
    }
    if (pickupStart >= pickupEnd) {
      toast({ title: "Créneau invalide", description: "L'heure de fin doit être après le début.", variant: "destructive" });
      return;
    }

    setLoading(true);

    if (isCommercialDemo) {
      if (!onCreateDemo) {
        setLoading(false);
        toast({
          title: "Démo indisponible",
          description: "La session de démonstration doit être rechargée.",
          variant: "destructive",
        });
        return;
      }
      onCreateDemo({
        restaurant_id: restaurantId,
        title: selectedItem.name,
        offer_type: offerType,
        original_price: originalPrice,
        discounted_price: discountedPrice,
        quantity_available: quantity,
        is_active: true,
        available_date: availableDate,
        pickup_start: pickupStart,
        pickup_end: pickupEnd,
      });
      setLoading(false);
      onSaved();
      return;
    }

    const { error } = await (supabase.rpc as any)("restaurant_upsert_anti_waste_offer", {
      p_offer_id: null,
      p_payload: {
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
      },
      p_reason: "Création offre anti-gaspi restaurateur",
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
        <Label>Sélectionner un produit</Label>
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
            <Label>Date de disponibilité</Label>
            <Input type="date" value={availableDate} min={todayIso()} onChange={(e) => setAvailableDate(e.target.value)} />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-2">
              <Label>Retrait des</Label>
              <Input type="time" value={pickupStart} onChange={(e) => setPickupStart(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Jusqu’à</Label>
              <Input type="time" value={pickupEnd} onChange={(e) => setPickupEnd(e.target.value)} />
            </div>
          </div>
          <p className="text-[11px] text-muted-foreground">
            L'offre apparaîtra aux clients pendant ce créneau et disparaîtra à la fin.
          </p>

          <Button type="submit" disabled={loading} className="w-full gap-2">
            <Leaf className="h-4 w-4" />
            {loading ? "Création..." : "Activer l'offre anti-gaspi"}
          </Button>
        </>
      )}
    </form>
  );
}
