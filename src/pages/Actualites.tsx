import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  BellRing,
  Bookmark,
  ChevronRight,
  Flame,
  MapPin,
  Megaphone,
  Newspaper,
  RefreshCw,
  Rocket,
  Search,
  Sparkles,
  Store,
  TrendingUp,
  Utensils,
  X,
} from "lucide-react";

import SocialComposer from "@/components/social/SocialComposer";
import TrackedSocialPostCard from "@/components/social/TrackedSocialPostCard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useInfiniteSocialFeed, useToggleRestaurantFollow } from "@/hooks/useSocialFeed";
import { createActualitesFeedOrderSeed, orderActualitesFeedPosts } from "@/lib/actualitesFeedOrdering";
import { useAuth } from "@/lib/auth-context";
import { SOCIAL_FEED_SCOPES, normalizeSocialFeedScope, type SocialFeedPost, type SocialFeedScope } from "@/lib/socialFeed";
import { useOwnerRestaurants } from "@/pages/dashboard/useOwnerRestaurants";

const ACTUALITES_TRENDS = ["Offre midi", "Arrivages", "Coulisses", "Tables libres"] as const;

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
  ]
    .filter(Boolean)
    .join(" ");
  return `${normalizeActualitesSearch(fields)} ${compactActualitesSearch(fields)}`;
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
  const [searchParams, setSearchParams] = useSearchParams();
  const [scope, setScope] = useState<SocialFeedScope>(() => normalizeSocialFeedScope(searchParams.get("scope")));
  const [searchQuery, setSearchQuery] = useState("");
  const [feedOrderSeed] = useState(() => createActualitesFeedOrderSeed());
  const [composerRestaurantId, setComposerRestaurantId] = useState<string | null>(null);
  const [sponsorDialogRequest, setSponsorDialogRequest] = useState(0);
  const highlightedPostId = searchParams.get("post");
  const feed = useInfiniteSocialFeed(scope, 12);
  const canManage = role === "restaurateur" || isSuperAdmin;
  const ownerRestaurants = useOwnerRestaurants({ enabled: canManage });
  const rawPosts = useMemo(() => (feed.data?.pages.flatMap((page) => page.posts) || []) as SocialFeedPost[], [feed.data]);
  const posts = useMemo(() => orderActualitesFeedPosts(rawPosts, `${feedOrderSeed}:${scope}`), [feedOrderSeed, rawPosts, scope]);
  const filteredPosts = useMemo(() => {
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
      <div className="container grid min-w-0 gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(18rem,21rem)]">
        <section className="min-w-0 max-w-full space-y-2 md:space-y-3">
          <div className="relative overflow-hidden rounded-[1.5rem] border border-orange-100/80 bg-background/95 p-2 shadow-lg shadow-orange-100/35 backdrop-blur md:p-3">
            <div className="hidden">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge className="gap-1 rounded-full bg-primary/10 px-2.5 py-0.5 text-[11px] text-primary hover:bg-primary/15">
                    <Newspaper className="h-3 w-3" />
                    Actualités restaurants
                  </Badge>
                  <Badge variant="outline" className="hidden rounded-full border-orange-200 bg-white/70 px-2.5 py-0.5 text-[11px] sm:inline-flex">
                    <Flame className="mr-1 h-3 w-3 text-orange-500" />
                    Offres locales en direct
                  </Badge>
                </div>
                <div>
                  <h1 className="mt-1 font-display text-2xl font-black tracking-tight text-slate-950 md:text-3xl">
                    Fil restaurant
                  </h1>
                  <p className="hidden">
                    Découvrez les plats du moment, les coulisses, les tables libres et les offres courtes près de chez vous.
                  </p>
                </div>
                <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                  <span className="inline-flex items-center gap-1 rounded-full bg-white/80 px-2.5 py-0.5 text-[11px] font-medium shadow-sm ring-1 ring-border/70">
                    <Utensils className="h-3 w-3 text-primary" />
                    {filteredPosts.length} posts
                  </span>
                  <span className="inline-flex items-center gap-1 rounded-full bg-white/80 px-2.5 py-0.5 text-[11px] font-medium shadow-sm ring-1 ring-border/70">
                    <Store className="h-3 w-3 text-primary" />
                    {feedStats.restaurantsCount} restaurants
                  </span>
                  <span className="hidden items-center gap-1 rounded-full bg-white/80 px-2.5 py-0.5 text-[11px] font-medium shadow-sm ring-1 ring-border/70">
                    <MapPin className="h-3.5 w-3.5 text-primary" />
                    Suggestions proches
                  </span>
                </div>
                </div>
              </div>

              <div className="flex flex-col gap-2 sm:flex-row lg:items-center">
                <Button size="sm" className="h-9 gap-2 rounded-full px-3 shadow-md shadow-primary/15" onClick={() => feed.refetch()} disabled={feed.isFetching}>
                  <RefreshCw className={`h-3.5 w-3.5 ${feed.isFetching ? "animate-spin" : ""}`} />
                  Actualiser
                </Button>
                <p className="hidden text-xs text-muted-foreground lg:text-right">Flux enrichi par les publications restaurateurs.</p>
              </div>
            </div>

            <div className="relative z-10 flex min-w-0 flex-col gap-2 lg:flex-row lg:items-center">
              <div className="relative min-w-0 flex-1">
                <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="actualites-search"
                  type="search"
                  value={searchQuery}
                  aria-label="Rechercher dans les actualités"
                  data-testid="actualites-search"
                  placeholder="Rechercher par #, restaurant, cuisine, ville..."
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
            </div>
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

          <div className="hidden" aria-hidden="true">
            <div className="flex flex-col gap-3 md:flex-row md:items-center">
              <div className="relative min-w-0 flex-1">
                <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="actualites-search-legacy"
                  type="search"
                  value={searchQuery}
                  aria-label="Rechercher dans les actualités"
                  data-testid="actualites-search-legacy"
                  placeholder="Rechercher par #, restaurant, cuisine, ville..."
                  className="h-12 rounded-2xl border-orange-100 bg-white pl-11 pr-12 shadow-sm"
                  onChange={(event) => setSearchQuery(event.target.value)}
                />
                {searchQuery ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="absolute right-1.5 top-1/2 h-9 w-9 -translate-y-1/2 rounded-full text-muted-foreground hover:bg-orange-50 hover:text-primary"
                    aria-label="Effacer la recherche"
                    onClick={() => setSearchQuery("")}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                ) : null}
              </div>
              <p className="text-xs text-muted-foreground md:w-64">
                {searchQuery.trim()
                  ? `${filteredPosts.length}/${posts.length} post(s) correspondent à votre recherche.`
                  : "Recherchez un #, un restaurant, une cuisine, une ville ou un mot-clé."}
              </p>
            </div>
          </div>

          <Tabs value={scope} onValueChange={changeScope}>
            <div className="hidden">
              <TabsList className="grid h-auto w-full grid-cols-2 gap-1 rounded-xl bg-muted/50 p-1 sm:grid-cols-5">
                {SOCIAL_FEED_SCOPES.map((item) => (
                  <TabsTrigger
                    key={item.value}
                    value={item.value}
                    className="rounded-lg py-2 text-xs font-semibold data-[state=active]:bg-background data-[state=active]:text-primary data-[state=active]:shadow-sm sm:text-sm"
                  >
                    {item.label}
                  </TabsTrigger>
                ))}
              </TabsList>
            </div>
          </Tabs>

          {feed.isLoading ? (
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
          ) : feed.isError ? (
            <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-6 text-sm text-destructive shadow-sm">
              {(feed.error as Error).message}
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
                  onClick={() => feed.fetchNextPage()}
                  disabled={!feed.hasNextPage || feed.isFetchingNextPage}
                  className="min-w-44 rounded-full"
                >
                  {feed.isFetchingNextPage ? "Chargement..." : feed.hasNextPage ? "Charger plus" : "Fin du fil"}
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
                  <p className="text-2xl font-black">{posts.length}</p>
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
              {ACTUALITES_TRENDS.map((trend) => (
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
