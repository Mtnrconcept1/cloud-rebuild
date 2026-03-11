import { useEffect, useRef, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Bike, Megaphone, Heart, Percent } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import PriceRangeIcons from "./PriceRangeIcons";
import { trackSponsoredClick, trackSponsoredImpression, trackImpression, trackClick } from "@/lib/analytics";
import { useQuery, useQueryClient } from "@tanstack/react-query";
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
  deliveryAvailable: boolean;
  city: string;
  address?: string;
  sponsoredCampaignId?: string;
  sponsoredPromoImage?: string;
}

const CUISINE_FALLBACKS: Record<string, string> = {
  italien: "https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?w=600&h=450&fit=crop",
  pizza: "https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?w=600&h=450&fit=crop",
  japonais: "https://images.unsplash.com/photo-1579871494447-9811cf80d66c?w=600&h=450&fit=crop",
  sushi: "https://images.unsplash.com/photo-1579871494447-9811cf80d66c?w=600&h=450&fit=crop",
  burger: "https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=600&h=450&fit=crop",
  hamburger: "https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=600&h=450&fit=crop",
  français: "https://images.unsplash.com/photo-1414235077428-338989a2e8c0?w=600&h=450&fit=crop",
  chinois: "https://images.unsplash.com/photo-1525755662778-989d0524087e?w=600&h=450&fit=crop",
  mexicain: "https://images.unsplash.com/photo-1565299585323-38d6b0865b47?w=600&h=450&fit=crop",
  indien: "https://images.unsplash.com/photo-1585937421612-70a008356fbe?w=600&h=450&fit=crop",
  thaï: "https://images.unsplash.com/photo-1562565652-a0d8f0c59eb4?w=600&h=450&fit=crop",
  kebab: "https://images.unsplash.com/photo-1529006557810-274b9b2fc783?w=600&h=450&fit=crop",
  café: "https://images.unsplash.com/photo-1509042239860-f550ce710b93?w=600&h=450&fit=crop",
  salade: "https://images.unsplash.com/photo-1512621776951-a57141f2eefd?w=600&h=450&fit=crop",
  dessert: "https://images.unsplash.com/photo-1551024506-0bccd828d307?w=600&h=450&fit=crop",
  default: "https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?w=600&h=450&fit=crop",
};

function getImageUrl(imageUrl: string, cuisine: string): string {
  if (imageUrl && !imageUrl.includes("unsplash.com/photo-1517248135467")) {
    return imageUrl;
  }
  if (cuisine) {
    const lower = cuisine.toLowerCase();
    for (const [key, url] of Object.entries(CUISINE_FALLBACKS)) {
      if (lower.includes(key)) return url;
    }
  }
  return imageUrl || CUISINE_FALLBACKS.default;
}

function getNextTimeSlots(): string[] {
  const now = new Date();
  const currentHour = now.getHours();
  const currentMin = now.getMinutes();
  const allSlots = [
    "11:30", "12:00", "12:15", "12:30", "12:45", "13:00", "13:15",
    "18:30", "19:00", "19:15", "19:30", "20:00", "20:30", "21:00",
  ];
  const futureSlots = allSlots.filter((slot) => {
    const [h, m] = slot.split(":").map(Number);
    return h > currentHour || (h === currentHour && m > currentMin);
  });
  return futureSlots.slice(0, 5);
}

function getRatingColor(rating: number): string {
  if (rating >= 9) return "bg-emerald-600 text-white";
  if (rating >= 8) return "bg-emerald-500 text-white";
  if (rating >= 7) return "bg-lime-500 text-white";
  if (rating >= 6) return "bg-amber-400 text-white";
  return "bg-orange-400 text-white";
}

export default function RestaurantCard({
  id, name, cuisine, rating, reviewCount, imageUrl, priceRange,
  deliveryAvailable, city, address, sponsoredCampaignId, sponsoredPromoImage,
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
      const { data } = await supabase.from("favorites").select("id").eq("restaurant_id", id).eq("user_id", user.id).maybeSingle();
      return !!data;
    },
    enabled: !!user,
  });

  const toggleFavorite = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!user) return toast({ title: "Connectez-vous pour ajouter des favoris", variant: "destructive" });
    if (isFavorite) {
      await supabase.from("favorites").delete().eq("restaurant_id", id).eq("user_id", user.id);
    } else {
      await supabase.from("favorites").insert({ restaurant_id: id, user_id: user.id });
    }
    queryClient.invalidateQueries({ queryKey: ["favorite", id] });
  };

  // Fetch best discount from meal_formulas for this restaurant
  const { data: bestDiscount = 0 } = useQuery({
    queryKey: ["restaurant-best-discount", id],
    queryFn: async () => {
      const { data } = await supabase.from("meal_formulas").select("discount_percent").eq("restaurant_id", id).eq("is_active", true).order("discount_percent", { ascending: false }).limit(1);
      return data?.[0]?.discount_percent || 0;
    },
  });
  const timeSlots = useMemo(() => getNextTimeSlots(), []);

  useEffect(() => {
    if (impressionTracked.current) return;
    impressionTracked.current = true;
    if (isSponsored && sponsoredCampaignId) {
      trackSponsoredImpression(sponsoredCampaignId, id);
    } else {
      trackImpression("restaurant", id);
    }
  }, [id, isSponsored, sponsoredCampaignId]);

  const handleCardClick = () => {
    if (isSponsored && sponsoredCampaignId) {
      trackSponsoredClick(sponsoredCampaignId, id);
    } else {
      trackClick("restaurant", id);
    }
    navigate(`/restaurant/${id}`);
  };

  const handleSlotClick = (e: React.MouseEvent, slot: string) => {
    e.stopPropagation();
    if (isSponsored && sponsoredCampaignId) {
      trackSponsoredClick(sponsoredCampaignId, id);
    }
    navigate(`/restaurant/${id}?reserve=true&time=${slot}`);
  };

  const ratingNum = Math.min(rating, 10);
  const displayRating = ratingNum > 0 ? ratingNum.toFixed(1) : null;

  // Estimated delivery time based on rating/popularity (simulated)
  const estimatedMinutes = useMemo(() => {
    const base = 25 + Math.floor(Math.random() * 15); // 25-40 min
    return { min: base, max: base + 10 };
  }, [id]);

  return (
    <div onClick={handleCardClick} className="group block cursor-pointer h-full">
      <div className="premium-card h-full rounded-2xl bg-card border shadow-sm hover:shadow-md transition-shadow overflow-hidden">
        <div className="flex flex-col sm:flex-row lg:flex-col">
          <div className="relative w-full sm:w-44 md:w-52 lg:w-full shrink-0 aspect-[16/10] sm:aspect-auto sm:h-auto lg:aspect-[16/9] overflow-hidden">
            <img src={resolvedImage} alt={name} className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-110" loading="lazy" />
            <div className="absolute inset-0 bg-gradient-to-t from-black/30 to-transparent sm:bg-gradient-to-r" />
            <div className="absolute top-2 left-2 flex flex-wrap gap-1">
              {isSponsored && (
                <Badge className="bg-amber-500/90 backdrop-blur-md text-white text-[9px] gap-1 shadow-sm border-none uppercase font-bold">
                  <Megaphone className="h-3 w-3" /> Sponsorisé
                </Badge>
              )}
              {deliveryAvailable && (
                <Badge className="bg-primary/90 backdrop-blur-md text-white text-[9px] gap-1 shadow-sm border-none uppercase font-bold">
                  <Bike className="h-3 w-3" /> Livraison
                </Badge>
              )}
            </div>
            <button className="absolute top-2 right-2 w-8 h-8 rounded-full bg-white/80 backdrop-blur-sm flex items-center justify-center hover:bg-white transition-colors" onClick={toggleFavorite}>
              <Heart className={isFavorite ? "h-4 w-4 fill-red-500 text-red-500" : "h-4 w-4 text-muted-foreground"} />
            </button>
          </div>
          <div className="flex-1 min-w-0 p-3 sm:p-4 flex flex-col">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <h3 className="font-display font-bold text-sm sm:text-base leading-tight group-hover:text-primary transition-colors sm:truncate lg:overflow-visible lg:text-clip lg:whitespace-normal">{name}</h3>
                <p className="text-xs text-muted-foreground mt-0.5 sm:truncate lg:overflow-visible lg:text-clip lg:whitespace-normal">{address ? `${address}, ${city}` : city}</p>
              </div>
              {displayRating && (
                <div className="text-right shrink-0">
                  <div className={`inline-flex items-center justify-center min-w-[2.5rem] px-2 py-1 rounded-lg font-bold text-sm ${getRatingColor(ratingNum)}`}>{displayRating}</div>
                  <p className="text-[10px] text-muted-foreground mt-0.5">({reviewCount})</p>
                </div>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-1.5 mt-1.5 text-xs text-muted-foreground">
              <span>{cuisine}</span>
              {cuisine && <span>·</span>}
              <PriceRangeIcons range={priceRange} />
              {deliveryAvailable && (
                <>
                  <span>·</span>
                  <span className="font-semibold text-foreground">{estimatedMinutes.min}-{estimatedMinutes.max} min</span>
                </>
              )}
            </div>
            {bestDiscount > 0 && (
              <div className="mt-2">
                <Badge className="bg-miamz-green/10 text-miamz-green border-miamz-green/20 text-[10px] font-bold gap-1 hover:bg-miamz-green/20">
                  <Percent className="h-3 w-3" /> Jusqu'à -{bestDiscount}%
                </Badge>
              </div>
            )}
            <div className="flex-1" />
            {timeSlots.length > 0 && (
              <div className="flex gap-1.5 mt-3 overflow-x-auto">
                {timeSlots.map((slot) => (
                  <button key={slot} onClick={(e) => handleSlotClick(e, slot)} className="flex flex-col items-center shrink-0 group/slot">
                    <span className="px-2.5 py-1.5 rounded-lg border-2 border-miamz-green/60 text-xs font-bold text-miamz-green bg-miamz-green/5 group-hover/slot:bg-miamz-green group-hover/slot:text-white transition-colors">{slot}</span>
                    {bestDiscount > 0 && <span className="text-[9px] font-bold text-miamz-green mt-0.5">-{bestDiscount}%</span>}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
