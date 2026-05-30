import { useState, useEffect } from "react";
import { useAuth } from "@/lib/auth";
import { getSupabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { User, Trophy, Gift, Camera, Mail, Phone, MapPin, Heart, Settings, Shield, Bell, Trash2, AlertTriangle, Crown, CalendarCheck, Truck, Percent, Headphones, Zap, CreditCard } from "lucide-react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import CustomerDashboardLayout from "@/components/CustomerDashboardLayout";
import LoyaltyStatus from "@/components/LoyaltyStatus";
import ImageUpload from "@/components/ImageUpload";
import AddressAutocomplete from "@/components/AddressAutocomplete";
import CityAutocomplete from "@/components/CityAutocomplete";
import { enablePush, disablePush } from "@/lib/push-unified";
import SignupApplicationStatusCard from "@/components/signup/SignupApplicationStatusCard";
import { useSignupApplication } from "@/hooks/useSignupApplication";
import {
  isTokOneSubscriptionActive,
  useTokOneSubscription,
  useTokOnePlans,
  useTokOneBenefits,
} from "@/hooks/useTokOne";
import { Badge } from "@/components/ui/badge";
import { buildTokOneEntitlements } from "@/lib/subscriptionEntitlements";

const supabase = getSupabase();

type FavoriteRestaurant = {
  id: string;
  name: string;
  city: string | null;
  cuisine_type: string | null;
  rating: number | null;
  image_url: string | null;
};

type FavoriteRow = {
  id: string;
  restaurants: FavoriteRestaurant | null;
};

type NotificationChannels = {
  in_app: boolean;
  email: boolean;
  push: boolean;
};

type NotificationCategories = {
  transactional: boolean;
  product: boolean;
  marketing: boolean;
  system: boolean;
};

type NotificationPreferences = {
  channels: NotificationChannels;
  categories: NotificationCategories;
};

type NotificationSubscription = {
  topic: string;
};

type LoyaltyTransaction = {
  id: string;
  description: string | null;
  amount: number;
  created_at: string;
};

export default function Profil() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const defaultTab = searchParams.get("tab") || "infos";
  const [loading, setLoading] = useState(false);
  const [deleteConfirmEmail, setDeleteConfirmEmail] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [city, setCity] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");
  const { data: signupApplication } = useSignupApplication("client");
  const { data: tokOneSub } = useTokOneSubscription();
  const { data: tokOnePlans } = useTokOnePlans();
  const tokOneIsActive = isTokOneSubscriptionActive(tokOneSub);

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
      return (data || []) as FavoriteRow[];
    },
    enabled: !!user,
  });

  const { data: notificationPrefs } = useQuery({
    queryKey: ["notification-preferences", user?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("notification_preferences")
        .select("*")
        .eq("user_id", user!.id)
        .maybeSingle();
      return (data as NotificationPreferences | null) || null;
    },
    enabled: !!user,
  });

  const { data: notificationSubscriptions } = useQuery({
    queryKey: ["notification-subscriptions", user?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("notification_subscriptions")
        .select("*")
        .eq("user_id", user!.id);
      return (data || []) as NotificationSubscription[];
    },
    enabled: !!user,
  });

  const prefs: NotificationPreferences = notificationPrefs || {
    channels: { in_app: true, email: true, push: true },
    categories: { transactional: true, product: true, marketing: false, system: true },
  };

  const updatePreferences = async (next: Partial<NotificationPreferences>) => {
    if (!user) return;
    const payload = {
      user_id: user.id,
      channels: next.channels ?? prefs.channels,
      categories: next.categories ?? prefs.categories,
    };
    const { error } = await supabase
      .from("notification_preferences")
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
    const subscriptions = notificationSubscriptions || [];
    const isSubscribed = subscriptions.some((subscription) => subscription.topic === topic);
    if (isSubscribed) {
      await supabase
        .from("notification_subscriptions")
        .delete()
        .eq("user_id", user.id)
        .eq("topic", topic);
    } else {
      await supabase
        .from("notification_subscriptions")
        .upsert({ user_id: user.id, topic, filters: {} }, { onConflict: "user_id,topic" });
    }
    queryClient.invalidateQueries({ queryKey: ["notification-subscriptions", user.id] });
  };

  const topics = [
    { id: "flash_sales", label: "Ventes Flash", desc: "Offres limitées en temps réel." },
    { id: "chefs_table", label: "La Table du Chef", desc: "Nouveaux drops exclusifs." },
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

        <Tabs defaultValue={defaultTab}>
          <TabsList className="w-full flex-wrap">
            <TabsTrigger value="infos" className="text-xs sm:text-sm">Informations</TabsTrigger>
            <TabsTrigger value="favoris" className="text-xs sm:text-sm">Favoris ({favorites?.length || 0})</TabsTrigger>
            <TabsTrigger value="abonnement" className="gap-1 sm:gap-2 text-xs sm:text-sm"><Crown className="h-3.5 w-3.5" /> <span className="hidden sm:inline">Abonnement</span><span className="sm:hidden">Abo.</span></TabsTrigger>
            <TabsTrigger value="notifications" className="gap-1 sm:gap-2 text-xs sm:text-sm"><Bell className="h-3.5 w-3.5" /> <span className="hidden sm:inline">Notifications</span><span className="sm:hidden">Notifs</span></TabsTrigger>
            <TabsTrigger value="fidelite" className="gap-1 sm:gap-2 text-xs sm:text-sm"><Trophy className="h-3.5 w-3.5" /> <span className="hidden sm:inline">Fidélité</span><span className="sm:hidden">Points</span></TabsTrigger>
            <TabsTrigger value="parametres" className="gap-1 sm:gap-2 text-xs sm:text-sm"><Settings className="h-3.5 w-3.5" /> <span className="hidden sm:inline">Parametres</span><span className="sm:hidden">Param.</span></TabsTrigger>
          </TabsList>

          <TabsContent value="infos" className="space-y-6 pt-4">
            <SignupApplicationStatusCard
              application={signupApplication}
              title="Verification du compte client"
              emptyDescription="Aucun dossier documentaire client n'a encore ete soumis."
            />

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
                  <CityAutocomplete
                    value={city}
                    onValueChange={setCity}
                    onCitySelect={setCity}
                    placeholder="Votre ville"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="address">Adresse</Label>
                <AddressAutocomplete
                  id="address"
                  value={address}
                  onValueChange={setAddress}
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
                const r = f.restaurants;
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

          <TabsContent value="abonnement" className="space-y-6 pt-4">
            <TokOneTab userId={user?.id} subscription={tokOneSub} isActive={tokOneIsActive} plans={tokOnePlans} />
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
                  const isSubscribed = (notificationSubscriptions || []).some((subscription) => subscription.topic === topic.id);
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

          <TabsContent value="parametres" className="space-y-6 pt-4">
            <div className="rounded-xl border border-destructive/20 bg-destructive/5 p-6 space-y-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-destructive/10 flex items-center justify-center">
                  <AlertTriangle className="h-5 w-5 text-destructive" />
                </div>
                <div>
                  <h3 className="font-semibold text-destructive">Zone de danger</h3>
                  <p className="text-xs text-muted-foreground">Actions irreversibles</p>
                </div>
              </div>

              <div className="space-y-2">
                <p className="text-sm text-muted-foreground">
                  La suppression de votre compte est definitive et entraine la perte de vos points de fidelite, credits, historique de commandes et reservations.
                </p>

                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="destructive" size="sm">
                      <Trash2 className="mr-2 h-4 w-4" />
                      Supprimer mon compte
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Supprimer definitivement votre compte ?</AlertDialogTitle>
                      <AlertDialogDescription className="space-y-3">
                        <span className="block">Cette action est irreversible. Toutes vos donnees seront supprimees.</span>
                        <span className="block">Pour confirmer, saisissez votre email : <strong>{user?.email}</strong></span>
                        <Input
                          value={deleteConfirmEmail}
                          onChange={(e) => setDeleteConfirmEmail(e.target.value)}
                          placeholder="Votre email"
                          className="mt-2"
                        />
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel onClick={() => setDeleteConfirmEmail("")}>Annuler</AlertDialogCancel>
                      <AlertDialogAction
                        className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        disabled={deleteConfirmEmail !== user?.email || deleting}
                        onClick={async () => {
                          setDeleting(true);
                          try {
                            const { error } = await supabase.functions.invoke("delete-account");
                            if (error) throw error;
                            await supabase.auth.signOut();
                            toast({ title: "Compte supprime", description: "Votre compte a ete supprime avec succes." });
                            navigate("/");
                          } catch (err: any) {
                            toast({ title: "Erreur", description: err.message || "Impossible de supprimer le compte.", variant: "destructive" });
                          } finally {
                            setDeleting(false);
                            setDeleteConfirmEmail("");
                          }
                        }}
                      >
                        {deleting ? "Suppression..." : "Supprimer definitivement"}
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </CustomerDashboardLayout>
  );
}

type TokOneTabProps = {
  userId?: string;
  subscription: any;
  isActive: boolean;
  plans: any[] | undefined;
};

function TokOneTab({ userId, subscription, isActive, plans }: TokOneTabProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: tokOneBenefits } = useTokOneBenefits(subscription?.plan_id);
  const tokOneEntitlements = buildTokOneEntitlements({
    plan: subscription?.user_subscription_plans,
    benefits: tokOneBenefits,
  });
  const enabledBenefitLabels = tokOneEntitlements.displayBenefits
    .filter((benefit) => benefit.enabled)
    .map((benefit) => benefit.label);

  // Fetch orders where tok_one_member was true (usage history)
  const { data: tokOneOrders, isLoading: ordersLoading } = useQuery({
    queryKey: ["tok-one-orders", userId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_customer_orders_dashboard" as any);
      if (error) throw error;

      return ((data || []) as any[])
        .map((order) => {
          const metadata = order.metadata && typeof order.metadata === "object" && !Array.isArray(order.metadata)
            ? order.metadata
            : {};
          const restaurant = order.restaurant && typeof order.restaurant === "object" && !Array.isArray(order.restaurant)
            ? order.restaurant
            : null;

          return {
            ...order,
            metadata,
            order_reference: order.order_reference || order.order_number || metadata.order_reference || null,
            restaurants: restaurant ? { name: restaurant.name || "Restaurant" } : null,
          };
        })
        .filter((order) => (order.metadata as any)?.tok_one_member === true)
        .slice(0, 50);
    },
    enabled: !!userId,
  });

  // Fetch Tok One payment transactions
  const { data: payments, isLoading: paymentsLoading } = useQuery({
    queryKey: ["tok-one-payments", userId],
    queryFn: async () => {
      const { data } = await supabase
        .from("payment_transactions")
        .select("id, amount, created_at, metadata, status")
        .eq("user_id", userId!)
        .order("created_at", { ascending: false })
        .limit(20);
      return (data || []).filter((p: any) => {
        const status = String((p as any)?.status || "");
        return (p.metadata as any)?.checkout_kind === "tok-one" && ["paid", "succeeded"].includes(status);
      });
    },
    enabled: !!userId,
  });

  // Computed stats
  const totalTokOneSaved = (tokOneOrders || []).reduce((sum: number, o: any) => {
    const metadata = (o.metadata || {}) as any;
    return sum + Number(metadata.tok_one_total_saved || (Number(metadata.tok_one_delivery_saved || 0) + Number(metadata.tok_one_discount_amount || 0)));
  }, 0);
  const totalOrders = (tokOneOrders || []).length;
  const totalPaid = (payments || []).reduce((sum: number, p: any) => sum + Number(p.amount || 0), 0);

  return (
    <div className="space-y-6">
      {/* Subscription status card */}
      {isActive && subscription ? (
        <div className="rounded-2xl border-2 border-violet-200 bg-gradient-to-br from-violet-50 to-purple-50 p-6 space-y-5">
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-xl bg-violet-100 flex items-center justify-center">
                <Crown className="h-6 w-6 text-violet-600" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="font-bold text-lg text-violet-900">Tok One</h3>
                  <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200">Actif</Badge>
                </div>
                <p className="text-sm text-violet-600">
                  {subscription.user_subscription_plans?.name || "Premium"}
                </p>
              </div>
            </div>
            {!subscription.cancel_at_period_end && (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive">
                    Resilier
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Resilier Tok One ?</AlertDialogTitle>
                    <AlertDialogDescription>
                      Vous conserverez vos avantages jusqu'au {new Date(subscription.current_period_end).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })}. Apres cette date, les frais de livraison et reductions exclusives ne s'appliqueront plus.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Conserver</AlertDialogCancel>
                    <AlertDialogAction
                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                      onClick={async () => {
                        const { error } = await supabase.functions.invoke("manage-tok-one-subscription", {
                          body: { action: "cancel" },
                        });
                        if (error) {
                          toast({ title: "Erreur", description: error.message, variant: "destructive" });
                        } else {
                          toast({ title: "Abonnement resilie", description: "Vos avantages restent actifs jusqu'a la fin de la periode." });
                          queryClient.invalidateQueries({ queryKey: ["tok-one-subscription"] });
                        }
                      }}
                    >
                      Confirmer la resiliation
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="rounded-xl bg-white/60 border p-4 space-y-1">
              <p className="text-xs text-muted-foreground font-medium">Debut de la periode</p>
              <p className="font-semibold text-sm">
                <CalendarCheck className="h-3.5 w-3.5 inline mr-1.5 text-violet-500" />
                {new Date(subscription.current_period_start).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })}
              </p>
            </div>
            <div className="rounded-xl bg-white/60 border p-4 space-y-1">
              <p className="text-xs text-muted-foreground font-medium">
                {subscription.cancel_at_period_end ? "Expire le" : "Prochain renouvellement"}
              </p>
              <p className="font-semibold text-sm">
                <CalendarCheck className="h-3.5 w-3.5 inline mr-1.5 text-violet-500" />
                {new Date(subscription.current_period_end).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })}
              </p>
            </div>
          </div>

          <div className="rounded-xl bg-white/60 border p-4">
            <p className="text-xs text-muted-foreground font-medium mb-3">Avantages actifs</p>
            <div className="flex flex-wrap gap-2">
              {enabledBenefitLabels.map((label) => (
                <Badge key={label} variant="secondary" className="bg-violet-100 text-violet-700">
                  {label}
                </Badge>
              ))}
            </div>
          </div>

          {subscription.cancel_at_period_end && (
            <div className="rounded-xl bg-amber-50 border border-amber-200 p-4">
              <p className="text-sm text-amber-800">
                Votre abonnement ne sera pas renouvele. Vous conservez vos avantages jusqu'a la fin de la periode en cours.
              </p>
            </div>
          )}
        </div>
      ) : (
        <div className="rounded-2xl border-2 border-dashed border-violet-200 p-8 text-center space-y-4">
          <div className="w-16 h-16 rounded-2xl bg-violet-100 flex items-center justify-center mx-auto">
            <Crown className="h-8 w-8 text-violet-400" />
          </div>
          <h3 className="font-bold text-xl">Aucun abonnement actif</h3>
          <p className="text-muted-foreground max-w-md mx-auto">
            Rejoignez Tok One pour beneficier de la livraison gratuite, de reductions exclusives et d'un acces VIP.
          </p>
          {plans && plans.length > 0 && (
            <p className="text-sm text-violet-600 font-medium">
              A partir de {Number(plans[0].price_monthly).toFixed(2)} CHF/mois
            </p>
          )}
          <Button className="bg-violet-600 hover:bg-violet-700 text-white" asChild>
            <Link to="/tok-one">
              <Crown className="mr-2 h-4 w-4" />
              Decouvrir Tok One
            </Link>
          </Button>
        </div>
      )}

      {/* Stats summary */}
      {(totalOrders > 0 || totalPaid > 0) && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="rounded-xl border bg-card p-4 text-center space-y-1">
            <p className="text-2xl font-bold text-violet-600">{totalOrders}</p>
            <p className="text-xs text-muted-foreground">Commandes Tok One</p>
          </div>
          <div className="rounded-xl border bg-card p-4 text-center space-y-1">
            <p className="text-2xl font-bold text-emerald-600">{totalTokOneSaved.toFixed(2)}</p>
            <p className="text-xs text-muted-foreground">CHF economises</p>
          </div>
          <div className="rounded-xl border bg-card p-4 text-center space-y-1">
            <p className="text-2xl font-bold text-blue-600">{(payments || []).length}</p>
            <p className="text-xs text-muted-foreground">Paiements abonnement</p>
          </div>
          <div className="rounded-xl border bg-card p-4 text-center space-y-1">
            <p className="text-2xl font-bold text-amber-600">{totalPaid.toFixed(2)}</p>
            <p className="text-xs text-muted-foreground">CHF total abonnement</p>
          </div>
        </div>
      )}

      {/* Usage history: orders with Tok One benefits */}
      <div className="space-y-3">
        <h3 className="font-bold text-lg flex items-center gap-2">
          <Truck className="h-5 w-5 text-violet-500" />
          Historique des avantages utilises
        </h3>
        {ordersLoading ? (
          <div className="text-center py-6 text-muted-foreground text-sm">Chargement...</div>
        ) : tokOneOrders && tokOneOrders.length > 0 ? (
          <div className="space-y-2">
            {tokOneOrders.map((order: any) => {
              const meta = (order.metadata || {}) as any;
              const saved = Number(meta.tok_one_total_saved || (Number(meta.tok_one_delivery_saved || 0) + Number(meta.tok_one_discount_amount || 0)));
              const restaurantName = (order.restaurants as any)?.name || "Restaurant";
              return (
                <div key={order.id} className="flex items-center justify-between p-3 rounded-xl border bg-card">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-8 h-8 rounded-lg bg-violet-100 flex items-center justify-center shrink-0">
                      <Crown className="h-4 w-4 text-violet-500" />
                    </div>
                    <div className="min-w-0">
                      <p className="font-medium text-sm truncate">{restaurantName}</p>
                      <p className="text-xs text-muted-foreground">
                        {new Date(order.created_at).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" })}
                        {order.order_reference ? ` · #${order.order_reference}` : ""}
                      </p>
                    </div>
                  </div>
                  <div className="text-right shrink-0 ml-2">
                    <p className="text-sm font-bold">{Number(order.total_amount).toFixed(2)} CHF</p>
                    {saved > 0 && (
                      <p className="text-xs text-emerald-600 font-medium">-{saved.toFixed(2)} CHF avantages</p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="rounded-xl border border-dashed p-6 text-center">
            <p className="text-sm text-muted-foreground">
              {isActive
                ? "Aucune commande avec Tok One pour l'instant. Passez votre premiere commande pour voir vos economies ici."
                : "Abonnez-vous a Tok One pour commencer a profiter de la livraison gratuite et voir vos economies ici."}
            </p>
          </div>
        )}
      </div>

      {/* Payment history */}
      {payments && payments.length > 0 && (
        <div className="space-y-3">
          <h3 className="font-bold text-lg flex items-center gap-2">
            <CreditCard className="h-5 w-5 text-violet-500" />
            Historique des paiements
          </h3>
          <div className="space-y-2">
            {payments.map((payment: any) => {
              const meta = (payment.metadata || {}) as any;
              const period = meta.billing_period === "yearly" ? "Annuel" : "Mensuel";
              return (
                <div key={payment.id} className="flex items-center justify-between p-3 rounded-xl border bg-card">
                  <div>
                    <p className="font-medium text-sm">Abonnement Tok One — {period}</p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(payment.created_at).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })}
                    </p>
                  </div>
                  <p className="text-sm font-bold">{Number(payment.amount).toFixed(2)} CHF</p>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function LoyaltyHistory({ userId }: { userId?: string }) {
  const { data: transactions, isLoading } = useQuery({
    queryKey: ["loyalty-transactions", userId],
    queryFn: async () => {
      const { data } = await supabase
        .from("loyalty_transactions")
        .select("*")
        .eq("user_id", userId!)
        .order("created_at", { ascending: false })
        .limit(20);
      return (data || []) as LoyaltyTransaction[];
    },
    enabled: !!userId,
  });

  if (isLoading) return <p className="text-sm text-muted-foreground">Chargement...</p>;
  if (!transactions || transactions.length === 0) {
    return <p className="text-sm text-muted-foreground">Aucune transaction pour le moment.</p>;
  }

  return (
    <div className="space-y-3">
      {transactions.map((transaction) => (
        <div key={transaction.id} className="flex items-center justify-between p-3 border rounded-xl bg-card">
          <div>
            <p className="font-semibold text-sm">{transaction.description || "Mouvement de points"}</p>
            <p className="text-xs text-muted-foreground">{new Date(transaction.created_at).toLocaleDateString()}</p>
          </div>
          <div className={`font-bold ${transaction.amount > 0 ? "text-green-600" : "text-destructive"}`}>
            {transaction.amount > 0 ? "+" : ""}{transaction.amount} pts
          </div>
        </div>
      ))}
    </div>
  );
}
