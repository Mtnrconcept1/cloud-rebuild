import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import ImageUpload from "@/components/ImageUpload";
import AddressAutocomplete from "@/components/AddressAutocomplete";
import { useDashboardRestaurant } from "./DashboardContext";
import { CreditCard, CheckCircle2, ExternalLink, Loader2 } from "lucide-react";

export default function DashboardRestaurant() {
  const { user } = useAuth();
  const { selectedId } = useDashboardRestaurant();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [loading, setLoading] = useState(false);
  const [connectLoading, setConnectLoading] = useState(false);
  const [form, setForm] = useState({ name: "", description: "", address: "", city: "", phone: "", cuisine_type: "", image_url: "", delivery_available: false, delivery_fee: 0, min_order_amount: 0, supports_pickup: false, supports_dinein: false, supports_reservation: false });

  const { data: restaurant } = useQuery({
    queryKey: ["my-restaurant", selectedId],
    queryFn: async () => {
      const { data } = await supabase.from("restaurants").select("*").eq("id", selectedId!).single();
      return data;
    },
    enabled: !!selectedId,
  });

  useEffect(() => {
    if (restaurant) {
      setForm({
        name: restaurant.name, description: restaurant.description || "", address: restaurant.address, city: restaurant.city,
        phone: restaurant.phone || "", cuisine_type: restaurant.cuisine_type || "", image_url: restaurant.image_url || "",
        delivery_available: restaurant.delivery_available || false, delivery_fee: Number(restaurant.delivery_fee) || 0, min_order_amount: Number(restaurant.min_order_amount) || 0,
        supports_pickup: restaurant.supports_pickup || false, supports_dinein: restaurant.supports_dinein || false, supports_reservation: restaurant.supports_reservation || false,
      });
    }
  }, [restaurant]);

  const handleSave = async () => {
    if (!user) return;
    setLoading(true);
    if (restaurant) {
      const { error } = await supabase.from("restaurants").update(form).eq("id", restaurant.id);
      if (error) toast({ title: "Erreur", description: error.message, variant: "destructive" });
      else toast({ title: "Restaurant mis à jour !" });
    } else {
      const { error } = await supabase.from("restaurants").insert({ ...form, owner_id: user.id });
      if (error) toast({ title: "Erreur", description: error.message, variant: "destructive" });
      else toast({ title: "Restaurant créé !" });
    }
    setLoading(false);
    queryClient.invalidateQueries({ queryKey: ["my-restaurant"] });
    queryClient.invalidateQueries({ queryKey: ["owner-restaurants"] });
  };

  const handleStripeConnect = async () => {
    if (!restaurant) return;
    setConnectLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const resp = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/stripe-connect-onboard`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session?.access_token}`,
          },
          body: JSON.stringify({
            restaurant_id: restaurant.id,
            return_url: window.location.href,
          }),
        }
      );
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || "Erreur");
      window.location.href = data.url;
    } catch (e: any) {
      toast({ title: "Erreur", description: e.message, variant: "destructive" });
      setConnectLoading(false);
    }
  };

  return (
    <DashboardLayout>
      <div className="max-w-2xl space-y-6">
        <h1 className="font-display text-3xl font-bold">{restaurant ? "Mon restaurant" : "Créer mon restaurant"}</h1>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2"><Label>Nom</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required /></div>
            <div className="space-y-2"><Label>Type de cuisine</Label><Input value={form.cuisine_type} onChange={(e) => setForm({ ...form, cuisine_type: e.target.value })} /></div>
          </div>
          <div className="space-y-2"><Label>Description</Label><Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
          <div className="space-y-2">
            <Label>Adresse</Label>
            <AddressAutocomplete value={form.address} onAddressSelect={(address, city) => { setForm(prev => ({ ...prev, address, city: city || prev.city })); }} placeholder="Adresse du restaurant" />
          </div>
          <div className="space-y-2"><Label>Téléphone</Label><Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
          <ImageUpload label="Photo du restaurant" value={form.image_url} onChange={(url) => setForm({ ...form, image_url: url })} />
          <div className="flex items-center gap-4 pt-2">
            <div className="flex items-center gap-2">
              <Switch checked={form.delivery_available} onCheckedChange={(c) => setForm({ ...form, delivery_available: c })} />
              <Label>Livraison disponible</Label>
            </div>
          </div>
          {form.delivery_available && (
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2"><Label>Frais de livraison (CHF)</Label><Input type="number" step="0.01" value={form.delivery_fee} onChange={(e) => setForm({ ...form, delivery_fee: Number(e.target.value) })} /></div>
              <div className="space-y-2"><Label>Commande minimum (CHF)</Label><Input type="number" step="0.01" value={form.min_order_amount} onChange={(e) => setForm({ ...form, min_order_amount: Number(e.target.value) })} /></div>
            </div>
          )}

          <div className="border-t pt-4 mt-6">
            <h3 className="font-semibold mb-4">Modes de consommation alternatifs</h3>
            <div className="grid sm:grid-cols-3 gap-4">
              <div className="flex items-center gap-2">
                <Switch checked={form.supports_pickup} onCheckedChange={(c) => setForm({ ...form, supports_pickup: c })} />
                <Label>À emporter (Click & Collect)</Label>
              </div>
              <div className="flex items-center gap-2">
                <Switch checked={form.supports_dinein} onCheckedChange={(c) => setForm({ ...form, supports_dinein: c })} />
                <Label>Sur place (Dine-in)</Label>
              </div>
              <div className="flex items-center gap-2">
                <Switch checked={form.supports_reservation} onCheckedChange={(c) => setForm({ ...form, supports_reservation: c })} />
                <Label>Réservation de table</Label>
              </div>
            </div>
          </div>
          <Button onClick={handleSave} disabled={loading} className="w-full mt-8">{loading ? "Enregistrement..." : "Sauvegarder"}</Button>

          {restaurant && (
            <div className="border-t pt-4 mt-6">
              <h3 className="font-semibold mb-4 flex items-center gap-2"><CreditCard className="h-5 w-5" /> Paiements Stripe Connect</h3>
              <p className="text-sm text-muted-foreground mb-4">Connectez votre compte Stripe pour recevoir les paiements directement sur votre compte bancaire.</p>
              {(restaurant as any).stripe_account_id ? (
                <div className="flex items-center gap-3 p-4 rounded-xl bg-green-50 border border-green-200">
                  <CheckCircle2 className="h-5 w-5 text-green-600 shrink-0" />
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-green-800">Compte Stripe connecté</p>
                    <p className="text-xs text-green-600 font-mono">{(restaurant as any).stripe_account_id}</p>
                  </div>
                  <Button variant="outline" size="sm" onClick={handleStripeConnect} disabled={connectLoading} className="gap-1.5">
                    {connectLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ExternalLink className="h-3.5 w-3.5" />}
                    Gérer
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
