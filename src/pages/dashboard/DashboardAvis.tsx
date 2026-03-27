import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";

import DashboardLayout from "@/components/DashboardLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

import { useOwnerRestaurants } from "./useOwnerRestaurants";

type ReviewReply = {
  id: string;
  reply_text: string;
  created_at: string;
};

type ReviewItem = {
  id: string;
  comment: string | null;
  rating: number;
  quality_rating: number;
  service_rating: number;
  speed_rating: number;
  created_at: string;
  restaurant_id: string;
  verification_status?: string | null;
  confidence_score?: number | null;
  review_replies?: ReviewReply[] | null;
  restaurants?: { name: string } | null;
};

const EMPTY_REVIEW_ITEMS: ReviewItem[] = [];

export default function DashboardAvis() {
  const { toast } = useToast();
  const { restaurants, restaurantIds, loading: loadingRestaurants, error: restaurantError } = useOwnerRestaurants();
  const [replyDrafts, setReplyDrafts] = useState<Record<string, string>>({});
  const [savingId, setSavingId] = useState<string | null>(null);

  const {
    data: items = EMPTY_REVIEW_ITEMS,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ["dashboard-owner-reviews", restaurantIds],
    queryFn: async () => {
      if (!restaurantIds.length) return [] as ReviewItem[];

      const { data, error: queryError } = await supabase
        .from("reviews")
        .select("id, comment, rating, quality_rating, service_rating, speed_rating, created_at, restaurant_id, verification_status, confidence_score, restaurants(name), review_replies(id, reply_text, created_at)")
        .in("restaurant_id", restaurantIds)
        .order("created_at", { ascending: false });

      if (queryError) throw queryError;
      return (data || []) as ReviewItem[];
    },
    enabled: !loadingRestaurants,
  });

  useEffect(() => {
    const nextDrafts: Record<string, string> = {};
    items.forEach((item) => {
      nextDrafts[item.id] = item.review_replies?.[0]?.reply_text || "";
    });
    setReplyDrafts((current) => {
      const currentKeys = Object.keys(current);
      const nextKeys = Object.keys(nextDrafts);
      const hasSameValues =
        currentKeys.length === nextKeys.length &&
        nextKeys.every((key) => current[key] === nextDrafts[key]);

      return hasSameValues ? current : nextDrafts;
    });
  }, [items]);

  const handleSaveReply = async (reviewId: string) => {
    const replyText = (replyDrafts[reviewId] || "").trim();
    if (!replyText) {
      toast({ title: "Validation", description: "La réponse ne peut pas être vide.", variant: "destructive" });
      return;
    }

    setSavingId(reviewId);
    setReplyDrafts((current) => ({ ...current, [reviewId]: replyText }));
    const { error: replyError } = await (supabase.rpc as any)("upsert_review_reply", {
      p_review_id: reviewId,
      p_reply_text: replyText,
    });
    setSavingId(null);

    if (replyError) {
      toast({ title: "Erreur", description: replyError.message, variant: "destructive" });
      return;
    }

    toast({ title: "Réponse enregistrée" });
    refetch();
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="space-y-2">
          <h1 className="font-display text-3xl font-bold">Avis clients</h1>
          <p className="text-sm text-muted-foreground">
            Les avis sont désormais rattachés à des visites vérifiées. Cet écran est réservé à la lecture et aux réponses officielles.
          </p>
        </div>

        {loadingRestaurants || isLoading ? <p>Chargement...</p> : null}
        {restaurantError ? <p className="text-destructive">Erreur: {restaurantError}</p> : null}
        {error ? <p className="text-destructive">Erreur: {(error as Error).message}</p> : null}
        {!loadingRestaurants && !isLoading && !error && items.length === 0 ? <p>Aucun avis disponible.</p> : null}

        <div className="grid gap-3">
          {items.map((review) => {
            const existingReply = review.review_replies?.[0] || null;
            const confidence = Number(review.confidence_score || 0);

            return (
              <Card key={review.id}>
                <CardHeader className="space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="space-y-1">
                      <CardTitle className="text-base">{review.restaurants?.name || restaurants.find((item) => item.id === review.restaurant_id)?.name || "Restaurant"}</CardTitle>
                      <p className="text-xs text-muted-foreground">
                        {new Date(review.created_at).toLocaleString("fr-FR")}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge>{review.rating}/5</Badge>
                      <Badge variant="outline">
                        {review.verification_status === "verified" ? "Visite vérifiée" : "Non vérifié"}
                      </Badge>
                      <Badge variant="secondary">
                        Confiance {Math.round(confidence * 100)}%
                      </Badge>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid gap-2 text-sm sm:grid-cols-3">
                    <div className="rounded-lg border px-3 py-2">Service: {review.service_rating}/5</div>
                    <div className="rounded-lg border px-3 py-2">Qualité: {review.quality_rating}/5</div>
                    <div className="rounded-lg border px-3 py-2">Rapidité: {review.speed_rating}/5</div>
                  </div>

                  <div className="rounded-lg border bg-secondary/20 px-3 py-3 text-sm">
                    {review.comment || "Aucun commentaire"}
                  </div>

                  <div className="space-y-2">
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Réponse officielle
                    </p>
                    <Textarea
                      value={replyDrafts[review.id] || ""}
                      onChange={(event) => setReplyDrafts((current) => ({ ...current, [review.id]: event.target.value }))}
                      placeholder="Répondez à cet avis en tant que restaurant..."
                      rows={4}
                    />
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-xs text-muted-foreground">
                        {existingReply ? `Dernière réponse le ${new Date(existingReply.created_at).toLocaleString("fr-FR")}` : "Aucune réponse publiée pour l'instant."}
                      </p>
                      <Button size="sm" onClick={() => handleSaveReply(review.id)} disabled={savingId === review.id}>
                        {savingId === review.id ? "Enregistrement..." : existingReply ? "Mettre à jour" : "Publier la réponse"}
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
