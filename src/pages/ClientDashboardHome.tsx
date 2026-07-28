import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import {
  ArrowRight,
  Bell,
  CalendarDays,
  ChefHat,
  Clock3,
  Heart,
  MessageSquareText,
  RefreshCcw,
  Search,
  ShoppingBag,
  Sparkles,
  Star,
  Trophy,
  UtensilsCrossed,
  Zap,
  type LucideIcon,
} from "lucide-react";

import CustomerDashboardLayout from "@/components/CustomerDashboardLayout";
import DashboardIllustrationMedia from "@/components/dashboard/DashboardIllustrationMedia";
import { useCommercialDemoFrame } from "@/components/commercial/CommercialDemoFrameProvider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useNotificationCenter } from "@/hooks/useNotificationCenter";
import { getSupabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { getBusinessDateKey, parseBusinessDateTime } from "@/lib/businessTime";
import { getCommercialDemoClientTarget } from "@/lib/commercialDemoClientRoutes";
import { useFeatureFlagSnapshot } from "@/lib/featureFlags";
import { cn } from "@/lib/utils";
import { DASHBOARD_ILLUSTRATIONS } from "@/lib/dashboardIllustrations";

const supabase = getSupabase();

const TERMINAL_ORDER_STATUSES = new Set([
  "cancelled",
  "canceled",
  "delivered",
  "completed",
  "payment_failed",
  "refunded",
  "expired",
]);

const INACTIVE_RESERVATION_STATUSES = new Set([
  "cancelled",
  "canceled",
  "completed",
  "declined",
  "no_show",
  "rejected",
]);

type DashboardRestaurant = {
  id?: string | null;
  name?: string | null;
};

type DashboardReservation = {
  id: string;
  date: string;
  time: string | null;
  party_size: number | null;
  status: string | null;
  feature: string | null;
  restaurants: DashboardRestaurant | DashboardRestaurant[] | null;
};

type DashboardOrder = {
  id: string;
  order_number: string | null;
  created_at: string;
  status: string | null;
  payment_status: string | null;
  total_amount: number | null;
  restaurants: DashboardRestaurant | DashboardRestaurant[] | null;
};

type ClientDashboardOverviewData = {
  profile: {
    full_name?: string | null;
    loyalty_points?: number | null;
    current_tier?: string | null;
    avatar_url?: string | null;
  } | null;
  reservations: DashboardReservation[];
  orders: DashboardOrder[];
  favoritesCount: number;
  reviewsCount: number;
};

type QuickAction = {
  label: string;
  description: string;
  to: string;
  icon: LucideIcon;
  feature?: string;
  accent: string;
};

function getClientDashboardHomeTarget(target: string, isCommercialDemoClientFrame: boolean) {
  if (!isCommercialDemoClientFrame) return target;
  return getCommercialDemoClientTarget(target);
}

const QUICK_ACTIONS: QuickAction[] = [
  {
    label: "Trouver une table",
    description: "Restaurants et disponibilités",
    to: "/recherche",
    icon: Search,
    feature: "reservation",
    accent: "bg-orange-500/10 text-orange-600",
  },
  {
    label: "Zéro attente",
    description: "Réserver, choisir et payer",
    to: "/zero-attente",
    icon: Zap,
    feature: "zero-attente",
    accent: "bg-indigo-500/10 text-indigo-600",
  },
  {
    label: "Anti-gaspi",
    description: "Sauver de bons produits",
    to: "/anti-gaspi",
    icon: Heart,
    feature: "anti-gaspi",
    accent: "bg-emerald-500/10 text-emerald-600",
  },
  {
    label: "Ventes flash",
    description: "Offres à durée limitée",
    to: "/ventes-flash",
    icon: Sparkles,
    feature: "ventes-flash",
    accent: "bg-pink-500/10 text-pink-600",
  },
  {
    label: "Table du Chef",
    description: "Expériences exclusives",
    to: "/chefs-table",
    icon: ChefHat,
    feature: "chefs-table",
    accent: "bg-amber-500/10 text-amber-700",
  },
  {
    label: "Actualités",
    description: "Nouveautés de vos restaurants",
    to: "/actualites",
    icon: MessageSquareText,
    feature: "actualites-sociales",
    accent: "bg-sky-500/10 text-sky-600",
  },
];

function firstRestaurantName(value: DashboardRestaurant | DashboardRestaurant[] | null | undefined) {
  if (!value) return "Restaurant";
  return Array.isArray(value) ? value[0]?.name || "Restaurant" : value.name || "Restaurant";
}

function reservationTimestamp(reservation: DashboardReservation) {
  const value = parseBusinessDateTime(reservation.date, reservation.time || "00:00:00")?.getTime();
  return Number.isFinite(value) ? value! : 0;
}

function isActiveOrder(order: DashboardOrder) {
  const status = String(order.status || "").toLowerCase();
  const paymentStatus = String(order.payment_status || "").toLowerCase();
  if (["failed", "expired", "refunded"].includes(paymentStatus)) return false;
  return !TERMINAL_ORDER_STATUSES.has(status);
}

function formatReservationDate(reservation: DashboardReservation) {
  const date = parseBusinessDateTime(reservation.date, reservation.time || "00:00:00");
  if (!date) return reservation.date;
  return date.toLocaleString("fr-CH", {
    timeZone: "Europe/Zurich",
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function orderStatusLabel(status: string | null) {
  const normalized = String(status || "").toLowerCase();
  const labels: Record<string, string> = {
    pending: "En attente",
    pending_payment: "Paiement à confirmer",
    awaiting_payment: "Paiement à confirmer",
    restaurant_received: "Reçue par le restaurant",
    restaurant_accepted: "Acceptée par le restaurant",
    confirmed: "Confirmée",
    preparing: "En préparation",
    ready: "Prête",
    ready_for_pickup: "Prête",
    assigned: "Livreur assigné",
    picked_up: "En livraison",
    delivering: "En livraison",
    delivered: "Livrée",
    out_for_delivery: "En livraison",
  };
  return labels[normalized] || "En cours";
}

function MetricCard({
  icon: Icon,
  label,
  value,
  to,
  accent,
}: {
  icon: LucideIcon;
  label: string;
  value: string | number;
  to: string;
  accent: string;
}) {
  return (
    <Link
      to={to}
      className="group min-w-0 rounded-2xl border bg-card p-4 shadow-sm transition hover:-translate-y-0.5 hover:border-primary/35 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
    >
      <div className={cn("mb-3 flex h-9 w-9 items-center justify-center rounded-xl", accent)}>
        <Icon className="h-4 w-4" aria-hidden="true" />
      </div>
      <p className="truncate text-2xl font-bold">{value}</p>
      <p className="mt-1 text-xs text-muted-foreground">{label}</p>
    </Link>
  );
}

function LiveClientDashboardHome() {
  const { user } = useAuth();
  const commercialDemoFrame = useCommercialDemoFrame();
  const isCommercialDemoClientFrame = commercialDemoFrame?.surface === "client";
  const {
    activeFeatures: globalActiveFeatures,
    loading: globalFeaturesLoading,
  } = useFeatureFlagSnapshot({ enabled: !isCommercialDemoClientFrame });
  const activeFeatures = isCommercialDemoClientFrame && commercialDemoFrame
    ? new Set(commercialDemoFrame.snapshot.active_features)
    : globalActiveFeatures;
  const featuresLoading = isCommercialDemoClientFrame ? false : globalFeaturesLoading;
  const {
    unreadCount,
    isLoading: notificationsLoading,
  } = useNotificationCenter(50, { realtime: true });

  const reservationEnabled = activeFeatures.has("reservation");
  const ordersEnabled = activeFeatures.has("commandes");
  const today = useMemo(() => getBusinessDateKey(), []);

  const overviewQuery = useQuery<ClientDashboardOverviewData>({
    queryKey: [
      "client-dashboard-overview",
      "production",
      user?.id,
      reservationEnabled,
      ordersEnabled,
    ],
    queryFn: async () => {
      const profileRequest = supabase
        .from("profiles")
        .select("full_name, loyalty_points, current_tier, avatar_url")
        .eq("user_id", user!.id)
        .maybeSingle();

      const reservationsRequest = reservationEnabled
        ? supabase
          .from("reservations")
          .select("id, date, time, party_size, status, feature, restaurants(id, name)")
          .eq("user_id", user!.id)
          .gte("date", today)
          .order("date", { ascending: true })
          .order("time", { ascending: true })
          .limit(20)
        : Promise.resolve({ data: [], error: null });

      const ordersRequest = ordersEnabled
        ? supabase
          .from("orders")
          .select("id, order_number, created_at, status, payment_status, total_amount, restaurants(id, name)")
          .eq("user_id", user!.id)
          .order("created_at", { ascending: false })
          .limit(25)
        : Promise.resolve({ data: [], error: null });

      const favoritesRequest = supabase
        .from("favorites")
        .select("id", { count: "exact", head: true })
        .eq("user_id", user!.id);

      const reviewsRequest = supabase
        .from("reviews")
        .select("id", { count: "exact", head: true })
        .eq("user_id", user!.id);

      const [profile, reservations, orders, favorites, reviews] = await Promise.all([
        profileRequest,
        reservationsRequest,
        ordersRequest,
        favoritesRequest,
        reviewsRequest,
      ]);

      const error = profile.error || reservations.error || orders.error || favorites.error || reviews.error;
      if (error) throw error;

      return {
        profile: profile.data,
        reservations: (reservations.data || []) as unknown as DashboardReservation[],
        orders: (orders.data || []) as unknown as DashboardOrder[],
        favoritesCount: favorites.count || 0,
        reviewsCount: reviews.count || 0,
      };
    },
    enabled: Boolean(!isCommercialDemoClientFrame && user?.id && !featuresLoading),
    staleTime: 30_000,
  });

  const demoOverviewData = useMemo<ClientDashboardOverviewData | undefined>(() => {
    if (!isCommercialDemoClientFrame || !commercialDemoFrame) return undefined;

    const demoOrder = commercialDemoFrame.snapshot.order;
    return {
      profile: {
        full_name: demoOrder?.customer_name || "Sophie Martin",
        loyalty_points: 0,
        current_tier: "demo",
        avatar_url: null,
      },
      reservations: commercialDemoFrame.snapshot.reservations.map((reservation) => ({
        id: reservation.id,
        date: reservation.reservation_date,
        time: reservation.reservation_time,
        party_size: reservation.party_size,
        status: reservation.status,
        feature: "classique",
        restaurants: {
          id: commercialDemoFrame.snapshot.demo_restaurant.id,
          name: commercialDemoFrame.snapshot.demo_restaurant.name,
        },
      })),
      orders: demoOrder ? [{
        id: demoOrder.id,
        order_number: demoOrder.order_number,
        created_at: demoOrder.created_at
          || demoOrder.updated_at
          || commercialDemoFrame.snapshot.session.created_at
          || "1970-01-01T00:00:00.000Z",
        status: demoOrder.status,
        payment_status: demoOrder.payment_status,
        total_amount: demoOrder.total_amount_cents / 100,
        restaurants: {
          id: commercialDemoFrame.snapshot.demo_restaurant.id,
          name: commercialDemoFrame.snapshot.demo_restaurant.name,
        },
      }] : [],
      favoritesCount: 0,
      reviewsCount: 0,
    };
  }, [
    commercialDemoFrame,
    isCommercialDemoClientFrame,
  ]);

  const overviewData = isCommercialDemoClientFrame ? demoOverviewData : overviewQuery.data;
  const clientTarget = (target: string) => getClientDashboardHomeTarget(target, isCommercialDemoClientFrame);

  const upcomingReservations = useMemo(() => {
    const now = Date.now();
    return (overviewData?.reservations || [])
      .filter((reservation) => {
        const status = String(reservation.status || "").toLowerCase();
        return !INACTIVE_RESERVATION_STATUSES.has(status) && reservationTimestamp(reservation) >= now;
      })
      .sort((left, right) => reservationTimestamp(left) - reservationTimestamp(right));
  }, [overviewData?.reservations]);

  const activeOrders = useMemo(
    () => (overviewData?.orders || []).filter(isActiveOrder),
    [overviewData?.orders],
  );

  const visibleActions = QUICK_ACTIONS.filter(
    (action) => !action.feature || activeFeatures.has(action.feature),
  );
  const profile = overviewData?.profile;
  const firstName = String(profile?.full_name || user?.email?.split("@")[0] || "").trim().split(/\s+/)[0];
  const points = Number(profile?.loyalty_points || 0);
  const priorityOrder = activeOrders.find((order) => ["preparing", "ready", "assigned", "picked_up", "out_for_delivery"].includes(String(order.status || "").toLowerCase())) || activeOrders[0];
  const nextReservation = upcomingReservations[0];
  const heroIllustration = priorityOrder
    ? DASHBOARD_ILLUSTRATIONS.clientOrder
    : nextReservation
      ? DASHBOARD_ILLUSTRATIONS.clientReservation
      : DASHBOARD_ILLUSTRATIONS.clientDiscovery;
  const isLoading = isCommercialDemoClientFrame
    ? false
    : featuresLoading || overviewQuery.isLoading || notificationsLoading;
  const hasError = !isCommercialDemoClientFrame && Boolean(overviewQuery.error);

  return (
    <CustomerDashboardLayout>
      <div className="space-y-7">
        <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-primary">Mon espace TOK</p>
            <h1 className="mt-1 break-words font-display text-3xl font-bold sm:text-4xl">
              Bonjour{firstName ? ` ${firstName}` : ""}
            </h1>
            <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
              Vos prochaines actions, vos avantages et toute votre activité en un seul endroit.
            </p>
          </div>
          <Button asChild className="min-h-11 w-full gap-2 sm:w-auto">
            <Link to={clientTarget("/recherche")}>
              <Search className="h-4 w-4" />
              Trouver un restaurant
            </Link>
          </Button>
        </header>

        {hasError ? (
          <div role="alert" className="flex flex-col gap-3 rounded-2xl border border-destructive/30 bg-destructive/5 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="font-semibold text-destructive">Certaines informations n’ont pas pu être chargées.</p>
              <p className="text-sm text-muted-foreground">Vos données restent intactes. Vous pouvez relancer le chargement.</p>
            </div>
            <Button type="button" variant="outline" className="w-full gap-2 sm:w-auto" onClick={() => void overviewQuery.refetch()}>
              <RefreshCcw className="h-4 w-4" />
              Réessayer
            </Button>
          </div>
        ) : null}

        {isLoading ? (
          <div aria-label="Chargement de votre espace" className="space-y-4">
            <div className="h-36 animate-pulse rounded-3xl bg-muted" />
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              {[1, 2, 3, 4].map((item) => <div key={item} className="h-32 animate-pulse rounded-2xl bg-muted" />)}
            </div>
          </div>
        ) : (
          <>
            <section className="overflow-hidden rounded-3xl border border-primary/20 bg-gradient-to-br from-primary/15 via-background to-pink-500/10 p-5 shadow-sm sm:p-7">
              <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
                <div className="min-w-0">
                  {priorityOrder ? (
                    <>
                      <Badge className="mb-3">Commande en cours</Badge>
                      <h2 className="break-words font-display text-2xl font-bold">
                        {firstRestaurantName(priorityOrder.restaurants)}
                      </h2>
                      <p className="mt-2 text-sm text-muted-foreground">
                        {orderStatusLabel(priorityOrder.status)}
                        {priorityOrder.order_number ? ` · #${priorityOrder.order_number}` : ""}
                      </p>
                      <Button asChild variant="outline" className="mt-4 min-h-11 w-full bg-background/80 sm:w-auto">
                        <Link to={clientTarget(`/commande/${priorityOrder.id}`)}>
                          Suivre ma commande <ArrowRight className="ml-2 h-4 w-4" />
                        </Link>
                      </Button>
                    </>
                  ) : nextReservation ? (
                    <>
                      <Badge className="mb-3">Prochaine réservation</Badge>
                      <h2 className="break-words font-display text-2xl font-bold">
                        {firstRestaurantName(nextReservation.restaurants)}
                      </h2>
                      <p className="mt-2 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                        <Clock3 className="h-4 w-4" />
                        {formatReservationDate(nextReservation)}
                        {nextReservation.party_size ? ` · ${nextReservation.party_size} personne${nextReservation.party_size > 1 ? "s" : ""}` : ""}
                      </p>
                      <Button asChild variant="outline" className="mt-4 min-h-11 w-full bg-background/80 sm:w-auto">
                        <Link to={clientTarget(`/reservations?reservation=${nextReservation.id}`)}>
                          Voir les détails <ArrowRight className="ml-2 h-4 w-4" />
                        </Link>
                      </Button>
                    </>
                  ) : (
                    <>
                      <Badge variant="secondary" className="mb-3">Prêt pour votre prochaine sortie</Badge>
                      <h2 className="font-display text-2xl font-bold">Que souhaitez-vous découvrir aujourd’hui ?</h2>
                      <p className="mt-2 max-w-xl text-sm text-muted-foreground">
                        Réservez une table, préparez vos plats avec Zéro attente ou profitez d’une offre locale.
                      </p>
                      <Button asChild variant="outline" className="mt-4 min-h-11 w-full bg-background/80 sm:w-auto">
                        <Link to={clientTarget("/recherche")}>Explorer les restaurants <ArrowRight className="ml-2 h-4 w-4" /></Link>
                      </Button>
                    </>
                  )}
                </div>
                <DashboardIllustrationMedia
                  illustration={heroIllustration}
                  className="hidden h-36 w-36 rounded-[2rem] lg:block"
                  imageClassName="p-3 drop-shadow-[0_20px_26px_rgba(194,78,24,0.20)]"
                />
              </div>
            </section>

            <section aria-label="Résumé de votre activité" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              {reservationEnabled ? (
                <MetricCard icon={CalendarDays} label="Réservations à venir" value={upcomingReservations.length} to={clientTarget("/reservations")} accent="bg-orange-500/10 text-orange-600" />
              ) : null}
              {ordersEnabled ? (
                <MetricCard icon={ShoppingBag} label="Commandes en cours" value={activeOrders.length} to={clientTarget("/commandes")} accent="bg-indigo-500/10 text-indigo-600" />
              ) : null}
              <MetricCard icon={Trophy} label="Miamz disponibles" value={points.toLocaleString("fr-CH")} to={clientTarget("/profil?tab=fidelite")} accent="bg-pink-500/10 text-pink-600" />
              <MetricCard icon={Bell} label="Notifications non lues" value={unreadCount} to={clientTarget("/notifications")} accent="bg-sky-500/10 text-sky-600" />
            </section>

            <section className="space-y-3">
              <div>
                <h2 className="font-display text-2xl font-bold">Accès rapides</h2>
                <p className="text-sm text-muted-foreground">Seuls les services actuellement actifs sont affichés.</p>
              </div>
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
                {visibleActions.map((action) => (
                  <Link
                    key={action.to}
                    to={clientTarget(action.to)}
                    className="group min-w-0 rounded-2xl border bg-card p-4 transition hover:-translate-y-0.5 hover:border-primary/35 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary sm:p-5"
                  >
                    <div className={cn("mb-3 flex h-10 w-10 items-center justify-center rounded-xl", action.accent)}>
                      <action.icon className="h-5 w-5" aria-hidden="true" />
                    </div>
                    <p className="break-words text-sm font-bold sm:text-base">{action.label}</p>
                    <p className="mt-1 hidden text-xs text-muted-foreground sm:block">{action.description}</p>
                  </Link>
                ))}
              </div>
            </section>

            <section className="grid gap-3 sm:grid-cols-3">
              <Link to={clientTarget("/profil?tab=favoris")} className="flex min-w-0 items-center gap-3 rounded-2xl border bg-card p-4 transition hover:border-primary/35">
                <Heart className="h-5 w-5 shrink-0 text-rose-500" />
                <div className="min-w-0">
                  <p className="font-semibold">Mes favoris</p>
                  <p className="text-xs text-muted-foreground">{overviewData?.favoritesCount || 0} restaurant(s)</p>
                </div>
              </Link>
              <Link to={clientTarget("/mes-avis")} className="flex min-w-0 items-center gap-3 rounded-2xl border bg-card p-4 transition hover:border-primary/35">
                <Star className="h-5 w-5 shrink-0 text-amber-500" />
                <div className="min-w-0">
                  <p className="font-semibold">Mes avis</p>
                  <p className="text-xs text-muted-foreground">{overviewData?.reviewsCount || 0} avis publié(s)</p>
                </div>
              </Link>
              <Link to={clientTarget("/contact")} className="flex min-w-0 items-center gap-3 rounded-2xl border bg-card p-4 transition hover:border-primary/35">
                <MessageSquareText className="h-5 w-5 shrink-0 text-primary" />
                <div className="min-w-0">
                  <p className="font-semibold">Besoin d’aide ?</p>
                  <p className="text-xs text-muted-foreground">Contacter l’équipe TOK</p>
                </div>
              </Link>
            </section>
          </>
        )}
      </div>
    </CustomerDashboardLayout>
  );
}


export default function ClientDashboardHome() {
  return <LiveClientDashboardHome />;
}
