import { useEffect, useMemo, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { Heart, Megaphone, Percent } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { Badge } from "@/components/ui/badge";
import PriceRangeIcons from "./PriceRangeIcons";
import { trackClick, trackImpression, trackSponsoredClick, trackSponsoredImpression } from "@/lib/analytics";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";

interface RestaurantCardProps {
  id: string;
  name: string;
  cuisine: string;
  rating: number;
  reviewCount: number;
  imageUrl: string;
  priceRange: number;
  city: string;
  address?: string;
  sponsoredCampaignId?: string;
  sponsoredPromoImage?: string;
}

const CUISINE_FALLBACKS: Record<string, string> = {
  italien: "/images/pasta-assortment.jpeg",
  pizza: "/images/pasta-assortment.jpeg",
  "pÃ¢tes": "/images/pasta-assortment.jpeg",
  pasta: "/images/pasta-assortment.jpeg",
  japonais: "/images/poke-bowls.jpeg",
  sushi: "/images/poke-bowls.jpeg",
  poke: "/images/poke-bowls.jpeg",
  burger: "/images/smash-burgers.jpeg",
  hamburger: "/images/gourmet-burgers.jpeg",
  smash: "/images/smash-burger-single.jpeg",
  "franÃ§ais": "/images/octopus-fine-dining.jpeg",
  gastronomique: "/images/octopus-fine-dining.jpeg",
  "fine dining": "/images/octopus-fine-dining.jpeg",
  chinois: "/images/thai-pad-thai.jpeg",
  asiatique: "/images/thai-pad-thai.jpeg",
  vietnamien: "/images/thai-pad-thai.jpeg",
  "thaÃ¯": "/images/thai-spread.jpeg",
  thai: "/images/thai-curry-spread.jpeg",
  indien: "/images/indian-curry-bowls.jpeg",
  indian: "/images/indian-feast.jpeg",
  curry: "/images/indian-curry-bowls.jpeg",
  kebab: "/images/kebab-box-spread.jpeg",
  turc: "/images/doner-kebab-plate.jpeg",
  "dÃ¶ner": "/images/doner-kebab-plate.jpeg",
  doner: "/images/doner-kebab-plate.jpeg",
  mexicain: "/images/mixed-grill-platter.jpeg",
  "tex-mex": "/images/mixed-grill-platter.jpeg",
  poulet: "/images/chicken-bucket-fries.jpeg",
  chicken: "/images/crispy-chicken.jpeg",
  "rÃ´tisserie": "/images/rotisserie-chicken.jpeg",
  libanais: "/images/lebanese-mezze.jpeg",
  grec: "/images/greek-gyros.jpeg",
  "mÃ©diterranÃ©en": "/images/lebanese-mezze.jpeg",
  mediterrane: "/images/greek-gyros.jpeg",
  poisson: "/images/lobster-roll-fries.jpeg",
  "fruits de mer": "/images/lobster-roll-fries.jpeg",
  seafood: "/images/lobster-roll-fries.jpeg",
  "amÃ©ricain": "/images/burgers-wings.jpeg",
  wings: "/images/burgers-wings.jpeg",
  "fast food": "/images/stack-shake-spread.jpeg",
  "fast-food": "/images/stack-shake-spread.jpeg",
  salade: "/images/poke-bowls.jpeg",
  healthy: "/images/poke-bowls.jpeg",
  bowl: "/images/poke-bowls.jpeg",
  grill: "/images/mixed-grill-platter.jpeg",
  viande: "/images/mixed-grill-platter.jpeg",
  bbq: "/images/mixed-grill-platter.jpeg",
  marocain: "/images/indian-feast.jpeg",
  oriental: "/images/lebanese-mezze.jpeg",
  "cafÃ©": "/images/lobster-roll-fries.jpeg",
  dessert: "/images/gfc-fried-chicken.jpeg",
  default: "/images/mixed-grill-platter.jpeg",
};

function getImageUrl(imageUrl: string, cuisine: string): string {
  if (cuisine) {
    const lower = cuisine.toLowerCase();
    for (const [key, url] of Object.entries(CUISINE_FALLBACKS)) {
      if (key !== "default" && lower.includes(key)) return url;
    }
  }
  if (imageUrl && imageUrl.startsWith("/images/")) {
    return imageUrl;
  }
  return CUISINE_FALLBACKS.default;
}

function getNextTimeSlots(): string[] {
  const now = new Date();
  const currentHour = now.getHours();
  const currentMin = now.getMinutes();
  const allSlots = [
    "11:30",
    "12:00",
    "12:15",
    "12:30",
    "12:45",
    "13:00",
    "13:15",
    "18:30",
    "19:00",
    "19:15",
    "19:30",
    "20:00",
    "20:30",
    "21:00",
  ];

  return allSlots
    .filter((slot) => {
      const [hours, minutes] = slot.split(":").map(Number);
      return hours > currentHour || (hours === currentHour && minutes > currentMin);
    })
    .slice(0, 5);
}

function getRatingColor(rating: number): string {
  if (rating >= 9) return "bg-emerald-600 text-white";
  if (rating >= 8) return "bg-emerald-500 text-white";
  if (rating >= 7) return "bg-lime-500 text-white";
  if (rating >= 6) return "bg-amber-400 text-white";
  return "bg-orange-400 text-white";
}

export default function RestaurantCard({
  id,
  name,
  cuisine,
  rating,
  reviewCount,
  imageUrl,
  priceRange,
  city,
  address,
  sponsoredCampaignId,
  sponsoredPromoImage,
}: RestaurantCardProps) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const resolvedImage = getImageUrl(sponsoredPromoImage || imageUrl, cuisine);
  const impressionTracked = useRef(false);
  const isSponsored = !!sponsoredCampaignId;

  const { data: isFavorite } = useQuery({
    queryKey: ["favorite", id, user?.id],
    queryFn: async () => {
      if (!user) return false;
      const { data } = await supabase
        .from("favorites")
        .select("id")
        .eq("restaurant_id", id)
        .eq("user_id", user.id)
        .maybeSingle();
      return !!data;
    },
    enabled: !!user,
  });

  const toggleFavorite = async (event: React.MouseEvent) => {
    event.stopPropagation();
    if (!user) {
      return toast({ title: "Connectez-vous pour ajouter des favoris", variant: "destructive" });
    }

    if (isFavorite) {
      await supabase.from("favorites").delete().eq("restaurant_id", id).eq("user_id", user.id);
    } else {
      await supabase.from("favorites").insert({ restaurant_id: id, user_id: user.id });
    }
    queryClient.invalidateQueries({ queryKey: ["favorite", id] });
  };

  const { data: bestDiscount = 0 } = useQuery({
    queryKey: ["restaurant-best-discount", id],
    queryFn: async () => {
      const { data } = await supabase
        .from("meal_formulas")
        .select("discount_percent")
        .eq("restaurant_id", id)
        .eq("is_active", true)
        .order("discount_percent", { ascending: false })
        .limit(1);
      return data?.[0]?.discount_percent || 0;
    },
  });

  const timeSlots = useMemo(() => getNextTimeSlots(), []);

  useEffect(() => {
    if (impressionTracked.current) return;
    impressionTracked.current = true;

    if (isSponsored && sponsoredCampaignId) {
      trackSponsoredImpression(sponsoredCampaignId, id, "restaurant_card");
    } else {
      trackImpression("restaurant", id);
    }
  }, [id, isSponsored, sponsoredCampaignId]);

  const handleCardClick = () => {
    if (isSponsored && sponsoredCampaignId) {
      trackSponsoredClick(sponsoredCampaignId, id, "restaurant_card");
    } else {
      trackClick("restaurant", id);
    }
    navigate(`/restaurant/${id}`);
  };

  const handleSlotClick = (event: React.MouseEvent, slot: string) => {
    event.stopPropagation();
    if (isSponsored && sponsoredCampaignId) {
      trackSponsoredClick(sponsoredCampaignId, id, "restaurant_card_slot");
    }
    navigate(`/restaurant/${id}?reserve=true&time=${slot}`);
  };

  const ratingNum = Math.min(rating, 10);
  const displayRating = ratingNum > 0 ? ratingNum.toFixed(1) : null;

  return (
    <div onClick={handleCardClick} className="group block h-full cursor-pointer">
      <div className="premium-card h-full overflow-hidden rounded-2xl border bg-card shadow-sm transition-shadow hover:shadow-md">
        <div className="flex flex-col sm:flex-row lg:flex-col">
          <div className="relative aspect-[16/10] w-full shrink-0 overflow-hidden sm:h-auto sm:w-44 sm:aspect-auto md:w-52 lg:w-full lg:aspect-[16/9]">
            <img
              src={resolvedImage}
              alt={name}
              className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-110"
              loading="lazy"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/30 to-transparent sm:bg-gradient-to-r" />
            <div className="absolute left-2 top-2 flex flex-wrap gap-1">
              {isSponsored ? (
                <Badge className="gap-1 border-none bg-amber-500/90 text-[9px] font-bold uppercase text-white shadow-sm backdrop-blur-md">
                  <Megaphone className="h-3 w-3" />
                  Sponsorise
                </Badge>
              ) : null}
              <Badge className="border-none bg-white/90 text-[9px] font-bold uppercase text-foreground shadow-sm backdrop-blur-md">
                Reservation
              </Badge>
            </div>
            <button
              className="absolute right-2 top-2 flex h-8 w-8 items-center justify-center rounded-full bg-white/80 backdrop-blur-sm transition-colors hover:bg-white"
              onClick={toggleFavorite}
            >
              <Heart className={isFavorite ? "h-4 w-4 fill-red-500 text-red-500" : "h-4 w-4 text-muted-foreground"} />
            </button>
          </div>

          <div className="flex min-w-0 flex-1 flex-col p-3 sm:p-4">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <h3 className="font-display text-sm font-bold leading-tight transition-colors group-hover:text-primary sm:text-base sm:truncate lg:text-clip lg:whitespace-normal lg:overflow-visible">
                  {name}
                </h3>
                <p className="mt-0.5 text-xs text-muted-foreground sm:truncate lg:text-clip lg:whitespace-normal lg:overflow-visible">
                  {address ? `${address}, ${city}` : city}
                </p>
              </div>
              {displayRating ? (
                <div className="shrink-0 text-right">
                  <div className={`inline-flex min-w-[2.5rem] items-center justify-center rounded-lg px-2 py-1 text-sm font-bold ${getRatingColor(ratingNum)}`}>
                    {displayRating}
                  </div>
                  <p className="mt-0.5 text-[10px] text-muted-foreground">({reviewCount})</p>
                </div>
              ) : null}
            </div>

            <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
              <span>{cuisine}</span>
              {cuisine ? <span>·</span> : null}
              <PriceRangeIcons range={priceRange} />
            </div>

            {bestDiscount > 0 ? (
              <div className="mt-2">
                <Badge className="gap-1 border-miamz-green/20 bg-miamz-green/10 text-[10px] font-bold text-miamz-green hover:bg-miamz-green/20">
                  <Percent className="h-3 w-3" />
                  Jusqu'a -{bestDiscount}%
                </Badge>
              </div>
            ) : null}

            <div className="flex-1" />

            {timeSlots.length > 0 ? (
              <div className="mt-3 flex gap-1.5 overflow-x-auto">
                {timeSlots.map((slot) => (
                  <button key={slot} onClick={(event) => handleSlotClick(event, slot)} className="group/slot flex shrink-0 flex-col items-center">
                    <span className="rounded-lg border-2 border-miamz-green/60 bg-miamz-green/5 px-2.5 py-1.5 text-xs font-bold text-miamz-green transition-colors group-hover/slot:bg-miamz-green group-hover/slot:text-white">
                      {slot}
                    </span>
                    {bestDiscount > 0 ? <span className="mt-0.5 text-[9px] font-bold text-miamz-green">-{bestDiscount}%</span> : null}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
