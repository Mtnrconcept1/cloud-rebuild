import { useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { getSupabase } from "@/integrations/supabase/client";
import type { CartItem } from "@/lib/cart-context";
import { Badge } from "@/components/ui/badge";
import { Percent, Sparkles } from "lucide-react";
import { useMealFormulaDetection } from "@/hooks/useMealFormulaDetection";

const supabase = getSupabase();

interface FormulaDetectorProps {
  items: CartItem[];
  restaurantId: string | null;
  onDiscountCalculated: (discount: number, formulaName: string | null) => void;
}

export default function FormulaDetector({ items, restaurantId, onDiscountCalculated }: FormulaDetectorProps) {
  const { data: menuItems } = useQuery({
    queryKey: ["menu-items-cats", restaurantId],
    queryFn: async () => {
      const { data } = await supabase.from("menu_items").select("id, category").eq("restaurant_id", restaurantId!);
      return data || [];
    },
    enabled: !!restaurantId,
  });

  const detectionItems = useMemo(
    () =>
      items.map((item) => {
        const menuItem = menuItems?.find((m) => m.id === item.menuItemId);
        return {
          category: menuItem?.category || null,
          quantity: item.quantity,
          unitPrice: Number(item.price || 0),
        };
      }),
    [items, menuItems]
  );

  const subtotal = useMemo(
    () => items.reduce((sum, item) => sum + Number(item.price || 0) * Number(item.quantity || 0), 0),
    [items]
  );

  const { matchedFormula, discountAmount } = useMealFormulaDetection({
    restaurantId,
    items: detectionItems,
    subtotal,
    context: "cart",
    enabled: !!restaurantId && !!menuItems,
  });

  const currentDiscount = matchedFormula ? discountAmount : 0;
  const currentName = matchedFormula?.name || null;

  useEffect(() => {
    if (typeof onDiscountCalculated === "function") onDiscountCalculated(currentDiscount, currentName);
  }, [currentDiscount, currentName, onDiscountCalculated]);

  if (!matchedFormula) return null;

  return (
    <div className="flex items-center gap-2 p-3 rounded-xl bg-accent/10 border border-accent/20">
      <Sparkles className="h-5 w-5 text-accent shrink-0" />
      <div className="flex-1">
        <p className="text-sm font-semibold text-accent">Formule detectee : {matchedFormula.name}</p>
        <p className="text-xs text-muted-foreground">-{matchedFormula.discountPercent}% applique sur votre panier</p>
      </div>
      <Badge className="bg-accent text-accent-foreground">
        <Percent className="h-3 w-3 mr-1" />-{discountAmount.toFixed(2)} CHF
      </Badge>
    </div>
  );
}
