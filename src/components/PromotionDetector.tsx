import { useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { getSupabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { BadgePercent, Sparkles } from "lucide-react";

const supabase = getSupabase();

interface PromotionDetectorProps {
  restaurantId: string | null;
  subtotal: number;
  onDiscountCalculated: (discount: number, promoName: string | null) => void;
}

export default function PromotionDetector({ restaurantId, subtotal, onDiscountCalculated }: PromotionDetectorProps) {
  const lastValues = useRef({ discount: 0, name: null as string | null });

  const { data: promotions } = useQuery({
    queryKey: ["active-promotions", restaurantId],
    queryFn: async () => {
      const now = new Date().toISOString();
      const { data, error } = await supabase
        .from("restaurant_promotions")
        .select("*")
        .eq("restaurant_id", restaurantId!)
        .eq("active", true)
        .lte("start_at", now)
        .gte("end_at", now)
        .order("promotion_value", { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: !!restaurantId,
  });

  // Find best applicable promotion
  let bestPromo: { name: string; discount: number } | null = null;
  if (promotions && promotions.length > 0 && subtotal > 0) {
    for (const promo of promotions) {
      let discount = 0;
      if (promo.promotion_type === "percentage") {
        discount = (subtotal * promo.promotion_value) / 100;
      } else if (promo.promotion_type === "fixed") {
        discount = Math.min(promo.promotion_value, subtotal);
      } else if (promo.promotion_type === "free_delivery") {
        // Handled separately in cart, not as item discount
        continue;
      }
      if (!bestPromo || discount > bestPromo.discount) {
        bestPromo = { name: promo.name, discount };
      }
    }
  }

  const currentDiscount = bestPromo?.discount || 0;
  const currentName = bestPromo?.name || null;

  useEffect(() => {
    if (currentDiscount !== lastValues.current.discount || currentName !== lastValues.current.name) {
      lastValues.current = { discount: currentDiscount, name: currentName };
      onDiscountCalculated(currentDiscount, currentName);
    }
  }, [currentDiscount, currentName, onDiscountCalculated]);

  if (!bestPromo) return null;

  return (
    <div className="flex items-center gap-2 p-3 rounded-xl bg-primary/10 border border-primary/20">
      <BadgePercent className="h-5 w-5 text-primary shrink-0" />
      <div className="flex-1">
        <p className="text-sm font-semibold text-primary">Promotion : {bestPromo.name}</p>
        <p className="text-xs text-muted-foreground">Réduction appliquée sur votre panier</p>
      </div>
      <Badge className="bg-primary text-primary-foreground">
        <Sparkles className="h-3 w-3 mr-1" />-{currentDiscount.toFixed(2)} CHF
      </Badge>
    </div>
  );
}
