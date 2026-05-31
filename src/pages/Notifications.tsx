import { useEffect } from "react";
import { useAuth } from "@/lib/auth-context";
import { getSupabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import CustomerDashboardLayout from "@/components/CustomerDashboardLayout";
import { Bell, CheckCheck } from "lucide-react";

const supabase = getSupabase();

export default function Notifications() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const { data: notifications } = useQuery({
    queryKey: ["notifications", user?.id],
    queryFn: async () => {
      const { data } = await supabase.from("notifications" as any).select("*").eq("user_id", user!.id).order("created_at", { ascending: false }).limit(50);
      return data || [];
    },
    enabled: !!user,
  });

  const { data: notificationPrefs } = useQuery({
    queryKey: ["notification-preferences", user?.id],
    queryFn: async () => {
      const { data } = await supabase.from("notification_preferences" as any).select("*").eq("user_id", user!.id).maybeSingle();
      return data;
    },
    enabled: !!user,
  });

  const inAppEnabled = (notificationPrefs as any)?.channels?.in_app ?? true;
  const allowedCategories = (notificationPrefs as any)?.categories ?? { transactional: true, product: true, marketing: false, system: true };
  const visibleNotifications = (notifications || []).filter((n: any) => allowedCategories?.[n.category] !== false);
  const unreadCount = visibleNotifications.filter((n: any) => !n.read_at).length;

  useEffect(() => {
    if (!user) return;
    const channel = supabase.channel(`notifications:${user.id}`).on("postgres_changes", { event: "*", schema: "public", table: "notifications", filter: `user_id=eq.${user.id}` }, () => {
      queryClient.invalidateQueries({ queryKey: ["notifications", user.id] });
    }).subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user, queryClient]);

  const markAllRead = async () => {
    if (!user) return;
    await supabase.from("notifications" as any).update({ read_at: new Date().toISOString() }).eq("user_id", user.id).is("read_at", null);
    queryClient.invalidateQueries({ queryKey: ["notifications", user.id] });
  };

  const markRead = async (id: string) => {
    await supabase.from("notifications" as any).update({ read_at: new Date().toISOString() }).eq("id", id);
    if (user) queryClient.invalidateQueries({ queryKey: ["notifications", user.id] });
  };

  if (!user) return <main className="min-h-screen flex items-center justify-center text-muted-foreground">Connectez-vous pour voir vos notifications.</main>;

  return (
    <CustomerDashboardLayout>
      <div className="space-y-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center"><Bell className="h-5 w-5 text-primary" /></div>
            <div><h1 className="font-display text-2xl font-bold">Notifications</h1><p className="text-xs text-muted-foreground">Toutes vos alertes et mises à jour.</p></div>
          </div>
          <Button variant="outline" size="sm" className="gap-2 w-full sm:w-auto justify-center" onClick={markAllRead} disabled={!inAppEnabled || unreadCount === 0}><CheckCheck className="h-4 w-4" />Tout marquer comme lu</Button>
        </div>
        <div className="space-y-3">
          {!inAppEnabled ? (
            <div className="rounded-2xl border border-dashed p-8 text-center text-muted-foreground">Activez le canal In-app dans vos préférences.</div>
          ) : visibleNotifications.length === 0 ? (
            <div className="rounded-2xl border border-dashed p-8 text-center text-muted-foreground">Aucune notification.</div>
          ) : (
            visibleNotifications.map((n: any) => (
              <div key={n.id} className={`rounded-2xl border p-4 flex items-start justify-between gap-4 ${n.read_at ? "bg-card" : "bg-primary/5 border-primary/20"}`}>
                <div className="space-y-1">
                  <div className="flex items-center gap-2"><h3 className="font-semibold text-sm">{n.title}</h3>{!n.read_at && <Badge className="text-[10px]">Nouveau</Badge>}</div>
                  <p className="text-xs text-muted-foreground">{n.body}</p>
                  <p className="text-[10px] text-muted-foreground">{new Date(n.created_at).toLocaleString()}</p>
                </div>
                {!n.read_at && <Button variant="ghost" size="sm" onClick={() => markRead(n.id)}>Marquer lu</Button>}
              </div>
            ))
          )}
        </div>
      </div>
    </CustomerDashboardLayout>
  );
}