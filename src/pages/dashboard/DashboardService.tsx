import { useState, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Clock, Settings, Store } from "lucide-react";

const DAYS = [
  { key: "monday", label: "Lundi" },
  { key: "tuesday", label: "Mardi" },
  { key: "wednesday", label: "Mercredi" },
  { key: "thursday", label: "Jeudi" },
  { key: "friday", label: "Vendredi" },
  { key: "saturday", label: "Samedi" },
  { key: "sunday", label: "Dimanche" },
];

type DaySchedule = { open: boolean; start: string; end: string };
type Schedule = Record<string, DaySchedule>;

const DEFAULT_SCHEDULE: Schedule = Object.fromEntries(
  DAYS.map(d => [d.key, { open: true, start: "11:30", end: "22:30" }])
);

export default function DashboardService() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: restaurant } = useQuery({
    queryKey: ["my-restaurant-service", user?.id],
    queryFn: async () => {
      const { data } = await supabase.from("restaurants").select("*").eq("owner_id", user!.id).maybeSingle();
      return data;
    },
    enabled: !!user,
  });

  const [schedule, setSchedule] = useState<Schedule>(DEFAULT_SCHEDULE);
  const [deliveryAvailable, setDeliveryAvailable] = useState(false);
  const [deliveryFee, setDeliveryFee] = useState("0");
  const [minOrder, setMinOrder] = useState("0");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (restaurant) {
      setDeliveryAvailable(!!restaurant.delivery_available);
      setDeliveryFee(restaurant.delivery_fee?.toString() || "0");
      setMinOrder(restaurant.min_order_amount?.toString() || "0");
      if (restaurant.opening_hours && typeof restaurant.opening_hours === "object") {
        setSchedule({ ...DEFAULT_SCHEDULE, ...(restaurant.opening_hours as Schedule) });
      }
    }
  }, [restaurant]);

  const updateDay = (day: string, field: keyof DaySchedule, value: any) => {
    setSchedule(prev => ({ ...prev, [day]: { ...prev[day], [field]: value } }));
  };

  const handleSave = async () => {
    if (!restaurant) return;
    setLoading(true);
    const { error } = await supabase.from("restaurants").update({
      opening_hours: schedule as any,
      delivery_available: deliveryAvailable,
      delivery_fee: Number(deliveryFee),
      min_order_amount: Number(minOrder),
    }).eq("id", restaurant.id);
    setLoading(false);
    if (error) {
      toast({ title: "Erreur", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Paramètres enregistrés" });
      queryClient.invalidateQueries({ queryKey: ["my-restaurant-service"] });
    }
  };

  if (!restaurant) return <DashboardLayout><div className="flex items-center justify-center py-20"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" /></div></DashboardLayout>;

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <Settings className="h-6 w-6 text-primary" />
          <h1 className="font-display text-3xl font-bold">Pilotage de service</h1>
        </div>

        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><Clock className="h-5 w-5" /> Horaires d'ouverture</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {DAYS.map(day => (
              <div key={day.key} className="flex items-center gap-4">
                <div className="w-24 text-sm font-medium">{day.label}</div>
                <Switch checked={schedule[day.key]?.open ?? true} onCheckedChange={v => updateDay(day.key, "open", v)} />
                {schedule[day.key]?.open && (
                  <>
                    <Input type="time" value={schedule[day.key]?.start || "11:30"} onChange={e => updateDay(day.key, "start", e.target.value)} className="w-28" />
                    <span className="text-muted-foreground">–</span>
                    <Input type="time" value={schedule[day.key]?.end || "22:30"} onChange={e => updateDay(day.key, "end", e.target.value)} className="w-28" />
                  </>
                )}
                {!schedule[day.key]?.open && <span className="text-sm text-muted-foreground">Fermé</span>}
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><Store className="h-5 w-5" /> Livraison</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-3">
              <Switch checked={deliveryAvailable} onCheckedChange={setDeliveryAvailable} />
              <Label>Livraison disponible</Label>
            </div>
            {deliveryAvailable && (
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Frais de livraison (CHF)</Label>
                  <Input type="number" step="0.01" value={deliveryFee} onChange={e => setDeliveryFee(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>Commande minimum (CHF)</Label>
                  <Input type="number" step="0.01" value={minOrder} onChange={e => setMinOrder(e.target.value)} />
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <Button onClick={handleSave} disabled={loading} size="lg">
          {loading ? "Enregistrement..." : "Sauvegarder les paramètres"}
        </Button>
      </div>
    </DashboardLayout>
  );
}