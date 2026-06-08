import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ComponentType } from "react";
import { getSupabase } from "@/integrations/supabase/client";
import DashboardLayout from "@/components/DashboardLayout";
import DashboardPageHero from "@/components/dashboard/DashboardPageHero";
import GoogleBusinessBookingCard from "@/components/dashboard/GoogleBusinessBookingCard";
import SignupApplicationStatusCard from "@/components/signup/SignupApplicationStatusCard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import OrderStatusBadge from "@/components/OrderStatusBadge";
import { AlertTriangle, ArrowRight, CalendarDays, CheckCircle2, FileText, LayoutDashboard, MoonStar, ShoppingCart, SunMedium, TrendingUp } from "lucide-react";
import { normalizeOrderStatus } from "@/lib/orderStatus";
import { useSignupApplication } from "@/hooks/useSignupApplication";
import { useToast } from "@/hooks/use-toast";
import { useDashboardRestaurant } from "./useDashboardRestaurant";
import { getServicePeriodFromMetadata, getServicePeriodLabel } from "@/lib/serviceSettings";
import { cn } from "@/lib/utils";

const supabase = getSupabase();

// pending_payment = order created but Stripe checkout not yet completed.
// These are not actionable for the restaurateur and must stay hidden until
// the webhook flips them to "confirmed". For orders, 'pending' is also
// pre-checkout and gets filtered. For reservations, 'pending' is the default
// state where the restaurateur still has to confirm: we must keep it visible.
const INVALID_ORDER_STATUS_FILTER = "(cancelled,refused,payment_failed,pending,pending_payment)";
const INVALID_RESERVATION_STATUS_FILTER = "(cancelled,no_show,pending_payment)";

type UpcomingReservationRow = {
  id: string;
  date: string;
  time: string;
  party_size: number;
  status: string;
  metadata: unknown;
};

type AdminCorrectionRequestRow = {
  id: string;
  restaurant_id: string;
  reason: string;
  status: string;
  requested_at: string;
};

type DashboardTone = "violet" | "orange" | "emerald" | "amber" | "sky";

const DASHBOARD_TONES: Record<DashboardTone, {
  card: string;
  icon: string;
  label: string;
  glow: string;
}> = {
  violet: {
    card: "tok-tone-violet",
    icon: "tok-kpi-icon",
    label: "tok-kpi-label",
    glow: "tok-tone-overlay",
  },
  orange: {
    card: "tok-tone-orange",
    icon: "tok-kpi-icon",
    label: "tok-kpi-label",
    glow: "tok-tone-overlay",
  },
  emerald: {
    card: "tok-tone-emerald",
    icon: "tok-kpi-icon",
    label: "tok-kpi-label",
    glow: "tok-tone-overlay",
  },
  amber: {
    card: "tok-tone-amber",
    icon: "tok-kpi-icon",
    label: "tok-kpi-label",
    glow: "tok-tone-overlay",
  },
  sky: {
    card: "tok-tone-sky",
    icon: "tok-kpi-icon",
    label: "tok-kpi-label",
    glow: "tok-tone-overlay",
  },
};

function DashboardStatCard({
  label,
  value,
  icon: Icon,
  tone,
}: {
  label: string;
  value: string;
  icon: ComponentType<{ className?: string }>;
  tone: DashboardTone;
}) {
  const toneClasses = DASHBOARD_TONES[tone];

  return (
    <div className={cn(
      "tok-dashboard-kpi relative overflow-hidden rounded-3xl p-5 transition-transform hover:-translate-y-0.5",
      toneClasses.card,
    )}>
      <div className={cn("pointer-events-none absolute inset-0 bg-gradient-to-br opacity-0 dark:opacity-100", toneClasses.glow)} />
      <div className="relative z-10 flex items-center justify-between gap-5">
        <div className="flex min-w-0 items-center gap-5">
          <div className={cn("flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl sm:h-20 sm:w-20", toneClasses.icon)}>
            <Icon className="h-8 w-8" />
          </div>
          <div className="min-w-0">
            <p className="text-lg font-semibold text-foreground dark:text-slate-100">{label}</p>
            <p className="tok-kpi-value mt-2 break-words text-4xl font-bold tracking-tight">{value}</p>
          </div>
        </div>
        <div className={cn("hidden h-14 w-14 shrink-0 items-center justify-center rounded-2xl sm:flex", toneClasses.icon)}>
          <ArrowRight className="h-6 w-6" />
        </div>
      </div>
    </div>
  );
}

function formatDashboardDateTime(value: string) {
  return new Intl.DateTimeFormat("fr-CH", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
}

export default function Dashboard() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { selectedId } = useDashboardRestaurant();
  const { data: signupApplication } = useSignupApplication("restaurateur");
  const today = new Date().toISOString().split("T")[0];
  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString();

  const { data: restaurant } = useQuery({
    queryKey: ["my-restaurant-detail", selectedId],
    queryFn: async () => {
      const { data } = await supabase.from("restaurants").select("*").eq("id", selectedId!).single();
      return data;
    },
    enabled: !!selectedId,
  });

  const { data: recentOrders } = useQuery({
    queryKey: ["dashboard-recent-orders", restaurant?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("orders")
        .select("*")
        .eq("restaurant_id", restaurant!.id)
        .not("status", "in", INVALID_ORDER_STATUS_FILTER)
        .order("created_at", { ascending: false })
        .limit(5);
      return data || [];
    },
    enabled: !!restaurant,
  });

  const { data: upcomingReservations = [] } = useQuery({
    queryKey: ["dashboard-upcoming-reservations", restaurant?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("reservations")
        .select("*")
        .eq("restaurant_id", restaurant!.id)
        .gte("date", today)
        .not("status", "in", INVALID_RESERVATION_STATUS_FILTER)
        .order("date")
        .limit(5);
      return data || [];
    },
    enabled: !!restaurant,
  });

  const { data: totalOrders = 0 } = useQuery({
    queryKey: ["dashboard-total-orders", restaurant?.id],
    queryFn: async () => {
      const { count } = await supabase
        .from("orders")
        .select("*", { count: "exact", head: true })
        .eq("restaurant_id", restaurant!.id)
        .not("status", "in", INVALID_ORDER_STATUS_FILTER);
      return count || 0;
    },
    enabled: !!restaurant,
  });

  const { data: totalUpcomingReservations = 0 } = useQuery({
    queryKey: ["dashboard-total-upcoming-reservations", restaurant?.id, today],
    queryFn: async () => {
      const { count } = await supabase
        .from("reservations")
        .select("*", { count: "exact", head: true })
        .eq("restaurant_id", restaurant!.id)
        .gte("date", today)
        .not("status", "in", INVALID_RESERVATION_STATUS_FILTER);
      return count || 0;
    },
    enabled: !!restaurant,
  });

  const { data: monthlyRevenue = 0 } = useQuery({
    queryKey: ["dashboard-monthly-revenue", restaurant?.id, monthStart],
    queryFn: async () => {
      const [ordersRes, reservationsRes] = await Promise.all([
        supabase
          .from("orders")
          .select("total_amount")
          .eq("restaurant_id", restaurant!.id)
          .gte("created_at", monthStart)
          .not("status", "in", INVALID_ORDER_STATUS_FILTER),
        supabase
          .from("reservations")
          .select("total_amount")
          .eq("restaurant_id", restaurant!.id)
          .eq("feature", "zero-attente")
          .gte("date", monthStart.slice(0, 10))
          .not("status", "in", "(cancelled,no_show)")
          .gt("total_amount", 0),
      ]);
      const orderRevenue = (ordersRes.data || []).reduce((sum, row) => sum + Number(row.total_amount), 0);
      const zaRevenue = (reservationsRes.data || []).reduce((sum, row) => sum + Number(row.total_amount), 0);
      return orderRevenue + zaRevenue;
    },
    enabled: !!restaurant,
  });

  const { data: adminCorrectionRequests = [] } = useQuery({
    queryKey: ["restaurant-admin-correction-requests", restaurant?.id],
    queryFn: async () => {
      const { data, error } = await (supabase.from as any)("restaurant_admin_correction_requests")
        .select("id, restaurant_id, reason, status, requested_at")
        .eq("restaurant_id", restaurant!.id)
        .eq("status", "open")
        .order("requested_at", { ascending: false })
        .limit(5);

      if (error) throw error;
      return (data || []) as AdminCorrectionRequestRow[];
    },
    enabled: !!restaurant?.id,
  });

  const markAdminCorrectionDone = useMutation({
    mutationFn: async (requestId: string) => {
      const { error } = await (supabase.rpc as any)("restaurant_mark_admin_correction_done", {
        p_request_id: requestId,
      });

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["restaurant-admin-correction-requests", restaurant?.id] });
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
      queryClient.invalidateQueries({ queryKey: ["navbar-notifications"] });
      toast({
        title: "Modification confirmée",
        description: "TOK est informé que la correction demandée a été effectuée.",
      });
    },
    onError: (error) => {
      toast({
        title: "Confirmation impossible",
        description: error instanceof Error ? error.message : "La modification n'a pas pu être confirmée.",
        variant: "destructive",
      });
    },
  });

  const typedUpcomingReservations = upcomingReservations as UpcomingReservationRow[];

  const todayServiceCounts = typedUpcomingReservations.reduce(
    (acc, reservation) => {
      if (reservation.date !== today) return acc;
      const period = getServicePeriodFromMetadata(reservation.metadata, reservation.time);
      acc[period] += 1;
      return acc;
    },
    { lunch: 0, dinner: 0 },
  );

  if (!restaurant) {
    return (
      <DashboardLayout>
        <div className="space-y-6">
          <SignupApplicationStatusCard
            application={signupApplication}
            title="Dossier de vérification restaurateur"
            emptyDescription="Aucun dossier restaurateur n'a encore été soumis."
          />
          <div className="space-y-4 py-12 text-center">
            <h2 className="font-display text-2xl font-bold">Aucun restaurant</h2>
            <p className="text-muted-foreground">Créez votre restaurant depuis l'onglet "Mon restaurant".</p>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <DashboardPageHero
          badge="Dashboard restaurateur"
          title={<>Bonjour, <span className="text-[#ff6a1a]">{restaurant.name}</span></>}
          description="Vue courte de l'activite du restaurant: commandes, réservations, service du jour et revenu du mois restent visibles sans chercher dans les onglets."
          icon={LayoutDashboard}
          tone="orange"
          visualLabel="Accueil"
          stats={[
            { label: "Commandes validees", value: totalOrders, icon: ShoppingCart },
            { label: "Reservations a venir", value: totalUpcomingReservations, icon: CalendarDays },
            { label: "Revenus du mois", value: `${monthlyRevenue.toFixed(2)} CHF`, icon: TrendingUp },
          ]}
        />

        <SignupApplicationStatusCard
          application={signupApplication}
          title="Dossier de vérification restaurateur"
          emptyDescription="Aucun dossier restaurateur n'a encore été soumis."
        />

        {adminCorrectionRequests.length > 0 ? (
          <Card className="tok-dashboard-section rounded-3xl border border-amber-200 bg-amber-50/80 text-amber-950 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-50">
            <CardHeader className="space-y-2">
              <CardTitle className="flex items-center gap-3 text-xl font-bold">
                <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-100 text-amber-700 dark:bg-amber-400/15 dark:text-amber-100">
                  <AlertTriangle className="h-6 w-6" />
                </span>
                Demande de correction TOK
              </CardTitle>
              <p className="text-sm text-amber-800 dark:text-amber-100/80">
                Une modification est demandée par l'équipe TOK pour garder votre fiche restaurant prête à être publiée.
              </p>
            </CardHeader>
            <CardContent className="space-y-3">
              {adminCorrectionRequests.map((request) => (
                <div key={request.id} className="rounded-2xl border border-amber-200 bg-background/80 p-4 text-sm shadow-sm dark:border-amber-400/20 dark:bg-[#07142b]/80">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div className="space-y-2">
                      <p className="font-semibold">Correction demandée le {formatDashboardDateTime(request.requested_at)}</p>
                      <p className="text-amber-900 dark:text-amber-50/90">{request.reason}</p>
                    </div>
                    <Button
                      onClick={() => markAdminCorrectionDone.mutate(request.id)}
                      disabled={markAdminCorrectionDone.isPending}
                      className="shrink-0 gap-2 bg-emerald-600 text-white hover:bg-emerald-700"
                    >
                      <CheckCircle2 className="h-4 w-4" />
                      Modification effectuée
                    </Button>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        ) : null}

        <GoogleBusinessBookingCard restaurantId={restaurant.id} />

        <div className="space-y-4">
          <DashboardStatCard
            label="Commandes validees"
            value={String(totalOrders)}
            icon={ShoppingCart}
            tone="violet"
          />
          <DashboardStatCard
            label="Reservations a venir"
            value={String(totalUpcomingReservations)}
            icon={CalendarDays}
            tone="orange"
          />
          <DashboardStatCard
            label="Revenus du mois"
            value={`${monthlyRevenue.toFixed(2)} CHF`}
            icon={TrendingUp}
            tone="emerald"
          />
          <DashboardStatCard
            label="Midi aujourd'hui"
            value={String(todayServiceCounts.lunch)}
            icon={SunMedium}
            tone="amber"
          />
          <DashboardStatCard
            label="Soir aujourd'hui"
            value={String(todayServiceCounts.dinner)}
            icon={MoonStar}
            tone="sky"
          />
        </div>

        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          <Card className="tok-dashboard-section rounded-3xl border border-border/70">
            <CardHeader className="flex flex-row items-center justify-between gap-3">
              <CardTitle className="flex items-center gap-3 text-xl font-bold">
                <span className="tok-kpi-icon tok-tone-sky flex h-12 w-12 items-center justify-center rounded-2xl">
                  <FileText className="h-6 w-6" />
                </span>
                Commandes récentes
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {recentOrders?.map((order) => (
                <div key={order.id} className="flex items-center justify-between gap-4 rounded-2xl border border-border/70 bg-background/70 px-4 py-3 text-sm dark:border-[#5f7aad]/22 dark:bg-[#07142b]/72 dark:text-slate-100">
                  <span>{new Date(order.created_at).toLocaleDateString("fr-FR")}</span>
                  <span className="font-bold">{Number(order.total_amount).toFixed(2)} CHF</span>
                  <OrderStatusBadge status={normalizeOrderStatus(order.status)} />
                </div>
              ))}
              {(!recentOrders || recentOrders.length === 0) ? <p className="text-sm text-muted-foreground">Aucune commande</p> : null}
            </CardContent>
          </Card>
          <Card className="tok-dashboard-section rounded-3xl border border-border/70">
            <CardHeader>
              <CardTitle className="flex items-center gap-3 text-xl font-bold">
                <span className="tok-kpi-icon tok-tone-orange flex h-12 w-12 items-center justify-center rounded-2xl">
                  <CalendarDays className="h-6 w-6" />
                </span>
                Reservations a venir
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {typedUpcomingReservations.map((reservation) => {
                const period = getServicePeriodFromMetadata(reservation.metadata, reservation.time);
                return (
                  <div key={reservation.id} className="flex items-center justify-between gap-3 rounded-2xl border border-border/70 bg-background/70 px-4 py-3 text-sm dark:border-[#5f7aad]/22 dark:bg-[#07142b]/72 dark:text-slate-100">
                    <div className="flex items-center gap-2">
                      <span>{new Date(reservation.date).toLocaleDateString("fr-FR")} a {reservation.time}</span>
                      <Badge variant="outline" className="text-[10px]">{getServicePeriodLabel(period)}</Badge>
                    </div>
                    <span>{reservation.party_size} pers.</span>
                    <OrderStatusBadge status={reservation.status} />
                  </div>
                );
              })}
              {(!upcomingReservations || upcomingReservations.length === 0) ? <p className="text-sm text-muted-foreground">Aucune réservation</p> : null}
            </CardContent>
          </Card>
        </div>
      </div>
    </DashboardLayout>
  );
}
