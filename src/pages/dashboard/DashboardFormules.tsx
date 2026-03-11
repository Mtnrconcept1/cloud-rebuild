import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import DashboardLayout from "@/components/DashboardLayout";
import { useDashboardRestaurant } from "./DashboardContext";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Percent, UtensilsCrossed, CakeSlice, Salad, Loader2 } from "lucide-react";

const DAYS_OF_WEEK = [
  { value: "mon", label: "Lun" },
  { value: "tue", label: "Mar" },
  { value: "wed", label: "Mer" },
  { value: "thu", label: "Jeu" },
  { value: "fri", label: "Ven" },
  { value: "sat", label: "Sam" },
  { value: "sun", label: "Dim" },
];

type PresetFormula = {
  formula_key: string;
  name: string;
  description: string;
  categories: string[];
  defaultDiscount: number;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
};

const PRESET_FORMULAS: PresetFormula[] = [
  {
    formula_key: "entree_plat",
    name: "Entrée + Plat",
    description: "Offrez une réduction lorsque le client prend une entrée et un plat.",
    categories: ["Entrées", "Plats"],
    defaultDiscount: 15,
    icon: Salad,
    color: "from-emerald-500 to-green-600",
  },
  {
    formula_key: "plat_dessert",
    name: "Plat + Dessert",
    description: "Encouragez les clients à prendre un dessert avec leur plat.",
    categories: ["Plats", "Desserts"],
    defaultDiscount: 15,
    icon: CakeSlice,
    color: "from-orange-500 to-amber-600",
  },
  {
    formula_key: "entree_plat_dessert",
    name: "Entrée + Plat + Dessert",
    description: "Le menu complet : la meilleure offre pour vos clients.",
    categories: ["Entrées", "Plats", "Desserts"],
    defaultDiscount: 20,
    icon: UtensilsCrossed,
    color: "from-violet-500 to-indigo-600",
  },
];

type Availability = { days: string[]; startTime: string; endTime: string };

const DEFAULT_AVAILABILITY: Availability = {
  days: ["mon", "tue", "wed", "thu", "fri", "sat", "sun"],
  startTime: "11:30",
  endTime: "14:30",
};

export default function DashboardFormules() {
  const { selectedId } = useDashboardRestaurant();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const restaurantId = selectedId;

  const { data: formulas, isLoading } = useQuery({
    queryKey: ["dashboard-formulas", restaurantId],
    queryFn: async () => {
      if (!restaurantId) return [];
      const { data } = await supabase
        .from("meal_formulas")
        .select("*, meal_formula_categories(*)")
        .eq("restaurant_id", restaurantId)
        .order("created_at", { ascending: true });
      return data || [];
    },
    enabled: !!restaurantId,
  });

  // Build a map of formula_key -> existing DB record
  const formulaMap = new Map<string, any>();
  formulas?.forEach((f: any) => {
    if (f.formula_key) formulaMap.set(f.formula_key, f);
  });

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <Percent className="h-6 w-6 text-primary" />
          <div>
            <h1 className="font-display text-3xl font-bold">Formules & Menus</h1>
            <p className="text-sm text-muted-foreground mt-1">Activez et configurez vos formules promotionnelles</p>
          </div>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : (
          <div className="space-y-4">
            {PRESET_FORMULAS.map((preset) => (
              <PresetFormulaCard
                key={preset.formula_key}
                preset={preset}
                existing={formulaMap.get(preset.formula_key) || null}
                restaurantId={restaurantId!}
                onSaved={() => {
                  queryClient.invalidateQueries({ queryKey: ["dashboard-formulas"] });
                }}
              />
            ))}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}

function PresetFormulaCard({
  preset,
  existing,
  restaurantId,
  onSaved,
}: {
  preset: PresetFormula;
  existing: any | null;
  restaurantId: string;
  onSaved: () => void;
}) {
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);
  const [isActive, setIsActive] = useState(existing?.is_active ?? false);
  const [discount, setDiscount] = useState<string>(
    (existing?.discount_percent ?? preset.defaultDiscount).toString()
  );
  const [availability, setAvailability] = useState<Availability>(
    existing?.availability && existing.availability.days?.length > 0
      ? existing.availability
      : DEFAULT_AVAILABILITY
  );

  // Sync with DB data when it changes
  useEffect(() => {
    setIsActive(existing?.is_active ?? false);
    setDiscount((existing?.discount_percent ?? preset.defaultDiscount).toString());
    if (existing?.availability && existing.availability.days?.length > 0) {
      setAvailability(existing.availability);
    }
  }, [existing, preset.defaultDiscount]);

  const save = async (active: boolean, disc: string, avail: Availability) => {
    setSaving(true);
    const discountVal = Math.min(100, Math.max(1, Number(disc) || preset.defaultDiscount));

    if (existing) {
      // Update existing
      await supabase.from("meal_formulas").update({
        is_active: active,
        discount_percent: discountVal,
        availability: avail,
      }).eq("id", existing.id);
    } else {
      // Create the formula for the first time
      const { data } = await supabase.from("meal_formulas").insert({
        restaurant_id: restaurantId,
        name: preset.name,
        description: preset.description,
        formula_key: preset.formula_key,
        discount_percent: discountVal,
        applies_to: "both",
        is_active: active,
        is_standard: true,
        availability: avail,
      }).select("id").single();

      // Insert categories
      if (data?.id) {
        const cats = preset.categories.map((c, i) => ({
          formula_id: data.id,
          category: c,
          course_order: i + 1,
        }));
        await supabase.from("meal_formula_categories").insert(cats);
      }
    }

    setSaving(false);
    onSaved();
    toast({ title: active ? "Formule activée" : "Formule désactivée" });
  };

  const handleToggle = async (checked: boolean) => {
    setIsActive(checked);
    await save(checked, discount, availability);
  };

  const handleDiscountBlur = async () => {
    if (!existing && !isActive) return; // Don't create if not active yet
    const currentVal = existing?.discount_percent?.toString() ?? preset.defaultDiscount.toString();
    if (discount !== currentVal) {
      await save(isActive, discount, availability);
    }
  };

  const handleDayToggle = async (day: string) => {
    const newDays = availability.days.includes(day)
      ? availability.days.filter((d) => d !== day)
      : [...availability.days, day];
    const newAvail = { ...availability, days: newDays };
    setAvailability(newAvail);
    if (existing || isActive) {
      await save(isActive, discount, newAvail);
    }
  };

  const handleTimeChange = async (field: "startTime" | "endTime", value: string) => {
    const newAvail = { ...availability, [field]: value };
    setAvailability(newAvail);
    // Save on blur instead to avoid excessive updates
  };

  const handleTimeBlur = async () => {
    if (!existing && !isActive) return;
    await save(isActive, discount, availability);
  };

  const Icon = preset.icon;

  return (
    <Card className={cn("transition-all", isActive ? "border-primary/30 shadow-sm" : "opacity-75")}>
      <CardContent className="p-5 space-y-4">
        {/* Header row */}
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className={cn("h-10 w-10 rounded-xl bg-gradient-to-br flex items-center justify-center shrink-0", preset.color)}>
              <Icon className="h-5 w-5 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-semibold">{preset.name}</h3>
                {isActive && <Badge className="bg-green-100 text-green-700 text-[10px]">Active</Badge>}
                {saving && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">{preset.description}</p>
              <div className="flex items-center gap-1.5 mt-1">
                {preset.categories.map((cat, i) => (
                  <span key={cat}>
                    {i > 0 && <span className="text-muted-foreground mx-0.5">+</span>}
                    <Badge variant="outline" className="text-[10px] font-normal">{cat}</Badge>
                  </span>
                ))}
              </div>
            </div>
          </div>
          <Switch checked={isActive} onCheckedChange={handleToggle} disabled={saving} />
        </div>

        {/* Settings row - only shown when active or when existing */}
        {(isActive || existing) && (
          <div className="border-t pt-4 space-y-4">
            {/* Discount */}
            <div className="flex items-center gap-4">
              <div className="space-y-1 w-32">
                <Label className="text-xs font-medium">Réduction</Label>
                <div className="relative">
                  <Input
                    type="number"
                    min={1}
                    max={100}
                    value={discount}
                    onChange={(e) => setDiscount(e.target.value)}
                    onBlur={handleDiscountBlur}
                    className="pr-8"
                    disabled={saving}
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">%</span>
                </div>
              </div>
              <div className="flex-1">
                <p className="text-[11px] text-muted-foreground">Le pourcentage de réduction appliqué sur le total de la formule.</p>
              </div>
            </div>

            {/* Days */}
            <div className="space-y-2">
              <Label className="text-xs font-medium">Jours disponibles</Label>
              <div className="flex flex-wrap gap-1.5">
                {DAYS_OF_WEEK.map((day) => (
                  <button
                    key={day.value}
                    type="button"
                    onClick={() => handleDayToggle(day.value)}
                    disabled={saving}
                    className={cn(
                      "w-10 h-9 rounded-lg text-xs font-medium transition-colors border",
                      availability.days.includes(day.value)
                        ? "bg-primary text-primary-foreground border-primary"
                        : "bg-background hover:bg-muted border-border text-muted-foreground"
                    )}
                  >
                    {day.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Time slots */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label className="text-xs font-medium">Heure de début</Label>
                <Input
                  type="time"
                  value={availability.startTime}
                  onChange={(e) => handleTimeChange("startTime", e.target.value)}
                  onBlur={handleTimeBlur}
                  disabled={saving}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs font-medium">Heure de fin</Label>
                <Input
                  type="time"
                  value={availability.endTime}
                  onChange={(e) => handleTimeChange("endTime", e.target.value)}
                  onBlur={handleTimeBlur}
                  disabled={saving}
                />
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
