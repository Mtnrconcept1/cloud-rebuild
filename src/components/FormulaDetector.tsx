import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { CartItem } from "@/lib/cart";
import { Badge } from "@/components/ui/badge";
import { Percent, Sparkles } from "lucide-react";

interface FormulaDetectorProps { items: CartItem[]; restaurantId: string | null; onDiscountCalculated: (discount: number, formulaName: string | null) => void; }

interface FormulaWithCategories { id: string; name: string; discount_percent: number; formula_key?: string | null; meal_formula_categories: { category: string; course_order: number }[]; }
type FormulaCourse = "entree" | "plat" | "dessert";

function normalizeText(value: string): string { return value.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ").trim(); }
function toCourse(raw: string | null | undefined): FormulaCourse | null {
  const text = normalizeText(String(raw || ""));
  if (!text) return null;
  if (text.includes("entree") || text.includes("starter") || text.includes("appet")) return "entree";
  if (text.includes("plat") || text.includes("main")) return "plat";
  if (text.includes("dessert") || text.includes("sweet")) return "dessert";
  return null;
}
function coursesFromFormulaKey(formulaKey: string | null | undefined): FormulaCourse[] {
  if (formulaKey === "entree_plat") return ["entree", "plat"];
  if (formulaKey === "plat_dessert") return ["plat", "dessert"];
  if (formulaKey === "entree_plat_dessert") return ["entree", "plat", "dessert"];
  return [];
}

export default function FormulaDetector({ items, restaurantId, onDiscountCalculated }: FormulaDetectorProps) {
  const { data: formulas } = useQuery({
    queryKey: ["formulas", restaurantId],
    queryFn: async () => {
      const { data, error } = await supabase.from("meal_formulas").select("id, name, discount_percent, formula_key, applies_to, meal_formula_categories(category, course_order)").eq("restaurant_id", restaurantId!).eq("is_active", true);
      if (error) throw error;
      // Filter formulas that apply to delivery/takeaway (not dine_in only)
      return ((data || []) as (FormulaWithCategories & { applies_to: string })[]).filter(f => f.applies_to !== "dine_in");
    },
    enabled: !!restaurantId,
  });

  const { data: menuItems } = useQuery({
    queryKey: ["menu-items-cats", restaurantId],
    queryFn: async () => { const { data } = await supabase.from("menu_items").select("id, category").eq("restaurant_id", restaurantId!); return data || []; },
    enabled: !!restaurantId,
  });

  const itemCourses = new Set<FormulaCourse>();
  items.forEach((item) => { const menuItem = menuItems?.find((m) => m.id === item.menuItemId); const course = toCourse(menuItem?.category); if (course) itemCourses.add(course); });

  let bestFormula: { name: string; discount: number } | null = null;
  if (formulas && formulas.length > 0) {
    for (const formula of formulas) {
      const keyCourses = coursesFromFormulaKey(formula.formula_key);
      const requiredCourses = keyCourses.length > 0 ? keyCourses : formula.meal_formula_categories.map((c) => toCourse(c.category)).filter((course): course is FormulaCourse => !!course);
      if (requiredCourses.length === 0) continue;
      const allMatched = requiredCourses.every((course) => itemCourses.has(course));
      if (allMatched) { if (!bestFormula || formula.discount_percent > bestFormula.discount) bestFormula = { name: formula.name, discount: formula.discount_percent }; }
    }
  }

  const subtotal = items.reduce((sum, i) => sum + i.price * i.quantity, 0);
  const discountAmount = bestFormula ? (subtotal * bestFormula.discount) / 100 : 0;
  const currentDiscount = bestFormula ? discountAmount : 0;
  const currentName = bestFormula?.name || null;

  useEffect(() => { if (typeof onDiscountCalculated === "function") onDiscountCalculated(currentDiscount, currentName); }, [currentDiscount, currentName, onDiscountCalculated]);

  if (!bestFormula) return null;
  return (
    <div className="flex items-center gap-2 p-3 rounded-xl bg-accent/10 border border-accent/20">
      <Sparkles className="h-5 w-5 text-accent shrink-0" />
      <div className="flex-1"><p className="text-sm font-semibold text-accent">Formule détectée : {bestFormula.name}</p><p className="text-xs text-muted-foreground">-{bestFormula.discount}% appliqué sur votre panier</p></div>
      <Badge className="bg-accent text-accent-foreground"><Percent className="h-3 w-3 mr-1" />-{discountAmount.toFixed(2)} CHF</Badge>
    </div>
  );
}
