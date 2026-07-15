import { useQuery } from "@tanstack/react-query";
import CampaignBanner from "@/components/CampaignBanner";
import { getSupabase } from "@/integrations/supabase/client";
import { Leaf, Gift, Heart, Info, RefreshCcw } from "lucide-react";
import AntiWasteCard from "@/components/AntiWasteCard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getBusinessDateKey } from "@/lib/businessTime";
import { isAntiWasteOfferPubliclyVisible } from "@/lib/specialOffers";
import { useCommercialDemoFrame } from "@/components/commercial/CommercialDemoFrameProvider";
import { getCommercialDemoAntiWasteOffers } from "@/lib/commercialDemoClientCatalog";

const supabase = getSupabase();
const PUBLIC_ANTI_WASTE_OFFERS_LIMIT = 48;
const PUBLIC_SPECIAL_OFFERS_STALE_MS = 60_000;

export default function AntiGaspi() {
  const commercialDemoFrame = useCommercialDemoFrame();
  const isCommercialDemoClient = commercialDemoFrame?.surface === "client";
  const offersQuery = useQuery({
    queryKey: ["anti-waste-offers"],
    queryFn: async () => {
      const today = getBusinessDateKey();
      const { data, error: queryError } = await supabase
        .from("anti_waste_offers" as any)
        .select("*, restaurants(id, name, city, image_url, rating)")
        .eq("is_active", true)
        .gt("quantity_available", 0)
        .gte("available_date", today)
        .in("offer_type", ["regular", "surprise_bag", "solidarity"] as any)
        .order("available_date")
        .limit(PUBLIC_ANTI_WASTE_OFFERS_LIMIT);
      if (queryError) throw queryError;
      return data || [];
    },
    enabled: !isCommercialDemoClient,
    staleTime: PUBLIC_SPECIAL_OFFERS_STALE_MS,
  });
  const rawOffers = isCommercialDemoClient && commercialDemoFrame
    ? getCommercialDemoAntiWasteOffers(commercialDemoFrame.snapshot)
    : offersQuery.data;
  const isLoading = isCommercialDemoClient ? false : offersQuery.isLoading;
  const error = isCommercialDemoClient ? null : offersQuery.error;

  const offers = (rawOffers || []).filter((offer: any) =>
    isAntiWasteOfferPubliclyVisible(offer),
  );
  const portionsAvailable = offers.reduce(
    (total: number, offer: any) => total + Math.max(0, Number(offer.quantity_available) || 0),
    0,
  );

  const specialActions = [
    { id: "surprise", title: "Paniers Surprise", icon: Gift, color: "text-purple-500", bg: "bg-purple-50 dark:bg-purple-900/20", desc: "Contenu mystère à -70%" },
    { id: "solidarity", title: "Dons Solidaires", icon: Heart, color: "text-rose-500", bg: "bg-rose-50 dark:bg-rose-900/20", desc: "Offrez un repas à un démuni" },
    { id: "eco", title: "Engagement Éco", icon: Leaf, color: "text-green-500", bg: "bg-green-50 dark:bg-green-900/20", desc: "Réduisez le gaspillage alimentaire" },
  ];

  return (
    <main className="min-h-screen bg-background">
      <div className="container px-4 py-8 space-y-8">
        {!isCommercialDemoClient ? <CampaignBanner page="anti_waste" maxBanners={1} /> : null}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-green-500/10 flex items-center justify-center shrink-0">
              <Leaf className="h-6 w-6 text-green-600 dark:text-green-400" />
            </div>
            <div>
              <h1 className="font-display text-2xl sm:text-3xl font-bold">Zéro Gaspi</h1>
              <p className="text-muted-foreground text-sm">Sauvez la planète, un repas à la fois.</p>
            </div>
          </div>
          <div className="flex items-center gap-2 bg-secondary/50 p-2 rounded-xl">
            <Info className="h-4 w-4 text-muted-foreground" />
            <span className="text-xs font-medium">{portionsAvailable} portion{portionsAvailable > 1 ? "s" : ""} à sauver</span>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {specialActions.map((action) => (
            <div key={action.id} className={`flex flex-col items-center text-center p-6 rounded-2xl border-2 border-transparent hover:border-border transition-all ${action.bg}`}>
              <div className={`p-4 rounded-full bg-white shadow-sm mb-3 ${action.color}`}>
                <action.icon className="h-6 w-6" />
              </div>
              <h3 className="font-bold text-sm mb-1">{action.title}</h3>
              <p className="text-[10px] text-muted-foreground">{action.desc}</p>
            </div>
          ))}
        </div>

        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-xl font-bold">Offres disponibles</h2>
            <Badge variant="outline" className="text-green-600 dark:text-green-400 border-green-200 dark:border-green-700 bg-green-50 dark:bg-green-900/30">{offers?.length || 0} opportunités</Badge>
          </div>
          {isLoading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {[1, 2, 3].map((i) => <div key={i} className="h-72 rounded-xl bg-muted animate-pulse" />)}
            </div>
          ) : error ? (
            <div role="alert" className="rounded-2xl border border-destructive/30 bg-destructive/5 p-6 text-center">
              <p className="font-semibold text-destructive">Impossible de charger les offres anti-gaspi.</p>
              <p className="mt-1 text-sm text-muted-foreground">Les stocks n’ont pas été modifiés. Réessayez dans un instant.</p>
              <Button type="button" variant="outline" className="mt-4 gap-2" onClick={() => void offersQuery.refetch()}>
                <RefreshCcw className="h-4 w-4" />Réessayer
              </Button>
            </div>
          ) : offers && offers.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {offers.map((offer: any) => {
                const restaurant = offer.restaurants as any;
                return (
                  <div key={offer.id} className="animate-fade-in">
                    <AntiWasteCard
                      title={offer.title}
                      restaurant={restaurant?.name || ""}
                      restaurantId={restaurant?.id}
                      restaurantCity={restaurant?.city}
                      restaurantRating={restaurant?.rating ? Number(restaurant.rating) : undefined}
                      restaurantImageUrl={restaurant?.image_url}
                      originalPrice={Number(offer.original_price)}
                      discountedPrice={Number(offer.discounted_price)}
                      pickupStart={offer.pickup_start}
                      pickupEnd={offer.pickup_end}
                      imageUrl={offer.image_url || ""}
                      quantityAvailable={offer.quantity_available}
                      offerType={offer.offer_type as any}
                      availableDate={offer.available_date}
                      offerId={offer.id}
                    />
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="text-center py-20 bg-secondary/20 rounded-3xl border-2 border-dashed">
              <Leaf className="h-12 w-12 text-muted-foreground mx-auto mb-4 opacity-20" />
              <p className="text-muted-foreground font-medium">Tout a été sauvé ! Revenez plus tard.</p>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
