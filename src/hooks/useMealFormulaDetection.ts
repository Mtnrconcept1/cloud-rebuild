import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { getSupabase } from "@/integrations/supabase/client";
import {
  detectBestMealFormula,
  roundCurrency,
  type MealFormulaContext,
  type MealFormulaDetectionItem,
  type MealFormulaDetectionResult,
  type MealFormulaRow,
} from "@/lib/meal-formulas";

const supabase = getSupabase();

type UseMealFormulaDetectionOptions = {
  restaurantId: string | null;
  items: MealFormulaDetectionItem[];
  subtotal?: number;
  reservationDate?: string;
  reservationTime?: string;
  context?: MealFormulaContext;
  enabled?: boolean;
};

const EMPTY_RESULT: MealFormulaDetectionResult = {
  matchedFormula: null,
  suggestion: null,
  discountAmount: 0,
  finalTotal: 0,
  itemCourses: [],
};

export function useMealFormulaDetection({
  restaurantId,
  items,
  subtotal,
  reservationDate,
  reservationTime,
  context = "cart",
  enabled = true,
}: UseMealFormulaDetectionOptions) {
  const hasItems = items.some((item) => item.quantity > 0);
  const effectiveSubtotal = useMemo(() => {
    if (typeof subtotal === "number") return roundCurrency(Math.max(0, subtotal));
    return roundCurrency(
      items.reduce((sum, item) => sum + (Number(item.unitPrice) || 0) * (Number(item.quantity) || 0), 0)
    );
  }, [items, subtotal]);

  const { data: formulas = [], isLoading, isFetching } = useQuery({
    queryKey: ["meal-formulas-detection", restaurantId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("meal_formulas")
        .select("id, name, discount_percent, formula_key, applies_to, availability, meal_formula_categories(category, course_order)")
        .eq("restaurant_id", restaurantId!)
        .eq("is_active", true);
      if (error) throw error;
      return (data || []) as MealFormulaRow[];
    },
    enabled: !!restaurantId && enabled,
  });

  const result = useMemo(() => {
    if (!restaurantId || !enabled) {
      return { ...EMPTY_RESULT, finalTotal: effectiveSubtotal };
    }
    if (!hasItems) {
      return { ...EMPTY_RESULT, finalTotal: effectiveSubtotal };
    }
    return detectBestMealFormula({
      formulas,
      items,
      subtotal: effectiveSubtotal,
      context,
      reservationDate,
      reservationTime,
    });
  }, [
    restaurantId,
    enabled,
    hasItems,
    formulas,
    items,
    effectiveSubtotal,
    context,
    reservationDate,
    reservationTime,
  ]);

  return {
    ...result,
    formulas,
    isLoading,
    isFetching,
  };
}
