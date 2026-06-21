import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  MapPin,
  ShoppingCart,
  Clock,
  Heart,
  Users,
  UtensilsCrossed,
  Route,
  SunMedium,
  UserRound,
} from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import CityMultiSelect from "@/components/CityMultiSelect";
import { Toggle } from "@/components/ui/toggle";
import { Badge } from "@/components/ui/badge";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { getSupabase } from "@/integrations/supabase/client";
import { getAudienceEstimate } from "@/lib/analytics";
import {
  CUSTOMER_SEGMENT_OPTIONS,
  DEFAULT_AUDIENCE_CRITERIA,
  JOURNEY_TYPE_OPTIONS,
  GENDER_TARGET_OPTIONS,
  SERVICE_MOMENT_OPTIONS,
  normalizeAudienceCriteria,
  type AudienceCriteria,
} from "@/lib/campaignTargeting";
import { PREDEFINED_RESTAURANT_CATEGORIES } from "@/lib/restaurantCategories";

const supabase = getSupabase();

interface AudienceTargetingProps {
  criteria: AudienceCriteria;
  onChange: (criteria: AudienceCriteria) => void;
  restaurantId?: string;
}

export default function AudienceTargeting({
  criteria,
  onChange,
  restaurantId,
}: AudienceTargetingProps) {
  const normalizedCriteria = useMemo(
    () => normalizeAudienceCriteria(criteria),
    [criteria],
  );
  const [estimate, setEstimate] = useState<number>(0);
  const [loading, setLoading] = useState(false);

  const { data: cuisineOptions = [] } = useQuery({
    queryKey: ["campaign-targeting-cuisines"],
    queryFn: async () => {
      const fallback = PREDEFINED_RESTAURANT_CATEGORIES.map(
        (category) => category.name,
      );
      const { data, error } = await (supabase.from("cuisines") as any)
        .select("name")
        .order("name");
      if (error) return fallback;
      const names = (data || [])
        .map((row: any) => String(row?.name || "").trim())
        .filter(Boolean);
      return names.length > 0 ? names : fallback;
    },
  });

  useEffect(() => {
    const timer = setTimeout(async () => {
      setLoading(true);
      const estimateValue = await getAudienceEstimate({
        ...normalizedCriteria,
        restaurantId,
      });
      setEstimate(estimateValue);
      setLoading(false);
    }, 400);

    return () => clearTimeout(timer);
  }, [normalizedCriteria, restaurantId]);

  const update = (partial: Partial<AudienceCriteria>) => {
    onChange(
      normalizeAudienceCriteria({
        ...normalizedCriteria,
        ...partial,
        restaurantId,
      }),
    );
  };

  const toggleListValue = (
    key: "cuisines" | "genders" | "journeyTypes" | "serviceMoments",
    value: string,
  ) => {
    const current = normalizedCriteria[key] as string[];
    const normalizedValue = value.trim().toLowerCase();
    const next = current.includes(normalizedValue)
      ? current.filter((entry) => entry !== normalizedValue)
      : [...current, normalizedValue];
    update({ [key]: next } as Partial<AudienceCriteria>);
  };

  return (
    <div className="space-y-4">
      <Card className="bg-primary/5 border-primary/20">
        <CardContent className="py-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-full bg-primary/10">
              <Users className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="text-sm font-medium">Audience estimée</p>
              <p className="text-xs text-muted-foreground">
                Projection des clients correspondant au ciblage
              </p>
            </div>
          </div>
          <div className="text-right">
            <p className="text-2xl font-bold text-primary">
              {loading ? "..." : estimate.toLocaleString("fr-FR")}
            </p>
            <p className="text-xs text-muted-foreground">clients cibles</p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <Users className="h-4 w-4" /> Segment client
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label className="text-xs">Qui voulez-vous toucher ?</Label>
            <Select
              value={normalizedCriteria.customerSegment}
              onValueChange={(value) =>
                update({
                  customerSegment: value as AudienceCriteria["customerSegment"],
                })
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CUSTOMER_SEGMENT_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label className="text-xs flex items-center gap-2">
              <UserRound className="h-3.5 w-3.5" /> Genre client
            </Label>
            <div className="flex flex-wrap gap-2">
              {GENDER_TARGET_OPTIONS.map((option) => (
                <Toggle
                  key={option.value}
                  pressed={normalizedCriteria.genders.includes(option.value)}
                  onPressedChange={() =>
                    toggleListValue("genders", option.value)
                  }
                  variant="outline"
                  size="sm"
                  className="data-[state=on]:bg-primary data-[state=on]:text-primary-foreground"
                >
                  {option.label}
                </Toggle>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              Le ciblage par genre s'appuie sur le champ optionnel renseigné par
              les clients à l'inscription ou dans leur profil.
            </p>
          </div>

          <div className="flex items-center justify-between rounded-xl border p-3">
            <div className="flex items-center gap-2">
              <Heart className="h-4 w-4 text-red-500" />
              <div>
                <p className="text-sm font-medium">
                  Uniquement les fans du restaurant
                </p>
                <p className="text-xs text-muted-foreground">
                  Cible les utilisateurs qui vous ont ajoute en favoris
                </p>
              </div>
            </div>
            <Switch
              checked={normalizedCriteria.favoritesOnly}
              onCheckedChange={(value) => update({ favoritesOnly: value })}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <UtensilsCrossed className="h-4 w-4" /> Affinites culinaires
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            {cuisineOptions.map((cuisine) => {
              const normalizedCuisine = cuisine.trim().toLowerCase();
              return (
                <Toggle
                  key={normalizedCuisine}
                  pressed={normalizedCriteria.cuisines.includes(
                    normalizedCuisine,
                  )}
                  onPressedChange={() =>
                    toggleListValue("cuisines", normalizedCuisine)
                  }
                  variant="outline"
                  size="sm"
                  className="data-[state=on]:bg-primary data-[state=on]:text-primary-foreground"
                >
                  {cuisine}
                </Toggle>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <Route className="h-4 w-4" /> Parcours privilegies
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap gap-2">
            {JOURNEY_TYPE_OPTIONS.map((option) => (
              <Toggle
                key={option.value}
                pressed={normalizedCriteria.journeyTypes.includes(option.value)}
                onPressedChange={() =>
                  toggleListValue("journeyTypes", option.value)
                }
                variant="outline"
                size="sm"
                className="data-[state=on]:bg-primary data-[state=on]:text-primary-foreground"
              >
                {option.label}
              </Toggle>
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            {SERVICE_MOMENT_OPTIONS.map((option) => (
              <Toggle
                key={option.value}
                pressed={normalizedCriteria.serviceMoments.includes(
                  option.value,
                )}
                onPressedChange={() =>
                  toggleListValue("serviceMoments", option.value)
                }
                variant="outline"
                size="sm"
                className="data-[state=on]:bg-primary data-[state=on]:text-primary-foreground"
              >
                <SunMedium className="mr-1 h-3 w-3" />
                {option.label}
              </Toggle>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <MapPin className="h-4 w-4" /> Localisation
          </CardTitle>
        </CardHeader>
        <CardContent>
          <CityMultiSelect
            value={normalizedCriteria.cities}
            onChange={(cities) => update({ cities })}
            placeholder="Ajoutez une ville cible..."
            emptyLabel="Toutes les villes"
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <ShoppingCart className="h-4 w-4" /> Valeur client
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs">
                Minimum de commandes ou réservations
              </Label>
              <Badge variant="outline">{normalizedCriteria.minOrders}+</Badge>
            </div>
            <Slider
              value={[normalizedCriteria.minOrders]}
              onValueChange={([value]) => update({ minOrders: value })}
              max={20}
              step={1}
            />
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs">Panier moyen minimum</Label>
              <Badge variant="outline">
                {normalizedCriteria.minAvgBasket} CHF
              </Badge>
            </div>
            <Slider
              value={[normalizedCriteria.minAvgBasket]}
              onValueChange={([value]) => update({ minAvgBasket: value })}
              max={120}
              step={5}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <Clock className="h-4 w-4" /> Recence d activite
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <div className="flex items-center justify-between">
            <Label className="text-xs">Derniere activite dans les</Label>
            <Badge variant="outline">
              {normalizedCriteria.maxDaysSinceOrder} jours
            </Badge>
          </div>
          <Slider
            value={[normalizedCriteria.maxDaysSinceOrder]}
            onValueChange={([value]) => update({ maxDaysSinceOrder: value })}
            min={7}
            max={365}
            step={7}
          />
        </CardContent>
      </Card>
    </div>
  );
}
