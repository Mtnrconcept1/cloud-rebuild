import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Banknote,
  CheckCircle2,
  CreditCard,
  ExternalLink,
  Loader2,
  Percent,
  Smartphone,
  Store,
  Wallet,
} from "lucide-react";

import AddressAutocomplete from "@/components/AddressAutocomplete";
import DashboardLayout from "@/components/DashboardLayout";
import DashboardPageHero from "@/components/dashboard/DashboardPageHero";
import { useCommercialDemoFrame } from "@/components/commercial/CommercialDemoFrameProvider";
import ImageUpload from "@/components/ImageUpload";
import RestaurantPartnerContractCard from "@/components/contracts/RestaurantPartnerContractCard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { getSupabase } from "@/integrations/supabase/client";
import { buildCurrentCheckoutReturnUrl } from "@/lib/checkoutReturnUrl";
import { useActiveFeatures } from "@/lib/featureFlags";
import { useAuth } from "@/lib/auth-context";
import { SUPABASE_URL } from "@/lib/env";
import { redirectToTrustedCheckoutUrl } from "@/lib/securityUrls";
import { fetchWithFreshAccessToken } from "@/lib/session";
import {
  buildRestaurantCategorySearchTerms,
  formatRestaurantCategorySummary,
  normalizeRestaurantCategoryText,
  PREDEFINED_RESTAURANT_CATEGORIES,
} from "@/lib/restaurantCategories";
import { getGloballyEnabledPaymentMethods } from "@/lib/paymentMethods";
import {
  RESTAURANT_AMENITY_GROUPS,
  normalizeRestaurantAmenities,
} from "@/lib/restaurantAmenities";

import { useDashboardRestaurant } from "./useDashboardRestaurant";

const supabase = getSupabase();
const DASHBOARD_RESTAURANT_PROMOTIONS_LIMIT = 4;

const DASHBOARD_PROMOTION_TARGET_LABELS: Record<string, string> = {
  all: "Tous les clients",
  new: "Nouveaux clients",
  returning: "Clients fidèles",
};

type CuisineOption = {
  id: string;
  name: string;
  slug?: string | null;
  keywords?: string[] | null;
};

type DashboardActivePromotion = {
  id: string;
  name: string;
  promotion_type: string;
  promotion_value: number;
  target: string;
  start_at: string;
  end_at: string;
};

function formatDashboardPromotionNumber(value: number) {
  if (!Number.isFinite(value)) return "0";
  return Number.isInteger(value)
    ? value.toFixed(0)
    : value.toFixed(2).replace(/\.?0+$/, "");
}

function formatDashboardPromotionValue(promotion: DashboardActivePromotion) {
  const value = Number(promotion.promotion_value || 0);
  if (promotion.promotion_type === "percentage")
    return `-${formatDashboardPromotionNumber(value)}%`;
  if (promotion.promotion_type === "fixed")
    return `-${formatDashboardPromotionNumber(value)} CHF`;
  if (promotion.promotion_type === "free_delivery") return "Livraison offerte";
  return "Promotion";
}

function formatDashboardPromotionEndDate(endAt: string) {
  const date = new Date(endAt);
  if (!Number.isFinite(date.getTime())) return "date à confirmer";
  return date.toLocaleDateString("fr-FR", { day: "2-digit", month: "long" });
}

export default function DashboardRestaurant() {
  const { user } = useAuth();
  const { selectedId, dashboardAccessLocked, dashboardAccessLockReason } = useDashboardRestaurant();
  const commercialDemoFrame = useCommercialDemoFrame();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const globalActiveFeatures = useActiveFeatures({ enabled: !commercialDemoFrame });
  const activeFeatures = useMemo(
    () => commercialDemoFrame
      ? new Set(commercialDemoFrame.snapshot.active_features)
      : globalActiveFeatures,
    [commercialDemoFrame, globalActiveFeatures],
  );
  const deliveryEnabled = activeFeatures.has("livraison");
  const takeawayEnabled = activeFeatures.has("emporter");
  const dineInEnabled = activeFeatures.has("sur-place");
  const reservationEnabled = activeFeatures.has("reservation");
  const globallyEnabledPaymentMethods = useMemo(
    () => new Set(getGloballyEnabledPaymentMethods(activeFeatures)),
    [activeFeatures],
  );

  const [loading, setLoading] = useState(false);
  const [connectLoading, setConnectLoading] = useState(false);
  const [selectedCuisineIds, setSelectedCuisineIds] = useState<string[]>([]);
  const [disabledPaymentMethods, setDisabledPaymentMethods] = useState<
    string[]
  >([]);
  const [form, setForm] = useState({
    name: "",
    description: "",
    address: "",
    city: "",
    phone: "",
    cuisine_type: "",
    image_url: "",
    latitude: null as number | null,
    longitude: null as number | null,
    delivery_available: false,
    delivery_fee: 0,
    min_order_amount: 0,
    supports_pickup: false,
    supports_dinein: false,
    supports_reservation: false,
    amenities: [] as string[],
  });

  const { data: restaurant } = useQuery({
    queryKey: ["my-restaurant", selectedId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("restaurants")
        .select("*")
        .eq("id", selectedId!)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!selectedId,
  });

  const { data: activePromotions = [] } = useQuery({
    queryKey: ["dashboard-restaurant-active-promotions", selectedId],
    queryFn: async () => {
      const now = new Date().toISOString();
      const { data, error } = await supabase
        .from("restaurant_promotions")
        .select(
          "id, name, promotion_type, promotion_value, target, start_at, end_at",
        )
        .eq("restaurant_id", selectedId!)
        .eq("active", true)
        .lte("start_at", now)
        .gte("end_at", now)
        .order("end_at", { ascending: true })
        .limit(DASHBOARD_RESTAURANT_PROMOTIONS_LIMIT);
      if (error) throw error;
      return (data || []) as DashboardActivePromotion[];
    },
    enabled: !!selectedId,
  });

  const { data: cuisineOptions = [] } = useQuery({
    queryKey: ["restaurant-cuisine-options"],
    queryFn: async () => {
      const fallback = PREDEFINED_RESTAURANT_CATEGORIES.map(
        (category, index) => ({
          id: category.slug || `fallback-${index}`,
          name: category.name,
          slug: category.slug,
          keywords: category.keywords,
        }),
      );
      const { data, error } = await (supabase.from("cuisines") as any)
        .select("id, name, slug, keywords")
        .order("name", { ascending: true });
      if (error) throw error;
      return (data?.length ? data : fallback) as CuisineOption[];
    },
  });

  const { data: restaurantCuisineLinks = [] } = useQuery({
    queryKey: ["restaurant-cuisine-links", selectedId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("restaurant_cuisines")
        .select("cuisine_id")
        .eq("restaurant_id", selectedId!);
      if (error) throw error;
      return (data || []).map((row: any) => String(row.cuisine_id));
    },
    enabled: !!selectedId,
  });

  useEffect(() => {
    if (!restaurant) return;
    setForm({
      name: restaurant.name,
      description: restaurant.description || "",
      address: restaurant.address,
      city: restaurant.city,
      phone: restaurant.phone || "",
      cuisine_type: restaurant.cuisine_type || "",
      image_url: restaurant.image_url || "",
      latitude: Number(restaurant.latitude) || null,
      longitude: Number(restaurant.longitude) || null,
      delivery_available: restaurant.delivery_available || false,
      delivery_fee: Number(restaurant.delivery_fee) || 0,
      min_order_amount: Number(restaurant.min_order_amount) || 0,
      supports_pickup: restaurant.supports_pickup || false,
      supports_dinein: restaurant.supports_dinein || false,
      supports_reservation: restaurant.supports_reservation || false,
      amenities: normalizeRestaurantAmenities(
        (restaurant as Record<string, unknown>).amenities,
      ),
    });
    setDisabledPaymentMethods(
      ((restaurant as Record<string, unknown>)
        .disabled_payment_methods as string[]) || [],
    );
  }, [restaurant]);

  useEffect(() => {
    if (!restaurant || cuisineOptions.length === 0) return;

    if (restaurantCuisineLinks.length > 0) {
      setSelectedCuisineIds(restaurantCuisineLinks);
      return;
    }

    const normalizedLegacy = normalizeRestaurantCategoryText(
      restaurant.cuisine_type,
    );
    if (!normalizedLegacy) {
      setSelectedCuisineIds([]);
      return;
    }

    const inferredIds = cuisineOptions
      .filter((option) => {
        const terms = buildRestaurantCategorySearchTerms({
          categories: [option],
          legacyCuisineType: option.name,
        });
        return terms.some(
          (term) =>
            normalizedLegacy.includes(term) || term.includes(normalizedLegacy),
        );
      })
      .map((option) => option.id);

    setSelectedCuisineIds(inferredIds);
  }, [restaurant, cuisineOptions, restaurantCuisineLinks]);

  const selectedCuisineNames = useMemo(() => {
    const selectedSet = new Set(selectedCuisineIds);
    return cuisineOptions
      .filter((option) => selectedSet.has(option.id))
      .map((option) => option.name);
  }, [cuisineOptions, selectedCuisineIds]);

  const cuisineSummary = useMemo(() => {
    return formatRestaurantCategorySummary(
      selectedCuisineNames,
      form.cuisine_type || "",
    );
  }, [form.cuisine_type, selectedCuisineNames]);

  const toggleCuisine = (cuisineId: string) => {
    setSelectedCuisineIds((current) =>
      current.includes(cuisineId)
        ? current.filter((id) => id !== cuisineId)
        : [...current, cuisineId],
    );
  };

  const toggleAmenity = (amenityId: string) => {
    setForm((current) => ({
      ...current,
      amenities: current.amenities.includes(amenityId)
        ? current.amenities.filter((id) => id !== amenityId)
        : [...current.amenities, amenityId],
    }));
  };

  const syncRestaurantCuisines = async (restaurantId: string) => {
    const { error } = await (supabase as any).rpc("restaurant_set_cuisines", {
      p_restaurant_id: restaurantId,
      p_cuisine_ids: selectedCuisineIds,
    });
    if (error) throw error;
  };

  const handleSave = async () => {
    if (!user) return;
    setLoading(true);

    try {
      const payload = {
        ...form,
        amenities: form.amenities,
        cuisine_type: cuisineSummary,
        disabled_payment_methods: disabledPaymentMethods,
      };

      let restaurantId = restaurant?.id || null;

      if (restaurant) {
        const { error } = await supabase
          .from("restaurants")
          .update(payload)
          .eq("id", restaurant.id);
        if (error) throw error;
        restaurantId = restaurant.id;
      } else {
        const { data, error } = await supabase
          .from("restaurants")
          .insert({
            ...payload,
            owner_id: user.id,
            status: "pending",
            is_active: false,
          })
          .select("id")
          .single();
        if (error) throw error;
        restaurantId = data.id;
      }

      if (restaurantId) {
        await syncRestaurantCuisines(restaurantId);
      }

      toast({
        title: restaurant ? "Restaurant mis à jour !" : "Restaurant crée !",
      });
      queryClient.invalidateQueries({ queryKey: ["my-restaurant"] });
      queryClient.invalidateQueries({ queryKey: ["owner-restaurants"] });
      queryClient.invalidateQueries({ queryKey: ["restaurant-cuisine-links"] });
    } catch (error: any) {
      toast({
        title: "Erreur",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleStripeConnect = async () => {
    if (!restaurant) return;
    if (commercialDemoFrame?.surface === "restaurant") {
      toast({
        title: "Stripe Connect en mode démonstration",
        description: "Le parcours est simulé : aucun compte Stripe réel ni lien d’onboarding n’est créé.",
      });
      return;
    }
    setConnectLoading(true);
    try {
      const response = await fetchWithFreshAccessToken(
        `${SUPABASE_URL}/functions/v1/stripe-connect-onboard`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            restaurant_id: restaurant.id,
            return_url: buildCurrentCheckoutReturnUrl(),
          }),
        },
      );
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Erreur");
      redirectToTrustedCheckoutUrl(data.url);
    } catch (error: any) {
      toast({
        title: "Erreur",
        description: error.message,
        variant: "destructive",
      });
      setConnectLoading(false);
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {dashboardAccessLocked ? (
          <div className="max-w-3xl rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950">
            <p className="font-semibold">Fiche privée — validation en attente</p>
            <p className="mt-1">
              {dashboardAccessLockReason || "Cette fiche n'est pas encore publiée dans les recherches clients."}
            </p>
          </div>
        ) : null}
        <DashboardPageHero
          badge="Identite restaurant"
          title={restaurant ? "Mon restaurant" : "Créer mon restaurant"}
          description="Gardez l'identité, l'adresse, les catégories, les moyens de paiement et les options de service au même niveau de contrôle."
          icon={Store}
          tone="orange"
          visualLabel="Profil"
          stats={[
            {
              label: "Categories",
              value: selectedCuisineIds.length,
              icon: Store,
            },
            {
              label: "Commodités",
              value: form.amenities.length,
              icon: CheckCircle2,
            },
            {
              label: "Paiements coupes",
              value: disabledPaymentMethods.length,
              icon: CreditCard,
            },
            {
              label: "Stripe",
              value: restaurant?.stripe_account_id ? "Connecte" : "A relier",
              icon: Wallet,
            },
          ]}
        />
        {restaurant && activePromotions.length > 0 ? (
          <section className="max-w-3xl rounded-2xl border-2 border-primary/15 bg-gradient-to-br from-primary/10 via-orange-50/70 to-background p-4 shadow-sm">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="flex items-start gap-3">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-sm">
                  <Percent className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">
                    Promotions visibles
                  </p>
                  <h2 className="mt-1 font-display text-xl font-bold">
                    Actives sur la fiche restaurant
                  </h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Ces offres sont actuellement affichées aux clients tant que
                    leurs dates restent valides.
                  </p>
                </div>
              </div>
              <Badge className="w-fit rounded-full bg-primary text-primary-foreground">
                {activePromotions.length} active
                {activePromotions.length > 1 ? "s" : ""}
              </Badge>
            </div>
            <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
              {activePromotions.map((promotion) => (
                <div
                  key={promotion.id}
                  className="rounded-xl border bg-background/85 p-4 shadow-sm"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge className="bg-primary/10 text-primary hover:bg-primary/10">
                      {formatDashboardPromotionValue(promotion)}
                    </Badge>
                    <Badge
                      variant="outline"
                      className="bg-background text-[10px]"
                    >
                      {DASHBOARD_PROMOTION_TARGET_LABELS[promotion.target] ||
                        promotion.target}
                    </Badge>
                  </div>
                  <p className="mt-3 text-sm font-bold">{promotion.name}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Valable jusqu'au{" "}
                    {formatDashboardPromotionEndDate(promotion.end_at)}
                  </p>
                </div>
              ))}
            </div>
          </section>
        ) : null}
        {restaurant ? (
          <RestaurantPartnerContractCard
            restaurantId={restaurant.id}
            mode="restaurateur"
            restaurant={restaurant as any}
          />
        ) : null}

        <div className="max-w-3xl space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Nom</Label>
              <Input
                value={form.name}
                onChange={(event) =>
                  setForm({ ...form, name: event.target.value })
                }
                required
              />
            </div>
            <div className="space-y-2">
              <Label>Résumé des catégories</Label>
              <Input
                value={cuisineSummary}
                readOnly
                placeholder="Sélectionnez un ou plusieurs types"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Types de restauration</Label>
            <p className="text-xs text-muted-foreground">
              Sélection multiple. Ces catégories alimentent la recherche et
              decrivent precisement votre offre.
            </p>
            <div className="flex flex-wrap gap-2 rounded-xl border p-3">
              {cuisineOptions.map((option) => {
                const selected = selectedCuisineIds.includes(option.id);
                return (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => toggleCuisine(option.id)}
                    className={`rounded-full border px-3 py-2 text-sm transition-colors ${selected ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background hover:bg-muted"}`}
                  >
                    {option.name}
                  </button>
                );
              })}
            </div>
            {selectedCuisineNames.length > 0 && (
              <div className="flex flex-wrap gap-2 pt-1">
                {selectedCuisineNames.map((name) => (
                  <Badge key={name} variant="secondary">
                    {name}
                  </Badge>
                ))}
              </div>
            )}
          </div>

          <div className="space-y-2">
            <Label>Description</Label>
            <Textarea
              value={form.description}
              onChange={(event) =>
                setForm({ ...form, description: event.target.value })
              }
            />
          </div>

          <div className="space-y-2">
            <Label>Adresse</Label>
            <AddressAutocomplete
              value={form.address}
              preferredCity={form.city}
              locationBias={{
                latitude: form.latitude,
                longitude: form.longitude,
                city: form.city,
                country: "Suisse",
              }}
              onValueChange={(value) => {
                setForm((current) => ({
                  ...current,
                  address: value,
                  latitude: null,
                  longitude: null,
                }));
              }}
              onAddressSelect={(address, city, selection) => {
                setForm((current) => ({
                  ...current,
                  address,
                  city: city || current.city,
                  latitude: selection?.latitude ?? current.latitude,
                  longitude: selection?.longitude ?? current.longitude,
                }));
              }}
              placeholder="Adresse du restaurant"
            />
          </div>

          <div className="space-y-2">
            <Label>Téléphone</Label>
            <Input
              value={form.phone}
              onChange={(event) =>
                setForm({ ...form, phone: event.target.value })
              }
            />
          </div>

          <ImageUpload
            label="Photo du restaurant"
            value={form.image_url}
            onChange={(url) => setForm({ ...form, image_url: url })}
          />

          <div className="mt-6 space-y-4 border-t pt-4">
            <div>
              <h3 className="font-semibold">Commodités et services</h3>
              <p className="text-sm text-muted-foreground">
                Sélectionnez les attributs visibles par les clients, sur le
                modèle des fiches Google Business.
              </p>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              {RESTAURANT_AMENITY_GROUPS.map((group) => (
                <section
                  key={group.id}
                  className="rounded-xl border bg-background p-4"
                >
                  <div className="mb-3">
                    <h4 className="text-sm font-semibold">{group.title}</h4>
                    <p className="text-xs text-muted-foreground">
                      {group.description}
                    </p>
                  </div>
                  <div className="space-y-3">
                    {group.options.map((option) => {
                      const checked = form.amenities.includes(option.id);
                      const checkboxId = `restaurant-amenity-${option.id}`;
                      return (
                        <div key={option.id} className="flex items-start gap-3">
                          <Checkbox
                            id={checkboxId}
                            checked={checked}
                            onCheckedChange={() => toggleAmenity(option.id)}
                            className="mt-0.5"
                          />
                          <div className="grid gap-0.5 leading-none">
                            <Label
                              htmlFor={checkboxId}
                              className="cursor-pointer text-sm font-medium leading-none"
                            >
                              {option.label}
                            </Label>
                            <p className="text-xs leading-5 text-muted-foreground">
                              {option.description}
                            </p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </section>
              ))}
            </div>
            {form.amenities.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {RESTAURANT_AMENITY_GROUPS.flatMap((group) => group.options)
                  .filter((option) => form.amenities.includes(option.id))
                  .map((option) => (
                    <Badge key={option.id} variant="secondary">
                      {option.label}
                    </Badge>
                  ))}
              </div>
            ) : null}
          </div>

          {deliveryEnabled ? (
            <>
              <div className="flex items-center gap-4 pt-2">
                <div className="flex items-center gap-2">
                  <Switch
                    checked={form.delivery_available}
                    onCheckedChange={(checked) =>
                      setForm({ ...form, delivery_available: checked })
                    }
                  />
                  <Label>Livraison disponible</Label>
                </div>
              </div>

              {form.delivery_available && (
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Frais de livraison (CHF)</Label>
                    <Input
                      type="number"
                      step="0.01"
                      value={form.delivery_fee}
                      onChange={(event) =>
                        setForm({
                          ...form,
                          delivery_fee: Number(event.target.value),
                        })
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Commande minimum (CHF)</Label>
                    <Input
                      type="number"
                      step="0.01"
                      value={form.min_order_amount}
                      onChange={(event) =>
                        setForm({
                          ...form,
                          min_order_amount: Number(event.target.value),
                        })
                      }
                    />
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
              La livraison est actuellement désactivée par l'administration
              globale.
            </div>
          )}

          <div className="mt-6 border-t pt-4">
            <h3 className="mb-4 font-semibold">
              Modes de consommation alternatifs
            </h3>
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="flex items-center gap-2">
                <Switch
                  checked={takeawayEnabled && form.supports_pickup}
                  disabled={!takeawayEnabled}
                  onCheckedChange={(checked) =>
                    setForm({ ...form, supports_pickup: checked })
                  }
                />
                <Label>A emporter (Click & Collect)</Label>
              </div>
              <div className="flex items-center gap-2">
                <Switch
                  checked={dineInEnabled && form.supports_dinein}
                  disabled={!dineInEnabled}
                  onCheckedChange={(checked) =>
                    setForm({ ...form, supports_dinein: checked })
                  }
                />
                <Label>Sur place (Dine-in)</Label>
              </div>
              <div className="flex items-center gap-2">
                <Switch
                  checked={reservationEnabled && form.supports_reservation}
                  disabled={!reservationEnabled}
                  onCheckedChange={(checked) =>
                    setForm({ ...form, supports_reservation: checked })
                  }
                />
                <Label>Reservation de table</Label>
              </div>
            </div>
            {!takeawayEnabled || !dineInEnabled || !reservationEnabled ? (
              <p className="pt-2 text-xs text-muted-foreground">
                Les options coupees globalement par l'administration restent
                forcees a off ici.
              </p>
            ) : null}
          </div>

          <Button
            onClick={handleSave}
            disabled={loading}
            className="mt-8 w-full"
          >
            {loading ? "Enregistrement..." : "Sauvegarder"}
          </Button>

          {restaurant && (
            <div className="mt-6 border-t pt-4">
              <h3 className="mb-4 flex items-center gap-2 font-semibold">
                <CreditCard className="h-5 w-5" /> Moyens de paiement acceptés
              </h3>
              <p className="mb-4 text-sm text-muted-foreground">
                Désactivez les moyens de paiement que vous ne souhaitez pas
                proposer à vos clients.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {(
                  [
                    {
                      id: "card",
                      label: "Carte bancaire",
                      icon: CreditCard,
                      description: "Visa, Mastercard, AMEX",
                    },
                    {
                      id: "twint",
                      label: "TWINT",
                      icon: Smartphone,
                      description: "Paiement mobile suisse",
                    },
                    {
                      id: "postfinance_card",
                      label: "PostFinance Card",
                      icon: Wallet,
                      description: "Carte PostFinance",
                    },
                    {
                      id: "postfinance_efinance",
                      label: "PostFinance E-Finance",
                      icon: Wallet,
                      description: "E-banking PostFinance",
                    },
                    {
                      id: "cash",
                      label: "Espèces",
                      icon: Banknote,
                      description: "Paiement sur place",
                    },
                  ] as const
                ).map((method) => {
                  const enabled = !disabledPaymentMethods.includes(method.id);
                  const globallyEnabled = globallyEnabledPaymentMethods.has(
                    method.id,
                  );
                  return (
                    <div
                      key={method.id}
                      className={`flex items-center gap-3 rounded-xl border-2 p-3 transition-all ${enabled && globallyEnabled ? "border-primary/30 bg-primary/5" : "border-muted bg-muted/30 opacity-60"}`}
                    >
                      <Switch
                        checked={enabled && globallyEnabled}
                        disabled={!globallyEnabled}
                        onCheckedChange={(checked) => {
                          setDisabledPaymentMethods((prev) =>
                            checked
                              ? prev.filter((m) => m !== method.id)
                              : [...prev, method.id],
                          );
                        }}
                      />
                      <method.icon
                        className={`h-5 w-5 shrink-0 ${enabled && globallyEnabled ? "text-primary" : "text-muted-foreground"}`}
                      />
                      <div>
                        <p className="text-sm font-medium">{method.label}</p>
                        <p className="text-[11px] text-muted-foreground">
                          {globallyEnabled
                            ? method.description
                            : "Désactivé globalement par l'administration"}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {restaurant && (
            <div className="mt-6 border-t pt-4">
              <h3 className="mb-4 flex items-center gap-2 font-semibold">
                <CreditCard className="h-5 w-5" /> Paiements Stripe Connect
              </h3>
              <p className="mb-4 text-sm text-muted-foreground">
                Connectez votre compte Stripe pour recevoir les paiements
                directement sur votre compte bancaire.
              </p>
              {(restaurant as any).stripe_account_id ? (
                <div className="flex items-center gap-3 rounded-xl border border-green-200 bg-green-50 p-4">
                  <CheckCircle2 className="h-5 w-5 shrink-0 text-green-600" />
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-green-800">
                      Compte Stripe connecté
                    </p>
                    <p className="font-mono text-xs text-green-600">
                      {(restaurant as any).stripe_account_id}
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleStripeConnect}
                    disabled={connectLoading}
                    className="gap-1.5"
                  >
                    {connectLoading ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <ExternalLink className="h-3.5 w-3.5" />
                    )}
                    Gérer
                  </Button>
                </div>
              ) : (
                <Button
                  onClick={handleStripeConnect}
                  disabled={connectLoading}
                  variant="outline"
                  className="w-full gap-2"
                >
                  {connectLoading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <CreditCard className="h-4 w-4" />
                  )}
                  {connectLoading
                    ? "Redirection..."
                    : "Connecter mon compte Stripe"}
                </Button>
              )}
            </div>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}
