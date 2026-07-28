import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getSupabase } from "@/integrations/supabase/client";
import DashboardLayout from "@/components/DashboardLayout";
import { useCommercialDemoFrame } from "@/components/commercial/CommercialDemoFrameProvider";
import DashboardPageHero from "@/components/dashboard/DashboardPageHero";
import { DASHBOARD_ILLUSTRATIONS } from "@/lib/dashboardIllustrations";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useToast } from "@/hooks/use-toast";
import { ChevronDown, Clock, MoonStar, Plus, Settings, Store, SunMedium, Trash2 } from "lucide-react";
import { useActiveFeatures } from "@/lib/featureFlags";
import { useDashboardRestaurant } from "./useDashboardRestaurant";
import {
  readCommercialDemoToolState,
  writeCommercialDemoToolState,
} from "@/lib/commercialDemoRestaurantTools";
import {
  DEFAULT_SERVICE_SETTINGS,
  getServicePeriodLabel,
  getServiceSettings,
  mergeOpeningHoursWithServiceSettings,
  type ServicePeriod,
  type ServiceSettings,
  type ServiceSettingsMap,
  type ServiceSlotCapacityWindow,
  validateServiceSettings,
} from "@/lib/serviceSettings";

const supabase = getSupabase();

const SERVICE_PERIODS: Array<{
  key: ServicePeriod;
  icon: typeof SunMedium;
  description: string;
}> = [
  {
    key: "lunch",
    icon: SunMedium,
    description: "Paramètres de réservation et capacité pour le service du midi.",
  },
  {
    key: "dinner",
    icon: MoonStar,
    description: "Paramètres de réservation et capacité pour le service du soir.",
  },
];

export default function DashboardService() {
  const { selectedId } = useDashboardRestaurant();
  const commercialDemoFrame = useCommercialDemoFrame();
  const isCommercialDemo = commercialDemoFrame?.surface === "restaurant";
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const activeFeatures = useActiveFeatures();
  const deliveryEnabled = activeFeatures.has("livraison");
  const reservationEnabled = activeFeatures.has("reservation");

  const { data: restaurant } = useQuery({
    queryKey: ["my-restaurant-service", selectedId, isCommercialDemo ? commercialDemoFrame.config.sessionId : "live"],
    queryFn: async () => {
      if (isCommercialDemo) {
        const snapshotRestaurant = commercialDemoFrame.snapshot.demo_restaurant;
        return readCommercialDemoToolState(
          commercialDemoFrame.config.sessionId,
          "service-settings",
          {
            ...snapshotRestaurant,
            opening_hours: null,
            is_active: true,
          },
        );
      }
      const { data, error } = await supabase.from("restaurants").select("*").eq("id", selectedId!).single();
      if (error) throw error;
      return data;
    },
    enabled: !!selectedId,
  });

  const [serviceSettings, setServiceSettings] = useState<ServiceSettingsMap>(DEFAULT_SERVICE_SETTINGS);
  const [deliveryAvailable, setDeliveryAvailable] = useState(false);
  const [deliveryFee, setDeliveryFee] = useState("0");
  const [minOrder, setMinOrder] = useState("0");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!restaurant) return;
    setDeliveryAvailable(!!restaurant.delivery_available);
    setDeliveryFee(restaurant.delivery_fee?.toString() || "0");
    setMinOrder(restaurant.min_order_amount?.toString() || "0");
    setServiceSettings(getServiceSettings(restaurant.opening_hours));
  }, [restaurant]);

  const updateServiceField = <K extends keyof ServiceSettings>(
    period: ServicePeriod,
    field: K,
    value: ServiceSettings[K],
  ) => {
    setServiceSettings((current) => ({
      ...current,
      [period]: {
        ...current[period],
        [field]: value,
      },
    }));
  };

  const updateCapacityWindow = <K extends keyof ServiceSlotCapacityWindow>(
    period: ServicePeriod,
    index: number,
    field: K,
    value: ServiceSlotCapacityWindow[K],
  ) => {
    setServiceSettings((current) => {
      const windows = [...current[period].slot_capacity_windows];
      windows[index] = { ...windows[index], [field]: value };
      return {
        ...current,
        [period]: {
          ...current[period],
          slot_capacity_windows: windows,
        },
      };
    });
  };

  const addCapacityWindow = (period: ServicePeriod) => {
    setServiceSettings((current) => ({
      ...current,
      [period]: {
        ...current[period],
        slot_capacity_windows: [
          ...current[period].slot_capacity_windows,
          {
            start_time: current[period].start_time,
            end_time: current[period].last_reservation_time,
            max_tables: current[period].max_tables_per_slot,
          },
        ],
      },
    }));
  };

  const removeCapacityWindow = (period: ServicePeriod, index: number) => {
    setServiceSettings((current) => {
      const windows = current[period].slot_capacity_windows.filter((_, currentIndex) => currentIndex !== index);
      return {
        ...current,
        [period]: {
          ...current[period],
          slot_capacity_windows: windows.length > 0
            ? windows
            : [{
              start_time: current[period].start_time,
              end_time: current[period].last_reservation_time,
              max_tables: current[period].max_tables_per_slot,
            }],
        },
      };
    });
  };

  const handleSave = async () => {
    if (!restaurant) return;

    for (const period of SERVICE_PERIODS) {
      const validationError = validateServiceSettings(serviceSettings[period.key]);
      if (validationError) {
        toast({
          title: `${getServicePeriodLabel(period.key)} invalide`,
          description: validationError,
          variant: "destructive",
        });
        return;
      }
    }

    setLoading(true);
    const openingHours = mergeOpeningHoursWithServiceSettings(restaurant.opening_hours, serviceSettings);
    if (isCommercialDemo && commercialDemoFrame) {
      const nextRestaurant = {
        ...restaurant,
        opening_hours: openingHours,
        delivery_available: deliveryAvailable,
        delivery_fee: Number(deliveryFee),
        min_order_amount: Number(minOrder),
        is_active: true,
      };
      writeCommercialDemoToolState(
        commercialDemoFrame.config.sessionId,
        "service-settings",
        nextRestaurant,
      );
      queryClient.setQueryData(
        ["my-restaurant-service", selectedId, commercialDemoFrame.config.sessionId],
        nextRestaurant,
      );
      setLoading(false);
      toast({
        title: "Services enregistrés",
        description: "Les réglages sont appliqués au restaurant Démo actif.",
      });
      return;
    }
    const { error } = await supabase
      .from("restaurants")
      .update({
        opening_hours: openingHours as any,
        delivery_available: deliveryAvailable,
        delivery_fee: Number(deliveryFee),
        min_order_amount: Number(minOrder),
      })
      .eq("id", restaurant.id);
    setLoading(false);

    if (error) {
      toast({ title: "Erreur", description: error.message, variant: "destructive" });
      return;
    }

    toast({ title: "Services enregistres" });
    queryClient.invalidateQueries({ queryKey: ["my-restaurant-service", selectedId] });
    queryClient.invalidateQueries({ queryKey: ["restaurant-service-settings", restaurant.id] });
  };

  if (!restaurant) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center py-20">
          <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-primary" />
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-4">
        <DashboardPageHero
          badge="Services restaurant"
          title="Pilotage de service"
          description="Réglez rapidement le midi et le soir. Les paramètres avancés restent accessibles sans allonger la lecture quotidienne."
          icon={Settings}
          tone="amber"
          visualLabel="Service"
          compact
          illustration={DASHBOARD_ILLUSTRATIONS.restaurantService}
          stats={[
            { label: "Midi", value: serviceSettings.lunch.service_closed ? "Fermé" : "Actif", icon: SunMedium },
            { label: "Soir", value: serviceSettings.dinner.service_closed ? "Fermé" : "Actif", icon: MoonStar },
            { label: "Livraison", value: deliveryAvailable ? "Activée" : "Coupée", icon: Store },
          ]}
        />

        {!reservationEnabled ? (
          <p className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-400/20 dark:bg-amber-500/10 dark:text-amber-100">
            Les réservations sont actuellement coupées globalement. Ces réglages restent modifiables, mais ne seront pas
            visibles côté client tant que le module reste désactivé.
          </p>
        ) : null}

        <div className="grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(min(26rem,100%),1fr))]">
          {SERVICE_PERIODS.map((period) => {
            const settings = serviceSettings[period.key];
            const Icon = period.icon;

            return (
              <Card key={period.key} className="min-w-0">
                <CardHeader className="space-y-2 pb-3">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <CardTitle className="flex items-center gap-2">
                      <Icon className="h-5 w-5" />
                      Service {getServicePeriodLabel(period.key).toLowerCase()}
                    </CardTitle>
                    <Badge variant={settings.service_closed ? "secondary" : "default"}>
                      {settings.service_closed ? "Fermé" : "Actif"}
                    </Badge>
                  </div>
                  <p className="text-sm text-muted-foreground">{period.description}</p>
                </CardHeader>

                <CardContent className="space-y-4">
                  <div className="grid gap-3 min-[420px]:grid-cols-2">
                    <label className="flex min-h-11 items-center justify-between gap-3 rounded-xl border px-3 py-2 text-sm">
                      <span>Réservations en ligne</span>
                      <Switch
                        checked={reservationEnabled && settings.online_booking_enabled}
                        disabled={!reservationEnabled}
                        onCheckedChange={(checked) => updateServiceField(period.key, "online_booking_enabled", checked)}
                      />
                    </label>
                    <label className="flex min-h-11 items-center justify-between gap-3 rounded-xl border px-3 py-2 text-sm">
                      <span>Service fermé</span>
                      <Switch
                        checked={settings.service_closed}
                        onCheckedChange={(checked) => updateServiceField(period.key, "service_closed", checked)}
                      />
                    </label>
                  </div>

                  <section className="space-y-3 rounded-2xl border bg-muted/15 p-3">
                    <div>
                      <p className="text-sm font-semibold">Horaires et capacité</p>
                      <p className="text-xs text-muted-foreground">Les informations indispensables restent toujours visibles.</p>
                    </div>
                    <div className="grid gap-3 min-[420px]:grid-cols-2">
                      <div className="space-y-2">
                        <Label>Début</Label>
                        <Input
                          type="time"
                          value={settings.start_time}
                          onChange={(event) => updateServiceField(period.key, "start_time", event.target.value)}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Fin</Label>
                        <Input
                          type="time"
                          value={settings.end_time}
                          onChange={(event) => updateServiceField(period.key, "end_time", event.target.value)}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Dernière réservation</Label>
                        <Input
                          type="time"
                          value={settings.last_reservation_time}
                          onChange={(event) => updateServiceField(period.key, "last_reservation_time", event.target.value)}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Capacité max</Label>
                        <Input
                          type="number"
                          min={1}
                          value={settings.max_covers}
                          onChange={(event) => updateServiceField(period.key, "max_covers", Number(event.target.value))}
                        />
                      </div>
                    </div>
                  </section>

                  <section className="space-y-3 rounded-2xl border bg-muted/15 p-3">
                    <div>
                      <p className="text-sm font-semibold">Commandes, retrait et livraison</p>
                      <p className="text-xs text-muted-foreground">Créneaux proposés au panier pour ce service.</p>
                    </div>
                    <div className="grid gap-3 min-[420px]:grid-cols-2">
                      <div className="space-y-2">
                        <Label>Début commandes</Label>
                        <Input
                          type="time"
                          value={settings.order_start_time}
                          onChange={(event) => updateServiceField(period.key, "order_start_time", event.target.value)}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Fin commandes</Label>
                        <Input
                          type="time"
                          value={settings.order_end_time}
                          onChange={(event) => updateServiceField(period.key, "order_end_time", event.target.value)}
                        />
                      </div>
                      <label className="flex min-h-11 items-center justify-between gap-3 rounded-xl border bg-background px-3 py-2 text-sm">
                        <span>Commandes en ligne</span>
                        <Switch
                          checked={settings.online_ordering_enabled && !settings.orders_closed}
                          onCheckedChange={(checked) => {
                            updateServiceField(period.key, "online_ordering_enabled", checked);
                            if (checked) updateServiceField(period.key, "orders_closed", false);
                          }}
                        />
                      </label>
                      <label className="flex min-h-11 items-center justify-between gap-3 rounded-xl border bg-background px-3 py-2 text-sm">
                        <span>Suspendre les commandes</span>
                        <Switch
                          checked={settings.orders_closed}
                          onCheckedChange={(checked) => {
                            updateServiceField(period.key, "orders_closed", checked);
                            if (checked) updateServiceField(period.key, "online_ordering_enabled", false);
                          }}
                        />
                      </label>
                    </div>
                  </section>

                  <Collapsible className="rounded-2xl border bg-background">
                    <CollapsibleTrigger asChild>
                      <Button
                        type="button"
                        variant="ghost"
                        className="h-auto w-full justify-between gap-3 rounded-2xl px-3 py-3 text-left [&[data-state=open]>svg]:rotate-180"
                      >
                        <span className="min-w-0">
                          <span className="block text-sm font-semibold">Réglages avancés</span>
                          <span className="block truncate text-xs font-normal text-muted-foreground">
                            Groupes {settings.min_party_size}–{settings.max_party_size} · {settings.slot_interval_minutes} min · {settings.slot_capacity_windows.length} plage(s)
                          </span>
                        </span>
                        <ChevronDown className="h-4 w-4 shrink-0 transition-transform" />
                      </Button>
                    </CollapsibleTrigger>

                    <CollapsibleContent className="space-y-4 px-3 pb-3">
                      <div className="grid gap-3 min-[420px]:grid-cols-2">
                        <div className="space-y-2">
                          <Label>Groupe minimum</Label>
                          <Input
                            type="number"
                            min={1}
                            value={settings.min_party_size}
                            onChange={(event) => updateServiceField(period.key, "min_party_size", Number(event.target.value))}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>Groupe maximum</Label>
                          <Input
                            type="number"
                            min={1}
                            value={settings.max_party_size}
                            onChange={(event) => updateServiceField(period.key, "max_party_size", Number(event.target.value))}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>Intervalle des créneaux (minutes)</Label>
                          <Input
                            type="number"
                            min={5}
                            step={5}
                            value={settings.slot_interval_minutes}
                            onChange={(event) => updateServiceField(period.key, "slot_interval_minutes", Number(event.target.value))}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>Tables par défaut</Label>
                          <Input
                            type="number"
                            min={1}
                            value={settings.max_tables_per_slot}
                            onChange={(event) => updateServiceField(period.key, "max_tables_per_slot", Number(event.target.value))}
                          />
                        </div>
                      </div>

                      <div className="space-y-3 rounded-xl border bg-muted/15 p-3">
                        <div className="flex flex-col gap-2 min-[420px]:flex-row min-[420px]:items-start min-[420px]:justify-between">
                          <div>
                            <p className="text-sm font-semibold">Tables disponibles par créneau</p>
                            <p className="text-xs text-muted-foreground">Ajoutez seulement les plages qui dérogent à la valeur par défaut.</p>
                          </div>
                          <Button type="button" variant="outline" size="sm" onClick={() => addCapacityWindow(period.key)}>
                            <Plus className="mr-2 h-4 w-4" />
                            Ajouter
                          </Button>
                        </div>

                        <div className="space-y-2">
                          {settings.slot_capacity_windows.map((window, index) => (
                            <div key={period.key + "-" + index} className="space-y-2 rounded-xl border bg-background p-3">
                              <div className="grid gap-2 [grid-template-columns:repeat(auto-fit,minmax(min(8rem,100%),1fr))]">
                                <div className="space-y-2">
                                  <Label>De</Label>
                                  <Input
                                    type="time"
                                    value={window.start_time}
                                    onChange={(event) => updateCapacityWindow(period.key, index, "start_time", event.target.value)}
                                  />
                                </div>
                                <div className="space-y-2">
                                  <Label>À</Label>
                                  <Input
                                    type="time"
                                    value={window.end_time}
                                    onChange={(event) => updateCapacityWindow(period.key, index, "end_time", event.target.value)}
                                  />
                                </div>
                                <div className="space-y-2">
                                  <Label>Tables</Label>
                                  <Input
                                    type="number"
                                    min={1}
                                    value={window.max_tables}
                                    onChange={(event) => updateCapacityWindow(period.key, index, "max_tables", Number(event.target.value))}
                                  />
                                </div>
                              </div>
                              <div className="flex justify-end">
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => removeCapacityWindow(period.key, index)}
                                  aria-label="Supprimer cette plage"
                                >
                                  <Trash2 className="mr-2 h-4 w-4" />
                                  Supprimer
                                </Button>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>

                      <div className="space-y-3 rounded-xl border bg-muted/15 p-3">
                        <div>
                          <p className="text-sm font-semibold">Confirmation et acompte</p>
                          <p className="text-xs text-muted-foreground">Options de validation de la réservation client.</p>
                        </div>
                        <label className="flex min-h-11 items-center justify-between gap-3 rounded-xl border bg-background px-3 py-2 text-sm">
                          <span>Confirmation restaurant requise</span>
                          <Switch
                            checked={settings.restaurant_confirmation_required}
                            onCheckedChange={(checked) => updateServiceField(period.key, "restaurant_confirmation_required", checked)}
                          />
                        </label>
                        <div className="grid gap-3 min-[420px]:grid-cols-2">
                          <div className="space-y-2">
                            <Label>Délai de confirmation (minutes)</Label>
                            <Input
                              type="number"
                              min={1}
                              max={240}
                              value={settings.confirmation_deadline_minutes}
                              onChange={(event) => updateServiceField(period.key, "confirmation_deadline_minutes", Number(event.target.value))}
                            />
                          </div>
                          <div className="space-y-2">
                            <Label>Acompte optionnel (CHF)</Label>
                            <Input
                              type="number"
                              min={0}
                              step="0.50"
                              value={settings.deposit_amount_chf}
                              onChange={(event) => updateServiceField(period.key, "deposit_amount_chf", Number(event.target.value))}
                            />
                          </div>
                        </div>
                      </div>

                      <div className="space-y-2">
                        <Label>Note de service</Label>
                        <Input
                          value={settings.service_note}
                          onChange={(event) => updateServiceField(period.key, "service_note", event.target.value)}
                          placeholder={period.key === "lunch" ? "Ex : Dernier service à 14 h 30" : "Ex : Service complet les samedis"}
                        />
                      </div>
                    </CollapsibleContent>
                  </Collapsible>
                </CardContent>
              </Card>
            );
          })}
        </div>

        <div className="grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(min(20rem,100%),1fr))]">
          <Card className="min-w-0">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2">
                <Clock className="h-5 w-5" />
                Livraison
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {deliveryEnabled ? (
                <>
                  <label className="flex min-h-11 items-center justify-between gap-3 rounded-xl border px-3 py-2 text-sm">
                    <span>Livraison disponible</span>
                    <Switch checked={deliveryAvailable} onCheckedChange={setDeliveryAvailable} />
                  </label>
                  {deliveryAvailable ? (
                    <div className="grid gap-3 min-[420px]:grid-cols-2">
                      <div className="space-y-2">
                        <Label>Frais de livraison (CHF)</Label>
                        <Input type="number" step="0.01" value={deliveryFee} onChange={(event) => setDeliveryFee(event.target.value)} />
                      </div>
                      <div className="space-y-2">
                        <Label>Commande minimum (CHF)</Label>
                        <Input type="number" step="0.01" value={minOrder} onChange={(event) => setMinOrder(event.target.value)} />
                      </div>
                    </div>
                  ) : null}
                </>
              ) : (
                <p className="text-sm text-muted-foreground">
                  La livraison est désactivée globalement. Le pilotage reste centré sur les services de réservation.
                </p>
              )}
            </CardContent>
          </Card>

          <Card className="min-w-0">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2">
                <Store className="h-5 w-5" />
                Lecture du dashboard
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-1 text-sm text-muted-foreground">
              <p>Le midi et le soir alimentent séparément le module de réservation client.</p>
              <p>Capacité, créneaux et ouverture en ligne sont réglables indépendamment.</p>
            </CardContent>
          </Card>
        </div>

        <div className="flex justify-end">
          <Button onClick={handleSave} disabled={loading} size="lg">
            {loading ? "Enregistrement..." : "Sauvegarder les paramètres"}
          </Button>
        </div>
      </div>
    </DashboardLayout>
  );
}
