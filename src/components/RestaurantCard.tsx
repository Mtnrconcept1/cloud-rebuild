import { useEffect, useMemo, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowRight, Bike, Clock3, Heart, MapPin, Percent, Sparkles } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { Badge } from "@/components/ui/badge";
import PriceRangeIcons from "./PriceRangeIcons";
import { trackSponsoredClick, trackImpression, trackClick } from "@/lib/analytics";
import { getSupabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import { useAuth } from "@/lib/auth-context";
import { useActiveFeatures } from "@/lib/featureFlags";
import { useToast } from "@/hooks/use-toast";
import { SponsoredBadge, SponsoredContextPill } from "@/components/campaigns/SponsoredVisual";
import SponsoredRestaurantTemplateCard from "@/components/campaigns/SponsoredRestaurantTemplateCard";
import { useSponsoredImpressionOnView } from "@/hooks/useSponsoredImpressionOnView";
import { buildRestaurantSeoPath } from "@/lib/restaurantSlugs";
import { cn } from "@/lib/utils";
import { getOptimizedImageSizes, getOptimizedImageSrcSet, getOptimizedImageUrl } from "@/lib/optimizedImages";
import type { CampaignCreativeConfig } from "@/lib/campaignCreative";
import { selectRestaurantCardReservationSlots } from "@/lib/reservationAvailability";
import { getServiceSettings } from "@/lib/serviceSettings";

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
  slug?: string | null;
  openingHours?: Json | null;
  supportsReservation?: boolean | null;
  sponsoredCampaignId?: string;
  sponsoredPromoImage?: string;
  sponsoredCampaignTitle?: string;
  sponsoredCampaignBody?: string;
  sponsoredCampaignCreative?: CampaignCreativeConfig | unknown;
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

function formatReservationCardDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

type ReservationCardProfile = {
  opening_hours: Json | null;
  supports_reservation: boolean | null;
};

type ReservationCardSlotAvailabilityRow = {
  slot_time: string;
  reserved_tables: number;
  capacity: number;
  remaining_tables: number;
  available: boolean;
};

function normalizeSlotAvailabilityRows(value: unknown): ReservationCardSlotAvailabilityRow[] {
  if (!Array.isArray(value)) return [];

  return value
    .map((row) => {
      if (!row || typeof row !== "object" || Array.isArray(row)) return null;
      const source = row as Record<string, unknown>;
      const slotTime = String(source.slot_time || "").slice(0, 5);
      if (!/^\d{2}:\d{2}$/.test(slotTime)) return null;

      return {
        slot_time: slotTime,
        reserved_tables: Math.max(0, Number(source.reserved_tables || 0)),
        capacity: Math.max(0, Number(source.capacity || 0)),
        remaining_tables: Math.max(0, Number(source.remaining_tables || 0)),
        available: Boolean(source.available),
      };
    })
    .filter((row): row is ReservationCardSlotAvailabilityRow => Boolean(row));
}

function formatDiscountPercent(discount: number): string {
  const value = Number(discount);
  if (!Number.isFinite(value) || value <= 0) return "";
  return Number.isInteger(value) ? String(value) : value.toFixed(1).replace(/\.0$/, "");
}

function getRatingColor(rating: number): string {
  if (rating >= 9) return "bg-emerald-700 text-white";
  if (rating >= 8) return "bg-emerald-700 text-white";
  if (rating >= 7) return "bg-lime-700 text-white";
  if (rating >= 6) return "bg-amber-700 text-white";
  return "bg-primary text-primary-foreground";
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
  slug,
  openingHours,
  supportsReservation,
  sponsoredCampaignId,
  sponsoredPromoImage,
  sponsoredCampaignTitle,
  sponsoredCampaignBody,
  sponsoredCampaignCreative,
}: RestaurantCardProps) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const activeFeatures = useActiveFeatures();
  const resolvedImage = getImageUrl(sponsoredPromoImage || imageUrl, cuisine);
  const optimizedImage = getOptimizedImageUrl(resolvedImage, "card");
  const optimizedSrcSet = getOptimizedImageSrcSet(resolvedImage, "card");
  const organicImpressionTracked = useRef(false);
  const isSponsored = Boolean(sponsoredCampaignId);
  const showDelivery = activeFeatures.has("livraison") && deliveryAvailable;
  const sponsoredImpressionRef = useSponsoredImpressionOnView({
    campaignId: sponsoredCampaignId,
    restaurantId: id,
    source: "restaurant_card",
    placementKey: `restaurant_card:${id}:${sponsoredCampaignId || "organic"}`,
    enabled: isSponsored && Boolean(sponsoredCampaignId),
  });

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

  const reservationCardNow = useMemo(() => new Date(), []);
  const reservationCardDate = useMemo(() => formatReservationCardDate(reservationCardNow), [reservationCardNow]);
  const hasPropOpeningHours = typeof openingHours !== "undefined";
  const hasPropSupportsReservation = typeof supportsReservation !== "undefined";
  const shouldFetchReservationProfile = !hasPropOpeningHours || !hasPropSupportsReservation;

  const { data: reservationProfile, isFetched: reservationProfileFetched } = useQuery({
    queryKey: ["restaurant-card-reservation-profile", id],
    queryFn: async (): Promise<ReservationCardProfile | null> => {
      const { data, error } = await supabase
        .from("restaurants")
        .select("opening_hours,supports_reservation")
        .eq("id", id)
        .maybeSingle();

      if (error) {
        console.warn("Restaurant card reservation profile fallback:", error.message);
        return null;
      }

      return (data as ReservationCardProfile | null) || null;
    },
    enabled: shouldFetchReservationProfile && supportsReservation !== false,
    staleTime: 60_000,
  });

  const resolvedOpeningHours = hasPropOpeningHours ? openingHours : reservationProfile?.opening_hours;
  const resolvedSupportsReservation = hasPropSupportsReservation
    ? supportsReservation
    : reservationProfile?.supports_reservation;
  const reservationProfileReady = !shouldFetchReservationProfile || reservationProfileFetched || supportsReservation === false;
  const canShowReservationSlots = reservationProfileReady && resolvedSupportsReservation === true;
  const serviceSettings = useMemo(() => getServiceSettings(resolvedOpeningHours), [resolvedOpeningHours]);

  const { data: slotAvailability = [] } = useQuery({
    queryKey: ["restaurant-card-slot-availability", id, reservationCardDate],
    queryFn: async () => {
      const { data, error } = await (supabase.rpc as any)("get_restaurant_reservation_slot_availability", {
        p_restaurant_id: id,
        p_date: reservationCardDate,
      });

      if (error) {
        console.warn("Restaurant card reservation availability fallback:", error.message);
        return [] as ReservationCardSlotAvailabilityRow[];
      }

      return normalizeSlotAvailabilityRows(data);
    },
    enabled: canShowReservationSlots,
    staleTime: 30_000,
  });

  const timeSlots = useMemo(() => {
    if (!canShowReservationSlots) return [];

    const serverAvailabilityByTime = new Map(slotAvailability.map((row) => [row.slot_time, row]));
    const reservedTablesByTime = slotAvailability.reduce<Record<string, number>>((acc, row) => {
      acc[row.slot_time] = row.reserved_tables;
      return acc;
    }, {});

    return selectRestaurantCardReservationSlots({
      serviceSettings,
      selectedDate: reservationCardNow,
      reservedTablesByTime,
      now: reservationCardNow,
      limit: 2,
    }).filter((slot) => {
      const serverSlot = serverAvailabilityByTime.get(slot.time);
      if (!serverSlot) return slotAvailability.length === 0;
      return serverSlot.available && serverSlot.remaining_tables > 0;
    });
  }, [canShowReservationSlots, reservationCardNow, serviceSettings, slotAvailability]);
  const visibleSlots = timeSlots.slice(0, 2);
  const discountPercentLabel = formatDiscountPercent(bestDiscount);
  const hasDiscount = discountPercentLabel.length > 0;
  const discountBadgeLabel = hasDiscount ? `Jusqu'à -${discountPercentLabel}%` : null;
  const discountShortLabel = hasDiscount ? `-${discountPercentLabel}%` : null;
  const estimatedMinutes = useMemo(() => {
    const base = 25 + Math.floor(Math.random() * 15);
    return { min: base, max: base + 10 };
  }, []);

  useEffect(() => {
    if (isSponsored && sponsoredCampaignId) return;
    if (organicImpressionTracked.current) return;
    organicImpressionTracked.current = true;
    if (!isSponsored) {
      trackImpression("restaurant", id);
    }
  }, [id, isSponsored, sponsoredCampaignId]);

  const handleCardClick = () => {
    if (isSponsored && sponsoredCampaignId) {
      trackSponsoredClick(sponsoredCampaignId, id, "restaurant_card");
    } else {
      trackClick("restaurant", id);
    }
    navigate(buildRestaurantSeoPath({ id, name, city, slug }));
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
    navigate(
      `/restaurant/${id}?reserve=true&date=${reservationCardDate}&time=${encodeURIComponent(slot)}&party_size=2&reservationStep=datetime&reservationSource=card_slot`,
    );
  };

  const ratingNum = Math.min(rating, 10);
  const displayRating = ratingNum > 0 ? ratingNum.toFixed(1) : null;
  const sponsoredHeading = sponsoredCampaignTitle || "Adresse mise en avant";
  const sponsoredDescription =
    sponsoredCampaignBody || `${name} profite actuellement d'une mise en avant premium sur Tok.`;

  useEffect(() => {
    organicImpressionTracked.current = false;
  }, [id]);

  if (isSponsored) {
    return (
      <div onClick={handleCardClick} className="group block h-full cursor-pointer">
        <div
          ref={sponsoredImpressionRef}
          className="h-full transition-transform duration-300 hover:-translate-y-1"
        >
          <SponsoredRestaurantTemplateCard
            creative={sponsoredCampaignCreative}
            imageUrl={optimizedImage}
            restaurantName={name}
            cuisine={cuisine}
            city={city}
            address={address}
            rating={rating}
            reviewCount={reviewCount}
            priceRange={priceRange}
            headline={sponsoredHeading}
            body={sponsoredDescription}
            discountLabel={discountBadgeLabel || undefined}
            slots={visibleSlots.map((slot) => slot.time)}
            isFavorite={Boolean(isFavorite)}
            onFavoriteClick={toggleFavorite}
            onSlotClick={handleSlotClick}
          />
        </div>
      </div>
    );
  }

  return (
    <div onClick={handleCardClick} className="group block h-full cursor-pointer">
      <div
        ref={isSponsored ? sponsoredImpressionRef : undefined}
        className={cn(
          "premium-card neon-card flex h-full flex-col overflow-hidden rounded-[26px] border transition-all duration-300 hover:-translate-y-1",
          isSponsored
            ? "neon-card-sponsored border-amber-200/80 bg-[linear-gradient(180deg,rgba(255,248,238,0.98),rgba(255,255,255,0.98))] shadow-[0_18px_46px_rgba(249,115,22,0.16)] hover:shadow-[0_24px_54px_rgba(249,115,22,0.22)]"
            : "border-border/70 bg-card/95 shadow-[0_14px_38px_rgba(15,23,42,0.08)] hover:shadow-[0_20px_48px_rgba(15,23,42,0.14)]",
        )}
      >
        {isSponsored ? (
          <>
            <div className="pointer-events-none absolute inset-x-0 top-0 z-[1] h-1.5 bg-gradient-to-r from-[#ff7a18] via-[#ffb347] to-[#ff5f6d]" />
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(251,191,36,0.18),transparent_26%),radial-gradient(circle_at_bottom_left,rgba(249,115,22,0.12),transparent_24%)]" />
          </>
        ) : null}

        <div className="relative aspect-[16/10] overflow-hidden">
          <img
            src={optimizedImage}
            srcSet={optimizedSrcSet}
            sizes={optimizedSrcSet ? getOptimizedImageSizes("card") : undefined}
            alt={name}
            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
            loading="lazy"
            decoding="async"
            height={360}
            width={576}
          />
          <div className="absolute inset-0 bg-gradient-to-t from-slate-950/60 via-slate-950/10 to-transparent dark:from-slate-950/80 dark:via-slate-950/25" />

          <div className="absolute left-3 right-14 top-3 flex flex-wrap items-start gap-1.5">
            {isSponsored ? (
              <>
                <SponsoredBadge tone="restaurant" />
                <SponsoredContextPill tone="restaurant" />
              </>
            ) : null}
            {showDelivery ? (
              <Badge className="gap-1 border-none bg-primary/95 text-[9px] font-bold uppercase text-primary-foreground shadow-sm backdrop-blur-md">
                <Bike className="h-3 w-3" /> Livraison
              </Badge>
            ) : null}
          </div>

          <button
            type="button"
            aria-label={isFavorite ? "Retirer des favoris" : "Ajouter aux favoris"}
            className="absolute right-3 top-3 grid h-9 w-9 place-items-center rounded-full bg-white/90 backdrop-blur-sm transition-colors hover:bg-white dark:border dark:border-white/20 dark:bg-slate-950/80 dark:shadow-[0_0_22px_rgba(255,255,255,0.08)] dark:hover:bg-slate-900"
            onClick={toggleFavorite}
          >
            <Heart className={isFavorite ? "h-4 w-4 fill-red-500 text-red-500" : "h-4 w-4 text-muted-foreground dark:text-white/80"} />
          </button>

          {discountBadgeLabel ? (
            <div className="absolute bottom-3 left-3 right-3 flex items-end">
              <Badge className="gap-1.5 rounded-2xl border border-white/30 bg-gradient-to-r from-[#8f2f0a] via-[#b45309] to-[#047857] px-3.5 py-2 text-[11px] font-black uppercase tracking-[0.08em] text-white shadow-[0_14px_30px_rgba(15,23,42,0.28)] ring-1 ring-black/5 backdrop-blur-md hover:brightness-105 dark:border-white/20 dark:from-[#8f2f0a] dark:via-[#b45309] dark:to-[#047857]">
                <span className="grid h-5 w-5 place-items-center rounded-full bg-white/20">
                  <Percent className="h-3.5 w-3.5" />
                </span>
                Promo {discountBadgeLabel}
              </Badge>
            </div>
          ) : null}
        </div>

        <div className="flex flex-1 flex-col p-4 sm:p-5">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1 space-y-1">
              <h3 className="font-display text-base font-bold leading-tight text-foreground transition-colors group-hover:text-primary dark:text-white dark:drop-shadow-[0_0_18px_rgba(255,255,255,0.12)]">
                {name}
              </h3>
              <div className="flex flex-wrap items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground/90 dark:text-slate-200/90">
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
                <p className="mt-1 text-[10px] text-muted-foreground dark:text-slate-300/90">({reviewCount})</p>
              </div>
            ) : null}
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-muted-foreground dark:text-slate-300">
            <span className="inline-flex items-center gap-1.5">
              <MapPin className="h-3.5 w-3.5 text-primary/75" />
              <span className="font-medium text-foreground/90 dark:text-white/90">{city}</span>
            </span>
            {showDelivery ? (
              <span className="inline-flex items-center gap-1.5">
                <Clock3 className="h-3.5 w-3.5 text-primary/75" />
                <span>{estimatedMinutes.min}-{estimatedMinutes.max} min</span>
              </span>
            ) : null}
          </div>

          {address ? (
            <p className="mt-2 line-clamp-2 text-sm leading-6 text-muted-foreground dark:text-slate-300/90">
              {address}
            </p>
          ) : (
            <p className="mt-2 text-sm leading-6 text-muted-foreground dark:text-slate-300/90">
              Ouvrez la fiche pour voir le menu, les disponibilités et les détails.
            </p>
          )}

          {isSponsored ? (
            <div className="mt-3 rounded-[22px] border border-amber-200/80 bg-[linear-gradient(135deg,rgba(255,248,230,0.95),rgba(255,255,255,0.94))] p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.72)] dark:border-amber-300/25 dark:bg-[linear-gradient(135deg,rgba(251,191,36,0.16),rgba(15,23,42,0.88))] dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.10),0_0_28px_rgba(249,115,22,0.16)]">
              <div className="flex items-start gap-3">
                <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-[#ffedd5] via-[#fff7ed] to-[#fef3c7] text-amber-600 shadow-[0_10px_22px_rgba(249,115,22,0.14)] dark:from-amber-400/25 dark:via-orange-500/20 dark:to-slate-900 dark:text-amber-200 dark:shadow-[0_0_26px_rgba(249,115,22,0.25)]">
                  <Sparkles className="h-4 w-4" />
                </div>
                <div className="min-w-0">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-amber-600 dark:text-amber-300">
                    Campagne active
                  </p>
                  <p className="mt-1 line-clamp-1 text-sm font-semibold text-slate-900 dark:text-white">
                    {sponsoredHeading}
                  </p>
                  <p className="mt-1 line-clamp-2 text-xs leading-5 text-slate-600 dark:text-slate-300">
                    {sponsoredDescription}
                  </p>
                </div>
              </div>
            </div>
          ) : null}

          <div className="mt-auto pt-4">
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={handleViewClick}
                className={cn(
                  "inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-xl px-4 text-sm font-bold text-white transition-all",
                  isSponsored
                    ? "bg-gradient-to-r from-[#8f2f0a] via-[#b45309] to-[#9a3412] shadow-[0_14px_30px_rgba(154,52,18,0.24)] hover:brightness-105"
                    : "bg-[#21314b] shadow-[0_10px_24px_rgba(33,49,75,0.22)] hover:bg-[#2a3d5d] dark:bg-gradient-to-r dark:from-slate-100 dark:to-white dark:text-slate-950 dark:shadow-[0_0_32px_rgba(255,255,255,0.16)] dark:hover:brightness-110",
                )}
              >
                {isSponsored ? "Découvrir l'offre" : "Voir le restaurant"}
                <ArrowRight className="h-4 w-4" />
              </button>
              {visibleSlots.map((slot) => (
                <button
                  key={slot.time}
                  type="button"
                  onClick={(e) => handleSlotClick(e, slot.time)}
                  className={cn(
                    "inline-flex min-w-[4.75rem] items-center justify-center rounded-xl border px-3.5 font-bold transition-colors",
                    hasDiscount
                      ? "h-12 flex-col gap-0.5 border-emerald-500 bg-emerald-600 text-white shadow-[0_12px_24px_rgba(16,185,129,0.22)] hover:bg-emerald-700 dark:border-emerald-300/60 dark:bg-emerald-500 dark:text-slate-950"
                      : "h-11 border-emerald-500/35 bg-emerald-50 text-sm text-emerald-700 hover:border-emerald-500 hover:bg-emerald-500 hover:text-white dark:bg-emerald-400/10 dark:text-emerald-200 dark:shadow-[0_0_20px_rgba(16,185,129,0.14)]",
                  )}
                >
                  <span className="text-sm leading-none">{slot.time}</span>
                  {discountShortLabel ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-white/95 px-1.5 py-0.5 text-[10px] leading-none text-emerald-700 shadow-sm dark:bg-slate-950/90 dark:text-emerald-200">
                      <Percent className="h-2.5 w-2.5" />
                      {discountShortLabel}
                    </span>
                  ) : null}
                </button>
              ))}
            </div>
            {timeSlots.length > 0 ? (
              <p className="mt-2 text-xs text-muted-foreground dark:text-slate-300/90">
                {hasDiscount
                  ? "Créneaux promo visibles. Plus d'options sur la fiche."
                  : "Prochains créneaux visibles. Plus d'options sur la fiche."}
              </p>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
