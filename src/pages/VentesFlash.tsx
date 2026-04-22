import { useEffect, useMemo, useState } from "react";
import CampaignBanner from "@/components/CampaignBanner";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getSupabase } from "@/integrations/supabase/client";
import { useCart } from "@/lib/cart";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Zap, Flame, Clock, ShoppingCart, ChevronRight,
  CheckCircle2, Star, MapPin, Bell, TrendingDown,
  AlertTriangle, Bike, ShoppingBag,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useActiveFeatures } from "@/lib/featureFlags";
import CountdownTimer, { getTargetFromMinutes } from "@/components/CountdownTimer";
import { isFlashSalePubliclyVisible } from "@/lib/specialOffers";

const supabase = getSupabase();

type Step = "browse" | "confirm";

export default function VentesFlash() {
  const { addItem, clearCart, updateCartMetadata, setOrderMode } = useCart();
  const { user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [step, setStep] = useState<Step>("browse");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [expiredIds, setExpiredIds] = useState<Set<string>>(new Set());
  const [selectedOrderMode, setSelectedOrderMode] = useState<"delivery" | "takeaway" | null>(null);
  const activeFeatures = useActiveFeatures();
  const deliveryEnabled = activeFeatures.has("livraison");
  const multiRestoEnabled = activeFeatures.has("multi-restaurant");

  const { data: allOffers, isLoading } = useQuery({
    queryKey: ["flash-sales-page"],
    queryFn: async () => {
      const { data } = await supabase
        .from("flash_sales" as any)
        .select("*, restaurants(id, name, city, image_url, rating, cuisine_type)")
        .eq("is_active", true)
        .order("sale_date");
      return (data || []) as any[];
    },
    refetchInterval: 30000,
  });

  const { data: flashSubscription } = useQuery({
    queryKey: ["flash-subscription", user?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("notification_subscriptions" as any)
        .select("*")
        .eq("user_id", user!.id)
        .eq("topic", "flash_sales")
        .maybeSingle();
      return data;
    },
    enabled: !!user,
  });

  const notifyEnabled = !!flashSubscription;

  const flashOffers = useMemo(() => {
    if (!allOffers) return [];
    const now = new Date();

    return allOffers.filter((offer: any) => isFlashSalePubliclyVisible(offer, now));
  }, [allOffers]);

  const targetDates = useMemo(() => {
    const map: Record<string, Date> = {};
    const now = new Date();
    flashOffers.forEach((offer: any, i: number) => {
      if (offer.sale_end && offer.sale_date) {
        const end = new Date(`${offer.sale_date}T${offer.sale_end}`);
        const diffMinutes = (end.getTime() - now.getTime()) / (1000 * 60);
        if (diffMinutes > 0) {
          map[offer.id] = end;
          return;
        }
      }
      map[offer.id] = getTargetFromMinutes(10 + (i * 4) % 50);
    });
    return map;
  }, [flashOffers]);

  const handleExpire = (id: string) => {
    setExpiredIds((prev) => new Set(prev).add(id));
    setSelected((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  };

  const toggleSelect = (id: string) => {
    if (expiredIds.has(id)) return;
    const next = new Set(selected);
    if (next.has(id)) {
      next.delete(id);
    } else {
      // Block selecting offers from different restaurants when multi-resto is disabled
      if (!multiRestoEnabled && selected.size > 0) {
        const currentRestaurantIds = new Set(
          flashOffers.filter((o: any) => selected.has(o.id)).map((o: any) => o.restaurants?.id || o.restaurant_id),
        );
        const newOffer = flashOffers.find((o: any) => o.id === id);
        const newRestaurantId = newOffer?.restaurants?.id || newOffer?.restaurant_id;
        if (newRestaurantId && currentRestaurantIds.size > 0 && !currentRestaurantIds.has(newRestaurantId)) {
          toast({
            title: "Un seul restaurant",
            description: "La commande multi-restaurants n'est pas disponible. Sélectionnez des offres du même restaurant.",
            variant: "destructive",
          });
          return;
        }
      }
      next.add(id);
    }
    setSelected(next);
  };

  const selectedOffers = flashOffers.filter((o: any) => selected.has(o.id));
  const totalOriginal = selectedOffers.reduce((s: number, o: any) => s + Number(o.original_price), 0);
  const totalDiscounted = selectedOffers.reduce((s: number, o: any) => s + Number(o.discounted_price), 0);
  const totalSaved = totalOriginal - totalDiscounted;
  const canDeliverAll = deliveryEnabled && selectedOffers.length > 0 && selectedOffers.every((o: any) => !!o.delivery_available);
  const canTakeawayAll = selectedOffers.length > 0 && selectedOffers.every((o: any) => !!o.takeaway_available);

  useEffect(() => {
    if (selectedOffers.length === 0) {
      setSelectedOrderMode(null);
      return;
    }

    setSelectedOrderMode((current) => {
      if (current === "delivery" && canDeliverAll) return current;
      if (current === "takeaway" && canTakeawayAll) return current;
      if (canDeliverAll) return "delivery";
      if (canTakeawayAll) return "takeaway";
      return null;
    });
  }, [selectedOffers.length, canDeliverAll, canTakeawayAll]);

  const handleCheckout = () => {
    // Re-check for expired offers at checkout time
    const now = new Date();
    const newlyExpired = selectedOffers.filter((offer: any) => {
      if (!offer.sale_end || !offer.sale_date) return false;
      const end = new Date(`${offer.sale_date}T${offer.sale_end}`);
      return end.getTime() <= now.getTime();
    });
    if (newlyExpired.length > 0) {
      newlyExpired.forEach((offer: any) => handleExpire(offer.id));
      toast({
        title: "Offres expirees",
        description: `${newlyExpired.length} offre(s) ont expire depuis votre selection. Elles ont ete retirees.`,
        variant: "destructive",
      });
      return;
    }

    // Block multi-restaurant checkout when feature is disabled
    const uniqueResIds = new Set(selectedOffers.map((o: any) => o.restaurants?.id || o.restaurant_id));
    if (!multiRestoEnabled && uniqueResIds.size > 1) {
      toast({
        title: "Un seul restaurant",
        description: "La commande multi-restaurants n'est pas disponible.",
        variant: "destructive",
      });
      return;
    }

    if (!canDeliverAll && !canTakeawayAll) {
      toast({
        title: "Offres incompatibles",
        description: "Certaines ventes flash ne partagent pas le meme mode de recuperation.",
        variant: "destructive",
      });
      return;
    }

    if (!selectedOrderMode) {
      toast({
        title: "Choisissez un mode",
        description: "Selectionnez un mode de recuperation pour continuer.",
        variant: "destructive",
      });
      return;
    }

    clearCart();
    setOrderMode(selectedOrderMode);

    updateCartMetadata({ feature: "ventes-flash", flashCount: selectedOffers.length });

    selectedOffers.forEach((offer: any) => {
      const restaurant = offer.restaurants;
      addItem({
        menuItemId: `flash-${offer.id}`,
        name: `[Flash] ${offer.title}`,
        price: Number(offer.discounted_price),
        restaurantId: restaurant?.id || offer.restaurant_id,
        restaurantName: restaurant?.name || "Restaurant",
        metadata: {
          is_flash_sale: true,
          flash_sale_id: offer.id,
          sale_date: offer.sale_date,
          sale_start: offer.sale_start,
          sale_end: offer.sale_end,
          delivery_available: deliveryEnabled && !!offer.delivery_available,
          takeaway_available: !!offer.takeaway_available,
        },
      });
    });

    setStep("confirm");
  };

  const handleGoToCart = () => {
    toast({
      title: "Ventes flash reservees !",
      description: `${selectedOffers.length} offre${selectedOffers.length > 1 ? "s" : ""} · ${totalDiscounted.toFixed(2)} CHF`,
    });
    navigate("/panier");
  };

  const activeCount = flashOffers.filter((o: any) => !expiredIds.has(o.id)).length;

  return (
    <main className="min-h-screen bg-background">
      <div className="container py-8 space-y-6">
        <CampaignBanner page="flash_sales" maxBanners={1} />
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-amber-500/10 flex items-center justify-center">
              <Zap className="h-6 w-6 text-amber-500 fill-amber-500" />
            </div>
            <div>
              <h1 className="font-display text-2xl font-bold">Ventes Flash</h1>
              <p className="text-muted-foreground text-xs">Offres limitees dans le temps</p>
            </div>
          </div>
          <Button
            variant={notifyEnabled ? "default" : "outline"}
            size="sm"
            onClick={async () => {
              if (!user) {
                toast({ title: "Connectez-vous", description: "Activez les alertes apres connexion.", variant: "destructive" });
                return;
              }
              if (notifyEnabled) {
                await supabase
                  .from("notification_subscriptions" as any)
                  .delete()
                  .eq("user_id", user.id)
                  .eq("topic", "flash_sales");
              } else {
                await supabase
                  .from("notification_subscriptions" as any)
                  .upsert({ user_id: user.id, topic: "flash_sales", filters: {} }, { onConflict: "user_id,topic" });
              }
              queryClient.invalidateQueries({ queryKey: ["flash-subscription", user.id] });
              toast({
                title: notifyEnabled ? "Alertes desactivees" : "Alertes flash activees",
                description: notifyEnabled ? "" : "Vous serez notifie des prochaines ventes flash",
              });
            }}
            className="gap-1.5"
          >
            <Bell className={`h-4 w-4 ${notifyEnabled ? "fill-current" : ""}`} />
            {notifyEnabled ? "ON" : "Alertes"}
          </Button>
        </div>

        {step === "browse" && (
          <div className="space-y-6">
            <div className="grid grid-cols-3 gap-3">
              <div className="rounded-xl bg-amber-500/5 border border-amber-500/10 p-3 text-center">
                <Zap className="h-4 w-4 text-amber-500 mx-auto mb-1" />
                <p className="text-lg font-bold">{activeCount}</p>
                <p className="text-[10px] text-muted-foreground">Offres actives</p>
              </div>
              <div className="rounded-xl bg-red-500/5 border border-red-500/10 p-3 text-center">
                <Flame className="h-4 w-4 text-red-500 mx-auto mb-1" />
                <p className="text-lg font-bold">{flashOffers.length > 0 ? "Live" : "-"}</p>
                <p className="text-[10px] text-muted-foreground">Etat</p>
              </div>
              <div className="rounded-xl bg-emerald-500/5 border border-emerald-500/10 p-3 text-center">
                <TrendingDown className="h-4 w-4 text-emerald-500 mx-auto mb-1" />
                <p className="text-lg font-bold">-70%</p>
                <p className="text-[10px] text-muted-foreground">Jusqu'a</p>
              </div>
            </div>

            <div className="rounded-xl bg-amber-500/5 border border-amber-500/10 p-4 flex items-start gap-3">
              <AlertTriangle className="h-5 w-5 text-amber-500 shrink-0 mt-0.5" />
              <div className="text-sm text-muted-foreground">
                <p className="font-semibold text-foreground mb-1">Comment ca marche ?</p>
                <p>Les ventes flash expirent a l'heure de fin choisie par le restaurateur.{deliveryEnabled ? " Elles peuvent etre disponibles en livraison, en emporter, ou les deux." : ""}</p>
              </div>
            </div>

            {isLoading ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {[1, 2, 3, 4].map((i) => <div key={i} className="h-64 rounded-xl bg-muted animate-pulse" />)}
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {flashOffers.map((offer: any) => {
                  const restaurant = offer.restaurants;
                  const isExpired = expiredIds.has(offer.id);
                  const isSelected = selected.has(offer.id);
                  const discount = Math.round((1 - Number(offer.discounted_price) / Number(offer.original_price)) * 100);
                  const target = targetDates[offer.id];

                  return (
                    <div
                      key={offer.id}
                      className={`rounded-2xl border-2 overflow-hidden transition-all ${
                        isExpired
                          ? "opacity-50 border-border grayscale pointer-events-none"
                          : isSelected
                            ? "border-amber-500 ring-1 ring-amber-500/30 shadow-lg"
                            : "border-border hover:border-amber-500/30"
                      }`}
                    >
                      <div className="relative">
                        <img
                          src={offer.image_url || restaurant?.image_url || "/images/mixed-grill-platter.jpeg"}
                          alt={offer.title}
                          className="w-full h-40 object-cover"
                        />
                        <div className="absolute inset-0 bg-gradient-to-t from-black/70 to-transparent" />

                        <div className="absolute top-3 right-3">
                          {target && !isExpired && (
                            <CountdownTimer
                              targetDate={target}
                              variant="badge"
                              onExpire={() => handleExpire(offer.id)}
                            />
                          )}
                          {isExpired && (
                            <Badge variant="destructive" className="gap-1 text-xs"><Clock className="h-3 w-3" /> Expire</Badge>
                          )}
                        </div>

                        <Badge className="absolute top-3 left-3 bg-amber-500 text-white border-none shadow-lg gap-1">
                          <Zap className="h-3 w-3" /> -{discount}%
                        </Badge>

                        <div className="absolute bottom-3 left-3 right-3 text-white">
                          <h3 className="font-bold text-sm leading-tight">{offer.title}</h3>
                          <div className="flex items-center gap-2 text-xs text-white/80 mt-0.5">
                            <span>{restaurant?.name}</span>
                            {restaurant?.city && <span className="flex items-center gap-0.5"><MapPin className="h-2.5 w-2.5" />{restaurant.city}</span>}
                          </div>
                        </div>

                        {offer.quantity_available <= 3 && !isExpired && (
                          <div className="absolute bottom-3 right-3">
                            <Badge variant="destructive" className="text-[10px] animate-pulse">
                              Plus que {offer.quantity_available}!
                            </Badge>
                          </div>
                        )}
                      </div>

                      <div className="p-4 space-y-3">
                        {offer.description && (
                          <p className="text-xs text-muted-foreground line-clamp-2">{offer.description}</p>
                        )}

                        {target && !isExpired && (
                          <CountdownTimer
                            targetDate={target}
                            variant="default"
                            label="Expire dans"
                            onExpire={() => handleExpire(offer.id)}
                          />
                        )}

                        <div className="flex items-center justify-between">
                          <div>
                            <div className="flex items-baseline gap-1.5">
                              <span className="text-xl font-black text-amber-600 dark:text-amber-400">{Number(offer.discounted_price).toFixed(2)}</span>
                              <span className="text-xs font-bold text-muted-foreground">CHF</span>
                            </div>
                            <span className="text-xs text-muted-foreground line-through">{Number(offer.original_price).toFixed(2)} CHF</span>
                          </div>

                          {!isExpired && (
                            <Button
                              onClick={() => toggleSelect(offer.id)}
                              variant={isSelected ? "outline" : "default"}
                              size="sm"
                              className={isSelected
                                ? "border-amber-500 text-amber-600 dark:text-amber-400 gap-1.5"
                                : "bg-amber-500 hover:bg-amber-600 gap-1.5"
                              }
                            >
                              {isSelected ? (
                                <><CheckCircle2 className="h-4 w-4" /> Selectionne</>
                              ) : (
                                <><ShoppingCart className="h-4 w-4" /> Ajouter</>
                              )}
                            </Button>
                          )}
                        </div>

                        <div className="flex flex-wrap items-center gap-2 text-[10px] text-muted-foreground">
                          <span className="inline-flex items-center gap-1"><Clock className="h-3 w-3" /> {offer.sale_start} - {offer.sale_end}</span>
                          {deliveryEnabled && offer.delivery_available && <span className="inline-flex items-center gap-1 rounded-md bg-blue-500/10 text-blue-600 dark:text-blue-400 px-1.5 py-0.5"><Bike className="h-3 w-3" /> Livraison</span>}
                          {offer.takeaway_available && <span className="inline-flex items-center gap-1 rounded-md bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 px-1.5 py-0.5"><ShoppingBag className="h-3 w-3" /> Emporter</span>}
                          {restaurant?.rating && (
                            <span className="ml-auto flex items-center gap-0.5">
                              <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
                              {Number(restaurant.rating).toFixed(1)}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {flashOffers.length === 0 && !isLoading && (
              <div className="text-center py-16 space-y-3 bg-secondary/20 rounded-2xl border-2 border-dashed">
                <Zap className="h-10 w-10 text-muted-foreground/20 mx-auto" />
                <p className="font-semibold text-muted-foreground">Aucune vente flash en cours</p>
                <p className="text-xs text-muted-foreground">Activez les alertes pour etre notifie !</p>
              </div>
            )}

            {selected.size > 0 && (
              <div className="sticky bottom-4 rounded-2xl border-2 border-amber-500/30 bg-card p-4 shadow-xl space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Zap className="h-5 w-5 text-amber-500 fill-amber-500" />
                    <span className="font-semibold">{selected.size} offre{selected.size > 1 ? "s" : ""} flash</span>
                  </div>
                  <div className="text-right">
                    <span className="text-xs text-muted-foreground line-through mr-2">{totalOriginal.toFixed(2)} CHF</span>
                    <span className="text-lg font-black text-amber-600 dark:text-amber-400">{totalDiscounted.toFixed(2)} CHF</span>
                  </div>
                </div>
                <div className="flex items-center gap-2 text-xs text-emerald-600 dark:text-emerald-400 font-medium">
                  <TrendingDown className="h-3.5 w-3.5" />
                  Vous economisez {totalSaved.toFixed(2)} CHF ({totalOriginal > 0 ? Math.round((totalSaved / totalOriginal) * 100) : 0}%)
                </div>
                <div className="space-y-2">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Mode de recuperation</p>
                  <div className={`grid gap-2 ${deliveryEnabled ? "grid-cols-2" : "grid-cols-1"}`}>
                    {deliveryEnabled && (
                      <Button
                        type="button"
                        variant={selectedOrderMode === "delivery" ? "default" : "outline"}
                        className="gap-1.5"
                        disabled={!canDeliverAll}
                        onClick={() => setSelectedOrderMode("delivery")}
                      >
                        <Bike className="h-4 w-4" /> Livraison
                      </Button>
                    )}
                    <Button
                      type="button"
                      variant={selectedOrderMode === "takeaway" ? "default" : "outline"}
                      className="gap-1.5"
                      disabled={!canTakeawayAll}
                      onClick={() => setSelectedOrderMode("takeaway")}
                    >
                      <ShoppingBag className="h-4 w-4" /> Emporter
                    </Button>
                  </div>
                  {selectedOrderMode && (
                    <p className="text-[11px] text-muted-foreground">
                      Mode selectionne : {selectedOrderMode === "delivery" ? "Livraison" : "Emporter"}
                    </p>
                  )}
                </div>
                <Button onClick={handleCheckout} className="w-full bg-amber-500 hover:bg-amber-600 gap-2" size="lg">
                  <ShoppingCart className="h-4 w-4" /> Valider mes ventes flash
                </Button>
              </div>
            )}
          </div>
        )}

        {step === "confirm" && (
          <div className="space-y-6">
            <div className="rounded-2xl bg-amber-500/5 border border-amber-500/20 p-6 text-center space-y-3">
              <CheckCircle2 className="h-14 w-14 text-amber-500 mx-auto" />
              <h2 className="font-display text-xl font-bold">Ventes flash reservees !</h2>
              <p className="text-sm text-muted-foreground">
                {selectedOffers.length} offre{selectedOffers.length > 1 ? "s" : ""} ajoutee{selectedOffers.length > 1 ? "s" : ""} a votre panier
              </p>
            </div>

            <div className="rounded-xl bg-secondary/50 p-4 space-y-2 text-sm">
              {selectedOffers.map((offer: any) => {
                const restaurant = offer.restaurants;
                return (
                  <div key={offer.id} className="flex justify-between">
                    <div>
                      <span className="font-medium">{offer.title}</span>
                      <span className="text-muted-foreground text-xs ml-2">({restaurant?.name})</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground line-through">{Number(offer.original_price).toFixed(2)}</span>
                      <span className="font-bold text-amber-600 dark:text-amber-400">{Number(offer.discounted_price).toFixed(2)} CHF</span>
                    </div>
                  </div>
                );
              })}
              <div className="flex justify-between border-t pt-2">
                <span className="text-muted-foreground">Economies</span>
                <span className="font-bold text-emerald-600 dark:text-emerald-400">-{totalSaved.toFixed(2)} CHF</span>
              </div>
              <div className="flex justify-between border-t pt-2">
                <span className="font-semibold">Total</span>
                <span className="font-black text-lg">{totalDiscounted.toFixed(2)} CHF</span>
              </div>
            </div>

            <Button onClick={handleGoToCart} className="w-full bg-amber-500 hover:bg-amber-600 gap-2" size="lg">
              Proceder au paiement <ChevronRight className="h-4 w-4" />
            </Button>

            <Button
              variant="outline"
              className="w-full gap-2"
              onClick={() => { setStep("browse"); setSelected(new Set()); }}
            >
              <Zap className="h-4 w-4" /> Continuer les achats flash
            </Button>
          </div>
        )}
      </div>
    </main>
  );
}
