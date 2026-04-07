import { useQuery } from "@tanstack/react-query";
import CampaignBanner from "@/components/CampaignBanner";
import { supabase } from "@/integrations/supabase/client";
import { Leaf, Gift, Heart, Info } from "lucide-react";
import AntiWasteCard from "@/components/AntiWasteCard";
import { Badge } from "@/components/ui/badge";

export default function AntiGaspi() {
  const { data: rawOffers, isLoading } = useQuery({
    queryKey: ["anti-waste-offers"],
    queryFn: async () => {
      const { data } = await supabase
        .from("anti_waste_offers" as any)
        .select("*, restaurants(id, name, city, image_url, rating)")
        .eq("is_active", true)
        .in("offer_type", ["regular", "surprise_bag", "solidarity"] as any)
        .order("available_date");
      return data || [];
    },
    refetchInterval: 60000,
  });

  // Only show offers in their active window: available_date == today AND pickup_start <= now <= pickup_end
  const offers = (rawOffers || []).filter((offer: any) => {
    if (!offer.available_date) return false;
    const now = new Date();
    if (offer.pickup_end) {
      const end = new Date(`${offer.available_date}T${offer.pickup_end}`);
      if (end.getTime() <= now.getTime()) return false;
    }
    if (offer.pickup_start) {
      const start = new Date(`${offer.available_date}T${offer.pickup_start}`);
      if (start.getTime() > now.getTime()) return false;
    }
    return true;
  });

  const specialActions = [
    { id: "surprise", title: "Paniers Surprise", icon: Gift, color: "text-purple-500", bg: "bg-purple-50 dark:bg-purple-900/20", desc: "Contenu mystère à -70%" },
    { id: "solidarity", title: "Dons Solidaires", icon: Heart, color: "text-rose-500", bg: "bg-rose-50 dark:bg-rose-900/20", desc: "Offrez un repas à un démuni" },
    { id: "eco", title: "Engagement Éco", icon: Leaf, color: "text-green-500", bg: "bg-green-50 dark:bg-green-900/20", desc: "Réduisez le gaspillage alimentaire" },
  ];

  return (
    <main className="min-h-screen bg-background">
      <div className="container px-4 py-8 space-y-8">
        <CampaignBanner page="anti_waste" maxBanners={1} />
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
            <span className="text-xs font-medium">942kg sauvés cette semaine</span>
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