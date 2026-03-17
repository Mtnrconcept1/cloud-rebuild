import { useState, useEffect } from "react";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { User, Trophy, Gift, Camera, Mail, Phone, MapPin, Heart, Settings, Shield, Bell } from "lucide-react";
import { Link } from "react-router-dom";
import CustomerDashboardLayout from "@/components/CustomerDashboardLayout";
import LoyaltyStatus from "@/components/LoyaltyStatus";
import ImageUpload from "@/components/ImageUpload";
import AddressAutocomplete from "@/components/AddressAutocomplete";
import { enablePush, disablePush } from "@/lib/push-unified";

export default function Profil() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [loading, setLoading] = useState(false);
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [city, setCity] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");

  const { data: profile } = useQuery({
    queryKey: ["profile", user?.id],
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("*").eq("user_id", user!.id).single();
      return data;
    },
    enabled: !!user,
  });

  useEffect(() => {
    if (profile) {
      setFullName(profile.full_name || "");
      setPhone(profile.phone || "");
      setAddress(profile.address || "");
      setCity(profile.city || "");
      setAvatarUrl(profile.avatar_url || "");
    }
  }, [profile]);

  const handleSave = async () => {
    if (!user) return;
    setLoading(true);
    const { error } = await supabase
      .from("profiles")
      .update({ full_name: fullName, phone, address, city, avatar_url: avatarUrl })
      .eq("user_id", user.id);
    setLoading(false);
    if (error) {
      toast({ title: "Erreur", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Profil mis à jour !" });
      queryClient.invalidateQueries({ queryKey: ["profile"] });
    }
  };

  const { data: favorites } = useQuery({
    queryKey: ["my-favorites", user?.id],
    queryFn: async () => {
      const { data } = await supabase.from("favorites").select("*, restaurants(id, name, city, cuisine_type, rating, image_url)").eq("user_id", user!.id);
      return data || [];
    },
    enabled: !!user,
  });

  const { data: notificationPrefs } = useQuery({
    queryKey: ["notification-preferences", user?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("notification_preferences" as any)
        .select("*")
        .eq("user_id", user!.id)
        .maybeSingle();
      return data;
    },
    enabled: !!user,
  });

  const { data: notificationSubscriptions } = useQuery({
    queryKey: ["notification-subscriptions", user?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("notification_subscriptions" as any)
        .select("*")
        .eq("user_id", user!.id);
      return data || [];
    },
    enabled: !!user,
  });

  const prefs = (notificationPrefs as any) || {
    channels: { in_app: true, email: true, push: true },
    categories: { transactional: true, product: true, marketing: false, system: true },
  };

  const updatePreferences = async (next: { channels?: any; categories?: any }) => {
    if (!user) return;
    const payload = {
      user_id: user.id,
      channels: next.channels ?? prefs.channels,
      categories: next.categories ?? prefs.categories,
    };
    const { error } = await supabase
      .from("notification_preferences" as any)
      .upsert(payload, { onConflict: "user_id" });
    if (error) {
      toast({ title: "Erreur", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Préférences mises à jour" });
      queryClient.invalidateQueries({ queryKey: ["notification-preferences", user.id] });
    }
  };

  const toggleChannel = (key: "in_app" | "email" | "push") => {
    updatePreferences({
      channels: { ...prefs.channels, [key]: !prefs.channels?.[key] },
    });
  };

  const toggleCategory = (key: "transactional" | "product" | "marketing" | "system") => {
    updatePreferences({
      categories: { ...prefs.categories, [key]: !prefs.categories?.[key] },
    });
  };

  const toggleTopic = async (topic: string) => {
    if (!user) return;
    const isSubscribed = (notificationSubscriptions || []).some((s: any) => s.topic === topic);
    if (isSubscribed) {
      await supabase
        .from("notification_subscriptions" as any)
        .delete()
        .eq("user_id", user.id)
        .eq("topic", topic);
    } else {
      await supabase
        .from("notification_subscriptions" as any)
        .upsert({ user_id: user.id, topic, filters: {} }, { onConflict: "user_id,topic" });
    }
    queryClient.invalidateQueries({ queryKey: ["notification-subscriptions", user.id] });
  };

  const topics = [
    { id: "flash_sales", label: "Ventes Flash", desc: "Offres limitées en temps réel." },
    { id: "chefs_table", label: "Chef's Table", desc: "Nouveaux drops exclusifs." },
    { id: "anti_gaspi", label: "Anti-gaspi", desc: "Offres solidaires et anti-gaspi." },
  ];

  return (
    <CustomerDashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
            <User className="h-5 w-5 text-primary" />
          </div>
          <h1 className="font-display text-3xl font-bold">Mon profil</h1>
        </div>

        <Tabs defaultValue="infos">
          <TabsList className="w-full">
            <TabsTrigger value="infos" className="text-xs sm:text-sm">Informations</TabsTrigger>
            <TabsTrigger value="favoris" className="text-xs sm:text-sm">Favoris ({favorites?.length || 0})</TabsTrigger>
            <TabsTrigger value="notifications" className="gap-1 sm:gap-2 text-xs sm:text-sm"><Bell className="h-3.5 w-3.5" /> <span className="hidden sm:inline">Notifications</span><span className="sm:hidden">Notifs</span></TabsTrigger>
            <TabsTrigger value="fidelite" className="gap-1 sm:gap-2 text-xs sm:text-sm"><Trophy className="h-3.5 w-3.5" /> <span className="hidden sm:inline">Fidélité</span><span className="sm:hidden">Points</span></TabsTrigger>
          </TabsList>

          <TabsContent value="infos" className="space-y-6 pt-4">
            <div className="flex flex-col items-center gap-4 mb-6">
              <div className="relative group">
                <div className="w-24 h-24 rounded-full overflow-hidden border-4 border-primary/10 bg-muted">
                  {avatarUrl ? (
                    <img src={avatarUrl} alt="Avatar" className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center bg-primary/5">
                      <User className="h-10 w-10 text-primary/40" />
                    </div>
                  )}
                </div>
              </div>
              <div className="w-full max-w-sm">
                <ImageUpload
                  label="Photo de profil"
                  value={avatarUrl}
                  onChange={setAvatarUrl}
                />
              </div>
            </div>

            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Nom complet</Label>
                <Input value={fullName} onChange={(e) => setFullName(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Email</Label>
                <Input value={user?.email || ""} disabled />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Téléphone</Label>
                  <Input value={phone} onChange={(e) => setPhone(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>Ville</Label>
                  <Input value={city} onChange={(e) => setCity(e.target.value)} />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="address">Adresse</Label>
                <AddressAutocomplete
                  value={address}
                  onAddressSelect={(addr, c) => {
                    setAddress(addr);
                    if (c) setCity(c);
                  }}
                  placeholder="Votre adresse complète"
                />
              </div>
            </div>
            <Button onClick={handleSave} disabled={loading}>
              {loading ? "Enregistrement..." : "Sauvegarder"}
            </Button>
          </TabsContent>

          <TabsContent value="favoris" className="space-y-4 pt-4">
            {favorites && favorites.length > 0 ? (
              favorites.map((f) => {
                const r = f.restaurants as any;
                return (
                  <Link key={f.id} to={`/restaurant/${r?.id}`} className="flex items-center gap-4 p-3 border rounded-xl bg-card hover:bg-accent transition-colors">
                    <img src={r?.image_url || "/images/kebab-box-spread.jpeg"} alt={r?.name} className="w-12 h-12 rounded-lg object-cover" />
                    <div>
                      <p className="font-semibold text-sm">{r?.name}</p>
                      <p className="text-xs text-muted-foreground">{r?.cuisine_type} · {r?.city}</p>
                    </div>
                  </Link>
                );
              })
            ) : (
              <p className="text-muted-foreground text-center py-8">Aucun favori</p>
            )}
          </TabsContent>

          <TabsContent value="notifications" className="space-y-6 pt-4">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div className="rounded-xl border bg-card p-4 space-y-3">
                <h3 className="font-semibold text-sm">Canaux</h3>
                <div className="space-y-2 text-sm">
                  <div className="flex items-center justify-between">
                    <span>In-app</span>
                    <Switch checked={!!prefs.channels?.in_app} onCheckedChange={() => toggleChannel("in_app")} />
                  </div>
                  <div className="flex items-center justify-between">
                    <span>Email</span>
                    <Switch checked={!!prefs.channels?.email} onCheckedChange={() => toggleChannel("email")} />
                  </div>
                  <div className="flex items-center justify-between">
                    <span>Push web</span>
                    <Switch checked={!!prefs.channels?.push} onCheckedChange={() => toggleChannel("push")} />
                  </div>
                </div>
              </div>

              <div className="rounded-xl border bg-card p-4 space-y-3">
                <h3 className="font-semibold text-sm">Categories</h3>
                <div className="space-y-2 text-sm">
                  <div className="flex items-center justify-between">
                    <span>Transactionnel</span>
                    <Switch checked={!!prefs.categories?.transactional} onCheckedChange={() => toggleCategory("transactional")} />
                  </div>
                  <div className="flex items-center justify-between">
                    <span>Produit</span>
                    <Switch checked={!!prefs.categories?.product} onCheckedChange={() => toggleCategory("product")} />
                  </div>
                  <div className="flex items-center justify-between">
                    <span>Marketing</span>
                    <Switch checked={!!prefs.categories?.marketing} onCheckedChange={() => toggleCategory("marketing")} />
                  </div>
                  <div className="flex items-center justify-between">
                    <span>Système</span>
                    <Switch checked={!!prefs.categories?.system} onCheckedChange={() => toggleCategory("system")} />
                  </div>
                </div>
              </div>
            </div>

            <div className="rounded-xl border bg-card p-4 space-y-3">
              <h3 className="font-semibold text-sm">Push web</h3>
              <p className="text-xs text-muted-foreground">
                Activez les notifications push pour recevoir les alertes en temps reel.
              </p>
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  onClick={async () => {
                    if (!user) return;
                    const res = await enablePush(user.id);
                    if (!res.ok) {
                      toast({ title: "Push indisponible", description: res.reason, variant: "destructive" });
                    } else {
                      toast({ title: "Push active" });
                    }
                  }}
                >
                  Activer le push
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={async () => {
                    if (!user) return;
                    const res = await disablePush(user.id);
                    if (!res.ok) {
                      toast({ title: "Erreur", description: res.reason, variant: "destructive" });
                    } else {
                      toast({ title: "Push desactive" });
                    }
                  }}
                >
                  Désactiver le push
                </Button>
              </div>
            </div>

            <div className="rounded-xl border bg-card p-4 space-y-3">
              <h3 className="font-semibold text-sm">Alertes thématiques</h3>
              <div className="space-y-2">
                {topics.map((topic) => {
                  const isSubscribed = (notificationSubscriptions || []).some((s: any) => s.topic === topic.id);
                  return (
                    <div key={topic.id} className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium">{topic.label}</p>
                        <p className="text-[11px] text-muted-foreground">{topic.desc}</p>
                      </div>
                      <Switch checked={isSubscribed} onCheckedChange={() => toggleTopic(topic.id)} />
                    </div>
                  );
                })}
              </div>
            </div>
          </TabsContent>

          <TabsContent value="fidelite" className="space-y-6 pt-4">
            <LoyaltyStatus />

            {/* Gift Points CTA */}
            <Link
              to="/points-cadeau"
              className="flex items-center gap-4 p-4 rounded-xl border-2 border-pink-500/20 bg-pink-500/5 hover:border-pink-500/40 transition-all group"
            >
              <div className="w-10 h-10 rounded-full bg-pink-500/10 flex items-center justify-center group-hover:bg-pink-500/20 transition-colors">
                <Gift className="h-5 w-5 text-pink-500" />
              </div>
              <div className="flex-1">
                <p className="font-semibold text-sm">Points Cadeau</p>
                <p className="text-xs text-muted-foreground">Offrez des Miamz à vos proches ou réclamez un cadeau</p>
              </div>
              <span className="text-pink-500 text-sm font-medium">Ouvrir →</span>
            </Link>

            <div className="space-y-4">
              <h2 className="font-display text-xl font-bold">Historique</h2>
              <LoyaltyHistory userId={user?.id} />
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </CustomerDashboardLayout>
  );
}

function LoyaltyHistory({ userId }: { userId?: string }) {
  const { data: transactions, isLoading } = useQuery({
    queryKey: ["loyalty-transactions", userId],
    queryFn: async () => {
      const { data } = await supabase
        .from("loyalty_transactions" as any)
        .select("*")
        .eq("user_id", userId!)
        .order("created_at", { ascending: false })
        .limit(20);
      return data || [];
    },
    enabled: !!userId,
  });

  if (isLoading) return <p className="text-sm text-muted-foreground">Chargement...</p>;
  if (!transactions || transactions.length === 0) {
    return <p className="text-sm text-muted-foreground">Aucune transaction pour le moment.</p>;
  }

  return (
    <div className="space-y-3">
      {transactions.map((t: any) => (
        <div key={t.id} className="flex items-center justify-between p-3 border rounded-xl bg-card">
          <div>
            <p className="font-semibold text-sm">{t.description || "Mouvement de points"}</p>
            <p className="text-xs text-muted-foreground">{new Date(t.created_at).toLocaleDateString()}</p>
          </div>
          <div className={`font-bold ${t.amount > 0 ? "text-green-600" : "text-destructive"}`}>
            {t.amount > 0 ? "+" : ""}{t.amount} pts
          </div>
        </div>
      ))}
    </div>
  );
}
