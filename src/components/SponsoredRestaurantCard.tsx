import { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { Star, Bike, MapPin, Megaphone } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import PriceRangeIcons from "./PriceRangeIcons";
import { trackSponsoredClick, trackSponsoredImpression } from "@/lib/analytics";

const CUISINE_FALLBACKS: Record<string, string> = {
  italien: "/images/pasta-assortment.jpeg",
  pizza: "/images/pasta-assortment.jpeg",
  pâtes: "/images/pasta-assortment.jpeg",
  japonais: "/images/poke-bowls.jpeg",
  sushi: "/images/poke-bowls.jpeg",
  poke: "/images/poke-bowls.jpeg",
  burger: "/images/smash-burgers.jpeg",
  hamburger: "/images/gourmet-burgers.jpeg",
  français: "/images/octopus-fine-dining.jpeg",
  gastronomique: "/images/octopus-fine-dining.jpeg",
  chinois: "/images/thai-pad-thai.jpeg",
  asiatique: "/images/thai-pad-thai.jpeg",
  thaï: "/images/thai-spread.jpeg",
  thai: "/images/thai-curry-spread.jpeg",
  indien: "/images/indian-curry-bowls.jpeg",
  curry: "/images/indian-curry-bowls.jpeg",
  kebab: "/images/kebab-box-spread.jpeg",
  turc: "/images/doner-kebab-plate.jpeg",
  döner: "/images/doner-kebab-plate.jpeg",
  mexicain: "/images/mixed-grill-platter.jpeg",
  poulet: "/images/chicken-bucket-fries.jpeg",
  chicken: "/images/crispy-chicken.jpeg",
  rôtisserie: "/images/rotisserie-chicken.jpeg",
  libanais: "/images/lebanese-mezze.jpeg",
  grec: "/images/greek-gyros.jpeg",
  méditerranéen: "/images/lebanese-mezze.jpeg",
  poisson: "/images/lobster-roll-fries.jpeg",
  "fruits de mer": "/images/lobster-roll-fries.jpeg",
  américain: "/images/burgers-wings.jpeg",
  wings: "/images/burgers-wings.jpeg",
  "fast food": "/images/stack-shake-spread.jpeg",
  salade: "/images/poke-bowls.jpeg",
  healthy: "/images/poke-bowls.jpeg",
  grill: "/images/mixed-grill-platter.jpeg",
  viande: "/images/mixed-grill-platter.jpeg",
  marocain: "/images/indian-feast.jpeg",
  oriental: "/images/lebanese-mezze.jpeg",
  default: "/images/mixed-grill-platter.jpeg",
};

function getCuisineImage(cuisine: string): string {
  if (cuisine) {
    const lower = cuisine.toLowerCase();
    for (const [key, url] of Object.entries(CUISINE_FALLBACKS)) {
      if (key !== "default" && lower.includes(key)) return url;
    }
  }
  return CUISINE_FALLBACKS.default;
}

interface SponsoredRestaurantCardProps { id: string; name: string; cuisine: string; rating: number; reviewCount: number; imageUrl: string; priceRange: number; deliveryAvailable: boolean; city: string; campaignId: string; promoText?: string; promoImage?: string; }

export default function SponsoredRestaurantCard({ id, name, cuisine, rating, reviewCount, imageUrl, priceRange, deliveryAvailable, city, campaignId, promoText, promoImage }: SponsoredRestaurantCardProps) {
  const navigate = useNavigate();
  const displayImage = getCuisineImage(cuisine);
  const impressionTracked = useRef(false);

  useEffect(() => { if (impressionTracked.current) return; impressionTracked.current = true; trackSponsoredImpression(campaignId, id, "sponsored_restaurant_card"); }, [campaignId, id]);
  const handleClick = () => { trackSponsoredClick(campaignId, id, "sponsored_restaurant_card"); navigate(`/restaurant/${id}`); };

  return (
    <div onClick={handleClick} className="group block cursor-pointer h-full">
      <div className="h-full rounded-2xl bg-card border-2 border-amber-300/60 shadow-md ring-1 ring-amber-200/30 relative overflow-hidden">
        <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-amber-400 via-orange-400 to-amber-400 z-10" />
        <div className="aspect-[16/10] sm:aspect-[6/4] overflow-hidden relative">
          <img src={displayImage} alt={name} className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-110" loading="lazy" />
          <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
          <div className="absolute top-2 left-2 sm:top-3 sm:left-3 flex flex-wrap gap-1.5 sm:flex-col sm:gap-2 max-w-[85%]">
            <Badge className="bg-amber-500/90 backdrop-blur-md text-white text-[9px] sm:text-[10px] gap-1 shadow-sm border-none uppercase font-bold"><Megaphone className="h-3 w-3" />Sponsorisé</Badge>
            {deliveryAvailable && <Badge className="bg-primary/90 backdrop-blur-md text-white text-[9px] sm:text-[10px] gap-1 shadow-sm border-none uppercase font-bold"><Bike className="h-3 w-3" />Livraison</Badge>}
          </div>
        </div>
        <div className="p-3 sm:p-4 space-y-2">
          {promoText && <p className="text-xs font-medium text-amber-600 bg-amber-50 dark:bg-amber-900/20 px-2 py-1 rounded-lg">{promoText}</p>}
          <div className="flex items-start justify-between">
            <h3 className="font-display font-bold text-sm sm:text-base leading-tight group-hover:text-primary transition-colors">{name}</h3>
            {rating > 0 && <div className="flex items-center gap-1 bg-amber-400/10 px-2 py-0.5 rounded-lg shrink-0"><Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" /><span className="font-bold text-xs text-amber-600">{rating.toFixed(1)}</span></div>}
          </div>
          <div className="flex flex-wrap items-center gap-2 text-[11px] sm:text-xs text-muted-foreground font-medium uppercase tracking-tighter"><span className="break-words">{cuisine}</span>{cuisine && <span>·</span>}<PriceRangeIcons range={priceRange} /></div>
          <div className="flex items-center justify-between pt-1">
            <div className="flex items-center gap-1 text-[11px] text-muted-foreground"><MapPin className="h-3 w-3 text-primary/60" /><span>{city}</span></div>
            <div className="text-[10px] font-bold text-amber-600 uppercase opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">Découvrir →</div>
          </div>
        </div>
      </div>
    </div>
  );
}
