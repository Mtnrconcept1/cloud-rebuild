import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  Bell,
  Crown,
  DollarSign,
  Layers,
  MessageSquareText,
  Rocket,
  Settings2,
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
import { ScrollArea } from "@/components/ui/scroll-area";
import { supabase } from "@/integrations/supabase/client";
import { useActiveFeatures } from "@/lib/featureFlags";

const ADMIN_TOOLS = [
  {
    title: "Restaurants",
    description: "Gerer les restaurants, activations et statuts.",
    icon: Store,
    href: "/admin/restaurants",
    feature: "admin-restaurants",
    color: "text-primary",
  },
  {
    title: "Comptabilite",
    description: "Gerer les reversements et les parts TOK.",
    icon: Calculator,
    href: "/admin/compta",
    feature: "admin-compta",
    color: "text-emerald-500",
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
    title: "Fidelite et abonnement",
    description: "Configurer Miamz+ et les avantages.",
    icon: Crown,
    href: "/admin/loyalty",
    feature: "admin-loyalty",
    color: "text-amber-500",
  },
  {
    title: "Drops",
    description: "Creer et gerer les ventes flash Chef's Table.",
    icon: UtensilsCrossed,
    href: "/admin/drops",
    feature: "admin-drops",
    color: "text-pink-500",
  },
  {
    title: "Notifications",
    description: "Piloter les campagnes et alertes ciblees.",
    icon: Bell,
    href: "/admin/notifications",
    feature: "admin-notifications",
    color: "text-orange-500",
  },
  {
    title: "Audit et securite",
    description: "Surveiller les executions edge et les mutations sensibles.",
    icon: Shield,
    href: "/admin/audit",
    feature: "admin-audit",
    color: "text-amber-500",
  },
  {
    title: "Packs de lancement",
    description: "Gerer les packs achetes et le suivi des services.",
    icon: Rocket,
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

export default function AdminHome() {
  const navigate = useNavigate();
  const activeFeatures = useActiveFeatures();
  const visibleTools = ADMIN_TOOLS.filter((tool) => activeFeatures.has(tool.feature));

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

  return (
    <div className="container space-y-6 py-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-bold">Administration</h1>
          <p className="text-sm text-muted-foreground">
            Tableau de bord global et acces aux modules admin actifs.
          </p>
        </div>
        <Button onClick={() => navigate("/admin/platform")} className="gap-2">
          <Settings2 className="h-4 w-4" />
          Configuration plateforme
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-6">
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
      </div>

      <Card className="border-primary/20 bg-primary/5">
        <CardContent className="flex flex-col gap-4 py-6 lg:flex-row lg:items-center lg:justify-between">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <Rocket className="h-5 w-5 text-primary" />
              <p className="font-semibold">Configuration globale des fonctionnalites</p>
            </div>
            <p className="text-sm text-muted-foreground">
              Activez ou coupez les paiements, parcours client, onglets restaurateur, modules coursier et outils admin.
            </p>
          </div>
          <Button variant="secondary" onClick={() => navigate("/admin/platform")}>
            Ouvrir la configuration
          </Button>
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
                  <div className="space-y-1">
                    <p className="font-semibold">{tool.title}</p>
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
              <CardTitle>Commandes recentes</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-64">
              <div className="space-y-2">
                {recentOrders?.map((order: any) => (
                  <div key={order.id} className="flex items-center justify-between rounded-lg border p-2 text-sm">
                    <div>
                      <p className="font-medium">{order.total_amount?.toFixed(2)} CHF</p>
                      <p className="text-xs text-muted-foreground">
                        {new Date(order.created_at).toLocaleDateString("fr-CH", {
                          day: "2-digit",
                          month: "short",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </p>
                    </div>
                    <Badge variant="secondary" className={statusColor(order.status)}>
                      {order.status}
                    </Badge>
                  </div>
                ))}
                {(!recentOrders || recentOrders.length === 0) ? (
                  <p className="py-4 text-center text-sm text-muted-foreground">Aucune commande recente</p>
                ) : null}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Shield className="h-5 w-5 text-amber-500" />
                <CardTitle>Journal d'audit</CardTitle>
              </div>
              <Button variant="ghost" size="sm" onClick={() => navigate("/admin/audit")}>
                Voir tout
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-64">
              <div className="space-y-2">
                {auditLogs?.map((log: any) => (
                  <div key={log.id} className="flex items-center justify-between rounded-lg border p-2 text-sm">
                    <div>
                      <p className="font-medium">
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
                      className="text-xs"
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
