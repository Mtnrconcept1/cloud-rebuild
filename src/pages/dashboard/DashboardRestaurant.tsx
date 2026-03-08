import { useState, useEffect } from "react";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
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

export default function DashboardRestaurant() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({ name: "", description: "", address: "", city: "", phone: "", cuisine_type: "", image_url: "", delivery_available: false, delivery_fee: 0, min_order_amount: 0 });

  const { data: restaurant } = useQuery({
    queryKey: ["my-restaurant", user?.id],
    queryFn: async () => {
      const { data } = await supabase.from("restaurants").select("*").eq("owner_id", user!.id).maybeSingle();
      return data;
    },
    enabled: !!user,
  });

  useEffect(() => {
    if (restaurant) {
      setForm({
        name: restaurant.name, description: restaurant.description || "", address: restaurant.address, city: restaurant.city,
        phone: restaurant.phone || "", cuisine_type: restaurant.cuisine_type || "", image_url: restaurant.image_url || "",
        delivery_available: restaurant.delivery_available || false, delivery_fee: Number(restaurant.delivery_fee) || 0, min_order_amount: Number(restaurant.min_order_amount) || 0,
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
          <Button onClick={handleSave} disabled={loading}>{loading ? "Enregistrement..." : "Sauvegarder"}</Button>
        </div>
      </div>
    </DashboardLayout>
  );
}
