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
  ShoppingCart,
  Target,
  ThumbsUp,
  Timer,
  TrendingUp,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

import DashboardLayout from "@/components/DashboardLayout";
import DashboardPageHero from "@/components/dashboard/DashboardPageHero";
import SocialComposer from "@/components/social/SocialComposer";
import SocialPostBoostDialog from "@/components/social/SocialPostBoostDialog";
import SocialPostCard from "@/components/social/SocialPostCard";
import { Card, CardContent } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { useRestaurantSocialPosts, useSocialInsights } from "@/hooks/useSocialFeed";
import { SOCIAL_MARKETING_GOALS } from "@/lib/socialFeed";
import type { SocialFeedPost } from "@/lib/socialFeed";
import { useDashboardRestaurant } from "@/pages/dashboard/useDashboardRestaurant";

function asNumber(value: unknown) {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatCompactMetric(value: number) {
  return new Intl.NumberFormat("fr-CH", {
    notation: value >= 10000 ? "compact" : "standard",
    maximumFractionDigits: 1,
  }).format(Math.max(0, value));
}

function DashboardPostMetrics({ post }: { post: SocialFeedPost }) {
  const metrics = post.dashboardMetrics;
  const fallbackInteractions = post.likesCount + post.commentsCount + post.repostsCount + post.sharesCount;
  const impressions = metrics?.impressions ?? 0;
  const views = metrics?.views ?? 0;
  const interactions = metrics?.interactions ?? fallbackInteractions;
  const ctaClicks = metrics?.ctaClicks ?? 0;

  return (
    <div className="grid grid-cols-4 gap-1.5 rounded-2xl border border-orange-100 bg-gradient-to-r from-orange-50 via-white to-sky-50 p-1.5 shadow-sm sm:gap-2 sm:p-2">
      <div className="min-w-0 rounded-xl bg-white/90 px-1.5 py-2 sm:px-3">
        <p aria-label="Impressions" title="Impressions" className="flex min-w-0 items-center gap-1 text-[9px] font-semibold uppercase leading-tight tracking-normal text-muted-foreground sm:gap-1.5 sm:text-[11px] sm:tracking-wide">
          <Eye className="hidden h-3.5 w-3.5 shrink-0 text-orange-600 sm:block" />
          <span className="sm:hidden">Impr.</span>
          <span className="hidden sm:inline">Impressions</span>
        </p>
        <p className="mt-1 text-lg font-black leading-none text-slate-950 sm:text-xl">{formatCompactMetric(impressions)}</p>
      </div>
      <div className="min-w-0 rounded-xl bg-white/90 px-1.5 py-2 sm:px-3">
        <p aria-label="Vues" title="Vues" className="flex min-w-0 items-center gap-1 text-[9px] font-semibold uppercase leading-tight tracking-normal text-muted-foreground sm:gap-1.5 sm:text-[11px] sm:tracking-wide">
          <MousePointerClick className="hidden h-3.5 w-3.5 shrink-0 text-sky-600 sm:block" />
          <span>Vues</span>
        </p>
        <p className="mt-1 text-lg font-black leading-none text-slate-950 sm:text-xl">{formatCompactMetric(views)}</p>
      </div>
      <div className="min-w-0 rounded-xl bg-white/90 px-1.5 py-2 sm:px-3">
        <p aria-label="Engagement" title="Engagement" className="flex min-w-0 items-center gap-1 text-[9px] font-semibold uppercase leading-tight tracking-normal text-muted-foreground sm:gap-1.5 sm:text-[11px] sm:tracking-wide">
          <BarChart3 className="hidden h-3.5 w-3.5 shrink-0 text-emerald-600 sm:block" />
          <span className="sm:hidden">Eng.</span>
          <span className="hidden sm:inline">Engagement</span>
        </p>
        <p className="mt-1 text-lg font-black leading-none text-slate-950 sm:text-xl">{formatCompactMetric(interactions)}</p>
      </div>
      <div className="min-w-0 rounded-xl bg-white/90 px-1.5 py-2 sm:px-3">
        <p aria-label="CTA" title="CTA" className="flex min-w-0 items-center gap-1 text-[9px] font-semibold uppercase leading-tight tracking-normal text-muted-foreground sm:gap-1.5 sm:text-[11px] sm:tracking-wide">
          <Target className="hidden h-3.5 w-3.5 shrink-0 text-primary sm:block" />
          <span>CTA</span>
        </p>
        <p className="mt-1 text-lg font-black leading-none text-slate-950 sm:text-xl">{formatCompactMetric(ctaClicks)}</p>
      </div>
    </div>
  );
}

function DashboardInsightTile({
  icon: Icon,
  label,
  mobileLabel,
  value,
  className = "",
}: {
  icon: LucideIcon;
  label: string;
  mobileLabel?: string;
  value: string | number;
  className?: string;
}) {
  return (
    <div className={`min-w-0 rounded-lg border bg-background/80 px-1.5 py-2 sm:px-3 ${className}`}>
      <div className="flex min-w-0 items-start justify-between gap-1.5">
        <p aria-label={label} title={label} className="min-w-0 text-[9px] leading-tight text-muted-foreground [overflow-wrap:anywhere] sm:text-[11px]">
          <span className="sm:hidden">{mobileLabel ?? label}</span>
          <span className="hidden sm:inline">{label}</span>
        </p>
        <Icon className="mt-0.5 hidden h-3.5 w-3.5 shrink-0 text-primary sm:block" />
      </div>
      <p className="mt-1 text-base font-black leading-none text-foreground sm:text-lg">{value}</p>
    </div>
  );
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
            { label: "Publiés", value: insights?.publishedCount ?? publishedCount, icon: Newspaper },
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
          <div className="space-y-6">
            <SocialComposer
              restaurantId={selectedRestaurant.id}
              restaurantName={selectedRestaurant.name}
              socialLinks={selectedRestaurant.socialLinks || null}
            />

            <div className="grid gap-6 xl:grid-cols-[minmax(18rem,22rem)_minmax(0,1fr)]">
              <div className="space-y-3">
              <Card className="rounded-lg">
                <CardContent className="space-y-3 p-3">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Plan marketing</p>
                      <h2 className="font-display text-base font-semibold">Priorités du mois</h2>
                    </div>
                    <Megaphone className="h-4 w-4 text-primary" />
                  </div>
                  <div className="grid gap-2">
                    <div className="rounded-lg border bg-muted/30 px-3 py-2">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-medium leading-tight">Objectif dominant</span>
                        <span className="text-xs text-muted-foreground">{topGoal?.count || 0} posts</span>
                      </div>
                      <p className="mt-1 line-clamp-2 text-xs leading-5 text-muted-foreground">{topGoal?.label || "Notoriété"} · {topGoal?.description || "Développer la visibilité locale."}</p>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <DashboardInsightTile icon={CalendarClock} label="Posts programmés" value={scheduledCount} />
                      <DashboardInsightTile icon={TrendingUp} label="Engagement" value={`${insights?.engagementRate ?? 0}%`} />
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="rounded-lg border-primary/20 bg-primary/5">
                <CardContent className="space-y-3 p-3">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Conversions sponsorisées</p>
                      <h2 className="font-display text-base font-semibold">Impact Actualités</h2>
                    </div>
                    <Target className="h-4 w-4 text-primary" />
                  </div>
                  <div className="grid grid-cols-4 gap-1.5 sm:gap-2">
                    <DashboardInsightTile icon={ShoppingCart} label="Total attribué" mobileLabel="Total" value={sponsoredConversions} />
                    <DashboardInsightTile icon={MousePointerClick} label="Clics CTA (appel à l'action)" mobileLabel="Clics CTA" value={insights?.ctaClicks ?? 0} />
                    <DashboardInsightTile icon={ShoppingCart} label="Commandes" mobileLabel="Commandes" value={orderConversions} />
                    <DashboardInsightTile icon={CalendarCheck} label="Réservations" mobileLabel="Réserv." value={reservationConversions} />
                    <DashboardInsightTile icon={Timer} label="Zéro Attente attribués" mobileLabel="Zéro Att." value={zeroAttenteConversions} />
                  </div>
                </CardContent>
              </Card>

              <div className="grid grid-cols-4 gap-1.5 sm:gap-2">
                <DashboardInsightTile icon={Eye} label="Impressions" mobileLabel="Impress." value={insights?.impressions ?? 0} />
                <DashboardInsightTile icon={MousePointerClick} label="Clics CTA (appel à l'action)" mobileLabel="Clics CTA" value={insights?.ctaClicks ?? 0} />
                <DashboardInsightTile icon={BarChart3} label="Commentaires" mobileLabel="Comm." value={posts.reduce((sum, post) => sum + post.commentsCount, 0)} />
                <DashboardInsightTile icon={Megaphone} label="Reposts" mobileLabel="Reposts" value={posts.reduce((sum, post) => sum + post.repostsCount, 0)} />
                <DashboardInsightTile icon={ThumbsUp} label="Réactions" mobileLabel="Réactions" value={posts.reduce((sum, post) => sum + post.likesCount, 0)} />
                <DashboardInsightTile icon={Target} label="Sauvegardes" mobileLabel="Sauv." value={insights?.saves ?? 0} />
                <DashboardInsightTile icon={TrendingUp} label="Taux d'engagement" mobileLabel="Taux" value={`${insights?.engagementRate ?? 0}%`} />
                <DashboardInsightTile icon={MousePointerClick} label="Posts avec CTA (appel à l'action)" mobileLabel="Posts CTA" value={`${conversionFocus}%`} />
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

              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h2 className="font-display text-xl font-semibold">Posts</h2>
                  <p className="text-sm text-muted-foreground">
                    Impressions et vues visibles uniquement dans votre dashboard.
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-xs font-semibold text-muted-foreground">
                  <span className="inline-flex items-center gap-1 rounded-full bg-orange-50 px-3 py-1 text-orange-700">
                    <Eye className="h-3.5 w-3.5" />
                    Performance par post
                  </span>
                  <span className="inline-flex items-center gap-1 rounded-full bg-sky-50 px-3 py-1 text-sky-700">
                    <MousePointerClick className="h-3.5 w-3.5" />
                    Lecture restaurateur
                  </span>
                </div>
              </div>
              {postsQuery.isLoading ? (
                <Card className="rounded-lg"><CardContent className="p-8 text-center text-muted-foreground">Chargement...</CardContent></Card>
              ) : posts.length > 0 ? (
                <div className="space-y-4">
                  {posts.map((post) => (
                    <div key={post.id} className="space-y-2">
                      <DashboardPostMetrics post={post} />
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
                <Card className="rounded-lg"><CardContent className="p-8 text-center text-muted-foreground">Aucun post publié.</CardContent></Card>
              )}
              </section>
            </div>
          </div>
        ) : null}
      </div>
    </DashboardLayout>
  );
}
