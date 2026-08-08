import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowLeft,
  Calendar,
  CheckCircle2,
  Crown,
  CreditCard,
  Loader2,
  Lock,
  RotateCcw,
  Search,
  ShieldCheck,
  Unlock,
} from "lucide-react";
import { toast } from "sonner";

import DashboardPageHero from "@/components/dashboard/DashboardPageHero";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
  useAdminRestaurantSubscriptions,
  useUpdateRestaurantFeatures,
  type AdminRestaurantSubscription,
} from "@/hooks/useAdminLaunchPacks";
import {
  ALL_GATABLE_FEATURES,
  computeDisabledFeatures,
  isPremiumOrEliteRestaurantSubscription,
  type GatableFeatureKey,
  type RestaurantSubscriptionFeatureAccess,
} from "@/lib/packFeatureGating";

const STATUS_FILTER_OPTIONS = [
  { value: "all", label: "Tous les abonnements" },
  { value: "active", label: "Actifs / essai" },
  { value: "premium_elite", label: "Premium & Élite" },
  { value: "starter_pro", label: "Starter & Pro" },
  { value: "past_due", label: "Paiement en retard" },
  { value: "cancelled", label: "Annulés" },
] as const;

const ACTIVE_SUBSCRIPTION_STATUSES = new Set(["active", "trialing"]);

function getSubscriptionAccess(subscription: AdminRestaurantSubscription): RestaurantSubscriptionFeatureAccess {
  return {
    plan: subscription.plan,
    slug: subscription.plan_record?.slug || subscription.plan,
    status: subscription.status,
    current_period_end: subscription.current_period_end,
    features: subscription.plan_record?.features || [],
  };
}

function getPlanSlug(subscription: AdminRestaurantSubscription) {
  return String(subscription.plan_record?.slug || subscription.plan || "").toLowerCase();
}

function isActiveSubscription(subscription: AdminRestaurantSubscription) {
  return ACTIVE_SUBSCRIPTION_STATUSES.has(String(subscription.status || "").toLowerCase());
}

function formatDate(value: string | null | undefined) {
  if (!value) return "Non défini";
  return new Date(value).toLocaleDateString("fr-CH", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function formatPlanPrice(subscription: AdminRestaurantSubscription) {
  const price = Number(subscription.plan_record?.price_monthly_chf || 0);
  if (!Number.isFinite(price) || price <= 0) return "Prix non défini";
  return `${price.toLocaleString("fr-CH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} CHF / mois`;
}

function getStatusLabel(status: string | null | undefined) {
  switch (status) {
    case "trialing":
      return "Essai actif";
    case "active":
      return "Actif";
    case "past_due":
      return "Paiement en retard";
    case "paused":
      return "En pause";
    case "cancelled":
    case "canceled":
      return "Annulé";
    default:
      return "Non configuré";
  }
}

function getStatusClass(status: string | null | undefined) {
  switch (status) {
    case "trialing":
    case "active":
      return "bg-emerald-100 text-emerald-800";
    case "past_due":
      return "bg-amber-100 text-amber-800";
    case "paused":
      return "bg-slate-100 text-slate-700";
    case "cancelled":
    case "canceled":
      return "bg-red-100 text-red-800";
    default:
      return "bg-muted text-muted-foreground";
  }
}

function FeatureGatingEditor({ subscription }: { subscription: AdminRestaurantSubscription }) {
  const updateFeatures = useUpdateRestaurantFeatures();
  const currentDisabled = new Set<string>(
    Array.isArray(subscription.restaurants?.disabled_dashboard_features)
      ? subscription.restaurants.disabled_dashboard_features
      : [],
  );
  const [draft, setDraft] = useState<Set<string>>(currentDisabled);
  const [saving, setSaving] = useState(false);
  const subscriptionDefault = new Set<GatableFeatureKey>(
    computeDisabledFeatures([], { subscription: getSubscriptionAccess(subscription) }),
  );

  useEffect(() => {
    setDraft(new Set(
      Array.isArray(subscription.restaurants?.disabled_dashboard_features)
        ? subscription.restaurants.disabled_dashboard_features
        : [],
    ));
  }, [subscription.restaurants?.disabled_dashboard_features]);

  const hasChanges = (() => {
    if (draft.size !== currentDisabled.size) return true;
    for (const feature of draft) if (!currentDisabled.has(feature)) return true;
    return false;
  })();

  function resetToSubscriptionDefaults() {
    setDraft(new Set(subscriptionDefault));
  }

  function toggle(key: string) {
    setDraft((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  async function handleSave() {
    if (!subscription.restaurants?.id) return;
    setSaving(true);
    try {
      await updateFeatures.mutateAsync({
        restaurantId: subscription.restaurants.id,
        disabledFeatures: Array.from(draft),
      });
      toast.success("Accès dashboard mis à jour");
    } catch {
      toast.error("Erreur lors de la mise à jour");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle className="text-base">Accès dashboard</CardTitle>
            <p className="mt-1 text-xs text-muted-foreground">
              Tous les abonnements ouvrent les services restaurateur. CRM clients et Actualités restent réservés aux abonnements Premium et Élite.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" variant="ghost" onClick={resetToSubscriptionDefaults} title="Réinitialiser selon l'abonnement">
              <RotateCcw className="mr-1 h-3 w-3" /> Défaut abonnement
            </Button>
            {hasChanges ? (
              <Button size="sm" onClick={handleSave} disabled={saving || !subscription.restaurants?.id}>
                {saving ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : null}
                Enregistrer
              </Button>
            ) : null}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {ALL_GATABLE_FEATURES.map((feature) => {
            const isEnabled = !draft.has(feature.key);
            const isSubscriptionDefault = !subscriptionDefault.has(feature.key);
            const isReserved = feature.key === "dashboard-crm" || feature.key === "dashboard-actualites";
            const isOverridden = isEnabled !== isSubscriptionDefault;

            return (
              <div
                key={feature.key}
                className="flex items-center justify-between rounded-lg border p-2 hover:bg-muted/30"
              >
                <div className="flex min-w-0 items-center gap-2">
                  {isEnabled ? (
                    <Unlock className="h-3 w-3 flex-shrink-0 text-green-500" />
                  ) : (
                    <Lock className="h-3 w-3 flex-shrink-0 text-muted-foreground" />
                  )}
                  <span className={`truncate text-sm ${isEnabled ? "" : "text-muted-foreground"}`}>
                    {feature.label}
                  </span>
                  {isReserved ? <Badge variant="outline" className="px-1 py-0 text-[9px]">Premium+</Badge> : null}
                  {isOverridden ? <Badge variant="outline" className="px-1 py-0 text-[9px]">override</Badge> : null}
                </div>
                <Switch checked={isEnabled} onCheckedChange={() => toggle(feature.key)} />
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

function SubscriptionDetailView({
  subscription,
  onBack,
}: {
  subscription: AdminRestaurantSubscription;
  onBack: () => void;
}) {
  const hasPremiumAccess = isPremiumOrEliteRestaurantSubscription(getSubscriptionAccess(subscription));
  const stripeReference = subscription.stripe_subscription_id || subscription.stripe_checkout_session_id || "Non lié";
  const planName = subscription.plan_record?.name || subscription.plan || "Abonnement restaurateur";

  return (
    <div className="space-y-6">
      <Button variant="ghost" size="sm" onClick={onBack}>
        <ArrowLeft className="mr-1 h-4 w-4" /> Retour
      </Button>

      <Card>
        <CardHeader>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <CardTitle className="text-xl">{subscription.restaurants?.name || "Restaurant"}</CardTitle>
              <p className="mt-1 text-sm text-muted-foreground">{planName} - {formatPlanPrice(subscription)}</p>
            </div>
            <Badge className={getStatusClass(subscription.status)}>{getStatusLabel(subscription.status)}</Badge>
          </div>
        </CardHeader>
        <CardContent className="grid gap-3 text-sm md:grid-cols-2">
          <div className="rounded-xl border bg-muted/20 p-3">
            <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Période</p>
            <p className="mt-1 font-medium">
              {formatDate(subscription.current_period_start)} - {formatDate(subscription.current_period_end)}
            </p>
          </div>
          <div className="rounded-xl border bg-muted/20 p-3">
            <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Stripe</p>
            <p className="mt-1 break-all font-mono text-xs">{stripeReference}</p>
          </div>
          <div className="rounded-xl border bg-muted/20 p-3">
            <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">CRM & Actualités</p>
            <p className="mt-1 font-medium">
              {hasPremiumAccess ? "Inclus dans cet abonnement" : "Réservé à Premium et Élite"}
            </p>
          </div>
          <div className="rounded-xl border bg-muted/20 p-3">
            <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Renouvellement</p>
            <p className="mt-1 font-medium">
              {subscription.cancel_at_period_end ? "Résiliation en fin de période" : "Renouvellement actif"}
            </p>
          </div>
        </CardContent>
      </Card>

      <FeatureGatingEditor subscription={subscription} />
    </div>
  );
}

export default function AdminLaunchPacks() {
  const { data: subscriptions, isLoading } = useAdminRestaurantSubscriptions();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [selectedSubscriptionId, setSelectedSubscriptionId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    if (!subscriptions) return [];
    const normalizedSearch = search.trim().toLowerCase();
    return subscriptions.filter((subscription) => {
      const planSlug = getPlanSlug(subscription);
      const hasPremiumAccess = isPremiumOrEliteRestaurantSubscription(getSubscriptionAccess(subscription));
      const matchesSearch =
        !normalizedSearch ||
        subscription.restaurants?.name?.toLowerCase().includes(normalizedSearch) ||
        subscription.plan_record?.name?.toLowerCase().includes(normalizedSearch) ||
        planSlug.includes(normalizedSearch);

      const matchesStatus =
        statusFilter === "all" ||
        (statusFilter === "active" && isActiveSubscription(subscription)) ||
        (statusFilter === "premium_elite" && hasPremiumAccess) ||
        (statusFilter === "starter_pro" && (planSlug === "starter" || planSlug === "pro")) ||
        subscription.status === statusFilter;

      return matchesSearch && matchesStatus;
    });
  }, [search, statusFilter, subscriptions]);

  const selectedSubscription = subscriptions?.find((subscription) => subscription.id === selectedSubscriptionId) || null;

  const stats = useMemo(() => {
    const rows = subscriptions || [];
    return {
      total: rows.length,
      active: rows.filter(isActiveSubscription).length,
      premiumElite: rows.filter((subscription) => isPremiumOrEliteRestaurantSubscription(getSubscriptionAccess(subscription))).length,
      cancelAtPeriodEnd: rows.filter((subscription) => subscription.cancel_at_period_end).length,
    };
  }, [subscriptions]);

  if (selectedSubscription) {
    return (
      <div className="container mx-auto max-w-4xl px-4 py-6">
        <SubscriptionDetailView
          subscription={selectedSubscription}
          onBack={() => setSelectedSubscriptionId(null)}
        />
      </div>
    );
  }

  return (
    <div className="container mx-auto max-w-6xl space-y-6 px-4 py-6">
      <DashboardPageHero
        badge="Services admin"
        title="Abonnements restaurateur"
        description="Supervisez les abonnements actifs, les accès dashboard et les droits Premium réservés au CRM clients et au fil d'actualité."
        icon={Crown}
        tone="violet"
        visualLabel="Abonnements"
        stats={[
          { label: "Total", value: stats.total, icon: CreditCard },
          { label: "Actifs", value: stats.active, icon: CheckCircle2 },
          { label: "Premium+", value: stats.premiumElite, icon: ShieldCheck },
          { label: "Fin de période", value: stats.cancelAtPeriodEnd, icon: Calendar },
        ]}
        actions={(
          <Button asChild variant="outline">
            <Link to="/admin">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Retour admin
            </Link>
          </Button>
        )}
      />

      <Card className="border-orange-200 bg-orange-50/60">
        <CardContent className="p-4 text-sm text-orange-900">
          Les packs de lancement ne sont plus commercialisés. Les restaurateurs sont pilotés par abonnement : tous les services sont inclus, sauf CRM clients et accès au fil d'actualité, réservés aux offres Premium et Élite.
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Card>
          <CardContent className="py-4 text-center">
            <p className="text-2xl font-bold">{stats.total}</p>
            <p className="text-xs text-muted-foreground">Abonnements</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-4 text-center">
            <p className="text-2xl font-bold text-emerald-600">{stats.active}</p>
            <p className="text-xs text-muted-foreground">Actifs</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-4 text-center">
            <p className="text-2xl font-bold text-violet-600">{stats.premiumElite}</p>
            <p className="text-xs text-muted-foreground">Premium / Élite</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-4 text-center">
            <p className="text-2xl font-bold text-amber-600">{stats.cancelAtPeriodEnd}</p>
            <p className="text-xs text-muted-foreground">Fin de période</p>
          </CardContent>
        </Card>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Rechercher un restaurant ou un abonnement..."
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-full sm:w-[220px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {STATUS_FILTER_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-primary" />
        </div>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Crown className="mb-3 h-10 w-10 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              {subscriptions && subscriptions.length > 0
                ? "Aucun abonnement ne correspond aux filtres."
                : "Aucun abonnement restaurateur pour le moment."}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {filtered.map((subscription) => {
            const planName = subscription.plan_record?.name || subscription.plan || "Abonnement";
            const hasPremiumAccess = isPremiumOrEliteRestaurantSubscription(getSubscriptionAccess(subscription));

            return (
              <Card
                key={subscription.id}
                className="cursor-pointer transition-shadow hover:shadow-md"
                onClick={() => setSelectedSubscriptionId(subscription.id)}
              >
                <CardContent className="py-4">
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-sm font-semibold">
                          {subscription.restaurants?.name || "Restaurant"}
                        </h3>
                        <Badge className={getStatusClass(subscription.status)}>{getStatusLabel(subscription.status)}</Badge>
                        <Badge variant="outline" className="text-xs">{planName}</Badge>
                        {hasPremiumAccess ? (
                          <Badge className="bg-violet-100 text-violet-800">CRM + Actualités</Badge>
                        ) : (
                          <Badge variant="outline" className="text-xs">CRM / Actualités verrouillés</Badge>
                        )}
                      </div>
                      <div className="mt-2 flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
                        <span>{formatPlanPrice(subscription)}</span>
                        <span>Fin le {formatDate(subscription.current_period_end)}</span>
                        <span>{subscription.cancel_at_period_end ? "Résiliation programmée" : "Renouvellement actif"}</span>
                      </div>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full sm:w-auto"
                      onClick={() => setSelectedSubscriptionId(subscription.id)}
                    >
                      Gérer les accès
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
