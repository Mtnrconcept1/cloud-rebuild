import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  BellRing,
  Bookmark,
  ChefHat,
  ChevronRight,
  Flame,
  MapPin,
  Megaphone,
  Newspaper,
  RefreshCw,
  Rocket,
  Sparkles,
  Store,
  TrendingUp,
  Utensils,
} from "lucide-react";

import SocialComposer from "@/components/social/SocialComposer";
import TrackedSocialPostCard from "@/components/social/TrackedSocialPostCard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useInfiniteSocialFeed, useToggleRestaurantFollow } from "@/hooks/useSocialFeed";
import { createActualitesFeedOrderSeed, orderActualitesFeedPosts } from "@/lib/actualitesFeedOrdering";
import { useAuth } from "@/lib/auth-context";
import { SOCIAL_FEED_SCOPES, normalizeSocialFeedScope, type SocialFeedPost, type SocialFeedScope } from "@/lib/socialFeed";
import { useOwnerRestaurants } from "@/pages/dashboard/useOwnerRestaurants";

export default function Actualites() {
  const { role, isSuperAdmin, user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const [scope, setScope] = useState<SocialFeedScope>(() => normalizeSocialFeedScope(searchParams.get("scope")));
  const [feedOrderSeed] = useState(() => createActualitesFeedOrderSeed());
  const [composerRestaurantId, setComposerRestaurantId] = useState<string | null>(null);
  const highlightedPostId = searchParams.get("post");
  const feed = useInfiniteSocialFeed(scope, 12);
  const canManage = role === "restaurateur" || isSuperAdmin;
  const ownerRestaurants = useOwnerRestaurants({ enabled: canManage });
  const rawPosts = useMemo(() => feed.data?.pages.flatMap((page) => page.posts) || [], [feed.data]);
  const posts = useMemo(() => orderActualitesFeedPosts(rawPosts, `${feedOrderSeed}:${scope}`), [feedOrderSeed, rawPosts, scope]);
  const restaurants = useMemo(
    () => canManage ? ownerRestaurants.restaurants : [],
    [canManage, ownerRestaurants.restaurants],
  );
  const composerRestaurant = restaurants.find((restaurant) => restaurant.id === composerRestaurantId) || restaurants[0] || null;
  const toggleFollow = useToggleRestaurantFollow();
  const suggestedRestaurants = useMemo(() => {
    const seen = new Set<string>();
    return posts
      .filter((post) => !post.followedByMe)
      .filter((post) => {
        if (seen.has(post.restaurantId)) return false;
        seen.add(post.restaurantId);
        return true;
      })
      .slice(0, 4);
  }, [posts]);
  const feedStats = useMemo(() => {
    const restaurantsCount = new Set(posts.map((post) => post.restaurantId)).size;
    const offersCount = posts.filter((post) => post.postType === "promo" || post.ctaType === "offer").length;
    const savedCount = posts.filter((post) => post.savedByMe).length;
    const mediaCount = posts.reduce((total, post) => total + post.media.length, 0);

    return { restaurantsCount, offersCount, savedCount, mediaCount };
  }, [posts]);

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

  return (
    <main className="min-h-screen overflow-x-hidden bg-[radial-gradient(circle_at_top_left,rgba(249,115,22,0.14),transparent_34rem),linear-gradient(180deg,rgba(255,247,237,0.9),rgba(255,255,255,0.95)_22rem,rgba(248,250,252,0.85))] py-6 md:py-10">
      <div className="container grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(18rem,21rem)]">
        <section className="min-w-0 space-y-5">
          <div className="relative overflow-hidden rounded-[2rem] border border-orange-100/80 bg-background/90 p-5 shadow-xl shadow-orange-100/50 backdrop-blur md:p-6">
            <div className="pointer-events-none absolute -right-20 -top-24 h-56 w-56 rounded-full bg-primary/10 blur-3xl" />
            <div className="pointer-events-none absolute bottom-0 right-10 h-28 w-28 rounded-full bg-amber-300/20 blur-2xl" />

            <div className="relative flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
              <div className="min-w-0 space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge className="gap-1 rounded-full bg-primary/10 px-3 py-1 text-primary hover:bg-primary/15">
                    <Newspaper className="h-3.5 w-3.5" />
                    Actualités restaurants
                  </Badge>
                  <Badge variant="outline" className="rounded-full border-orange-200 bg-white/70 px-3 py-1">
                    <Flame className="mr-1 h-3.5 w-3.5 text-orange-500" />
                    Offres locales en direct
                  </Badge>
                </div>
                <div>
                  <h1 className="font-display text-3xl font-black tracking-tight text-slate-950 md:text-5xl">
                    Fil restaurant
                  </h1>
                  <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground md:text-base">
                    Découvrez les plats du moment, les coulisses, les tables libres et les offres courtes près de chez vous.
                  </p>
                </div>
                <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                  <span className="inline-flex items-center gap-1 rounded-full bg-white/80 px-3 py-1 shadow-sm ring-1 ring-border/70">
                    <Utensils className="h-3.5 w-3.5 text-primary" />
                    {posts.length} posts
                  </span>
                  <span className="inline-flex items-center gap-1 rounded-full bg-white/80 px-3 py-1 shadow-sm ring-1 ring-border/70">
                    <Store className="h-3.5 w-3.5 text-primary" />
                    {feedStats.restaurantsCount} restaurants
                  </span>
                  <span className="inline-flex items-center gap-1 rounded-full bg-white/80 px-3 py-1 shadow-sm ring-1 ring-border/70">
                    <MapPin className="h-3.5 w-3.5 text-primary" />
                    Suggestions proches
                  </span>
                </div>
              </div>

              <div className="flex flex-col gap-2 sm:flex-row lg:flex-col lg:items-end">
                <Button className="gap-2 rounded-full shadow-lg shadow-primary/20" onClick={() => feed.refetch()} disabled={feed.isFetching}>
                  <RefreshCw className={`h-4 w-4 ${feed.isFetching ? "animate-spin" : ""}`} />
                  Actualiser
                </Button>
                <p className="text-xs text-muted-foreground lg:text-right">Flux enrichi par les publications restaurateurs.</p>
              </div>
            </div>
          </div>

          {canManage ? (
            <div className="space-y-3">
              {ownerRestaurants.loading ? (
                <div className="rounded-2xl border bg-background/90 p-5 text-sm text-muted-foreground shadow-sm">
                  Chargement de vos restaurants...
                </div>
              ) : ownerRestaurants.error ? (
                <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-5 text-sm text-destructive shadow-sm">
                  Impossible de charger vos restaurants : {ownerRestaurants.error}
                </div>
              ) : restaurants.length > 0 ? (
                <>
                  {restaurants.length > 1 ? (
                    <div className="flex flex-wrap items-center gap-2 rounded-2xl border bg-background/90 p-3 shadow-sm">
                      <span className="inline-flex items-center gap-2 px-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        <ChefHat className="h-3.5 w-3.5" />
                        Publier pour
                      </span>
                      {restaurants.map((restaurant) => (
                        <Button
                          key={restaurant.id}
                          type="button"
                          size="sm"
                          variant={restaurant.id === composerRestaurant?.id ? "default" : "outline"}
                          className="rounded-full"
                          onClick={() => setComposerRestaurantId(restaurant.id)}
                        >
                          {restaurant.name}
                        </Button>
                      ))}
                    </div>
                  ) : null}
                  <SocialComposer
                    restaurantId={composerRestaurant?.id || null}
                    restaurantName={composerRestaurant?.name || null}
                    socialLinks={composerRestaurant?.socialLinks || null}
                  />
                </>
              ) : (
                <div className="rounded-2xl border bg-background/90 p-5 text-sm text-muted-foreground shadow-sm">
                  Aucun restaurant rattaché à ce compte.
                </div>
              )}
            </div>
          ) : null}

          <Tabs value={scope} onValueChange={changeScope}>
            <div className="rounded-2xl border bg-background/90 p-2 shadow-sm">
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
          ) : posts.length > 0 ? (
            <div className="space-y-4">
              {posts.map((post: SocialFeedPost) => (
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
          ) : (
            <div className="rounded-[2rem] border bg-background/90 p-10 text-center shadow-sm">
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
              {["Offre midi", "Arrivages", "Coulisses", "Tables libres"].map((trend) => (
                <div key={trend} className="flex items-center justify-between rounded-2xl bg-muted/50 px-3 py-2 text-sm">
                  <span>#{trend}</span>
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                </div>
              ))}
            </CardContent>
          </Card>
        </aside>
      </div>
    </main>
  );
}
