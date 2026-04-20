import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getSupabase } from "@/integrations/supabase/client";
import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Clock, Settings, Store, SunMedium, MoonStar } from "lucide-react";
import { useActiveFeatures } from "@/lib/featureFlags";
import { useDashboardRestaurant } from "./DashboardContext";
import {
  DEFAULT_SERVICE_SETTINGS,
  getServicePeriodLabel,
  getServiceSettings,
  mergeOpeningHoursWithServiceSettings,
  type ServicePeriod,
  type ServiceSettings,
  type ServiceSettingsMap,
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
    description: "Parametres de reservation et capacite pour le service du midi.",
  },
  {
    key: "dinner",
    icon: MoonStar,
    description: "Parametres de reservation et capacite pour le service du soir.",
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
        <div className="space-y-2">
          <div className="flex items-center gap-3">
            <Settings className="h-6 w-6 text-primary" />
            <h1 className="font-display text-3xl font-bold">Pilotage de service</h1>
          </div>
          <p className="text-sm text-muted-foreground">
            Scindez distinctement le service du midi et le service du soir pour les reservations.
          </p>
          {!reservationEnabled ? (
            <p className="text-sm text-muted-foreground">
              Les reservations sont actuellement coupees globalement. Les reglages ci-dessous restent editables mais ne
              seront pas exposes cote client tant que le flag global reste desactive.
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
                      <Label>Derniere reservation</Label>
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
              La livraison est desactivee par l'administration globale. Le pilotage reste centre sur les services de reservation.
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
            <p>Le split midi/soir est maintenant partage avec le module de reservation client.</p>
            <p>La capacite, les plages horaires et l'ouverture en ligne sont gerees separément par service.</p>
          </CardContent>
        </Card>

        <Button onClick={handleSave} disabled={loading} size="lg">
          {loading ? "Enregistrement..." : "Sauvegarder les parametres"}
        </Button>
      </div>
    </DashboardLayout>
  );
}
