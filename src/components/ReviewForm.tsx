import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Slider } from "@/components/ui/slider";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";

interface ReviewFormProps { restaurantId: string; onSuccess: () => void; }
interface RatingSliderProps { label: string; value: number; onChange: (value: number) => void; }

function RatingSlider({ label, value, onChange }: RatingSliderProps) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between"><span className="text-sm font-medium">{label}</span><span className="text-sm font-bold text-primary">{value}/10</span></div>
      <Slider min={1} max={10} step={1} value={[value]} onValueChange={(values) => onChange(values[0] || 1)} />
    </div>
  );
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setLoading(true);
    const { error } = await supabase.from("reviews").insert({ restaurant_id: restaurantId, user_id: user.id, rating: overallRating, service_rating: serviceRating, quality_rating: qualityRating, speed_rating: speedRating, comment: comment || null });
    setLoading(false);
    if (error) { toast({ title: "Erreur", description: error.message, variant: "destructive" }); return; }
    toast({ title: "Avis publié !" });
    setServiceRating(8); setQualityRating(8); setSpeedRating(8); setComment(""); onSuccess();
  };

  if (!user) return null;
  return (
    <form onSubmit={handleSubmit} className="space-y-3 p-4 border rounded-xl bg-card">
      <h4 className="font-semibold text-sm">Laisser un avis</h4>
      <div className="rounded-lg border p-3 space-y-3 bg-secondary/20">
        <RatingSlider label="Service" value={serviceRating} onChange={setServiceRating} />
        <RatingSlider label="Qualité" value={qualityRating} onChange={setQualityRating} />
        <RatingSlider label="Rapidité" value={speedRating} onChange={setSpeedRating} />
      </div>
      <div className="flex items-center justify-between rounded-lg border px-3 py-2 bg-primary/5"><span className="text-sm font-medium">Note globale</span><span className="font-bold text-primary text-lg">{overallRating}/10</span></div>
      <Textarea value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Votre commentaire..." />
      <Button type="submit" size="sm" disabled={loading}>{loading ? "Envoi..." : "Publier"}</Button>
    </form>
  );
}
