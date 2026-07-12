import { Clock, Gift, Heart, Leaf, MapPin, ShoppingCart, Star, Zap } from "lucide-react";
import { Link } from "react-router-dom";

import CountdownTimer from "@/components/CountdownTimer";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { parseBusinessDateTime } from "@/lib/businessTime";
import { useCart } from "@/lib/cart-context";
import { getOptimizedImageUrl } from "@/lib/optimizedImages";

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
  offerType?: "regular" | "surprise_bag" | "solidarity" | "flash_alert";
  availableDate?: string;
  isFlash?: boolean;
  offerId?: string;
}

const CUISINE_IMAGES: Record<string, string> = {
  panier: "/images/lebanese-mezze.jpeg",
  surprise: "/images/mixed-grill-platter.jpeg",
  boulangerie: "/images/stack-shake-spread.jpeg",
  pâtisserie: "/images/octopus-fine-dining.jpeg",
  sushi: "/images/poke-bowls.jpeg",
  pizza: "/images/pasta-assortment.jpeg",
  burger: "/images/smash-burgers.jpeg",
  salade: "/images/poke-bowls.jpeg",
  default: "/images/kebab-box-spread.jpeg",
};

function getBestImage(offerImage: string, restaurantImage?: string, title?: string): string {
  const directOfferImage = offerImage?.trim();
  if (directOfferImage) return directOfferImage;
  const directRestaurantImage = restaurantImage?.trim();
  if (directRestaurantImage) return directRestaurantImage;

  const normalizedTitle = title?.toLowerCase() || "";
  for (const [key, url] of Object.entries(CUISINE_IMAGES)) {
    if (key !== "default" && normalizedTitle.includes(key)) return url;
  }
  return CUISINE_IMAGES.default;
}

function formatAvailableDate(value?: string) {
  if (!value) return "";
  const parsed = new Date(`${value}T12:00:00Z`);
  if (!Number.isFinite(parsed.getTime())) return value;
  return parsed.toLocaleDateString("fr-CH", {
    timeZone: "Europe/Zurich",
    day: "2-digit",
    month: "short",
  });
}

export default function AntiWasteCard({
  title,
  restaurant,
  restaurantId,
  restaurantCity,
  restaurantRating,
  restaurantImageUrl,
  originalPrice,
  discountedPrice,
  pickupStart,
  pickupEnd,
  imageUrl,
  quantityAvailable,
  offerType,
  availableDate,
  isFlash,
  offerId,
}: AntiWasteCardProps) {
  const safeOriginalPrice = Number.isFinite(originalPrice) && originalPrice > 0 ? originalPrice : 0;
  const safeDiscountedPrice = Number.isFinite(discountedPrice) && discountedPrice >= 0 ? discountedPrice : 0;
  const discount = safeOriginalPrice > 0
    ? Math.max(0, Math.min(100, Math.round((1 - safeDiscountedPrice / safeOriginalPrice) * 100)))
    : 0;
  const resolvedImage = getBestImage(imageUrl, restaurantImageUrl, title);
  const optimizedImage = getOptimizedImageUrl(resolvedImage, "card");
  const flashTarget = isFlash && availableDate && pickupEnd
    ? parseBusinessDateTime(availableDate, pickupEnd)
    : null;
  const showCountdown = Boolean(flashTarget && flashTarget.getTime() > Date.now());
  const { items, addItem } = useCart();
  const { toast } = useToast();
  const stock = Math.max(0, Math.trunc(Number(quantityAvailable) || 0));
  const quantityInCart = offerId
    ? items
      .filter((item) => item.metadata?.anti_waste_offer_id === offerId)
      .reduce((total, item) => total + Math.max(0, Number(item.quantity) || 0), 0)
    : 0;
  const soldOutForCart = stock === 0 || quantityInCart >= stock;

  const handleAddToCart = () => {
    if (!restaurantId || soldOutForCart) return;
    addItem({
      menuItemId: `antigaspi-${offerId || title}`,
      name: `[Anti-gaspi] ${title}`,
      price: safeDiscountedPrice,
      restaurantId,
      restaurantName: restaurant,
      metadata: {
        is_anti_waste: true,
        anti_waste_offer_id: offerId,
        offer_id: offerId,
        original_price: safeOriginalPrice,
        pickup_start: pickupStart,
        pickup_end: pickupEnd,
        available_date: availableDate || null,
        delivery_available: false,
        takeaway_available: true,
      },
    });
    toast({
      title: "Ajouté au panier !",
      description: `${title} — ${safeDiscountedPrice.toFixed(2)} CHF (à emporter)`,
    });
  };

  return (
    <article className="group premium-card flex h-full flex-col rounded-2xl border bg-card shadow-sm">
      <div className="relative aspect-[4/3] shrink-0 overflow-hidden rounded-t-2xl">
        <img
          src={optimizedImage}
          alt={`${title} – offre anti-gaspi de ${restaurant}`}
          className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
          loading="lazy"
          decoding="async"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/20 to-transparent opacity-0 transition-opacity group-hover:opacity-100" />
        <div className="absolute left-3 top-3">
          {offerType === "surprise_bag" ? (
            <Badge className="gap-1 border-none bg-purple-600/90 text-[10px] font-bold uppercase text-white shadow-lg"><Gift className="h-3 w-3" />Surprise</Badge>
          ) : offerType === "solidarity" ? (
            <Badge className="gap-1 border-none bg-rose-600/90 text-[10px] font-bold uppercase text-white shadow-lg"><Heart className="h-3 w-3" />Solidaire</Badge>
          ) : offerType === "flash_alert" ? (
            <Badge className="gap-1 border-none bg-amber-600/90 text-[10px] font-bold uppercase text-white shadow-lg"><Zap className="h-3 w-3" />Flash</Badge>
          ) : (
            <Badge className="gap-1 border-none bg-emerald-600/90 text-[10px] font-bold uppercase text-white shadow-lg"><Leaf className="h-3 w-3" />{discount > 0 ? `-${discount}%` : "Anti-gaspi"}</Badge>
          )}
        </div>
        {stock <= 3 ? (
          <Badge variant="destructive" className="absolute right-3 top-3 text-[10px] font-black uppercase shadow-lg">Plus que {stock} !</Badge>
        ) : null}
      </div>

      <div className="flex flex-1 flex-col justify-between space-y-3 p-4">
        <div className="space-y-1.5">
          <div className="flex items-center justify-between gap-2">
            <p className="min-w-0 truncate text-[10px] font-black uppercase tracking-widest text-primary">{restaurant}</p>
            {restaurantRating && restaurantRating > 0 ? (
              <div className="flex shrink-0 items-center gap-1 rounded-md bg-amber-400/10 px-1.5 py-0.5">
                <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
                <span className="text-[10px] font-bold text-amber-600">{restaurantRating.toFixed(1)}</span>
              </div>
            ) : null}
          </div>
          <h3 className="line-clamp-2 break-words font-display text-base font-bold leading-tight transition-colors group-hover:text-primary">{title}</h3>
          {restaurantCity ? (
            <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
              <MapPin className="h-3 w-3 text-primary/60" /><span>{restaurantCity}</span>
            </div>
          ) : null}
        </div>

        <div className="space-y-3 pt-2">
          <div className="flex min-w-0 flex-wrap items-baseline gap-1.5">
            <span className="text-xl font-black tabular-nums text-foreground">{safeDiscountedPrice.toFixed(2)}</span>
            <span className="text-xs font-bold uppercase text-muted-foreground">CHF</span>
            {safeOriginalPrice > 0 ? <span className="ml-1 text-xs tabular-nums text-muted-foreground/60 line-through">{safeOriginalPrice.toFixed(2)}</span> : null}
          </div>

          {showCountdown ? (
            <CountdownTimer targetDate={flashTarget!} variant="default" color="amber" label="Expire dans" />
          ) : (
            <div className="flex items-center gap-2 rounded-xl border border-secondary/50 bg-secondary/30 p-2">
              <Clock className="h-3.5 w-3.5 shrink-0 text-primary" />
              <span className="break-words text-[10px] font-bold uppercase tracking-tight text-muted-foreground">
                Retrait {formatAvailableDate(availableDate)} · {pickupStart}–{pickupEnd}
              </span>
            </div>
          )}

          <div className="grid gap-2 sm:grid-cols-2">
            {restaurantId ? (
              <Button asChild size="sm" variant="outline" className="w-full">
                <Link to={`/restaurant/${restaurantId}`}>Voir le restaurant</Link>
              </Button>
            ) : null}
            {restaurantId ? (
              <Button
                type="button"
                onClick={handleAddToCart}
                size="sm"
                disabled={soldOutForCart}
                className="w-full gap-2 bg-emerald-600 text-white hover:bg-emerald-700"
              >
                <ShoppingCart className="h-4 w-4" />
                {soldOutForCart ? "Stock atteint" : "Ajouter"}
              </Button>
            ) : null}
          </div>
        </div>
      </div>
    </article>
  );
}
