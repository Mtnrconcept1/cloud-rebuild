import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Newspaper, RefreshCw, Sparkles, TrendingUp } from "lucide-react";

import SocialComposer from "@/components/social/SocialComposer";
import TrackedSocialPostCard from "@/components/social/TrackedSocialPostCard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useInfiniteSocialFeed, useToggleRestaurantFollow } from "@/hooks/useSocialFeed";
import { useAuth } from "@/lib/auth";
import { SOCIAL_FEED_SCOPES, normalizeSocialFeedScope, type SocialFeedPost, type SocialFeedScope } from "@/lib/socialFeed";
import { useOwnerRestaurants } from "@/pages/dashboard/useOwnerRestaurants";

export default function Actualites() {
  const { role, isSuperAdmin } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const [scope, setScope] = useState<SocialFeedScope>(() => normalizeSocialFeedScope(searchParams.get("scope")));
  const [composerRestaurantId, setComposerRestaurantId] = useState<string | null>(null);
  const highlightedPostId = searchParams.get("post");
  const feed = useInfiniteSocialFeed(scope, 12);
  const canManage = role === "restaurateur" || isSuperAdmin;
  const ownerRestaurants = useOwnerRestaurants({ enabled: canManage });
  const posts = useMemo(() => feed.data?.pages.flatMap((page) => page.posts) || [], [feed.data]);
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
    <main className="min-h-screen bg-muted/25 py-6 md:py-10">
      <div className="container grid gap-6 lg:grid-cols-[minmax(0,1fr)_19rem]">
        <section className="min-w-0 space-y-4">
          <div className="flex flex-col gap-3 rounded-lg border bg-background p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <div className="mb-2 flex items-center gap-2">
                <Newspaper className="h-5 w-5 text-primary" />
                <Badge variant="secondary" className="rounded-full">Actualites</Badge>
              </div>
              <h1 className="font-display text-2xl font-bold tracking-tight md:text-3xl">Fil restaurant</h1>
            </div>
            <Button variant="outline" size="sm" className="gap-2" onClick={() => feed.refetch()} disabled={feed.isFetching}>
              <RefreshCw className="h-4 w-4" />
              Actualiser
            </Button>
          </div>

          {canManage ? (
            <div className="space-y-3">
              {ownerRestaurants.loading ? (
                <div className="rounded-lg border bg-background p-4 text-sm text-muted-foreground">
                  Chargement de vos restaurants...
                </div>
              ) : ownerRestaurants.error ? (
                <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
                  Impossible de charger vos restaurants : {ownerRestaurants.error}
                </div>
              ) : restaurants.length > 0 ? (
                <>
                  {restaurants.length > 1 ? (
                    <div className="flex flex-wrap gap-2 rounded-lg border bg-background p-3">
                      {restaurants.map((restaurant) => (
                        <Button
                          key={restaurant.id}
                          type="button"
                          size="sm"
                          variant={restaurant.id === composerRestaurant?.id ? "default" : "outline"}
                          onClick={() => setComposerRestaurantId(restaurant.id)}
                        >
                          {restaurant.name}
                        </Button>
                      ))}
                    </div>
                  ) : null}
                  <SocialComposer restaurantId={composerRestaurant?.id || null} restaurantName={composerRestaurant?.name || null} />
                </>
              ) : (
                <div className="rounded-lg border bg-background p-4 text-sm text-muted-foreground">
                  Aucun restaurant rattache a ce compte.
                </div>
              )}
            </div>
          ) : null}

          <Tabs value={scope} onValueChange={changeScope}>
            <TabsList className="grid h-auto w-full grid-cols-2 gap-1 rounded-lg bg-background p-1 shadow-sm sm:grid-cols-4">
              {SOCIAL_FEED_SCOPES.map((item) => (
                <TabsTrigger key={item.value} value={item.value} className="rounded-md text-xs sm:text-sm">
                  {item.label}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>

          {feed.isLoading ? (
            <div className="rounded-lg border bg-background p-10 text-center text-muted-foreground">Chargement du fil...</div>
          ) : feed.isError ? (
            <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-6 text-sm text-destructive">
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
              <div className="flex justify-center">
                <Button
                  variant="outline"
                  onClick={() => feed.fetchNextPage()}
                  disabled={!feed.hasNextPage || feed.isFetchingNextPage}
                  className="min-w-40"
                >
                  {feed.isFetchingNextPage ? "Chargement..." : feed.hasNextPage ? "Charger plus" : "Fin du fil"}
                </Button>
              </div>
            </div>
          ) : (
            <div className="rounded-lg border bg-background p-10 text-center text-muted-foreground">Aucune actualite pour le moment.</div>
          )}
        </section>

        <aside className="space-y-4 lg:sticky lg:top-28 lg:self-start">
          <Card className="rounded-lg">
            <CardContent className="space-y-4 p-4">
              <div className="flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-primary" />
                <h2 className="font-semibold">Signal du fil</h2>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="rounded-lg bg-muted p-3">
                  <p className="text-xs text-muted-foreground">Posts</p>
                  <p className="text-2xl font-bold">{posts.length}</p>
                </div>
                <div className="rounded-lg bg-muted p-3">
                  <p className="text-xs text-muted-foreground">Restaurants</p>
                  <p className="text-2xl font-bold">{new Set(posts.map((post) => post.restaurantId)).size}</p>
                </div>
                <div className="rounded-lg bg-muted p-3">
                  <p className="text-xs text-muted-foreground">Sauvegardes</p>
                  <p className="text-2xl font-bold">{posts.filter((post) => post.savedByMe).length}</p>
                </div>
                <div className="rounded-lg bg-muted p-3">
                  <p className="text-xs text-muted-foreground">Offres</p>
                  <p className="text-2xl font-bold">{posts.filter((post) => post.postType === "promo" || post.ctaType === "offer").length}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {suggestedRestaurants.length > 0 ? (
            <Card className="rounded-lg">
              <CardContent className="space-y-3 p-4">
                <div className="flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-primary" />
                  <h2 className="font-semibold">A suivre</h2>
                </div>
                <div className="space-y-2">
                  {suggestedRestaurants.map((post) => (
                    <div key={post.restaurantId} className="flex items-center justify-between gap-2 rounded-lg bg-muted p-2">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{post.restaurant.name}</p>
                        <p className="truncate text-xs text-muted-foreground">
                          {[post.restaurant.cuisineType, post.restaurant.city].filter(Boolean).join(" - ")}
                        </p>
                      </div>
                      <Button size="sm" variant="outline" onClick={() => toggleFollow.mutate(post)} disabled={toggleFollow.isPending}>
                        Suivre
                      </Button>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          ) : null}

        </aside>
      </div>
    </main>
  );
}
