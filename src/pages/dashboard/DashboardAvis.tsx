import { useCallback, useEffect, useMemo, useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { useCommercialDemoFrame } from "@/components/commercial/CommercialDemoFrameProvider";
import DashboardPageHero from "@/components/dashboard/DashboardPageHero";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { getSupabase } from "@/integrations/supabase/client";
import { runRestaurantAgent } from "@/lib/ai/tokAiClient";
import {
  buildCommercialDemoReviewReply,
  buildCommercialDemoReviewSeeds,
  readCommercialDemoToolState,
  writeCommercialDemoToolState,
} from "@/lib/commercialDemoRestaurantTools";
import {
  Bot,
  CheckCheck,
  Eye,
  EyeOff,
  Loader2,
  MessageSquareReply,
  MessageSquareText,
  ShieldAlert,
  ShieldCheck,
  SlidersHorizontal,
  Star,
  Store,
} from "lucide-react";
import { useOwnerRestaurants } from "./useOwnerRestaurants";

const supabase = getSupabase();

type ReviewReply = {
  id: string;
  reply_text: string;
  author_type: string | null;
  created_at: string;
};

type ReviewItem = {
  id: string;
  comment: string | null;
  rating: number;
  quality_rating: number | null;
  service_rating: number | null;
  speed_rating: number | null;
  created_at: string;
  restaurant_id: string;
  status: string | null;
  restaurant_read_at: string | null;
  restaurant_read_by: string | null;
  reported_at: string | null;
  report_reason: string | null;
  review_replies?: ReviewReply[] | null;
};

type ReadFilter = "all" | "unread" | "read";
type SortMode = "date_desc" | "date_asc" | "rating_desc" | "rating_asc";

type AiProfileForm = {
  brand_tone: string;
  visual_style: string;
  default_language: string;
  specialties: string;
  review_reply_policy: string;
};

const DEFAULT_AI_PROFILE: AiProfileForm = {
  brand_tone: "premium, chaleureux, direct",
  visual_style: "restaurant genevois, accueil soigné, ton professionnel",
  default_language: "fr-CH",
  specialties: "",
  review_reply_policy:
    "Remercier le client, répondre concrètement au point soulevé, éviter toute promesse non vérifiée et inviter à revenir si pertinent.",
};

function formatDate(value: string) {
  return new Date(value).toLocaleString("fr-CH", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getEffectiveStatus(review: ReviewItem) {
  return review.status || "published";
}

function getReply(review: ReviewItem) {
  return review.review_replies?.[0] || null;
}

function parseSpecialties(value: string) {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

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

export default function DashboardAvis() {
  const commercialDemoFrame = useCommercialDemoFrame();
  const isCommercialDemo = commercialDemoFrame?.surface === "restaurant";
  const { restaurants, restaurantIds, loading: loadingRestaurants, error: restaurantError } = useOwnerRestaurants();
  const { toast } = useToast();
  const [items, setItems] = useState<ReviewItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [readFilter, setReadFilter] = useState<ReadFilter>("all");
  const [sortMode, setSortMode] = useState<SortMode>("date_desc");
  const [replyDrafts, setReplyDrafts] = useState<Record<string, string>>({});
  const [reportDrafts, setReportDrafts] = useState<Record<string, string>>({});
  const [savingReviewId, setSavingReviewId] = useState<string | null>(null);
  const [generatingReviewId, setGeneratingReviewId] = useState<string | null>(null);
  const [selectedAiRestaurantId, setSelectedAiRestaurantId] = useState("");
  const [aiProfile, setAiProfile] = useState<AiProfileForm>(DEFAULT_AI_PROFILE);
  const [loadingAiProfile, setLoadingAiProfile] = useState(false);
  const [savingAiProfile, setSavingAiProfile] = useState(false);

  const restaurantIdsKey = restaurantIds.join(",");

  const restaurantNameById = useMemo(
    () => new Map(restaurants.map((restaurant) => [restaurant.id, restaurant.name])),
    [restaurants],
  );

  const loadReviews = useCallback(async () => {
    const ids = restaurantIdsKey ? restaurantIdsKey.split(",") : [];
    if (!ids.length) {
      setItems([]);
      setLoading(false);
      return;
    }

    if (isCommercialDemo && commercialDemoFrame) {
      const seeded = buildCommercialDemoReviewSeeds(commercialDemoFrame.snapshot) as ReviewItem[];
      setItems(readCommercialDemoToolState(commercialDemoFrame.config.sessionId, "reviews", seeded));
      setError(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    const reviewsQuery = supabase.from("reviews") as any;
    const { data, error: queryError } = await reviewsQuery
      .select(
        "id, comment, rating, quality_rating, service_rating, speed_rating, created_at, restaurant_id, status, restaurant_read_at, restaurant_read_by, reported_at, report_reason, review_replies(id, reply_text, author_type, created_at)",
      )
      .in("restaurant_id", ids)
      .order("created_at", { ascending: false })
      .limit(150);

    if (queryError) {
      if (!isSchemaDriftError(queryError)) {
        setError(queryError.message);
        setLoading(false);
        return;
      }

      const { data: legacyData, error: legacyError } = await reviewsQuery
        .select(
          "id, comment, rating, quality_rating, service_rating, speed_rating, created_at, restaurant_id, status, review_replies(id, reply_text, author_type, created_at)",
        )
        .in("restaurant_id", ids)
        .order("created_at", { ascending: false })
        .limit(150);

      if (legacyError) {
        setError(legacyError.message);
      } else {
        setItems(
          ((legacyData || []) as Array<Omit<ReviewItem, "restaurant_read_at" | "restaurant_read_by" | "reported_at" | "report_reason">>).map(
            (review) => ({
              ...review,
              restaurant_read_at: null,
              restaurant_read_by: null,
              reported_at: null,
              report_reason: null,
            }),
          ),
        );
      }
    } else {
      setItems((data || []) as ReviewItem[]);
    }
    setLoading(false);
  }, [commercialDemoFrame, isCommercialDemo, restaurantIdsKey]);

  const loadAiProfile = useCallback(async (restaurantId: string) => {
    if (!restaurantId) {
      setAiProfile(DEFAULT_AI_PROFILE);
      return;
    }

    if (isCommercialDemo && commercialDemoFrame) {
      setAiProfile(readCommercialDemoToolState(
        commercialDemoFrame.config.sessionId,
        "review-ai-profile",
        DEFAULT_AI_PROFILE,
      ));
      setLoadingAiProfile(false);
      return;
    }

    setLoadingAiProfile(true);
    const { data, error: profileError } = await (supabase.from as any)("restaurant_ai_profiles")
      .select("brand_tone, visual_style, default_language, specialties, guardrails")
      .eq("restaurant_id", restaurantId)
      .maybeSingle();

    setLoadingAiProfile(false);

    if (profileError) {
      if (isSchemaDriftError(profileError)) {
        setAiProfile(DEFAULT_AI_PROFILE);
        return;
      }

      toast({
        title: "Paramètres IA indisponibles",
        description: profileError.message,
        variant: "destructive",
      });
      setAiProfile(DEFAULT_AI_PROFILE);
      return;
    }

    if (!data) {
      setAiProfile(DEFAULT_AI_PROFILE);
      return;
    }

    const guardrails = data.guardrails && typeof data.guardrails === "object" ? data.guardrails : {};
    setAiProfile({
      brand_tone: data.brand_tone || DEFAULT_AI_PROFILE.brand_tone,
      visual_style: data.visual_style || DEFAULT_AI_PROFILE.visual_style,
      default_language: data.default_language || DEFAULT_AI_PROFILE.default_language,
      specialties: Array.isArray(data.specialties) ? data.specialties.join(", ") : "",
      review_reply_policy:
        typeof guardrails.review_reply_policy === "string"
          ? guardrails.review_reply_policy
          : DEFAULT_AI_PROFILE.review_reply_policy,
    });
  }, [commercialDemoFrame, isCommercialDemo, toast]);

  useEffect(() => {
    if (!loadingRestaurants) {
      void loadReviews();
    }
  }, [loadReviews, loadingRestaurants]);

  useEffect(() => {
    const ids = restaurantIdsKey ? restaurantIdsKey.split(",") : [];
    if (!selectedAiRestaurantId && ids.length > 0) {
      setSelectedAiRestaurantId(ids[0]);
    }
  }, [restaurantIdsKey, selectedAiRestaurantId]);

  useEffect(() => {
    void loadAiProfile(selectedAiRestaurantId);
  }, [loadAiProfile, selectedAiRestaurantId]);

  const filteredItems = useMemo(() => {
    const filtered = items.filter((review) => {
      const isRead = Boolean(review.restaurant_read_at);
      if (readFilter === "read") return isRead;
      if (readFilter === "unread") return !isRead;
      return true;
    });

    return [...filtered].sort((a, b) => {
      if (sortMode === "date_asc") return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
      if (sortMode === "rating_desc") return Number(b.rating || 0) - Number(a.rating || 0);
      if (sortMode === "rating_asc") return Number(a.rating || 0) - Number(b.rating || 0);
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });
  }, [items, readFilter, sortMode]);

  const stats = useMemo(() => {
    const unread = items.filter((review) => !review.restaurant_read_at).length;
    const reported = items.filter((review) => getEffectiveStatus(review) === "flagged").length;
    return {
      total: items.length,
      unread,
      read: items.length - unread,
      reported,
    };
  }, [items]);

  const markRead = async (review: ReviewItem) => {
    setSavingReviewId(review.id);
    if (isCommercialDemo && commercialDemoFrame) {
      const now = new Date().toISOString();
      setItems((current) => {
        const next = current.map((item) => (item.id === review.id ? { ...item, restaurant_read_at: now } : item));
        writeCommercialDemoToolState(commercialDemoFrame.config.sessionId, "reviews", next);
        return next;
      });
      setSavingReviewId(null);
      toast({ title: "Avis Démo marqué comme lu", description: "État isolé dans cette session de démonstration." });
      return;
    }
    const { error: rpcError } = await (supabase.rpc as any)("restaurant_mark_review_read", {
      p_review_id: review.id,
    });
    setSavingReviewId(null);

    if (rpcError) {
      toast({ title: "Lecture non enregistrée", description: rpcError.message, variant: "destructive" });
      return;
    }

    const now = new Date().toISOString();
    setItems((current) =>
      current.map((item) => (item.id === review.id ? { ...item, restaurant_read_at: now } : item)),
    );
    toast({ title: "Avis marqué comme lu", description: "Le statut de lecture est enregistré." });
  };

  const saveReply = async (review: ReviewItem) => {
    const replyText = (replyDrafts[review.id] ?? getReply(review)?.reply_text ?? "").trim();
    if (!replyText) {
      toast({ title: "Réponse vide", description: "Saisissez une réponse avant de publier.", variant: "destructive" });
      return;
    }

    setSavingReviewId(review.id);
    if (isCommercialDemo && commercialDemoFrame) {
      const now = new Date().toISOString();
      setItems((current) => {
        const next = current.map((item) => item.id === review.id ? {
          ...item,
          restaurant_read_at: item.restaurant_read_at || now,
          review_replies: [{
            id: `demo-reply-${review.id}`,
            reply_text: replyText,
            author_type: "restaurant",
            created_at: now,
          }],
        } : item);
        writeCommercialDemoToolState(commercialDemoFrame.config.sessionId, "reviews", next);
        return next;
      });
      setReplyDrafts((current) => ({ ...current, [review.id]: replyText }));
      setSavingReviewId(null);
      toast({ title: "Réponse Démo publiée", description: "Aucun avis ni client de production n'a été modifié." });
      return;
    }
    const { error: rpcError } = await (supabase.rpc as any)("restaurant_reply_review", {
      p_review_id: review.id,
      p_reply_text: replyText,
    });
    setSavingReviewId(null);

    if (rpcError) {
      toast({ title: "Réponse non publiée", description: rpcError.message, variant: "destructive" });
      return;
    }

    await loadReviews();
    setReplyDrafts((current) => ({ ...current, [review.id]: replyText }));
    toast({ title: "Réponse publiée", description: "Le client sera notifié de votre réponse." });
  };

  const generateAiReply = async (review: ReviewItem) => {
    setGeneratingReviewId(review.id);
    try {
      if (isCommercialDemo && commercialDemoFrame) {
        const draft = buildCommercialDemoReviewReply({
          rating: review.rating,
          comment: review.comment,
          brandTone: aiProfile.brand_tone,
        });
        setReplyDrafts((current) => ({ ...current, [review.id]: draft }));
        toast({
          title: "Réponse IA Démo générée",
          description: "Moteur local zéro coût : aucun appel payant, crédit ou message de production.",
        });
        return;
      }

      const response = await runRestaurantAgent({
        restaurantId: review.restaurant_id,
        action: "review_reply",
        prompt:
          "Prépare une réponse publique, courte, sincère et professionnelle à cet avis client. Ne prétends jamais avoir corrigé un problème sans preuve.",
        context: {
          source: "restaurant_dashboard_reviews",
          review: {
            id: review.id,
            rating: review.rating,
            comment: review.comment,
            created_at: review.created_at,
            restaurant_name: restaurantNameById.get(review.restaurant_id) || "Restaurant",
          },
          restaurant_style: {
            brand_tone: aiProfile.brand_tone,
            visual_style: aiProfile.visual_style,
            default_language: aiProfile.default_language,
            specialties: parseSpecialties(aiProfile.specialties),
            review_reply_policy: aiProfile.review_reply_policy,
          },
        },
      });
      const draft = (response.markdown || response.summary || "").trim();
      if (!draft) throw new Error("L'agent IA n'a pas retourné de brouillon exploitable.");
      setReplyDrafts((current) => ({ ...current, [review.id]: draft }));
      toast({ title: "Réponse IA générée", description: "Relisez puis publiez la réponse depuis le dashboard." });
    } catch (generationError) {
      toast({
        title: "Génération IA impossible",
        description: generationError instanceof Error ? generationError.message : "Erreur inconnue.",
        variant: "destructive",
      });
    } finally {
      setGeneratingReviewId(null);
    }
  };

  const reportReview = async (review: ReviewItem) => {
    const reason = (reportDrafts[review.id] || "").trim();
    if (!reason) {
      toast({
        title: "Raison obligatoire",
        description: "Expliquez pourquoi l'avis doit être vérifié par l'admin.",
        variant: "destructive",
      });
      return;
    }

    setSavingReviewId(review.id);
    if (isCommercialDemo && commercialDemoFrame) {
      const now = new Date().toISOString();
      setItems((current) => {
        const next = current.map((item) => item.id === review.id ? {
          ...item,
          status: "flagged",
          reported_at: now,
          report_reason: reason,
          restaurant_read_at: item.restaurant_read_at || now,
        } : item);
        writeCommercialDemoToolState(commercialDemoFrame.config.sessionId, "reviews", next);
        return next;
      });
      setReportDrafts((current) => ({ ...current, [review.id]: "" }));
      setSavingReviewId(null);
      toast({ title: "Signalement Démo enregistré", description: "Simulation isolée : aucun signalement admin réel n'a été créé." });
      return;
    }
    const { error: rpcError } = await (supabase.rpc as any)("restaurant_report_review", {
      p_review_id: review.id,
      p_reason: reason,
    });
    setSavingReviewId(null);

    if (rpcError) {
      toast({ title: "Signalement non envoyé", description: rpcError.message, variant: "destructive" });
      return;
    }

    const now = new Date().toISOString();
    setItems((current) =>
      current.map((item) =>
        item.id === review.id
          ? { ...item, status: "flagged", reported_at: now, report_reason: reason, restaurant_read_at: item.restaurant_read_at || now }
          : item,
      ),
    );
    setReportDrafts((current) => ({ ...current, [review.id]: "" }));
    toast({
      title: "Avis signalé",
      description: "Il est masqué temporairement et l'admin TOK est notifié.",
    });
  };

  const saveAiProfile = async () => {
    if (!selectedAiRestaurantId) return;

    setSavingAiProfile(true);
    if (isCommercialDemo && commercialDemoFrame) {
      writeCommercialDemoToolState(commercialDemoFrame.config.sessionId, "review-ai-profile", aiProfile);
      setSavingAiProfile(false);
      toast({ title: "Style IA Démo enregistré", description: "Consignes conservées uniquement dans cette session Démo." });
      return;
    }
    const { error: saveError } = await (supabase.from as any)("restaurant_ai_profiles").upsert(
      {
        restaurant_id: selectedAiRestaurantId,
        brand_tone: aiProfile.brand_tone.trim() || DEFAULT_AI_PROFILE.brand_tone,
        visual_style: aiProfile.visual_style.trim() || DEFAULT_AI_PROFILE.visual_style,
        default_language: aiProfile.default_language.trim() || DEFAULT_AI_PROFILE.default_language,
        specialties: parseSpecialties(aiProfile.specialties),
        guardrails: {
          review_reply_policy: aiProfile.review_reply_policy.trim() || DEFAULT_AI_PROFILE.review_reply_policy,
        },
      },
      { onConflict: "restaurant_id" },
    );
    setSavingAiProfile(false);

    if (saveError) {
      toast({ title: "Paramètres IA non enregistrés", description: saveError.message, variant: "destructive" });
      return;
    }

    toast({ title: "Style IA enregistré", description: "Les prochaines réponses générées utiliseront ces consignes." });
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <DashboardPageHero
          badge="Relation client"
          title="Avis clients"
          description={isCommercialDemo
            ? "Avis, réponses et signalements entièrement simulés dans cette session Démo isolée."
            : "Suivez les retours, traitez les avis non lus, préparez les réponses et signalez les contenus à vérifier."}
          icon={MessageSquareText}
          tone="sky"
          visualLabel="Réputation"
          stats={[
            { label: "Avis chargés", value: stats.total, icon: Star },
            { label: "Non lus", value: stats.unread, icon: EyeOff },
            { label: "Signalés", value: stats.reported, icon: ShieldAlert },
          ]}
        />

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <SlidersHorizontal className="h-5 w-5 text-primary" />
              Pilotage des avis clients
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 lg:grid-cols-[1fr_1fr_1.4fr]">
            <div className="space-y-2">
              <label htmlFor="read-filter" className="text-sm font-medium">
                Lecture
              </label>
              <select
                id="read-filter"
                value={readFilter}
                onChange={(event) => setReadFilter(event.target.value as ReadFilter)}
                className="h-10 w-full rounded-md border bg-background px-3 text-sm"
              >
                <option value="all">Tous les avis</option>
                <option value="unread">Pas encore lus</option>
                <option value="read">Déjà lus</option>
              </select>
              <p className="text-xs text-muted-foreground">
                {stats.unread} non lus, {stats.read} déjà lus.
              </p>
            </div>

            <div className="space-y-2">
              <label htmlFor="sort-mode" className="text-sm font-medium">
                Tri
              </label>
              <select
                id="sort-mode"
                value={sortMode}
                onChange={(event) => setSortMode(event.target.value as SortMode)}
                className="h-10 w-full rounded-md border bg-background px-3 text-sm"
              >
                <option value="date_desc">Date récente d'abord</option>
                <option value="date_asc">Date ancienne d'abord</option>
                <option value="rating_desc">Meilleure note d'abord</option>
                <option value="rating_asc">Note la plus basse d'abord</option>
              </select>
              <p className="text-xs text-muted-foreground">Tri par date ou nombre d'étoiles/note.</p>
            </div>

            <div className="rounded-lg border bg-muted/20 p-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold">Style de réponse automatique</p>
                  <p className="text-xs text-muted-foreground">Profil restaurant_ai_profiles utilisé par l'agent IA.</p>
                </div>
                <Bot className="h-5 w-5 text-primary" />
              </div>
              <div className="mt-3 grid gap-2 md:grid-cols-2">
                <select
                  value={selectedAiRestaurantId}
                  onChange={(event) => setSelectedAiRestaurantId(event.target.value)}
                  className="h-10 rounded-md border bg-background px-3 text-sm md:col-span-2"
                >
                  {restaurants.map((restaurant) => (
                    <option key={restaurant.id} value={restaurant.id}>
                      {restaurant.name}
                    </option>
                  ))}
                </select>
                <Input
                  value={aiProfile.brand_tone}
                  onChange={(event) => setAiProfile((current) => ({ ...current, brand_tone: event.target.value }))}
                  placeholder="Ton: chaleureux, premium..."
                  disabled={loadingAiProfile}
                />
                <Input
                  value={aiProfile.default_language}
                  onChange={(event) => setAiProfile((current) => ({ ...current, default_language: event.target.value }))}
                  placeholder="Langue"
                  disabled={loadingAiProfile}
                />
                <Input
                  value={aiProfile.visual_style}
                  onChange={(event) => setAiProfile((current) => ({ ...current, visual_style: event.target.value }))}
                  placeholder="Style du restaurant"
                  disabled={loadingAiProfile}
                  className="md:col-span-2"
                />
                <Input
                  value={aiProfile.specialties}
                  onChange={(event) => setAiProfile((current) => ({ ...current, specialties: event.target.value }))}
                  placeholder="Spécialités séparées par des virgules"
                  disabled={loadingAiProfile}
                  className="md:col-span-2"
                />
                <Textarea
                  value={aiProfile.review_reply_policy}
                  onChange={(event) => setAiProfile((current) => ({ ...current, review_reply_policy: event.target.value }))}
                  placeholder="Consignes de réponse automatique"
                  disabled={loadingAiProfile}
                  className="min-h-[82px] md:col-span-2"
                />
              </div>
              <div className="mt-3 flex justify-end">
                <Button onClick={saveAiProfile} disabled={!selectedAiRestaurantId || savingAiProfile || loadingAiProfile}>
                  {savingAiProfile ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  Enregistrer le style IA
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {loadingRestaurants || loading ? <p>Chargement...</p> : null}
        {restaurantError || error ? <p className="text-destructive">Erreur: {restaurantError || error}</p> : null}
        {!loading && !restaurantError && !error && !items.length ? <p>Aucun avis disponible.</p> : null}

        <div className="grid gap-3">
          {filteredItems.map((review) => {
            const isRead = Boolean(review.restaurant_read_at);
            const isFlagged = getEffectiveStatus(review) === "flagged";
            const reply = getReply(review);
            const replyValue = replyDrafts[review.id] ?? reply?.reply_text ?? "";
            const isBusy = savingReviewId === review.id;
            const isGenerating = generatingReviewId === review.id;

            return (
              <Card key={review.id} className={isFlagged ? "border-amber-300 bg-amber-50/40" : undefined}>
                <CardContent className="space-y-4 pt-6">
                  <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                    <div className="min-w-0 space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge>{Number(review.rating || 0).toFixed(0)}/10</Badge>
                        <Badge variant={isRead ? "secondary" : "outline"}>
                          {isRead ? (
                            <>
                              <Eye className="mr-1 h-3 w-3" /> Déjà lu
                            </>
                          ) : (
                            <>
                              <EyeOff className="mr-1 h-3 w-3" /> Pas encore lu
                            </>
                          )}
                        </Badge>
                        {isFlagged ? (
                          <Badge variant="destructive">
                            <ShieldAlert className="mr-1 h-3 w-3" /> Signalé
                          </Badge>
                        ) : null}
                        {reply ? (
                          <Badge variant="secondary">
                            <MessageSquareReply className="mr-1 h-3 w-3" /> Répondu
                          </Badge>
                        ) : null}
                      </div>
                      <p className="text-xs font-medium text-muted-foreground">
                        {restaurantNameById.get(review.restaurant_id) || "Restaurant"}
                      </p>
                      <p className="text-sm">{review.comment || "Aucun commentaire"}</p>
                      <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
                        <span>{formatDate(review.created_at)}</span>
                        <span>Qualité {Number(review.quality_rating ?? review.rating ?? 0).toFixed(0)}/10</span>
                        <span>Service {Number(review.service_rating ?? review.rating ?? 0).toFixed(0)}/10</span>
                        <span>Rapidité {Number(review.speed_rating ?? review.rating ?? 0).toFixed(0)}/10</span>
                      </div>
                      {review.report_reason ? (
                        <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                          Signalement envoyé: {review.report_reason}
                        </p>
                      ) : null}
                    </div>

                    <Button
                      variant={isRead ? "outline" : "secondary"}
                      size="sm"
                      onClick={() => markRead(review)}
                      disabled={isBusy}
                    >
                      {isBusy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCheck className="mr-2 h-4 w-4" />}
                      {isRead ? "Actualiser lecture" : "Marquer comme lu"}
                    </Button>
                  </div>

                  <div className="grid gap-3 lg:grid-cols-[1fr_320px]">
                    <div className="space-y-2 rounded-lg border p-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="text-sm font-medium">Réponse restaurateur</p>
                        {reply ? (
                          <span className="text-xs text-muted-foreground">Dernière réponse: {formatDate(reply.created_at)}</span>
                        ) : null}
                      </div>
                      <Textarea
                        value={replyValue}
                        onChange={(event) =>
                          setReplyDrafts((current) => ({
                            ...current,
                            [review.id]: event.target.value,
                          }))
                        }
                        placeholder="Répondez directement au client depuis le dashboard"
                        className="min-h-[110px]"
                      />
                      <div className="flex flex-wrap justify-end gap-2">
                        <Button variant="outline" onClick={() => generateAiReply(review)} disabled={isGenerating || isBusy}>
                          {isGenerating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Bot className="mr-2 h-4 w-4" />}
                          Générer une réponse IA
                        </Button>
                        <Button onClick={() => saveReply(review)} disabled={isBusy || isGenerating}>
                          {isBusy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ShieldCheck className="mr-2 h-4 w-4" />}
                          {reply ? "Mettre à jour la réponse" : "Publier la réponse"}
                        </Button>
                      </div>
                    </div>

                    <div className="space-y-2 rounded-lg border p-3">
                      <p className="text-sm font-medium">Signalement admin</p>
                      <Textarea
                        value={reportDrafts[review.id] || ""}
                        onChange={(event) =>
                          setReportDrafts((current) => ({
                            ...current,
                            [review.id]: event.target.value,
                          }))
                        }
                        placeholder="Motif du signalement"
                        className="min-h-[110px]"
                        disabled={isFlagged}
                      />
                      <Button
                        variant="outline"
                        className="w-full border-amber-300 text-amber-700 hover:bg-amber-50"
                        onClick={() => reportReview(review)}
                        disabled={isFlagged || isBusy}
                      >
                        {isBusy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ShieldAlert className="mr-2 h-4 w-4" />}
                        {isFlagged ? "Avis déjà signalé" : "Signaler l'avis"}
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>
    </DashboardLayout>
  );
}
