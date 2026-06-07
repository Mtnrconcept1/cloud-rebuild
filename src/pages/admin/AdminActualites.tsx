import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Download, EyeOff, MessageCircleWarning, Newspaper, PauseCircle, PlayCircle, RotateCcw, ShieldCheck, Trash2 } from "lucide-react";
import { toast } from "sonner";

import DashboardPageHero from "@/components/dashboard/DashboardPageHero";
import SocialPostCard from "@/components/social/SocialPostCard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAdminSocialModeration, useModerateSocialContent } from "@/hooks/useSocialFeed";
import { getSupabase } from "@/integrations/supabase/client";

const supabase = getSupabase();

type SponsoredActualitesRow = {
  promotion_id: string;
  post_id: string;
  restaurant_id: string;
  restaurant_name: string | null;
  campaign_id: string;
  campaign_title: string | null;
  campaign_status: string | null;
  payment_status: string | null;
  promotion_status: string;
  budget_amount: number | null;
  spent: number | null;
  daily_spent: number | null;
  total_budget: number | null;
  starts_at: string | null;
  ends_at: string | null;
  boost_weight: number | null;
  post_body: string | null;
  post_status: string | null;
  impressions: number | null;
  clicks: number | null;
  cta_clicks: number | null;
  conversions: number | null;
  order_conversions: number | null;
  reservation_conversions: number | null;
  zero_attente_conversions: number | null;
  engagement_rate: number | null;
  cost_per_conversion: number | null;
  suspicious_signals: Record<string, unknown> | null;
  last_event_at: string | null;
};

type PostModerationTab = "active" | "hidden" | "deleted" | "all";
type ReportModerationTab = "open" | "reviewed" | "resolved" | "dismissed" | "all";

const POST_MODERATION_TABS: Array<{ value: PostModerationTab; label: string }> = [
  { value: "active", label: "Actifs" },
  { value: "hidden", label: "Masqués" },
  { value: "deleted", label: "Supprimés" },
  { value: "all", label: "Tous" },
];

const REPORT_MODERATION_TABS: Array<{ value: ReportModerationTab; label: string }> = [
  { value: "open", label: "Ouverts" },
  { value: "reviewed", label: "Revus" },
  { value: "resolved", label: "Résolus" },
  { value: "dismissed", label: "Écartés" },
  { value: "all", label: "Tous" },
];

function getPostModerationTab(status: string | null | undefined): PostModerationTab {
  if (status === "hidden") return "hidden";
  if (status === "deleted") return "deleted";
  return "active";
}

function isPostInModerationTab(post: { status?: string | null }, tab: PostModerationTab) {
  if (tab === "all") return true;
  return getPostModerationTab(post.status) === tab;
}

function postEmptyMessage(tab: PostModerationTab) {
  if (tab === "hidden") return "Aucun post masqué.";
  if (tab === "deleted") return "Aucun post supprimé.";
  if (tab === "all") return "Aucun post.";
  return "Aucun post actif.";
}

function isReportInModerationTab(report: { status?: string | null }, tab: ReportModerationTab) {
  if (tab === "all") return true;
  return report.status === tab;
}

function reportEmptyMessage(tab: ReportModerationTab) {
  if (tab === "reviewed") return "Aucun signalement revu.";
  if (tab === "resolved") return "Aucun signalement résolu.";
  if (tab === "dismissed") return "Aucun signalement écarté.";
  if (tab === "all") return "Aucun signalement.";
  return "Aucun signalement ouvert.";
}

function statusBadge(status: string) {
  if (status === "published" || status === "resolved") return "bg-emerald-100 text-emerald-800";
  if (status === "hidden" || status === "open") return "bg-amber-100 text-amber-800";
  if (status === "deleted") return "bg-red-100 text-red-800";
  return "bg-secondary text-secondary-foreground";
}

function reportPriority(report: any) {
  if (typeof report.priority === "number") return report.priority;
  if (report.status === "open") return 2;
  return 0;
}

function formatMoney(value: number | null | undefined) {
  return new Intl.NumberFormat("fr-CH", { style: "currency", currency: "CHF" }).format(Number(value || 0));
}

function formatNumber(value: number | null | undefined) {
  return new Intl.NumberFormat("fr-CH").format(Number(value || 0));
}

function hasSuspiciousSignals(row: SponsoredActualitesRow) {
  const suspiciousSignals = row.suspicious_signals || {};
  return Object.keys(suspiciousSignals).length > 0;
}

function getSuspiciousSignalLabels(row: SponsoredActualitesRow) {
  const suspiciousSignals = row.suspicious_signals || {};
  const labels: string[] = [];

  if (suspiciousSignals.repeat_clicks) labels.push(`Clics répétés: ${suspiciousSignals.repeat_clicks}`);
  if (suspiciousSignals.internal_events) labels.push(`Métriques internes: ${suspiciousSignals.internal_events}`);
  if (suspiciousSignals.paid_not_active) labels.push("Payée mais inactive");
  if (suspiciousSignals.active_unpaid) labels.push("Active sans paiement");
  if (suspiciousSignals.conversions_without_clicks) labels.push("Conversions sans clic");
  if (suspiciousSignals.spent_without_engagement) labels.push("Dépense sans engagement");

  return labels;
}

function statusTone(status: string | null | undefined) {
  if (status === "active" || status === "paid") return "bg-emerald-100 text-emerald-800";
  if (status === "paused" || status === "pending_payment") return "bg-amber-100 text-amber-800";
  if (status === "rejected" || status === "ended" || status === "failed") return "bg-red-100 text-red-800";
  return "bg-secondary text-secondary-foreground";
}

function exportSponsoredPostsCsv(rows: SponsoredActualitesRow[]) {
  const headers = [
    "restaurant",
    "campaign",
    "promotion_status",
    "payment_status",
    "budget",
    "spent",
    "impressions",
    "clicks",
    "cta_clicks",
    "conversions",
    "engagement_rate",
    "cost_per_conversion",
    "signals",
  ];
  const csvRows = rows.map((row) => [
    row.restaurant_name || "",
    row.campaign_title || "",
    row.promotion_status || "",
    row.payment_status || "",
    Number(row.budget_amount || 0).toFixed(2),
    Number(row.spent || 0).toFixed(2),
    String(row.impressions || 0),
    String(row.clicks || 0),
    String(row.cta_clicks || 0),
    String(row.conversions || 0),
    String(row.engagement_rate || 0),
    String(row.cost_per_conversion || 0),
    getSuspiciousSignalLabels(row).join(" | "),
  ]);

  const csv = [headers, ...csvRows]
    .map((cells) => cells.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(","))
    .join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `actualites-sponsorisées-${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

function useAdminSponsoredActualites() {
  return useQuery({
    queryKey: ["admin-actualites-sponsored"],
    queryFn: async () => {
      const { data, error } = await (supabase.rpc as any)("admin_get_actualites_sponsored_posts", {
        p_days: 30,
      });

      if (error) throw error;
      return (data || []) as SponsoredActualitesRow[];
    },
  });
}

function useReviewSponsoredPromotion() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      promotionId,
      status,
      note,
    }: {
      promotionId: string;
      status: "active" | "paused";
      note: string;
    }) => {
      const { error } = await (supabase.rpc as any)("admin_review_social_post_promotion", {
        p_promotion_id: promotionId,
        p_status: status,
        p_note: note,
      });

      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Promotion mise à jour.");
      queryClient.invalidateQueries({ queryKey: ["admin-actualites-sponsored"] });
      queryClient.invalidateQueries({ queryKey: ["admin-social"] });
    },
    onError: (error) => toast.error((error as Error).message),
  });
}

export default function AdminActualites() {
  const [adminTab, setAdminTab] = useState("posts");
  const [postStatusTab, setPostStatusTab] = useState<PostModerationTab>("active");
  const [reportStatusTab, setReportStatusTab] = useState<ReportModerationTab>("open");
  const moderation = useAdminSocialModeration();
  const moderate = useModerateSocialContent();
  const sponsored = useAdminSponsoredActualites();
  const reviewPromotion = useReviewSponsoredPromotion();
  const posts = useMemo(() => moderation.data?.posts || [], [moderation.data?.posts]);
  const reports = useMemo(() => moderation.data?.reports || [], [moderation.data?.reports]);
  const postCounts = useMemo(
    () =>
      POST_MODERATION_TABS.reduce<Record<PostModerationTab, number>>(
        (counts, tab) => {
          counts[tab.value] = tab.value === "all"
            ? posts.length
            : posts.filter((post) => isPostInModerationTab(post, tab.value)).length;
          return counts;
        },
        { active: 0, hidden: 0, deleted: 0, all: 0 }
      ),
    [posts]
  );
  const reportCounts = useMemo(
    () =>
      REPORT_MODERATION_TABS.reduce<Record<ReportModerationTab, number>>(
        (counts, tab) => {
          counts[tab.value] = tab.value === "all"
            ? reports.length
            : reports.filter((report: any) => isReportInModerationTab(report, tab.value)).length;
          return counts;
        },
        { open: 0, reviewed: 0, resolved: 0, dismissed: 0, all: 0 }
      ),
    [reports]
  );
  const filteredPosts = useMemo(
    () => posts.filter((post) => isPostInModerationTab(post, postStatusTab)),
    [postStatusTab, posts]
  );
  const filteredReports = useMemo(
    () => reports.filter((report: any) => isReportInModerationTab(report, reportStatusTab)),
    [reportStatusTab, reports]
  );
  const sponsoredRows = useMemo(() => sponsored.data || [], [sponsored.data]);
  const suspiciousRows = useMemo(() => sponsoredRows.filter(hasSuspiciousSignals), [sponsoredRows]);
  const activeSponsored = sponsoredRows.filter((row) => row.promotion_status === "active").length;
  const totalSponsoredSpent = sponsoredRows.reduce((sum, row) => sum + Number(row.spent || 0), 0);
  const totalSponsoredConversions = sponsoredRows.reduce((sum, row) => sum + Number(row.conversions || 0), 0);

  const handlePostModeration = (postId: string, status: "published" | "hidden" | "deleted", reason?: string) => {
    moderate.mutate(
      { type: "post", id: postId, status, reason },
      {
        onSuccess: () => {
          setAdminTab("posts");
          setPostStatusTab(getPostModerationTab(status));
        },
      }
    );
  };

  const handleReportModeration = (reportId: string, status: Exclude<ReportModerationTab, "all">, reason?: string) => {
    moderate.mutate(
      { type: "report", id: reportId, status, reason },
      {
        onSuccess: () => {
          setAdminTab("reports");
          setReportStatusTab(status);
        },
      }
    );
  };

  const handleReportTargetModeration = ({
    targetType,
    targetId,
    status,
    reason,
  }: {
    targetType: string;
    targetId: string;
    status: "hidden" | "deleted";
    reason?: string;
  }) => {
    if (targetType === "post") {
      handlePostModeration(targetId, status, reason);
      return;
    }

    moderate.mutate({ type: targetType as "comment" | "repost", id: targetId, status, reason });
  };

  return (
    <main className="container space-y-6 py-8">
      <DashboardPageHero
        badge="Moderation"
        title="Actualités sociales"
        description="Surveillez les posts, signalements et contenus masqués du fil social."
        icon={ShieldCheck}
        tone="amber"
        stats={[
          { label: "Posts actifs", value: postCounts.active, icon: Newspaper },
          { label: "Signalements", value: reportCounts.open, icon: MessageCircleWarning },
          { label: "Sponsorisés actifs", value: activeSponsored, icon: PlayCircle },
          { label: "Signaux fraude", value: suspiciousRows.length, icon: AlertTriangle },
        ]}
      />

      <Tabs value={adminTab} onValueChange={setAdminTab} className="space-y-4">
        <TabsList className="flex w-full flex-wrap justify-start">
          <TabsTrigger value="posts">Posts</TabsTrigger>
          <TabsTrigger value="sponsored">Posts sponsorisés</TabsTrigger>
          <TabsTrigger value="fraud">Fraude métriques</TabsTrigger>
          <TabsTrigger value="reports">Signalements</TabsTrigger>
        </TabsList>

        <TabsContent value="posts" className="space-y-4">
          <Tabs value={postStatusTab} onValueChange={(value) => setPostStatusTab(value as PostModerationTab)} className="space-y-4">
            <TabsList className="flex w-full flex-wrap justify-start">
              {POST_MODERATION_TABS.map((tab) => (
                <TabsTrigger key={tab.value} value={tab.value} className="gap-2">
                  {tab.label}
                  <Badge variant="secondary" className="rounded-full px-2 py-0 text-[11px]">
                    {postCounts[tab.value]}
                  </Badge>
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>

          {moderation.isLoading ? (
            <Card className="rounded-lg"><CardContent className="p-8 text-center text-muted-foreground">Chargement...</CardContent></Card>
          ) : filteredPosts.length > 0 ? (
            filteredPosts.map((post) => (
              <div key={post.id} className="space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-background p-3">
                  <Badge className={statusBadge(post.status)}>{post.status}</Badge>
                  <div className="flex flex-wrap gap-2">
                    {post.status !== "published" ? (
                      <Button
                        variant="outline"
                        size="sm"
                        className="gap-2"
                        onClick={() => handlePostModeration(post.id, "published")}
                        disabled={moderate.isPending}
                      >
                        <RotateCcw className="h-4 w-4" />
                        Restaurer
                      </Button>
                    ) : null}
                    {post.status !== "hidden" && post.status !== "deleted" ? (
                      <Button
                        variant="outline"
                        size="sm"
                        className="gap-2"
                        onClick={() => handlePostModeration(post.id, "hidden", "Moderation admin")}
                        disabled={moderate.isPending}
                      >
                        <EyeOff className="h-4 w-4" />
                        Masquer
                      </Button>
                    ) : null}
                    {post.status !== "deleted" ? (
                      <Button
                        variant="destructive"
                        size="sm"
                        className="gap-2"
                        onClick={() => handlePostModeration(post.id, "deleted", "Suppression admin")}
                        disabled={moderate.isPending}
                      >
                        <Trash2 className="h-4 w-4" />
                        Supprimer
                      </Button>
                    ) : null}
                  </div>
                </div>
                <SocialPostCard post={post} compact />
              </div>
            ))
          ) : (
            <Card className="rounded-lg"><CardContent className="p-8 text-center text-muted-foreground">{postEmptyMessage(postStatusTab)}</CardContent></Card>
          )}
        </TabsContent>

        <TabsContent value="sponsored" className="space-y-4">
          <div className="grid gap-3 md:grid-cols-4">
            <Card className="rounded-lg"><CardContent className="p-4"><p className="text-2xl font-semibold">{sponsoredRows.length}</p><p className="text-xs text-muted-foreground">Promotions</p></CardContent></Card>
            <Card className="rounded-lg"><CardContent className="p-4"><p className="text-2xl font-semibold">{formatMoney(totalSponsoredSpent)}</p><p className="text-xs text-muted-foreground">Dépense</p></CardContent></Card>
            <Card className="rounded-lg"><CardContent className="p-4"><p className="text-2xl font-semibold">{formatNumber(totalSponsoredConversions)}</p><p className="text-xs text-muted-foreground">Conversions</p></CardContent></Card>
            <Card className="rounded-lg"><CardContent className="flex h-full items-center p-4">
              <Button variant="outline" className="w-full gap-2" onClick={() => exportSponsoredPostsCsv(sponsoredRows)} disabled={sponsoredRows.length === 0}>
                <Download className="h-4 w-4" />
                Export CSV
              </Button>
            </CardContent></Card>
          </div>

          {sponsored.isLoading ? (
            <Card className="rounded-lg"><CardContent className="p-8 text-center text-muted-foreground">Chargement...</CardContent></Card>
          ) : sponsored.error ? (
            <Card className="rounded-lg border-destructive/30"><CardContent className="p-4 text-sm text-destructive">Impossible de charger les posts sponsorisés.</CardContent></Card>
          ) : sponsoredRows.length > 0 ? (
            sponsoredRows.map((row) => (
              <Card key={row.promotion_id} className="rounded-lg">
                <CardHeader className="space-y-3">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div className="min-w-0">
                      <CardTitle className="text-base">{row.campaign_title || "Campagne Actualités"}</CardTitle>
                      <p className="text-sm text-muted-foreground">{row.restaurant_name || "Restaurant"} - {row.post_body?.slice(0, 120) || "Post sans texte"}</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Badge className={statusTone(row.promotion_status)}>{row.promotion_status}</Badge>
                      <Badge className={statusTone(row.payment_status)}>{row.payment_status || "paiement inconnu"}</Badge>
                      {hasSuspiciousSignals(row) ? <Badge className="bg-red-100 text-red-800">Signal</Badge> : null}
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-6">
                    <div className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">Budget</p><p className="font-semibold">{formatMoney(row.total_budget || row.budget_amount)}</p></div>
                    <div className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">Dépense</p><p className="font-semibold">{formatMoney(row.spent)}</p></div>
                    <div className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">Impressions</p><p className="font-semibold">{formatNumber(row.impressions)}</p></div>
                    <div className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">Clics</p><p className="font-semibold">{formatNumber(Number(row.clicks || 0) + Number(row.cta_clicks || 0))}</p></div>
                    <div className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">Conversions</p><p className="font-semibold">{formatNumber(row.conversions)}</p></div>
                    <div className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">CPA</p><p className="font-semibold">{formatMoney(row.cost_per_conversion)}</p></div>
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex flex-wrap gap-2">
                      <Badge variant="outline">Commandes {formatNumber(row.order_conversions)}</Badge>
                      <Badge variant="outline">Réservations {formatNumber(row.reservation_conversions)}</Badge>
                      <Badge variant="outline">Zero Attente {formatNumber(row.zero_attente_conversions)}</Badge>
                      <Badge variant="outline">Engagement {Number(row.engagement_rate || 0).toFixed(2)}%</Badge>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {row.promotion_status === "active" ? (
                        <Button
                          variant="outline"
                          size="sm"
                          className="gap-2"
                          onClick={() => reviewPromotion.mutate({ promotionId: row.promotion_id, status: "paused", note: "Suspension admin Actualités" })}
                          disabled={reviewPromotion.isPending}
                        >
                          <PauseCircle className="h-4 w-4" />
                          Suspendre
                        </Button>
                      ) : (
                        <Button
                          size="sm"
                          className="gap-2"
                          onClick={() => reviewPromotion.mutate({ promotionId: row.promotion_id, status: "active", note: "Réactivation admin Actualités" })}
                          disabled={reviewPromotion.isPending || row.payment_status !== "paid"}
                        >
                          <PlayCircle className="h-4 w-4" />
                          Réactiver
                        </Button>
                      )}
                      <Button
                        variant="outline"
                        size="sm"
                        className="gap-2"
                        onClick={() => handlePostModeration(row.post_id, "hidden", "Promotion sponsorisée suspendue par admin")}
                        disabled={moderate.isPending}
                      >
                        <EyeOff className="h-4 w-4" />
                        Masquer post
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))
          ) : (
            <Card className="rounded-lg"><CardContent className="p-8 text-center text-muted-foreground">Aucune promotion sponsorisée.</CardContent></Card>
          )}
        </TabsContent>

        <TabsContent value="fraud" className="space-y-4">
          {suspiciousRows.length > 0 ? (
            suspiciousRows.map((row) => (
              <Card key={row.promotion_id} className="rounded-lg border-red-200">
                <CardHeader>
                  <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                    <div>
                      <CardTitle className="text-base">{row.campaign_title || "Campagne Actualités"}</CardTitle>
                      <p className="text-sm text-muted-foreground">{row.restaurant_name || "Restaurant"}</p>
                    </div>
                    <Badge className={statusTone(row.promotion_status)}>{row.promotion_status}</Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex flex-wrap gap-2">
                    {getSuspiciousSignalLabels(row).map((label) => (
                      <Badge key={label} className="bg-red-100 text-red-800">{label}</Badge>
                    ))}
                  </div>
                  <div className="grid gap-3 md:grid-cols-4">
                    <div className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">Clics</p><p className="font-semibold">{formatNumber(Number(row.clicks || 0) + Number(row.cta_clicks || 0))}</p></div>
                    <div className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">Conversions</p><p className="font-semibold">{formatNumber(row.conversions)}</p></div>
                    <div className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">Dépense</p><p className="font-semibold">{formatMoney(row.spent)}</p></div>
                    <div className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">Dernier event</p><p className="font-semibold">{row.last_event_at ? new Date(row.last_event_at).toLocaleDateString("fr-CH") : "Aucun"}</p></div>
                  </div>
                </CardContent>
              </Card>
            ))
          ) : (
            <Card className="rounded-lg"><CardContent className="p-8 text-center text-muted-foreground">Aucun signal suspect.</CardContent></Card>
          )}
        </TabsContent>

        <TabsContent value="reports" className="space-y-4">
          <Tabs value={reportStatusTab} onValueChange={(value) => setReportStatusTab(value as ReportModerationTab)} className="space-y-4">
            <TabsList className="flex w-full flex-wrap justify-start">
              {REPORT_MODERATION_TABS.map((tab) => (
                <TabsTrigger key={tab.value} value={tab.value} className="gap-2">
                  {tab.label}
                  <Badge variant="secondary" className="rounded-full px-2 py-0 text-[11px]">
                    {reportCounts[tab.value]}
                  </Badge>
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>

          {filteredReports.length > 0 ? (
            filteredReports.map((report: any) => (
              <Card key={report.id} className="rounded-lg">
                <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <CardTitle className="text-base">{report.reason}</CardTitle>
                      {report.category ? <Badge variant="outline">{report.category}</Badge> : null}
                      <Badge variant="secondary">Priorite {reportPriority(report)}</Badge>
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">{report.target_type} - {report.target_id}</p>
                  </div>
                  <Badge className={statusBadge(report.status)}>{report.status}</Badge>
                </CardHeader>
                <CardContent className="space-y-4">
                  {report.details ? <p className="text-sm">{report.details}</p> : null}
                  <div className="flex flex-wrap gap-2">
                    {["post", "comment", "repost"].includes(report.target_type) ? (
                      <>
                        <Button
                          size="sm"
                          variant="outline"
                          className="gap-2"
                          onClick={() =>
                            handleReportTargetModeration({
                              targetType: report.target_type,
                              targetId: report.target_id,
                              status: "hidden",
                              reason: report.reason || "Signalement admin",
                            })
                          }
                          disabled={moderate.isPending}
                        >
                          <EyeOff className="h-4 w-4" />
                          Masquer cible
                        </Button>
                        <Button
                          size="sm"
                          variant="destructive"
                          className="gap-2"
                          onClick={() =>
                            handleReportTargetModeration({
                              targetType: report.target_type,
                              targetId: report.target_id,
                              status: "deleted",
                              reason: report.reason || "Signalement admin",
                            })
                          }
                          disabled={moderate.isPending}
                        >
                          <Trash2 className="h-4 w-4" />
                          Supprimer cible
                        </Button>
                      </>
                    ) : null}
                    <Button
                      size="sm"
                      variant="outline"
                      className="gap-2"
                      onClick={() => handleReportModeration(report.id, "reviewed")}
                      disabled={moderate.isPending}
                    >
                      <ShieldCheck className="h-4 w-4" />
                      Revu
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="gap-2"
                      onClick={() => handleReportModeration(report.id, "dismissed")}
                      disabled={moderate.isPending}
                    >
                      <RotateCcw className="h-4 w-4" />
                      Ecarter
                    </Button>
                    <Button
                      size="sm"
                      className="gap-2"
                      onClick={() => handleReportModeration(report.id, "resolved")}
                      disabled={moderate.isPending}
                    >
                      <ShieldCheck className="h-4 w-4" />
                      Resolu
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))
          ) : (
            <Card className="rounded-lg"><CardContent className="p-8 text-center text-muted-foreground">{reportEmptyMessage(reportStatusTab)}</CardContent></Card>
          )}
        </TabsContent>
      </Tabs>
    </main>
  );
}
