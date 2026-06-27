import { useEffect, useMemo, useState } from "react";
import { Loader2, Megaphone, Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { useToast } from "@/hooks/use-toast";
import { getSupabase } from "@/integrations/supabase/client";
import {
  CUSTOMER_SEGMENT_OPTIONS,
  DEFAULT_AUDIENCE_CRITERIA,
  GENDER_TARGET_OPTIONS,
  JOURNEY_TYPE_OPTIONS,
  SERVICE_MOMENT_OPTIONS,
  normalizeAudienceCriteria,
  type CampaignCustomerSegment,
  type CampaignGenderTarget,
  type CampaignJourneyType,
  type CampaignServiceMoment,
} from "@/lib/campaignTargeting";
import {
  CAMPAIGN_STRATEGY_CONFIG,
  estimateCampaignPlan,
  getCampaignPricing,
  type CampaignPricingStrategy,
} from "@/lib/campaignPricing";
import { buildCheckoutReturnUrl } from "@/lib/checkoutReturnUrl";
import { redirectToTrustedCheckoutUrl } from "@/lib/securityUrls";
import { invokeSupabaseFunction } from "@/lib/session";
import type { SocialFeedPost } from "@/lib/socialFeed";
import {
  buildSponsoredCampaignAiPreset,
  type SponsoredCampaignAiPreset,
} from "@/lib/sponsoredCampaignAi";

const SPONSOR_TARGET_OPTIONS_LIMIT = 120;
const SPONSOR_OBJECTIVES: CampaignPricingStrategy[] = ["visibility", "traffic", "conversion"];

function getCurrentDateInputValue() {
  return new Date().toISOString().slice(0, 10);
}

function formatChf(value: number, digits = 2) {
  return `${Number(value || 0).toFixed(digits)} CHF`;
}

function compactText(value: string, maxLength = 220) {
  const clean = value.replace(/\s+/g, " ").trim();
  return clean.length > maxLength ? `${clean.slice(0, maxLength - 1)}…` : clean;
}

export default function SocialPostBoostDialog({
  post,
  restaurantId,
  disabled = false,
  onCreated,
}: {
  post: SocialFeedPost;
  restaurantId: string;
  disabled?: boolean;
  onCreated?: () => void;
}) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [totalBudget, setTotalBudget] = useState("25");
  const [durationDays, setDurationDays] = useState(7);
  const [strategy, setStrategy] = useState<CampaignPricingStrategy>("traffic");
  const [customerSegment, setCustomerSegment] = useState<CampaignCustomerSegment>("all");
  const [genders, setGenders] = useState<CampaignGenderTarget[]>(["all"]);
  const [cities, setCities] = useState<string[]>(post.restaurant.city ? [post.restaurant.city] : []);
  const [cuisines, setCuisines] = useState<string[]>(post.restaurant.cuisineType ? [post.restaurant.cuisineType] : []);
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [minAvgBasket, setMinAvgBasket] = useState("");
  const [maxDaysSinceOrder, setMaxDaysSinceOrder] = useState(365);
  const [journeyTypes, setJourneyTypes] = useState<CampaignJourneyType[]>(["delivery", "takeaway"]);
  const [serviceMoments, setServiceMoments] = useState<CampaignServiceMoment[]>([]);
  const [cityOptions, setCityOptions] = useState<string[]>(post.restaurant.city ? [post.restaurant.city] : []);
  const [cuisineOptions, setCuisineOptions] = useState<string[]>(
    post.restaurant.cuisineType ? [post.restaurant.cuisineType] : [],
  );
  const [loading, setLoading] = useState(false);
  const [aiPreset, setAiPreset] = useState<SponsoredCampaignAiPreset | null>(null);

  const totalBudgetValue = Math.max(0, Number(totalBudget) || 0);
  const pricing = useMemo(() => getCampaignPricing(undefined, strategy), [strategy]);
  const estimate = useMemo(
    () => estimateCampaignPlan({ totalBudgetChf: totalBudgetValue, durationDays, strategy, pricing }),
    [durationDays, pricing, strategy, totalBudgetValue],
  );
  const imageUrl = post.media.find((media) => media.mediaType === "image")?.mediaUrl || post.restaurant.imageUrl || null;

  useEffect(() => {
    let cancelled = false;

    const loadSponsorTargetOptions = async () => {
      try {
        const supabase = getSupabase();
        if (typeof (supabase as any).from !== "function") return;

        const [restaurantsResult, cuisinesResult] = await Promise.all([
          supabase
            .from("restaurants" as any)
            .select("city,cuisine_type")
            .not("city", "is", null)
            .limit(SPONSOR_TARGET_OPTIONS_LIMIT),
          supabase
            .from("cuisines" as any)
            .select("name")
            .order("name", { ascending: true })
            .limit(SPONSOR_TARGET_OPTIONS_LIMIT),
        ]);

        if (cancelled) return;

        const restaurantRows = Array.isArray(restaurantsResult.data) ? restaurantsResult.data : [];
        const cuisineRows = Array.isArray(cuisinesResult.data) ? cuisinesResult.data : [];
        const loadedCities = Array.from(new Set([
          ...restaurantRows.map((row: any) => String(row?.city || "").trim()).filter(Boolean),
          post.restaurant.city,
        ].filter(Boolean))).sort((a, b) => a.localeCompare(b, "fr-CH"));
        const loadedCuisines = Array.from(new Set([
          ...cuisineRows.map((row: any) => String(row?.name || "").trim()).filter(Boolean),
          ...restaurantRows
            .flatMap((row: any) => String(row?.cuisine_type || "").split(","))
            .map((value: string) => value.trim())
            .filter(Boolean),
          post.restaurant.cuisineType,
        ].filter(Boolean))).sort((a, b) => a.localeCompare(b, "fr-CH"));

        setCityOptions(loadedCities);
        setCuisineOptions(loadedCuisines);
      } catch {
        if (!cancelled) {
          setCityOptions(post.restaurant.city ? [post.restaurant.city] : []);
          setCuisineOptions(post.restaurant.cuisineType ? [post.restaurant.cuisineType] : []);
        }
      }
    };

    if (open) void loadSponsorTargetOptions();

    return () => {
      cancelled = true;
    };
  }, [open, post.restaurant.city, post.restaurant.cuisineType]);

  const toggleCity = (value: string, checked: boolean) => {
    setCities((current) => {
      if (checked) return current.includes(value) ? current : [...current, value];
      return current.filter((item) => item !== value);
    });
  };

  const toggleCuisine = (value: string, checked: boolean) => {
    setCuisines((current) => {
      if (checked) return current.includes(value) ? current : [...current, value];
      return current.filter((item) => item !== value);
    });
  };

  const toggleGender = (value: CampaignGenderTarget, checked: boolean) => {
    setGenders((current) => {
      if (value === "all") return ["all"];
      const withoutAll = current.filter((item) => item !== "all");
      const next = checked
        ? Array.from(new Set([...withoutAll, value]))
        : withoutAll.filter((item) => item !== value);
      return next.length > 0 ? next : ["all"];
    });
  };

  const toggleJourneyType = (value: CampaignJourneyType, checked: boolean) => {
    setJourneyTypes((current) => {
      if (checked) return current.includes(value) ? current : [...current, value];
      return current.filter((item) => item !== value);
    });
  };

  const toggleServiceMoment = (value: CampaignServiceMoment, checked: boolean) => {
    setServiceMoments((current) => {
      if (checked) return current.includes(value) ? current : [...current, value];
      return current.filter((item) => item !== value);
    });
  };

  const applyAiPreset = () => {
    const preset = buildSponsoredCampaignAiPreset({
      body: post.body,
      restaurant: post.restaurant,
      postType: post.postType,
      ctaType: post.ctaType,
      campaignGoal: post.campaignGoal,
      hasMedia: post.media.length > 0 || Boolean(imageUrl),
    });

    setTotalBudget(preset.totalBudget);
    setDurationDays(preset.durationDays);
    setStrategy(preset.strategy);
    setCustomerSegment(preset.customerSegment);
    setGenders(preset.genders);
    setCities(preset.cities);
    setCuisines(preset.cuisines);
    setFavoritesOnly(preset.favoritesOnly);
    setMinAvgBasket(preset.minAvgBasket);
    setMaxDaysSinceOrder(preset.maxDaysSinceOrder);
    setJourneyTypes(preset.journeyTypes);
    setServiceMoments(preset.serviceMoments);
    setAiPreset(preset);

    toast({
      title: "Plan IA appliqué",
      description: preset.summary,
    });
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!restaurantId || !post.id) return;
    if (totalBudgetValue <= 0) {
      toast({ title: "Budget requis", description: "Le budget doit être supérieur à 0 CHF.", variant: "destructive" });
      return;
    }

    setLoading(true);
    try {
      const targetCriteria = normalizeAudienceCriteria({
        ...DEFAULT_AUDIENCE_CRITERIA,
        cities,
        cuisines,
        genders,
        favoritesOnly,
        minAvgBasket: Number(minAvgBasket) || 0,
        maxDaysSinceOrder,
        customerSegment,
        journeyTypes,
        serviceMoments,
        restaurantId,
      });

      const title = `Boost Actualités - ${post.restaurant.name}`;
      const { data, error } = await invokeSupabaseFunction<{ campaign?: { id?: string } }>("create-social-post-boost", {
        body: {
          restaurantId,
          postId: post.id,
          title,
          body: compactText(post.body),
          imageUrl,
          totalBudget: totalBudgetValue,
          durationDays,
          startsAt: getCurrentDateInputValue(),
          pricingStrategy: strategy,
          targetCriteria,
        },
      });

      if (error) throw error;
      const campaignId = data?.campaign?.id;
      if (!campaignId) throw new Error("Impossible de créer la mise en avant.");

      const checkout = await invokeSupabaseFunction<{ url?: string }>("create-checkout", {
        body: {
          checkout_kind: "campaign",
          items: [
            {
              name: `Post sponsorisé Actualités - ${post.restaurant.name}`,
              restaurant_name: post.restaurant.name,
              price: totalBudgetValue,
              quantity: 1,
            },
          ],
          payment_method: "card",
          return_url: buildCheckoutReturnUrl(`/dashboard/actualites?campaign_checkout=1&campaign_id=${campaignId}&post_id=${post.id}`),
          order_metadata: {
            checkout_kind: "campaign",
            order_reference: `social-post-campaign-${campaignId}`,
            campaign_id: campaignId,
            social_post_id: post.id,
            campaign_title: title,
            restaurant_id: restaurantId,
            target_page: "actualites",
            disable_connected_account: true,
          },
        },
      });

      if (checkout.error || !checkout.data?.url) {
        throw new Error(checkout.error?.message || "Impossible de créer la session de paiement.");
      }

      onCreated?.();
      redirectToTrustedCheckoutUrl(checkout.data.url);
    } catch (error) {
      toast({
        title: "Erreur",
        description: error instanceof Error ? error.message : "Impossible de créer la mise en avant.",
        variant: "destructive",
      });
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" size="sm" variant="outline" className="gap-2" disabled={disabled}>
          <Megaphone className="h-4 w-4" />
          Mettre en avant
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto rounded-3xl sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Megaphone className="h-5 w-5 text-primary" />
            Paramétrer la publication sponsorisée
          </DialogTitle>
          <DialogDescription>
            Choisissez un objectif, une audience et un budget. Le post sera mis en avant après validation du paiement.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Post sélectionné</p>
            <p className="mt-1 text-sm leading-6 text-slate-700">{compactText(post.body, 260)}</p>
          </div>

          <div className="rounded-2xl border border-orange-200 bg-orange-50/80 p-3">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm font-semibold text-orange-950">TOK IA choisit les meilleurs paramètres</p>
                <p className="mt-1 text-xs leading-5 text-orange-800">
                  Analyse le post, le restaurant, la ville, la cuisine et l'objectif pour remplir toute la campagne.
                </p>
              </div>
              <Button
                type="button"
                variant="outline"
                className="shrink-0 gap-2 rounded-xl border-orange-200 bg-white font-semibold text-orange-700 hover:bg-orange-100"
                onClick={applyAiPreset}
              >
                <Sparkles className="h-4 w-4" />
                IA optimise ma publicité
              </Button>
            </div>
            {aiPreset ? (
              <div className="mt-3 rounded-xl border border-orange-100 bg-white/80 p-3">
                <p className="text-sm font-semibold text-orange-950">Plan IA appliqué</p>
                <ul className="mt-2 space-y-1 text-xs leading-5 text-orange-800">
                  {aiPreset.reasons.map((reason) => (
                    <li key={reason}>{reason}</li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>

          <div className="space-y-2 rounded-2xl border border-slate-200 bg-slate-50/70 p-3">
            <p className="text-sm font-semibold text-slate-900">Objectif de campagne</p>
            <RadioGroup
              value={strategy}
              onValueChange={(value) => setStrategy(value as CampaignPricingStrategy)}
              className="grid gap-2 sm:grid-cols-3"
            >
              {SPONSOR_OBJECTIVES.map((objective) => {
                const config = CAMPAIGN_STRATEGY_CONFIG[objective];
                return (
                  <Label
                    key={objective}
                    htmlFor={`boost-objective-${post.id}-${objective}`}
                    className="flex cursor-pointer flex-col gap-1 rounded-2xl border border-slate-200 bg-white p-3 text-sm shadow-sm hover:border-orange-200 hover:bg-orange-50"
                  >
                    <span className="flex items-center gap-2 font-semibold text-slate-950">
                      <RadioGroupItem id={`boost-objective-${post.id}-${objective}`} value={objective} />
                      {config.shortLabel}
                    </span>
                    <span className="text-xs leading-5 text-muted-foreground">{config.description}</span>
                  </Label>
                );
              })}
            </RadioGroup>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2 rounded-2xl border border-slate-200 bg-white p-3">
              <Label htmlFor={`boost-budget-${post.id}`} className="text-sm font-semibold text-slate-900">
                Budget total
              </Label>
              <div className="flex items-center gap-2">
                <Input
                  id={`boost-budget-${post.id}`}
                  type="number"
                  min="1"
                  step="0.01"
                  value={totalBudget}
                  onChange={(event) => setTotalBudget(event.target.value)}
                  className="h-10 rounded-xl text-sm"
                />
                <span className="text-sm font-semibold text-slate-600">CHF</span>
              </div>
            </div>
            <div className="space-y-2 rounded-2xl border border-slate-200 bg-white p-3">
              <Label htmlFor={`boost-duration-${post.id}`} className="text-sm font-semibold text-slate-900">
                Durée
              </Label>
              <div className="flex items-center gap-2">
                <Input
                  id={`boost-duration-${post.id}`}
                  type="number"
                  min="1"
                  step="1"
                  value={durationDays}
                  onChange={(event) => setDurationDays(Math.max(1, Math.round(Number(event.target.value) || 1)))}
                  className="h-10 rounded-xl text-sm"
                />
                <span className="text-sm font-semibold text-slate-600">jours</span>
              </div>
            </div>
          </div>

          <div className="space-y-2 rounded-2xl border border-slate-200 bg-slate-50/70 p-3">
            <p className="text-sm font-semibold text-slate-900">Cible de prospects</p>
            <RadioGroup
              value={customerSegment}
              onValueChange={(value) => setCustomerSegment(value as CampaignCustomerSegment)}
              className="grid gap-2 sm:grid-cols-2"
            >
              {CUSTOMER_SEGMENT_OPTIONS.map((option) => (
                <Label
                  key={option.value}
                  htmlFor={`boost-segment-${post.id}-${option.value}`}
                  className="flex cursor-pointer items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm hover:border-orange-200 hover:bg-orange-50"
                >
                  <RadioGroupItem id={`boost-segment-${post.id}-${option.value}`} value={option.value} />
                  <span>{option.label}</span>
                </Label>
              ))}
            </RadioGroup>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2 rounded-2xl border border-slate-200 bg-white p-3">
              <p className="text-sm font-semibold text-slate-900">Ville</p>
              <div className="max-h-36 space-y-1 overflow-y-auto pr-1">
                {cityOptions.length > 0 ? cityOptions.map((city) => (
                  <Label key={city} htmlFor={`boost-city-${post.id}-${city}`} className="flex cursor-pointer items-center gap-2 rounded-xl px-2 py-1.5 text-sm hover:bg-orange-50">
                    <Checkbox
                      id={`boost-city-${post.id}-${city}`}
                      checked={cities.includes(city)}
                      onCheckedChange={(value) => toggleCity(city, value === true)}
                    />
                    <span>{city}</span>
                  </Label>
                )) : (
                  <p className="text-xs leading-5 text-muted-foreground">Toutes les villes seront incluses.</p>
                )}
              </div>
              <p className="text-xs text-muted-foreground">Aucune ville sélectionnée = toute la zone TOK.</p>
            </div>

            <div className="space-y-2 rounded-2xl border border-slate-200 bg-white p-3">
              <p className="text-sm font-semibold text-slate-900">Genre</p>
              <div className="grid gap-1">
                {GENDER_TARGET_OPTIONS.map((option) => (
                  <Label key={option.value} htmlFor={`boost-gender-${post.id}-${option.value}`} className="flex cursor-pointer items-center gap-2 rounded-xl px-2 py-1.5 text-sm hover:bg-orange-50">
                    <Checkbox
                      id={`boost-gender-${post.id}-${option.value}`}
                      checked={genders.includes(option.value)}
                      onCheckedChange={(value) => toggleGender(option.value, value === true)}
                    />
                    <span>{option.label}</span>
                  </Label>
                ))}
              </div>
            </div>
          </div>

          <div className="space-y-2 rounded-2xl border border-slate-200 bg-white p-3">
            <p className="text-sm font-semibold text-slate-900">Type de cuisine préférée</p>
            <div className="grid max-h-40 gap-1 overflow-y-auto pr-1 sm:grid-cols-2">
              {cuisineOptions.length > 0 ? cuisineOptions.map((cuisine) => (
                <Label key={cuisine} htmlFor={`boost-cuisine-${post.id}-${cuisine}`} className="flex cursor-pointer items-center gap-2 rounded-xl px-2 py-1.5 text-sm hover:bg-orange-50">
                  <Checkbox
                    id={`boost-cuisine-${post.id}-${cuisine}`}
                    checked={cuisines.includes(cuisine)}
                    onCheckedChange={(value) => toggleCuisine(cuisine, value === true)}
                  />
                  <span>{cuisine}</span>
                </Label>
              )) : (
                <p className="text-xs leading-5 text-muted-foreground">Toutes les cuisines seront incluses.</p>
              )}
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-2 rounded-2xl border border-slate-200 bg-white p-3">
              <p className="text-sm font-semibold text-slate-900">Affinité restaurant</p>
              <Label htmlFor={`boost-favorites-${post.id}`} className="flex cursor-pointer items-center gap-2 py-1.5 text-sm">
                <Checkbox
                  id={`boost-favorites-${post.id}`}
                  checked={favoritesOnly}
                  onCheckedChange={(value) => setFavoritesOnly(value === true)}
                />
                <span>Fans et clients ayant déjà interagi</span>
              </Label>
            </div>

            <div className="space-y-2 rounded-2xl border border-slate-200 bg-white p-3">
              <Label htmlFor={`boost-min-basket-${post.id}`} className="text-sm font-semibold text-slate-900">
                Panier moyen minimum
              </Label>
              <div className="flex items-center gap-2">
                <Input
                  id={`boost-min-basket-${post.id}`}
                  type="number"
                  min="0"
                  step="1"
                  value={minAvgBasket}
                  onChange={(event) => setMinAvgBasket(event.target.value)}
                  placeholder="Tous"
                  className="h-10 rounded-xl text-sm"
                />
                <span className="text-sm font-semibold text-slate-600">CHF</span>
              </div>
            </div>

            <div className="space-y-2 rounded-2xl border border-slate-200 bg-white p-3">
              <Label htmlFor={`boost-max-days-${post.id}`} className="text-sm font-semibold text-slate-900">
                Activité récente
              </Label>
              <div className="flex items-center gap-2">
                <Input
                  id={`boost-max-days-${post.id}`}
                  type="number"
                  min="1"
                  step="1"
                  value={maxDaysSinceOrder}
                  onChange={(event) => setMaxDaysSinceOrder(Math.max(1, Math.round(Number(event.target.value) || 365)))}
                  className="h-10 rounded-xl text-sm"
                />
                <span className="text-sm font-semibold text-slate-600">jours</span>
              </div>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2 rounded-2xl border border-slate-200 bg-white p-3">
              <p className="text-sm font-semibold text-slate-900">Conversions recherchées</p>
              {JOURNEY_TYPE_OPTIONS.map((option) => (
                <Label key={option.value} htmlFor={`boost-journey-${post.id}-${option.value}`} className="flex cursor-pointer items-center gap-2 py-1.5 text-sm">
                  <Checkbox
                    id={`boost-journey-${post.id}-${option.value}`}
                    checked={journeyTypes.includes(option.value)}
                    onCheckedChange={(value) => toggleJourneyType(option.value, value === true)}
                  />
                  <span>{option.label}</span>
                </Label>
              ))}
            </div>
            <div className="space-y-2 rounded-2xl border border-slate-200 bg-white p-3">
              <p className="text-sm font-semibold text-slate-900">Moments à pousser</p>
              {SERVICE_MOMENT_OPTIONS.map((option) => (
                <Label key={option.value} htmlFor={`boost-moment-${post.id}-${option.value}`} className="flex cursor-pointer items-center gap-2 py-1.5 text-sm">
                  <Checkbox
                    id={`boost-moment-${post.id}-${option.value}`}
                    checked={serviceMoments.includes(option.value)}
                    onCheckedChange={(value) => toggleServiceMoment(option.value, value === true)}
                  />
                  <span>{option.label}</span>
                </Label>
              ))}
            </div>
          </div>

          <div className="grid gap-2 rounded-2xl border border-orange-100 bg-orange-50 p-3 text-sm text-orange-950 sm:grid-cols-4">
            <div>
              <p className="text-xs text-orange-700">Budget / jour</p>
              <p className="font-bold">{formatChf(estimate.dailyBudget)}</p>
            </div>
            <div>
              <p className="text-xs text-orange-700">CPC estimé</p>
              <p className="font-bold">{formatChf(estimate.estimatedCpc)}</p>
            </div>
            <div>
              <p className="text-xs text-orange-700">Prospects touchés</p>
              <p className="font-bold">{estimate.estimatedPeopleReached.toLocaleString("fr-CH")}</p>
            </div>
            <div>
              <p className="text-xs text-orange-700">Conversions</p>
              <p className="font-bold">{estimate.projectedConversions.toLocaleString("fr-CH")}</p>
            </div>
          </div>

          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-between">
            <Button type="button" variant="outline" className="rounded-xl" onClick={() => setOpen(false)}>
              Annuler
            </Button>
            <Button
              type="submit"
              className="rounded-xl bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700"
              disabled={loading || totalBudgetValue <= 0}
            >
              {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Megaphone className="mr-2 h-4 w-4" />}
              {loading ? "Préparation..." : "Payer et sponsoriser"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
