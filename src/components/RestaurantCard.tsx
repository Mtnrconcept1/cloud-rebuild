import { useEffect, useMemo, useRef } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowRight, Bike, Heart, MapPin, Percent, Sparkles } from "lucide-react";
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
import { getConfiguredServiceSettings } from "@/lib/serviceSettings";
import { useCommercialDemoFrame } from "@/components/commercial/CommercialDemoFrameProvider";

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
  distanceKm?: number | null;
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
  default: "/images/tok-restaurant-placeholder.svg",
};

function normalizeCuisine(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function formatDistance(distanceKm: number | null | undefined) {
  if (distanceKm === null || distanceKm === undefined || !Number.isFinite(distanceKm) || distanceKm < 0) {
    return "";
  }
  if (distanceKm < 1) return `${Math.round(distanceKm * 1000)} m`;
  return `${new Intl.NumberFormat("fr-CH", { maximumFractionDigits: 1 }).format(distanceKm)} km`;
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

// White on lime-500/amber-400 sat around 2:1 — unreadable on a chip this small.
// Mid-range scores now use dark ink on the tint instead.
function getRatingColor(rating: number): string {
  if (rating >= 9) return "bg-emerald-600 text-white";
  if (rating >= 8) return "bg-emerald-500 text-white";
  if (rating >= 7) return "bg-lime-200 text-lime-900 dark:bg-lime-500/25 dark:text-lime-100";
  if (rating >= 6) return "bg-amber-200 text-amber-900 dark:bg-amber-500/25 dark:text-amber-100";
  return "bg-orange-200 text-orange-900 dark:bg-orange-500/25 dark:text-orange-100";
}

function stopNestedCardAction(event: React.SyntheticEvent) {
  event.stopPropagation();
}

function isNestedCardActionTarget(target: EventTarget | null) {
  return target instanceof Element && Boolean(target.closest("[data-card-action]"));
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
  distanceKm,
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
  const distanceLabel = formatDistance(distanceKm);
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const commercialDemoFrame = useCommercialDemoFrame();
  const isCommercialDemoClient = commercialDemoFrame?.surface === "client";
  const demoSessionKey = isCommercialDemoClient ? commercialDemoFrame.config.sessionId : "production";
  const globalActiveFeatures = useActiveFeatures({ enabled: !isCommercialDemoClient });
  const activeFeatures = isCommercialDemoClient
    ? new Set(commercialDemoFrame.snapshot.active_features)
    : globalActiveFeatures;
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
    enabled: !isCommercialDemoClient && isSponsored && Boolean(sponsoredCampaignId),
  });

  const { data: isFavorite } = useQuery({
    queryKey: ["favorite", id, user?.id, demoSessionKey],
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
    enabled: Boolean(user && !isCommercialDemoClient),
  });

  const toggleFavorite = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isCommercialDemoClient) {
      toast({ title: "Favori simulé", description: "Le compte et les favoris de production restent inchangés." });
      return;
    }
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
    queryKey: ["restaurant-best-discount", id, demoSessionKey],
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
    enabled: !isCommercialDemoClient,
  });

  const reservationCardNow = useMemo(() => new Date(), []);
  const reservationCardDate = useMemo(() => formatReservationCardDate(reservationCardNow), [reservationCardNow]);
  const hasPropOpeningHours = typeof openingHours !== "undefined";
  const hasPropSupportsReservation = typeof supportsReservation !== "undefined";
  const shouldFetchReservationProfile = !hasPropOpeningHours || !hasPropSupportsReservation;

  const { data: reservationProfile, isFetched: reservationProfileFetched } = useQuery({
    queryKey: ["restaurant-card-reservation-profile", id, demoSessionKey],
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
    enabled: !isCommercialDemoClient && shouldFetchReservationProfile && supportsReservation !== false,
    staleTime: 60_000,
  });

  const resolvedOpeningHours = hasPropOpeningHours ? openingHours : reservationProfile?.opening_hours;
  const resolvedSupportsReservation = hasPropSupportsReservation
    ? supportsReservation
    : reservationProfile?.supports_reservation;
  const reservationProfileReady = !shouldFetchReservationProfile || reservationProfileFetched || supportsReservation === false;
  const serviceSettings = useMemo(() => getConfiguredServiceSettings(resolvedOpeningHours), [resolvedOpeningHours]);
  const canShowReservationSlots = reservationProfileReady && resolvedSupportsReservation === true && serviceSettings !== null;

  const { data: slotAvailability = [], isError: slotAvailabilityError } = useQuery({
    queryKey: ["restaurant-card-slot-availability", id, reservationCardDate, demoSessionKey],
    queryFn: async () => {
      const { data, error } = await (supabase.rpc as any)("get_restaurant_reservation_slot_availability", {
        p_restaurant_id: id,
        p_date: reservationCardDate,
      });

      if (error) {
        throw new Error(error.message);
      }

      return normalizeSlotAvailabilityRows(data);
    },
    enabled: !isCommercialDemoClient && canShowReservationSlots,
    staleTime: 30_000,
    retry: 1,
  });

  const timeSlots = useMemo(() => {
    if (!canShowReservationSlots || !serviceSettings || slotAvailabilityError) return [];

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
      if (!serverSlot) return false;
      return serverSlot.available && serverSlot.remaining_tables > 0;
    });
  }, [canShowReservationSlots, reservationCardNow, serviceSettings, slotAvailability, slotAvailabilityError]);
  const visibleSlots = timeSlots.slice(0, 2);
  const discountPercentLabel = formatDiscountPercent(bestDiscount);
  const hasDiscount = discountPercentLabel.length > 0;
  const discountBadgeLabel = hasDiscount ? `Jusqu’à -${discountPercentLabel}%` : null;
  const discountShortLabel = hasDiscount ? `-${discountPercentLabel}%` : null;
  useEffect(() => {
    if (isCommercialDemoClient) return;
    if (isSponsored && sponsoredCampaignId) return;
    if (organicImpressionTracked.current) return;
    organicImpressionTracked.current = true;
    if (!isSponsored) {
      trackImpression("restaurant", id);
    }
  }, [id, isCommercialDemoClient, isSponsored, sponsoredCampaignId]);

  const restaurantPath = buildRestaurantSeoPath({ id, name, city, slug });

  const trackRestaurantNavigation = () => {
    if (isCommercialDemoClient) return;
    if (isSponsored && sponsoredCampaignId) {
      trackSponsoredClick(sponsoredCampaignId, id, "restaurant_card");
    } else {
      trackClick("restaurant", id);
    }
  };

  const handleCardClick = (event?: React.MouseEvent) => {
    if (event && isNestedCardActionTarget(event.target)) return;
    trackRestaurantNavigation();
    navigate(restaurantPath);
  };

  const handleRestaurantLinkClick = (event: React.MouseEvent<HTMLAnchorElement>) => {
    stopNestedCardAction(event);
    trackRestaurantNavigation();
  };

  const handleSlotClick = (e: React.MouseEvent, slot: string) => {
    stopNestedCardAction(e);
    if (isSponsored && sponsoredCampaignId) {
      trackSponsoredClick(sponsoredCampaignId, id, "restaurant_card_slot");
    }
    navigate(
      `${restaurantPath}?reserve=true&date=${reservationCardDate}&time=${encodeURIComponent(slot)}&party_size=2&reservationStep=datetime&reservationSource=card_slot`,
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
          className="h-full transition-transform duration-base ease-out-soft hover:-translate-y-1"
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
          "premium-card neon-card flex h-full flex-col overflow-hidden rounded-[26px] border",
          isSponsored
            ? "neon-card-sponsored border-amber-300/70 bg-[linear-gradient(180deg,#fffaf2,#ffffff)] shadow-lg"
            : "border-border bg-card shadow-md",
        )}
      >
        {isSponsored ? (
          <>
            <div className="pointer-events-none absolute inset-x-0 top-0 z-[1] h-1.5 bg-[linear-gradient(90deg,hsl(var(--brand)),hsl(38_95%_58%)_52%,hsl(var(--primary)))]" />
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(251,191,36,0.16),transparent_28%),radial-gradient(circle_at_bottom_left,rgba(249,115,22,0.10),transparent_26%)]" />
          </>
        ) : null}

        <div className="relative aspect-[16/10] overflow-hidden">
          <img
            src={optimizedImage}
            width={640}
            height={400}
            srcSet={optimizedSrcSet}
            sizes={optimizedSrcSet ? getOptimizedImageSizes("card") : undefined}
            alt={name}
            className="h-full w-full object-cover transition-transform duration-700 ease-out-soft group-hover:scale-[1.07]"
            loading="lazy"
            decoding="async"
          />
          <div className="absolute inset-0 bg-[linear-gradient(to_top,rgba(14,11,9,0.70)_0%,rgba(14,11,9,0.18)_38%,transparent_72%)]" />

          <div className="absolute left-3 right-14 top-3 flex flex-wrap items-start gap-1.5">
            {isSponsored ? (
              <>
                <SponsoredBadge tone="restaurant" />
                <SponsoredContextPill tone="restaurant" />
              </>
            ) : null}
            {showDelivery ? (
              <Badge className="gap-1 border-none bg-primary text-[9px] font-bold uppercase tracking-[0.06em] text-primary-foreground shadow-md">
                <Bike className="h-3 w-3" /> Livraison
              </Badge>
            ) : null}
          </div>

          <button
            className="absolute right-3 top-3 grid h-9 w-9 place-items-center rounded-full border border-white/50 bg-white/85 shadow-sm backdrop-blur-md transition-[background-color,transform] duration-fast ease-out-soft hover:scale-105 hover:bg-white active:scale-95 dark:border-white/15 dark:bg-slate-950/70 dark:hover:bg-slate-900"
            onClick={toggleFavorite}
          >
            <Heart className={isFavorite ? "h-4 w-4 fill-rose-500 text-rose-500" : "h-4 w-4 text-slate-600 dark:text-white/80"} />
          </button>

          {discountBadgeLabel ? (
            <div className="absolute bottom-3 left-3 right-3 flex items-end">
              <Badge className="gap-1.5 rounded-2xl border border-white/25 bg-brand-gradient px-3.5 py-2 text-[11px] font-black uppercase tracking-[0.08em] text-primary-foreground shadow-brand">
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
              <h3 className="font-display text-[1.0625rem] font-bold leading-tight tracking-[-0.02em] text-foreground transition-colors duration-fast ease-out-soft group-hover:text-primary">
                <Link
                  to={restaurantPath}
                  data-card-action="restaurant-link"
                  onClick={handleRestaurantLinkClick}
                  className="rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                >
                  {name}
                </Link>
              </h3>
              <div className="flex flex-wrap items-center gap-2 text-[10.5px] font-bold uppercase tracking-[0.16em] text-muted-foreground">
                {cuisine ? <span className="max-w-full truncate">{cuisine}</span> : null}
                {cuisine ? <span aria-hidden="true" className="h-3 w-px bg-border-strong" /> : null}
                <PriceRangeIcons range={priceRange} />
              </div>
            </div>

            {displayRating ? (
              <div className="shrink-0 text-right">
                <div data-numeric
                  className={`inline-flex min-w-[2.7rem] items-center justify-center rounded-xl px-2.5 py-1.5 text-sm font-bold ${getRatingColor(ratingNum)}`}>
                  {displayRating}
                </div>
                <p className="mt-1 text-[10px] font-medium text-muted-foreground" data-numeric>({reviewCount})</p>
              </div>
            ) : null}
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1.5">
              <MapPin className="h-3.5 w-3.5 text-primary/75" />
              <span className="font-semibold text-foreground/90">
                {city}{distanceLabel ? ` · ${distanceLabel}` : ""}
              </span>
            </span>
          </div>

          {address ? (
            <p className="mt-2 line-clamp-2 text-sm leading-6 text-muted-foreground">
              {address}
            </p>
          ) : (
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              Ouvrez la fiche pour voir le menu, les disponibilités et les détails.
            </p>
          )}

          {isSponsored ? (
            <div className="mt-3 rounded-[22px] border border-amber-300/50 bg-[linear-gradient(135deg,#fffaeb,#ffffff)] p-3 shadow-inset-top dark:border-amber-300/20 dark:bg-[linear-gradient(135deg,rgba(251,191,36,0.12),hsl(24_15%_10%))]">
              <div className="flex items-start gap-3">
                <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-amber-100 via-orange-50 to-amber-50 text-amber-600 shadow-sm dark:from-amber-400/20 dark:via-orange-500/15 dark:to-transparent dark:text-amber-200">
                  <Sparkles className="h-4 w-4" />
                </div>
                <div className="min-w-0">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-amber-600 dark:text-amber-300">
                    Campagne active
                  </p>
                  <p className="mt-1 line-clamp-1 text-sm font-semibold text-foreground">
                    {sponsoredHeading}
                  </p>
                  <p className="mt-1 line-clamp-2 text-xs leading-5 text-muted-foreground">
                    {sponsoredDescription}
                  </p>
                </div>
              </div>
            </div>
          ) : null}

          <div className="mt-auto pt-4">
            <div className="flex flex-wrap items-center gap-2">
              <Link
                to={restaurantPath}
                data-card-action="restaurant-view"
                onClick={handleRestaurantLinkClick}
                className={cn(
                  "inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-xl px-4 text-sm font-bold transition-[background-color,box-shadow,transform,filter] duration-base ease-out-soft active:translate-y-px",
                  isSponsored
                    ? "bg-brand-gradient text-primary-foreground shadow-brand hover:brightness-110"
                    : "bg-foreground text-background shadow-md hover:shadow-lg hover:brightness-110",
                )}
              >
                {isSponsored ? "Découvrir l'offre" : "Voir le restaurant"}
                <ArrowRight className="h-4 w-4 transition-transform duration-base ease-out-soft group-hover:translate-x-0.5" />
              </Link>
              {visibleSlots.map((slot) => (
                <button
                  key={slot.time}
                  type="button"
                  aria-label={`Réserver ${name} à ${slot.time}`}
                  data-card-action="reservation-slot"
                  data-reservation-slot={slot.time}
                  data-testid="restaurant-card-reservation-slot"
                  onPointerDown={stopNestedCardAction}
                  onMouseDown={stopNestedCardAction}
                  onTouchStart={stopNestedCardAction}
                  onClick={(e) => handleSlotClick(e, slot.time)}
                  className={cn(
                    "relative z-20 inline-flex min-w-[4.75rem] touch-manipulation select-none items-center justify-center rounded-xl border px-3.5 font-bold tabular-nums transition-[background-color,border-color,color,box-shadow,transform] duration-fast ease-out-soft active:translate-y-px",
                    hasDiscount
                      ? "h-12 flex-col gap-0.5 border-transparent bg-success text-success-foreground shadow-md hover:brightness-110"
                      : "h-11 border-success/35 bg-success-soft text-sm text-success-soft-foreground hover:border-success hover:bg-success hover:text-success-foreground",
                  )}
                >
                  <span className="text-sm leading-none">{slot.time}</span>
                  {discountShortLabel ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-white/95 px-1.5 py-0.5 text-[10px] leading-none text-emerald-700 shadow-xs dark:bg-slate-950/85 dark:text-emerald-200">
                      <Percent className="h-2.5 w-2.5" />
                      {discountShortLabel}
                    </span>
                  ) : null}
                </button>
              ))}
            </div>
            {timeSlots.length > 0 ? (
              <p className="mt-2 text-xs text-muted-foreground">
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
