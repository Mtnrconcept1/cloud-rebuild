import { useMemo, useState, type ComponentType } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowDownWideNarrow,
  ArrowUpNarrowWide,
  CalendarClock,
  Clock3,
  Download,
  Grid2X2,
  List,
  LayoutGrid,
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
import { toast } from "sonner";

import DashboardPageHero from "@/components/dashboard/DashboardPageHero";
import { DASHBOARD_ILLUSTRATIONS } from "@/lib/dashboardIllustrations";
import { useCommercialDemoFrame } from "@/components/commercial/CommercialDemoFrameProvider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { getSupabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { buildCommercialDemoCrmRows } from "@/lib/commercialDemoRestaurantTools";
import {
  buildCustomerCrmInsights,
  buildCustomerCrmCsv,
  buildCustomerCrmXls,
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
const CRM_EXPORT_PAGE_SIZE = 500;
const CRM_EXPORT_MAX_ROWS = 5000;

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
type ExportScope = "visible" | "all";
type ExportFormat = "csv" | "xls";
type CrmViewMode = "compact" | "detailed" | "gallery";
type GalleryColumns = "2" | "3" | "4";
type CrmSortOption =
  | "score"
  | "orders"
  | "reservations"
  | "miamz"
  | "last_activity"
  | "last_order"
  | "last_reservation";
type CrmSortDirection = "desc" | "asc";

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

function dateSortValue(value: string | null) {
  if (!value) return 0;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function getLastOrderOrReservationValue(profile: CustomerCrmProfile) {
  return Math.max(dateSortValue(profile.lastOrderAt), dateSortValue(profile.lastReservationAt));
}

function sortCrmProfiles(profiles: CustomerCrmProfile[], sortBy: CrmSortOption, direction: CrmSortDirection) {
  const directionFactor = direction === "asc" ? -1 : 1;

  return [...profiles].sort((left, right) => {
    if (sortBy === "orders") return directionFactor * (right.totalOrders - left.totalOrders) || right.crmScore - left.crmScore;
    if (sortBy === "reservations") return directionFactor * (right.totalReservations - left.totalReservations) || right.crmScore - left.crmScore;
    if (sortBy === "miamz") return directionFactor * (right.loyaltyPoints - left.loyaltyPoints) || right.crmScore - left.crmScore;
    if (sortBy === "last_activity") return directionFactor * (getLastOrderOrReservationValue(right) - getLastOrderOrReservationValue(left)) || right.crmScore - left.crmScore;
    if (sortBy === "last_order") return directionFactor * (dateSortValue(right.lastOrderAt) - dateSortValue(left.lastOrderAt)) || right.totalOrders - left.totalOrders;
    if (sortBy === "last_reservation") return directionFactor * (dateSortValue(right.lastReservationAt) - dateSortValue(left.lastReservationAt)) || right.totalReservations - left.totalReservations;
    return directionFactor * (right.crmScore - left.crmScore) || right.totalSpent - left.totalSpent;
  });
}

function sanitizeFilePart(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "crm";
}

function downloadTextFile(content: string, fileName: string, type: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
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

function CustomerCompactRow({ profile, surface }: { profile: CustomerCrmProfile; surface: CustomerCrmDashboardProps["surface"] }) {
  const insights = buildCustomerCrmInsights(profile);
  const preferredHour = profile.preferredChannel === "reservations"
    ? getPreferredHourLabel(profile.favoriteReservationHour)
    : getPreferredHourLabel(profile.favoriteOrderHour);

  return (
    <article className="grid gap-3 border-b p-3 last:border-b-0 md:p-4 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1.25fr)_minmax(14rem,0.9fr)] xl:items-center">
      <div className="flex min-w-0 gap-3">
        <CustomerAvatar profile={profile} />
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="break-words text-base font-bold leading-tight">{profile.fullName}</h3>
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

      <div className="min-w-0 space-y-1.5">
        <ContactLink icon={Mail} value={profile.email} href={profile.email ? `mailto:${profile.email}` : undefined} />
        <ContactLink icon={Phone} value={profile.phone} href={profile.phone ? `tel:${profile.phone}` : undefined} />
      </div>

      <div className="min-w-0 rounded-2xl bg-muted/20 px-3 py-2">
        <p className="line-clamp-2 break-words text-sm leading-5">{insights.habitSummary}</p>
        <div className="mt-2 flex flex-wrap gap-1.5">
          <Badge variant="outline">Derniere: {formatCustomerCrmDate(profile.lastActivityAt)}</Badge>
          <Badge variant="outline">Heure: {preferredHour}</Badge>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <MetricPill label="Cmd." value={profile.totalOrders} />
        <MetricPill label="Resa." value={profile.totalReservations} />
        <MetricPill label="Depense" value={formatCustomerCrmMoney(profile.totalSpent)} />
        <MetricPill label="Panier" value={formatCustomerCrmMoney(profile.avgOrderValue)} />
      </div>
    </article>
  );
}

function CustomerGalleryCard({ profile, surface }: { profile: CustomerCrmProfile; surface: CustomerCrmDashboardProps["surface"] }) {
  const insights = buildCustomerCrmInsights(profile);
  const favoriteSignals = [
    ...profile.favoriteCuisines.slice(0, 2),
    ...profile.favoriteItems.slice(0, 2).map((item) => item.label),
  ];

  return (
    <article className="flex min-h-[20rem] min-w-0 flex-col rounded-3xl border bg-card p-4 shadow-sm transition hover:border-primary/35 hover:shadow-md">
      <div className="flex min-w-0 items-start gap-3">
        <CustomerAvatar profile={profile} />
        <div className="min-w-0 flex-1 space-y-1">
          <h3 className="break-words text-base font-bold leading-tight">{profile.fullName}</h3>
          <p className="truncate text-xs text-muted-foreground">{profile.email || profile.phone || "Contact a completer"}</p>
        </div>
        <Badge className="shrink-0 bg-primary/10 text-primary hover:bg-primary/10">{profile.crmScore}/100</Badge>
      </div>

      <div className="mt-3 flex flex-wrap gap-1.5">
        <Badge variant="secondary">{insights.profileLabel}</Badge>
        <Badge variant="outline">{getPreferredChannelLabel(profile.preferredChannel)}</Badge>
        {surface === "admin" && profile.lastRestaurantName ? (
          <Badge variant="outline">{profile.lastRestaurantName}</Badge>
        ) : null}
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2">
        <MetricPill label="Commandes" value={profile.totalOrders} />
        <MetricPill label="Resa." value={profile.totalReservations} />
        <MetricPill label="Depense" value={formatCustomerCrmMoney(profile.totalSpent)} />
        <MetricPill label="Miamz" value={profile.loyaltyPoints} />
      </div>

      <div className="mt-3 flex-1 rounded-2xl bg-orange-50/70 p-3 text-orange-950 dark:bg-orange-500/10 dark:text-orange-50">
        <p className="line-clamp-2 break-words text-sm font-medium leading-5">{insights.salesAngle}</p>
        <p className="mt-2 line-clamp-2 break-words text-xs leading-5 opacity-80">{insights.nextBestActions[0]}</p>
      </div>

      <div className="mt-3 flex flex-wrap gap-1.5">
        {favoriteSignals.length > 0 ? favoriteSignals.map((signal) => (
          <Badge key={signal} variant="outline" className="max-w-full truncate">
            {signal}
          </Badge>
        )) : (
          <span className="text-xs text-muted-foreground">Signaux culinaires a enrichir.</span>
        )}
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
  const commercialDemoFrame = useCommercialDemoFrame();
  const isCommercialDemo = surface === "restaurant" && commercialDemoFrame?.surface === "restaurant";
  const [search, setSearch] = useState("");
  const [segment, setSegment] = useState<SegmentFilter>("all");
  const [exportScope, setExportScope] = useState<ExportScope>("visible");
  const [exportFormat, setExportFormat] = useState<ExportFormat>("csv");
  const [viewMode, setViewMode] = useState<CrmViewMode>("detailed");
  const [galleryColumns, setGalleryColumns] = useState<GalleryColumns>("3");
  const [sortBy, setSortBy] = useState<CrmSortOption>("score");
  const [sortDirection, setSortDirection] = useState<CrmSortDirection>("desc");
  const [isExporting, setIsExporting] = useState(false);

  const crmQuery = useQuery({
    queryKey: [
      "customer-crm-profiles",
      surface,
      restaurantId || "all",
      search,
      commercialDemoFrame?.config.sessionId || "live",
      commercialDemoFrame?.snapshot.order?.version || 0,
      commercialDemoFrame?.snapshot.reservations.map((reservation) => `${reservation.id}:${reservation.version}`).join("|") || "",
    ],
    queryFn: async () => {
      if (isCommercialDemo && commercialDemoFrame) {
        const normalizedSearch = search.trim().toLocaleLowerCase("fr");
        return buildCommercialDemoCrmRows(commercialDemoFrame.snapshot)
          .map((row) => normalizeCustomerCrmProfile(row))
          .filter((profile) => !normalizedSearch || [
            profile.fullName,
            profile.email,
            profile.phone,
            profile.city,
          ].some((value) => value?.toLocaleLowerCase("fr").includes(normalizedSearch)));
      }
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
    () => sortCrmProfiles(
      profiles.filter((profile) => filterBySegment(profile, segment)),
      sortBy,
      sortDirection,
    ),
    [profiles, segment, sortBy, sortDirection],
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

  const galleryGridClass = galleryColumns === "2"
    ? "lg:grid-cols-2"
    : galleryColumns === "4"
      ? "lg:grid-cols-4"
      : "lg:grid-cols-3";

  const title = surface === "admin" ? "CRM clients TOK" : "CRM clients";
  const description = surface === "admin"
    ? "Vue globale des clients qui commandent ou reservent sur TOK, avec segmentation commerciale et habitudes detectees."
    : isCommercialDemo
      ? "Profil client construit uniquement à partir des commandes et réservations de cette session Démo isolée."
      : "Clients issus des commandes et reservations de votre restaurant, enrichis par leurs habitudes et preferences detectees.";

  async function fetchAllExportProfiles() {
    if (isCommercialDemo && commercialDemoFrame) {
      return sortCrmProfiles(
        buildCommercialDemoCrmRows(commercialDemoFrame.snapshot)
          .map((row) => normalizeCustomerCrmProfile(row))
          .filter((profile) => filterBySegment(profile, segment)),
        sortBy,
        sortDirection,
      );
    }

    const collected: CustomerCrmProfile[] = [];

    for (let offset = 0; offset < CRM_EXPORT_MAX_ROWS; offset += CRM_EXPORT_PAGE_SIZE) {
      const { data, error } = await (supabase.rpc as any)("get_customer_crm_profiles", {
        p_restaurant_id: restaurantId,
        p_search: search.trim() || null,
        p_limit: CRM_EXPORT_PAGE_SIZE,
        p_offset: offset,
      });

      if (error) throw error;

      const page = ((data || []) as Record<string, unknown>[]).map(normalizeCustomerCrmProfile);
      collected.push(...page);

      if (page.length < CRM_EXPORT_PAGE_SIZE) break;
      const total = page[0]?.totalMatchingCount || 0;
      if (total > 0 && collected.length >= total) break;
    }

    return sortCrmProfiles(
      collected.filter((profile) => filterBySegment(profile, segment)),
      sortBy,
      sortDirection,
    );
  }

  async function handleExport() {
    if (exportScope === "visible" && filteredProfiles.length === 0) {
      toast.info("Aucun profil CRM a exporter avec les filtres actuels.");
      return;
    }

    setIsExporting(true);
    try {
      const exportProfiles = exportScope === "visible"
        ? filteredProfiles
        : await fetchAllExportProfiles();

      if (exportProfiles.length === 0) {
        toast.info("Aucun profil CRM a exporter avec les filtres actuels.");
        return;
      }

      const today = new Date().toISOString().slice(0, 10);
      const scopeLabel = exportScope === "visible" ? "affiches" : "recherche";
      const restaurantLabel = restaurantName || restaurants.find((restaurant) => restaurant.id === restaurantId)?.name || "tok";
      const fileBaseName = `tok-crm-${sanitizeFilePart(restaurantLabel)}-${sanitizeFilePart(scopeLabel)}-${today}`;

      if (exportFormat === "xls") {
        downloadTextFile(
          buildCustomerCrmXls(exportProfiles),
          `${fileBaseName}.xls`,
          "application/vnd.ms-excel;charset=utf-8",
        );
      } else {
        downloadTextFile(
          `\uFEFFsep=;\r\n${buildCustomerCrmCsv(exportProfiles)}`,
          `${fileBaseName}.csv`,
          "text/csv;charset=utf-8",
        );
      }

      toast.success(`${exportProfiles.length} profil${exportProfiles.length > 1 ? "s" : ""} exporte${exportProfiles.length > 1 ? "s" : ""} en ${exportFormat.toUpperCase()}.`);

      if (exportScope === "all" && exportProfiles.length >= CRM_EXPORT_MAX_ROWS) {
        toast.warning(`Export limite a ${CRM_EXPORT_MAX_ROWS} profils. Affinez la recherche pour extraire le reste.`);
      }
    } catch (error) {
      toast.error(getErrorMessage(error));
    } finally {
      setIsExporting(false);
    }
  }

  return (
    <div className={cn("space-y-6", surface === "admin" ? "container py-8" : undefined)}>
      <DashboardPageHero
        badge={surface === "admin" ? "Back-office croissance" : "Croissance restaurant"}
        title={title}
        description={description}
        icon={Users}
        tone="emerald"
        visualLabel="CRM"
        illustration={surface === "restaurant" ? DASHBOARD_ILLUSTRATIONS.restaurantCrm : undefined}
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

          <div className="flex flex-col gap-2 sm:flex-row lg:ml-auto">
            <Select value={exportScope} onValueChange={(value) => setExportScope(value as ExportScope)}>
              <SelectTrigger className="h-12 rounded-2xl bg-background sm:w-52">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="visible">Exporter l'affichage</SelectItem>
                <SelectItem value="all">Toute la recherche</SelectItem>
              </SelectContent>
            </Select>
            <Select value={exportFormat} onValueChange={(value) => setExportFormat(value as ExportFormat)}>
              <SelectTrigger className="h-12 rounded-2xl bg-background sm:w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="csv">CSV</SelectItem>
                <SelectItem value="xls">XLS</SelectItem>
              </SelectContent>
            </Select>
            <Button
              type="button"
              onClick={handleExport}
              disabled={isExporting || restaurantLoading || crmQuery.isLoading || (surface === "restaurant" && !restaurantId)}
              className="h-12 rounded-2xl"
            >
              <Download className="mr-2 h-4 w-4" />
              {isExporting ? "Export..." : "Exporter"}
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="flex flex-col gap-3 rounded-3xl border bg-card p-3 shadow-sm md:flex-row md:items-center md:justify-between">
        <div className="min-w-0">
          <p className="text-sm font-semibold">Presentation des profils</p>
          <p className="text-xs text-muted-foreground">
            Choisissez entre scan rapide, fiche detaillee ou galerie commerciale.
          </p>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <Select value={sortBy} onValueChange={(value) => setSortBy(value as CrmSortOption)}>
            <SelectTrigger className="h-10 rounded-2xl bg-background sm:w-64">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="score">Tri: score commercial</SelectItem>
              <SelectItem value="orders">Tri: nombre de commandes</SelectItem>
              <SelectItem value="reservations">Tri: nombre de reservations</SelectItem>
              <SelectItem value="miamz">Tri: nombre de Miamz</SelectItem>
              <SelectItem value="last_activity">Tri: derniere commande/reservation</SelectItem>
              <SelectItem value="last_order">Tri: derniere commande</SelectItem>
              <SelectItem value="last_reservation">Tri: derniere reservation</SelectItem>
            </SelectContent>
          </Select>

          <Button
            type="button"
            variant="outline"
            className="h-10 justify-start gap-2 rounded-2xl bg-background sm:w-40"
            onClick={() => setSortDirection((current) => current === "desc" ? "asc" : "desc")}
            aria-label={sortDirection === "desc" ? "Passer le tri en ordre croissant" : "Passer le tri en ordre decroissant"}
          >
            {sortDirection === "desc" ? (
              <ArrowDownWideNarrow className="h-4 w-4" />
            ) : (
              <ArrowUpNarrowWide className="h-4 w-4" />
            )}
            {sortDirection === "desc" ? "Decroissant" : "Croissant"}
          </Button>

          <ToggleGroup
            type="single"
            value={viewMode}
            onValueChange={(value) => {
              if (value) setViewMode(value as CrmViewMode);
            }}
            className="justify-start rounded-2xl border bg-muted/20 p-1"
            aria-label="Mode de presentation CRM"
          >
            <ToggleGroupItem value="compact" aria-label="Afficher en liste compacte" className="h-9 gap-2 rounded-xl px-3">
              <List className="h-4 w-4" />
              <span className="hidden sm:inline">Liste</span>
            </ToggleGroupItem>
            <ToggleGroupItem value="detailed" aria-label="Afficher en liste detaillee" className="h-9 gap-2 rounded-xl px-3">
              <LayoutGrid className="h-4 w-4" />
              <span className="hidden sm:inline">Detaillee</span>
            </ToggleGroupItem>
            <ToggleGroupItem value="gallery" aria-label="Afficher en galerie" className="h-9 gap-2 rounded-xl px-3">
              <Grid2X2 className="h-4 w-4" />
              <span className="hidden sm:inline">Galerie</span>
            </ToggleGroupItem>
          </ToggleGroup>

          {viewMode === "gallery" ? (
            <Select value={galleryColumns} onValueChange={(value) => setGalleryColumns(value as GalleryColumns)}>
              <SelectTrigger className="h-10 rounded-2xl bg-background sm:w-44">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="2">2 blocs par ligne</SelectItem>
                <SelectItem value="3">3 blocs par ligne</SelectItem>
                <SelectItem value="4">4 blocs par ligne</SelectItem>
              </SelectContent>
            </Select>
          ) : (
            <div className="rounded-2xl border bg-muted/20 px-3 py-2 text-sm font-semibold text-muted-foreground">
              {filteredProfiles.length} profil{filteredProfiles.length > 1 ? "s" : ""} visible{filteredProfiles.length > 1 ? "s" : ""}
            </div>
          )}
        </div>
      </div>

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
        viewMode === "compact" ? (
          <div className="overflow-hidden rounded-3xl border bg-card shadow-sm">
            {filteredProfiles.map((profile) => (
              <CustomerCompactRow key={profile.userId} profile={profile} surface={surface} />
            ))}
          </div>
        ) : viewMode === "gallery" ? (
          <div className={cn("grid gap-4 md:grid-cols-2", galleryGridClass)}>
            {filteredProfiles.map((profile) => (
              <CustomerGalleryCard key={profile.userId} profile={profile} surface={surface} />
            ))}
          </div>
        ) : (
          <div className="grid gap-4">
            {filteredProfiles.map((profile) => (
              <CustomerCard key={profile.userId} profile={profile} surface={surface} />
            ))}
          </div>
        )
      ) : null}
    </div>
  );
}
