import { FormEvent, useEffect, useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { getSupabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import { useOwnerRestaurants } from "./useOwnerRestaurants";
import { Globe, Instagram, Facebook, ExternalLink, Trash2 } from "lucide-react";

const supabase = getSupabase();

type RestaurantSocial = {
  id: string;
  name: string;
  opening_hours: Json | null;
};

type SocialLinks = {
  social_instagram?: string;
  social_facebook?: string;
  social_website?: string;
  social_tiktok?: string;
};

const getSocialLinks = (openingHours: Json | null): SocialLinks => {
  if (!openingHours || typeof openingHours !== "object" || Array.isArray(openingHours)) return {};
  const oh = openingHours as Record<string, Json>;
  return {
    social_instagram: typeof oh.social_instagram === "string" ? oh.social_instagram : undefined,
    social_facebook: typeof oh.social_facebook === "string" ? oh.social_facebook : undefined,
    social_website: typeof oh.social_website === "string" ? oh.social_website : undefined,
    social_tiktok: typeof oh.social_tiktok === "string" ? oh.social_tiktok : undefined,
  };
};

const initialForm = { restaurant_id: "", instagram: "", facebook: "", website: "", tiktok: "" };

export default function DashboardReseauxSociaux() {
  const { toast } = useToast();
  const { restaurantIds, loading: loadingRestaurants, error: restaurantError } = useOwnerRestaurants();
  const [items, setItems] = useState<RestaurantSocial[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState(initialForm);

  const load = async () => {
    if (!restaurantIds.length) { setItems([]); setLoading(false); return; }
    setLoading(true);
    const { data, error } = await supabase
      .from("restaurants")
      .select("id, name, opening_hours")
      .in("id", restaurantIds)
      .order("name");
    setError(error?.message || null);
    setItems((data || []) as RestaurantSocial[]);
    setLoading(false);
  };

  useEffect(() => {
    if (!loadingRestaurants) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadingRestaurants, restaurantIds.join(",")]);

  // When selecting a restaurant, pre-fill form
  const selectRestaurant = (id: string) => {
    const r = items.find((i) => i.id === id);
    if (!r) return setForm({ ...initialForm, restaurant_id: id });
    const links = getSocialLinks(r.opening_hours);
    setForm({
      restaurant_id: id,
      instagram: links.social_instagram || "",
      facebook: links.social_facebook || "",
      website: links.social_website || "",
      tiktok: links.social_tiktok || "",
    });
  };

  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (!form.restaurant_id) return toast({ title: "Validation", description: "Sélectionnez un restaurant.", variant: "destructive" });

    const target = items.find((i) => i.id === form.restaurant_id);
    const existingOh = (target?.opening_hours && typeof target.opening_hours === "object" && !Array.isArray(target.opening_hours))
      ? target.opening_hours as Record<string, Json>
      : {};

    const payload = {
      opening_hours: {
        ...existingOh,
        social_instagram: form.instagram.trim() || null,
        social_facebook: form.facebook.trim() || null,
        social_website: form.website.trim() || null,
        social_tiktok: form.tiktok.trim() || null,
      },
    };

    const { error } = await supabase.from("restaurants").update(payload).eq("id", form.restaurant_id);
    if (error) return toast({ title: "Erreur", description: error.message, variant: "destructive" });
    toast({ title: "Réseaux sociaux enregistrés" });
    load();
  };

  const clearSocial = async (restaurantId: string, key: string) => {
    const target = items.find((i) => i.id === restaurantId);
    const existingOh = (target?.opening_hours && typeof target.opening_hours === "object" && !Array.isArray(target.opening_hours))
      ? target.opening_hours as Record<string, Json>
      : {};
    const payload = { opening_hours: { ...existingOh, [key]: null } };
    const { error } = await supabase.from("restaurants").update(payload).eq("id", restaurantId);
    if (error) return toast({ title: "Erreur", description: error.message, variant: "destructive" });
    toast({ title: "Lien supprimé" });
    load();
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <Globe className="h-7 w-7 text-primary" />
          <h1 className="font-display text-3xl font-bold">Réseaux sociaux</h1>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Connecter vos comptes</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={save} className="space-y-4">
              <div className="space-y-2">
                <Label>Restaurant</Label>
                <select
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                  value={form.restaurant_id}
                  onChange={(e) => selectRestaurant(e.target.value)}
                >
                  <option value="">Sélectionner</option>
                  {items.map((item) => (
                    <option key={item.id} value={item.id}>{item.name}</option>
                  ))}
                </select>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label className="flex items-center gap-2"><Instagram className="h-4 w-4" /> Instagram</Label>
                  <Input placeholder="https://instagram.com/moncompte" value={form.instagram} onChange={(e) => setForm((v) => ({ ...v, instagram: e.target.value }))} />
                </div>
                <div className="space-y-2">
                  <Label className="flex items-center gap-2"><Facebook className="h-4 w-4" /> Facebook</Label>
                  <Input placeholder="https://facebook.com/mapage" value={form.facebook} onChange={(e) => setForm((v) => ({ ...v, facebook: e.target.value }))} />
                </div>
                <div className="space-y-2">
                  <Label className="flex items-center gap-2"><Globe className="h-4 w-4" /> Site web</Label>
                  <Input placeholder="https://monrestaurant.ch" value={form.website} onChange={(e) => setForm((v) => ({ ...v, website: e.target.value }))} />
                </div>
                <div className="space-y-2">
                  <Label>TikTok</Label>
                  <Input placeholder="https://tiktok.com/@moncompte" value={form.tiktok} onChange={(e) => setForm((v) => ({ ...v, tiktok: e.target.value }))} />
                </div>
              </div>

              <Button type="submit">Enregistrer</Button>
            </form>
          </CardContent>
        </Card>

        {loadingRestaurants || loading ? <p className="text-muted-foreground">Chargement...</p> : null}
        {restaurantError || error ? <p className="text-destructive">Erreur: {restaurantError || error}</p> : null}

        <div className="space-y-3">
          {items.map((item) => {
            const links = getSocialLinks(item.opening_hours);
            const hasAny = links.social_instagram || links.social_facebook || links.social_website || links.social_tiktok;

            return (
              <Card key={item.id}>
                <CardContent className="pt-5 space-y-3">
                  <h3 className="font-semibold">{item.name}</h3>
                  {!hasAny ? (
                    <p className="text-sm text-muted-foreground">Aucun réseau social connecté</p>
                  ) : (
                    <div className="grid gap-2 sm:grid-cols-2">
                      {links.social_instagram && (
                        <div className="flex items-center justify-between gap-2 p-2 rounded-lg bg-muted/50">
                          <a href={links.social_instagram} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-sm hover:text-primary">
                            <Instagram className="h-4 w-4" /> Instagram <ExternalLink className="h-3 w-3" />
                          </a>
                          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => clearSocial(item.id, "social_instagram")}>
                            <Trash2 className="h-3 w-3 text-destructive" />
                          </Button>
                        </div>
                      )}
                      {links.social_facebook && (
                        <div className="flex items-center justify-between gap-2 p-2 rounded-lg bg-muted/50">
                          <a href={links.social_facebook} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-sm hover:text-primary">
                            <Facebook className="h-4 w-4" /> Facebook <ExternalLink className="h-3 w-3" />
                          </a>
                          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => clearSocial(item.id, "social_facebook")}>
                            <Trash2 className="h-3 w-3 text-destructive" />
                          </Button>
                        </div>
                      )}
                      {links.social_website && (
                        <div className="flex items-center justify-between gap-2 p-2 rounded-lg bg-muted/50">
                          <a href={links.social_website} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-sm hover:text-primary">
                            <Globe className="h-4 w-4" /> Site web <ExternalLink className="h-3 w-3" />
                          </a>
                          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => clearSocial(item.id, "social_website")}>
                            <Trash2 className="h-3 w-3 text-destructive" />
                          </Button>
                        </div>
                      )}
                      {links.social_tiktok && (
                        <div className="flex items-center justify-between gap-2 p-2 rounded-lg bg-muted/50">
                          <a href={links.social_tiktok} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-sm hover:text-primary">
                            TikTok <ExternalLink className="h-3 w-3" />
                          </a>
                          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => clearSocial(item.id, "social_tiktok")}>
                            <Trash2 className="h-3 w-3 text-destructive" />
                          </Button>
                        </div>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>
    </DashboardLayout>
  );
}
