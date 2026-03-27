import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";

interface ReviewFormProps {
  restaurantId: string;
  onSuccess: () => void;
}

interface RatingSliderProps {
  label: string;
  value: number;
  onChange: (value: number) => void;
}

type ReviewEligibility = {
  reservationId: string | null;
  reason: "eligible" | "no_visit" | "already_reviewed";
};

type ArrivedReservation = {
  id: string;
  date: string;
  time: string;
};

type ExistingReview = {
  reservation_id: string | null;
};

function RatingSlider({ label, value, onChange }: RatingSliderProps) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">{label}</span>
        <span className="text-sm font-bold text-primary">{value}/10</span>
      </div>
      <Slider min={1} max={10} step={1} value={[value]} onValueChange={(values) => onChange(values[0] || 1)} />
    </div>
  );
}

export default function ReviewForm({ restaurantId, onSuccess }: ReviewFormProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [serviceRating, setServiceRating] = useState(8);
  const [qualityRating, setQualityRating] = useState(8);
  const [speedRating, setSpeedRating] = useState(8);
  const [comment, setComment] = useState("");
  const [loading, setLoading] = useState(false);
  const overallRating = Math.round((serviceRating + qualityRating + speedRating) / 3);

  const { data: eligibility, isLoading: eligibilityLoading } = useQuery({
    queryKey: ["review-eligibility", restaurantId, user?.id],
    queryFn: async (): Promise<ReviewEligibility> => {
      if (!user) {
        return { reservationId: null, reason: "no_visit" };
      }

      const { data: reservations, error: reservationsError } = await supabase
        .from("reservations")
        .select("id, date, time")
        .eq("restaurant_id", restaurantId)
        .eq("user_id", user.id)
        .eq("status", "arrived")
        .order("date", { ascending: false })
        .order("time", { ascending: false });

      if (reservationsError) throw reservationsError;

      const arrivedReservations = (reservations || []) as ArrivedReservation[];
      if (!arrivedReservations.length) {
        return { reservationId: null, reason: "no_visit" };
      }

      const reservationIds = arrivedReservations.map((reservation) => reservation.id);
      const { data: reviews, error: reviewsError } = await supabase
        .from("reviews")
        .select("reservation_id")
        .in("reservation_id", reservationIds);

      if (reviewsError) throw reviewsError;

      const reviewedReservationIds = new Set(
        ((reviews || []) as ExistingReview[])
          .map((review) => review.reservation_id)
          .filter((reservationId): reservationId is string => Boolean(reservationId)),
      );

      const eligibleReservation = arrivedReservations.find(
        (reservation) => !reviewedReservationIds.has(reservation.id),
      );

      return eligibleReservation
        ? { reservationId: eligibleReservation.id, reason: "eligible" }
        : { reservationId: null, reason: "already_reviewed" };
    },
    enabled: !!user && !!restaurantId,
  });

  const canSubmitReview = !!eligibility?.reservationId;
  const eligibilityMessage = eligibilityLoading
    ? "Verification de votre derniere visite..."
    : eligibility?.reason === "already_reviewed"
      ? "Vous avez deja publie un avis pour chacune de vos visites verifiees dans ce restaurant."
      : eligibility?.reason === "no_visit"
        ? "Vous pourrez laisser un avis apres une visite marquee comme arrivee."
        : "Les avis sont reserves aux visites effectivement honorees et verifiees cote serveur.";

  const invalidateEligibility = () => {
    if (!user?.id) return;
    queryClient.invalidateQueries({ queryKey: ["review-eligibility", restaurantId, user.id] });
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!user) return;

    if (!eligibility?.reservationId) {
      toast({
        title: "Avis indisponible",
        description:
          eligibility?.reason === "already_reviewed"
            ? "Chaque visite verifiee ne peut recevoir qu'un seul avis."
            : "Une visite marquee comme arrivee est requise pour publier un avis.",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);
    const { error } = await (supabase.rpc as any)("submit_verified_review", {
      p_restaurant_id: restaurantId,
      p_rating: overallRating,
      p_service_rating: serviceRating,
      p_quality_rating: qualityRating,
      p_speed_rating: speedRating,
      p_comment: comment || null,
      p_tags: [],
      p_reservation_id: eligibility.reservationId,
    });
    setLoading(false);

    if (error) {
      if (
        error.message?.includes("Aucune visite verifiee disponible") ||
        error.message?.includes("Un avis existe deja")
      ) {
        invalidateEligibility();
      }

      toast({ title: "Erreur", description: error.message, variant: "destructive" });
      return;
    }

    toast({ title: "Avis publie !" });
    setServiceRating(8);
    setQualityRating(8);
    setSpeedRating(8);
    setComment("");
    invalidateEligibility();
    onSuccess();
  };

  if (!user) return null;

  return (
    <form onSubmit={handleSubmit} className="space-y-3 rounded-xl border bg-card p-4">
      <h4 className="text-sm font-semibold">Laisser un avis</h4>
      <div className="space-y-3 rounded-lg border bg-secondary/20 p-3">
        <RatingSlider label="Service" value={serviceRating} onChange={setServiceRating} />
        <RatingSlider label="Qualite" value={qualityRating} onChange={setQualityRating} />
        <RatingSlider label="Rapidite" value={speedRating} onChange={setSpeedRating} />
      </div>
      <p className="text-xs text-muted-foreground">{eligibilityMessage}</p>
      <div className="flex items-center justify-between rounded-lg border bg-primary/5 px-3 py-2">
        <span className="text-sm font-medium">Note globale</span>
        <span className="text-lg font-bold text-primary">{overallRating}/10</span>
      </div>
      <Textarea value={comment} onChange={(event) => setComment(event.target.value)} placeholder="Votre commentaire..." />
      <Button type="submit" size="sm" disabled={loading || eligibilityLoading || !canSubmitReview}>
        {loading ? "Envoi..." : eligibilityLoading ? "Verification..." : "Publier"}
      </Button>
    </form>
  );
}
