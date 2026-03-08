import { Leaf, Clock, MapPin, Star, Gift, Heart, Zap } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Link } from "react-router-dom";
import CountdownTimer from "@/components/CountdownTimer";

interface AntiWasteCardProps {
  title: string;
  restaurant: string;
  restaurantId?: string;
  restaurantCity?: string;
  restaurantRating?: number;
  restaurantImageUrl?: string;
  originalPrice: number;
  discountedPrice: number;
  pickupStart: string;
  pickupEnd: string;
  imageUrl: string;
  quantityAvailable: number;
  offerType?: 'regular' | 'surprise_bag' | 'solidarity' | 'flash_alert';
  availableDate?: string;
  isFlash?: boolean;
}

const CUISINE_IMAGES: Record<string, string> = {
  panier: "https://images.unsplash.com/photo-1606787366850-de6330128bfc?w=600&h=450&fit=crop",
  surprise: "https://images.unsplash.com/photo-1504674900247-0877df9cc836?w=600&h=450&fit=crop",
  boulangerie: "https://images.unsplash.com/photo-1509440159596-0249088772ff?w=600&h=450&fit=crop",
  pâtisserie: "https://images.unsplash.com/photo-1558961363-fa8fdf82db35?w=600&h=450&fit=crop",
  sushi: "https://images.unsplash.com/photo-1579871494447-9811cf80d66c?w=600&h=450&fit=crop",
  pizza: "https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?w=600&h=450&fit=crop",
  burger: "https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=600&h=450&fit=crop",
  salade: "https://images.unsplash.com/photo-1512621776951-a57141f2eefd?w=600&h=450&fit=crop",
  default: "https://images.unsplash.com/photo-1504674900247-0877df9cc836?w=600&h=450&fit=crop",
};

function getBestImage(offerImage: string, restaurantImage?: string, title?: string): string {
  if (offerImage && !offerImage.includes("unsplash.com/photo-1504674900247")) return offerImage;
  if (restaurantImage) return restaurantImage;
  if (title) {
    const lower = title.toLowerCase();
    for (const [key, url] of Object.entries(CUISINE_IMAGES)) {
      if (lower.includes(key)) return url;
    }
  }
  return CUISINE_IMAGES.default;
}

export default function AntiWasteCard({
  title, restaurant, restaurantId, restaurantCity, restaurantRating, restaurantImageUrl,
  originalPrice, discountedPrice, pickupStart, pickupEnd, imageUrl, quantityAvailable,
  offerType, availableDate, isFlash,
}: AntiWasteCardProps) {
  const discount = Math.round((1 - discountedPrice / originalPrice) * 100);
  const resolvedImage = getBestImage(imageUrl, restaurantImageUrl, title);
  const flashTarget = (isFlash && availableDate && pickupEnd) ? new Date(`${availableDate}T${pickupEnd}`) : null;
  const showCountdown = flashTarget && flashTarget.getTime() > Date.now();

  const content = (
    <div className="premium-card rounded-2xl bg-card border shadow-sm h-full flex flex-col">
      <div className="aspect-[4/3] overflow-hidden relative shrink-0">
        <img src={resolvedImage} alt={title} className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-110" loading="lazy" />
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
        <div className="absolute top-3 left-3">
          {offerType === 'surprise_bag' ? (
            <Badge className="bg-purple-600/90 backdrop-blur-md text-white gap-1 border-none shadow-lg uppercase font-bold text-[10px]"><Gift className="h-3 w-3" />Surprise</Badge>
          ) : offerType === 'solidarity' ? (
            <Badge className="bg-rose-600/90 backdrop-blur-md text-white gap-1 border-none shadow-lg uppercase font-bold text-[10px]"><Heart className="h-3 w-3" />Solidaire</Badge>
          ) : offerType === 'flash_alert' ? (
            <Badge className="bg-amber-600/90 backdrop-blur-md text-white gap-1 border-none shadow-lg uppercase font-bold text-[10px]"><Zap className="h-3 w-3" />Flash</Badge>
          ) : (
            <Badge className="bg-emerald-600/90 backdrop-blur-md text-white gap-1 border-none shadow-lg uppercase font-bold text-[10px]"><Leaf className="h-3 w-3" />-{discount}%</Badge>
          )}
        </div>
        {quantityAvailable <= 3 && (
          <Badge variant="destructive" className="absolute top-3 right-3 text-[10px] font-black uppercase shadow-lg animate-pulse">Plus que {quantityAvailable}!</Badge>
        )}
      </div>
      <div className="p-4 flex-1 flex flex-col justify-between space-y-3">
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <p className="text-[10px] text-primary font-black uppercase tracking-widest truncate max-w-[120px]">{restaurant}</p>
            {restaurantRating && restaurantRating > 0 && (
              <div className="flex items-center gap-1 bg-amber-400/10 px-1.5 py-0.5 rounded-md">
                <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
                <span className="text-[10px] font-bold text-amber-600">{restaurantRating.toFixed(1)}</span>
              </div>
            )}
          </div>
          <h3 className="font-display font-bold text-base leading-tight group-hover:text-primary transition-colors line-clamp-2">{title}</h3>
          {restaurantCity && (
            <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
              <MapPin className="h-3 w-3 text-primary/60" /><span>{restaurantCity}</span>
            </div>
          )}
        </div>
        <div className="space-y-3 pt-2">
          <div className="flex items-center justify-between">
            <div className="flex items-baseline gap-1.5">
              <span className="text-xl font-black text-foreground">{discountedPrice.toFixed(2)}</span>
              <span className="text-xs font-bold text-muted-foreground uppercase">CHF</span>
              <span className="text-xs text-muted-foreground/60 line-through ml-1">{originalPrice.toFixed(2)}</span>
            </div>
          </div>
          {showCountdown ? (
            <CountdownTimer targetDate={flashTarget!} variant="default" color="amber" label="Expire dans" />
          ) : (
            <div className="flex items-center gap-2 p-2 rounded-xl bg-secondary/30 border border-secondary/50">
              <Clock className="h-3.5 w-3.5 text-primary" />
              <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-tight">Retrait {pickupStart} - {pickupEnd}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );

  if (restaurantId) {
    return <Link to={`/restaurant/${restaurantId}`} className="group block">{content}</Link>;
  }
  return <div className="group block">{content}</div>;
}
