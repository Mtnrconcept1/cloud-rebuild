import { useEffect, useState, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth-context";
import { invokeSupabaseRpc } from "@/lib/session";

interface ReviewFormProps {
  restaurantId: string;
  onSuccess: () => void;
}

interface RatingSliderProps {
  label: string;
  value: number;
  onChange: (value: number) => void;
}

type ReviewSubmissionState = {
  can_submit: boolean;
  has_verified_consumption: boolean;
  already_reviewed: boolean;
};

const REVIEW_INELIGIBLE_MESSAGE =
  "Pour éviter les abus et les campagnes de mauvais commentaires, seuls les clients ayant déjà consommé dans ce restaurant via TOK peuvent laisser un avis. Il faut avoir réservé ou commandé ce restaurant via TOK.";

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

function normalizeReviewSubmissionState(payload: unknown): ReviewSubmissionState | null {
  const row = Array.isArray(payload) ? payload[0] : payload;
  if (!row || typeof row !== "object") return null;

  const state = row as Partial<ReviewSubmissionState>;
  return {
    can_submit: Boolean(state.can_submit),
    has_verified_consumption: Boolean(state.has_verified_consumption),
    already_reviewed: Boolean(state.already_reviewed),
  };
}

function getLockedReviewMessage(reviewState: ReviewSubmissionState) {
  if (reviewState.already_reviewed) {
    return "Vous avez déjà laissé un avis pour ce restaurant.";
  }

  return REVIEW_INELIGIBLE_MESSAGE;
}

function getReviewSubmissionErrorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : "Impossible d'envoyer l'avis.";

  switch (message) {
    case "auth_required":
    case "permission denied for function submit_verified_review":
      return "Votre session a expiré. Reconnectez-vous puis réessayez.";
    case "review_not_eligible":
      return REVIEW_INELIGIBLE_MESSAGE;
    case "review_already_submitted":
      return "Vous avez déjà laissé un avis pour ce restaurant.";
    case "rating_out_of_range":
      return "Les notes doivent être comprises entre 1 et 10.";
    default:
      return message;
  }
}

export default function ReviewForm({ restaurantId, onSuccess }: ReviewFormProps) {
  const { user } = useAuth();
  const userId = user?.id;
  const { toast } = useToast();
  const [serviceRating, setServiceRating] = useState(8);
  const [qualityRating, setQualityRating] = useState(8);
  const [speedRating, setSpeedRating] = useState(8);
  const [comment, setComment] = useState("");
  const [loading, setLoading] = useState(false);
  const [stateLoading, setStateLoading] = useState(false);
  const [reviewState, setReviewState] = useState<ReviewSubmissionState | null>(null);
  const overallRating = Math.round((serviceRating + qualityRating + speedRating) / 3);

  useEffect(() => {
    let isActive = true;

    if (!userId || !restaurantId) {
      setReviewState(null);
      setStateLoading(false);
      return () => {
        isActive = false;
      };
    }

    setStateLoading(true);

    invokeSupabaseRpc<ReviewSubmissionState[]>("get_restaurant_review_submission_state", {
      body: { p_restaurant_id: restaurantId },
    })
      .then((payload) => {
        if (isActive) setReviewState(normalizeReviewSubmissionState(payload));
      })
      .catch(() => {
        if (isActive) setReviewState(null);
      })
      .finally(() => {
        if (isActive) setStateLoading(false);
      });

    return () => {
      isActive = false;
    };
  }, [restaurantId, userId]);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!user) return;

    if (reviewState && !reviewState.can_submit) {
      toast({
        title: "Avis indisponible",
        description: getLockedReviewMessage(reviewState),
        variant: "destructive",
      });
      return;
    }

    setLoading(true);

    try {
      await invokeSupabaseRpc("submit_verified_review", {
        body: {
          p_restaurant_id: restaurantId,
          p_rating: overallRating,
          p_service_rating: serviceRating,
          p_quality_rating: qualityRating,
          p_speed_rating: speedRating,
          p_comment: comment || null,
          p_tags: [],
          p_reservation_id: null,
          p_order_id: null,
        },
      });
    } catch (error) {
      setLoading(false);
      toast({
        title: "Erreur",
        description: getReviewSubmissionErrorMessage(error),
        variant: "destructive",
      });
      return;
    }

    setLoading(false);
    toast({ title: "Avis publié !" });
    setServiceRating(8);
    setQualityRating(8);
    setSpeedRating(8);
    setComment("");
    setReviewState({ can_submit: false, has_verified_consumption: true, already_reviewed: true });
    onSuccess();
  };

  if (!user) return null;

  if (stateLoading && !reviewState) {
    return (
      <div className="space-y-2 rounded-xl border bg-card p-4">
        <h4 className="text-sm font-semibold">Laisser un avis</h4>
        <p className="text-xs text-muted-foreground">Vérification de votre éligibilité...</p>
      </div>
    );
  }

  if (reviewState && !reviewState.can_submit) {
    return (
      <div className="space-y-2 rounded-xl border bg-card p-4">
        <h4 className="text-sm font-semibold">Laisser un avis</h4>
        <p className="text-sm text-muted-foreground">{getLockedReviewMessage(reviewState)}</p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3 rounded-xl border bg-card p-4">
      <h4 className="text-sm font-semibold">Laisser un avis</h4>
      <div className="space-y-3 rounded-lg border bg-secondary/20 p-3">
        <RatingSlider label="Service" value={serviceRating} onChange={setServiceRating} />
        <RatingSlider label="Qualité" value={qualityRating} onChange={setQualityRating} />
        <RatingSlider label="Rapidité" value={speedRating} onChange={setSpeedRating} />
      </div>
      <p className="text-xs text-muted-foreground">
        Les avis sont réservés aux visites effectivement honorées et vérifiées côté serveur.
      </p>
      <div className="flex items-center justify-between rounded-lg border bg-primary/5 px-3 py-2">
        <span className="text-sm font-medium">Note globale</span>
        <span className="text-lg font-bold text-primary">{overallRating}/10</span>
      </div>
      <Textarea value={comment} onChange={(event) => setComment(event.target.value)} placeholder="Votre commentaire..." />
      <Button type="submit" size="sm" disabled={loading || stateLoading}>
        {loading ? "Envoi..." : stateLoading ? "Vérification..." : "Publier"}
      </Button>
    </form>
  );
}
