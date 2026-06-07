import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  CalendarDays,
  CheckCircle2,
  ClipboardCheck,
  History,
  RefreshCw,
  Search,
  Send,
  ShieldCheck,
  Sparkles,
  Store,
  Truck,
  XCircle,
} from "lucide-react";

import DashboardPageHero from "@/components/dashboard/DashboardPageHero";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { getSupabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { scoreRestaurantCatalogQuality } from "@/lib/catalogQuality";

const supabase = getSupabase();

type AdminRestaurant = {
  id: string;
  name: string;
  city: string | null;
  cuisine_type: string | null;
  image_url: string | null;
  is_active: boolean | null;
  is_featured: boolean | null;
  status: string | null;
  supports_pickup: boolean | null;
  supports_dinein: boolean | null;
  supports_reservation: boolean | null;
  avg_rating: number | null;
  rating_count: number | null;
  min_order_amount: number | null;
  base_delivery_fee: number | null;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  opening_hours: unknown;
  disabled_payment_methods: string[] | null;
  menu_items_count?: number;
};

type AdminRestaurantPatch = Partial<
  Pick<
    AdminRestaurant,
    "is_active" | "is_featured" | "status" | "supports_pickup" | "supports_dinein" | "supports_reservation"
  >
>;

type RestaurantSummary = Record<string, number | string | boolean | null | undefined>;

type RestaurantHistoryEntry = {
  id: string;
  action: string;
  created_at: string | null;
  user_id: string | null;
  old_data: unknown;
  new_data: unknown;
};

type RestaurantAdminDetail = {
  restaurant: {
    id: string;
    name: string;
    legal_name?: string | null;
    owner_id?: string | null;
    city?: string | null;
    address?: string | null;
    cuisine_type?: string | null;
    phone?: string | null;
    image_url?: string | null;
    is_active?: boolean | null;
    is_featured?: boolean | null;
    status?: string | null;
    supports_pickup?: boolean | null;
    supports_dinein?: boolean | null;
    supports_reservation?: boolean | null;
    stripe_account_id?: string | null;
    created_at?: string | null;
    updated_at?: string | null;
  };
  quality: {
    score: number;
    publishable: boolean;
    missing_fields: string[];
    menu_items_count: number;
    checks: Record<string, boolean>;
  };
  orders_summary: RestaurantSummary;
  reservations_summary: RestaurantSummary;
  reviews_summary: RestaurantSummary;
  campaigns_summary: RestaurantSummary;
  invoices_summary: RestaurantSummary;
  incidents_summary: RestaurantSummary;
  payment_health: RestaurantSummary & {
    stripe_account_id?: string | null;
    stripe_connect_configured?: boolean | null;
    payout_schedule?: string | null;
    commission_rate?: number | null;
    invoice_settings_configured?: boolean | null;
    iban_configured?: boolean | null;
    last_failed_payment_at?: string | null;
    payouts_pending?: number | null;
  };
  recent_history: RestaurantHistoryEntry[];
};

const STATUS_OPTIONS = [
  { value: "active", label: "Actif" },
  { value: "pending", label: "En attente" },
  { value: "paused", label: "En pause" },
  { value: "suspended", label: "Suspendu" },
  { value: "archived", label: "Archivé" },
];

const DEFAULT_PAYMENT_METHODS = ["card", "cash", "twint"];
const CATALOG_MISSING_FIELD_LABELS: Record<string, string> = {
  image: "image",
  address: "adresse",
  coordinates: "coordonnées",
  opening_hours: "horaires",
  menu: "menu",
  payment_methods: "paiement",
  cuisine: "cuisine",
};

function getEnabledPaymentMethods(restaurant: AdminRestaurant) {
  const disabled = new Set((restaurant.disabled_payment_methods || []).map((method) => method.trim().toLowerCase()));
  return DEFAULT_PAYMENT_METHODS.filter((method) => !disabled.has(method));
}

function getCatalogQuality(restaurant: AdminRestaurant) {
  return scoreRestaurantCatalogQuality({
    image_url: restaurant.image_url,
    address: restaurant.address,
    latitude: restaurant.latitude,
    longitude: restaurant.longitude,
    opening_hours: restaurant.opening_hours,
    menu_items_count: restaurant.menu_items_count || 0,
    payment_methods: getEnabledPaymentMethods(restaurant),
    cuisine_type: restaurant.cuisine_type,
  });
}

function formatMissingFields(fields: string[]) {
  return fields.map((field) => CATALOG_MISSING_FIELD_LABELS[field] || field).join(", ");
}

function formatDateTime(value?: string | null) {
  if (!value) return "Jamais";
  return new Intl.DateTimeFormat("fr-CH", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
}

function formatMoney(value: unknown) {
  return new Intl.NumberFormat("fr-CH", {
    style: "currency",
    currency: "CHF",
    maximumFractionDigits: 2,
  }).format(Number(value || 0));
}

function asNumber(summary: RestaurantSummary | undefined, key: string) {
  return Number(summary?.[key] || 0);
}

function statusBadgeVariant(isActive?: boolean | null) {
  return isActive ? "default" : "secondary";
}

function CatalogQualityNotice({ restaurant }: { restaurant: AdminRestaurant }) {
  const quality = getCatalogQuality(restaurant);

  return (
    <>
      <Badge
        variant="outline"
        className={quality.publishable ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-amber-200 bg-amber-50 text-amber-800"}
      >
        Catalogue {quality.score}%
      </Badge>
      {!quality.publishable ? (
        <p className="text-xs text-amber-700">À compléter: {formatMissingFields(quality.missingFields)}</p>
      ) : null}
    </>
  );
}

function QualityCheck({ label, valid }: { label: string; valid: boolean }) {
  const Icon = valid ? CheckCircle2 : XCircle;
  return (
    <div className="flex items-center justify-between gap-3 border-b py-2 text-sm last:border-b-0">
      <span>{label}</span>
      <span className={valid ? "inline-flex items-center gap-1 text-emerald-700" : "inline-flex items-center gap-1 text-amber-700"}>
        <Icon className="h-4 w-4" />
        {valid ? "OK" : "Manquant"}
      </span>
    </div>
  );
}

function MetricTile({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg border px-3 py-2">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-lg font-semibold">{value}</p>
    </div>
  );
}

type RestaurantDetailPanelProps = {
  detail: RestaurantAdminDetail | null | undefined;
  isLoading: boolean;
  overrideReason: string;
  actionReason: string;
  onOverrideReasonChange: (value: string) => void;
  onActionReasonChange: (value: string) => void;
  onClose: () => void;
  onRefresh: () => void;
  onSuspend: () => void;
  onActivateOverride: () => void;
  onRequestCorrection: () => void;
  onReindexCatalog: () => void;
  onSendNotification: () => void;
};

function RestaurantDetailPanel({
  detail,
  isLoading,
  overrideReason,
  actionReason,
  onOverrideReasonChange,
  onActionReasonChange,
  onClose,
  onRefresh,
  onSuspend,
  onActivateOverride,
  onRequestCorrection,
  onReindexCatalog,
  onSendNotification,
}: RestaurantDetailPanelProps) {
  if (isLoading) {
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        <DialogHeader className="shrink-0 border-b px-5 py-5 pr-14 text-left sm:px-6">
          <DialogTitle>Fiche restaurant</DialogTitle>
          <DialogDescription>Chargement des contrôles restaurant, paiements et historique.</DialogDescription>
        </DialogHeader>
        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain px-5 py-5 sm:px-6">
          <div className="h-5 w-48 rounded bg-muted animate-pulse" />
          <div className="grid gap-3 md:grid-cols-3">
            {[1, 2, 3].map((index) => (
              <div key={index} className="h-24 rounded-lg bg-muted animate-pulse" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (!detail) {
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        <DialogHeader className="shrink-0 border-b px-5 py-5 pr-14 text-left sm:px-6">
          <DialogTitle>Fiche restaurant</DialogTitle>
          <DialogDescription>Aucune donnée détaillée n'est disponible pour ce restaurant.</DialogDescription>
        </DialogHeader>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-5 text-sm text-muted-foreground sm:px-6">
          Fermez la fiche puis réessayez depuis la liste.
        </div>
      </div>
    );
  }

  const missingFields = detail.quality?.missing_fields || [];
  const checks = detail.quality?.checks || {};
  const paymentHealth = detail.payment_health || {};

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <DialogHeader className="shrink-0 space-y-3 border-b px-5 py-5 pr-14 text-left sm:px-6">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <DialogTitle className="text-lg">Fiche restaurant</DialogTitle>
              <Badge variant={statusBadgeVariant(detail.restaurant.is_active)}>
                {detail.restaurant.is_active ? "Actif" : "Inactif"}
              </Badge>
              <Badge variant="outline">{detail.restaurant.status || "Statut inconnu"}</Badge>
              {detail.restaurant.is_featured ? <Badge variant="outline">Mis en avant</Badge> : null}
            </div>
            <div>
              <p className="text-sm font-semibold">{detail.restaurant.name}</p>
              <DialogDescription className="text-xs text-muted-foreground">
                {[detail.restaurant.city, detail.restaurant.cuisine_type].filter(Boolean).join(" | ") || "Informations incomplètes"}
              </DialogDescription>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={onRefresh}>
              <RefreshCw className="mr-2 h-4 w-4" />
              Rafraîchir
            </Button>
            <Button variant="outline" size="sm" onClick={onClose}>
              Fermer
            </Button>
          </div>
        </div>
      </DialogHeader>
      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto overscroll-contain px-5 py-5 sm:px-6">
        <div className="grid gap-4 xl:grid-cols-[1fr_1fr]">
          <section className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold">Qualité catalogue</h3>
                <p className="text-xs text-muted-foreground">
                  Score {detail.quality.score}% · {detail.quality.menu_items_count} article(s) actif(s)
                </p>
              </div>
              <Badge
                variant="outline"
                className={
                  detail.quality.publishable
                    ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                    : "border-amber-200 bg-amber-50 text-amber-800"
                }
              >
                {detail.quality.publishable ? "Publiable" : "À compléter"}
              </Badge>
            </div>
            <div className="rounded-lg border px-3">
              <QualityCheck label="Image" valid={Boolean(checks.image)} />
              <QualityCheck label="Adresse" valid={Boolean(checks.address)} />
              <QualityCheck label="Coordonnées" valid={Boolean(checks.coordinates)} />
              <QualityCheck label="Horaires" valid={Boolean(checks.opening_hours)} />
              <QualityCheck label="Menu" valid={Boolean(checks.menu)} />
              <QualityCheck label="Paiement" valid={Boolean(checks.payment_methods)} />
              <QualityCheck label="Cuisine" valid={Boolean(checks.cuisine)} />
            </div>
            {!detail.quality.publishable ? (
              <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                <AlertTriangle className="mt-0.5 h-4 w-4 flex-none" />
                <span>Activation bloquée sans override: {formatMissingFields(missingFields)}</span>
              </div>
            ) : null}
          </section>

          <section className="space-y-3">
            <div>
              <h3 className="text-sm font-semibold">Santé paiement</h3>
              <p className="text-xs text-muted-foreground">
                Stripe Connect, facturation et paiements restaurant.
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <MetricTile label="Stripe Connect" value={paymentHealth.stripe_connect_configured ? "Configuré" : "Absent"} />
              <MetricTile label="IBAN facture" value={paymentHealth.iban_configured ? "Configuré" : "Absent"} />
              <MetricTile label="Payouts en attente" value={asNumber(paymentHealth, "payouts_pending")} />
              <MetricTile label="Commission" value={`${Number(paymentHealth.commission_rate || 0).toFixed(2)}%`} />
            </div>
            <div className="rounded-lg border px-3 py-2 text-sm">
              <div className="flex items-center justify-between gap-3">
                <span className="text-muted-foreground">Compte Stripe</span>
                <span className="font-medium">{paymentHealth.stripe_account_id || "Non renseigné"}</span>
              </div>
              <div className="mt-2 flex items-center justify-between gap-3">
                <span className="text-muted-foreground">Dernier échec paiement</span>
                <span className="font-medium">{formatDateTime(paymentHealth.last_failed_payment_at as string | null)}</span>
              </div>
            </div>
          </section>
        </div>

        <section className="space-y-3">
          <h3 className="text-sm font-semibold">Activité liée</h3>
          <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-6">
            <MetricTile label="Commandes" value={asNumber(detail.orders_summary, "total")} />
            <MetricTile label="Commandes ouvertes" value={asNumber(detail.orders_summary, "active")} />
            <MetricTile label="Réservations" value={asNumber(detail.reservations_summary, "total")} />
            <MetricTile label="Avis" value={asNumber(detail.reviews_summary, "total")} />
            <MetricTile label="Campagnes actives" value={asNumber(detail.campaigns_summary, "active")} />
            <MetricTile label="Incidents ouverts" value={asNumber(detail.incidents_summary, "open")} />
          </div>
          <div className="grid gap-3 md:grid-cols-3">
            <MetricTile label="CA payé" value={formatMoney(detail.orders_summary?.revenue_chf)} />
            <MetricTile label="Factures ouvertes" value={asNumber(detail.invoices_summary, "open")} />
            <MetricTile label="Impayés factures" value={formatMoney(detail.invoices_summary?.unpaid_chf)} />
          </div>
        </section>

        <section className="grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
          <div className="space-y-3">
            <h3 className="text-sm font-semibold">Actions</h3>
            <Textarea
              value={overrideReason}
              onChange={(event) => onOverrideReasonChange(event.target.value)}
              placeholder="Raison d'override pour une activation incomplète"
              className="min-h-20"
            />
            <Textarea
              value={actionReason}
              onChange={(event) => onActionReasonChange(event.target.value)}
              placeholder="Note pour correction ou notification"
              className="min-h-20"
            />
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" onClick={onActivateOverride}>
                <ShieldCheck className="mr-2 h-4 w-4" />
                Activer avec override
              </Button>
              <Button variant="outline" size="sm" onClick={onSuspend}>
                <AlertTriangle className="mr-2 h-4 w-4" />
                Suspendre
              </Button>
              <Button variant="outline" size="sm" onClick={onRequestCorrection}>
                <ClipboardCheck className="mr-2 h-4 w-4" />
                Demander correction
              </Button>
              <Button variant="outline" size="sm" onClick={onReindexCatalog}>
                <RefreshCw className="mr-2 h-4 w-4" />
                Réindexer catalogue
              </Button>
              <Button variant="outline" size="sm" onClick={onSendNotification}>
                <Send className="mr-2 h-4 w-4" />
                Envoyer notification
              </Button>
            </div>
          </div>

          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <History className="h-4 w-4 text-muted-foreground" />
              <h3 className="text-sm font-semibold">Historique</h3>
            </div>
            <div className="max-h-64 overflow-auto rounded-lg border">
              {detail.recent_history.length === 0 ? (
                <p className="px-3 py-6 text-center text-sm text-muted-foreground">Aucune action auditée.</p>
              ) : (
                <div className="divide-y">
                  {detail.recent_history.map((entry) => (
                    <div key={entry.id} className="px-3 py-2 text-sm">
                      <div className="flex items-center justify-between gap-3">
                        <span className="font-medium">{entry.action}</span>
                        <span className="text-xs text-muted-foreground">{formatDateTime(entry.created_at)}</span>
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">{entry.user_id || "Utilisateur système"}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

export default function AdminRestaurants() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [visibilityFilter, setVisibilityFilter] = useState("all");
  const [selectedRestaurantId, setSelectedRestaurantId] = useState<string | null>(null);
  const [overrideReason, setOverrideReason] = useState("");
  const [actionReason, setActionReason] = useState("");

  const { data: restaurants = [], isLoading, error } = useQuery({
    queryKey: ["admin-restaurants"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("restaurants")
        .select(
          "id, name, city, cuisine_type, image_url, is_active, is_featured, status, supports_pickup, supports_dinein, supports_reservation, avg_rating, rating_count, min_order_amount, base_delivery_fee, address, latitude, longitude, opening_hours, disabled_payment_methods",
        )
        .order("name");

      if (error) throw error;
      const restaurantRows = (data || []) as AdminRestaurant[];
      const restaurantIds = restaurantRows.map((restaurant) => restaurant.id);
      const menuCountByRestaurant = new Map<string, number>();

      if (restaurantIds.length > 0) {
        const { data: menuItems, error: menuError } = await supabase
          .from("menu_items")
          .select("restaurant_id")
          .eq("is_available", true)
          .in("restaurant_id", restaurantIds);

        if (menuError) throw menuError;

        for (const item of menuItems || []) {
          menuCountByRestaurant.set(item.restaurant_id, (menuCountByRestaurant.get(item.restaurant_id) || 0) + 1);
        }
      }

      return restaurantRows.map((restaurant) => ({
        ...restaurant,
        menu_items_count: menuCountByRestaurant.get(restaurant.id) || 0,
      }));
    },
  });

  const selectedRestaurant = useMemo(
    () => restaurants.find((restaurant) => restaurant.id === selectedRestaurantId) || null,
    [restaurants, selectedRestaurantId],
  );

  const {
    data: restaurantDetail,
    isFetching: isDetailLoading,
    refetch: refetchRestaurantDetail,
  } = useQuery({
    queryKey: ["admin-restaurant-detail", selectedRestaurantId],
    enabled: Boolean(selectedRestaurantId),
    queryFn: async () => {
      const { data, error } = await (supabase.rpc as any)("admin_get_restaurant_admin_detail", {
        p_restaurant_id: selectedRestaurantId,
      });

      if (error) throw error;
      return data as RestaurantAdminDetail;
    },
  });

  const filteredRestaurants = useMemo(() => {
    const term = search.trim().toLowerCase();
    return restaurants.filter((restaurant) => {
      const matchesSearch =
        !term ||
        restaurant.name.toLowerCase().includes(term) ||
        (restaurant.city || "").toLowerCase().includes(term) ||
        (restaurant.cuisine_type || "").toLowerCase().includes(term) ||
        restaurant.id.toLowerCase().includes(term);

      const isActive = restaurant.is_active ?? true;
      const quality = getCatalogQuality(restaurant);
      const matchesVisibility =
        visibilityFilter === "all" ||
        (visibilityFilter === "active" && isActive) ||
        (visibilityFilter === "inactive" && !isActive) ||
        (visibilityFilter === "featured" && (restaurant.is_featured ?? false)) ||
        (visibilityFilter === "incomplete" && !quality.publishable);

      return matchesSearch && matchesVisibility;
    });
  }, [restaurants, search, visibilityFilter]);

  const stats = useMemo(() => {
    return {
      total: restaurants.length,
      active: restaurants.filter((restaurant) => restaurant.is_active ?? true).length,
      featured: restaurants.filter((restaurant) => restaurant.is_featured ?? false).length,
      reservationReady: restaurants.filter((restaurant) => restaurant.supports_reservation ?? false).length,
      catalogReady: restaurants.filter((restaurant) => getCatalogQuality(restaurant).publishable).length,
    };
  }, [restaurants]);

  const invalidateRestaurantQueries = (restaurantId: string) => {
    queryClient.invalidateQueries({ queryKey: ["admin-restaurants"] });
    queryClient.invalidateQueries({ queryKey: ["admin-restaurant-detail", restaurantId] });
  };

  const updateRestaurant = async (
    restaurant: AdminRestaurant,
    patch: AdminRestaurantPatch,
    successTitle: string,
    options: { override?: boolean; reason?: string | null } = {},
  ) => {
    const quality = getCatalogQuality(restaurant);
    const activationRequested = patch.is_active === true || patch.status === "active";
    let reason = options.reason?.trim() || null;
    let override = options.override || false;

    if (activationRequested && !quality.publishable) {
      const fallbackReason = overrideReason.trim();
      reason =
        reason ||
        fallbackReason ||
        window.prompt(`Raison d'override requise. Champs manquants: ${formatMissingFields(quality.missingFields)}`)?.trim() ||
        null;

      if (!reason) {
        toast({
          title: "Activation bloquée",
          description: "Une raison d'override est obligatoire pour activer un restaurant incomplet.",
          variant: "destructive",
        });
        return;
      }

      override = true;
      setOverrideReason(reason);
    }

    const { error: rpcError } = await (supabase.rpc as any)("admin_update_restaurant_admin_state", {
      p_restaurant_id: restaurant.id,
      p_patch: patch,
      p_reason: reason,
      p_override: override,
    });

    if (rpcError) {
      toast({ title: "Erreur", description: rpcError.message, variant: "destructive" });
      return;
    }

    invalidateRestaurantQueries(restaurant.id);
    toast({ title: successTitle });
  };

  const recordRestaurantAction = async (action: string, successTitle: string, requiresReason = false) => {
    if (!selectedRestaurantId) return;
    const reason = actionReason.trim();

    if (requiresReason && !reason) {
      toast({
        title: "Note requise",
        description: "Ajoutez une note avant de journaliser cette action.",
        variant: "destructive",
      });
      return;
    }

    const { error: rpcError } = await (supabase.rpc as any)("admin_record_restaurant_admin_action", {
      p_restaurant_id: selectedRestaurantId,
      p_action: action,
      p_reason: reason || null,
    });

    if (rpcError) {
      toast({ title: "Erreur", description: rpcError.message, variant: "destructive" });
      return;
    }

    invalidateRestaurantQueries(selectedRestaurantId);
    toast({ title: successTitle });
  };

  const openRestaurantDetail = (restaurantId: string) => {
    setOverrideReason("");
    setActionReason("");
    setSelectedRestaurantId(restaurantId);
  };

  const closeRestaurantDetail = () => {
    setSelectedRestaurantId(null);
    setOverrideReason("");
    setActionReason("");
  };

  const handleActivateOverride = () => {
    if (!selectedRestaurant) return;
    const reason = overrideReason.trim();

    if (!reason) {
      toast({
        title: "Raison requise",
        description: "Ajoutez une raison avant de forcer l'activation.",
        variant: "destructive",
      });
      return;
    }

    updateRestaurant(selectedRestaurant, { is_active: true, status: "active" }, "Restaurant activé avec override", {
      override: true,
      reason,
    });
  };

  if (error) {
    return (
      <div className="container py-8">
        <Card>
          <CardContent className="py-10 text-center text-destructive">Impossible de charger les restaurants.</CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container py-8 space-y-6">
      <DashboardPageHero
        badge="Admin restaurants"
        title="Gestion des restaurants"
        description="Activez les restaurants, gérez leur visibilité, leurs options de service et les mises en avant depuis une vue de pilotage."
        icon={Store}
        tone="emerald"
        visualLabel="Restaurants"
        stats={[
          { label: "Restaurants", value: stats.total, icon: Store },
          { label: "Actifs", value: stats.active, icon: Sparkles },
          { label: "Catalogues OK", value: stats.catalogReady, icon: Sparkles },
        ]}
      />

      <div className="flex justify-end">
        <Button asChild variant="outline" className="gap-2">
          <Link to="/admin/restaurants/google-business">
            <ClipboardCheck className="h-4 w-4" />
            Boutons Google Business
          </Link>
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-5">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">Restaurants</CardTitle>
            <Store className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{stats.total}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">Actifs</CardTitle>
            <Badge variant="secondary" className="bg-emerald-100 text-emerald-800">
              Live
            </Badge>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{stats.active}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">Mis en avant</CardTitle>
            <Sparkles className="h-4 w-4 text-amber-500" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{stats.featured}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">Catalogues OK</CardTitle>
            <Sparkles className="h-4 w-4 text-emerald-500" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{stats.catalogReady}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">Réservations</CardTitle>
            <CalendarDays className="h-4 w-4 text-sky-500" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{stats.reservationReady}</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="flex flex-col gap-3 py-4 md:flex-row md:items-center">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Rechercher par nom, ville, cuisine ou id"
              className="pl-9"
            />
          </div>
          <select
            value={visibilityFilter}
            onChange={(event) => setVisibilityFilter(event.target.value)}
            className="h-10 rounded-md border bg-background px-3 text-sm"
          >
            <option value="all">Tous</option>
            <option value="active">Actifs</option>
            <option value="inactive">Inactifs</option>
            <option value="featured">Mis en avant</option>
            <option value="incomplete">À compléter</option>
          </select>
        </CardContent>
      </Card>

      <Dialog
        open={Boolean(selectedRestaurantId)}
        onOpenChange={(open) => {
          if (!open) closeRestaurantDetail();
        }}
      >
        <DialogContent className="flex h-[calc(100dvh-1rem)] max-h-[calc(100dvh-1rem)] w-[calc(100vw-1rem)] max-w-6xl flex-col gap-0 overflow-hidden p-0 sm:h-[min(880px,calc(100dvh-2rem))] sm:max-h-[calc(100dvh-2rem)]">
          <RestaurantDetailPanel
            detail={restaurantDetail}
            isLoading={isDetailLoading}
            overrideReason={overrideReason}
            actionReason={actionReason}
            onOverrideReasonChange={setOverrideReason}
            onActionReasonChange={setActionReason}
            onClose={closeRestaurantDetail}
            onRefresh={() => refetchRestaurantDetail()}
            onSuspend={() =>
              selectedRestaurant &&
              updateRestaurant(selectedRestaurant, { is_active: false, status: "suspended" }, "Restaurant suspendu", {
                reason: actionReason.trim() || null,
              })
            }
            onActivateOverride={handleActivateOverride}
            onRequestCorrection={() => recordRestaurantAction("request_correction", "Demande de correction journalisée", true)}
            onReindexCatalog={() => recordRestaurantAction("reindex_catalog", "Réindexation catalogue journalisée")}
            onSendNotification={() => recordRestaurantAction("send_notification", "Notification restaurant envoyée", true)}
          />
        </DialogContent>
      </Dialog>

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((index) => (
            <div key={index} className="h-36 rounded-xl bg-muted animate-pulse" />
          ))}
        </div>
      ) : filteredRestaurants.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground">Aucun restaurant ne correspond au filtre.</CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {filteredRestaurants.map((restaurant) => (
            <Card key={restaurant.id} className={restaurant.id === selectedRestaurantId ? "border-primary" : undefined}>
              <CardContent className="py-4">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-center">
                  <div className="flex min-w-0 flex-1 items-start gap-4">
                    <img
                      src={restaurant.image_url || "/images/kebab-box-spread.jpeg"}
                      alt={restaurant.name}
                      className="h-16 w-16 rounded-xl object-cover"
                    />
                    <div className="min-w-0 space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-sm font-semibold">{restaurant.name}</h3>
                        <Badge variant={restaurant.is_active ? "default" : "secondary"}>
                          {restaurant.is_active ? "Actif" : "Inactif"}
                        </Badge>
                        {restaurant.is_featured ? <Badge variant="outline">Mis en avant</Badge> : null}
                        {restaurant.supports_reservation ? <Badge variant="outline">Réservation</Badge> : null}
                        <CatalogQualityNotice restaurant={restaurant} />
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {[restaurant.city, restaurant.cuisine_type].filter(Boolean).join(" | ") || "Informations incomplètes"}
                      </p>
                      <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
                        <span className="inline-flex items-center gap-1">
                          <Sparkles className="h-3 w-3 text-amber-500" />
                          {Number(restaurant.avg_rating || 0).toFixed(1)} ({restaurant.rating_count || 0} avis)
                        </span>
                        <span className="inline-flex items-center gap-1">
                          <Truck className="h-3 w-3" />
                          Livraison {Number(restaurant.base_delivery_fee || 0).toFixed(2)} CHF
                        </span>
                        <span>Minimum {Number(restaurant.min_order_amount || 0).toFixed(2)} CHF</span>
                      </div>
                    </div>
                  </div>

                  <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                    <label className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2 text-sm">
                      <span>Actif</span>
                      <Switch
                        checked={restaurant.is_active ?? true}
                        onCheckedChange={(checked) =>
                          updateRestaurant(restaurant, { is_active: checked }, checked ? "Restaurant activé" : "Restaurant désactivé")
                        }
                      />
                    </label>
                    <label className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2 text-sm">
                      <span>Mise en avant</span>
                      <Switch
                        checked={restaurant.is_featured ?? false}
                        onCheckedChange={(checked) =>
                          updateRestaurant(
                            restaurant,
                            { is_featured: checked },
                            checked ? "Restaurant mis en avant" : "Restaurant retiré de la sélection",
                          )
                        }
                      />
                    </label>
                    <label className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2 text-sm">
                      <span>Réservations</span>
                      <Switch
                        checked={restaurant.supports_reservation ?? false}
                        onCheckedChange={(checked) =>
                          updateRestaurant(
                            restaurant,
                            { supports_reservation: checked },
                            checked ? "Réservations activées" : "Réservations désactivées",
                          )
                        }
                      />
                    </label>
                    <div className="rounded-lg border px-3 py-2 text-sm">
                      <p className="mb-2 text-xs text-muted-foreground">Statut</p>
                      <select
                        value={restaurant.status || "active"}
                        onChange={(event) =>
                          updateRestaurant(restaurant, { status: event.target.value }, "Statut du restaurant mis à jour")
                        }
                        className="w-full rounded-md border bg-background px-2 py-1.5 text-sm"
                      >
                        {STATUS_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>

                <div className="mt-4 flex flex-wrap gap-2">
                  <Button variant="outline" size="sm" onClick={() => openRestaurantDetail(restaurant.id)}>
                    <ClipboardCheck className="mr-2 h-4 w-4" />
                    Fiche
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      updateRestaurant(
                        restaurant,
                        { supports_pickup: !(restaurant.supports_pickup ?? true) },
                        restaurant.supports_pickup ? "Retrait désactivé" : "Retrait activé",
                      )
                    }
                  >
                    {restaurant.supports_pickup ? "Désactiver retrait" : "Activer retrait"}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      updateRestaurant(
                        restaurant,
                        { supports_dinein: !(restaurant.supports_dinein ?? false) },
                        restaurant.supports_dinein ? "Sur place désactivé" : "Sur place activé",
                      )
                    }
                  >
                    {restaurant.supports_dinein ? "Désactiver sur place" : "Activer sur place"}
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
