import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowUpRight,
  Bell,
  BookOpen,
  Bike,
  Brain,
  BriefcaseBusiness,
  ClipboardList,
  Crown,
  DollarSign,
  FileText,
  Layers,
  MessageSquareText,
  MapPin,
  Newspaper,
  Rocket,
  Settings2,
  ShieldAlert,
  Shield,
  ShoppingCart,
  Store,
  TrendingDown,
  Users,
  UtensilsCrossed,
  Calculator,
  Printer,
  Clock3,
  CalendarDays,
  CheckCircle2,
  CircleAlert,
  Info,
  Search,
  ChevronRight,
  Megaphone,
  PieChart,
  ShieldCheck,
  Boxes,
  CalendarRange,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DASHBOARD_ILLUSTRATIONS } from "@/lib/dashboardIllustrations";
import NotificationMenuBadge from "@/components/notifications/NotificationMenuBadge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Progress } from "@/components/ui/progress";
import { getSupabase } from "@/integrations/supabase/client";
import { useNotificationCenter } from "@/hooks/useNotificationCenter";
import { useAuth } from "@/lib/auth-context";
import { useActiveFeatures, useFeatureFlags } from "@/lib/featureFlags";
import { Switch } from "@/components/ui/switch";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { OPTIMIZED_TOK_LOGO_SRC } from "@/lib/tokLogo";
import {
  MARKETPLACE_LIQUIDITY_BLOCKERS,
  MarketplaceLiquidityBlocker,
  scoreMarketplaceLiquidity,
} from "@/lib/marketplaceLiquidity";

const supabase = getSupabase();
const ADMIN_HOME_AGGREGATE_LIMIT = 250;
const ADMIN_PLATFORM_CONFIG_LINK = {
  href: "/admin/platform",
  feature: "admin-platform-config",
} as const;

const ADMIN_TOOLS = [
  {
    title: "Guide administrateur",
    description: "Manuel complet de TOK, index des fonctions et export PDF.",
    icon: BookOpen,
    href: "/admin/guide",
    color: "text-orange-500",
  },
  {
    title: "Restaurants",
    description: "Gérer les restaurants, activations et statuts.",
    icon: Store,
    href: "/admin/restaurants",
    feature: "admin-restaurants",
    color: "text-primary",
  },
  {
    title: "TOK Équipe",
    description: "Activer les plannings et le suivi du personnel par restaurant.",
    icon: Clock3,
    href: "/admin/equipe",
    color: "text-orange-500",
  },
  {
    title: "Boutons Google Business",
    description: "Suivre les liens de réservation TOK installés sur les fiches Google.",
    icon: MapPin,
    href: "/admin/restaurants/google-business",
    feature: "admin-restaurants",
    color: "text-orange-500",
  },
  {
    title: "Comptabilité",
    description: "Gérer les reversements et les parts TOK.",
    icon: Calculator,
    href: "/admin/compta",
    feature: "admin-compta",
    color: "text-emerald-500",
  },
  {
    title: "TOK Printer",
    description: "Suivre les impressions, les commandes et les incidents de production.",
    icon: Printer,
    href: "/admin/tok-printer",
    color: "text-orange-500",
  },
  {
    title: "IA comptable",
    description: "Synthèses, anomalies, prévisions et coût IA.",
    icon: Brain,
    href: "/admin/compta/ia",
    feature: "ai_accounting_insights",
    color: "text-violet-500",
  },
  {
    title: "Commandes et réservations",
    description: "Retrouver une commande ou une réservation avec le détail complet.",
    icon: ClipboardList,
    href: "/admin/commandes-reservations",
    feature: "admin-operations-center",
    color: "text-orange-500",
  },
  {
    title: "Sinistres et chat",
    description: "Suivre les plaintes remontées par le chat avec résumé et conversation complète.",
    icon: ShieldAlert,
    href: "/admin/sinistres",
    feature: "admin-operations-center",
    color: "text-red-500",
  },
  {
    title: "Utilisateurs",
    description: "Administrer les comptes et les roles.",
    icon: Users,
    href: "/admin/utilisateurs",
    feature: "admin-utilisateurs",
    color: "text-sky-500",
  },
  {
    title: "Comptes commerciaux",
    description: "Créer les accès de démonstration des commerciaux.",
    icon: BriefcaseBusiness,
    href: "/admin/utilisateurs?tab=commercials",
    feature: "admin-utilisateurs",
    color: "text-violet-500",
  },
  {
    title: "Dossiers d'inscription",
    description: "Verifier les justificatifs et approuver les restaurateurs et livreurs.",
    icon: FileText,
    href: "/admin/utilisateurs?tab=applications",
    feature: "admin-utilisateurs",
    color: "text-amber-500",
  },
  {
    title: "Profils livreurs",
    description: "Valider, suspendre ou refuser les profils livreurs.",
    icon: Bike,
    href: "/admin/utilisateurs?tab=couriers",
    feature: "admin-utilisateurs",
    color: "text-emerald-500",
  },
  {
    title: "Avis",
    description: "Moderation et suivi des avis clients.",
    icon: MessageSquareText,
    href: "/admin/avis",
    feature: "admin-avis",
    color: "text-emerald-500",
  },
  {
    title: "Catalogue central",
    description: "Cuisines, collections et structure globale.",
    icon: Layers,
    href: "/admin/catalog",
    feature: "admin-catalog",
    color: "text-indigo-500",
  },
  {
    title: "Fidélité et abonnement",
    description: "Configurer Miamz+ et les avantages.",
    icon: Crown,
    href: "/admin/loyalty",
    feature: "admin-loyalty",
    color: "text-amber-500",
  },
  {
    title: "La Tok d’Or",
    description: "Créer et gérer les expériences exclusives La Tok d’Or.",
    icon: UtensilsCrossed,
    href: "/admin/drops",
    feature: "admin-drops",
    color: "text-pink-500",
  },
  {
    title: "Notifications",
    description: "Piloter les campagnes et alertes ciblées.",
    icon: Bell,
    href: "/admin/notifications",
    feature: "admin-notifications",
    color: "text-orange-500",
  },
  {
    title: "Actualités sociales",
    description: "Moderation du fil restaurateurs et des signalements.",
    icon: Newspaper,
    href: "/admin/actualites",
    feature: "admin-actualites",
    color: "text-sky-500",
  },
  {
    title: "CRM clients",
    description: "Segmenter les clients, leurs habitudes et les opportunites de relance.",
    icon: Users,
    href: "/admin/crm",
    feature: "admin-crm",
    color: "text-emerald-500",
  },
  {
    title: "Centre de sécurité",
    description: "Supervision, preuves et réparation assistée avec approbation humaine.",
    icon: Shield,
    href: "/admin/security-center",
    feature: "admin-audit",
    color: "text-amber-500",
  },
  {
    title: "Opérations IA",
    description: "Surveiller sécurité, coûts, performance et incidents IA.",
    icon: Brain,
    href: "/admin/ai-operations",
    feature: "ai_admin_monitoring",
    color: "text-violet-500",
  },
{
  title: "Résolution IA",
  description: "Analyser et préparer la résolution des incidents support sensibles.",
  icon: Brain,
  href: "/admin/support-resolution",
  feature: "admin-support-resolution",
  color: "text-violet-500",
},
{
  title: "Guardian IA",
  description: "Superviser les signaux de sécurité, santé et incidents de la plateforme.",
  icon: ShieldAlert,
  href: "/admin/security-center?view=guardian",
  feature: "admin-guardian",
  color: "text-red-500",
},
{
  title: "TOK Connect",
  description: "Superviser les partenaires, scopes, quotas et webhooks TOK Connect.",
  icon: Rocket,
  href: "/admin/tok-connect",
  feature: "admin-tok-connect",
  color: "text-sky-500",
},
  {
    title: "Abonnements restaurateur",
    description: "Superviser les abonnements, accès dashboard et droits Premium.",
    icon: Crown,
    href: "/admin/packs",
    feature: "admin-packs",
    color: "text-violet-500",
  },
];

const ADMIN_CATEGORY_SPECS = [
  {
    id: "people",
    title: "Utilisateurs, Partenaires et équipe",
    shortTitle: "Utilisateurs & équipe",
    description: "Comptes, partenaires et collaborateurs TOK.",
    icon: Users,
    toolTitles: ["Utilisateurs", "Restaurants", "Dossiers d'inscription", "Profils livreurs", "Comptes commerciaux", "TOK Équipe"],
  },
  {
    id: "services",
    title: "Réservations & services",
    shortTitle: "Réservations & services",
    description: "Commandes, catalogue et services opérationnels.",
    icon: CalendarRange,
    toolTitles: ["Commandes et réservations", "Catalogue central", "La Tok d’Or", "TOK Printer"],
  },
  {
    id: "marketing",
    title: "Clients & marketing",
    shortTitle: "Clients & marketing",
    description: "Relation client, fidélisation et communication.",
    icon: Megaphone,
    toolTitles: ["CRM clients", "Fidélité et abonnement", "Boutons Google Business", "Notifications", "Actualités sociales", "Avis"],
  },
  {
    id: "finance",
    title: "Finances & abonnements",
    shortTitle: "Finances & abonnements",
    description: "Comptabilité, revenus et abonnements restaurants.",
    icon: PieChart,
    toolTitles: ["Comptabilité", "IA comptable", "Abonnements restaurateur"],
  },
  {
    id: "security",
    title: "Sécurité & assistance",
    shortTitle: "Sécurité & assistance",
    description: "Incidents, supervision et résolution assistée.",
    icon: ShieldCheck,
    toolTitles: ["Centre de sécurité", "Guardian IA", "Sinistres et chat", "Résolution IA"],
  },
  {
    id: "platform",
    title: "Plateforme & outils",
    shortTitle: "Plateforme & outils",
    description: "Pilotage technique, intégrations et documentation.",
    icon: Boxes,
    toolTitles: ["Opérations IA", "TOK Connect", "Guide administrateur"],
  },
] as const;

function statusColor(status: string) {
  switch (status) {
    case "pending":
      return "bg-amber-100 text-amber-800";
    case "confirmed":
      return "bg-blue-100 text-blue-800";
    case "delivered":
      return "bg-emerald-100 text-emerald-800";
    case "cancelled":
      return "bg-red-100 text-red-800";
    default:
      return "bg-secondary text-secondary-foreground";
  }
}

function liquidityStatusClass(status: string) {
  switch (status) {
    case "green":
      return "bg-emerald-100 text-emerald-800";
    case "yellow":
      return "bg-amber-100 text-amber-800";
    default:
      return "bg-red-100 text-red-800";
  }
}

function liquidityStatusLabel(status: string) {
  switch (status) {
    case "green":
      return "Capacité solide";
    case "yellow":
      return "À renforcer";
    default:
      return "Action requise";
  }
}

function getOrderCity(row: any) {
  const restaurant = Array.isArray(row.restaurants) ? row.restaurants[0] : row.restaurants;
  return String(restaurant?.city || "Ville inconnue").trim() || "Ville inconnue";
}

export default function AdminHome() {
  const navigate = useNavigate();
  const activeFeatures = useActiveFeatures();
  const { role } = useAuth();
  const { unreadNotifications } = useNotificationCenter(50, { realtime: true });
  const adminPlatformConfigEnabled = activeFeatures.has(ADMIN_PLATFORM_CONFIG_LINK.feature);
  const visibleTools = ADMIN_TOOLS.filter((tool) => !tool.feature || activeFeatures.has(tool.feature));
  const [toolSearch, setToolSearch] = useState("");
  const [categorySearch, setCategorySearch] = useState("");
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);
  const normalizedToolSearch = toolSearch.trim().toLocaleLowerCase("fr");
  const categories = ADMIN_CATEGORY_SPECS.map((category) => ({
    ...category,
    tools: visibleTools.filter((tool) => (category.toolTitles as readonly string[]).includes(tool.title)),
  })).filter((category) => category.tools.length > 0);
  const filteredCategories = categories
    .map((category) => ({
      ...category,
      tools: normalizedToolSearch
        ? category.tools.filter((tool) => `${tool.title} ${tool.description}`.toLocaleLowerCase("fr").includes(normalizedToolSearch))
        : category.tools,
    }))
    .filter((category) => category.tools.length > 0);
  const selectedCategory = categories.find((category) => category.id === selectedCategoryId) ?? null;
  const selectedCategoryTools = selectedCategory?.tools.filter((tool) => {
    const query = categorySearch.trim().toLocaleLowerCase("fr");
    return !query || `${tool.title} ${tool.description}`.toLocaleLowerCase("fr").includes(query);
  }) ?? [];

  const { flags, setFlagState, loading: flagsLoading } = useFeatureFlags(true);
  const comingSoonFlag = flags.find((f) => f.name === "coming-soon");
  const comingSoonActive = comingSoonFlag?.explicitEnabled ?? false;
  const [comingSoonToggling, setComingSoonToggling] = useState(false);

  const { data: stats } = useQuery({
    queryKey: ["admin-stats"],
    queryFn: async () => {
      const [restaurants, orders, reservations] = await Promise.all([
        supabase.from("restaurants").select("id", { count: "exact", head: true }),
        supabase.from("orders").select("id", { count: "exact", head: true }),
        supabase.from("reservations").select("id", { count: "exact", head: true }),
      ]);
      return {
        restaurants: restaurants.count || 0,
        orders: orders.count || 0,
        reservations: reservations.count || 0,
      };
    },
  });

  const { data: revenueStats } = useQuery({
    queryKey: ["admin-revenue-stats"],
    queryFn: async () => {
      const { data: orders } = await supabase
        .from("orders")
        .select("total_amount, status, created_at")
        .gte("created_at", new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString());

      if (!orders) return { gmv: 0, cancelRate: 0, avgTicket: 0 };

      const validOrders = orders.filter((order) => order.status !== "cancelled");
      const cancelledOrders = orders.filter((order) => order.status === "cancelled");
      const gmv = validOrders.reduce((sum, order) => sum + (order.total_amount || 0), 0);
      const avgTicket = validOrders.length > 0 ? gmv / validOrders.length : 0;
      const cancelRate = orders.length > 0 ? (cancelledOrders.length / orders.length) * 100 : 0;

      return {
        gmv,
        cancelRate: Math.round(cancelRate * 10) / 10,
        avgTicket: Math.round(avgTicket * 100) / 100,
      };
    },
  });

  const { data: tokOneStats } = useQuery({
    queryKey: ["admin-tok-one-stats"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("tok_one_subscriptions")
        .select(`
          status,
          user_subscription_plans (
            price_monthly,
            price_yearly
          )
        `)
        .in("status", ["active", "trialing"]);

      if (error) throw error;

      const subscriptions = (data || []) as Array<{
        status?: string | null;
        user_subscription_plans?: {
          price_monthly?: number | null;
          price_yearly?: number | null;
        } | null;
      }>;

      const activeCount = subscriptions.length;
      const estimatedRevenue = subscriptions.reduce((sum, subscription) => {
        const plan = subscription.user_subscription_plans;
        return sum + Number(plan?.price_monthly || 0);
      }, 0);

      return {
        activeCount,
        estimatedRevenue,
      };
    },
  });

  const { data: recentOrders } = useQuery({
    queryKey: ["admin-recent-orders"],
    queryFn: async () => {
      const { data } = await supabase
        .from("orders")
        .select("id, total_amount, status, created_at")
        .order("created_at", { ascending: false })
        .limit(10);
      return data || [];
    },
  });

  const { data: auditLogs } = useQuery({
    queryKey: ["admin-audit-logs"],
    queryFn: async () => {
      const [edgeResponse, dataResponse] = await Promise.all([
        (supabase.from("edge_function_audit_logs" as any))
          .select("id, function_name, action, status, target_entity_type, target_entity_id, created_at")
          .order("created_at", { ascending: false })
          .limit(10),
        (supabase.from("audit_log" as any))
          .select("id, action, entity_type, entity_id, created_at")
          .order("created_at", { ascending: false })
          .limit(10),
      ]);

      if (edgeResponse.error) throw edgeResponse.error;
      if (dataResponse.error) throw dataResponse.error;

      const edgeLogs = ((edgeResponse.data || []) as any[]).map((row) => ({
        id: `edge-${row.id}`,
        action: `${row.function_name}:${row.action || "invoke"}`,
        entity_type: row.target_entity_type || "edge",
        entity_id: row.target_entity_id || "",
        created_at: row.created_at,
        status: row.status === "failure" ? "failure" : "success",
      }));

      const dataLogs = ((dataResponse.data || []) as any[]).map((row) => ({
        id: `data-${row.id}`,
        action: row.action || "mutation",
        entity_type: row.entity_type || "entity",
        entity_id: row.entity_id || "",
        created_at: row.created_at,
        status: "info",
      }));

      return [...edgeLogs, ...dataLogs]
        .sort((left, right) => Date.parse(right.created_at) - Date.parse(left.created_at))
        .slice(0, 15);
    },
  });

  const { data: cityLiquidity = [] } = useQuery({
    queryKey: ["admin-city-liquidity"],
    queryFn: async () => {
      const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
      const [restaurantsResponse, couriersResponse, ordersResponse, dispatchResponse] = await Promise.all([
        supabase
          .from("restaurants")
          .select("id, city")
          .eq("is_active", true),
        supabase
          .from("couriers")
          .select("id, is_online, status"),
        (supabase as any)
          .from("orders")
          .select("id, status, restaurant_id, restaurants ( city )")
          .gte("created_at", since)
          .limit(ADMIN_HOME_AGGREGATE_LIMIT),
        (supabase as any)
          .from("dispatch_jobs")
          .select("id, status, courier_id")
          .gte("created_at", since)
          .limit(ADMIN_HOME_AGGREGATE_LIMIT),
      ]);

      if (restaurantsResponse.error) throw restaurantsResponse.error;
      if (couriersResponse.error) throw couriersResponse.error;
      if (ordersResponse.error) throw ordersResponse.error;
      if (dispatchResponse.error) throw dispatchResponse.error;

      const aggregates = new Map<string, {
        activeRestaurants: number;
        openOrders: number;
        successfulDeliveries: number;
      }>();
      const ensureCity = (city: string) => {
        if (!aggregates.has(city)) {
          aggregates.set(city, { activeRestaurants: 0, openOrders: 0, successfulDeliveries: 0 });
        }
        return aggregates.get(city)!;
      };

      for (const restaurant of restaurantsResponse.data || []) {
        ensureCity(String(restaurant.city || "Ville inconnue")).activeRestaurants += 1;
      }

      const openStatuses = new Set(["confirmed", "accepted", "preparing", "ready", "out_for_delivery"]);
      const successfulStatuses = new Set(["delivered", "completed"]);
      for (const order of ordersResponse.data || []) {
        const city = getOrderCity(order);
        const aggregate = ensureCity(city);
        const status = String(order.status || "").trim().toLowerCase();

        if (openStatuses.has(status)) {
          aggregate.openOrders += 1;
        }
        if (successfulStatuses.has(status)) {
          aggregate.successfulDeliveries += 1;
        }
      }

      const activeCouriers = (couriersResponse.data || []).filter((courier) => {
        const status = String(courier.status || "").trim().toLowerCase();
        return courier.is_online && !["blocked", "suspended", "inactive"].includes(status);
      }).length;
      const noCourierJobs = ((dispatchResponse.data || []) as any[]).filter((job) => {
        const status = String(job.status || "").trim().toLowerCase();
        return ["searching", "assigned", "accepted", "pickup", "picked_up", "en_route", "delivering", "in_progress"].includes(status)
          && !String(job.courier_id || "").trim();
      }).length;

      return Array.from(aggregates.entries())
        .map(([city, aggregate]) => ({
          ...scoreMarketplaceLiquidity({
            city,
            activeRestaurants: aggregate.activeRestaurants,
            activeCouriers,
            openOrders: aggregate.openOrders,
            noCourierJobs: aggregate.openOrders > 0 ? noCourierJobs : 0,
            successfulDeliveries: aggregate.successfulDeliveries,
          }),
          ...aggregate,
          activeCouriers,
          noCourierJobs,
        }))
        .sort((left, right) => left.score - right.score)
        .slice(0, 5);
    },
  });

  const dashboardMetrics = [
    { label: "Restaurants", value: String(stats?.restaurants || 0), icon: UtensilsCrossed },
    { label: "Commandes", value: String(stats?.orders || 0), icon: ShoppingCart },
    { label: "Réservations", value: String(stats?.reservations || 0), icon: CalendarDays },
    { label: "GMV (30j)", value: `${(revenueStats?.gmv || 0).toFixed(0)} CHF`, icon: DollarSign },
    { label: "Panier moyen", value: `${(revenueStats?.avgTicket || 0).toFixed(2)} CHF`, icon: ShoppingCart },
    { label: "Taux annulation", value: `${revenueStats?.cancelRate || 0}%`, icon: TrendingDown },
    { label: "Tok One", value: `${(tokOneStats?.estimatedRevenue || 0).toFixed(2)} CHF`, icon: Crown, premium: true },
  ];

  const openCategory = (categoryId: string) => {
    setCategorySearch("");
    setSelectedCategoryId(categoryId);
  };

  return (
    <div className="mx-auto w-full max-w-[1680px] space-y-3 px-3 pb-10 pt-2 sm:px-5 lg:px-6">
      <header className="relative overflow-hidden rounded-[1.6rem] border border-border/70 bg-card px-4 py-4 shadow-sm sm:px-6 lg:py-4">
        <div className="relative z-10 flex items-center gap-3 lg:gap-5">
          <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-gradient-to-br from-[#ff7a1a] to-primary shadow-[0_12px_30px_rgba(241,93,34,0.24)] lg:h-[4.5rem] lg:w-[4.5rem]">
            <img src={OPTIMIZED_TOK_LOGO_SRC} alt="TOK" className="h-full w-full scale-[1.16] object-contain" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="mb-1 hidden text-[10px] font-bold uppercase tracking-[0.28em] text-primary sm:block">Back-office TOK</p>
            <h1 className="font-display text-[1.8rem] font-black leading-none tracking-[-0.035em] text-foreground sm:text-4xl">Administration</h1>
            <p className="mt-1 hidden max-w-3xl text-sm text-muted-foreground lg:block">
              Pilotez les opérations, les utilisateurs et les outils actifs depuis un espace unique.
            </p>
          </div>
          <img
            src={DASHBOARD_ILLUSTRATIONS.adminAnalytics.src}
            alt=""
            width={72}
            height={72}
            className="hidden h-[4.5rem] w-[4.5rem] object-contain opacity-90 xl:block"
          />
        </div>
        <label className="relative mt-4 block lg:absolute lg:right-28 lg:top-1/2 lg:mt-0 lg:w-[min(28rem,34vw)] lg:-translate-y-1/2 xl:right-36">
          <span className="sr-only">Rechercher un outil admin</span>
          <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-primary" />
          <input
            value={toolSearch}
            onChange={(event) => setToolSearch(event.target.value)}
            placeholder="Rechercher un outil…"
            className="h-11 w-full rounded-full border border-border/80 bg-background/90 pl-11 pr-4 text-sm outline-none transition focus:border-primary focus:ring-4 focus:ring-primary/10"
          />
        </label>
      </header>

      <section aria-label="Indicateurs clés" className="grid grid-flow-col auto-cols-[8.8rem] gap-2 overflow-x-auto pb-1 [scrollbar-width:none] xl:grid-flow-row xl:grid-cols-7 xl:overflow-visible xl:pb-0">
        {dashboardMetrics.map((metric) => (
          <Card key={metric.label} className={metric.premium ? "border-amber-300 bg-amber-50/80 dark:bg-amber-950/20" : "border-border/70"}>
            <CardContent className="flex h-[5.35rem] flex-col justify-between p-3">
              <div className="flex items-center justify-between gap-2 text-[11px] font-medium text-muted-foreground">
                <span className="truncate">{metric.label}</span>
                <metric.icon className={`h-4 w-4 shrink-0 ${metric.premium ? "text-amber-700" : "text-primary"}`} />
              </div>
              <p className={`truncate text-xl font-bold tabular-nums ${metric.premium ? "text-amber-950 dark:text-amber-100" : "text-foreground"}`}>{metric.value}</p>
            </CardContent>
          </Card>
        ))}
      </section>

      <section aria-labelledby="admin-spaces-title">
        <div className="mb-2 flex items-end justify-between px-1 xl:hidden">
          <div>
            <h2 id="admin-spaces-title" className="font-display text-xl font-bold">Vos espaces</h2>
            <p className="text-xs text-muted-foreground">{visibleTools.length} outils regroupés en 6 catégories</p>
          </div>
        </div>

        <div className="grid gap-2 xl:hidden">
          {filteredCategories.map((category) => (
            <button
              key={category.id}
              type="button"
              onClick={() => openCategory(category.id)}
              className="group flex min-h-[4.65rem] items-center gap-3 rounded-2xl border border-border/70 bg-card px-4 py-3 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-primary/35 hover:shadow-md"
            >
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <category.icon className="h-5 w-5" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block font-display text-[1rem] font-bold leading-tight">{category.shortTitle}</span>
                <span className="mt-0.5 block truncate text-xs text-muted-foreground">{category.description}</span>
              </span>
              <span className="shrink-0 text-right">
                <span className="block text-xs font-semibold text-primary">{category.tools.length} outils</span>
                <ChevronRight className="ml-auto mt-1 h-4 w-4 text-muted-foreground transition group-hover:translate-x-0.5 group-hover:text-primary" />
              </span>
            </button>
          ))}
        </div>

        <div className="hidden grid-cols-3 gap-3 xl:grid">
          {filteredCategories.map((category) => (
            <Card key={category.id} className="overflow-hidden border-border/70 shadow-sm">
              <CardHeader className="border-b border-primary/10 bg-gradient-to-r from-primary/[0.10] to-orange-50/40 px-4 py-3 dark:to-transparent">
                <div className="flex items-center gap-3">
                  <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
                    <category.icon className="h-5 w-5" />
                  </span>
                  <CardTitle className="min-w-0 flex-1 truncate font-display text-[1.05rem]">{category.title}</CardTitle>
                  <span className="shrink-0 text-xs font-medium text-primary">{category.tools.length} outils</span>
                </div>
              </CardHeader>
              <CardContent className="px-4 py-1.5">
                {category.tools.map((tool) => (
                  <button
                    key={tool.href}
                    type="button"
                    onClick={() => navigate(tool.href)}
                    className="group flex min-h-9 w-full items-center gap-3 border-b border-border/60 py-1.5 text-left last:border-0 hover:text-primary"
                  >
                    <tool.icon className={`h-4 w-4 shrink-0 ${tool.color}`} />
                    <span className="min-w-0 flex-1 truncate text-[13px] font-medium">{tool.title}</span>
                    <NotificationMenuBadge route={tool.href} role={role} unreadNotifications={unreadNotifications} />
                    <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground transition group-hover:translate-x-0.5 group-hover:text-primary" />
                  </button>
                ))}
              </CardContent>
            </Card>
          ))}
        </div>

        {filteredCategories.length === 0 ? (
          <div className="rounded-2xl border border-dashed bg-card p-8 text-center">
            <Search className="mx-auto h-6 w-6 text-muted-foreground" />
            <p className="mt-2 font-semibold">Aucun outil ne correspond à « {toolSearch} »</p>
            <button type="button" onClick={() => setToolSearch("")} className="mt-2 text-sm font-medium text-primary hover:underline">Effacer la recherche</button>
          </div>
        ) : null}
      </section>

      <section aria-label="Contrôles rapides" className="grid gap-2 lg:grid-cols-[1.15fr_0.85fr_1fr]">
        <Card className={comingSoonActive ? "border-amber-300 bg-amber-50/80" : "border-emerald-200 bg-emerald-50/70 dark:bg-emerald-950/20"}>
          <CardContent className="flex min-h-[4.25rem] items-center gap-3 p-3.5">
            <Rocket className={`h-5 w-5 shrink-0 ${comingSoonActive ? "text-amber-600" : "text-emerald-600"}`} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold">Accès clients : {comingSoonActive ? "verrouillé" : "ouvert"}</p>
              <p className="truncate text-[11px] text-muted-foreground">Animation de lancement partagée</p>
            </div>
            <Switch
              aria-label="Verrouiller l’accès client avec l’animation de lancement"
              checked={comingSoonActive}
              disabled={flagsLoading || comingSoonToggling || !comingSoonFlag}
              onCheckedChange={async (checked) => {
                setComingSoonToggling(true);
                await setFlagState(
                  comingSoonFlag!.id,
                  checked,
                  checked ? "Activation Coming Soon depuis admin home" : "Désactivation Coming Soon depuis admin home",
                );
                setComingSoonToggling(false);
              }}
            />
          </CardContent>
        </Card>
        {adminPlatformConfigEnabled ? (
          <Button onClick={() => navigate(ADMIN_PLATFORM_CONFIG_LINK.href)} className="h-auto min-h-[4.25rem] rounded-2xl text-sm shadow-[0_10px_24px_rgba(241,93,34,0.22)]">
            <Settings2 className="mr-2 h-4 w-4" /> Configuration plateforme
          </Button>
        ) : <div />}
        <button
          type="button"
          onClick={() => document.getElementById("admin-city-capacity")?.scrollIntoView({ behavior: "smooth" })}
          className="flex min-h-[4.25rem] items-center gap-3 rounded-2xl border border-border/70 bg-card px-4 text-left shadow-sm transition hover:border-primary/40"
        >
          <MapPin className="h-5 w-5 text-primary" />
          <span className="min-w-0 flex-1"><span className="block text-sm font-semibold">Capacité par ville</span><span className="block truncate text-[11px] text-muted-foreground">Zones, charge et recommandations</span></span>
          <ArrowUpRight className="h-4 w-4 text-muted-foreground" />
        </button>
      </section>

      <Sheet open={Boolean(selectedCategory)} onOpenChange={(open) => !open && setSelectedCategoryId(null)}>
        <SheetContent side="right" className="w-[min(28rem,calc(100vw-0.5rem))] overflow-hidden bg-background p-0">
          {selectedCategory ? (
            <div className="flex h-full min-h-0 flex-col">
              <SheetHeader className="shrink-0 border-b bg-card px-5 pb-5 pt-7 text-left">
                <div className="mb-2 flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                  <selectedCategory.icon className="h-6 w-6" />
                </div>
                <SheetTitle className="pr-10 font-display text-2xl leading-tight">{selectedCategory.title}</SheetTitle>
                <SheetDescription>{selectedCategory.description} · {selectedCategory.tools.length} outils</SheetDescription>
                <label className="relative mt-3 block">
                  <span className="sr-only">Rechercher dans cette catégorie</span>
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <input
                    value={categorySearch}
                    onChange={(event) => setCategorySearch(event.target.value)}
                    placeholder="Rechercher dans cette catégorie…"
                    className="h-11 w-full rounded-xl border bg-background pl-10 pr-3 text-sm outline-none focus:border-primary focus:ring-4 focus:ring-primary/10"
                  />
                </label>
              </SheetHeader>
              <nav data-sheet-scroll-area className="min-h-0 flex-1 space-y-2 overflow-y-auto p-4 pb-[calc(env(safe-area-inset-bottom,0px)+1rem)]" aria-label={selectedCategory.title}>
                {selectedCategoryTools.length === 0 ? <p role="status" className="p-4 text-sm text-muted-foreground">Aucun outil ne correspond à cette recherche.</p> : null}
                {selectedCategoryTools.map((tool) => (
                  <button
                    key={tool.href}
                    type="button"
                    onClick={() => navigate(tool.href)}
                    className="group flex w-full items-center gap-3 rounded-2xl border bg-card p-3.5 text-left shadow-sm transition hover:border-primary/35 hover:bg-primary/[0.03]"
                  >
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-muted">
                      <tool.icon className={`h-5 w-5 ${tool.color}`} />
                    </span>
                    <span className="min-w-0 flex-1"><span className="block font-semibold">{tool.title}</span><span className="mt-0.5 line-clamp-2 block text-xs text-muted-foreground">{tool.description}</span></span>
                    <NotificationMenuBadge route={tool.href} role={role} unreadNotifications={unreadNotifications} />
                    <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground transition group-hover:translate-x-0.5 group-hover:text-primary" />
                  </button>
                ))}
              </nav>
            </div>
          ) : null}
        </SheetContent>
      </Sheet>

      <Card id="admin-city-capacity" className="mt-6">
        <CardHeader className="space-y-4">
          <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <MapPin className="h-5 w-5 text-primary" />
                <CardTitle>Capacité opérationnelle par ville</CardTitle>
              </div>
              <p className="max-w-3xl text-sm text-muted-foreground">
                Cet indicateur estime si l'offre de restaurants et de coursiers peut absorber les commandes.
                Il combine les données en direct avec l'activité des 30 derniers jours ; ce n'est pas un chiffre financier.
              </p>
            </div>
            <Badge variant="outline" className="w-fit gap-1.5 font-normal">
              <Info className="h-3.5 w-3.5" />
              5 villes les plus fragiles
            </Badge>
          </div>
          <div className="grid gap-2 text-xs sm:grid-cols-3">
            <div className="rounded-lg bg-emerald-50 px-3 py-2 text-emerald-800"><strong>80–100</strong> · capacité solide</div>
            <div className="rounded-lg bg-amber-50 px-3 py-2 text-amber-800"><strong>50–79</strong> · à renforcer</div>
            <div className="rounded-lg bg-red-50 px-3 py-2 text-red-800"><strong>0–49</strong> · action requise</div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {cityLiquidity.map((city) => (
              <div key={city.city} className="space-y-4 rounded-xl border p-4 text-sm">
                <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                  <div className="min-w-0 space-y-1">
                    <p className="text-base font-semibold">{city.city}</p>
                    <p className="text-xs text-muted-foreground">Activité observée sur les 30 derniers jours</p>
                  </div>
                  <div className="flex shrink-0 flex-wrap items-center gap-2">
                    <Badge variant="secondary" className={liquidityStatusClass(city.status)}>
                      {liquidityStatusLabel(city.status)}
                    </Badge>
                    <span className="font-semibold tabular-nums">{city.score}/100</span>
                  </div>
                </div>
                <Progress value={city.score} aria-label={`Score de capacité de ${city.city} : ${city.score} sur 100`} className="h-2" />
                <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
                  <div className="rounded-lg bg-muted/50 p-3"><strong className="block text-lg">{city.activeRestaurants}</strong><span className="text-xs text-muted-foreground">restaurants actifs</span></div>
                  <div className="rounded-lg bg-muted/50 p-3"><strong className="block text-lg">{city.activeCouriers}</strong><span className="text-xs text-muted-foreground">coursiers en ligne*</span></div>
                  <div className="rounded-lg bg-muted/50 p-3"><strong className="block text-lg">{city.openOrders}</strong><span className="text-xs text-muted-foreground">commandes ouvertes</span></div>
                  <div className="rounded-lg bg-muted/50 p-3"><strong className="block text-lg">{city.successfulDeliveries}</strong><span className="text-xs text-muted-foreground">livraisons réussies</span></div>
                </div>
                {city.blockers.length > 0 ? (
                  <div className="space-y-2 border-t pt-3">
                    <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      <CircleAlert className="h-4 w-4 text-amber-600" /> Pourquoi le score baisse
                    </p>
                    <div className="grid gap-2 md:grid-cols-2">
                      {city.blockers.map((blocker) => {
                        const explanation = MARKETPLACE_LIQUIDITY_BLOCKERS[blocker as MarketplaceLiquidityBlocker];
                        return (
                          <div key={blocker} className="rounded-lg border border-amber-200 bg-amber-50/60 px-3 py-2">
                            <p className="font-medium text-amber-950">{explanation.label}</p>
                            <p className="text-xs text-amber-900/80">{explanation.detail}</p>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ) : (
                  <p className="flex items-center gap-2 border-t pt-3 text-sm text-emerald-700">
                    <CheckCircle2 className="h-4 w-4" /> Aucun point de vigilance détecté.
                  </p>
                )}
                <p className="text-[11px] text-muted-foreground">* Le nombre de coursiers est actuellement mesuré à l'échelle du réseau TOK.</p>
              </div>
            ))}
            {cityLiquidity.length === 0 ? (
              <p className="py-4 text-center text-sm text-muted-foreground">Aucune ville active a afficher</p>
            ) : null}
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <ShoppingCart className="h-5 w-5 text-primary" />
              <CardTitle>Commandes récentes</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-64">
              <div className="space-y-2">
                {recentOrders?.map((order: any) => (
                  <div key={order.id} className="flex items-start justify-between gap-3 rounded-lg border p-2 text-sm">
                    <div className="min-w-0 flex-1">
                      <p className="break-words font-medium">{order.total_amount?.toFixed(2)} CHF</p>
                      <p className="text-xs text-muted-foreground">
                        {new Date(order.created_at).toLocaleDateString("fr-CH", {
                          day: "2-digit",
                          month: "short",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </p>
                    </div>
                    <Badge variant="secondary" className={`${statusColor(order.status)} shrink-0 self-start`}>
                      {order.status}
                    </Badge>
                  </div>
                ))}
                {(!recentOrders || recentOrders.length === 0) ? (
                  <p className="py-4 text-center text-sm text-muted-foreground">Aucune commande récente</p>
                ) : null}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-2">
                <Shield className="h-5 w-5 text-amber-500" />
                <CardTitle>Journal d'audit</CardTitle>
              </div>
              <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
                <Button variant="ghost" size="sm" className="self-stretch sm:self-auto" onClick={() => navigate("/admin/security-center?view=audit")}>
                  Voir tout
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-64">
              <div className="space-y-2">
                {auditLogs?.map((log: any) => (
                  <div key={log.id} className="flex items-start justify-between gap-3 rounded-lg border p-2 text-sm">
                    <div className="min-w-0 flex-1">
                      <p className="font-medium leading-5 break-words [overflow-wrap:anywhere]">
                        {log.action} - <span className="text-muted-foreground">{log.entity_type}</span>
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {new Date(log.created_at).toLocaleDateString("fr-CH", {
                          day: "2-digit",
                          month: "short",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </p>
                    </div>
                    <Badge
                      variant={
                        log.status === "failure"
                          ? "destructive"
                          : log.status === "success"
                            ? "secondary"
                            : "outline"
                      }
                      className="shrink-0 self-start text-xs"
                    >
                      {log.status}
                    </Badge>
                  </div>
                ))}
                {(!auditLogs || auditLogs.length === 0) ? (
                  <p className="py-4 text-center text-sm text-muted-foreground">Aucun log d'audit</p>
                ) : null}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
