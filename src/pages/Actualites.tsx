import { Link } from "react-router-dom";
import { Newspaper, RefreshCw, Store, TrendingUp } from "lucide-react";

import SocialPostCard from "@/components/social/SocialPostCard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useSocialFeed } from "@/hooks/useSocialFeed";
import { useAuth } from "@/lib/auth";

export default function Actualites() {
  const { roles } = useAuth();
  const feed = useSocialFeed(40);
  const posts = feed.data || [];
  const canManage = roles.includes("restaurateur") || roles.includes("admin");

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
            <Button variant="outline" size="sm" className="gap-2" onClick={() => feed.refetch()}>
              <RefreshCw className="h-4 w-4" />
              Actualiser
            </Button>
          </div>

          {feed.isLoading ? (
            <div className="rounded-lg border bg-background p-10 text-center text-muted-foreground">Chargement du fil...</div>
          ) : feed.isError ? (
            <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-6 text-sm text-destructive">
              {(feed.error as Error).message}
            </div>
          ) : posts.length > 0 ? (
            <div className="space-y-4">
              {posts.map((post) => (
                <SocialPostCard key={post.activityId} post={post} />
              ))}
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
              </div>
            </CardContent>
          </Card>

          {canManage ? (
            <Card className="rounded-lg">
              <CardContent className="space-y-3 p-4">
                <div className="flex items-center gap-2">
                  <Store className="h-4 w-4 text-primary" />
                  <h2 className="font-semibold">Restaurateur</h2>
                </div>
                <Button asChild className="w-full gap-2">
                  <Link to="/dashboard/actualites">
                    <Newspaper className="h-4 w-4" />
                    Gerer les posts
                  </Link>
                </Button>
              </CardContent>
            </Card>
          ) : null}
        </aside>
      </div>
    </main>
  );
}
