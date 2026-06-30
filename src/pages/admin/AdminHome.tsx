import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  Bell,
  Bike,
  Brain,
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
  CalendarDays,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import DashboardPageHero from "@/components/dashboard/DashboardPageHero";
import AdminLogResetButton from "@/components/admin/AdminLogResetButton";
import NotificationMenuBadge from "@/components/notifications/NotificationMenuBadge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { getSupabase } from "@/integrations/supabase/client";
import { useNotificationCenter } from "@/hooks/useNotificationCenter";
import { useAuth } from "@/lib/auth-context";
import { useActiveFeatures } from "@/lib/featureFlags";
import { scoreMarketplaceLiquidity } from "@/lib/marketplaceLiquidity";

const supabase = getSupabase();
const ADMIN_HOME_AGGREGATE_LIMIT = 250;
const ADMIN_PLATFORM_CONFIG_LINK = {
  href: "/admin/platform",
  feature: "admin-platform-config",
} as const;

const ADMIN_TOOLS = [
  {
    title: "Restaurants",
    description: "Gérer les restaurants, activations et statuts.",
    icon: Store,
    href: "/admin/restaurants",
    feature: "admin-restaurants",
    color: "text-primary",
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
    title: "Comptabilite",
    description: "Gérer les reversements et les parts TOK.",
    icon: Calculator,
    href: "/admin/compta",
    feature: "admin-compta",
    color: "text-emerald-500",
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
    title: "La Table du Chef",
    description: "Créer et gérer les expériences exclusives La Table du Chef.",
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
    title: "Audit et sécurité",
    description: "Surveiller les exécutions Edge et les mutations sensibles.",
    icon: Shield,
    href: "/admin/audit",
    feature: "admin-audit",
    color: "text-amber-500",
  },
  {
    title: "Operations IA",
    description: "Surveiller sécurité, coûts, performance et incidents IA.",
    icon: Brain,
    href: "/admin/ai-operations",
    feature: "ai_admin_monitoring",
    color: "text-violet-500",
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

function getOrderCity(row: any) {
  const restaurant = Array.isArray(row.restaurants) ? row.restaurants[0] : row.restaurants;
  return String(restaurant?.city || "Ville inconnue").trim() || "Ville inconnue";
}

export default function AdminHome() {
  const navigate = useNavigate();
  const activeFeatures = useActiveFeatures();
  const { role } = useAuth();
  const { unreadNotifications } = useNotificationCenter(50);
  const adminPlatformConfigEnabled = activeFeatures.has(ADMIN_PLATFORM_CONFIG_LINK.feature);
  const visibleTools = ADMIN_TOOLS.filter((tool) => !tool.feature || activeFeatures.has(tool.feature));

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

  return (
    <div className="container space-y-6 py-8">
      <DashboardPageHero
        badge="Back-office TOK"
        title="Administration"
        description="Tableau de bord global pour piloter les restaurants, les commandes, les réservations, la configuration et les modules admin actifs."
        icon={Settings2}
        tone="orange"
        visualLabel="Admin"
        stats={[
          { label: "Restaurants", value: stats?.restaurants || 0, icon: UtensilsCrossed },
          { label: "Commandes", value: stats?.orders || 0, icon: ShoppingCart },
          { label: "Reservations", value: stats?.reservations || 0, icon: CalendarDays },
        ]}
        actions={(
        adminPlatformConfigEnabled ? (
          <Button onClick={() => navigate(ADMIN_PLATFORM_CONFIG_LINK.href)} className="gap-2">
            <Settings2 className="h-4 w-4" />
            Configuration plateforme
          </Button>
        ) : null
        )}
      />

      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">Restaurants</CardTitle>
            <UtensilsCrossed className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent><p className="text-2xl font-bold">{stats?.restaurants || 0}</p></CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">Commandes</CardTitle>
            <ShoppingCart className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent><p className="text-2xl font-bold">{stats?.orders || 0}</p></CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">Reservations</CardTitle>
            <CalendarDays className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent><p className="text-2xl font-bold">{stats?.reservations || 0}</p></CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">GMV (30j)</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent><p className="text-2xl font-bold">{(revenueStats?.gmv || 0).toFixed(0)} <span className="text-sm font-normal">CHF</span></p></CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">Panier moyen</CardTitle>
            <ShoppingCart className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent><p className="text-2xl font-bold">{(revenueStats?.avgTicket || 0).toFixed(2)} <span className="text-sm font-normal">CHF</span></p></CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">Taux annulation</CardTitle>
            <TrendingDown className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent><p className="text-2xl font-bold">{revenueStats?.cancelRate || 0}%</p></CardContent>
        </Card>
        <Card className="col-span-2 border-amber-200 bg-amber-50 md:col-span-3 lg:col-span-2 xl:col-span-1">
          <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
            <CardTitle className="text-xs font-medium text-amber-800">Abonnements Tok One</CardTitle>
            <Crown className="h-4 w-4 text-amber-700" />
          </CardHeader>
          <CardContent className="space-y-1">
            <p className="text-2xl font-bold text-amber-900">
              {(tokOneStats?.estimatedRevenue || 0).toFixed(2)} <span className="text-sm font-normal">CHF</span>
            </p>
            <p className="text-xs text-amber-800">
              Revenu actif estimé pour {tokOneStats?.activeCount || 0} abonnement{(tokOneStats?.activeCount || 0) > 1 ? "s" : ""}
            </p>
            <p className="text-[11px] text-amber-700/90">
              Revenu estimé sur base mensuelle, utilisé comme fallback de sécurité.
            </p>
          </CardContent>
        </Card>
      </div>

      <Card className="border-primary/20 bg-primary/5">
        <CardContent className="flex flex-col gap-4 py-6 lg:flex-row lg:items-center lg:justify-between">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <Rocket className="h-5 w-5 text-primary" />
              <p className="font-semibold">Configuration globale des fonctionnalités</p>
            </div>
            <p className="text-sm text-muted-foreground">
              Activez ou coupez les paiements, parcours client, onglets restaurateur, modules coursier et outils admin.
            </p>
          </div>
          {adminPlatformConfigEnabled ? (
            <Button variant="secondary" onClick={() => navigate(ADMIN_PLATFORM_CONFIG_LINK.href)}>
              Ouvrir la configuration
            </Button>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <MapPin className="h-5 w-5 text-primary" />
            <CardTitle>Liquidite par ville</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {cityLiquidity.map((city) => (
              <div key={city.city} className="flex flex-col gap-3 rounded-lg border p-3 text-sm md:flex-row md:items-center md:justify-between">
                <div className="min-w-0">
                  <p className="font-semibold">{city.city}</p>
                  <p className="text-xs text-muted-foreground">
                    {city.activeRestaurants} restaurants actifs, {city.activeCouriers} coursiers en ligne, {city.openOrders} commande(s) ouverte(s)
                  </p>
                </div>
                <div className="flex shrink-0 flex-wrap items-center gap-2">
                  <Badge variant="secondary" className={liquidityStatusClass(city.status)}>
                    {city.score}/100
                  </Badge>
                  {city.blockers.length > 0 ? (
                    <Badge variant="outline">{city.blockers.length} blocage(s)</Badge>
                  ) : null}
                </div>
              </div>
            ))}
            {cityLiquidity.length === 0 ? (
              <p className="py-4 text-center text-sm text-muted-foreground">Aucune ville active a afficher</p>
            ) : null}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-primary" />
            <CardTitle>Outils admin</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {visibleTools.map((tool) => (
              <button
                key={tool.href}
                onClick={() => navigate(tool.href)}
                className="rounded-xl border p-4 text-left transition-colors hover:border-primary/50 hover:bg-muted/30"
              >
                <div className="flex items-start gap-3">
                  <tool.icon className={`mt-0.5 h-5 w-5 ${tool.color}`} />
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex items-center gap-2">
                      <p className="font-semibold">{tool.title}</p>
                      <NotificationMenuBadge route={tool.href} role={role} unreadNotifications={unreadNotifications} />
                    </div>
                    <p className="text-sm text-muted-foreground">{tool.description}</p>
                  </div>
                </div>
              </button>
            ))}
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
                <AdminLogResetButton className="justify-center gap-2" />
                <Button variant="ghost" size="sm" className="self-stretch sm:self-auto" onClick={() => navigate("/admin/audit")}>
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
