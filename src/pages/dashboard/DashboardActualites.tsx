import { useCallback, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import {
  BarChart3,
  CalendarCheck,
  CalendarClock,
  Eye,
  Megaphone,
  MousePointerClick,
  Newspaper,
  Repeat2,
  Share2,
  ShoppingCart,
  Target,
  ThumbsUp,
  Timer,
  TrendingUp,
} from "lucide-react";

import DashboardLayout from "@/components/DashboardLayout";
import DashboardPageHero from "@/components/dashboard/DashboardPageHero";
import SocialComposer from "@/components/social/SocialComposer";
import SocialPostBoostDialog from "@/components/social/SocialPostBoostDialog";
import SocialPostCard from "@/components/social/SocialPostCard";
import { Card, CardContent } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { useRestaurantSocialPosts, useSocialInsights } from "@/hooks/useSocialFeed";
import { SOCIAL_MARKETING_GOALS } from "@/lib/socialFeed";
import { useDashboardRestaurant } from "@/pages/dashboard/useDashboardRestaurant";

function asNumber(value: unknown) {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

export default function DashboardActualites() {
  const { selectedId, restaurants, loading, error } = useDashboardRestaurant();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const selectedRestaurant = restaurants.find((restaurant) => restaurant.id === selectedId) || null;
  const postsQuery = useRestaurantSocialPosts(selectedId);
  const insightsQuery = useSocialInsights(selectedId);
  const posts = postsQuery.data || [];
  const insights = insightsQuery.data as any;
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
  const conversionsByType = insights?.conversionsByType || {};
  const sponsoredConversions = asNumber(
    insights?.sponsoredConversions ?? insights?.conversions ?? conversionsByType.total,
  );
  const orderConversions = asNumber(insights?.orderConversions ?? conversionsByType.order);
  const reservationConversions = asNumber(insights?.reservationConversions ?? conversionsByType.reservation);
  const zeroAttenteConversions = asNumber(insights?.zeroAttenteConversions ?? conversionsByType.zeroAttente);
  const recommendations = insights?.recommendations?.length
    ? insights.recommendations
    : [
        "Publiez 3 à 5 actualités par semaine: plat phare, offre courte, coulisses et rappel réservation.",
        "Ajoutez un CTA mesurable à chaque post qui doit générer du chiffre d'affaires.",
      ];

  const refreshCampaignLinkedData = useCallback(() => {
    if (!selectedId) return;
    queryClient.invalidateQueries({ queryKey: ["dashboard-campaigns", selectedId] });
    queryClient.invalidateQueries({ queryKey: ["restaurant-social-posts", selectedId] });
    queryClient.invalidateQueries({ queryKey: ["social-insights", selectedId] });
  }, [queryClient, selectedId]);

  useEffect(() => {
    const isCampaignCheckout = searchParams.get("campaign_checkout") === "1";
    const status = searchParams.get("status");
    if (!isCampaignCheckout || !status) return;

    if (status === "success") {
      toast({
        title: "Paiement confirmé",
        description: "Votre post sponsorisé est en cours d'activation. Les données peuvent prendre quelques secondes à se synchroniser.",
      });
      refreshCampaignLinkedData();
    } else if (status === "cancelled") {
      toast({
        title: "Paiement annulé",
        description: "La mise en avant reste inactive tant que le paiement n'est pas finalisé.",
        variant: "destructive",
      });
    }

    const nextParams = new URLSearchParams(searchParams);
    nextParams.delete("campaign_checkout");
    nextParams.delete("campaign_id");
    nextParams.delete("post_id");
    nextParams.delete("session_id");
    nextParams.delete("status");
    setSearchParams(nextParams, { replace: true });
  }, [refreshCampaignLinkedData, searchParams, setSearchParams, toast]);

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <DashboardPageHero
          badge="Fil social"
          title="Actualités"
          description="Pilotez vos actualités comme un canal marketing: objectifs, audiences, CTA, planning, conversions sponsorisées et performance."
          icon={Newspaper}
          tone="sky"
          visualLabel="Actualités"
          stats={[
            { label: "Publies", value: insights?.publishedCount ?? publishedCount, icon: Newspaper },
            { label: "Interactions", value: insights?.interactions ?? interactions, icon: ThumbsUp },
            { label: "Conversions", value: sponsoredConversions, icon: ShoppingCart },
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
                      <p className="mt-1 text-sm text-muted-foreground">{topGoal?.label || "Notoriete"} · {topGoal?.description || "Developper la visibilité locale."}</p>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="rounded-lg border p-3">
                        <CalendarClock className="mb-2 h-4 w-4 text-primary" />
                        <p className="text-2xl font-bold">{scheduledCount}</p>
                        <p className="text-xs text-muted-foreground">posts programmés</p>
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

              <Card className="rounded-lg border-primary/20 bg-primary/5">
                <CardContent className="p-4 space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-xs uppercase tracking-wide text-muted-foreground">Conversions sponsorisées</p>
                      <h2 className="font-display text-lg font-semibold">Impact Actualités</h2>
                    </div>
                    <Target className="h-5 w-5 text-primary" />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="rounded-lg border bg-background/80 p-3">
                      <ShoppingCart className="mb-2 h-4 w-4 text-primary" />
                      <p className="text-2xl font-bold">{sponsoredConversions}</p>
                      <p className="text-xs text-muted-foreground">total attribue</p>
                    </div>
                    <div className="rounded-lg border bg-background/80 p-3">
                      <MousePointerClick className="mb-2 h-4 w-4 text-primary" />
                      <p className="text-2xl font-bold">{insights?.ctaClicks ?? 0}</p>
                      <p className="text-xs text-muted-foreground">clics CTA</p>
                    </div>
                    <div className="rounded-lg border bg-background/80 p-3">
                      <ShoppingCart className="mb-2 h-4 w-4 text-primary" />
                      <p className="text-2xl font-bold">{orderConversions}</p>
                      <p className="text-xs text-muted-foreground">commandes</p>
                    </div>
                    <div className="rounded-lg border bg-background/80 p-3">
                      <CalendarCheck className="mb-2 h-4 w-4 text-primary" />
                      <p className="text-2xl font-bold">{reservationConversions}</p>
                      <p className="text-xs text-muted-foreground">réservations</p>
                    </div>
                    <div className="rounded-lg border bg-background/80 p-3 col-span-2">
                      <Timer className="mb-2 h-4 w-4 text-primary" />
                      <p className="text-2xl font-bold">{zeroAttenteConversions}</p>
                      <p className="text-xs text-muted-foreground">Zéro Attente attribues</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <div className="grid grid-cols-2 gap-3">
                <Card className="rounded-lg"><CardContent className="p-4"><p className="text-xs text-muted-foreground">Impressions</p><p className="text-2xl font-bold">{insights?.impressions ?? 0}</p></CardContent></Card>
                <Card className="rounded-lg"><CardContent className="p-4"><p className="text-xs text-muted-foreground">Clics CTA</p><p className="text-2xl font-bold">{insights?.ctaClicks ?? 0}</p></CardContent></Card>
                <Card className="rounded-lg"><CardContent className="p-4"><p className="text-xs text-muted-foreground">Commentaires</p><p className="text-2xl font-bold">{posts.reduce((sum, post) => sum + post.commentsCount, 0)}</p></CardContent></Card>
                <Card className="rounded-lg"><CardContent className="p-4"><p className="text-xs text-muted-foreground">Reposts</p><p className="text-2xl font-bold">{posts.reduce((sum, post) => sum + post.repostsCount, 0)}</p></CardContent></Card>
                <Card className="rounded-lg"><CardContent className="p-4"><p className="text-xs text-muted-foreground">Reactions</p><p className="text-2xl font-bold">{posts.reduce((sum, post) => sum + post.likesCount, 0)}</p></CardContent></Card>
                <Card className="rounded-lg"><CardContent className="p-4"><p className="text-xs text-muted-foreground">Sauvegardes</p><p className="text-2xl font-bold">{insights?.saves ?? 0}</p></CardContent></Card>
                <Card className="rounded-lg"><CardContent className="p-4"><p className="text-xs text-muted-foreground">Taux engagement</p><p className="text-2xl font-bold">{insights?.engagementRate ?? 0}%</p></CardContent></Card>
                <Card className="rounded-lg"><CardContent className="p-4"><p className="text-xs text-muted-foreground">Posts avec CTA</p><p className="text-2xl font-bold">{conversionFocus}%</p></CardContent></Card>
              </div>
            </div>

            <section className="space-y-4">
              <div className="grid gap-3 lg:grid-cols-3">
                {recommendations.slice(0, 3).map((recommendation: string, index: number) => (
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
                <div className="space-y-4">
                  {posts.map((post) => (
                    <div key={post.id} className="space-y-2">
                      <div className="flex justify-end">
                        <SocialPostBoostDialog
                          post={post}
                          restaurantId={selectedRestaurant.id}
                          disabled={post.status !== "published"}
                          onCreated={refreshCampaignLinkedData}
                        />
                      </div>
                      <SocialPostCard post={post} compact />
                    </div>
                  ))}
                </div>
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
