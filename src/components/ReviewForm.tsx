import { useState } from "react";

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

function getReviewSubmissionErrorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : "Impossible d'envoyer l'avis.";

  switch (message) {
    case "auth_required":
    case "permission denied for function submit_verified_review":
      return "Votre session a expire. Reconnectez-vous puis reessayez.";
    case "review_not_eligible":
      return "Vous ne pouvez laisser un avis qu'apres une reservation honoree ou une commande terminee.";
    case "review_already_submitted":
      return "Vous avez deja laisse un avis pour ce restaurant.";
    case "rating_out_of_range":
      return "Les notes doivent etre comprises entre 1 et 10.";
    default:
      return message;
  }
}

export default function ReviewForm({ restaurantId, onSuccess }: ReviewFormProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [serviceRating, setServiceRating] = useState(8);
  const [qualityRating, setQualityRating] = useState(8);
  const [speedRating, setSpeedRating] = useState(8);
  const [comment, setComment] = useState("");
  const [loading, setLoading] = useState(false);
  const overallRating = Math.round((serviceRating + qualityRating + speedRating) / 3);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!user) return;

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
    toast({ title: "Avis publie !" });
    setServiceRating(8);
    setQualityRating(8);
    setSpeedRating(8);
    setComment("");
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
      <p className="text-xs text-muted-foreground">
        Les avis sont reserves aux visites effectivement honorees et verifiees cote serveur.
      </p>
      <div className="flex items-center justify-between rounded-lg border bg-primary/5 px-3 py-2">
        <span className="text-sm font-medium">Note globale</span>
        <span className="text-lg font-bold text-primary">{overallRating}/10</span>
      </div>
      <Textarea value={comment} onChange={(event) => setComment(event.target.value)} placeholder="Votre commentaire..." />
      <Button type="submit" size="sm" disabled={loading}>
        {loading ? "Envoi..." : "Publier"}
      </Button>
    </form>
  );
}
