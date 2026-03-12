import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Users,
  UtensilsCrossed,
  ShoppingCart,
  CalendarDays,
  Sparkles,
  Bell,
  DollarSign,
  TrendingDown,
  Shield,
  Layers,
  Crown,
  MessageSquareText,
  Store,
  Settings,
  Rocket,
} from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { useNavigate } from "react-router-dom";
import { useFeatureFlags } from "@/lib/featureFlags";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";

const ADMIN_TOOLS = [
  {
    title: "Restaurants",
    description: "Gerer les restaurants, activations et statuts.",
    icon: Store,
    href: "/admin/restaurants",
    color: "text-primary",
  },
  {
    title: "Utilisateurs",
    description: "Administrer les comptes et les roles.",
    icon: Users,
    href: "/admin/utilisateurs",
    color: "text-sky-500",
  },
  {
    title: "Avis",
    description: "Moderation et suivi des avis clients.",
    icon: MessageSquareText,
    href: "/admin/avis",
    color: "text-emerald-500",
  },
  {
    title: "Catalogue central",
    description: "Cuisines, collections et structure globale.",
    icon: Layers,
    href: "/admin/catalog",
    color: "text-indigo-500",
  },
  {
    title: "Fidelite et abonnement",
    description: "Configurer Miamz+ et les avantages.",
    icon: Crown,
    href: "/admin/loyalty",
    color: "text-amber-500",
  },
  {
    title: "Drops",
    description: "Creer et gerer les ventes flash Chef's Table.",
    icon: UtensilsCrossed,
    href: "/admin/drops",
    color: "text-pink-500",
  },
  {
    title: "Notifications",
    description: "Piloter les campagnes et alertes ciblees.",
    icon: Bell,
    href: "/admin/notifications",
    color: "text-orange-500",
  },
  {
    title: "Audit et securite",
    description: "Surveiller les executions edge et les mutations sensibles.",
    icon: Shield,
    href: "/admin/audit",
    color: "text-amber-500",
  },
];

export default function AdminHome() {
  const navigate = useNavigate();
  const { toast } = useToast();
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
        .select("id, total_amount, status, created_at, restaurant_id")
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

  const { flags, toggleFlag, activateAllFlags, loading: loadingFlags } = useFeatureFlags();

  const statusColor = (status: string) => {
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
  };

  const handleActivateAll = async () => {
    await activateAllFlags();
    toast({ title: "Activation terminee", description: "Tous les outils et feature flags admin connus sont actifs." });
  };

  return (
    <div className="container py-8 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-bold">Administration</h1>
          <p className="text-sm text-muted-foreground">Tous les modules admin sont exposes depuis cet ecran.</p>
        </div>
        <Button onClick={handleActivateAll} className="gap-2" disabled={loadingFlags}>
          <Rocket className="h-4 w-4" />
          Activer tous les outils
        </Button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
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

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Settings className="h-5 w-5 text-primary" />
            <CardTitle>Outils admin</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {ADMIN_TOOLS.map((tool) => (
              <button
                key={tool.href}
                onClick={() => navigate(tool.href)}
                className="text-left rounded-xl border p-4 transition-colors hover:border-primary/50 hover:bg-muted/30"
              >
                <div className="flex items-start gap-3">
                  <tool.icon className={`h-5 w-5 mt-0.5 ${tool.color}`} />
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

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
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
                  <div key={order.id} className="flex items-center justify-between p-2 rounded-lg border text-sm">
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
                  <p className="text-sm text-muted-foreground text-center py-4">Aucune commande recente</p>
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
                  <div key={log.id} className="flex items-center justify-between p-2 rounded-lg border text-sm">
                    <div>
                      <p className="font-medium">{log.action} - <span className="text-muted-foreground">{log.entity_type}</span></p>
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
                  <p className="text-sm text-muted-foreground text-center py-4">Aucun log d'audit</p>
                ) : null}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <Sparkles className="h-5 w-5 text-primary" />
                  <CardTitle>Fonctionnalites exclusives</CardTitle>
                </div>
                <p className="text-sm text-muted-foreground mt-1">
                  Tous les feature flags connus peuvent etre pilotes ici.
                </p>
              </div>
              <Button variant="outline" onClick={handleActivateAll} disabled={loadingFlags}>
                Tout activer
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="divide-y">
              {flags.map((flag) => (
                <div key={flag.id} className="flex items-center justify-between py-3 gap-4">
                  <div className="space-y-0.5">
                    <p className="text-sm font-semibold">{flag.label}</p>
                    <p className="text-xs text-muted-foreground">{flag.description}</p>
                  </div>
                  <Switch checked={flag.isActive} onCheckedChange={() => toggleFlag(flag.id)} />
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
