import { useState, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import DashboardLayout from "@/components/DashboardLayout";
import { useOwnerRestaurants } from "./useOwnerRestaurants";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Percent, UtensilsCrossed, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

const PRESET_FORMULAS = [
  {
    key: "entree_plat",
    name: "Entrée + Plat",
    categories: ["Entrées", "Plats"],
    icon: "🥗🍽️",
  },
  {
    key: "plat_dessert",
    name: "Plat + Dessert",
    categories: ["Plats", "Desserts"],
    icon: "🍽️🍰",
  },
  {
    key: "entree_plat_dessert",
    name: "Entrée + Plat + Dessert",
    categories: ["Entrées", "Plats", "Desserts"],
    icon: "🥗🍽️🍰",
  },
];

const TIME_SLOTS = [
  { value: "lunch", label: "Midi (11h–15h)" },
  { value: "dinner", label: "Soir (18h–23h)" },
  { value: "both", label: "Midi & Soir" },
];

const APPLIES_TO = [
  { value: "dine_in", label: "Sur place" },
  { value: "takeaway", label: "À emporter" },
  { value: "delivery_takeaway", label: "Livraison & emporter" },
  { value: "both", label: "Tous les modes" },
];

type FormulaState = {
  id?: string;
  is_active: boolean;
  discount_percent: number;
  time_slot: string;
  applies_to: string;
};

export default function DashboardFormules() {
  const { restaurantIds } = useOwnerRestaurants();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);

  const restaurantId = restaurantIds[0];

  const { data: existingFormulas, isLoading } = useQuery({
    queryKey: ["dashboard-formulas", restaurantId],
    queryFn: async () => {
      const { data } = await supabase
        .from("meal_formulas")
        .select("*, meal_formula_categories(*)")
        .eq("restaurant_id", restaurantId!)
        .in("formula_key", PRESET_FORMULAS.map((p) => p.key));
      return data || [];
    },
    enabled: !!restaurantId,
  });

  const [formStates, setFormStates] = useState<Record<string, FormulaState>>({});

  // Initialize state from DB
  useEffect(() => {
    const states: Record<string, FormulaState> = {};
    for (const preset of PRESET_FORMULAS) {
      const existing = existingFormulas?.find((f: any) => f.formula_key === preset.key);
      states[preset.key] = {
        id: existing?.id,
        is_active: existing?.is_active ?? false,
        discount_percent: existing?.discount_percent ?? 10,
        time_slot: (existing?.metadata as any)?.time_slot || existing?.applies_to === "dine_in" ? "lunch" : "both",
        applies_to: existing?.applies_to ?? "both",
      };
    }
    setFormStates(states);
  }, [existingFormulas]);

  const updateField = (key: string, field: keyof FormulaState, value: any) => {
    setFormStates((prev) => ({
      ...prev,
      [key]: { ...prev[key], [field]: value },
    }));
  };

  const handleSave = async () => {
    if (!restaurantId) return;
    setSaving(true);

    try {
      for (const preset of PRESET_FORMULAS) {
        const state = formStates[preset.key];
        if (!state) continue;

        const payload = {
          restaurant_id: restaurantId,
          name: preset.name,
          formula_key: preset.key,
          discount_percent: state.discount_percent,
          is_active: state.is_active,
          applies_to: state.applies_to,
          description: `Formule ${preset.name} – ${TIME_SLOTS.find((t) => t.value === state.time_slot)?.label || ""}`,
        };

        if (state.id) {
          await supabase.from("meal_formulas").update(payload).eq("id", state.id);
        } else {
          const { data } = await supabase
            .from("meal_formulas")
            .insert(payload)
            .select("id")
            .single();

          if (data?.id) {
            // Insert categories
            const cats = preset.categories.map((c, i) => ({
              formula_id: data.id,
              category: c,
              course_order: i + 1,
            }));
            await supabase.from("meal_formula_categories").insert(cats);
          }
        }
      }

      queryClient.invalidateQueries({ queryKey: ["dashboard-formulas"] });
      toast({ title: "Formules enregistrées ✓" });
    } catch (err) {
      toast({ title: "Erreur", description: "Impossible d'enregistrer", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  if (isLoading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <UtensilsCrossed className="h-6 w-6 text-primary" />
            <div>
              <h1 className="font-display text-3xl font-bold">Formules & Menus</h1>
              <p className="text-sm text-muted-foreground mt-1">
                Activez les formules, définissez le rabais et le créneau horaire
              </p>
            </div>
          </div>
          <Button onClick={handleSave} disabled={saving} className="gap-2">
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            Enregistrer
          </Button>
        </div>

        <div className="grid gap-4">
          {PRESET_FORMULAS.map((preset) => {
            const state = formStates[preset.key];
            if (!state) return null;

            return (
              <Card
                key={preset.key}
                className={`transition-all duration-200 ${
                  state.is_active
                    ? "border-primary/40 bg-primary/[0.03] shadow-sm"
                    : "opacity-70"
                }`}
              >
                <CardContent className="py-5">
                  <div className="flex flex-col md:flex-row md:items-center gap-5">
                    {/* Left: Toggle + Name */}
                    <div className="flex items-center gap-4 min-w-[220px]">
                      <Switch
                        checked={state.is_active}
                        onCheckedChange={(v) => updateField(preset.key, "is_active", v)}
                      />
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-lg">{preset.icon}</span>
                          <p className="font-semibold">{preset.name}</p>
                        </div>
                        <div className="flex gap-1 mt-1">
                          {preset.categories.map((c) => (
                            <Badge key={c} variant="outline" className="text-[10px] font-normal">
                              {c}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    </div>

                    {/* Middle: Discount */}
                    <div className="flex items-center gap-2">
                      <Label className="text-xs text-muted-foreground whitespace-nowrap">Rabais</Label>
                      <div className="relative w-24">
                        <Input
                          type="number"
                          min={1}
                          max={50}
                          value={state.discount_percent}
                          onChange={(e) =>
                            updateField(preset.key, "discount_percent", Number(e.target.value))
                          }
                          className="pr-8 text-center font-semibold"
                          disabled={!state.is_active}
                        />
                        <Percent className="absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                      </div>
                    </div>

                    {/* Right: Time slot + applies_to */}
                    <div className="flex items-center gap-3 flex-wrap">
                      <div className="space-y-1">
                        <Label className="text-xs text-muted-foreground">Créneau</Label>
                        <Select
                          value={state.time_slot}
                          onValueChange={(v) => updateField(preset.key, "time_slot", v)}
                          disabled={!state.is_active}
                        >
                          <SelectTrigger className="w-[150px] h-9 text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {TIME_SLOTS.map((t) => (
                              <SelectItem key={t.value} value={t.value}>
                                {t.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="space-y-1">
                        <Label className="text-xs text-muted-foreground">Mode</Label>
                        <Select
                          value={state.applies_to}
                          onValueChange={(v) => updateField(preset.key, "applies_to", v)}
                          disabled={!state.is_active}
                        >
                          <SelectTrigger className="w-[160px] h-9 text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {APPLIES_TO.map((a) => (
                              <SelectItem key={a.value} value={a.value}>
                                {a.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
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
