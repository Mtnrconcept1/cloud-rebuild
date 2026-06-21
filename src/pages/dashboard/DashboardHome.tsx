import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type ComponentType } from "react";
import { Link } from "react-router-dom";
import { getSupabase } from "@/integrations/supabase/client";
import DashboardLayout from "@/components/DashboardLayout";
import DashboardPageHero from "@/components/dashboard/DashboardPageHero";
import GoogleBusinessBookingCard from "@/components/dashboard/GoogleBusinessBookingCard";
import SignupApplicationStatusCard, { type SignupApplicationCorrectionPayload } from "@/components/signup/SignupApplicationStatusCard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import OrderStatusBadge from "@/components/OrderStatusBadge";
import { AlertTriangle, ArrowRight, BellRing, CalendarDays, CheckCircle2, FileText, LayoutDashboard, Megaphone, MoonStar, Rocket, ShoppingCart, SunMedium, TrendingUp } from "lucide-react";
import { normalizeOrderStatus } from "@/lib/orderStatus";
import { useSignupApplication } from "@/hooks/useSignupApplication";
import { useToast } from "@/hooks/use-toast";
import { useDashboardRestaurant } from "./useDashboardRestaurant";
import { getServicePeriodFromMetadata, getServicePeriodLabel } from "@/lib/serviceSettings";
import { cn } from "@/lib/utils";
import { buildCheckoutReturnUrl } from "@/lib/checkoutReturnUrl";
import { redirectToTrustedCheckoutUrl } from "@/lib/securityUrls";
import { invokeSupabaseFunction } from "@/lib/session";
import {
  getSignupRestaurateurOnboardingSelection,
  uploadVerificationDocument,
  type SignupDocumentType,
  type UploadedSignupDocument,
} from "@/lib/signup";

const supabase = getSupabase();

// pending_payment = order created but Stripe checkout not yet completed.
// These are not actionable for the restaurateur and must stay hidden until
// the webhook flips them to "confirmed". For orders, 'pending' is also
// pre-checkout and gets filtered. For reservations, 'pending' is the default
// state where the restaurateur still has to confirm: we must keep it visible.
const INVALID_ORDER_STATUS_FILTER = "(cancelled,refused,payment_failed,pending,pending_payment)";
const INVALID_RESERVATION_STATUS_FILTER = "(cancelled,no_show,pending_payment)";
const UPCOMING_ORDER_STATUSES = ["confirmed", "accepted", "preparing", "ready", "delivering"];

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

function formatChf(value: number) {
  return new Intl.NumberFormat("fr-CH", {
    style: "currency",
    currency: "CHF",
    maximumFractionDigits: 2,
  }).format(Math.max(0, value));
}

function ActualitesBoostBanner() {
  return (
    <section
      aria-label="Mettre votre restaurant en avant"
      className="relative isolate overflow-hidden rounded-[1.35rem] bg-[#ff4b00] bg-[image:url('/fondbanniere.png')] bg-cover bg-center shadow-xl shadow-orange-500/20 max-sm:h-[33rem] max-sm:rounded-[1.15rem] max-sm:bg-[image:url('/fondbanniere2.png')]"
    >
      <div className="relative z-10 grid min-h-[22rem] grid-cols-[minmax(0,1.1fr)_minmax(15rem,0.86fr)] gap-4 px-5 pb-5 pt-4 sm:min-h-[20rem] sm:px-6 sm:py-6 md:grid-cols-[minmax(18rem,1.1fr)_minmax(16rem,0.82fr)] md:items-center lg:min-h-[21rem] max-sm:block max-sm:h-full max-sm:min-h-0 max-sm:p-0">
        <div className="relative min-h-[19rem] sm:min-h-[20rem] max-sm:absolute max-sm:inset-0 max-sm:min-h-0">
          <img
            src="/chef3.png"
            alt="Ton resto mis en avant à partir de CHF 1.-"
            loading="lazy"
            className="absolute left-[-2.8rem] top-0 ml-[9px] mt-[-35px] h-[28rem] w-[34rem] max-w-none object-contain object-top pl-[39px] drop-shadow-2xl [mask-image:radial-gradient(ellipse_at_45%_42%,black_64%,transparent_88%)] sm:left-[-3.4rem] sm:top-[-0.25rem] sm:h-[29rem] sm:w-[36rem] md:left-[-3.75rem] md:h-[30rem] md:w-[36rem] lg:left-[-3.25rem] lg:h-[31rem] lg:w-[37rem] max-sm:left-[-4.55rem] max-sm:top-[-1.05rem] max-sm:ml-0 max-sm:mt-0 max-sm:h-auto max-sm:w-[29.5rem] max-sm:object-contain max-sm:pl-0"
          />
        </div>

        <div className="flex min-w-0 flex-col justify-center gap-4 text-white md:pl-4 lg:pl-6 max-sm:absolute max-sm:inset-x-4 max-sm:bottom-4 max-sm:z-20 max-sm:gap-3">
          <div className="space-y-3 max-sm:mb-2 max-sm:ml-[12.5rem] max-sm:grid max-sm:grid-cols-1 max-sm:gap-2 max-sm:space-y-0">
            {[
              { icon: TrendingUp, title: "Plus de visibilité", body: "Soyez vu par des milliers de gourmands" },
              { icon: BellRing, title: "Plus de clients", body: "Attirez de nouveaux clients chaque jour" },
              { icon: Rocket, title: "Résultats rapides", body: "Des résultats dès les premières heures" },
            ].map(({ icon: Icon, title, body }) => (
              <div key={title} className="flex items-start gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white text-orange-600 shadow-lg shadow-orange-900/15 max-sm:h-8 max-sm:w-8">
                  <Icon className="h-5 w-5 max-sm:h-4 max-sm:w-4" aria-hidden="true" />
                </span>
                <span>
                  <strong className="block text-lg font-black leading-tight max-sm:text-[12px]">{title}</strong>
                  <span className="block text-sm font-medium leading-snug text-white/90 max-sm:text-[11px]">{body}</span>
                </span>
              </div>
            ))}
          </div>

          <Button
            asChild
            className="mt-1 h-12 rounded-2xl bg-white px-5 text-base font-black text-orange-600 shadow-xl shadow-orange-900/20 transition hover:bg-orange-50 hover:text-orange-700 max-sm:h-11 max-sm:w-full max-sm:text-sm"
          >
            <Link to="/dashboard/actualites">Mettre mon restaurant en avant</Link>
          </Button>
        </div>
      </div>
    </section>
  );
}

export default function Dashboard() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { selectedId, dashboardAccessLocked } = useDashboardRestaurant();
  const { data: signupApplication } = useSignupApplication("restaurateur");
  const [onboardingCheckoutLoading, setOnboardingCheckoutLoading] = useState(false);
  const today = new Date().toISOString().split("T")[0];
  const todayStartDate = new Date();
  todayStartDate.setHours(0, 0, 0, 0);
  const tomorrowStartDate = new Date(todayStartDate);
  tomorrowStartDate.setDate(tomorrowStartDate.getDate() + 1);
  const todayStart = todayStartDate.toISOString();
  const tomorrowStart = tomorrowStartDate.toISOString();
  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString();
  const { data: restaurant } = useQuery({
    queryKey: ["my-restaurant-detail", selectedId],
    queryFn: async () => {
      const { data } = await supabase.from("restaurants").select("*").eq("id", selectedId!).single();
      return data;
    },
    enabled: !!selectedId,
  });

  const operationalQueriesEnabled = Boolean(restaurant?.id && !dashboardAccessLocked);

  const { data: upcomingOrders = [] } = useQuery({
    queryKey: ["dashboard-upcoming-orders", restaurant?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("orders")
        .select("*")
        .eq("restaurant_id", restaurant!.id)
        .in("status", UPCOMING_ORDER_STATUSES)
        .order("created_at", { ascending: false })
        .limit(5);
      return data || [];
    },
    enabled: operationalQueriesEnabled,
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
    enabled: operationalQueriesEnabled,
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
    enabled: operationalQueriesEnabled,
  });

  const { data: totalUpcomingOrders = 0 } = useQuery({
    queryKey: ["dashboard-total-upcoming-orders", restaurant?.id],
    queryFn: async () => {
      const { count } = await supabase
        .from("orders")
        .select("*", { count: "exact", head: true })
        .eq("restaurant_id", restaurant!.id)
        .in("status", UPCOMING_ORDER_STATUSES);
      return count || 0;
    },
    enabled: operationalQueriesEnabled,
  });

  const { data: todayRevenue = 0 } = useQuery({
    queryKey: ["dashboard-today-revenue", restaurant?.id, today],
    queryFn: async () => {
      const [ordersRes, reservationsRes] = await Promise.all([
        supabase
          .from("orders")
          .select("total_amount")
          .eq("restaurant_id", restaurant!.id)
          .gte("created_at", todayStart)
          .lt("created_at", tomorrowStart)
          .not("status", "in", INVALID_ORDER_STATUS_FILTER),
        supabase
          .from("reservations")
          .select("total_amount")
          .eq("restaurant_id", restaurant!.id)
          .eq("feature", "zero-attente")
          .eq("date", today)
          .not("status", "in", "(cancelled,no_show)")
          .gt("total_amount", 0),
      ]);
      const orderRevenue = (ordersRes.data || []).reduce((sum, row) => sum + Number(row.total_amount || 0), 0);
      const reservationRevenue = (reservationsRes.data || []).reduce((sum, row) => sum + Number(row.total_amount || 0), 0);
      return orderRevenue + reservationRevenue;
    },
    enabled: operationalQueriesEnabled,
  });

  const { data: activeCampaignsCount = 0 } = useQuery({
    queryKey: ["dashboard-active-campaigns-count", restaurant?.id],
    queryFn: async () => {
      const { count } = await supabase
        .from("ad_campaigns")
        .select("*", { count: "exact", head: true })
        .eq("restaurant_id", restaurant!.id)
        .eq("status", "active");
      return count || 0;
    },
    enabled: operationalQueriesEnabled,
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
    enabled: operationalQueriesEnabled,
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
    enabled: operationalQueriesEnabled,
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

  const startRestaurantOnboardingPayment = async () => {
    const onboardingSelection = getSignupRestaurateurOnboardingSelection(signupApplication);
    const signupRestaurantId = typeof signupApplication?.metadata?.restaurant_id === "string"
      ? signupApplication.metadata.restaurant_id
      : "";
    const restaurantId = selectedId || signupRestaurantId;

    if (!signupApplication?.id || !restaurantId || !onboardingSelection) {
      toast({
        title: "Paiement indisponible",
        description: "Le dossier restaurateur ne contient pas encore tous les choix requis.",
        variant: "destructive",
      });
      return;
    }

    setOnboardingCheckoutLoading(true);
    try {
      const { data, error } = await invokeSupabaseFunction<{ url?: string; session_id?: string }>("create-checkout", {
        body: {
          checkout_kind: "restaurant-onboarding",
          items: [],
          payment_method: "card",
          return_url: buildCheckoutReturnUrl("/dashboard"),
          order_metadata: {
            checkout_kind: "restaurant-onboarding",
            signup_application_id: signupApplication.id,
            restaurant_id: restaurantId,
            plan_id: onboardingSelection.subscriptionPlanId,
            billing_period: onboardingSelection.subscriptionBillingPeriod,
          },
        },
      });

      if (error || !data?.url) {
        throw new Error((error as Error | null)?.message || "Impossible de créer la session de paiement.");
      }

      redirectToTrustedCheckoutUrl(data.url);
    } catch (error) {
      toast({
        title: "Paiement impossible",
        description: error instanceof Error ? error.message : "Veuillez réessayer dans quelques instants.",
        variant: "destructive",
      });
      setOnboardingCheckoutLoading(false);
    }
  };

  const resubmitSignupApplication = useMutation({
    mutationFn: async (payload: SignupApplicationCorrectionPayload) => {
      if (!signupApplication?.id || signupApplication.requested_role !== "restaurateur") {
        throw new Error("Aucun dossier restaurateur à corriger.");
      }

      const uploadedDocuments: UploadedSignupDocument[] = [];
      const documentEntries = Object.entries(payload.documentInputs) as Array<[SignupDocumentType, File | null | undefined]>;
      for (const [documentType, file] of documentEntries) {
        if (!file) continue;
        uploadedDocuments.push(await uploadVerificationDocument({
          userId: signupApplication.user_id,
          role: "restaurateur",
          documentType,
          file,
        }));
      }

      const existingMetadata = signupApplication.metadata && typeof signupApplication.metadata === "object"
        ? signupApplication.metadata
        : {};

      const { error } = await (supabase.rpc as any)("sync_signup_application", {
        p_requested_role: "restaurateur",
        p_full_name: payload.fullName,
        p_phone: payload.phone,
        p_city: payload.city,
        p_address: payload.address,
        p_legal_name: payload.legalName,
        p_business_name: payload.businessName,
        p_business_registration_number: payload.businessRegistrationNumber,
        p_tax_id: payload.taxId,
        p_restaurant_name: payload.restaurantName,
        p_restaurant_description: payload.restaurantDescription,
        p_vehicle_type: null,
        p_license_plate: null,
        p_iban: payload.iban,
        p_metadata: {
          ...existingMetadata,
          correction_source: "dashboard",
          correction_resubmitted_at: new Date().toISOString(),
        },
        p_documents: uploadedDocuments,
      });

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["signup-application"] });
      queryClient.invalidateQueries({ queryKey: ["signup-application", signupApplication?.user_id, "restaurateur"] });
      toast({
        title: "Dossier renvoyé",
        description: "Vos corrections ont été transmises à l'admin TOK pour une nouvelle validation.",
      });
    },
    onError: (error) => {
      toast({
        title: "Envoi impossible",
        description: error instanceof Error ? error.message : "Le dossier n'a pas pu être renvoyé.",
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
            onStartRestaurantOnboardingPayment={startRestaurantOnboardingPayment}
            onboardingPaymentLoading={onboardingCheckoutLoading}
            onResubmitApplication={resubmitSignupApplication.mutateAsync}
            resubmittingApplication={resubmitSignupApplication.isPending}
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
            { label: "Commandes à venir", value: totalUpcomingOrders, icon: ShoppingCart },
            { label: "Réservations à venir", value: totalUpcomingReservations, icon: CalendarDays },
            { label: "CA du jour", value: formatChf(todayRevenue), icon: TrendingUp },
          ]}
        />

        <SignupApplicationStatusCard
          application={signupApplication}
          onStartRestaurantOnboardingPayment={startRestaurantOnboardingPayment}
          onboardingPaymentLoading={onboardingCheckoutLoading}
          onResubmitApplication={resubmitSignupApplication.mutateAsync}
          resubmittingApplication={resubmitSignupApplication.isPending}
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

        <ActualitesBoostBanner />

        <div className="space-y-4">
          <DashboardStatCard
            label="Commandes à venir"
            value={String(totalUpcomingOrders)}
            icon={ShoppingCart}
            tone="violet"
          />
          <DashboardStatCard
            label="Réservations à venir"
            value={String(totalUpcomingReservations)}
            icon={CalendarDays}
            tone="orange"
          />
          <DashboardStatCard
            label="Chiffre d'affaires du jour"
            value={formatChf(todayRevenue)}
            icon={TrendingUp}
            tone="emerald"
          />
          <DashboardStatCard
            label="Campagnes pub actives"
            value={String(activeCampaignsCount)}
            icon={Megaphone}
            tone="amber"
          />
          <DashboardStatCard
            label="Midi aujourd'hui"
            value={String(todayServiceCounts.lunch)}
            icon={SunMedium}
            tone="sky"
          />
          <DashboardStatCard
            label="Soir aujourd'hui"
            value={String(todayServiceCounts.dinner)}
            icon={MoonStar}
            tone="violet"
          />
          <DashboardStatCard
            label="Revenus du mois"
            value={formatChf(monthlyRevenue)}
            icon={TrendingUp}
            tone="emerald"
          />
        </div>

        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          <Card className="tok-dashboard-section rounded-3xl border border-border/70">
            <CardHeader className="flex flex-row items-center justify-between gap-3">
              <CardTitle className="flex items-center gap-3 text-xl font-bold">
                <span className="tok-kpi-icon tok-tone-sky flex h-12 w-12 items-center justify-center rounded-2xl">
                  <FileText className="h-6 w-6" />
                </span>
                Commandes à venir
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {upcomingOrders?.map((order) => (
                <div key={order.id} className="flex items-center justify-between gap-4 rounded-2xl border border-border/70 bg-background/70 px-4 py-3 text-sm dark:border-[#5f7aad]/22 dark:bg-[#07142b]/72 dark:text-slate-100">
                  <span>{new Date(order.created_at).toLocaleDateString("fr-FR")}</span>
                  <span className="font-bold">{Number(order.total_amount).toFixed(2)} CHF</span>
                  <OrderStatusBadge status={normalizeOrderStatus(order.status)} />
                </div>
              ))}
              {(!upcomingOrders || upcomingOrders.length === 0) ? <p className="text-sm text-muted-foreground">Aucune commande à venir</p> : null}
            </CardContent>
          </Card>
          <Card className="tok-dashboard-section rounded-3xl border border-border/70">
            <CardHeader>
              <CardTitle className="flex items-center gap-3 text-xl font-bold">
                <span className="tok-kpi-icon tok-tone-orange flex h-12 w-12 items-center justify-center rounded-2xl">
                  <CalendarDays className="h-6 w-6" />
                </span>
                Réservations à venir
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
