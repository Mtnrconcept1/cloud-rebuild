import { BarChart3, Eye, MessageCircle, MousePointerClick, Newspaper, Repeat2, Share2, ThumbsUp } from "lucide-react";

import DashboardLayout from "@/components/DashboardLayout";
import DashboardPageHero from "@/components/dashboard/DashboardPageHero";
import SocialComposer from "@/components/social/SocialComposer";
import SocialPostCard from "@/components/social/SocialPostCard";
import { Card, CardContent } from "@/components/ui/card";
import { useRestaurantSocialPosts, useSocialInsights } from "@/hooks/useSocialFeed";
import { useDashboardRestaurant } from "@/pages/dashboard/DashboardContext";

export default function DashboardActualites() {
  const { selectedId, restaurants, loading, error } = useDashboardRestaurant();
  const selectedRestaurant = restaurants.find((restaurant) => restaurant.id === selectedId) || null;
  const postsQuery = useRestaurantSocialPosts(selectedId);
  const insightsQuery = useSocialInsights(selectedId);
  const posts = postsQuery.data || [];
  const insights = insightsQuery.data;
  const publishedCount = posts.filter((post) => post.status === "published").length;
  const hiddenCount = posts.filter((post) => post.status !== "published").length;
  const interactions = posts.reduce(
    (total, post) => total + post.likesCount + post.commentsCount + post.repostsCount + post.sharesCount,
    0,
  );

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <DashboardPageHero
          badge="Fil social"
          title="Actualites"
          description="Publiez les temps forts du restaurant et suivez les reactions des clients."
          icon={Newspaper}
          tone="sky"
          stats={[
            { label: "Publies", value: insights?.publishedCount ?? publishedCount, icon: Newspaper },
            { label: "Interactions", value: insights?.interactions ?? interactions, icon: ThumbsUp },
            { label: "Masques", value: insights?.hiddenCount ?? hiddenCount, icon: MessageCircle },
          ]}
        />

        {loading ? <p className="text-muted-foreground">Chargement des restaurants...</p> : null}
        {error ? <p className="text-destructive">Erreur restaurants : {error}</p> : null}
        {!loading && restaurants.length === 0 ? (
          <Card className="rounded-lg">
            <CardContent className="p-8 text-center text-muted-foreground">Aucun restaurant disponible.</CardContent>
          </Card>
        ) : null}

        {selectedRestaurant ? (
          <div className="grid gap-6 xl:grid-cols-[minmax(0,24rem)_minmax(0,1fr)]">
            <div className="space-y-4">
              <SocialComposer restaurantId={selectedRestaurant.id} restaurantName={selectedRestaurant.name} />
              <div className="grid grid-cols-2 gap-3">
                <Card className="rounded-lg">
                  <CardContent className="p-4">
                    <p className="text-xs text-muted-foreground">Impressions</p>
                    <p className="text-2xl font-bold">{insights?.impressions ?? 0}</p>
                  </CardContent>
                </Card>
                <Card className="rounded-lg">
                  <CardContent className="p-4">
                    <p className="text-xs text-muted-foreground">Clics CTA</p>
                    <p className="text-2xl font-bold">{insights?.ctaClicks ?? 0}</p>
                  </CardContent>
                </Card>
                <Card className="rounded-lg">
                  <CardContent className="p-4">
                    <p className="text-xs text-muted-foreground">Commentaires</p>
                    <p className="text-2xl font-bold">{posts.reduce((sum, post) => sum + post.commentsCount, 0)}</p>
                  </CardContent>
                </Card>
                <Card className="rounded-lg">
                  <CardContent className="p-4">
                    <p className="text-xs text-muted-foreground">Reposts</p>
                    <p className="text-2xl font-bold">{posts.reduce((sum, post) => sum + post.repostsCount, 0)}</p>
                  </CardContent>
                </Card>
                <Card className="rounded-lg">
                  <CardContent className="p-4">
                    <p className="text-xs text-muted-foreground">Reactions</p>
                    <p className="text-2xl font-bold">{posts.reduce((sum, post) => sum + post.likesCount, 0)}</p>
                  </CardContent>
                </Card>
                <Card className="rounded-lg">
                  <CardContent className="p-4">
                    <p className="text-xs text-muted-foreground">Sauvegardes</p>
                    <p className="text-2xl font-bold">{insights?.saves ?? 0}</p>
                  </CardContent>
                </Card>
                <Card className="rounded-lg">
                  <CardContent className="p-4">
                    <p className="text-xs text-muted-foreground">Taux engagement</p>
                    <p className="text-2xl font-bold">{insights?.engagementRate ?? 0}%</p>
                  </CardContent>
                </Card>
              </div>
            </div>

            <section className="space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="font-display text-xl font-semibold">Posts</h2>
                <div className="flex items-center gap-3 text-sm text-muted-foreground">
                  <span className="inline-flex items-center gap-1"><Eye className="h-4 w-4" /> {insights?.impressions ?? 0}</span>
                  <span className="inline-flex items-center gap-1"><MousePointerClick className="h-4 w-4" /> {insights?.clicks ?? 0}</span>
                  <span className="inline-flex items-center gap-1"><Repeat2 className="h-4 w-4" /> {posts.reduce((sum, post) => sum + post.repostsCount, 0)}</span>
                  <span className="inline-flex items-center gap-1"><Share2 className="h-4 w-4" /> {posts.reduce((sum, post) => sum + post.sharesCount, 0)}</span>
                  <span className="inline-flex items-center gap-1"><BarChart3 className="h-4 w-4" /> {insights?.interactions ?? interactions}</span>
                </div>
              </div>
              {postsQuery.isLoading ? (
                <Card className="rounded-lg"><CardContent className="p-8 text-center text-muted-foreground">Chargement...</CardContent></Card>
              ) : posts.length > 0 ? (
                posts.map((post) => <SocialPostCard key={post.id} post={post} compact />)
              ) : (
                <Card className="rounded-lg"><CardContent className="p-8 text-center text-muted-foreground">Aucun post publie.</CardContent></Card>
              )}
            </section>
          </div>
        ) : null}
      </div>
    </DashboardLayout>
  );
}
