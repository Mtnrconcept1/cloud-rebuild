import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Banknote, CheckCircle2, CreditCard, ExternalLink, Loader2, Smartphone, Wallet } from "lucide-react";

import AddressAutocomplete from "@/components/AddressAutocomplete";
import DashboardLayout from "@/components/DashboardLayout";
import ImageUpload from "@/components/ImageUpload";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useActiveFeatures } from "@/lib/featureFlags";
import { useAuth } from "@/lib/auth";
import {
  buildRestaurantCategorySearchTerms,
  formatRestaurantCategorySummary,
  normalizeRestaurantCategoryText,
  PREDEFINED_RESTAURANT_CATEGORIES,
} from "@/lib/restaurantCategories";

import { useDashboardRestaurant } from "./DashboardContext";

type CuisineOption = {
  id: string;
  name: string;
  slug?: string | null;
  keywords?: string[] | null;
};

export default function DashboardRestaurant() {
  const { user } = useAuth();
  const { selectedId } = useDashboardRestaurant();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const activeFeatures = useActiveFeatures();
  const deliveryEnabled = activeFeatures.has("livraison");

  const [loading, setLoading] = useState(false);
  const [connectLoading, setConnectLoading] = useState(false);
  const [selectedCuisineIds, setSelectedCuisineIds] = useState<string[]>([]);
  const [disabledPaymentMethods, setDisabledPaymentMethods] = useState<string[]>([]);
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
  });

  const { data: restaurant } = useQuery({
    queryKey: ["my-restaurant", selectedId],
    queryFn: async () => {
      const { data, error } = await supabase.from("restaurants").select("*").eq("id", selectedId!).single();
      if (error) throw error;
      return data;
    },
    enabled: !!selectedId,
  });

  const { data: cuisineOptions = [] } = useQuery({
    queryKey: ["restaurant-cuisine-options"],
    queryFn: async () => {
      const fallback = PREDEFINED_RESTAURANT_CATEGORIES.map((category, index) => ({
        id: category.slug || `fallback-${index}`,
        name: category.name,
        slug: category.slug,
        keywords: category.keywords,
      }));
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
      const { data, error } = await supabase.from("restaurant_cuisines").select("cuisine_id").eq("restaurant_id", selectedId!);
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
    });
    setDisabledPaymentMethods((restaurant as Record<string, unknown>).disabled_payment_methods as string[] || []);
  }, [restaurant]);

  useEffect(() => {
    if (!restaurant || cuisineOptions.length === 0) return;

    if (restaurantCuisineLinks.length > 0) {
      setSelectedCuisineIds(restaurantCuisineLinks);
      return;
    }

    const normalizedLegacy = normalizeRestaurantCategoryText(restaurant.cuisine_type);
    if (!normalizedLegacy) {
      setSelectedCuisineIds([]);
      return;
    }

    const inferredIds = cuisineOptions
      .filter((option) => {
        const terms = buildRestaurantCategorySearchTerms({ categories: [option], legacyCuisineType: option.name });
        return terms.some((term) => normalizedLegacy.includes(term) || term.includes(normalizedLegacy));
      })
      .map((option) => option.id);

    setSelectedCuisineIds(inferredIds);
  }, [restaurant, cuisineOptions, restaurantCuisineLinks]);

  const selectedCuisineNames = useMemo(() => {
    const selectedSet = new Set(selectedCuisineIds);
    return cuisineOptions.filter((option) => selectedSet.has(option.id)).map((option) => option.name);
  }, [cuisineOptions, selectedCuisineIds]);

  const cuisineSummary = useMemo(() => {
    return formatRestaurantCategorySummary(selectedCuisineNames, form.cuisine_type || "");
  }, [form.cuisine_type, selectedCuisineNames]);

  const toggleCuisine = (cuisineId: string) => {
    setSelectedCuisineIds((current) => (
      current.includes(cuisineId)
        ? current.filter((id) => id !== cuisineId)
        : [...current, cuisineId]
    ));
  };

  const syncRestaurantCuisines = async (restaurantId: string) => {
    const { error: deleteError } = await supabase.from("restaurant_cuisines").delete().eq("restaurant_id", restaurantId);
    if (deleteError) throw deleteError;

    if (selectedCuisineIds.length === 0) return;

    const rows = selectedCuisineIds.map((cuisineId) => ({ restaurant_id: restaurantId, cuisine_id: cuisineId }));
    const { error: insertError } = await supabase.from("restaurant_cuisines").insert(rows);
    if (insertError) throw insertError;
  };

  const handleSave = async () => {
    if (!user) return;
    setLoading(true);

    try {
      const payload = {
        ...form,
        cuisine_type: cuisineSummary,
        disabled_payment_methods: disabledPaymentMethods,
      };

      let restaurantId = restaurant?.id || null;

      if (restaurant) {
        const { error } = await supabase.from("restaurants").update(payload).eq("id", restaurant.id);
        if (error) throw error;
        restaurantId = restaurant.id;
      } else {
        const { data, error } = await supabase
          .from("restaurants")
          .insert({ ...payload, owner_id: user.id })
          .select("id")
          .single();
        if (error) throw error;
        restaurantId = data.id;
      }

      if (restaurantId) {
        await syncRestaurantCuisines(restaurantId);
      }

      toast({ title: restaurant ? "Restaurant mis a jour !" : "Restaurant cree !" });
      queryClient.invalidateQueries({ queryKey: ["my-restaurant"] });
      queryClient.invalidateQueries({ queryKey: ["owner-restaurants"] });
      queryClient.invalidateQueries({ queryKey: ["restaurant-cuisine-links"] });
    } catch (error: any) {
      toast({ title: "Erreur", description: error.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const handleStripeConnect = async () => {
    if (!restaurant) return;
    setConnectLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/stripe-connect-onboard`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify({
          restaurant_id: restaurant.id,
          return_url: window.location.href,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Erreur");
      window.location.href = data.url;
    } catch (error: any) {
      toast({ title: "Erreur", description: error.message, variant: "destructive" });
      setConnectLoading(false);
    }
  };

  return (
    <DashboardLayout>
      <div className="max-w-3xl space-y-6">
        <h1 className="font-display text-3xl font-bold">{restaurant ? "Mon restaurant" : "Creer mon restaurant"}</h1>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Nom</Label>
              <Input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} required />
            </div>
            <div className="space-y-2">
              <Label>Resume des categories</Label>
              <Input value={cuisineSummary} readOnly placeholder="Selectionnez un ou plusieurs types" />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Types de restauration</Label>
            <p className="text-xs text-muted-foreground">
              Selection multiple. Ces categories alimentent la recherche et decrivent precisement votre offre.
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
                  <Badge key={name} variant="secondary">{name}</Badge>
                ))}
              </div>
            )}
          </div>

          <div className="space-y-2">
            <Label>Description</Label>
            <Textarea value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} />
          </div>

          <div className="space-y-2">
            <Label>Adresse</Label>
            <AddressAutocomplete
              value={form.address}
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
            <Label>Telephone</Label>
            <Input value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} />
          </div>

          <ImageUpload label="Photo du restaurant" value={form.image_url} onChange={(url) => setForm({ ...form, image_url: url })} />

          {deliveryEnabled ? (
            <>
              <div className="flex items-center gap-4 pt-2">
                <div className="flex items-center gap-2">
                  <Switch checked={form.delivery_available} onCheckedChange={(checked) => setForm({ ...form, delivery_available: checked })} />
                  <Label>Livraison disponible</Label>
                </div>
              </div>

              {form.delivery_available && (
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Frais de livraison (CHF)</Label>
                    <Input type="number" step="0.01" value={form.delivery_fee} onChange={(event) => setForm({ ...form, delivery_fee: Number(event.target.value) })} />
                  </div>
                  <div className="space-y-2">
                    <Label>Commande minimum (CHF)</Label>
                    <Input type="number" step="0.01" value={form.min_order_amount} onChange={(event) => setForm({ ...form, min_order_amount: Number(event.target.value) })} />
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
              La livraison est actuellement desactivee par l'administration globale.
            </div>
          )}

          <div className="mt-6 border-t pt-4">
            <h3 className="mb-4 font-semibold">Modes de consommation alternatifs</h3>
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="flex items-center gap-2">
                <Switch checked={form.supports_pickup} onCheckedChange={(checked) => setForm({ ...form, supports_pickup: checked })} />
                <Label>A emporter (Click & Collect)</Label>
              </div>
              <div className="flex items-center gap-2">
                <Switch checked={form.supports_dinein} onCheckedChange={(checked) => setForm({ ...form, supports_dinein: checked })} />
                <Label>Sur place (Dine-in)</Label>
              </div>
              <div className="flex items-center gap-2">
                <Switch checked={form.supports_reservation} onCheckedChange={(checked) => setForm({ ...form, supports_reservation: checked })} />
                <Label>Reservation de table</Label>
              </div>
            </div>
          </div>

          <Button onClick={handleSave} disabled={loading} className="mt-8 w-full">
            {loading ? "Enregistrement..." : "Sauvegarder"}
          </Button>

          {restaurant && (
            <div className="mt-6 border-t pt-4">
              <h3 className="mb-4 flex items-center gap-2 font-semibold">
                <CreditCard className="h-5 w-5" /> Moyens de paiement acceptes
              </h3>
              <p className="mb-4 text-sm text-muted-foreground">
                Desactivez les moyens de paiement que vous ne souhaitez pas proposer a vos clients.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {([
                  { id: "card", label: "Carte bancaire", icon: CreditCard, description: "Visa, Mastercard, AMEX" },
                  { id: "twint", label: "TWINT", icon: Smartphone, description: "Paiement mobile suisse" },
                  { id: "postfinance_card", label: "PostFinance Card", icon: Wallet, description: "Carte PostFinance" },
                  { id: "postfinance_efinance", label: "PostFinance E-Finance", icon: Wallet, description: "E-banking PostFinance" },
                  { id: "cash", label: "Especes", icon: Banknote, description: "Paiement sur place" },
                ] as const).map((method) => {
                  const enabled = !disabledPaymentMethods.includes(method.id);
                  return (
                    <div key={method.id} className={`flex items-center gap-3 rounded-xl border-2 p-3 transition-all ${enabled ? "border-primary/30 bg-primary/5" : "border-muted bg-muted/30 opacity-60"}`}>
                      <Switch
                        checked={enabled}
                        onCheckedChange={(checked) => {
                          setDisabledPaymentMethods((prev) =>
                            checked ? prev.filter((m) => m !== method.id) : [...prev, method.id]
                          );
                        }}
                      />
                      <method.icon className={`h-5 w-5 shrink-0 ${enabled ? "text-primary" : "text-muted-foreground"}`} />
                      <div>
                        <p className="text-sm font-medium">{method.label}</p>
                        <p className="text-[11px] text-muted-foreground">{method.description}</p>
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
                Connectez votre compte Stripe pour recevoir les paiements directement sur votre compte bancaire.
              </p>
              {(restaurant as any).stripe_account_id ? (
                <div className="flex items-center gap-3 rounded-xl border border-green-200 bg-green-50 p-4">
                  <CheckCircle2 className="h-5 w-5 shrink-0 text-green-600" />
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-green-800">Compte Stripe connecte</p>
                    <p className="font-mono text-xs text-green-600">{(restaurant as any).stripe_account_id}</p>
                  </div>
                  <Button variant="outline" size="sm" onClick={handleStripeConnect} disabled={connectLoading} className="gap-1.5">
                    {connectLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ExternalLink className="h-3.5 w-3.5" />}
                    Gerer
                  </Button>
                </div>
              ) : (
                <Button onClick={handleStripeConnect} disabled={connectLoading} variant="outline" className="w-full gap-2">
                  {connectLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <CreditCard className="h-4 w-4" />}
                  {connectLoading ? "Redirection..." : "Connecter mon compte Stripe"}
                </Button>
              )}
            </div>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}
