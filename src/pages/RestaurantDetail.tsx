import { useParams, useSearchParams, useNavigate, useLocation } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getSupabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Heart, MapPin, Phone, Clock, Star, Bike, Percent, Leaf, Utensils, ShoppingBag, ShoppingCart, Zap, ArrowLeft, Info, UtensilsCrossed, MessageSquare, ChevronRight, Camera, X, ChevronLeft, LogIn, Timer } from "lucide-react";
import MenuItemCard from "@/components/MenuItemCard";
import ReviewForm from "@/components/ReviewForm";
import ReservationDialog from "@/components/ReservationDialog";
import ReservationWidget from "@/components/ReservationWidget";
import PriceRangeIcons from "@/components/PriceRangeIcons";
import AntiWasteCard from "@/components/AntiWasteCard";
import { useState, useEffect, useMemo } from "react";
import { useToast } from "@/hooks/use-toast";
import { useCart } from "@/lib/cart-context";
import { trackGoogleBookingEvent } from "@/hooks/useGoogleBusinessBooking";
import { trackEvent, trackImpression } from "@/lib/analytics";
import { useActiveFeatures } from "@/lib/featureFlags";
import { useRef } from "react";
import { buildAuthRedirectTarget } from "@/lib/stripeReturn";
import { buildCanonicalUrl, useSeoMeta } from "@/hooks/useSeoMeta";
import {
  isAntiWasteOfferPubliclyVisible,
  isFlashSalePubliclyVisible,
} from "@/lib/specialOffers";
import {
  formatProgressiveCountdown,
  formatProgressiveServiceDate,
  getNextProgressiveDiscount,
  getProgressiveOfferProgressPercent,
  getProgressiveOfferRemainingTables,
  type ProgressiveReservationOffer,
} from "@/lib/progressiveReservationOffers";
import { useTokLogoSrc } from "@/hooks/useTokLogo";
import { getOptimizedImageSizes, getOptimizedImageSrcSet, getOptimizedImageUrl } from "@/lib/optimizedImages";

const supabase = getSupabase();
const RESTAURANT_DETAIL_STALE_MS = 60_000;
const RESTAURANT_MEDIA_LIMIT = 24;
const RESTAURANT_MENU_ITEMS_LIMIT = 120;
const RESTAURANT_REVIEWS_LIMIT = 50;
const RESTAURANT_FORMULAS_LIMIT = 24;
const RESTAURANT_SPECIAL_OFFERS_LIMIT = 12;

type RestaurantGalleryPhoto = {
  id: string;
  media_url: string;
  alt_text: string | null;
  is_cover: boolean;
  position: number;
  media_type: string;
};

function RestaurantGalleryWatermark({ className = "", sizeClassName = "h-12 w-12" }: { className?: string; sizeClassName?: string }) {
  const logoSrc = useTokLogoSrc();

  return (
    <div
      className={`pointer-events-none absolute left-3 top-3 z-20 drop-shadow-[0_10px_24px_rgba(0,0,0,0.35)] ${className}`}
      aria-hidden="true"
      data-testid="restaurant-gallery-watermark-layer"
    >
      <img src={logoSrc} alt="" className={`${sizeClassName} object-contain`} draggable={false} />
    </div>
  );
}

function RestaurantGalleryImageFrame({ photo, alt }: { photo: RestaurantGalleryPhoto; alt: string }) {
  const galleryImage = getOptimizedImageUrl(photo.media_url, "gallery");
  const gallerySrcSet = getOptimizedImageSrcSet(photo.media_url, "gallery");

  return (
    <div
      className="relative inline-flex max-h-full max-w-full items-center justify-center"
      data-testid="restaurant-gallery-image-frame"
    >
      <RestaurantGalleryWatermark className="left-4 top-4" sizeClassName="h-16 w-16" />
      <img
        src={galleryImage}
        srcSet={gallerySrcSet}
        sizes={gallerySrcSet ? getOptimizedImageSizes("gallery") : undefined}
        alt={photo.alt_text || alt}
        className="block max-h-full max-w-full rounded-lg object-contain"
        decoding="async"
      />
    </div>
  );
}

function buildRestaurantDetailJsonLd({
  restaurant,
  restaurantId,
  canonicalPath,
  heroImage,
  averageRating,
  reviewCount,
}: {
  restaurant: any | null | undefined;
  restaurantId: string | undefined;
  canonicalPath?: string;
  heroImage: string;
  averageRating: string;
  reviewCount: number;
}) {
  if (!restaurant || !restaurantId) return null;

  const imageUrl = heroImage.startsWith("http") ? heroImage : buildCanonicalUrl(heroImage);
  const priceRange = "$".repeat(Math.max(1, Math.min(Number(restaurant.price_range || 2), 4)));
  const restaurantPath = canonicalPath || `/restaurant/${restaurantId}`;

  return {
    "@context": "https://schema.org",
    "@type": "Restaurant",
    "@id": buildCanonicalUrl(restaurantPath),
    name: restaurant.name,
    description: restaurant.description || `Restaurant ${restaurant.name} sur TOK`,
    image: imageUrl,
    servesCuisine: restaurant.cuisine_type || undefined,
    priceRange,
    telephone: restaurant.phone || undefined,
    address: {
      "@type": "PostalAddress",
      streetAddress: restaurant.address || undefined,
      addressLocality: restaurant.city || undefined,
      addressCountry: "CH",
    },
    aggregateRating: reviewCount > 0
      ? {
        "@type": "AggregateRating",
        ratingValue: Number(averageRating),
        reviewCount,
        bestRating: 10,
        worstRating: 1,
      }
      : undefined,
    url: buildCanonicalUrl(restaurantPath),
  };
}

type RestaurantDetailProps = {
  resolvedRestaurantId?: string;
  canonicalPath?: string;
};

export default function RestaurantDetail({ resolvedRestaurantId, canonicalPath }: RestaurantDetailProps = {}) {
  const { id } = useParams<{ id: string }>();
  const restaurantId = resolvedRestaurantId || id;
  const [searchParams] = useSearchParams();
  const { user } = useAuth();
  const { toast } = useToast();
  const { addItem, setOrderMode, orderMode, items: cartItems } = useCart();
  const activeFeatures = useActiveFeatures();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const location = useLocation();
  const [reservationOpen, setReservationOpen] = useState(false);
  const [showReserveChoice, setShowReserveChoice] = useState(false);
  const [galleryOpen, setGalleryOpen] = useState(false);
  const [galleryIndex, setGalleryIndex] = useState(0);
  const [reservationDefaults, setReservationDefaults] = useState<{ date?: Date; time?: string; partySize?: number; }>({});
  const [reservationProgressiveOfferId, setReservationProgressiveOfferId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState("menu");
  const [nowMs, setNowMs] = useState(() => Date.now());
  const impressionTracked = useRef(false);
  const googleBookingStartTrackedRef = useRef(false);
  const deliveryEnabled = activeFeatures.has("livraison");
  const takeawayEnabled = activeFeatures.has("emporter");
  const reservationEnabled = activeFeatures.has("reservation");
  const dineInEnabled = activeFeatures.has("sur-place");
  const flashSalesEnabled = activeFeatures.has("ventes-flash");
  const antiWasteEnabled = activeFeatures.has("anti-gaspi");
  const zeroWaitEnabled = activeFeatures.has("zero-attente");
  const authRedirectTarget = buildAuthRedirectTarget(location.pathname, location.search);
  const progressiveOfferId = searchParams.get("progressiveOfferId");

  useEffect(() => {
    const interval = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    const openParam = searchParams.get("open");
    const shouldOpenReservation = searchParams.get("reserve") === "true" || openParam === "reservation";

    if (shouldOpenReservation && reservationEnabled) {
      setReservationProgressiveOfferId(searchParams.get("progressiveOfferId"));
      const timeParam = searchParams.get("time");
      if (timeParam) setReservationDefaults({ date: new Date(), time: timeParam, partySize: 2 });
      setReservationOpen(true);

      if (
        openParam === "reservation"
        && searchParams.get("utm_source") === "google_business"
        && restaurantId
        && !googleBookingStartTrackedRef.current
      ) {
        googleBookingStartTrackedRef.current = true;
        void trackGoogleBookingEvent(restaurantId, "google_booking_reservation_started", {
          source: "google_business",
          medium: searchParams.get("utm_medium") || "booking_button",
        });
      }
    }
  }, [reservationEnabled, restaurantId, searchParams]);

  const { data: restaurant } = useQuery({
    queryKey: ["restaurant", restaurantId],
    queryFn: async () => { const { data } = await supabase.from("restaurants").select("*").eq("id", restaurantId!).single(); return data; },
    enabled: !!restaurantId,
    staleTime: RESTAURANT_DETAIL_STALE_MS,
  });

  const { data: mediaPhotos } = useQuery({
    queryKey: ["restaurant-media", restaurantId],
    queryFn: async () => {
      const { data } = await supabase
        .from("restaurant_media")
        .select("id, media_url, alt_text, is_cover, position, media_type")
        .eq("restaurant_id", restaurantId!)
        .in("media_type", ["photo", "photo_ai_tok"])
        .order("position", { ascending: true })
        .limit(RESTAURANT_MEDIA_LIMIT);
      return (data || []) as RestaurantGalleryPhoto[];
    },
    enabled: !!restaurantId,
    staleTime: RESTAURANT_DETAIL_STALE_MS,
  });

  useEffect(() => {
    if (restaurantId && restaurant && !impressionTracked.current) {
      impressionTracked.current = true;
      trackImpression("restaurant", restaurantId, "restaurant_detail");
      trackEvent({
        eventType: "page_view",
        eventData: { page: "restaurant_detail", restaurant_name: restaurant.name },
        restaurantId,
      });
    }
  }, [restaurantId, restaurant]);

  const { data: menuItems } = useQuery({
    queryKey: ["menu-items", restaurantId],
    queryFn: async () => { const { data } = await supabase.from("menu_items").select("*").eq("restaurant_id", restaurantId!).eq("is_available", true).order("category").limit(RESTAURANT_MENU_ITEMS_LIMIT); return data || []; },
    enabled: !!restaurantId,
    staleTime: RESTAURANT_DETAIL_STALE_MS,
  });

  const { data: reviews } = useQuery({
    queryKey: ["reviews", restaurantId],
    queryFn: async () => { const { data } = await supabase.from("reviews").select("*").eq("restaurant_id", restaurantId!).eq("status", "published").order("created_at", { ascending: false }).limit(RESTAURANT_REVIEWS_LIMIT); return data || []; },
    enabled: !!restaurantId,
    staleTime: RESTAURANT_DETAIL_STALE_MS,
  });

  const { data: formulas } = useQuery({
    queryKey: ["restaurant-formulas", restaurantId],
    queryFn: async () => { const { data } = await supabase.from("meal_formulas").select("*, meal_formula_categories(*)").eq("restaurant_id", restaurantId!).eq("is_active", true).limit(RESTAURANT_FORMULAS_LIMIT); return data || []; },
    enabled: !!restaurantId,
    staleTime: RESTAURANT_DETAIL_STALE_MS,
  });

  const { data: progressiveOffers = [] } = useQuery({
    queryKey: ["restaurant-progressive-offers", restaurantId],
    queryFn: async () => {
      const { data, error } = await (supabase.from("reservation_progressive_offers" as any) as any)
        .select("*")
        .eq("restaurant_id", restaurantId!)
        .eq("status", "active")
        .gt("booking_cutoff_at", new Date().toISOString())
        .order("booking_cutoff_at", { ascending: true })
        .limit(RESTAURANT_SPECIAL_OFFERS_LIMIT);
      if (error) throw error;
      return (data || []) as ProgressiveReservationOffer[];
    },
    enabled: !!restaurantId,
    staleTime: 30_000,
  });

  const { data: flashSales } = useQuery({
    queryKey: ["restaurant-flash-sales", restaurantId],
    queryFn: async () => {
      const { data } = await supabase.from("flash_sales").select("*").eq("restaurant_id", restaurantId!).eq("is_active", true).gt("quantity_available", 0).order("created_at", { ascending: false }).limit(RESTAURANT_SPECIAL_OFFERS_LIMIT);
      return data || [];
    },
    enabled: !!restaurantId,
    staleTime: RESTAURANT_DETAIL_STALE_MS,
  });

  const { data: antiWasteOffers } = useQuery({
    queryKey: ["restaurant-anti-waste", restaurantId],
    queryFn: async () => {
      const { data } = await supabase.from("anti_waste_offers").select("*").eq("restaurant_id", restaurantId!).eq("is_active", true).gt("quantity_available", 0).order("created_at", { ascending: false }).limit(RESTAURANT_SPECIAL_OFFERS_LIMIT);
      return data || [];
    },
    enabled: !!restaurantId,
    staleTime: RESTAURANT_DETAIL_STALE_MS,
  });

  const { data: isFavorite } = useQuery({
    queryKey: ["favorite", restaurantId, user?.id],
    queryFn: async () => {
      if (!user) return false;
      const { data } = await supabase.from("favorites").select("id").eq("restaurant_id", restaurantId!).eq("user_id", user.id).maybeSingle();
      return !!data;
    },
    enabled: !!restaurantId,
  });

  const toggleFavorite = async () => {
    if (!user) return toast({ title: "Connectez-vous", variant: "destructive" });
    if (isFavorite) await supabase.from("favorites").delete().eq("restaurant_id", restaurantId!).eq("user_id", user.id);
    else await supabase.from("favorites").insert({ restaurant_id: restaurantId!, user_id: user.id });
    queryClient.invalidateQueries({ queryKey: ["favorite", restaurantId] });
  };

  const ratingDistribution = useMemo(() => {
    if (!reviews || reviews.length === 0) return [];
    const counts = Array(10).fill(0) as number[];
    reviews.forEach((r) => { const idx = Math.min(Math.max(Math.round(Number(r.rating) || 0) - 1, 0), 9); counts[idx]++; });
    const max = Math.max(...counts, 1);
    return [10, 9, 8, 7, 6, 5, 4, 3, 2, 1].map((score) => ({ score, count: counts[score - 1], percent: Math.round((counts[score - 1] / max) * 100) }));
  }, [reviews]);

  const avgRating10 = useMemo(() => {
    if (!reviews || reviews.length === 0) return Number(restaurant?.rating) || 0;
    const sum = reviews.reduce((acc, r) => acc + (Number(r.rating) || 0), 0);
    return sum / reviews.length;
  }, [reviews, restaurant?.rating]);

  const visibleFlashSales = useMemo(
    () => (flashSales || []).filter((sale: any) => isFlashSalePubliclyVisible(sale)),
    [flashSales],
  );

  const visibleAntiWasteOffers = useMemo(
    () => (antiWasteOffers || []).filter((offer: any) => isAntiWasteOfferPubliclyVisible(offer)),
    [antiWasteOffers],
  );
  const selectedProgressiveOffer = useMemo(
    () => progressiveOffers.find((offer) => offer.id === (reservationProgressiveOfferId || progressiveOfferId)) || null,
    [progressiveOfferId, progressiveOffers, reservationProgressiveOfferId],
  );

  const reservationAvailable = reservationEnabled && !!restaurant?.supports_reservation;
  const takeawayAvailable = takeawayEnabled && !!restaurant?.supports_pickup;
  const showDelivery = deliveryEnabled && !!restaurant?.delivery_available;
  const zeroWaitAvailable =
    zeroWaitEnabled && dineInEnabled && !!restaurant?.supports_dinein && reservationAvailable;
  const canOrderItems = showDelivery || takeawayAvailable;
  const menuUnavailableReason = canOrderItems
    ? undefined
    : "Commande indisponible: livraison et emporter sont désactivés pour ce restaurant.";
  const cartItemsForCurrentRestaurant = useMemo(
    () => cartItems.filter((item) => item.restaurantId === restaurantId),
    [cartItems, restaurantId],
  );
  const cartCountForCurrentRestaurant = useMemo(
    () => cartItemsForCurrentRestaurant.reduce((acc, item) => acc + item.quantity, 0),
    [cartItemsForCurrentRestaurant],
  );
  const coverPhoto = mediaPhotos?.find((p) => p.is_cover) || mediaPhotos?.[0];
  const heroImage = coverPhoto?.media_url || restaurant?.image_url || "/images/kebab-box-spread.jpeg";
  const optimizedHeroImage = getOptimizedImageUrl(heroImage, "hero");
  const optimizedHeroSrcSet = getOptimizedImageSrcSet(heroImage, "hero");
  const avgRating = avgRating10.toFixed(1);
  const reviewCount = restaurant?.review_count || reviews?.length || 0;
  const seoTitle = restaurant
    ? `${restaurant.name} | Restaurant TOK ${restaurant.city || "Suisse romande"}`
    : "Restaurant TOK | TheTok";
  const seoDescription = restaurant
    ? `${restaurant.name} sur TOK: ${restaurant.cuisine_type || "restaurant"} a ${restaurant.city || "Geneve"}, commande, reservation et offres locales.`
    : "Fiche restaurant TOK avec commande, reservation et offres locales.";
  const restaurantJsonLd = useMemo(
    () => buildRestaurantDetailJsonLd({
      restaurant,
      restaurantId,
      canonicalPath,
      heroImage,
      averageRating: avgRating,
      reviewCount,
    }),
    [avgRating, canonicalPath, heroImage, restaurantId, restaurant, reviewCount],
  );

  useSeoMeta({
    title: seoTitle,
    description: seoDescription,
    path: canonicalPath || `/restaurant/${restaurantId || ""}`,
    image: heroImage,
    jsonLd: restaurantJsonLd,
  });

  useEffect(() => {
    if (!reservationAvailable && reservationOpen) {
      setReservationOpen(false);
      setShowReserveChoice(false);
    }
  }, [reservationAvailable, reservationOpen]);

  useEffect(() => {
    if (!restaurant) return;

    if (orderMode === "delivery" && !showDelivery && takeawayAvailable) {
      setOrderMode("takeaway", { force: true });
      return;
    }

    if (orderMode === "takeaway" && !takeawayAvailable && showDelivery) {
      setOrderMode("delivery", { force: true });
    }
  }, [orderMode, restaurant, setOrderMode, showDelivery, takeawayAvailable]);

  if (!restaurant) return <div className="min-h-screen flex items-center justify-center"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" /></div>;

  const galleryPhotos = mediaPhotos && mediaPhotos.length > 0 ? mediaPhotos : [];

  const categories = [...new Set(menuItems?.map((i) => i.category || "Autres"))] as string[];

  const handleWidgetReserve = (date: Date, time: string, partySize: number) => {
    setReservationDefaults({ date, time, partySize });
    setReservationOpen(true);
  };

  const handleProgressiveOfferReserve = (offer: ProgressiveReservationOffer) => {
    const serviceDate = new Date(`${offer.service_date}T12:00:00`);
    const dateValue = Number.isNaN(serviceDate.getTime()) ? new Date() : serviceDate;
    const search = `?reserve=true&progressiveOfferId=${encodeURIComponent(offer.id)}`;

    if (!user) {
      navigate(buildAuthRedirectTarget(location.pathname, search));
      return;
    }

    setReservationDefaults({
      date: dateValue,
      time: (offer.service_time || "19:00").slice(0, 5),
      partySize: 2,
    });
    setReservationProgressiveOfferId(offer.id);
    setReservationOpen(true);
  };

  const handleReservationAction = () => {
    if (!user) {
      navigate(authRedirectTarget);
      return;
    }

    if (zeroWaitAvailable) {
      setShowReserveChoice((current) => !current);
      return;
    }

    setReservationOpen(true);
  };

  const openGalleryAtIndex = (index: number) => {
    if (!galleryPhotos.length) return;
    const nextIndex = Math.min(Math.max(index, 0), galleryPhotos.length - 1);
    setGalleryIndex(nextIndex);
    setGalleryOpen(true);
  };

  const openCoverGallery = () => {
    const coverIndex = coverPhoto ? galleryPhotos.findIndex((photo) => photo.id === coverPhoto.id) : 0;
    openGalleryAtIndex(coverIndex >= 0 ? coverIndex : 0);
  };

  return (
    <main className="min-h-screen bg-background">
      <div className="relative h-72 md:h-96">
        <Button variant="ghost" size="icon" className="absolute top-4 left-4 z-20 bg-black/30 hover:bg-black/50 backdrop-blur-md rounded-full text-white border-white/10" onClick={() => navigate('/')}><ArrowLeft className="h-5 w-5" /></Button>
        <Button variant="ghost" size="icon" className="absolute top-4 right-4 z-20 bg-black/30 hover:bg-black/50 backdrop-blur-md rounded-full text-white border-white/10" onClick={toggleFavorite}><Heart className={isFavorite ? "h-5 w-5 fill-red-500 text-red-500" : "h-5 w-5"} /></Button>
        {galleryPhotos.length > 0 ? (
          <button
            type="button"
            aria-label="Ouvrir la galerie photo du restaurant"
            className="block h-full w-full cursor-zoom-in text-left"
            onClick={openCoverGallery}
          >
            <img
              src={optimizedHeroImage}
              srcSet={optimizedHeroSrcSet}
              sizes={optimizedHeroSrcSet ? getOptimizedImageSizes("hero") : undefined}
              alt={restaurant.name}
              className="w-full h-full object-cover"
              fetchPriority="high"
              decoding="async"
            />
          </button>
        ) : (
          <img
            src={optimizedHeroImage}
            srcSet={optimizedHeroSrcSet}
            sizes={optimizedHeroSrcSet ? getOptimizedImageSizes("hero") : undefined}
            alt={restaurant.name}
            className="w-full h-full object-cover"
            fetchPriority="high"
            decoding="async"
          />
        )}
        {galleryPhotos.length > 1 && (
          <Button variant="secondary" size="sm" className="absolute bottom-20 right-4 z-20 gap-1.5 bg-black/50 hover:bg-black/70 backdrop-blur-md text-white border-white/10" onClick={() => openGalleryAtIndex(0)}>
            <Camera className="h-4 w-4" /> {galleryPhotos.length} photos
          </Button>
        )}
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
        <div className="absolute bottom-0 left-0 right-0 p-6 md:p-8">
          <div className="container">
            <div className="flex items-center gap-2 mb-2">
              {restaurant.cuisine_type && <Badge className="bg-white/20 backdrop-blur-sm text-white border-white/20">{restaurant.cuisine_type}</Badge>}
              {showDelivery && <Badge className="bg-blue-500/80 backdrop-blur-sm text-white border-0"><Bike className="h-3 w-3 mr-1" /> Livraison</Badge>}
            </div>
            <h1 className="font-display text-3xl md:text-5xl font-bold text-white">{restaurant.name}</h1>
            <div className="flex items-center gap-4 mt-3">
              <div className="flex items-center gap-1.5 bg-primary rounded-lg px-3 py-1.5"><Star className="h-4 w-4 fill-primary-foreground text-primary-foreground" /><span className="font-bold text-primary-foreground text-sm">{avgRating}/10</span></div>
              <span className="text-white/80 text-sm">{reviewCount} avis</span><span className="text-white/50">·</span><span className="text-white/80"><PriceRangeIcons range={restaurant.price_range || 2} /></span>
            </div>
          </div>
        </div>
      </div>
      <div className="container py-6 pb-24 md:py-8 lg:pb-8">
        <div className="flex flex-col lg:flex-row gap-8">
          <div className="flex-1 min-w-0 space-y-6">
            <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-muted-foreground p-4 rounded-xl bg-card border">
              <span className="flex items-center gap-1.5"><MapPin className="h-4 w-4 text-primary" />{restaurant.address}, {restaurant.city}</span>
              {restaurant.phone && <span className="flex items-center gap-1.5"><Phone className="h-4 w-4 text-primary" />{restaurant.phone}</span>}
            </div>
            <div className="rounded-2xl border bg-card/70 p-4 md:p-5">
              <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.24em] text-primary/80">Choisissez votre parcours</p>
                  <h2 className="mt-1 font-display text-xl font-bold">Commencez en quelques secondes</h2>
                  <p className="text-sm text-muted-foreground">
                    {user
                      ? "Sélectionnez un mode puis ajoutez vos plats ou finaliséz une réservation."
                      : "Vous pouvez constituer votre panier maintenant. La connexion sera demandée juste avant le paiement ou pour confirmer une réservation."}
                  </p>
                </div>
                {!user ? (
                  <Button variant="outline" className="gap-2 self-start rounded-full" onClick={() => navigate(authRedirectTarget)}>
                    <LogIn className="h-4 w-4" />
                    Connexion rapide
                  </Button>
                ) : null}
              </div>
              <div className={`mt-4 grid grid-cols-1 gap-3 ${(reservationAvailable && showDelivery && takeawayAvailable) ? "sm:grid-cols-3" : "sm:grid-cols-2"}`}>
                <div className={reservationAvailable ? "relative" : "hidden"}>
                  <button onClick={handleReservationAction} className="group flex w-full items-center gap-3 rounded-2xl border-2 border-transparent bg-secondary/30 p-4 transition-all hover:border-primary/50 hover:bg-secondary/50 dark:border-white/15 dark:bg-slate-950/75 dark:shadow-[0_0_26px_rgba(255,122,0,0.14)] dark:hover:border-primary/50 dark:hover:bg-primary/10">
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary/10 transition-transform group-hover:scale-110"><Utensils className="h-5 w-5 text-primary" /></div>
                    <div className="text-left"><span className="font-bold text-sm block">Réserver une table</span><span className="text-[10px] text-muted-foreground">Garantie de place</span></div>
                    <ChevronRight className="h-4 w-4 text-muted-foreground ml-auto" />
                  </button>
                  {zeroWaitAvailable && showReserveChoice && (
                    <div className="absolute left-0 right-0 top-full mt-2 z-50 bg-background border-2 border-primary/20 rounded-2xl shadow-xl p-3 space-y-2">
                      <button onClick={() => { setShowReserveChoice(false); setReservationOpen(true); }} className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-secondary/50 transition-all text-left group">
                        <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0"><Utensils className="h-5 w-5 text-primary" /></div>
                        <div><p className="font-semibold text-sm">Réservation classique</p><p className="text-xs text-muted-foreground">Réserver avec promos</p></div>
                      </button>
                      <button onClick={() => { setShowReserveChoice(false); navigate(`/zero-attente?restaurant=${restaurantId}`); }} className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-indigo-500/5 transition-all text-left group border-2 border-indigo-500/20">
                        <div className="w-10 h-10 rounded-lg bg-indigo-500/10 flex items-center justify-center flex-shrink-0"><Zap className="h-5 w-5 text-indigo-500" /></div>
                        <div><p className="font-semibold text-sm text-indigo-600 dark:text-indigo-400">Zéro Attente</p><p className="text-xs text-muted-foreground">Précommandez, tout sera prêt</p></div>
                      </button>
                    </div>
                  )}
                </div>
                {showDelivery ? (
                  <button onClick={() => setOrderMode('delivery')} disabled={!showDelivery} className={`group flex items-center gap-3 rounded-2xl border-2 p-4 transition-all ${showDelivery ? orderMode === 'delivery' ? 'border-blue-200 bg-blue-50 dark:border-blue-300/50 dark:bg-blue-500/15 dark:shadow-[0_0_34px_rgba(59,130,246,0.26)]' : 'border-transparent bg-secondary/30 hover:border-primary/50 hover:bg-secondary/50 dark:border-white/15 dark:bg-slate-950/75 dark:shadow-[0_0_26px_rgba(59,130,246,0.14)] dark:hover:border-blue-300/50 dark:hover:bg-blue-500/10' : 'cursor-not-allowed bg-secondary/10 opacity-50 dark:bg-slate-900/40 dark:text-slate-400 dark:opacity-60'}`}>
                    <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full transition-transform group-hover:scale-110 ${orderMode === 'delivery' ? 'bg-blue-500/20 dark:bg-blue-400/20 dark:shadow-[0_0_24px_rgba(59,130,246,0.24)]' : 'bg-blue-500/10 dark:bg-blue-400/15'}`}><Bike className="h-5 w-5 text-blue-500 dark:text-blue-300" /></div>
                    <div className="text-left"><span className="font-bold text-sm block dark:text-white">Livraison</span><span className="text-[11px] text-muted-foreground dark:font-medium dark:text-blue-100/90">A partir de {Number(restaurant.delivery_fee || 2.99).toFixed(2)} CHF</span></div>
                  </button>
                ) : null}
                <button onClick={() => setOrderMode('takeaway')} disabled={!takeawayAvailable} className={`${takeawayAvailable ? "group flex" : "hidden"} items-center gap-3 rounded-2xl border-2 p-4 transition-all ${orderMode === 'takeaway' ? 'border-miamz-green/30 bg-miamz-green/10 dark:border-emerald-300/50 dark:bg-emerald-400/10 dark:shadow-[0_0_30px_rgba(16,185,129,0.22)]' : 'border-transparent bg-secondary/30 hover:border-miamz-green/50 hover:bg-secondary/50 dark:border-white/15 dark:bg-slate-950/75 dark:shadow-[0_0_26px_rgba(16,185,129,0.13)] dark:hover:border-emerald-300/50 dark:hover:bg-emerald-400/10'}`}>
                  <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full transition-transform group-hover:scale-110 ${orderMode === 'takeaway' ? 'bg-miamz-green/20 dark:bg-emerald-400/20 dark:shadow-[0_0_22px_rgba(16,185,129,0.22)]' : 'bg-miamz-green/10 dark:bg-emerald-400/15'}`}><ShoppingBag className="h-5 w-5 text-miamz-green dark:text-emerald-300" /></div>
                  <div className="text-left"><span className="font-bold text-sm block dark:text-white">Emporter</span><span className="text-[11px] font-semibold text-miamz-green dark:text-emerald-200">Retrait sans frais</span></div>
                </button>
              </div>
              {!user && (reservationAvailable || canOrderItems) ? (
                <div className="mt-4 flex flex-col gap-3 rounded-2xl border border-primary/15 bg-primary/5 p-4 md:flex-row md:items-center md:justify-between">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold">Panier invite actif</p>
                    <p className="text-xs text-muted-foreground">Ajoutez vos plats maintenant. La connexion sera demandée uniquement pour finaliser la commande ou confirmer une réservation.</p>
                  </div>
                  <Button className="gap-2 self-start rounded-full" onClick={() => navigate(authRedirectTarget)}>
                    <LogIn className="h-4 w-4" />
                    Me connecter
                  </Button>
                </div>
              ) : null}
            </div>
            {!reservationAvailable && !showDelivery && !takeawayAvailable ? (
              <div className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
                Les parcours réservation, livraison et emporter sont actuellement indisponibles pour ce restaurant.
              </div>
            ) : null}
            <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
              <TabsList className="w-full justify-start bg-transparent border-b rounded-none p-0 h-auto gap-0">
                <TabsTrigger value="apropos" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-5 py-3 font-semibold text-sm gap-1.5"><Info className="h-4 w-4" />À propos</TabsTrigger>
                <TabsTrigger value="menu" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-5 py-3 font-semibold text-sm gap-1.5"><UtensilsCrossed className="h-4 w-4" />Menu</TabsTrigger>
                <TabsTrigger value="avis" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-5 py-3 font-semibold text-sm gap-1.5"><MessageSquare className="h-4 w-4" />Avis ({reviewCount})</TabsTrigger>
                {galleryPhotos.length > 0 && (
                  <TabsTrigger value="photos" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-5 py-3 font-semibold text-sm gap-1.5"><Camera className="h-4 w-4" />Photos ({galleryPhotos.length})</TabsTrigger>
                )}
              </TabsList>
              <TabsContent value="apropos" className="space-y-6 mt-0">
                {restaurant.description && (
                  <div className="space-y-3"><h2 className="font-display text-xl font-bold">L'histoire du restaurant</h2><p className="text-muted-foreground leading-relaxed">{restaurant.description}</p></div>
                )}
                <div className="space-y-3"><h2 className="font-display text-xl font-bold">Informations pratiques</h2><div className="grid grid-cols-1 md:grid-cols-2 gap-4"><div className="p-4 rounded-xl bg-secondary/30 flex items-start gap-3"><Clock className="h-5 w-5 text-primary mt-0.5" /><div><h3 className="font-semibold mb-2">Horaires d'ouverture</h3>{(() => {
                  const oh = restaurant.opening_hours as Record<string, any> | null;
                  const DAY_LABELS: Record<string, string> = { lundi: "Lundi", mardi: "Mardi", mercredi: "Mercredi", jeudi: "Jeudi", vendredi: "Vendredi", samedi: "Samedi", dimanche: "Dimanche" };
                  if (oh && typeof oh === "object" && !Array.isArray(oh)) {
                    const days = Object.keys(DAY_LABELS);
                    const entries = days.filter((d) => oh[d]).map((d) => {
                      const v = oh[d];
                      if (typeof v === "string") return { day: DAY_LABELS[d], hours: v };
                      if (v && typeof v === "object" && v.open && v.close) return { day: DAY_LABELS[d], hours: `${v.open} - ${v.close}` };
                      if (v === true || v === "true") return { day: DAY_LABELS[d], hours: "Ouvert" };
                      return null;
                    }).filter(Boolean) as { day: string; hours: string }[];
                    if (entries.length > 0) return <div className="space-y-1">{entries.map((e) => <p key={e.day} className="text-sm text-muted-foreground"><span className="font-medium text-foreground">{e.day}</span> : {e.hours}</p>)}</div>;
                  }
                  return <p className="text-sm text-muted-foreground">Lundi - Dimanche : 11h30 - 22h30</p>;
                })()}</div></div><div className="p-4 rounded-xl bg-secondary/30 flex items-start gap-3"><Info className="h-5 w-5 text-primary mt-0.5" /><div><h3 className="font-semibold mb-2">Détails</h3><ul className="text-sm text-muted-foreground space-y-1"><li>Cuisine : {restaurant.cuisine_type || "Non spécifié"}</li><li>Fourchette de prix : <PriceRangeIcons range={restaurant.price_range || 2} /></li>{showDelivery && <li>Frais de livraison : {Number(restaurant.delivery_fee || 0).toFixed(2)} CHF</li>}{showDelivery && Number(restaurant.min_order_amount) > 0 && <li>Commande min. : {Number(restaurant.min_order_amount).toFixed(2)} CHF</li>}</ul></div></div></div></div>

                {/* Carte du restaurant — échantillon du menu */}
                {menuItems && menuItems.length > 0 && (
                  <div className="space-y-4">
                    <h2 className="font-display text-xl font-bold">Carte du restaurant</h2>
                    <div className="space-y-0 divide-y rounded-xl border bg-card overflow-hidden">
                      {menuItems.slice(0, 5).map((item) => (
                        <div key={item.id} className="flex items-center gap-4 p-4 hover:bg-secondary/20 transition-colors">
                          {item.image_url && (
                            <img src={item.image_url} alt={item.name} className="w-20 h-20 rounded-lg object-cover shrink-0" />
                          )}
                          <div className="flex-1 min-w-0">
                            <p className="font-semibold text-sm">{item.name}</p>
                            {item.description && (
                              <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{item.description}</p>
                            )}
                          </div>
                          <span className="font-bold text-sm shrink-0">{Number(item.price).toFixed(0)} CHF</span>
                        </div>
                      ))}
                    </div>
                    {menuItems.length > 5 && (
                      <div className="flex justify-center">
                        <button
                          onClick={() => setActiveTab("menu")}
                          className="border rounded-full px-6 py-2.5 text-sm font-semibold hover:bg-secondary/50 transition-colors"
                        >
                          Parcourir le menu complet
                        </button>
                      </div>
                    )}
                  </div>
                )}

                {/* Avis — aperçu */}
                {reviews && reviews.length > 0 && (
                  <div className="space-y-4">
                    <h2 className="font-display text-xl font-bold">Avis</h2>
                    <div className="flex items-start gap-6 p-5 rounded-xl bg-secondary/20 border">
                      <div className="text-center shrink-0">
                        <div className="w-16 h-16 rounded-full border-[3px] border-primary flex items-center justify-center">
                          <span className="font-display text-xl font-bold text-primary">{avgRating}</span>
                        </div>
                        <p className="text-xs font-semibold text-primary mt-1">
                          {Number(avgRating) >= 9 ? "Exceptionnel" : Number(avgRating) >= 8 ? "Excellent" : Number(avgRating) >= 7 ? "Très bien" : Number(avgRating) >= 6 ? "Bien" : "Correct"}
                        </p>
                        <p className="text-[10px] text-muted-foreground">sur 10 · {reviewCount} avis</p>
                      </div>
                      <div className="flex-1 space-y-2">
                        {[
                          { label: "Ambiance", value: (Number(avgRating) * 0.95).toFixed(1) },
                          { label: "Plats", value: avgRating },
                          { label: "Service", value: (Number(avgRating) * 1.02 > 10 ? 10 : Number(avgRating) * 1.02).toFixed(1) },
                        ].map((cat) => (
                          <div key={cat.label} className="flex items-center gap-3">
                            <span className="text-xs font-medium w-16">{cat.label}</span>
                            <div className="flex-1 h-2 rounded-full bg-secondary overflow-hidden">
                              <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${(Number(cat.value) / 10) * 100}%` }} />
                            </div>
                            <span className="text-xs font-bold w-6 text-right">{cat.value}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                    <div className="space-y-3">
                      {reviews.slice(0, 3).map((review) => (
                        <div key={review.id} className="p-4 border rounded-xl bg-card space-y-2">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <div className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center">
                                <span className="text-xs font-bold text-muted-foreground">
                                  {(review.user_name || review.user_id || "A").charAt(0).toUpperCase()}
                                </span>
                              </div>
                              <div>
                                <p className="text-xs font-semibold">{review.user_name || "Anonyme"}</p>
                                <p className="text-[10px] text-muted-foreground">{new Date(review.created_at).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })}</p>
                              </div>
                            </div>
                            <div className="flex items-center gap-1 bg-primary/10 text-primary px-2 py-0.5 rounded font-bold text-sm">
                              <Star className="h-3.5 w-3.5 fill-primary" />{Number(review.rating).toFixed(1)}<span className="text-[10px] font-normal text-muted-foreground">/10</span>
                            </div>
                          </div>
                          {review.comment && <p className="text-sm leading-relaxed text-muted-foreground">{review.comment}</p>}
                        </div>
                      ))}
                    </div>
                    {reviews.length > 3 && (
                      <div className="flex justify-center">
                        <button
                          onClick={() => setActiveTab("avis")}
                          className="border rounded-full px-6 py-2.5 text-sm font-semibold hover:bg-secondary/50 transition-colors"
                        >
                          Voir tous les avis ({reviewCount})
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </TabsContent>
              <TabsContent value="menu" className="space-y-6 mt-0">
                {progressiveOffers.length > 0 && (
                  <div className="space-y-4">
                    <div className="flex items-center gap-2">
                      <Timer className="h-5 w-5 text-orange-500" />
                      <h2 className="font-display text-xl font-bold">Offres progressives</h2>
                      <Badge className="bg-orange-500/10 text-orange-700 dark:text-orange-300 border-orange-500/20 text-[10px]">
                        Compte a rebours
                      </Badge>
                    </div>
                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                      {progressiveOffers.map((offer) => {
                        const nextDiscount = getNextProgressiveDiscount(offer);
                        const remainingTables = getProgressiveOfferRemainingTables(offer);
                        const isSelectedOffer = selectedProgressiveOffer?.id === offer.id;

                        return (
                          <div key={offer.id} className="space-y-3 rounded-2xl border-2 border-orange-500/20 bg-orange-500/5 p-4">
                            <div className="flex items-start justify-between gap-3">
                              <div>
                                <h3 className="font-bold text-lg">{offer.title}</h3>
                                <p className="text-sm text-muted-foreground">
                                  {formatProgressiveServiceDate(offer.service_date)} a {(offer.service_time || "19:00").slice(0, 5)}
                                </p>
                              </div>
                              <Badge className="bg-orange-500 text-white">jusqu'a -{Number(offer.max_discount_percent).toFixed(0)}%</Badge>
                            </div>
                            {offer.description ? <p className="text-sm text-muted-foreground">{offer.description}</p> : null}
                            <div className="grid grid-cols-3 gap-2 text-xs">
                              <div className="rounded-xl bg-background p-2">
                                <p className="text-muted-foreground">Prochaine reservation</p>
                                <p className="text-base font-bold text-primary">-{nextDiscount}%</p>
                              </div>
                              <div className="rounded-xl bg-background p-2">
                                <p className="text-muted-foreground">Tables restantes</p>
                                <p className="text-base font-bold">{remainingTables}</p>
                              </div>
                              <div className="rounded-xl bg-background p-2">
                                <p className="text-muted-foreground">Fin dans</p>
                                <p className="text-base font-bold">{formatProgressiveCountdown(offer.countdown_ends_at, nowMs)}</p>
                              </div>
                            </div>
                            <div className="h-2 overflow-hidden rounded-full bg-muted">
                              <div className="h-full rounded-full bg-orange-500" style={{ width: `${getProgressiveOfferProgressPercent(offer)}%` }} />
                            </div>
                            <Button
                              type="button"
                              className="w-full gap-2 bg-orange-500 hover:bg-orange-600"
                              onClick={() => handleProgressiveOfferReserve(offer)}
                            >
                              {isSelectedOffer ? "Offre selectionnee" : "Reserver avec cette offre"}
                              <ChevronRight className="h-4 w-4" />
                            </Button>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
                {formulas && formulas.length > 0 && (
                  <div className="space-y-4">
                    <div className="flex items-center gap-2"><Percent className="h-5 w-5 text-primary" /><h2 className="font-display text-xl font-bold">Formules et Menus (-{formulas[0].discount_percent}%)</h2></div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {formulas.map((formula: any) => (
                        <div key={formula.id} className="p-4 border-2 border-primary/20 bg-primary/5 rounded-2xl space-y-2">
                          <h3 className="font-bold text-lg">{formula.name}</h3>
                          {formula.description && <p className="text-sm text-muted-foreground">{formula.description}</p>}
                          <div className="flex gap-2 text-xs font-semibold text-primary">{formula.meal_formula_categories?.map((c: any) => c.category).join(' + ')}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {flashSalesEnabled && visibleFlashSales.length > 0 && (
                  <div className="space-y-4">
                    <div className="flex items-center gap-2"><Zap className="h-5 w-5 text-amber-500 fill-amber-500" /><h2 className="font-display text-xl font-bold">Ventes Flash</h2><Badge className="bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/20 text-[10px]">{visibleFlashSales.length} offre{visibleFlashSales.length > 1 ? "s" : ""}</Badge></div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {visibleFlashSales.map((sale: any) => {
                        const discount = sale.original_price > 0 ? Math.round((1 - Number(sale.discounted_price) / Number(sale.original_price)) * 100) : 0;
                        return (
                          <div key={sale.id} className="flex items-center gap-4 p-4 rounded-2xl border-2 border-amber-500/20 bg-amber-500/5">
                            <div className="w-12 h-12 rounded-xl bg-amber-500/10 flex items-center justify-center shrink-0">
                              <Zap className="h-6 w-6 text-amber-500" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="font-bold text-sm truncate">{sale.title}</p>
                              <div className="flex items-baseline gap-2 mt-0.5">
                                <span className="text-lg font-black text-amber-600 dark:text-amber-400">{Number(sale.discounted_price).toFixed(2)} CHF</span>
                                <span className="text-xs text-muted-foreground line-through">{Number(sale.original_price).toFixed(2)} CHF</span>
                                <Badge className="bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/20 text-[10px]">-{discount}%</Badge>
                              </div>
                              <p className="text-[10px] text-muted-foreground mt-0.5">{sale.quantity_available} restant(s)</p>
                            </div>
                            <Button
                              size="sm"
                              className="bg-amber-500 hover:bg-amber-600 text-white gap-1.5 shrink-0"
                              onClick={() => {
                                if (!canOrderItems) {
                                  toast({
                                    title: "Commande indisponible",
                                    description: menuUnavailableReason,
                                    variant: "destructive",
                                  });
                                  return;
                                }
                                addItem({
                                  menuItemId: `flash-${sale.id}`,
                                  name: `[Flash] ${sale.title}`,
                                  price: Number(sale.discounted_price),
                                  restaurantId: restaurantId!,
                                  restaurantName: restaurant.name,
                                  metadata: { is_flash_sale: true, flash_sale_id: sale.id, delivery_available: showDelivery && !!sale.delivery_available, takeaway_available: takeawayAvailable && !!sale.takeaway_available },
                                });
                                toast({ title: "Vente flash ajoutée !", description: `${sale.title} — ${Number(sale.discounted_price).toFixed(2)} CHF` });
                              }}
                            >
                              <ShoppingCart className="h-4 w-4" /> Ajouter
                            </Button>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
                {antiWasteEnabled && visibleAntiWasteOffers.length > 0 && (
                  <div className="space-y-4">
                    <div className="flex items-center gap-2"><Leaf className="h-5 w-5 text-emerald-600" /><h2 className="font-display text-xl font-bold">Anti-gaspi</h2><Badge className="bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/20 text-[10px]">{visibleAntiWasteOffers.length} offre{visibleAntiWasteOffers.length > 1 ? "s" : ""}</Badge></div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {visibleAntiWasteOffers.map((offer: any) => (
                        <AntiWasteCard
                          key={offer.id}
                          title={offer.title}
                          restaurant={restaurant.name}
                          restaurantId={restaurantId}
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
                      ))}
                    </div>
                  </div>
                )}
                {/* Sticky category navigation */}
                {categories.length > 1 && (
                  <div className="sticky top-16 z-20 -mx-1 px-1 py-2 bg-background/95 backdrop-blur border-b">
                    <div className="flex gap-2 overflow-x-auto scrollbar-hide pb-1">
                      {categories.map((cat) => (
                        <button
                          key={cat}
                          onClick={() => document.getElementById(cat.replace(/\s+/g, '-').toLowerCase())?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
                          className="shrink-0 px-4 py-2 rounded-full text-xs font-bold border bg-secondary/50 text-foreground hover:bg-primary hover:text-primary-foreground transition-colors"
                        >
                          {cat}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                <div className="space-y-8">
                  {categories.map((category) => (
                    <div key={category} id={category.replace(/\s+/g, '-').toLowerCase()} className="space-y-4 scroll-mt-32">
                      <h2 className="font-display text-xl font-bold border-b pb-2">{category}</h2>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {menuItems?.filter((item) => (item.category || "Autres") === category).map((item) => (
                          <MenuItemCard
                            key={item.id}
                            id={item.id}
                            name={item.name}
                            description={item.description}
                            price={item.price}
                            imageUrl={item.image_url}
                            category={item.category}
                            restaurantId={item.restaurant_id}
                            restaurantName={restaurant.name}
                            disabled={!canOrderItems}
                            disabledReason={menuUnavailableReason}
                          />
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </TabsContent>
              <TabsContent value="avis" className="space-y-8 mt-0">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                  <div className="md:col-span-1 space-y-6">
                    <div className="text-center p-6 bg-secondary/20 rounded-2xl border">
                      <p className="font-display text-5xl font-bold text-primary">{avgRating}</p>
                      <div className="flex justify-center my-2">{[1, 2, 3, 4, 5].map((s) => (<Star key={s} className={`h-4 w-4 ${s <= Math.round(Number(avgRating) / 2) ? "fill-primary text-primary" : "text-muted"}`} />))}</div>
                      <p className="text-sm text-muted-foreground">{reviewCount} avis vérifiés</p>
                    </div>
                    <div className="space-y-2">
                      {ratingDistribution.map(({ score, count, percent }) => (
                        <div key={score} className="flex items-center gap-3 text-sm">
                          <span className="w-6 font-medium text-right">{score}</span>
                          <div className="flex-1 h-2.5 rounded-full bg-secondary overflow-hidden"><div className="h-full bg-primary rounded-full" style={{ width: `${percent}%` }} /></div>
                          <span className="w-8 text-muted-foreground text-right">{count}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="md:col-span-2 space-y-6">
                    {user && <ReviewForm restaurantId={restaurantId!} onSuccess={() => { queryClient.invalidateQueries({ queryKey: ["reviews", restaurantId] }); }} />}
                    <div className="space-y-4">
                      {reviews?.map((review) => (
                        <div key={review.id} className="p-4 border rounded-xl bg-card space-y-3">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-1.5 bg-primary/10 text-primary px-2 py-0.5 rounded font-bold text-sm"><Star className="h-3.5 w-3.5 fill-primary" />{Number(review.rating).toFixed(1)}/10</div>
                            <span className="text-xs text-muted-foreground">{new Date(review.created_at).toLocaleDateString("fr-FR", { year: "numeric", month: "long" })}</span>
                          </div>
                          {review.comment && <p className="text-sm leading-relaxed">{review.comment}</p>}
                        </div>
                      ))}
                      {(!reviews || reviews.length === 0) && <p className="text-center text-muted-foreground py-8">Aucun avis pour ce restaurant. Soyez le premier !</p>}
                    </div>
                  </div>
                </div>
              </TabsContent>
              {galleryPhotos.length > 0 && (
                <TabsContent value="photos" className="space-y-6 mt-0">
                  <div className="flex items-center gap-2">
                    <Camera className="h-5 w-5 text-primary" />
                    <h2 className="font-display text-xl font-bold">Photos du restaurant</h2>
                    <Badge variant="secondary" className="text-[10px]">{galleryPhotos.length} photo{galleryPhotos.length > 1 ? "s" : ""}</Badge>
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                    {galleryPhotos.map((photo, index) => (
                      <button
                        key={photo.id}
                        onClick={() => openGalleryAtIndex(index)}
                        className="group relative aspect-square rounded-xl overflow-hidden border bg-muted"
                      >
                        <RestaurantGalleryWatermark sizeClassName="h-10 w-10" />
                        <img
                          src={getOptimizedImageUrl(photo.media_url, "thumbnail")}
                          alt={photo.alt_text || restaurant.name}
                          className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-110"
                          loading="lazy"
                          decoding="async"
                        />
                        {photo.is_cover && (
                          <div className="absolute top-2 left-14 z-20 bg-primary text-primary-foreground text-[9px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1">
                            <Star className="h-3 w-3" /> Couverture
                          </div>
                        )}
                        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors" />
                      </button>
                    ))}
                  </div>
                </TabsContent>
              )}
            </Tabs>
          </div>
          <div className="w-full lg:w-80 shrink-0">
            <div className="sticky top-24 space-y-4">
              {reservationAvailable ? (
                <ReservationWidget restaurantId={restaurantId!} restaurantName={restaurant.name} onReserve={handleWidgetReserve} />
              ) : (
                <div className="rounded-2xl border border-dashed bg-card p-4 text-sm text-muted-foreground">
                  Les réservations sont actuellement indisponibles pour ce restaurant.
                </div>
              )}
              {cartItemsForCurrentRestaurant.length > 0 && (
                <Button className="w-full h-14 text-lg font-bold shadow-xl" onClick={() => navigate("/panier")}><ShoppingCart className="mr-2 h-5 w-5" /> Voir mon panier ({cartCountForCurrentRestaurant})</Button>
              )}
            </div>
          </div>
        </div>
      </div>
      {cartItemsForCurrentRestaurant.length > 0 ? (
        <div className="fixed bottom-4 left-4 right-4 z-40 lg:hidden">
          <Button className="h-14 w-full rounded-full text-base font-bold shadow-2xl" onClick={() => navigate("/panier")}><ShoppingCart className="mr-2 h-5 w-5" /> Voir mon panier ({cartCountForCurrentRestaurant})</Button>
        </div>
      ) : null}
      {reservationAvailable ? (
        <ReservationDialog
          open={reservationOpen}
          onOpenChange={setReservationOpen}
          restaurantId={restaurantId!}
          restaurantName={restaurant.name}
          initialDate={reservationDefaults?.date}
          initialTime={reservationDefaults?.time}
          initialPartySize={reservationDefaults?.partySize}
          progressiveOfferId={reservationProgressiveOfferId || progressiveOfferId}
        />
      ) : null}

      {/* Photo gallery lightbox */}
      {galleryOpen && galleryPhotos.length > 0 && (
        <div className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center" onClick={() => setGalleryOpen(false)}>
          <Button variant="ghost" size="icon" className="absolute top-4 right-4 text-white hover:bg-white/20 z-50" onClick={() => setGalleryOpen(false)}><X className="h-6 w-6" /></Button>
          {galleryPhotos.length > 1 && (
            <>
              <Button variant="ghost" size="icon" className="absolute left-4 text-white hover:bg-white/20 z-50" onClick={(e) => { e.stopPropagation(); setGalleryIndex((prev) => (prev - 1 + galleryPhotos.length) % galleryPhotos.length); }}><ChevronLeft className="h-8 w-8" /></Button>
              <Button variant="ghost" size="icon" className="absolute right-4 text-white hover:bg-white/20 z-50" onClick={(e) => { e.stopPropagation(); setGalleryIndex((prev) => (prev + 1) % galleryPhotos.length); }}><ChevronRight className="h-8 w-8" /></Button>
            </>
          )}
          <div className="flex max-h-[80vh] max-w-4xl flex-col items-center px-12" onClick={(e) => e.stopPropagation()}>
            <div className="flex min-h-0 max-h-[80vh] max-w-full items-center justify-center">
              <RestaurantGalleryImageFrame photo={galleryPhotos[galleryIndex]} alt={restaurant.name} />
            </div>
            <p className="text-center text-white/70 text-sm mt-3">{galleryIndex + 1} / {galleryPhotos.length}{galleryPhotos[galleryIndex].alt_text ? ` — ${galleryPhotos[galleryIndex].alt_text}` : ""}</p>
          </div>
        </div>
      )}
    </main>
  );
}
