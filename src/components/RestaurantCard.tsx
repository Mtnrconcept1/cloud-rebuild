import { useEffect, useMemo, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowRight, Bike, Clock3, Heart, MapPin, Megaphone, Percent } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { Badge } from "@/components/ui/badge";
import PriceRangeIcons from "./PriceRangeIcons";
import { trackSponsoredClick, trackSponsoredImpression, trackImpression, trackClick } from "@/lib/analytics";
import { getSupabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { useActiveFeatures } from "@/lib/featureFlags";
import { useToast } from "@/hooks/use-toast";

const supabase = getSupabase();

interface RestaurantCardProps {
  id: string;
  name: string;
  cuisine: string;
  rating: number;
  reviewCount: number;
  imageUrl: string;
  priceRange: number;
  deliveryAvailable: boolean;
  city: string;
  address?: string;
  sponsoredCampaignId?: string;
  sponsoredPromoImage?: string;
}

const CUISINE_FALLBACKS: Record<string, string> = {
  italien: "/images/pasta-assortment.jpeg",
  pizza: "/images/pasta-assortment.jpeg",
  pates: "/images/pasta-assortment.jpeg",
  pasta: "/images/pasta-assortment.jpeg",
  japonais: "/images/poke-bowls.jpeg",
  sushi: "/images/poke-bowls.jpeg",
  poke: "/images/poke-bowls.jpeg",
  burger: "/images/smash-burgers.jpeg",
  hamburger: "/images/gourmet-burgers.jpeg",
  smash: "/images/smash-burger-single.jpeg",
  francais: "/images/octopus-fine-dining.jpeg",
  gastronomique: "/images/octopus-fine-dining.jpeg",
  "fine dining": "/images/octopus-fine-dining.jpeg",
  chinois: "/images/thai-pad-thai.jpeg",
  asiatique: "/images/thai-pad-thai.jpeg",
  vietnamien: "/images/thai-pad-thai.jpeg",
  thai: "/images/thai-curry-spread.jpeg",
  indien: "/images/indian-curry-bowls.jpeg",
  indian: "/images/indian-feast.jpeg",
  curry: "/images/indian-curry-bowls.jpeg",
  kebab: "/images/kebab-box-spread.jpeg",
  turc: "/images/doner-kebab-plate.jpeg",
  doner: "/images/doner-kebab-plate.jpeg",
  mexicain: "/images/mixed-grill-platter.jpeg",
  "tex-mex": "/images/mixed-grill-platter.jpeg",
  poulet: "/images/chicken-bucket-fries.jpeg",
  chicken: "/images/crispy-chicken.jpeg",
  rotisserie: "/images/rotisserie-chicken.jpeg",
  libanais: "/images/lebanese-mezze.jpeg",
  grec: "/images/greek-gyros.jpeg",
  mediterraneen: "/images/lebanese-mezze.jpeg",
  mediterrane: "/images/greek-gyros.jpeg",
  poisson: "/images/lobster-roll-fries.jpeg",
  "fruits de mer": "/images/lobster-roll-fries.jpeg",
  seafood: "/images/lobster-roll-fries.jpeg",
  americain: "/images/burgers-wings.jpeg",
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
  cafe: "/images/lobster-roll-fries.jpeg",
  dessert: "/images/gfc-fried-chicken.jpeg",
  default: "/images/mixed-grill-platter.jpeg",
};

function normalizeCuisine(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function getImageUrl(imageUrl: string, cuisine: string): string {
  if (imageUrl && (imageUrl.startsWith("http") || imageUrl.startsWith("/images/"))) {
    return imageUrl;
  }

  if (cuisine) {
    const lower = normalizeCuisine(cuisine);
    for (const [key, url] of Object.entries(CUISINE_FALLBACKS)) {
      if (key !== "default" && lower.includes(key)) return url;
    }
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
      const [h, m] = slot.split(":").map(Number);
      return h > currentHour || (h === currentHour && m > currentMin);
    })
    .slice(0, 4);
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
  deliveryAvailable,
  city,
  address,
  sponsoredCampaignId,
  sponsoredPromoImage,
}: RestaurantCardProps) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const activeFeatures = useActiveFeatures();
  const resolvedImage = getImageUrl(sponsoredPromoImage || imageUrl, cuisine);
  const impressionTracked = useRef(false);
  const isSponsored = Boolean(sponsoredCampaignId);
  const showDelivery = activeFeatures.has("livraison") && deliveryAvailable;

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
      return Boolean(data);
    },
    enabled: Boolean(user),
  });

  const toggleFavorite = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!user) {
      toast({ title: "Connectez-vous pour ajouter des favoris", variant: "destructive" });
      return;
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
  const visibleSlots = timeSlots.slice(0, 2);
  const estimatedMinutes = useMemo(() => {
    const base = 25 + Math.floor(Math.random() * 15);
    return { min: base, max: base + 10 };
  }, []);

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

  const handleViewClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    handleCardClick();
  };

  const handleSlotClick = (e: React.MouseEvent, slot: string) => {
    e.stopPropagation();
    if (isSponsored && sponsoredCampaignId) {
      trackSponsoredClick(sponsoredCampaignId, id, "restaurant_card_slot");
    }
    navigate(`/restaurant/${id}?reserve=true&time=${slot}`);
  };

  const ratingNum = Math.min(rating, 10);
  const displayRating = ratingNum > 0 ? ratingNum.toFixed(1) : null;

  return (
    <div onClick={handleCardClick} className="group block h-full cursor-pointer">
      <div className="premium-card flex h-full flex-col overflow-hidden rounded-[26px] border border-border/70 bg-card/95 shadow-[0_14px_38px_rgba(15,23,42,0.08)] transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_20px_48px_rgba(15,23,42,0.14)]">
        <div className="relative aspect-[16/10] overflow-hidden">
          <img
            src={resolvedImage}
            alt={name}
            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
            loading="lazy"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-slate-950/50 via-slate-950/10 to-transparent" />

          <div className="absolute left-3 top-3 flex flex-wrap gap-1.5">
            {isSponsored ? (
              <Badge className="gap-1 border-none bg-amber-500/95 text-[9px] font-bold uppercase text-white shadow-sm backdrop-blur-md">
                <Megaphone className="h-3 w-3" /> Sponsorise
              </Badge>
            ) : null}
            {showDelivery ? (
              <Badge className="gap-1 border-none bg-primary/95 text-[9px] font-bold uppercase text-white shadow-sm backdrop-blur-md">
                <Bike className="h-3 w-3" /> Livraison
              </Badge>
            ) : null}
          </div>

          <button
            className="absolute right-3 top-3 grid h-9 w-9 place-items-center rounded-full bg-white/88 backdrop-blur-sm transition-colors hover:bg-white"
            onClick={toggleFavorite}
          >
            <Heart className={isFavorite ? "h-4 w-4 fill-red-500 text-red-500" : "h-4 w-4 text-muted-foreground"} />
          </button>

          {bestDiscount > 0 ? (
            <div className="absolute bottom-3 left-3">
              <Badge className="gap-1 rounded-full border border-white/20 bg-white/90 px-3 py-1 text-[10px] font-bold text-emerald-700 shadow-sm backdrop-blur-md hover:bg-white">
                <Percent className="h-3 w-3" /> Jusqu'a -{bestDiscount}%
              </Badge>
            </div>
          ) : null}
        </div>

        <div className="flex flex-1 flex-col p-4 sm:p-5">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1 space-y-1">
              <h3 className="font-display text-base font-bold leading-tight text-foreground transition-colors group-hover:text-primary">
                {name}
              </h3>
              <div className="flex flex-wrap items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground/90">
                {cuisine ? <span className="max-w-full truncate">{cuisine}</span> : null}
                {cuisine ? <span className="text-border">/</span> : null}
                <PriceRangeIcons range={priceRange} />
              </div>
            </div>

            {displayRating ? (
              <div className="shrink-0 text-right">
                <div className={`inline-flex min-w-[2.7rem] items-center justify-center rounded-xl px-2.5 py-1.5 text-sm font-bold ${getRatingColor(ratingNum)}`}>
                  {displayRating}
                </div>
                <p className="mt-1 text-[10px] text-muted-foreground">({reviewCount})</p>
              </div>
            ) : null}
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1.5">
              <MapPin className="h-3.5 w-3.5 text-primary/75" />
              <span className="font-medium text-foreground/85">{city}</span>
            </span>
            {showDelivery ? (
              <span className="inline-flex items-center gap-1.5">
                <Clock3 className="h-3.5 w-3.5 text-primary/75" />
                <span>{estimatedMinutes.min}-{estimatedMinutes.max} min</span>
              </span>
            ) : null}
          </div>

          {address ? (
            <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">
              {address}
            </p>
          ) : (
            <p className="mt-2 text-sm text-muted-foreground">
              Ouvrez la fiche pour voir le menu, les disponibilites et les details.
            </p>
          )}

          <div className="mt-auto pt-4">
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={handleViewClick}
                className="inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-[#21314b] px-4 text-sm font-bold text-white shadow-[0_10px_24px_rgba(33,49,75,0.22)] transition-all hover:bg-[#2a3d5d]"
              >
                Voir le restaurant
                <ArrowRight className="h-4 w-4" />
              </button>
              {visibleSlots.map((slot) => (
                <button
                  key={slot}
                  type="button"
                  onClick={(e) => handleSlotClick(e, slot)}
                  className="inline-flex h-11 items-center justify-center rounded-xl border border-emerald-500/35 bg-emerald-50 px-3.5 text-sm font-bold text-emerald-700 transition-colors hover:border-emerald-500 hover:bg-emerald-500 hover:text-white"
                >
                  {slot}
                </button>
              ))}
            </div>
            {timeSlots.length > 0 ? (
              <p className="mt-2 text-xs text-muted-foreground">
                Prochains creneaux visibles. Plus d'options sur la fiche.
              </p>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
