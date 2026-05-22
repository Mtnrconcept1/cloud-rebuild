import { FormEvent, useEffect, useState } from "react";
import { ExternalLink, Facebook, Globe, Instagram, Trash2 } from "lucide-react";

import DashboardLayout from "@/components/DashboardLayout";
import DashboardPageHero from "@/components/dashboard/DashboardPageHero";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { getSupabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import { useOwnerRestaurants } from "./useOwnerRestaurants";

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

const initialForm = { restaurant_id: "", instagram: "", facebook: "", website: "", tiktok: "" };

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

export default function DashboardReseauxSociaux() {
  const { toast } = useToast();
  const { restaurantIds, loading: loadingRestaurants, error: restaurantError } = useOwnerRestaurants();
  const [items, setItems] = useState<RestaurantSocial[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState(initialForm);

  const load = async () => {
    if (!restaurantIds.length) {
      setItems([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    const { data, error: loadError } = await supabase
      .from("restaurants")
      .select("id, name, opening_hours")
      .in("id", restaurantIds)
      .order("name");

    setError(loadError?.message || null);
    setItems((data || []) as RestaurantSocial[]);
    setLoading(false);
  };

  useEffect(() => {
    if (!loadingRestaurants) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadingRestaurants, restaurantIds.join(",")]);

  const selectRestaurant = (id: string) => {
    const restaurant = items.find((item) => item.id === id);

    if (!restaurant) {
      setForm({ ...initialForm, restaurant_id: id });
      return;
    }

    const links = getSocialLinks(restaurant.opening_hours);

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

    if (!form.restaurant_id) {
      toast({ title: "Validation", description: "Selectionnez un restaurant.", variant: "destructive" });
      return;
    }

    const target = items.find((item) => item.id === form.restaurant_id);
    const existingOh =
      target?.opening_hours && typeof target.opening_hours === "object" && !Array.isArray(target.opening_hours)
        ? (target.opening_hours as Record<string, Json>)
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

    const { error: saveError } = await supabase.from("restaurants").update(payload).eq("id", form.restaurant_id);

    if (saveError) {
      toast({ title: "Erreur", description: saveError.message, variant: "destructive" });
      return;
    }

    toast({ title: "Reseaux sociaux enregistres" });
    load();
  };

  const clearSocial = async (restaurantId: string, key: string) => {
    const target = items.find((item) => item.id === restaurantId);
    const existingOh =
      target?.opening_hours && typeof target.opening_hours === "object" && !Array.isArray(target.opening_hours)
        ? (target.opening_hours as Record<string, Json>)
        : {};
    const payload = { opening_hours: { ...existingOh, [key]: null } };
    const { error: clearError } = await supabase.from("restaurants").update(payload).eq("id", restaurantId);

    if (clearError) {
      toast({ title: "Erreur", description: clearError.message, variant: "destructive" });
      return;
    }

    toast({ title: "Lien supprime" });
    load();
  };

  const connectedProfiles = items.filter((item) => Object.values(getSocialLinks(item.opening_hours)).some(Boolean)).length;

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <DashboardPageHero
          badge="Presence digitale"
          title="Reseaux sociaux"
          description="Centralisez Instagram, Facebook, site web et TikTok pour maintenir une fiche restaurant coherente partout."
          icon={Globe}
          tone="sky"
          visualLabel="Social"
          stats={[
            { label: "Restaurants", value: items.length, icon: Globe },
            { label: "Profils relies", value: connectedProfiles, icon: Instagram },
            { label: "Edition", value: form.restaurant_id ? "Active" : "A choisir", icon: Facebook },
          ]}
        />

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
                  onChange={(event) => selectRestaurant(event.target.value)}
                >
                  <option value="">Selectionner</option>
                  {items.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label className="flex items-center gap-2">
                    <Instagram className="h-4 w-4" />
                    Instagram
                  </Label>
                  <Input
                    placeholder="https://instagram.com/moncompte"
                    value={form.instagram}
                    onChange={(event) => setForm((value) => ({ ...value, instagram: event.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label className="flex items-center gap-2">
                    <Facebook className="h-4 w-4" />
                    Facebook
                  </Label>
                  <Input
                    placeholder="https://facebook.com/mapage"
                    value={form.facebook}
                    onChange={(event) => setForm((value) => ({ ...value, facebook: event.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label className="flex items-center gap-2">
                    <Globe className="h-4 w-4" />
                    Site web
                  </Label>
                  <Input
                    placeholder="https://monrestaurant.ch"
                    value={form.website}
                    onChange={(event) => setForm((value) => ({ ...value, website: event.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label>TikTok</Label>
                  <Input
                    placeholder="https://tiktok.com/@moncompte"
                    value={form.tiktok}
                    onChange={(event) => setForm((value) => ({ ...value, tiktok: event.target.value }))}
                  />
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
                <CardContent className="space-y-3 pt-5">
                  <h3 className="font-semibold">{item.name}</h3>
                  {!hasAny ? (
                    <p className="text-sm text-muted-foreground">Aucun reseau social connecte</p>
                  ) : (
                    <div className="grid gap-2 sm:grid-cols-2">
                      {links.social_instagram ? (
                        <SocialLink
                          icon={Instagram}
                          label="Instagram"
                          url={links.social_instagram}
                          onClear={() => clearSocial(item.id, "social_instagram")}
                        />
                      ) : null}
                      {links.social_facebook ? (
                        <SocialLink
                          icon={Facebook}
                          label="Facebook"
                          url={links.social_facebook}
                          onClear={() => clearSocial(item.id, "social_facebook")}
                        />
                      ) : null}
                      {links.social_website ? (
                        <SocialLink
                          icon={Globe}
                          label="Site web"
                          url={links.social_website}
                          onClear={() => clearSocial(item.id, "social_website")}
                        />
                      ) : null}
                      {links.social_tiktok ? (
                        <SocialLink label="TikTok" url={links.social_tiktok} onClear={() => clearSocial(item.id, "social_tiktok")} />
                      ) : null}
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

function SocialLink({
  icon: Icon,
  label,
  url,
  onClear,
}: {
  icon?: React.ComponentType<{ className?: string }>;
  label: string;
  url: string;
  onClear: () => void;
}) {
  return (
    <div className="flex items-center justify-between gap-2 rounded-lg bg-muted/50 p-2">
      <a href={url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-sm hover:text-primary">
        {Icon ? <Icon className="h-4 w-4" /> : null}
        {label}
        <ExternalLink className="h-3 w-3" />
      </a>
      <Button size="icon" variant="ghost" className="h-7 w-7" onClick={onClear}>
        <Trash2 className="h-3 w-3 text-destructive" />
      </Button>
    </div>
  );
}
