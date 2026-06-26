import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getSupabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import DashboardPageHero from "@/components/dashboard/DashboardPageHero";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { CheckCircle2, EyeOff, Flag, MessageSquareText, Search, ShieldAlert, Trash2 } from "lucide-react";

const supabase = getSupabase();

type ReviewReply = {
  id: string;
  reply_text: string;
  author_type: string | null;
  created_at: string;
};

type ReviewReport = {
  id: string;
  reason: string;
  status: string;
  admin_decision: string | null;
  admin_note: string | null;
  created_at: string;
  reviewed_at: string | null;
};

type AdminReview = {
  id: string;
  user_id: string;
  restaurant_id: string;
  rating: number | null;
  quality_rating: number | null;
  service_rating: number | null;
  speed_rating: number | null;
  restaurant_rating: number | null;
  food_rating: number | null;
  courier_rating: number | null;
  comment: string | null;
  tags: string[] | null;
  status: string | null;
  reported_at: string | null;
  report_reason: string | null;
  created_at: string;
  restaurants?: { name: string | null } | null;
  review_replies?: ReviewReply[] | ReviewReply | null;
  review_reports?: ReviewReport[] | null;
};

const STATUS_OPTIONS = [
  { value: "published", label: "Publié" },
  { value: "hidden", label: "Masqué" },
  { value: "flagged", label: "À revoir" },
  { value: "archived", label: "Archivé" },
];

const REQUIRED_REASON_STATUSES = new Set(["hidden", "flagged", "archived"]);

function isSchemaDriftError(error: { message?: string; code?: string } | null | undefined) {
  const message = (error?.message || "").toLowerCase();
  return (
    error?.code === "PGRST200" ||
    error?.code === "PGRST204" ||
    error?.code === "PGRST205" ||
    message.includes("schema cache") ||
    message.includes("could not find the table") ||
    message.includes("could not find a relationship") ||
    message.includes("column")
  );
}

function moderationPriority(review: AdminReview) {
  const rating = Number(review.rating || review.restaurant_rating || 0);
  const comment = (review.comment || "").toLowerCase();
  const status = review.status || "published";
  const riskWords = ["danger", "intoxication", "fraude", "arnaque", "insulte", "menace", "hygiene"];
  let score = 0;
  const hasOpenReport = review.review_reports?.some((report) => report.status === "open");

  if (hasOpenReport) score += 100;
  if (status === "flagged") score += 80;
  if (rating > 0 && rating <= 2) score += 35;
  if (riskWords.some((word) => comment.includes(word))) score += 30;
  if (!review.comment?.trim()) score += 5;

  if (score >= 80) return { score, label: "Critique", variant: "destructive" as const };
  if (score >= 35) return { score, label: "Haute", variant: "secondary" as const };
  return { score, label: "Normale", variant: "outline" as const };
}

function getReviewReplies(review: AdminReview) {
  if (!review.review_replies) return [];
  return Array.isArray(review.review_replies) ? review.review_replies : [review.review_replies];
}

function getRestaurantReply(review: AdminReview) {
  return getReviewReplies(review).find((reply) => reply.author_type === "restaurant_staff") || null;
}

function getAdminReply(review: AdminReview) {
  return getReviewReplies(review).find((reply) => reply.author_type === "admin") || null;
}

export default function AdminAvis() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [replyDrafts, setReplyDrafts] = useState<Record<string, string>>({});
  const [reasonDrafts, setReasonDrafts] = useState<Record<string, string>>({});
  const [savingReplyId, setSavingReplyId] = useState<string | null>(null);

  const { data: reviews = [], isLoading, error } = useQuery({
    queryKey: ["admin-reviews"],
    queryFn: async () => {
      const { data, error } = await (supabase.from as any)("reviews")
        .select("id, user_id, restaurant_id, rating, quality_rating, service_rating, speed_rating, restaurant_rating, food_rating, courier_rating, comment, tags, status, reported_at, report_reason, created_at, restaurants(name), review_replies(id, reply_text, author_type, created_at), review_reports(id, reason, status, admin_decision, admin_note, created_at, reviewed_at)")
        .order("created_at", { ascending: false });

      if (error) {
        if (!isSchemaDriftError(error)) throw error;

        const { data: legacyData, error: legacyError } = await (supabase.from as any)("reviews")
          .select("id, user_id, restaurant_id, rating, quality_rating, service_rating, speed_rating, restaurant_rating, food_rating, courier_rating, comment, tags, status, created_at, restaurants(name), review_replies(id, reply_text, author_type, created_at)")
          .order("created_at", { ascending: false });

        if (legacyError) throw legacyError;

        return ((legacyData || []) as Array<Omit<AdminReview, "reported_at" | "report_reason" | "review_reports">>).map((review) => ({
          ...review,
          reported_at: null,
          report_reason: null,
          review_reports: [],
        })) as AdminReview[];
      }

      return (data || []) as AdminReview[];
    },
  });

  const filteredReviews = useMemo(() => {
    const term = search.trim().toLowerCase();
    return reviews.filter((review) => {
      const reviewStatus = review.status || "published";
      const matchesStatus = statusFilter === "all" || reviewStatus === statusFilter;
      const matchesSearch =
        !term ||
        (review.restaurants?.name || "").toLowerCase().includes(term) ||
        (review.comment || "").toLowerCase().includes(term) ||
        review.user_id.toLowerCase().includes(term) ||
        review.id.toLowerCase().includes(term);
      return matchesStatus && matchesSearch;
    }).sort((a, b) => moderationPriority(b).score - moderationPriority(a).score);
  }, [reviews, search, statusFilter]);

  const stats = useMemo(() => {
    return {
      total: reviews.length,
      published: reviews.filter((review) => (review.status || "published") === "published").length,
      hidden: reviews.filter((review) => (review.status || "published") === "hidden").length,
      flagged: reviews.filter((review) => (review.status || "published") === "flagged").length,
      reported: reviews.filter((review) => review.review_reports?.some((report) => report.status === "open")).length,
    };
  }, [reviews]);

  const setReplyDraft = (review: AdminReview) => {
    const existingReply = getAdminReply(review)?.reply_text || "";
    setReplyDrafts((current) => ({
      ...current,
      [review.id]: current[review.id] ?? existingReply,
    }));
  };

  const getReason = (reviewId: string, actionLabel: string) => {
    const reason = (reasonDrafts[reviewId] || "").trim();
    if (!reason) {
      toast({
        title: "Raison obligatoire",
        description: `Saisissez une raison avant de ${actionLabel}.`,
        variant: "destructive",
      });
      return null;
    }
    return reason;
  };

  const updateReviewStatus = async (reviewId: string, status: string) => {
    const reason = REQUIRED_REASON_STATUSES.has(status)
      ? getReason(reviewId, "modifier ce statut")
      : (reasonDrafts[reviewId] || "").trim();
    if (REQUIRED_REASON_STATUSES.has(status) && !reason) return;

    const { error } = await (supabase.rpc as any)("admin_update_review_status", {
      p_review_id: reviewId,
      p_status: status,
      p_reason: reason || null,
    });
    if (error) {
      toast({ title: "Erreur", description: error.message, variant: "destructive" });
      return;
    }

    queryClient.invalidateQueries({ queryKey: ["admin-reviews"] });
    setReasonDrafts((current) => ({ ...current, [reviewId]: "" }));
    toast({ title: "Statut de l'avis mis à jour" });
  };

  const saveReply = async (review: AdminReview) => {
    const adminReply = getAdminReply(review);
    const replyText = (replyDrafts[review.id] ?? adminReply?.reply_text ?? "").trim();
    if (!replyText) {
      toast({ title: "Réponse vide", description: "Saisissez une réponse avant d'enregistrer.", variant: "destructive" });
      return;
    }
    if (!user?.id) {
      toast({ title: "Session invalide", description: "Impossible d'identifier l'admin connecté.", variant: "destructive" });
      return;
    }

    setSavingReplyId(review.id);
    const response = await (supabase.rpc as any)("admin_reply_review", {
      p_review_id: review.id,
      p_reply_text: replyText,
    });

    setSavingReplyId(null);

    if (response.error) {
      toast({ title: "Erreur", description: response.error.message, variant: "destructive" });
      return;
    }

    queryClient.invalidateQueries({ queryKey: ["admin-reviews"] });
    toast({ title: adminReply ? "Réponse mise à jour" : "Réponse publiée" });
  };

  const handleDelete = async (id: string) => {
    const reason = getReason(id, "archiver cet avis");
    if (!reason) return;
    if (!window.confirm("Archiver cet avis ? L'action sera auditee.")) return;

    const { error } = await (supabase.rpc as any)("admin_delete_review", {
      p_review_id: id,
      p_reason: reason,
    });
    if (error) {
      toast({ title: "Erreur", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Avis archive" });
    setReasonDrafts((current) => ({ ...current, [id]: "" }));
    queryClient.invalidateQueries({ queryKey: ["admin-reviews"] });
  };

  if (error) {
    return (
      <div className="container py-8">
        <Card>
          <CardContent className="py-10 text-center text-destructive">
            Impossible de charger les avis.
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container py-8 space-y-6">
      <DashboardPageHero
        badge="Moderation"
        title="Moderation des avis"
        description="Contrôlez la visibilité des avis, les signalements et les réponses admin sans perdre le contexte restaurant."
        icon={MessageSquareText}
        tone="sky"
        visualLabel="Avis"
        stats={[
          { label: "Avis", value: stats.total, icon: MessageSquareText },
          { label: "Masqués", value: stats.hidden, icon: EyeOff },
          { label: "Signalements", value: stats.reported, icon: Flag },
        ]}
      />

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">Total</CardTitle>
            <MessageSquareText className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{stats.total}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">Publiés</CardTitle>
            <Badge variant="secondary" className="bg-emerald-100 text-emerald-800">OK</Badge>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{stats.published}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">Masqués</CardTitle>
            <EyeOff className="h-4 w-4 text-slate-500" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{stats.hidden}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">À revoir</CardTitle>
            <ShieldAlert className="h-4 w-4 text-amber-500" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{stats.flagged}</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="flex flex-col gap-3 py-4 md:flex-row md:items-center">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Rechercher par restaurant, commentaire, id utilisateur ou id avis"
              className="pl-9"
            />
          </div>
          <select
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value)}
            className="h-10 rounded-md border bg-background px-3 text-sm"
          >
            <option value="all">Tous les statuts</option>
            {STATUS_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </CardContent>
      </Card>

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((index) => (
            <div key={index} className="h-44 rounded-xl bg-muted animate-pulse" />
          ))}
        </div>
      ) : filteredReviews.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground">
            Aucun avis ne correspond au filtre.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {filteredReviews.map((review) => {
            const effectiveStatus = review.status || "published";
            const restaurantReply = getRestaurantReply(review);
            const adminReply = getAdminReply(review);
            const replyValue = replyDrafts[review.id] ?? adminReply?.reply_text ?? "";
            const priority = moderationPriority(review);
            const reports = review.review_reports || [];
            const openReports = reports.filter((report) => report.status === "open");
            return (
              <Card key={review.id}>
                <CardContent className="space-y-4 py-4">
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
                    <div className="min-w-0 flex-1 space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-xs font-medium text-muted-foreground">
                          {review.restaurants?.name || "Restaurant inconnu"}
                        </span>
                        <Badge variant="outline">{effectiveStatus}</Badge>
                        <Badge variant="secondary">{Number(review.rating || review.restaurant_rating || 0).toFixed(1)}/5</Badge>
                        <Badge variant={priority.variant}>Priorite {priority.label}</Badge>
                      </div>

                      <div className="flex flex-wrap gap-3 text-[11px] text-muted-foreground">
                        <span>Service {Number(review.service_rating ?? review.rating ?? 0).toFixed(1)}/5</span>
                        <span>Qualité {Number(review.quality_rating ?? review.food_rating ?? review.rating ?? 0).toFixed(1)}/5</span>
                        <span>Rapide {Number(review.speed_rating ?? review.rating ?? 0).toFixed(1)}/5</span>
                        <span>Client {review.user_id}</span>
                      </div>

                      {review.tags && review.tags.length > 0 ? (
                        <div className="flex flex-wrap gap-2">
                          {review.tags.map((tag) => (
                            <Badge key={tag} variant="secondary" className="text-[10px]">
                              {tag}
                            </Badge>
                          ))}
                        </div>
                      ) : null}

                      {reports.length > 0 || review.report_reason ? (
                        <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm">
                          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                            <p className="flex items-center gap-2 font-medium text-amber-900">
                              <Flag className="h-4 w-4" />
                              Signalements restaurateur
                            </p>
                            <Badge variant={openReports.length > 0 ? "destructive" : "outline"}>
                              {openReports.length > 0 ? `${openReports.length} ouvert(s)` : "Traité"}
                            </Badge>
                          </div>
                          <div className="space-y-2">
                            {reports.length > 0 ? reports.map((report) => (
                              <div key={report.id} className="rounded-lg bg-white/70 p-2">
                                <p className="text-amber-950">{report.reason}</p>
                                <p className="mt-1 text-xs text-muted-foreground">
                                  Statut {report.status} - {new Date(report.created_at).toLocaleString("fr-FR")}
                                  {report.admin_decision ? ` - Décision ${report.admin_decision}` : ""}
                                </p>
                                {report.admin_note ? (
                                  <p className="mt-1 text-xs text-muted-foreground">Note admin: {report.admin_note}</p>
                                ) : null}
                              </div>
                            )) : (
                              <p className="text-amber-950">{review.report_reason}</p>
                            )}
                          </div>
                        </div>
                      ) : null}

                      <p className="text-sm">{review.comment || "Sans commentaire"}</p>
                      <p className="text-xs text-muted-foreground">
                        {new Date(review.created_at).toLocaleDateString("fr-FR", {
                          day: "2-digit",
                          month: "long",
                          year: "numeric",
                        })}
                      </p>

                      {restaurantReply ? (
                        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm">
                          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                            <p className="flex items-center gap-2 font-medium text-emerald-950">
                              <MessageSquareText className="h-4 w-4" />
                              Réponse restaurateur
                            </p>
                            <Badge variant="outline" className="border-emerald-300 bg-white/70 text-emerald-800">
                              Visible client
                            </Badge>
                          </div>
                          <p className="whitespace-pre-wrap text-emerald-950">{restaurantReply.reply_text}</p>
                          <p className="mt-2 text-xs text-emerald-800">
                            Répondu le {new Date(restaurantReply.created_at).toLocaleString("fr-FR")}
                          </p>
                        </div>
                      ) : null}
                    </div>

                    <div className="flex w-full min-w-0 flex-col gap-2 md:w-auto md:min-w-[260px]">
                      <Input
                        value={reasonDrafts[review.id] || ""}
                        onChange={(event) =>
                          setReasonDrafts((current) => ({
                            ...current,
                            [review.id]: event.target.value,
                          }))
                        }
                        placeholder="Raison obligatoire"
                      />
                      {openReports.length > 0 || effectiveStatus === "flagged" ? (
                        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                          <Button size="sm" variant="outline" onClick={() => updateReviewStatus(review.id, "published")}>
                            <CheckCircle2 className="mr-2 h-4 w-4" />
                            Restaurer l'avis
                          </Button>
                          <Button size="sm" variant="destructive" onClick={() => handleDelete(review.id)}>
                            <Trash2 className="mr-2 h-4 w-4" />
                            Archiver l'avis
                          </Button>
                        </div>
                      ) : null}
                      <div className="flex flex-wrap items-center gap-2">
                        {STATUS_OPTIONS.map((option) => (
                          <Button
                            key={option.value}
                            size="sm"
                            variant={effectiveStatus === option.value ? "default" : "outline"}
                            onClick={() => updateReviewStatus(review.id, option.value)}
                          >
                            {option.label}
                          </Button>
                        ))}
                        <Button size="icon" variant="ghost" className="text-destructive" onClick={() => handleDelete(review.id)}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </div>

                  <div className="rounded-xl border p-3 space-y-3">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm font-medium">Réponse admin</p>
                      {adminReply ? (
                        <span className="text-xs text-muted-foreground">
                          Derniere mise à jour le {new Date(adminReply.created_at).toLocaleDateString("fr-FR")}
                        </span>
                      ) : null}
                    </div>
                    <Textarea
                      value={replyValue}
                      onFocus={() => setReplyDraft(review)}
                      onChange={(event) =>
                        setReplyDrafts((current) => ({
                          ...current,
                          [review.id]: event.target.value,
                        }))
                      }
                      placeholder="Saisir une réponse publique pour cet avis"
                    />
                    <div className="flex justify-end">
                      <Button onClick={() => saveReply(review)} disabled={savingReplyId === review.id}>
                        {savingReplyId === review.id ? "Enregistrement..." : adminReply ? "Mettre à jour la réponse" : "Publier la réponse"}
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
