import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getSupabase } from "@/integrations/supabase/client";
import DashboardLayout from "@/components/DashboardLayout";
import DashboardPageHero from "@/components/dashboard/DashboardPageHero";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Clock, MoonStar, Plus, Settings, Store, SunMedium, Trash2 } from "lucide-react";
import { useActiveFeatures } from "@/lib/featureFlags";
import { useDashboardRestaurant } from "./useDashboardRestaurant";
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
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const activeFeatures = useActiveFeatures();
  const deliveryEnabled = activeFeatures.has("livraison");
  const reservationEnabled = activeFeatures.has("reservation");

  const { data: restaurant } = useQuery({
    queryKey: ["my-restaurant-service", selectedId],
    queryFn: async () => {
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
      <div className="space-y-6">
        <DashboardPageHero
          badge="Services restaurant"
          title="Pilotage de service"
          description="Scindez distinctement le service du midi et le service du soir pour les réservations, la capacité et les options de livraison."
          icon={Settings}
          tone="amber"
          visualLabel="Service"
          stats={[
            { label: "Midi", value: serviceSettings.lunch.service_closed ? "Ferme" : "Actif", icon: SunMedium },
            { label: "Soir", value: serviceSettings.dinner.service_closed ? "Ferme" : "Actif", icon: MoonStar },
            { label: "Livraison", value: deliveryAvailable ? "Active" : "Coupee", icon: Store },
          ]}
        />
        <div className="space-y-2">
          {!reservationEnabled ? (
            <p className="text-sm text-muted-foreground">
              Les réservations sont actuellement coupees globalement. Les reglages ci-dessous restent editables mais ne
              seront pas exposés côté client tant que le flag global reste désactivé.
            </p>
          ) : null}
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          {SERVICE_PERIODS.map((period) => {
            const settings = serviceSettings[period.key];
            const Icon = period.icon;
            return (
              <Card key={period.key}>
                <CardHeader>
                  <div className="flex items-center justify-between gap-3">
                    <CardTitle className="flex items-center gap-2">
                      <Icon className="h-5 w-5" />
                      Service {getServicePeriodLabel(period.key).toLowerCase()}
                    </CardTitle>
                    <Badge variant={settings.service_closed ? "secondary" : "default"}>
                      {settings.service_closed ? "Ferme" : "Actif"}
                    </Badge>
                  </div>
                  <p className="text-sm text-muted-foreground">{period.description}</p>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid gap-4 sm:grid-cols-3">
                    <div className="space-y-2">
                      <Label>Debut</Label>
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
                      <Label>Derniere réservation</Label>
                      <Input
                        type="time"
                        value={settings.last_reservation_time}
                        onChange={(event) => updateServiceField(period.key, "last_reservation_time", event.target.value)}
                      />
                    </div>
                  </div>

                  <div className="grid gap-4 sm:grid-cols-3">
                    <div className="space-y-2">
                      <Label>Capacite max</Label>
                      <Input
                        type="number"
                        min={1}
                        value={settings.max_covers}
                        onChange={(event) => updateServiceField(period.key, "max_covers", Number(event.target.value))}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Groupe min</Label>
                      <Input
                        type="number"
                        min={1}
                        value={settings.min_party_size}
                        onChange={(event) => updateServiceField(period.key, "min_party_size", Number(event.target.value))}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Groupe max</Label>
                      <Input
                        type="number"
                        min={1}
                        value={settings.max_party_size}
                        onChange={(event) => updateServiceField(period.key, "max_party_size", Number(event.target.value))}
                      />
                    </div>
                  </div>

                  <div className="space-y-3 rounded-xl border bg-muted/20 p-3">
                    <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <p className="text-sm font-semibold">Tables disponibles par créneau</p>
                        <p className="text-xs text-muted-foreground">
                          Exemple : 10 tables entre 19:00 et 23:00. Quand la limite est atteinte, le créneau devient complet.
                        </p>
                      </div>
                      <Button type="button" variant="outline" size="sm" onClick={() => addCapacityWindow(period.key)}>
                        <Plus className="h-4 w-4" />
                        Ajouter
                      </Button>
                    </div>

                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="space-y-2">
                        <Label>Intervalle des blocs</Label>
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

                    <div className="space-y-2">
                      {settings.slot_capacity_windows.map((window, index) => (
                        <div key={`${period.key}-${index}`} className="grid gap-2 rounded-lg border bg-background p-3 sm:grid-cols-[1fr_1fr_1fr_auto]">
                          <div className="space-y-2">
                            <Label>De</Label>
                            <Input
                              type="time"
                              value={window.start_time}
                              onChange={(event) => updateCapacityWindow(period.key, index, "start_time", event.target.value)}
                            />
                          </div>
                          <div className="space-y-2">
                            <Label>A</Label>
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
                          <div className="flex items-end">
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              onClick={() => removeCapacityWindow(period.key, index)}
                              aria-label="Supprimer cette plage"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="flex items-center justify-between rounded-lg border px-3 py-2 text-sm">
                      <span>Reservations en ligne</span>
                      <Switch
                        checked={reservationEnabled && settings.online_booking_enabled}
                        disabled={!reservationEnabled}
                        onCheckedChange={(checked) => updateServiceField(period.key, "online_booking_enabled", checked)}
                      />
                    </label>
                    <label className="flex items-center justify-between rounded-lg border px-3 py-2 text-sm">
                      <span>Service ferme</span>
                      <Switch
                        checked={settings.service_closed}
                        onCheckedChange={(checked) => updateServiceField(period.key, "service_closed", checked)}
                      />
                    </label>
                  </div>

                  <div className="space-y-3 rounded-xl border bg-background p-3">
                    <div>
                      <p className="text-sm font-semibold">Confirmation et acompte</p>
                      <p className="text-xs text-muted-foreground">
                        Ces reglages alimentent la reservation client et le suivi operationnel du dashboard.
                      </p>
                    </div>
                    <label className="flex items-center justify-between rounded-lg border px-3 py-2 text-sm">
                      <span>Confirmation restaurant requise</span>
                      <Switch
                        checked={settings.restaurant_confirmation_required}
                        onCheckedChange={(checked) => updateServiceField(period.key, "restaurant_confirmation_required", checked)}
                      />
                    </label>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="space-y-2">
                        <Label>Delai confirmation (minutes)</Label>
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
                      placeholder={`Ex: ${period.key === "lunch" ? "Dernier service a 14h30" : "Service complet les samedis"}`}
                    />
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>

        {deliveryEnabled ? (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Clock className="h-5 w-5" />
                Livraison
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center gap-3">
                <Switch checked={deliveryAvailable} onCheckedChange={setDeliveryAvailable} />
                <Label>Livraison disponible</Label>
              </div>
              {deliveryAvailable ? (
                <div className="grid grid-cols-2 gap-4">
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
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Clock className="h-5 w-5" />
                Livraison
              </CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              La livraison est désactivée par l'administration globale. Le pilotage reste centre sur les services de réservation.
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Store className="h-5 w-5" />
              Lecture dashboard
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground space-y-1">
            <p>Le split midi/soir est maintenant partage avec le module de réservation client.</p>
            <p>La capacité, les plages horaires et l'ouverture en ligne sont gérées séparément par service.</p>
          </CardContent>
        </Card>

        <Button onClick={handleSave} disabled={loading} size="lg">
          {loading ? "Enregistrement..." : "Sauvegarder les paramètres"}
        </Button>
      </div>
    </DashboardLayout>
  );
}
