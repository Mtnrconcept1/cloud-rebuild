import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  BellRing,
  Bookmark,
  ChevronRight,
  Flame,
  Megaphone,
  RefreshCw,
  Rocket,
  Search,
  Sparkles,
  Store,
  TrendingUp,
  X,
} from "lucide-react";

import SocialComposer from "@/components/social/SocialComposer";
import TrackedSocialPostCard from "@/components/social/TrackedSocialPostCard";
import { useCommercialDemoFrame } from "@/components/commercial/CommercialDemoFrameProvider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  useInfiniteSocialFeed,
  useSearchActualitesPosts,
  useToggleRestaurantFollow,
} from "@/hooks/useSocialFeed";
import { useSeoMeta } from "@/hooks/useSeoMeta";
import { getSupabase } from "@/integrations/supabase/client";
import { createActualitesFeedOrderSeed, orderActualitesFeedPosts } from "@/lib/actualitesFeedOrdering";
import {
  ACTUALITES_CLICK_SIGNAL_EVENT,
  ACTUALITES_CLICK_SIGNAL_STORAGE_KEY,
  buildPersonalizedActualitesTrends,
  readActualitesPostSignals,
  type ActualitesOrderTrendSignal,
  type ActualitesPostClickSignal,
  type ActualitesReservationTrendSignal,
} from "@/lib/actualitesPersonalizedTrends";
import { useAuth } from "@/lib/auth-context";
import { SOCIAL_FEED_SCOPES, normalizeSocialFeedScope, type SocialFeedPost, type SocialFeedScope } from "@/lib/socialFeed";
import { useOwnerRestaurants } from "@/pages/dashboard/useOwnerRestaurants";

type ActualitesUserTrendSignals = {
  orders: ActualitesOrderTrendSignal[];
  reservations: ActualitesReservationTrendSignal[];
  clickedPosts: Array<Partial<ActualitesPostClickSignal>>;
};

const ACTUALITES_SEO_JSON_LD = {
  "@context": "https://schema.org",
  "@type": "CollectionPage",
  name: "Actualités des restaurants TOK",
  url: "https://www.thetok.ch/actualites",
  description: "Les plats, nouveautés, offres et événements publiés par les restaurants présents sur TOK.",
  isPartOf: {
    "@type": "WebSite",
    name: "TOK",
    url: "https://www.thetok.ch",
  },
};

function normalizeActualitesSearch(value: string) {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[#_./-]+/g, " ")
    .toLocaleLowerCase("fr-CH")
    .replace(/\s+/g, " ")
    .trim();
}

function compactActualitesSearch(value: string) {
  return normalizeActualitesSearch(value).replace(/\s+/g, "");
}

function buildPostSearchIndex(post: SocialFeedPost) {
  const fields = [
    post.body,
    post.restaurant.name,
    post.restaurant.city,
    post.restaurant.cuisineType,
    post.postType,
    post.ctaType,
    post.campaignGoal,
    post.campaignName,
    post.audienceSegment,
    post.offerCode,
    post.recommendationReasons?.join(" "),
    post.media?.map((media) => media.altText).filter(Boolean).join(" "),
  ]
    .filter(Boolean)
    .join(" ");
  return `${normalizeActualitesSearch(fields)} ${compactActualitesSearch(fields)}`;
}

function getRelatedRow(value: unknown) {
  if (Array.isArray(value)) return value[0] || null;
  return value && typeof value === "object" ? value as Record<string, unknown> : null;
}

async function loadActualitesUserTrendSignals(userId: string): Promise<ActualitesUserTrendSignals> {
  const supabase = getSupabase();
  const [ordersResult, reservationsResult, eventsResult] = await Promise.all([
    (supabase.from("orders" as any) as any)
      .select("id,restaurant_id,created_at,scheduled_at,scheduled_for,restaurants(id,name,cuisine_type,city)")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(40),
    (supabase.from("reservations" as any) as any)
      .select("id,restaurant_id,created_at,date,time,party_size,restaurants(id,name,cuisine_type,city)")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(40),
    (supabase.from("social_feed_events" as any) as any)
      .select("post_id,restaurant_id,event_type,created_at,metadata,social_posts(id,body,post_type,cta_type,campaign_goal,restaurants(id,name,cuisine_type,city))")
      .eq("user_id", userId)
      .in("event_type", ["click", "cta_click", "reaction", "comment", "share", "save", "follow", "repost"])
      .order("created_at", { ascending: false })
      .limit(60),
  ]);

  if (ordersResult.error) console.warn("Actualites order trend signals unavailable", ordersResult.error);
  if (reservationsResult.error) console.warn("Actualites reservation trend signals unavailable", reservationsResult.error);
  if (eventsResult.error) console.warn("Actualites click trend signals unavailable", eventsResult.error);

  const orders = ordersResult.error
    ? []
    : (ordersResult.data || []).map((row: any): ActualitesOrderTrendSignal => {
        const restaurant = getRelatedRow(row.restaurants);
        return {
          restaurantCuisine: String(restaurant?.cuisine_type || ""),
          restaurantCity: String(restaurant?.city || ""),
          createdAt: row.created_at || null,
          scheduledAt: row.scheduled_at || row.scheduled_for || null,
        };
      });

  const reservations = reservationsResult.error
    ? []
    : (reservationsResult.data || []).map((row: any): ActualitesReservationTrendSignal => {
        const restaurant = getRelatedRow(row.restaurants);
        return {
          restaurantCuisine: String(restaurant?.cuisine_type || ""),
          restaurantCity: String(restaurant?.city || ""),
          date: row.date || null,
          time: row.time || null,
          partySize: Number(row.party_size || 0),
          createdAt: row.created_at || null,
        };
      });

  const clickedPosts = eventsResult.error
    ? []
    : (eventsResult.data || []).map((row: any): Partial<ActualitesPostClickSignal> => {
        const post = getRelatedRow(row.social_posts);
        const restaurant = getRelatedRow(post?.restaurants);
        return {
          postId: String(row.post_id || ""),
          restaurantId: String(row.restaurant_id || ""),
          cuisineType: String(restaurant?.cuisine_type || ""),
          city: String(restaurant?.city || ""),
          postType: post?.post_type as ActualitesPostClickSignal["postType"],
          ctaType: post?.cta_type as ActualitesPostClickSignal["ctaType"],
          campaignGoal: String(post?.campaign_goal || ""),
          body: String(post?.body || ""),
          createdAt: row.created_at || null,
        };
      });

  return { orders, reservations, clickedPosts };
}

function ActualitesBoostBanner({ onSponsorClick }: { onSponsorClick: () => void }) {
  return (
    <section
      aria-label="Mettre votre restaurant en avant"
      className="relative isolate overflow-hidden rounded-[1.35rem] bg-[#ff4b00] bg-[image:url('/fondbanniere.png')] bg-cover bg-center shadow-xl shadow-orange-500/20 max-sm:h-[33rem] max-sm:rounded-[1.15rem] max-sm:bg-[image:url('/fondbanniere2.png')]"
    >
      <div className="relative z-10 grid min-h-[22rem] grid-cols-[minmax(0,1.1fr)_minmax(15rem,0.86fr)] gap-4 px-5 pb-5 pt-4 sm:min-h-[20rem] sm:px-6 sm:py-6 md:grid-cols-[minmax(18rem,1.1fr)_minmax(16rem,0.82fr)] md:items-center lg:min-h-[21rem] max-sm:block max-sm:h-full max-sm:min-h-0 max-sm:p-0">
        <div className="relative min-h-[19rem] sm:min-h-[20rem] max-sm:absolute max-sm:inset-0 max-sm:min-h-0">
          <img
            src="/chef3.png"
            alt="Ton resto mis en avant a partir de CHF 1.-"
            loading="eager"
            className="absolute left-[-2.8rem] top-0 ml-[9px] mt-[-35px] h-[28rem] w-[34rem] max-w-none object-contain object-top pl-[39px] drop-shadow-2xl [mask-image:radial-gradient(ellipse_at_45%_42%,black_64%,transparent_88%)] sm:left-[-3.4rem] sm:top-[-0.25rem] sm:h-[29rem] sm:w-[36rem] md:left-[-3.75rem] md:h-[30rem] md:w-[36rem] lg:left-[-3.25rem] lg:h-[31rem] lg:w-[37rem] max-sm:left-[-4.55rem] max-sm:top-[-1.05rem] max-sm:ml-0 max-sm:mt-0 max-sm:h-auto max-sm:w-[29.5rem] max-sm:object-contain max-sm:pl-0"
          />
        </div>

        <div className="flex min-w-0 flex-col justify-center gap-4 text-white md:pl-4 lg:pl-6 max-sm:absolute max-sm:inset-x-4 max-sm:bottom-4 max-sm:z-20 max-sm:gap-3">
          <div className="space-y-3 max-sm:mb-2 max-sm:ml-[12.5rem] max-sm:grid max-sm:grid-cols-1 max-sm:gap-2 max-sm:space-y-0">
            <div className="flex items-start gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white text-orange-600 shadow-lg shadow-orange-900/15 max-sm:h-8 max-sm:w-8">
                <TrendingUp className="h-5 w-5 max-sm:h-4 max-sm:w-4" aria-hidden="true" />
              </span>
              <span>
                <strong className="block text-lg font-black leading-tight max-sm:text-[12px]">Plus de visibilite</strong>
                <span className="block text-sm font-medium leading-snug text-white/90 max-sm:text-[11px]">
                  Soyez vu par des milliers de gourmands
                </span>
              </span>
            </div>
            <div className="flex items-start gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white text-orange-600 shadow-lg shadow-orange-900/15 max-sm:h-8 max-sm:w-8">
                <BellRing className="h-5 w-5 max-sm:h-4 max-sm:w-4" aria-hidden="true" />
              </span>
              <span>
                <strong className="block text-lg font-black leading-tight max-sm:text-[12px]">Plus de clients</strong>
                <span className="block text-sm font-medium leading-snug text-white/90 max-sm:text-[11px]">
                  Attirez de nouveaux clients chaque jour
                </span>
              </span>
            </div>
            <div className="flex items-start gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white text-orange-600 shadow-lg shadow-orange-900/15 max-sm:h-8 max-sm:w-8">
                <Rocket className="h-5 w-5 max-sm:h-4 max-sm:w-4" aria-hidden="true" />
              </span>
              <span>
                <strong className="block text-lg font-black leading-tight max-sm:text-[12px]">Resultats rapides</strong>
                <span className="block text-sm font-medium leading-snug text-white/90 max-sm:text-[11px]">
                  Des resultats des les premieres heures
                </span>
              </span>
            </div>
          </div>

          <Button
            type="button"
            className="mt-1 h-12 rounded-2xl bg-white px-5 text-base font-black text-orange-600 shadow-xl shadow-orange-900/20 transition hover:bg-orange-50 hover:text-orange-700 max-sm:h-11 max-sm:w-full max-sm:text-sm"
            onClick={onSponsorClick}
          >
            Mettre mon restaurant en avant
          </Button>
        </div>
      </div>
    </section>
  );
}

export default function Actualites() {
  const { role, isSuperAdmin, user } = useAuth();
  const commercialDemoFrame = useCommercialDemoFrame();
  const isCommercialDemoClient = commercialDemoFrame?.surface === "client";
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [scope, setScope] = useState<SocialFeedScope>(() => normalizeSocialFeedScope(searchParams.get("scope")));
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState("");
  const [localClickSignals, setLocalClickSignals] = useState(() => readActualitesPostSignals());
  const [userTrendSignals, setUserTrendSignals] = useState<ActualitesUserTrendSignals>({
    orders: [],
    reservations: [],
    clickedPosts: [],
  });
  const [feedOrderSeed] = useState(() => createActualitesFeedOrderSeed());
  const [composerRestaurantId, setComposerRestaurantId] = useState<string | null>(null);
  const [sponsorDialogRequest, setSponsorDialogRequest] = useState(0);
  const highlightedPostId = searchParams.get("post");
  const feed = useInfiniteSocialFeed(scope, 12);
  const globalSearch = useSearchActualitesPosts(debouncedSearchQuery, 20);
  const canManage = !isCommercialDemoClient && (role === "restaurateur" || isSuperAdmin);
  const ownerRestaurants = useOwnerRestaurants({ enabled: canManage });
  const rawPosts = useMemo(() => (feed.data?.pages.flatMap((page) => page.posts) || []) as SocialFeedPost[], [feed.data]);
  const posts = useMemo(() => orderActualitesFeedPosts(rawPosts, `${feedOrderSeed}:${scope}`), [feedOrderSeed, rawPosts, scope]);
  const fallbackFilteredPosts = useMemo(() => {
    const normalizedQuery = normalizeActualitesSearch(searchQuery);
    const compactQuery = compactActualitesSearch(searchQuery);

    if (!normalizedQuery && !compactQuery) return posts;

    return posts.filter((post) => {
      const searchIndex = buildPostSearchIndex(post);
      return Boolean(
        normalizedQuery && searchIndex.includes(normalizedQuery)
          || compactQuery && searchIndex.includes(compactQuery),
      );
    });
  }, [posts, searchQuery]);
  const normalizedSearchQuery = searchQuery.replace(/\s+/g, " ").trim();
  const normalizedDebouncedSearchQuery = debouncedSearchQuery.replace(/\s+/g, " ").trim();
  const globalSearchEnabled = normalizedSearchQuery.length >= 2
    && normalizedDebouncedSearchQuery.length >= 2;
  const searchIsSettling = normalizedSearchQuery.length >= 2
    && normalizedSearchQuery !== normalizedDebouncedSearchQuery;
  const globallyMatchedPosts = useMemo(
    () => (globalSearch.data?.pages.flatMap((page) => page.posts) || []) as SocialFeedPost[],
    [globalSearch.data],
  );
  const filteredPosts = globalSearchEnabled && !globalSearch.isError
    ? globallyMatchedPosts
    : fallbackFilteredPosts;
  const globalSearchTotal = globalSearch.data?.pages[0]?.totalCount || 0;
  const searchLoading = globalSearchEnabled && (globalSearch.isLoading || searchIsSettling);
  const contentLoading = globalSearchEnabled ? searchLoading : feed.isLoading;
  const contentError = normalizedSearchQuery ? null : feed.error;
  const canLoadMore = globalSearchEnabled ? globalSearch.hasNextPage : feed.hasNextPage;
  const isLoadingMore = globalSearchEnabled ? globalSearch.isFetchingNextPage : feed.isFetchingNextPage;
  const restaurants = useMemo(
    () => canManage ? ownerRestaurants.restaurants : [],
    [canManage, ownerRestaurants.restaurants],
  );
  const composerRestaurant = restaurants.find((restaurant) => restaurant.id === composerRestaurantId) || restaurants[0] || null;
  const toggleFollow = useToggleRestaurantFollow();
  const suggestedRestaurants = useMemo(() => {
    const seen = new Set<string>();
    return filteredPosts
      .filter((post) => !post.followedByMe)
      .filter((post) => {
        if (seen.has(post.restaurantId)) return false;
        seen.add(post.restaurantId);
        return true;
      })
      .slice(0, 4);
  }, [filteredPosts]);
  const feedStats = useMemo(() => {
    const restaurantsCount = new Set(filteredPosts.map((post) => post.restaurantId)).size;
    const offersCount = filteredPosts.filter((post) => post.postType === "promo" || post.ctaType === "offer").length;
    const savedCount = filteredPosts.filter((post) => post.savedByMe).length;
    const mediaCount = filteredPosts.reduce((total, post) => total + post.media.length, 0);

    return { restaurantsCount, offersCount, savedCount, mediaCount };
  }, [filteredPosts]);
  const personalizedTrends = useMemo(() => buildPersonalizedActualitesTrends({
    orders: userTrendSignals.orders,
    reservations: userTrendSignals.reservations,
    clickedPosts: [...localClickSignals, ...userTrendSignals.clickedPosts],
    feedPosts: posts,
    max: 4,
  }), [localClickSignals, posts, userTrendSignals]);

  useSeoMeta({
    title: "Actualités des restaurants à Genève et en Suisse romande | TOK",
    description: "Découvrez les plats, nouveautés, offres et événements publiés par les restaurants locaux sur TOK, sans avoir besoin de connaître un hashtag.",
    path: "/actualites",
    jsonLd: ACTUALITES_SEO_JSON_LD,
  });

  useEffect(() => {
    const timeout = window.setTimeout(() => setDebouncedSearchQuery(searchQuery), 300);
    return () => window.clearTimeout(timeout);
  }, [searchQuery]);

  useEffect(() => {
    if (!highlightedPostId) return;
    navigate(`/actualites/${encodeURIComponent(highlightedPostId)}`, { replace: true });
  }, [highlightedPostId, navigate]);

  useEffect(() => {
    if (!canManage || ownerRestaurants.loading) return;
    if (restaurants.length === 0) {
      setComposerRestaurantId(null);
      return;
    }
    if (!composerRestaurantId || !restaurants.some((restaurant) => restaurant.id === composerRestaurantId)) {
      setComposerRestaurantId(restaurants[0].id);
    }
  }, [canManage, composerRestaurantId, ownerRestaurants.loading, restaurants]);

  useEffect(() => {
    let active = true;
    if (isCommercialDemoClient || !user?.id) {
      setUserTrendSignals({ orders: [], reservations: [], clickedPosts: [] });
      return () => {
        active = false;
      };
    }

    loadActualitesUserTrendSignals(user.id)
      .then((signals) => {
        if (active) setUserTrendSignals(signals);
      })
      .catch((error) => {
        console.warn("Actualites personalized trends unavailable", error);
        if (active) setUserTrendSignals({ orders: [], reservations: [], clickedPosts: [] });
      });

    return () => {
      active = false;
    };
  }, [isCommercialDemoClient, user?.id]);

  useEffect(() => {
    const syncClickSignals = () => setLocalClickSignals(readActualitesPostSignals());
    syncClickSignals();

    if (typeof window === "undefined") return;
    const handleStorage = (event: StorageEvent) => {
      if (!event.key || event.key === ACTUALITES_CLICK_SIGNAL_STORAGE_KEY) syncClickSignals();
    };

    window.addEventListener(ACTUALITES_CLICK_SIGNAL_EVENT, syncClickSignals);
    window.addEventListener("storage", handleStorage);
    return () => {
      window.removeEventListener(ACTUALITES_CLICK_SIGNAL_EVENT, syncClickSignals);
      window.removeEventListener("storage", handleStorage);
    };
  }, []);

  const changeScope = (value: string) => {
    const nextScope = normalizeSocialFeedScope(value);
    setScope(nextScope);
    const nextParams = new URLSearchParams(searchParams);
    nextParams.set("scope", nextScope);
    setSearchParams(nextParams, { replace: true });
  };

  const startTrendSearch = (trend: string) => {
    setSearchQuery(`#${trend}`);
  };

  return (
    <main className="min-h-screen overflow-x-hidden bg-[radial-gradient(circle_at_top_left,rgba(249,115,22,0.12),transparent_28rem),linear-gradient(180deg,rgba(255,247,237,0.85),rgba(255,255,255,0.96)_13rem,rgba(248,250,252,0.85))] py-3 md:py-6">
      <h1 className="sr-only">Actualités, plats, offres et événements des restaurants TOK</h1>
      <div className="container grid min-w-0 gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(18rem,21rem)]">
        <section className="min-w-0 max-w-full space-y-2 md:space-y-3">
          <div className="relative overflow-hidden rounded-[1.5rem] border border-orange-100/80 bg-background/95 p-2 shadow-lg shadow-orange-100/35 backdrop-blur md:p-3">
            <div className="relative z-10 flex min-w-0 flex-col gap-2 lg:flex-row lg:items-center">
              <div className="relative min-w-0 flex-1">
                <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="actualites-search"
                  type="search"
                  value={searchQuery}
                  aria-label="Rechercher dans les actualités"
                  aria-describedby="actualites-search-status"
                  data-testid="actualites-search"
                  placeholder="Rechercher un plat, ingrédient, restaurant, cuisine, ville..."
                  className="h-10 rounded-2xl border-orange-100 bg-white pl-10 pr-10 text-sm shadow-sm"
                  onChange={(event) => setSearchQuery(event.target.value)}
                />
                {searchQuery ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="absolute right-1 top-1/2 h-8 w-8 -translate-y-1/2 rounded-full text-muted-foreground hover:bg-orange-50 hover:text-primary"
                    aria-label="Effacer la recherche"
                    onClick={() => setSearchQuery("")}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                ) : null}
              </div>

              {normalizedSearchQuery.length >= 2 ? (
                <Badge variant="outline" className="h-10 justify-center gap-2 rounded-2xl border-orange-200 bg-orange-50 px-4 text-orange-800 lg:w-[29rem]">
                  <Search className="h-4 w-4" aria-hidden="true" />
                  Recherche globale dans tout le fil
                </Badge>
              ) : (
                <Tabs value={scope} onValueChange={changeScope} className="min-w-0 lg:w-[29rem]">
                  <TabsList className="grid h-auto w-full grid-cols-2 gap-1 rounded-2xl bg-muted/50 p-1 sm:grid-cols-5">
                    {SOCIAL_FEED_SCOPES.map((item) => (
                      <TabsTrigger
                        key={item.value}
                        value={item.value}
                        className="min-w-0 whitespace-normal rounded-xl px-1.5 py-2 text-center text-[11px] font-semibold leading-tight data-[state=active]:bg-background data-[state=active]:text-primary data-[state=active]:shadow-sm sm:text-xs"
                      >
                        {item.label}
                      </TabsTrigger>
                    ))}
                  </TabsList>
                </Tabs>
              )}
            </div>
            <p
              id="actualites-search-status"
              role="status"
              aria-live="polite"
              className="px-2 pt-1 text-xs text-muted-foreground"
            >
              {searchLoading
                ? "Recherche dans toutes les actualités…"
                : globalSearchEnabled && !globalSearch.isError
                  ? `${globalSearchTotal} publication${globalSearchTotal > 1 ? "s" : ""} trouvée${globalSearchTotal > 1 ? "s" : ""} dans tout le fil.`
                  : normalizedSearchQuery.length === 1
                    ? "Saisissez au moins deux caractères pour lancer la recherche globale."
                    : normalizedSearchQuery
                      ? `${filteredPosts.length} résultat${filteredPosts.length > 1 ? "s" : ""} visible${filteredPosts.length > 1 ? "s" : ""}.`
                      : "La recherche porte aussi sur les plats, ingrédients et descriptions d’images, sans hashtag."
              }
            </p>
          </div>

          {canManage ? <ActualitesBoostBanner onSponsorClick={() => setSponsorDialogRequest((request) => request + 1)} /> : null}

          {canManage ? (
            <div id="actualites-composer" className="min-w-0 scroll-mt-24 space-y-2">
              {ownerRestaurants.loading ? (
                <div className="rounded-2xl border bg-background/90 p-4 text-sm text-muted-foreground shadow-sm">
                  Chargement de vos restaurants...
                </div>
              ) : ownerRestaurants.error ? (
                <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive shadow-sm">
                  Impossible de charger vos restaurants : {ownerRestaurants.error}
                </div>
              ) : restaurants.length > 0 ? (
                <>
                  <SocialComposer
                    restaurantId={composerRestaurant?.id || null}
                    restaurantName={composerRestaurant?.name || null}
                    socialLinks={composerRestaurant?.socialLinks || null}
                    sponsorDialogRequest={sponsorDialogRequest}
                    compact
                  />
                </>
              ) : (
                <div className="rounded-2xl border bg-background/90 p-4 text-sm text-muted-foreground shadow-sm">
                  Aucun restaurant rattaché à ce compte.
                </div>
              )}
            </div>
          ) : null}

          {globalSearchEnabled && globalSearch.isError ? (
            <div className="flex flex-col gap-3 rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950 shadow-sm sm:flex-row sm:items-center sm:justify-between" role="alert">
              <p>
                La recherche globale est momentanément indisponible. Les résultats déjà chargés restent affichés.
              </p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="shrink-0 rounded-full bg-white"
                onClick={() => globalSearch.refetch()}
                disabled={globalSearch.isFetching}
              >
                <RefreshCw className={`mr-2 h-3.5 w-3.5 ${globalSearch.isFetching ? "animate-spin" : ""}`} />
                Réessayer
              </Button>
            </div>
          ) : null}

          {contentLoading ? (
            <div className="space-y-3">
              {[0, 1, 2].map((item) => (
                <div key={item} className="overflow-hidden rounded-2xl border bg-background/90 p-5 shadow-sm">
                  <div className="flex animate-pulse gap-4">
                    <div className="h-14 w-14 rounded-2xl bg-muted" />
                    <div className="flex-1 space-y-3">
                      <div className="h-4 w-40 rounded bg-muted" />
                      <div className="h-3 w-full rounded bg-muted" />
                      <div className="h-3 w-3/4 rounded bg-muted" />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : contentError ? (
            <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-6 text-sm text-destructive shadow-sm">
              {(contentError as Error).message}
            </div>
          ) : filteredPosts.length > 0 ? (
            <div className="space-y-4" data-testid="actualites-feed">
              {filteredPosts.map((post: SocialFeedPost) => (
                <TrackedSocialPostCard
                  key={post.activityId}
                  post={post}
                  highlighted={post.id === highlightedPostId}
                  source={`actualites:${scope}`}
                />
              ))}
              <div className="flex justify-center pt-2">
                <Button
                  variant="outline"
                  onClick={() => globalSearchEnabled ? globalSearch.fetchNextPage() : feed.fetchNextPage()}
                  disabled={!canLoadMore || isLoadingMore}
                  className="min-w-44 rounded-full"
                >
                  {isLoadingMore ? "Chargement..." : canLoadMore ? "Charger plus" : globalSearchEnabled ? "Tous les résultats sont affichés" : "Fin du fil"}
                </Button>
              </div>
            </div>
          ) : searchQuery.trim() ? (
            <div className="rounded-[2rem] border bg-background/90 p-10 text-center shadow-sm" data-testid="actualites-feed">
              <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                <Search className="h-7 w-7" />
              </div>
              <h2 className="font-display text-xl font-bold">Aucun résultat</h2>
              <p className="mt-2 text-sm text-muted-foreground">
                Essayez un autre #, une ville, un type de cuisine ou le nom d'un restaurant.
              </p>
            </div>
          ) : (
            <div className="rounded-[2rem] border bg-background/90 p-10 text-center shadow-sm" data-testid="actualites-feed">
              <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                <BellRing className="h-7 w-7" />
              </div>
              <h2 className="font-display text-xl font-bold">
                {scope === "saved" ? "Aucun post sauvegardé" : "Aucune actualité pour le moment"}
              </h2>
              <p className="mt-2 text-sm text-muted-foreground">
                {scope === "saved"
                  ? user?.id
                    ? "Les posts enregistrés avec le bouton Sauver apparaîtront ici."
                    : "Connectez-vous pour retrouver les posts que vous sauvegardez."
                  : "Les publications des restaurants apparaîtront ici dès leur mise en ligne."}
              </p>
            </div>
          )}
        </section>

        <aside className="min-w-0 space-y-4 xl:sticky xl:top-28 xl:self-start">
          <Card className="overflow-hidden rounded-[2rem] border-orange-100 bg-background/95 shadow-xl shadow-orange-100/40">
            <CardContent className="space-y-4 p-5">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <span className="flex h-9 w-9 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                    <TrendingUp className="h-4 w-4" />
                  </span>
                  <div>
                    <h2 className="font-semibold">Signal du fil</h2>
                    <p className="text-xs text-muted-foreground">Aperçu de l'activité visible</p>
                  </div>
                </div>
                <Badge variant="outline" className="rounded-full">Live</Badge>
              </div>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <div className="rounded-2xl bg-gradient-to-br from-orange-50 to-white p-3 ring-1 ring-orange-100">
                  <Megaphone className="mb-2 h-4 w-4 text-primary" />
                  <p className="text-xs text-muted-foreground">Posts</p>
                  <p className="text-2xl font-black">{globalSearchEnabled ? globalSearchTotal : posts.length}</p>
                </div>
                <div className="rounded-2xl bg-gradient-to-br from-violet-50 to-white p-3 ring-1 ring-violet-100">
                  <Store className="mb-2 h-4 w-4 text-violet-600" />
                  <p className="text-xs text-muted-foreground">Restaurants</p>
                  <p className="text-2xl font-black">{feedStats.restaurantsCount}</p>
                </div>
                <div className="rounded-2xl bg-gradient-to-br from-emerald-50 to-white p-3 ring-1 ring-emerald-100">
                  <Bookmark className="mb-2 h-4 w-4 text-emerald-600" />
                  <p className="text-xs text-muted-foreground">Sauvegardes</p>
                  <p className="text-2xl font-black">{feedStats.savedCount}</p>
                </div>
                <div className="rounded-2xl bg-gradient-to-br from-amber-50 to-white p-3 ring-1 ring-amber-100">
                  <Flame className="mb-2 h-4 w-4 text-amber-600" />
                  <p className="text-xs text-muted-foreground">Offres</p>
                  <p className="text-2xl font-black">{feedStats.offersCount}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="overflow-hidden rounded-[2rem] border-orange-100 bg-gradient-to-br from-orange-50 via-white to-amber-50 shadow-sm">
            <CardContent className="space-y-4 p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="font-display text-lg font-bold">Boostez votre visibilité</h2>
                  <p className="mt-1 text-sm text-muted-foreground">Publiez un plat fort, ajoutez un média et déclenchez une action claire.</p>
                </div>
                <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-lg shadow-primary/30">
                  <Rocket className="h-5 w-5" />
                </span>
              </div>
              <div className="rounded-2xl bg-white/80 p-3 text-xs text-muted-foreground ring-1 ring-orange-100">
                {feedStats.mediaCount > 0 ? `${feedStats.mediaCount} médias enrichissent déjà le fil.` : "Les posts avec photo ou vidéo retiennent mieux l'attention."}
              </div>
            </CardContent>
          </Card>

          {suggestedRestaurants.length > 0 ? (
            <Card className="rounded-[2rem] bg-background/95 shadow-sm">
              <CardContent className="space-y-3 p-5">
                <div className="flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-primary" />
                  <h2 className="font-semibold">À suivre</h2>
                </div>
                <div className="space-y-2">
                  {suggestedRestaurants.map((post) => (
                    <div key={post.restaurantId} className="flex items-center justify-between gap-2 rounded-2xl bg-muted/60 p-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold">{post.restaurant.name}</p>
                        <p className="truncate text-xs text-muted-foreground">
                          {[post.restaurant.cuisineType, post.restaurant.city].filter(Boolean).join(" · ") || "Restaurant TOK"}
                        </p>
                      </div>
                      <Button size="sm" variant="outline" className="rounded-full" onClick={() => toggleFollow.mutate(post)} disabled={toggleFollow.isPending}>
                        Suivre
                      </Button>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          ) : null}

          <Card className="rounded-[2rem] bg-background/95 shadow-sm">
            <CardContent className="space-y-3 p-5">
              <div className="flex items-center gap-2">
                <Flame className="h-4 w-4 text-primary" />
                <h2 className="font-semibold">Tendances</h2>
              </div>
              {personalizedTrends.map((trend) => (
                <button
                  key={trend}
                  type="button"
                  className="flex w-full items-center justify-between rounded-2xl bg-muted/50 px-3 py-2 text-left text-sm transition hover:bg-orange-50 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
                  aria-label={`Rechercher #${trend}`}
                  onClick={() => startTrendSearch(trend)}
                >
                  <span>#{trend}</span>
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                </button>
              ))}
            </CardContent>
          </Card>
        </aside>
      </div>
    </main>
  );
}
