import {
  BarChart3,
  CalendarClock,
  Eye,
  Megaphone,
  MousePointerClick,
  Newspaper,
  Repeat2,
  Share2,
  Target,
  ThumbsUp,
  TrendingUp,
} from "lucide-react";

import DashboardLayout from "@/components/DashboardLayout";
import DashboardPageHero from "@/components/dashboard/DashboardPageHero";
import SocialComposer from "@/components/social/SocialComposer";
import SocialPostCard from "@/components/social/SocialPostCard";
import { Card, CardContent } from "@/components/ui/card";
import { useRestaurantSocialPosts, useSocialInsights } from "@/hooks/useSocialFeed";
import { SOCIAL_MARKETING_GOALS } from "@/lib/socialFeed";
import { useDashboardRestaurant } from "@/pages/dashboard/DashboardContext";

export default function DashboardActualites() {
  const { selectedId, restaurants, loading, error } = useDashboardRestaurant();
  const selectedRestaurant = restaurants.find((restaurant) => restaurant.id === selectedId) || null;
  const postsQuery = useRestaurantSocialPosts(selectedId);
  const insightsQuery = useSocialInsights(selectedId);
  const posts = postsQuery.data || [];
  const insights = insightsQuery.data;
  const publishedCount = posts.filter((post) => post.status === "published").length;
  const interactions = posts.reduce(
    (total, post) => total + post.likesCount + post.commentsCount + post.repostsCount + post.sharesCount,
    0,
  );
  const campaignGoals = insights?.campaignGoals || {};
  const topGoal = SOCIAL_MARKETING_GOALS
    .map((goal) => ({ ...goal, count: Number(campaignGoals[goal.value] || 0) }))
    .sort((a, b) => b.count - a.count)[0];
  const conversionFocus = insights?.conversionFocus ?? 0;
  const scheduledCount = insights?.scheduledCount ?? posts.filter((post) => Boolean(post.scheduledAt)).length;
  const recommendations = insights?.recommendations?.length
    ? insights.recommendations
    : [
        "Publiez 3 a 5 actualites par semaine: plat phare, offre courte, coulisses et rappel reservation.",
        "Ajoutez un CTA mesurable a chaque post qui doit generer du chiffre d'affaires.",
      ];

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <DashboardPageHero
          badge="Fil social"
          title="Actualites"
          description="Pilotez vos actualites comme un canal marketing: objectifs, audiences, CTA, planning et performance."
          icon={Newspaper}
          tone="sky"
          stats={[
            { label: "Publies", value: insights?.publishedCount ?? publishedCount, icon: Newspaper },
            { label: "Interactions", value: insights?.interactions ?? interactions, icon: ThumbsUp },
            { label: "CTA actifs", value: `${conversionFocus}%`, icon: Target },
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
              <Card className="rounded-lg">
                <CardContent className="space-y-4 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-xs uppercase tracking-wide text-muted-foreground">Plan marketing</p>
                      <h2 className="font-display text-lg font-semibold">Priorites du mois</h2>
                    </div>
                    <Megaphone className="h-5 w-5 text-primary" />
                  </div>
                  <div className="grid gap-3">
                    <div className="rounded-lg border bg-muted/30 p-3">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-medium">Objectif dominant</span>
                        <span className="text-sm text-muted-foreground">{topGoal?.count || 0} posts</span>
                      </div>
                      <p className="mt-1 text-sm text-muted-foreground">{topGoal?.label || "Notoriete"} · {topGoal?.description || "Developper la visibilite locale."}</p>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="rounded-lg border p-3">
                        <CalendarClock className="mb-2 h-4 w-4 text-primary" />
                        <p className="text-2xl font-bold">{scheduledCount}</p>
                        <p className="text-xs text-muted-foreground">posts programmes</p>
                      </div>
                      <div className="rounded-lg border p-3">
                        <TrendingUp className="mb-2 h-4 w-4 text-primary" />
                        <p className="text-2xl font-bold">{insights?.engagementRate ?? 0}%</p>
                        <p className="text-xs text-muted-foreground">engagement</p>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
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
                <Card className="rounded-lg">
                  <CardContent className="p-4">
                    <p className="text-xs text-muted-foreground">Posts avec CTA</p>
                    <p className="text-2xl font-bold">{conversionFocus}%</p>
                  </CardContent>
                </Card>
              </div>
            </div>

            <section className="space-y-4">
              <div className="grid gap-3 lg:grid-cols-3">
                {recommendations.slice(0, 3).map((recommendation, index) => (
                  <Card key={`${recommendation}-${index}`} className="rounded-lg">
                    <CardContent className="p-4">
                      <div className="mb-2 flex items-center gap-2">
                        <Target className="h-4 w-4 text-primary" />
                        <p className="text-sm font-medium">Action conseillee</p>
                      </div>
                      <p className="text-sm leading-6 text-muted-foreground">{recommendation}</p>
                    </CardContent>
                  </Card>
                ))}
              </div>

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
