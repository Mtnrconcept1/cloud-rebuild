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
import { EyeOff, MessageSquareText, Search, ShieldAlert, Trash2 } from "lucide-react";

const supabase = getSupabase();

type ReviewReply = {
  id: string;
  reply_text: string;
  author_type: string | null;
  created_at: string;
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
  created_at: string;
  restaurants?: { name: string | null } | null;
  review_replies?: ReviewReply[] | null;
};

const STATUS_OPTIONS = [
  { value: "published", label: "Publié" },
  { value: "hidden", label: "Masqué" },
  { value: "flagged", label: "À revoir" },
  { value: "archived", label: "Archivé" },
];

const REQUIRED_REASON_STATUSES = new Set(["hidden", "flagged", "archived"]);

function moderationPriority(review: AdminReview) {
  const rating = Number(review.rating || review.restaurant_rating || 0);
  const comment = (review.comment || "").toLowerCase();
  const status = review.status || "published";
  const riskWords = ["danger", "intoxication", "fraude", "arnaque", "insulte", "menace", "hygiene"];
  let score = 0;

  if (status === "flagged") score += 80;
  if (rating > 0 && rating <= 2) score += 35;
  if (riskWords.some((word) => comment.includes(word))) score += 30;
  if (!review.comment?.trim()) score += 5;

  if (score >= 80) return { score, label: "Critique", variant: "destructive" as const };
  if (score >= 35) return { score, label: "Haute", variant: "secondary" as const };
  return { score, label: "Normale", variant: "outline" as const };
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
      const { data, error } = await supabase
        .from("reviews")
        .select("id, user_id, restaurant_id, rating, quality_rating, service_rating, speed_rating, restaurant_rating, food_rating, courier_rating, comment, tags, status, created_at, restaurants(name), review_replies(id, reply_text, author_type, created_at)")
        .order("created_at", { ascending: false });

      if (error) throw error;
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
    };
  }, [reviews]);

  const setReplyDraft = (review: AdminReview) => {
    const existingReply = review.review_replies?.[0]?.reply_text || "";
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
    const replyText = (replyDrafts[review.id] ?? review.review_replies?.[0]?.reply_text ?? "").trim();
    if (!replyText) {
      toast({ title: "Réponse vide", description: "Saisissez une réponse avant d'enregistrer.", variant: "destructive" });
      return;
    }
    if (!user?.id) {
      toast({ title: "Session invalide", description: "Impossible d'identifier l'admin connecté.", variant: "destructive" });
      return;
    }

    setSavingReplyId(review.id);
    const existingReply = review.review_replies?.[0];
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
    toast({ title: existingReply ? "Réponse mise à jour" : "Réponse publiée" });
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
          { label: "À revoir", value: stats.flagged, icon: ShieldAlert },
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
            const existingReply = review.review_replies?.[0];
            const replyValue = replyDrafts[review.id] ?? existingReply?.reply_text ?? "";
            const priority = moderationPriority(review);
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

                      <p className="text-sm">{review.comment || "Sans commentaire"}</p>
                      <p className="text-xs text-muted-foreground">
                        {new Date(review.created_at).toLocaleDateString("fr-FR", {
                          day: "2-digit",
                          month: "long",
                          year: "numeric",
                        })}
                      </p>
                    </div>

                    <div className="flex min-w-[260px] flex-col gap-2">
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
                      {existingReply ? (
                        <span className="text-xs text-muted-foreground">
                          Derniere mise à jour le {new Date(existingReply.created_at).toLocaleDateString("fr-FR")}
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
                        {savingReplyId === review.id ? "Enregistrement..." : existingReply ? "Mettre à jour la réponse" : "Publier la réponse"}
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
