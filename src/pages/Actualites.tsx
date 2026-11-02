import PageHeading from "@/components/editorial/PageHeading";
import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
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
      className="relative isolate min-h-[20rem] overflow-hidden rounded-[1.5rem] border border-orange-100 bg-[#fff8ee] shadow-xl shadow-orange-100/60 sm:min-h-[17rem]"
    >
      <img
        src="/images/tok-refonte/chef-invitation.webp"
        alt=""
        loading="lazy"
        className="absolute inset-0 h-full w-full object-cover object-left"
      />
      <div className="absolute inset-0 bg-gradient-to-r from-transparent via-[#fff8ee]/45 to-[#fff8ee] max-sm:bg-gradient-to-t max-sm:from-[#fff8ee] max-sm:via-[#fff8ee]/75 max-sm:to-transparent" />
      <div className="relative z-10 flex min-h-[20rem] items-end p-4 sm:min-h-[17rem] sm:items-center sm:justify-end sm:p-5">
        <div className="w-full rounded-[1.25rem] border border-white/80 bg-white/90 p-4 shadow-lg shadow-orange-950/10 backdrop-blur sm:w-[59%] md:w-[55%]">
          <Badge className="mb-2 rounded-full bg-orange-100 text-orange-800 hover:bg-orange-100">Visibilité locale</Badge>
          <h2 className="font-display text-2xl font-bold leading-tight text-slate-950">Votre cuisine mérite d’être remarquée.</h2>
          <p className="mt-1.5 text-sm leading-relaxed text-slate-600">
            Présentez votre plat fort aux gourmands proches de votre restaurant, dès CHF 1.–.
          </p>
          <div className="mt-3 flex flex-wrap gap-2 text-xs font-semibold text-slate-700">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-orange-50 px-2.5 py-1.5"><TrendingUp className="h-3.5 w-3.5 text-primary" /> Plus de visibilité</span>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-orange-50 px-2.5 py-1.5"><BellRing className="h-3.5 w-3.5 text-primary" /> Public local</span>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-orange-50 px-2.5 py-1.5"><Rocket className="h-3.5 w-3.5 text-primary" /> Mise en ligne rapide</span>
          </div>
          <Button type="button" className="mt-4 h-10 w-full rounded-full font-bold shadow-lg shadow-orange-500/20" onClick={onSponsorClick}>
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
  const storyPosts = useMemo(() => {
    const seenRestaurants = new Set<string>();

    return posts
      .filter((post) => {
        if (seenRestaurants.has(post.restaurantId)) return false;
        seenRestaurants.add(post.restaurantId);
        return true;
      })
      .slice(0, 7);
  }, [posts]);
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
    <main className="min-h-screen overflow-x-clip bg-[#fffaf4] py-3 md:py-6">
      <div className="tok-feed-grid container min-w-0">
        <aside className="tok-feed-menu">
          <nav className="grid gap-1 rounded-2xl border bg-card p-3 shadow-soft" aria-label="Votre espace actualités">
            <h2 className="mb-1 font-display text-lg font-bold">Votre espace</h2>
            {SOCIAL_FEED_SCOPES.map((item) => (
              <Button key={item.value} variant={scope === item.value ? "secondary" : "ghost"}
                aria-pressed={scope === item.value} className="min-h-11 justify-start"
                onClick={() => { setSearchQuery(""); changeScope(item.value); }}>
                {item.label}
              </Button>
            ))}
          </nav>
          <section className="tok-chef-invitation">
            <div><h2>Faites parler de votre resto</h2>
              <Link className="mt-2 inline-flex min-h-11 items-center text-sm font-semibold underline" to="/restaurateurs/geneve">Découvrir TOK Pro</Link>
            </div>
          </section>
        </aside>
        <section className="min-w-0 max-w-full space-y-2 md:space-y-3">
          <div data-testid="actualites-hero">
            <PageHeading title="Le rendez-vous des gourmands." description="Les bonnes adresses se partagent." mascot="megaphone" />
          </div>
          <div className="relative overflow-hidden rounded-[1.5rem] border border-orange-100/80 bg-background/95 p-2 shadow-lg shadow-orange-100/35 backdrop-blur md:p-3">
            <div className="relative z-10 flex min-w-0 flex-col gap-2">
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
                <Badge variant="outline" className="h-10 justify-center gap-2 rounded-2xl border-orange-200 bg-orange-50 px-4 text-orange-800 w-full">
                  <Search className="h-4 w-4" aria-hidden="true" />
                  Recherche globale dans tout le fil
                </Badge>
              ) : (
                <Tabs value={scope} onValueChange={changeScope} className="min-w-0 w-full">
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

        {storyPosts.length > 0 || canManage ? (
          <section aria-labelledby="actualites-stories-title" className="rounded-[1.5rem] border border-orange-100 bg-white/90 p-3 shadow-sm sm:p-4">
            <div className="mb-3 flex items-center justify-between gap-3 px-1">
              <div>
                <h2 id="actualites-stories-title" className="font-display text-lg font-bold text-slate-950">À découvrir aujourd’hui</h2>
                <p className="text-xs text-slate-500">Un aperçu des dernières tables qui font parler d’elles.</p>
              </div>
              <Badge variant="outline" className="hidden rounded-full border-orange-200 text-orange-800 sm:inline-flex">En direct</Badge>
            </div>
            <div className="flex min-w-0 gap-3 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" data-testid="actualites-stories">
              {canManage ? (
                <button
                  type="button"
                  className="group flex w-[4.75rem] shrink-0 flex-col items-center gap-1.5 text-center"
                  onClick={() => document.getElementById("actualites-composer")?.scrollIntoView({ behavior: "smooth", block: "start" })}
                >
                  <span className="flex h-16 w-16 items-center justify-center rounded-full border-2 border-dashed border-orange-300 bg-orange-50 text-2xl font-light text-primary transition group-hover:border-primary group-hover:bg-orange-100">+</span>
                  <span className="line-clamp-2 text-[11px] font-semibold leading-tight text-slate-700">Votre actualité</span>
                </button>
              ) : null}
              {storyPosts.map((post) => {
                const storyImage = post.media.find((media) => media.mediaType === "image")?.mediaUrl || post.restaurant.imageUrl;

                return (
                  <button
                    key={post.restaurantId}
                    type="button"
                    className="group flex w-[4.75rem] shrink-0 flex-col items-center gap-1.5 text-center"
                    aria-label={`Voir l’actualité de ${post.restaurant.name}`}
                    onClick={() => navigate(`/actualites/${encodeURIComponent(post.id)}`)}
                  >
                    <span className="rounded-full bg-gradient-to-br from-orange-400 via-primary to-amber-300 p-[2px] shadow-sm transition group-hover:scale-[1.04]">
                      <span className="flex h-[3.75rem] w-[3.75rem] items-center justify-center overflow-hidden rounded-full border-2 border-white bg-orange-50">
                        {storyImage ? (
                          <img src={storyImage} alt="" loading="lazy" className="h-full w-full object-cover" />
                        ) : (
                          <Store className="h-5 w-5 text-primary" aria-hidden="true" />
                        )}
                      </span>
                    </span>
                    <span className="line-clamp-2 text-[11px] font-semibold leading-tight text-slate-700 group-hover:text-primary">{post.restaurant.name}</span>
                  </button>
                );
              })}
            </div>
          </section>
        ) : null}


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
