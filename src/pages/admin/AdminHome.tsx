import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Users, UtensilsCrossed, ShoppingCart, CalendarDays, Sparkles, Bell, DollarSign, TrendingDown, FileText, Shield, Layers, Crown } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { useNavigate } from "react-router-dom";
import { useFeatureFlags } from "@/lib/featureFlags";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";

export default function AdminHome() {
  const navigate = useNavigate();
  const { data: stats } = useQuery({
    queryKey: ["admin-stats"],
    queryFn: async () => {
      const [restaurants, orders, reservations] = await Promise.all([
        supabase.from("restaurants").select("id", { count: "exact", head: true }),
        supabase.from("orders").select("id", { count: "exact", head: true }),
        supabase.from("reservations").select("id", { count: "exact", head: true }),
      ]);
      return { restaurants: restaurants.count || 0, orders: orders.count || 0, reservations: reservations.count || 0 };
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
      const validOrders = orders.filter(o => o.status !== "cancelled");
      const cancelledOrders = orders.filter(o => o.status === "cancelled");
      const gmv = validOrders.reduce((sum, o) => sum + (o.total_amount || 0), 0);
      const avgTicket = validOrders.length > 0 ? gmv / validOrders.length : 0;
      const cancelRate = orders.length > 0 ? (cancelledOrders.length / orders.length) * 100 : 0;
      return { gmv, cancelRate: Math.round(cancelRate * 10) / 10, avgTicket: Math.round(avgTicket * 100) / 100 };
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
      const { data } = await supabase
        .from("audit_log" as any)
        .select("id, action, entity_type, entity_id, created_at")
        .order("created_at", { ascending: false })
        .limit(15);
      return (data as any[]) || [];
    },
  });

  const { flags, toggleFlag } = useFeatureFlags();

  const statusColor = (status: string) => {
    switch (status) {
      case "pending": return "bg-amber-100 text-amber-800";
      case "confirmed": return "bg-blue-100 text-blue-800";
      case "delivered": return "bg-emerald-100 text-emerald-800";
      case "cancelled": return "bg-red-100 text-red-800";
      default: return "bg-secondary text-secondary-foreground";
    }
  };

  return (
    <div className="container py-8 space-y-6">
      <h1 className="font-display text-3xl font-bold">Administration</h1>

      {/* KPI Cards */}
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
            <CardTitle className="text-xs font-medium text-muted-foreground">Réservations</CardTitle>
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

      {/* Main grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Orders */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2"><ShoppingCart className="h-5 w-5 text-primary" /><CardTitle>Commandes récentes</CardTitle></div>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-64">
              <div className="space-y-2">
                {recentOrders?.map((order: any) => (
                  <div key={order.id} className="flex items-center justify-between p-2 rounded-lg border text-sm">
                    <div>
                      <p className="font-medium">{order.total_amount?.toFixed(2)} CHF</p>
                      <p className="text-xs text-muted-foreground">{new Date(order.created_at).toLocaleDateString("fr-CH", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}</p>
                    </div>
                    <Badge variant="secondary" className={statusColor(order.status)}>{order.status}</Badge>
                  </div>
                ))}
                {(!recentOrders || recentOrders.length === 0) && <p className="text-sm text-muted-foreground text-center py-4">Aucune commande récente</p>}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>

        {/* Audit Logs */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2"><Shield className="h-5 w-5 text-amber-500" /><CardTitle>Journal d'audit</CardTitle></div>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-64">
              <div className="space-y-2">
                {auditLogs?.map((log: any) => (
                  <div key={log.id} className="flex items-center justify-between p-2 rounded-lg border text-sm">
                    <div>
                      <p className="font-medium">{log.action} — <span className="text-muted-foreground">{log.entity_type}</span></p>
                      <p className="text-xs text-muted-foreground">{new Date(log.created_at).toLocaleDateString("fr-CH", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}</p>
                    </div>
                    <Badge variant="outline" className="text-xs">{log.entity_type}</Badge>
                  </div>
                ))}
                {(!auditLogs || auditLogs.length === 0) && <p className="text-sm text-muted-foreground text-center py-4">Aucun log d'audit</p>}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>

        {/* Quick Links */}
        <Card className="cursor-pointer hover:border-primary/50 transition-colors" onClick={() => navigate("/admin/catalog")}>
          <CardHeader>
            <div className="flex items-center gap-2"><Layers className="h-5 w-5 text-indigo-500" /><CardTitle>Catalogue Central (Cuisines/Collections)</CardTitle></div>
          </CardHeader>
          <CardContent><p className="text-sm text-muted-foreground">Gérez l'algorithme de découverte globale.</p></CardContent>
        </Card>
        <Card className="cursor-pointer hover:border-primary/50 transition-colors" onClick={() => navigate("/admin/loyalty")}>
          <CardHeader>
            <div className="flex items-center gap-2"><Crown className="h-5 w-5 text-amber-500" /><CardTitle>Fidélité & Abonnement (Miamz+)</CardTitle></div>
          </CardHeader>
          <CardContent><p className="text-sm text-muted-foreground">Configurez l'abonnement livraison 0€.</p></CardContent>
        </Card>
        <Card className="cursor-pointer hover:border-primary/50 transition-colors" onClick={() => navigate("/admin/drops")}>
          <CardHeader>
            <div className="flex items-center gap-2"><UtensilsCrossed className="h-5 w-5 text-pink-500" /><CardTitle>Gérer les Drops</CardTitle></div>
          </CardHeader>
          <CardContent><p className="text-sm text-muted-foreground">Créez et gérez les ventes flash "Chef's Table".</p></CardContent>
        </Card>
        <Card className="cursor-pointer hover:border-primary/50 transition-colors" onClick={() => navigate("/admin/notifications")}>
          <CardHeader>
            <div className="flex items-center gap-2"><Bell className="h-5 w-5 text-amber-500" /><CardTitle>Campagnes Notifications</CardTitle></div>
          </CardHeader>
          <CardContent><p className="text-sm text-muted-foreground">Créez des alertes et campagnes ciblées.</p></CardContent>
        </Card>

        {/* Feature Flags */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <div className="flex items-center gap-2"><Sparkles className="h-5 w-5 text-primary" /><CardTitle>Fonctionnalités exclusives</CardTitle></div>
            <p className="text-sm text-muted-foreground">Activez ou désactivez les fonctionnalités visibles pour les utilisateurs.</p>
          </CardHeader>
          <CardContent>
            <div className="divide-y">
              {flags.map((flag) => (
                <div key={flag.id} className="flex items-center justify-between py-3">
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
