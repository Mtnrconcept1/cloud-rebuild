import { useMemo, useState, type ComponentType } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  CalendarClock,
  Clock3,
  Mail,
  MapPin,
  Phone,
  Search,
  ShoppingBag,
  Sparkles,
  Star,
  TrendingUp,
  UserRound,
  Users,
  Utensils,
} from "lucide-react";

import DashboardPageHero from "@/components/dashboard/DashboardPageHero";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { getSupabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import {
  buildCustomerCrmInsights,
  formatCustomerCrmDate,
  formatCustomerCrmMoney,
  getCustomerInitials,
  getPreferredChannelLabel,
  getPreferredHourLabel,
  getPreferredServiceLabel,
  normalizeCustomerCrmProfile,
  type CustomerCrmProfile,
} from "@/lib/customerCrm";

const supabase = getSupabase();
const CRM_FETCH_LIMIT = 100;

export type CustomerCrmRestaurantOption = {
  id: string;
  name: string;
  city?: string | null;
};

type CustomerCrmDashboardProps = {
  surface: "restaurant" | "admin";
  restaurantId: string | null;
  restaurantName?: string | null;
  restaurants?: CustomerCrmRestaurantOption[];
  onRestaurantChange?: (restaurantId: string | null) => void;
  restaurantLoading?: boolean;
  restaurantError?: string | null;
};

type SegmentFilter = "all" | "priority" | "orders" | "reservations" | "dormant";

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Erreur de chargement CRM.";
}

function getDormant(profile: CustomerCrmProfile) {
  if (!profile.lastActivityAt) return false;
  const timestamp = Date.parse(profile.lastActivityAt);
  return Number.isFinite(timestamp) && Date.now() - timestamp > 60 * 24 * 60 * 60 * 1000;
}

function filterBySegment(profile: CustomerCrmProfile, segment: SegmentFilter) {
  if (segment === "priority") return profile.crmScore >= 70 || profile.totalSpent >= 300;
  if (segment === "orders") return profile.totalOrders > profile.totalReservations;
  if (segment === "reservations") return profile.totalReservations >= profile.totalOrders && profile.totalReservations > 0;
  if (segment === "dormant") return getDormant(profile);
  return true;
}

function CustomerAvatar({ profile }: { profile: CustomerCrmProfile }) {
  return (
    <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-primary/10 text-sm font-bold text-primary">
      {profile.avatarUrl ? (
        <img src={profile.avatarUrl} alt="" className="h-full w-full object-cover" />
      ) : (
        getCustomerInitials(profile)
      )}
    </div>
  );
}

function ContactLink({
  icon: Icon,
  value,
  href,
}: {
  icon: ComponentType<{ className?: string }>;
  value: string | null;
  href?: string;
}) {
  const content = (
    <span className="min-w-0 break-all text-sm text-muted-foreground">
      {value || "Non renseigne"}
    </span>
  );

  return (
    <div className="flex min-w-0 items-center gap-2">
      <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
      {href && value ? (
        <a href={href} className="min-w-0 hover:text-primary hover:underline">
          {content}
        </a>
      ) : content}
    </div>
  );
}

function MetricPill({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-2xl border bg-muted/25 px-3 py-2">
      <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">{label}</p>
      <p className="mt-0.5 text-sm font-bold text-foreground">{value}</p>
    </div>
  );
}

function CustomerCard({ profile, surface }: { profile: CustomerCrmProfile; surface: CustomerCrmDashboardProps["surface"] }) {
  const insights = buildCustomerCrmInsights(profile);
  const preferredHour = profile.preferredChannel === "reservations"
    ? getPreferredHourLabel(profile.favoriteReservationHour)
    : getPreferredHourLabel(profile.favoriteOrderHour);

  return (
    <article className="rounded-3xl border bg-card p-4 shadow-sm transition hover:border-primary/35 hover:shadow-md md:p-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex min-w-0 gap-3">
          <CustomerAvatar profile={profile} />
          <div className="min-w-0 space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="break-words text-lg font-bold leading-tight">{profile.fullName}</h3>
              <Badge className="bg-primary/10 text-primary hover:bg-primary/10">
                Score {profile.crmScore}/100
              </Badge>
            </div>
            <div className="flex flex-wrap gap-1.5">
              <Badge variant="secondary">{insights.profileLabel}</Badge>
              <Badge variant="outline">{getPreferredChannelLabel(profile.preferredChannel)}</Badge>
              <Badge variant="outline">{getPreferredServiceLabel(profile.preferredService)}</Badge>
              {surface === "admin" && profile.lastRestaurantName ? (
                <Badge variant="outline">{profile.lastRestaurantName}</Badge>
              ) : null}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:w-[28rem]">
          <MetricPill label="Commandes" value={profile.totalOrders} />
          <MetricPill label="Reservations" value={profile.totalReservations} />
          <MetricPill label="Depense" value={formatCustomerCrmMoney(profile.totalSpent)} />
          <MetricPill label="Panier moy." value={formatCustomerCrmMoney(profile.avgOrderValue)} />
        </div>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        <div className="space-y-2 rounded-2xl bg-muted/20 p-3">
          <p className="flex items-center gap-2 text-sm font-semibold">
            <UserRound className="h-4 w-4 text-primary" />
            Contact automatique
          </p>
          <ContactLink icon={Mail} value={profile.email} href={profile.email ? `mailto:${profile.email}` : undefined} />
          <ContactLink icon={Phone} value={profile.phone} href={profile.phone ? `tel:${profile.phone}` : undefined} />
          <ContactLink icon={MapPin} value={[profile.address, profile.city].filter(Boolean).join(", ") || null} />
        </div>

        <div className="space-y-2 rounded-2xl bg-orange-50/70 p-3 text-orange-950 dark:bg-orange-500/10 dark:text-orange-50">
          <p className="flex items-center gap-2 text-sm font-semibold">
            <Sparkles className="h-4 w-4" />
            Profil de vente
          </p>
          <p className="text-sm leading-6">{insights.habitSummary}</p>
          <p className="text-sm leading-6">{insights.salesAngle}</p>
          <div className="flex flex-wrap gap-2 pt-1">
            <Badge variant="outline" className="bg-white/70 dark:bg-white/10">
              Derniere activite: {formatCustomerCrmDate(profile.lastActivityAt)}
            </Badge>
            <Badge variant="outline" className="bg-white/70 dark:bg-white/10">
              Heure forte: {preferredHour}
            </Badge>
            {profile.loyaltyPoints > 0 ? (
              <Badge variant="outline" className="bg-white/70 dark:bg-white/10">
                {profile.loyaltyPoints} Miamz
              </Badge>
            ) : null}
          </div>
        </div>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <div className="space-y-3">
          <p className="flex items-center gap-2 text-sm font-semibold text-muted-foreground">
            <Utensils className="h-4 w-4" />
            Preferences detectees
          </p>
          <div className="flex flex-wrap gap-2">
            {profile.favoriteCuisines.slice(0, 5).map((cuisine) => (
              <Badge key={cuisine} variant="secondary">{cuisine}</Badge>
            ))}
            {profile.favoriteItems.slice(0, 4).map((item) => (
              <Badge key={item.label} variant="outline">
                {item.label} x{item.quantity}
              </Badge>
            ))}
            {profile.favoriteCuisines.length === 0 && profile.favoriteItems.length === 0 ? (
              <span className="text-sm text-muted-foreground">Pas encore assez de signaux plats/cuisines.</span>
            ) : null}
          </div>
        </div>

        <div className="space-y-3">
          <p className="flex items-center gap-2 text-sm font-semibold text-muted-foreground">
            <TrendingUp className="h-4 w-4" />
            Actions conseillees
          </p>
          <ul className="space-y-2">
            {insights.nextBestActions.map((action) => (
              <li key={action} className="flex gap-2 rounded-2xl border bg-background px-3 py-2 text-sm">
                <Star className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                <span>{action}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </article>
  );
}

export default function CustomerCrmDashboard({
  surface,
  restaurantId,
  restaurantName,
  restaurants = [],
  onRestaurantChange,
  restaurantLoading = false,
  restaurantError = null,
}: CustomerCrmDashboardProps) {
  const [search, setSearch] = useState("");
  const [segment, setSegment] = useState<SegmentFilter>("all");

  const crmQuery = useQuery({
    queryKey: ["customer-crm-profiles", surface, restaurantId || "all", search],
    queryFn: async () => {
      const { data, error } = await (supabase.rpc as any)("get_customer_crm_profiles", {
        p_restaurant_id: restaurantId,
        p_search: search.trim() || null,
        p_limit: CRM_FETCH_LIMIT,
        p_offset: 0,
      });

      if (error) throw error;
      return ((data || []) as Record<string, unknown>[]).map(normalizeCustomerCrmProfile);
    },
    enabled: surface === "admin" || Boolean(restaurantId),
  });

  const profiles = useMemo(() => crmQuery.data || [], [crmQuery.data]);
  const filteredProfiles = useMemo(
    () => profiles.filter((profile) => filterBySegment(profile, segment)),
    [profiles, segment],
  );

  const stats = useMemo(() => {
    const totalMatching = profiles[0]?.totalMatchingCount || profiles.length;
    const totalRevenue = profiles.reduce((sum, profile) => sum + profile.totalSpent, 0);
    const priority = profiles.filter((profile) => profile.crmScore >= 70 || profile.totalSpent >= 300).length;
    const dormant = profiles.filter(getDormant).length;

    return {
      totalMatching,
      totalRevenue,
      priority,
      dormant,
    };
  }, [profiles]);

  const title = surface === "admin" ? "CRM clients TOK" : "CRM clients";
  const description = surface === "admin"
    ? "Vue globale des clients qui commandent ou reservent sur TOK, avec segmentation commerciale et habitudes detectees."
    : "Clients issus des commandes et reservations de votre restaurant, enrichis par leurs habitudes et preferences detectees.";

  return (
    <div className={cn("space-y-6", surface === "admin" ? "container py-8" : undefined)}>
      <DashboardPageHero
        badge={surface === "admin" ? "Back-office croissance" : "Croissance restaurant"}
        title={title}
        description={description}
        icon={Users}
        tone="emerald"
        visualLabel="CRM"
        stats={[
          { label: "Clients", value: stats.totalMatching, icon: Users },
          { label: "Prioritaires", value: stats.priority, icon: Sparkles },
          { label: "Valeur suivie", value: formatCustomerCrmMoney(stats.totalRevenue), icon: ShoppingBag },
        ]}
      />

      <Card className="border-primary/15 bg-primary/5">
        <CardContent className="flex flex-col gap-4 p-4 lg:flex-row lg:items-center">
          <div className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Rechercher par nom, email, telephone, ville..."
              className="h-12 rounded-2xl bg-background pl-10"
            />
          </div>

          {surface === "admin" ? (
            <Select value={restaurantId || "all"} onValueChange={(value) => onRestaurantChange?.(value === "all" ? null : value)}>
              <SelectTrigger className="h-12 rounded-2xl bg-background lg:w-72">
                <SelectValue placeholder="Tous les restaurants" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tous les restaurants</SelectItem>
                {restaurants.map((restaurant) => (
                  <SelectItem key={restaurant.id} value={restaurant.id}>
                    {restaurant.name}{restaurant.city ? ` - ${restaurant.city}` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <div className="rounded-2xl border bg-background px-4 py-3 text-sm font-semibold">
              {restaurantName || "Restaurant selectionne"}
            </div>
          )}

          <Select value={segment} onValueChange={(value) => setSegment(value as SegmentFilter)}>
            <SelectTrigger className="h-12 rounded-2xl bg-background lg:w-56">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tous les profils</SelectItem>
              <SelectItem value="priority">Clients prioritaires</SelectItem>
              <SelectItem value="orders">Commande surtout</SelectItem>
              <SelectItem value="reservations">Reserve surtout</SelectItem>
              <SelectItem value="dormant">A reactiver</SelectItem>
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      <div className="grid gap-3 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm">
              <Users className="h-4 w-4 text-primary" />
              Base CRM
            </CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-bold">{stats.totalMatching}</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm">
              <Sparkles className="h-4 w-4 text-primary" />
              Clients chauds
            </CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-bold">{stats.priority}</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm">
              <Clock3 className="h-4 w-4 text-primary" />
              A reactiver
            </CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-bold">{stats.dormant}</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm">
              <CalendarClock className="h-4 w-4 text-primary" />
              Source
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm font-semibold text-muted-foreground">
            Commandes + reservations
          </CardContent>
        </Card>
      </div>

      <Card className="border-amber-200 bg-amber-50/70 text-amber-950 dark:border-amber-400/25 dark:bg-amber-500/10 dark:text-amber-50">
        <CardContent className="p-4 text-sm leading-6">
          Les donnees sont limitees aux clients ayant commande ou reserve. Utilisez ces signaux pour personnaliser les offres TOK;
          les campagnes email/SMS doivent rester soumises aux consentements et aux preferences de notification.
        </CardContent>
      </Card>

      {restaurantError ? (
        <Card className="border-destructive/30 bg-destructive/5">
          <CardContent className="p-4 text-sm text-destructive">{restaurantError}</CardContent>
        </Card>
      ) : null}

      {crmQuery.error ? (
        <Card className="border-destructive/30 bg-destructive/5">
          <CardContent className="p-4 text-sm text-destructive">{getErrorMessage(crmQuery.error)}</CardContent>
        </Card>
      ) : null}

      {restaurantLoading || crmQuery.isLoading ? (
        <div className="grid gap-4">
          {[1, 2, 3].map((entry) => (
            <div key={entry} className="h-64 animate-pulse rounded-3xl bg-muted" />
          ))}
        </div>
      ) : null}

      {!restaurantLoading && !crmQuery.isLoading && filteredProfiles.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            Aucun profil CRM ne correspond aux filtres actuels.
          </CardContent>
        </Card>
      ) : null}

      {!restaurantLoading && !crmQuery.isLoading && filteredProfiles.length > 0 ? (
        <div className="grid gap-4">
          {filteredProfiles.map((profile) => (
            <CustomerCard key={profile.userId} profile={profile} surface={surface} />
          ))}
        </div>
      ) : null}
    </div>
  );
}
