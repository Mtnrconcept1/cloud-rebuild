import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { BellRing, Bookmark, ChevronRight, RefreshCw, Search } from "lucide-react";
import SocialComposer from "@/components/social/SocialComposer";
import SocialEditorialLayout from "@/components/social/SocialEditorialLayout";
import TrackedSocialPostCard from "@/components/social/TrackedSocialPostCard";
import { useCommercialDemoFrame } from "@/components/commercial/CommercialDemoFrameProvider";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useInfiniteSocialFeed, useSearchActualitesPosts, useRestaurantActualitesAccess, useToggleRestaurantFollow } from "@/hooks/useSocialFeed";
import { useSeoMeta } from "@/hooks/useSeoMeta";
import { getSupabase } from "@/integrations/supabase/client";
import { createActualitesFeedOrderSeed, orderActualitesFeedPosts } from "@/lib/actualitesFeedOrdering";
import { ACTUALITES_CLICK_SIGNAL_EVENT, ACTUALITES_CLICK_SIGNAL_STORAGE_KEY, buildPersonalizedActualitesTrends, readActualitesPostSignals, type ActualitesOrderTrendSignal, type ActualitesPostClickSignal, type ActualitesReservationTrendSignal } from "@/lib/actualitesPersonalizedTrends";
import { useAuth } from "@/lib/auth-context";
import { getRoleHomePath } from "@/lib/roleAccess";
import { normalizeSocialFeedScope, type SocialFeedPost, type SocialFeedScope } from "@/lib/socialFeed";
import { useOwnerRestaurants, type OwnedRestaurant } from "@/pages/dashboard/useOwnerRestaurants";

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

type ActualitesFeedProps = {
  dashboard?: boolean;
  managedRestaurant?: OwnedRestaurant | null;
  restaurantSelector?: ReactNode;
  statistics?: ReactNode;
  management?: ReactNode;
};

export function ActualitesFeed({ dashboard = false, managedRestaurant, restaurantSelector, statistics, management }: ActualitesFeedProps = {}) {
  const { role, isSuperAdmin, user } = useAuth();
  const commercialDemoFrame = useCommercialDemoFrame();
  const isCommercialDemoClient = commercialDemoFrame?.surface === "client";
  const isCommercialDemo = commercialDemoFrame != null;
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [city, setCity] = useState("");
  const [composerDialogRequests, setComposerDialogRequests] = useState({
    restaurantId: null as string | null,
    open: 0,
    sponsor: 0,
  });
  const reels = searchParams.get("view") === "reels";
  const [scope, setScope] = useState<SocialFeedScope>(() => normalizeSocialFeedScope(searchParams.get("scope")));
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState("");
  const [localClickSignals, setLocalClickSignals] = useState(() => isCommercialDemo ? [] : readActualitesPostSignals());
  const [userTrendSignals, setUserTrendSignals] = useState<ActualitesUserTrendSignals>({
    orders: [],
    reservations: [],
    clickedPosts: [],
  });
  const [feedOrderSeed] = useState(() => createActualitesFeedOrderSeed());
  const [composerRestaurantId, setComposerRestaurantId] = useState<string | null>(null);
  const highlightedPostId = searchParams.get("post");
  const feed = useInfiniteSocialFeed(scope, 12);
  const globalSearch = useSearchActualitesPosts(debouncedSearchQuery, 20);
  const canManage = !isCommercialDemoClient && (role === "restaurateur" || isSuperAdmin);
  const ownerRestaurants = useOwnerRestaurants({ enabled: canManage && !dashboard });
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
    () => canManage ? (dashboard ? (managedRestaurant ? [managedRestaurant] : []) : ownerRestaurants.restaurants) : [],
    [canManage, dashboard, managedRestaurant, ownerRestaurants.restaurants],
  );
  const composerRestaurant = restaurants.find((restaurant) => restaurant.id === composerRestaurantId) || restaurants[0] || null;
  const activeComposerRestaurantId = composerRestaurant?.id || null;
  // A newly mounted restaurant composer must not consume another restaurant's request.
  const composerOpenRequest = composerDialogRequests.restaurantId === activeComposerRestaurantId ? composerDialogRequests.open : 0;
  const sponsorDialogRequest = composerDialogRequests.restaurantId === activeComposerRestaurantId ? composerDialogRequests.sponsor : 0;
  const composerAccess = useRestaurantActualitesAccess(composerRestaurant?.id || null);
  const toggleFollow = useToggleRestaurantFollow();
  const suggestedRestaurants = useMemo(() => {
    const seen = new Set<string>();
    return filteredPosts
      .filter((post) => !post.followedByMe)
      .filter((post) => !city || normalizeActualitesSearch(post.restaurant.city || "") === normalizeActualitesSearch(city))
      .filter((post) => {
        if (seen.has(post.restaurantId)) return false;
        seen.add(post.restaurantId);
        return true;
      })
      .slice(0, 4);
  }, [city, filteredPosts]);
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



  useEffect(() => {
    setComposerDialogRequests({ restaurantId: activeComposerRestaurantId, open: 0, sponsor: 0 });
  }, [activeComposerRestaurantId]);

  useEffect(() => {
    setScope(normalizeSocialFeedScope(searchParams.get("scope")));
  }, [searchParams]);

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
    if (isCommercialDemo || !user?.id) {
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
  }, [isCommercialDemo, user?.id]);

  useEffect(() => {
    if (isCommercialDemo) { setLocalClickSignals([]); return; }
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
  }, [isCommercialDemo]);

  const changeScope = (value: string) => {
    const nextScope = normalizeSocialFeedScope(value);
    setScope(nextScope);
    const nextParams = new URLSearchParams(searchParams);
    nextParams.set("scope", nextScope);
    nextParams.delete("view");
    setSearchParams(nextParams, { replace: true });
  };

  const startTrendSearch = (trend: string) => {
    setSearchQuery(`#${trend}`);
  };

  const requestComposer = (sponsored = false) => {
    if (!activeComposerRestaurantId) return;
    setComposerDialogRequests((current) => {
      const sameRestaurant = current.restaurantId === activeComposerRestaurantId;
      return {
        restaurantId: activeComposerRestaurantId,
        open: (sameRestaurant ? current.open : 0) + 1,
        sponsor: (sameRestaurant ? current.sponsor : 0) + (sponsored ? 1 : 0),
      };
    });
  };

  const visiblePosts = filteredPosts.filter((post) =>
    (!city || normalizeActualitesSearch(post.restaurant.city || "") === normalizeActualitesSearch(city))
    && (!reels || post.media.some((media) => media.mediaType === "video")),
  );
  const cities = [...new Set([
    city,
    ...posts.map((post) => post.restaurant.city),
    ...globallyMatchedPosts.map((post) => post.restaurant.city),
  ].filter((value): value is string => Boolean(value)))].sort((a, b) => a.localeCompare(b, "fr"));
  const restaurantImage = posts.find((post) => post.restaurantId === composerRestaurant?.id)?.restaurant.imageUrl;
  const showReels = () => {
    setSearchQuery("");
    setScope("for_you");
    const next = new URLSearchParams(searchParams);
    next.set("view", "reels");
    next.set("scope", "for_you");
    setSearchParams(next, { replace: true });
  };

  return (
    <SocialEditorialLayout
      dashboard={dashboard}
      canCreate={canManage && Boolean(composerRestaurant)}
      restaurantName={composerRestaurant?.name}
      restaurantImage={restaurantImage}
      restaurantSelector={restaurantSelector || (composerRestaurant ? <label className="tok-social-identity">
        <Avatar className="tok-social-account"><AvatarImage src={restaurantImage || undefined} alt="" /><AvatarFallback>{composerRestaurant.name.slice(0, 2)}</AvatarFallback></Avatar>
        <span className="sr-only">Restaurant actif</span>
        <select value={composerRestaurant.id} onChange={(event) => setComposerRestaurantId(event.target.value)} aria-label="Restaurant actif" className="min-w-0 w-full bg-transparent py-2 text-sm font-semibold">
          {restaurants.map((restaurant) => <option key={restaurant.id} value={restaurant.id}>{restaurant.name}</option>)}
        </select>
      </label> : null)}
      profileHref={!user ? "/auth" : role === "restaurateur" ? "/dashboard/mon-compte-facturation" : role === "client" ? "/profil" : getRoleHomePath(role)}
      scope={scope}
      onScopeChange={changeScope}
      search={searchQuery}
      onSearchChange={setSearchQuery}
      city={city}
      cities={cities}
      onCityChange={setCity}
      reels={reels}
      onReels={showReels}
      onCreate={() => requestComposer()}
      stories={storyPosts}
      suggestions={suggestedRestaurants.filter((post) => post.restaurantId !== composerRestaurant?.id)}
      onFollow={(post) => toggleFollow.mutate(post)}
      following={toggleFollow.isPending}
      statistics={statistics}
      secondary={
        <details className="mt-5 border-t pt-4 text-sm">
          <summary className="cursor-pointer text-muted-foreground">Explorer le fil</summary>
          <div className="mt-3 grid gap-2">
            <button type="button" className="min-h-10 text-left" onClick={() => changeScope("offers")}>Les offres des restaurants</button>
            {personalizedTrends.map((trend) => <button key={trend} type="button" aria-label={`Rechercher #${trend}`} onClick={() => startTrendSearch(trend)} className="flex min-h-10 items-center justify-between text-left">#{trend}<ChevronRight size={14} /></button>)}
            <p className="text-xs text-muted-foreground">{feedStats.restaurantsCount} restaurants · {feedStats.offersCount} offres</p>
            {canManage ? <button type="button" className="min-h-10 text-left text-primary" onClick={() => requestComposer(true)}>Sponsoriser une publication</button> : null}
          </div>
        </details>
      }
    >
      <p id="actualites-search-status" role="status" aria-live="polite" className={normalizedSearchQuery ? "tok-social-search-status" : "sr-only"}>
        {searchLoading ? "Recherche dans toutes les actualités…" : globalSearchEnabled && !globalSearch.isError
          ? `${globalSearchTotal} publication${globalSearchTotal > 1 ? "s" : ""} trouvée${globalSearchTotal > 1 ? "s" : ""} dans tout le fil.`
          : normalizedSearchQuery.length === 1 ? "Saisissez au moins deux caractères pour lancer la recherche globale."
          : "Recherchez un plat, un ingrédient, un restaurant ou une ville, sans hashtag."}
      </p>
      {city || normalizedSearchQuery ? <div className="tok-social-active-filters" aria-label="Filtres actifs">
        <p>{city ? `Ville : ${city}` : "Toutes les villes"}{normalizedSearchQuery ? ` · « ${normalizedSearchQuery} »` : ""}</p>
        <button type="button" onClick={() => { setCity(""); setSearchQuery(""); setDebouncedSearchQuery(""); }}>Effacer les filtres</button>
      </div> : null}
      {canManage ? (
        <div id="actualites-composer" className="min-w-0 scroll-mt-24">
          {!dashboard && ownerRestaurants.loading ? <p role="status" className="mb-4 text-sm text-muted-foreground">Chargement de vos restaurants…</p>
            : !dashboard && ownerRestaurants.error ? <p role="alert" className="mb-4 text-sm text-destructive">Impossible de charger vos restaurants : {ownerRestaurants.error}</p>
            : composerRestaurant ? <SocialComposer
              key={composerRestaurant.id}
              restaurantId={composerRestaurant.id}
              restaurantName={composerRestaurant.name}
              restaurantImage={restaurantImage}
              socialLinks={composerRestaurant.socialLinks || null}
              sponsorDialogRequest={sponsorDialogRequest}
              actualitesAccess={composerAccess.data || null}
              actualitesAccessLoading={composerAccess.isLoading}
              editorial compact openRequest={composerOpenRequest}
            /> : <p className="mb-4 text-sm text-muted-foreground">Aucun restaurant rattaché à ce compte.</p>}
        </div>
      ) : null}
      {management ? <div className="mb-3 flex flex-wrap items-center justify-end gap-2">{management}<span className="md:hidden">{statistics}</span></div> : null}
      {globalSearchEnabled && globalSearch.isError ? <div role="alert" className="mb-4 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950"><p>La recherche globale est momentanément indisponible. Les résultats déjà chargés restent affichés.</p><Button variant="outline" size="sm" className="mt-2" onClick={() => globalSearch.refetch()} disabled={globalSearch.isFetching}><RefreshCw className="mr-2 h-4 w-4" />Réessayer</Button></div> : null}
      {contentLoading ? <div role="status" aria-label="Chargement des actualités" className="space-y-4">{[0, 1].map((item) => <div key={item} className="rounded-2xl border bg-card p-4"><div className="mb-4 h-10 w-2/3 animate-pulse rounded-lg bg-muted" /><div className="aspect-[1.8] animate-pulse rounded-xl bg-muted" /></div>)}</div>
        : contentError ? <div role="alert" className="rounded-2xl border border-destructive/30 bg-destructive/5 p-6 text-sm"><p>{(contentError as Error).message}</p><Button className="mt-3" variant="outline" onClick={() => feed.refetch()}>Réessayer</Button></div>
        : visiblePosts.length ? <div className="tok-social-feed-list" data-testid="actualites-feed">{visiblePosts.map((post: SocialFeedPost) => <TrackedSocialPostCard key={post.activityId} post={post} editorial highlighted={post.id === highlightedPostId} source={`actualites:${scope}`} />)}</div>
        : <div className="rounded-2xl border bg-card px-5 py-9 text-center" data-testid="actualites-feed">
          {searchQuery.trim() || city ? <Search className="mx-auto mb-3 h-7 w-7 text-primary" /> : scope === "saved" ? <Bookmark className="mx-auto mb-3 h-7 w-7 text-primary" /> : <BellRing className="mx-auto mb-3 h-7 w-7 text-primary" />}
          <h2 className="font-display text-xl font-bold">{searchQuery.trim() || city ? "Aucun résultat" : reels ? "Aucun Reel dans ces publications" : scope === "saved" ? "Aucun post sauvegardé" : "Aucune actualité pour le moment"}</h2>
          <p className="mt-2 text-sm text-muted-foreground">{searchQuery.trim() || city ? "Essayez une autre envie, une ville ou le nom d’un restaurant." : reels ? "Les vidéos publiées par les restaurants apparaissent ici. Vous pouvez aussi charger les publications suivantes." : scope === "saved" ? user?.id ? "Les posts enregistrés avec le bouton Sauver apparaîtront ici." : "Connectez-vous pour retrouver les posts que vous sauvegardez." : "Les publications des restaurants apparaîtront ici dès leur mise en ligne."}</p>
          {!user?.id && scope === "saved" ? <Link className="mt-3 inline-block text-primary underline" to="/auth?next=%2Factualites%3Fscope%3Dsaved">Se connecter</Link> : null}
        </div>}
      {!contentLoading && !contentError && (canLoadMore || visiblePosts.length > 0) ? <div className="flex justify-center py-5"><Button variant="outline" onClick={() => globalSearchEnabled ? globalSearch.fetchNextPage() : feed.fetchNextPage()} disabled={!canLoadMore || isLoadingMore} className="min-h-11 min-w-44 rounded-full">{isLoadingMore ? "Chargement…" : canLoadMore ? "Charger plus" : globalSearchEnabled ? "Tous les résultats sont affichés" : "Fin du fil"}</Button></div> : null}
    </SocialEditorialLayout>
  );
}

export default function Actualites() {
  useSeoMeta({
    title: "Actualités des restaurants à Genève et en Suisse romande | TOK",
    description: "Découvrez les plats, nouveautés, offres et événements publiés par les restaurants locaux sur TOK, sans avoir besoin de connaître un hashtag.",
    path: "/actualites",
    jsonLd: ACTUALITES_SEO_JSON_LD,
  });
  return <ActualitesFeed />;
}
