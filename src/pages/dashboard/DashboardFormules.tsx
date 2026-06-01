import { useEffect, useMemo, useState, type ComponentType } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Percent, UtensilsCrossed, CakeSlice, Salad, Loader2 } from "lucide-react";

import DashboardLayout from "@/components/DashboardLayout";
import DashboardPageHero from "@/components/dashboard/DashboardPageHero";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { getSupabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { DEFAULT_SERVICE_SETTINGS, getServicePeriodLabel, type ServicePeriod } from "@/lib/serviceSettings";
import { useDashboardRestaurant } from "./useDashboardRestaurant";

const supabase = getSupabase();

const DAYS_OF_WEEK = [
  { value: "mon", label: "Lun" },
  { value: "tue", label: "Mar" },
  { value: "wed", label: "Mer" },
  { value: "thu", label: "Jeu" },
  { value: "fri", label: "Ven" },
  { value: "sat", label: "Sam" },
  { value: "sun", label: "Dim" },
] as const;

const SERVICE_PERIODS: Array<{ key: ServicePeriod; note: string }> = [
  { key: "lunch", note: "Formule visible sur le service du midi." },
  { key: "dinner", note: "Formule visible sur le service du soir." },
];

type PresetFormula = {
  formula_key: string;
  name: string;
  description: string;
  categories: string[];
  defaultDiscount: number;
  icon: ComponentType<{ className?: string }>;
  color: string;
};

const PRESET_FORMULAS: PresetFormula[] = [
  {
    formula_key: "entree_plat",
    name: "Entree + Plat",
    description: "Offrez une réduction lorsque le client prend une entrée et un plat.",
    categories: ["Entrees", "Plats"],
    defaultDiscount: 15,
    icon: Salad,
    color: "from-emerald-500 to-green-600",
  },
  {
    formula_key: "plat_dessert",
    name: "Plat + Dessert",
    description: "Encouragez les clients a prendre un dessert avec leur plat.",
    categories: ["Plats", "Desserts"],
    defaultDiscount: 15,
    icon: CakeSlice,
    color: "from-orange-500 to-amber-600",
  },
  {
    formula_key: "entree_plat_dessert",
    name: "Entree + Plat + Dessert",
    description: "Le menu complet avec la meilleure remise.",
    categories: ["Entrees", "Plats", "Desserts"],
    defaultDiscount: 20,
    icon: UtensilsCrossed,
    color: "from-violet-500 to-indigo-600",
  },
];

type ServiceAvailability = {
  enabled: boolean;
  startTime: string;
  endTime: string;
};

type Availability = {
  days: string[];
  servicePeriods: ServicePeriod[];
  services: Record<ServicePeriod, ServiceAvailability>;
};

const DEFAULT_AVAILABILITY: Availability = {
  days: DAYS_OF_WEEK.map((day) => day.value),
  servicePeriods: ["lunch", "dinner"],
  services: {
    lunch: {
      enabled: true,
      startTime: DEFAULT_SERVICE_SETTINGS.lunch.start_time,
      endTime: DEFAULT_SERVICE_SETTINGS.lunch.end_time,
    },
    dinner: {
      enabled: true,
      startTime: DEFAULT_SERVICE_SETTINGS.dinner.start_time,
      endTime: DEFAULT_SERVICE_SETTINGS.dinner.end_time,
    },
  },
};

function normalizeAvailability(raw: any): Availability {
  if (!raw || typeof raw !== "object") {
    return DEFAULT_AVAILABILITY;
  }

  const days = Array.isArray(raw.days) && raw.days.length > 0
    ? raw.days.filter((day: unknown): day is string => typeof day === "string")
    : DEFAULT_AVAILABILITY.days;

  const normalized: Availability = {
    days,
    servicePeriods: [],
    services: {
      lunch: { ...DEFAULT_AVAILABILITY.services.lunch },
      dinner: { ...DEFAULT_AVAILABILITY.services.dinner },
    },
  };

  const servicePeriods = Array.isArray(raw.servicePeriods)
    ? raw.servicePeriods.filter((period: unknown): period is ServicePeriod => period === "lunch" || period === "dinner")
    : [];

  if (raw.services && typeof raw.services === "object") {
    SERVICE_PERIODS.forEach(({ key }) => {
      const service = raw.services[key];
      if (!service || typeof service !== "object") return;
      normalized.services[key] = {
        enabled: typeof service.enabled === "boolean" ? service.enabled : DEFAULT_AVAILABILITY.services[key].enabled,
        startTime: typeof service.startTime === "string" ? service.startTime : DEFAULT_AVAILABILITY.services[key].startTime,
        endTime: typeof service.endTime === "string" ? service.endTime : DEFAULT_AVAILABILITY.services[key].endTime,
      };
    });
  } else {
    const fallbackStart = typeof raw.startTime === "string" ? raw.startTime : DEFAULT_AVAILABILITY.services.lunch.startTime;
    const fallbackEnd = typeof raw.endTime === "string" ? raw.endTime : DEFAULT_AVAILABILITY.services.lunch.endTime;
    normalized.services.lunch = {
      enabled: true,
      startTime: fallbackStart,
      endTime: fallbackEnd,
    };
    normalized.services.dinner = {
      enabled: false,
      startTime: DEFAULT_AVAILABILITY.services.dinner.startTime,
      endTime: DEFAULT_AVAILABILITY.services.dinner.endTime,
    };
  }

  normalized.servicePeriods = SERVICE_PERIODS
    .map(({ key }) => key)
    .filter((key) => normalized.services[key].enabled);

  if (servicePeriods.length > 0) {
    normalized.servicePeriods = servicePeriods;
    SERVICE_PERIODS.forEach(({ key }) => {
      normalized.services[key].enabled = servicePeriods.includes(key);
    });
  }

  if (normalized.servicePeriods.length === 0) {
    normalized.servicePeriods = ["lunch", "dinner"];
    normalized.services.lunch.enabled = true;
    normalized.services.dinner.enabled = true;
  }

  return normalized;
}

function serializeAvailability(availability: Availability) {
  const servicePeriods = SERVICE_PERIODS
    .map(({ key }) => key)
    .filter((key) => availability.services[key].enabled);

  return {
    days: availability.days,
    servicePeriods,
    services: {
      lunch: availability.services.lunch,
      dinner: availability.services.dinner,
    },
  };
}

export default function DashboardFormules() {
  const { selectedId } = useDashboardRestaurant();
  const queryClient = useQueryClient();

  const { data: formulas, isLoading } = useQuery({
    queryKey: ["dashboard-formulas", selectedId],
    queryFn: async () => {
      if (!selectedId) return [];
      const { data, error } = await supabase
        .from("meal_formulas")
        .select("*, meal_formula_categories(*)")
        .eq("restaurant_id", selectedId)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data || [];
    },
    enabled: !!selectedId,
  });

  const formulaMap = useMemo(() => {
    const map = new Map<string, any>();
    (formulas || []).forEach((formula: any) => {
      if (formula?.formula_key) map.set(formula.formula_key, formula);
    });
    return map;
  }, [formulas]);

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <DashboardPageHero
          badge="Offre menu"
          title="Formules & Menus"
          description="Activez vos formules et choisissez precisement les services midi et soir pour guider les paniers sans complexifier la carte."
          icon={Percent}
          tone="orange"
          visualLabel="Formules"
          stats={[
            { label: "Modeles", value: PRESET_FORMULAS.length, icon: UtensilsCrossed },
            { label: "Configurees", value: formulas?.length || 0, icon: Percent },
            { label: "Restaurant", value: selectedId ? "Selectionne" : "Aucun", icon: Salad },
          ]}
        />

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
                restaurantId={selectedId!}
                onSaved={() => {
                  queryClient.invalidateQueries({ queryKey: ["dashboard-formulas", selectedId] });
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
  const [discount, setDiscount] = useState((existing?.discount_percent ?? preset.defaultDiscount).toString());
  const [availability, setAvailability] = useState<Availability>(normalizeAvailability(existing?.availability));

  useEffect(() => {
    setIsActive(existing?.is_active ?? false);
    setDiscount((existing?.discount_percent ?? preset.defaultDiscount).toString());
    setAvailability(normalizeAvailability(existing?.availability));
  }, [existing, preset.defaultDiscount]);

  const save = async (active: boolean, discountValue: string, availabilityValue: Availability) => {
    const enabledServices = SERVICE_PERIODS.filter(({ key }) => availabilityValue.services[key].enabled);
    if (active && enabledServices.length === 0) {
      toast({
        title: "Service requis",
        description: "Active au moins un service pour rendre la formule disponible.",
        variant: "destructive",
      });
      return;
    }

    setSaving(true);
    try {
      const discountPercent = Math.min(100, Math.max(1, Number(discountValue) || preset.defaultDiscount));
      const payload = {
        is_active: active,
        discount_percent: discountPercent,
        availability: serializeAvailability(availabilityValue),
      };

      if (existing) {
        const { error } = await supabase.from("meal_formulas").update(payload).eq("id", existing.id);
        if (error) throw error;
      } else {
        const { data, error } = await supabase
          .from("meal_formulas")
          .insert({
            restaurant_id: restaurantId,
            name: preset.name,
            description: preset.description,
            formula_key: preset.formula_key,
            discount_percent: discountPercent,
            applies_to: "both",
            is_active: active,
            is_standard: true,
            availability: serializeAvailability(availabilityValue),
          })
          .select("id")
          .single();
        if (error) throw error;

        if (data?.id) {
          const categories = preset.categories.map((category, index) => ({
            formula_id: data.id,
            category,
            course_order: index + 1,
          }));
          const { error: categoryError } = await supabase.from("meal_formula_categories").insert(categories);
          if (categoryError) throw categoryError;
        }
      }

      onSaved();
      toast({ title: active ? "Formule activée" : "Formule desactivee" });
    } catch (error: any) {
      toast({
        title: "Enregistrement impossible",
        description: error?.message || "La formule n'a pas pu être enregistrée.",
        variant: "destructive",
      });
      setIsActive(existing?.is_active ?? false);
      setDiscount((existing?.discount_percent ?? preset.defaultDiscount).toString());
      setAvailability(normalizeAvailability(existing?.availability));
    } finally {
      setSaving(false);
    }
  };

  const handleToggle = async (checked: boolean) => {
    setIsActive(checked);
    await save(checked, discount, availability);
  };

  const handleDiscountBlur = async () => {
    if (!existing && !isActive) return;
    await save(isActive, discount, availability);
  };

  const handleDayToggle = async (day: string) => {
    const nextAvailability = {
      ...availability,
      days: availability.days.includes(day)
        ? availability.days.filter((value) => value !== day)
        : [...availability.days, day],
    };
    setAvailability(nextAvailability);
    if (existing || isActive) {
      await save(isActive, discount, nextAvailability);
    }
  };

  const updateService = (period: ServicePeriod, patch: Partial<ServiceAvailability>) => {
    setAvailability((current) => {
      const nextServices = {
        ...current.services,
        [period]: {
          ...current.services[period],
          ...patch,
        },
      };
      const nextPeriods = SERVICE_PERIODS.map(({ key }) => key).filter((key) => nextServices[key].enabled);
      return {
        ...current,
        services: nextServices,
        servicePeriods: nextPeriods,
      };
    });
  };

  const handleServiceToggle = async (period: ServicePeriod, checked: boolean) => {
    const nextAvailability = {
      ...availability,
      services: {
        ...availability.services,
        [period]: {
          ...availability.services[period],
          enabled: checked,
        },
      },
      servicePeriods: SERVICE_PERIODS
        .map(({ key }) => key)
        .filter((key) => (key === period ? checked : availability.services[key].enabled)),
    };
    setAvailability(nextAvailability);
    if (existing || isActive) {
      await save(isActive, discount, nextAvailability);
    }
  };

  const handleServiceTimeBlur = async () => {
    if (!existing && !isActive) return;
    await save(isActive, discount, availability);
  };

  const Icon = preset.icon;

  return (
    <Card className={cn("transition-all", isActive ? "border-primary/30 shadow-sm" : "opacity-75")}>
      <CardContent className="space-y-4 p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br", preset.color)}>
              <Icon className="h-5 w-5 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-semibold">{preset.name}</h3>
                {isActive && <Badge className="bg-green-100 text-[10px] text-green-700">Active</Badge>}
                {saving && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
              </div>
              <p className="mt-0.5 text-xs text-muted-foreground">{preset.description}</p>
              <div className="mt-1 flex items-center gap-1.5">
                {preset.categories.map((category, index) => (
                  <span key={category}>
                    {index > 0 && <span className="mx-0.5 text-muted-foreground">+</span>}
                    <Badge variant="outline" className="text-[10px] font-normal">{category}</Badge>
                  </span>
                ))}
              </div>
            </div>
          </div>
          <Switch checked={isActive} onCheckedChange={handleToggle} disabled={saving} />
        </div>

        {(isActive || existing) && (
          <div className="space-y-4 border-t pt-4">
            <div className="flex items-center gap-4">
              <div className="w-32 space-y-1">
                <Label className="text-xs font-medium">Reduction</Label>
                <div className="relative">
                  <Input
                    type="number"
                    min={1}
                    max={100}
                    value={discount}
                    onChange={(event) => setDiscount(event.target.value)}
                    onBlur={handleDiscountBlur}
                    className="pr-8"
                    disabled={saving}
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">%</span>
                </div>
              </div>
              <div className="flex-1">
                <p className="text-[11px] text-muted-foreground">
                  Le pourcentage de réduction applique sur le total de la formule.
                </p>
              </div>
            </div>

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
                      "h-9 w-10 rounded-lg border text-xs font-medium transition-colors",
                      availability.days.includes(day.value)
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border bg-background text-muted-foreground hover:bg-muted"
                    )}
                  >
                    {day.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-3">
              <div>
                <Label className="text-xs font-medium">Services disponibles</Label>
                <p className="text-[11px] text-muted-foreground">
                  Active chaque formule sur le midi, le soir, ou les deux avec une plage horaire dediee.
                </p>
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                {SERVICE_PERIODS.map((period) => {
                  const settings = availability.services[period.key];
                  return (
                    <div key={period.key} className="rounded-xl border bg-muted/20 p-3 space-y-3">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold">{getServicePeriodLabel(period.key)}</p>
                          <p className="text-[11px] text-muted-foreground">{period.note}</p>
                        </div>
                        <Switch
                          checked={settings.enabled}
                          onCheckedChange={(checked) => handleServiceToggle(period.key, checked)}
                          disabled={saving}
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1">
                          <Label className="text-xs font-medium">Debut</Label>
                          <Input
                            type="time"
                            value={settings.startTime}
                            onChange={(event) => updateService(period.key, { startTime: event.target.value })}
                            onBlur={handleServiceTimeBlur}
                            disabled={saving || !settings.enabled}
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs font-medium">Fin</Label>
                          <Input
                            type="time"
                            value={settings.endTime}
                            onChange={(event) => updateService(period.key, { endTime: event.target.value })}
                            onBlur={handleServiceTimeBlur}
                            disabled={saving || !settings.enabled}
                          />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
