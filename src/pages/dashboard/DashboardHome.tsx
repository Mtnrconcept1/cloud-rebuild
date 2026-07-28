import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { getSupabase } from "@/integrations/supabase/client";
import DashboardLayout from "@/components/DashboardLayout";
import CommercialDemoRestaurantHome from "@/components/commercial/CommercialDemoRestaurantHome";
import { useCommercialDemoFrame } from "@/components/commercial/CommercialDemoFrameProvider";
import { CommercialDemoHome } from "@/components/dashboard/CommercialDemoScenario";
import GoogleBusinessBookingCard from "@/components/dashboard/GoogleBusinessBookingCard";
import RestaurantDashboardHomeView, {
  type RestaurantDashboardMobileMenuItem,
  type RestaurantDashboardMobileReservation,
} from "@/components/dashboard/RestaurantDashboardHomeView";
import SignupApplicationStatusCard, { type SignupApplicationCorrectionPayload } from "@/components/signup/SignupApplicationStatusCard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { normalizeOrderStatus } from "@/lib/orderStatus";
import { useSignupApplication } from "@/hooks/useSignupApplication";
import { useToast } from "@/hooks/use-toast";
import { useDashboardRestaurant } from "./useDashboardRestaurant";
import { getServicePeriodFromMetadata, getServicePeriodLabel } from "@/lib/serviceSettings";
import { buildCheckoutReturnUrl } from "@/lib/checkoutReturnUrl";
import { redirectToTrustedCheckoutUrl } from "@/lib/securityUrls";
import { invokeSupabaseFunction } from "@/lib/session";
import {
  clearPaymentAttemptId,
  createCheckoutWithRecovery,
  createPaymentAttemptOperationKey,
  getOrCreatePaymentAttemptId,
  isPaymentAttemptIndeterminateError,
  markPaymentAttemptRedirected,
  normalizePaymentAttemptId,
  rememberPaymentAttemptId,
  resolvePaymentAttemptStatus,
} from "@/lib/paymentAttempt";
import { resolveRestaurantOnboardingAttemptView, type RestaurantOnboardingAttemptView } from "@/lib/restaurantOnboardingLifecycle";
import { usePaymentAttemptBackCancellation } from "@/lib/usePaymentAttemptBackCancellation";
import {
  findUncommittedVerificationDocumentPaths,
  getSignupRestaurateurOnboardingSelection,
  removeVerificationDocumentsBestEffort,
  uploadVerificationDocumentsWithRollback,
  type SignupDocumentType,
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
const onboardingAttemptScope = (restaurantId: string) => `restaurant-onboarding:${restaurantId}`;

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

function formatDashboardDateTime(value: string) {
  return new Intl.DateTimeFormat("fr-CH", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
}

export default function Dashboard() {
  const commercialDemoFrame = useCommercialDemoFrame();
  const { isDemoMode } = useDashboardRestaurant();
  if (commercialDemoFrame?.surface === "restaurant") {
    return <CommercialDemoRestaurantHome />;
  }
  return isDemoMode ? <CommercialDemoHome /> : <LiveDashboard />;
}

function LiveDashboard() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { selectedId, dashboardAccessLocked } = useDashboardRestaurant();
  const { data: rawSignupApplication } = useSignupApplication("restaurateur");
  const signupApplication = Array.isArray(rawSignupApplication)
    ? rawSignupApplication[0] || null
    : rawSignupApplication || null;
  const [onboardingCheckoutLoading, setOnboardingCheckoutLoading] = useState(false);
  const [onboardingAttempt, setOnboardingAttempt] = useState<RestaurantOnboardingAttemptView | null>(null);
  const onboardingCheckoutLockRef = useRef(false);
  const cancellingOnboardingAttemptRef = useRef<string | null>(null);
  const signupRestaurantId = typeof signupApplication?.metadata?.restaurant_id === "string"
    ? signupApplication.metadata.restaurant_id
    : "";
  const onboardingRestaurantId = selectedId || signupRestaurantId;

  usePaymentAttemptBackCancellation({
    scope: onboardingRestaurantId ? onboardingAttemptScope(onboardingRestaurantId) : null,
    onCancelled: () => {
      setOnboardingCheckoutLoading(false);
      toast({
        title: "Paiement interrompu",
        description: "La session Stripe d'onboarding a été fermée.",
      });
    },
    onError: () => {
      setOnboardingCheckoutLoading(false);
      toast({
        title: "Paiement en cours de vérification",
        description: "Reprenez la même tentative pour éviter tout doublon.",
        variant: "destructive",
      });
    },
  });

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const status = params.get("status");
    const paymentAttemptId = normalizePaymentAttemptId(params.get("payment_attempt_id"));
    if (!paymentAttemptId || !onboardingRestaurantId) return;

    const scope = onboardingAttemptScope(onboardingRestaurantId);
    if (status === "success") {
      rememberPaymentAttemptId(scope, paymentAttemptId);
      setOnboardingCheckoutLoading(true);
      setOnboardingAttempt(resolveRestaurantOnboardingAttemptView({ paymentAttemptState: "session_bound", browserReturnReceived: true }));
      void resolvePaymentAttemptStatus({
        paymentAttemptId,
        pollAttempts: 6,
        pollDelayMs: 1_000,
        getStatus: async () => {
          const { data, error } = await invokeSupabaseFunction("payment-attempt-status", {
            body: { payment_attempt_id: paymentAttemptId, browser_return_received: true },
          });
          if (error) throw error;
          const record = data && typeof data === "object" ? data as Record<string, unknown> : {};
          setOnboardingAttempt(resolveRestaurantOnboardingAttemptView({
            paymentAttemptState: typeof record.state === "string" ? record.state : null,
            stripeStatus: typeof record.stripe_status === "string" ? record.stripe_status : null,
            setupIntentStatus: typeof record.setup_intent_status === "string" ? record.setup_intent_status : null,
            webhookReceived: record.webhook_received === true,
            browserReturnReceived: true,
          }));
          return data;
        },
      }).then((resolution) => {
        if (resolution?.state === "finalized") {
          clearPaymentAttemptId(scope, paymentAttemptId);
          void queryClient.invalidateQueries({ queryKey: ["signup-application"] });
          toast({ title: "Carte confirmée", description: "Le webhook Stripe a confirmé l’enregistrement de la carte." });
        }
      }).finally(() => setOnboardingCheckoutLoading(false));
      return;
    }
    if (status !== "cancelled" || cancellingOnboardingAttemptRef.current === paymentAttemptId) return;

    cancellingOnboardingAttemptRef.current = paymentAttemptId;
    rememberPaymentAttemptId(scope, paymentAttemptId);
    setOnboardingCheckoutLoading(true);
    void invokeSupabaseFunction("cancel-payment-attempt", {
      body: { payment_attempt_id: paymentAttemptId, reason: "stripe_cancel_return" },
    }).then(({ error }) => {
      if (error) throw error;
      clearPaymentAttemptId(scope, paymentAttemptId);
      toast({ title: "Paiement annulé", description: "Aucun abonnement n'a été créé." });
    }).catch((error) => {
      cancellingOnboardingAttemptRef.current = null;
      toast({
        title: "Annulation en cours de vérification",
        description: error instanceof Error ? error.message : "Reprenez cette tentative dans quelques secondes.",
        variant: "destructive",
      });
    }).finally(() => setOnboardingCheckoutLoading(false));
  }, [onboardingRestaurantId, queryClient, toast]);
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

  const { data: mobileMenuItems = [] } = useQuery<RestaurantDashboardMobileMenuItem[]>({
    queryKey: ["dashboard-mobile-menu-items", restaurant?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("menu_items")
        .select("id, name, description, price, image_url, category")
        .eq("restaurant_id", restaurant!.id)
        .eq("is_available", true)
        .order("name", { ascending: true })
        .limit(100);
      if (error) throw error;
      return (data || []) as RestaurantDashboardMobileMenuItem[];
    },
    enabled: operationalQueriesEnabled,
  });

  const { data: mobileTodayReservations = [] } = useQuery<RestaurantDashboardMobileReservation[]>({
    queryKey: ["dashboard-mobile-today-reservations", restaurant?.id, today],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("reservations")
        .select("id, date, time, party_size, status")
        .eq("restaurant_id", restaurant!.id)
        .eq("date", today)
        .not("status", "in", INVALID_RESERVATION_STATUS_FILTER)
        .order("time", { ascending: true })
        .limit(250);
      if (error) throw error;
      return (data || []) as RestaurantDashboardMobileReservation[];
    },
    enabled: operationalQueriesEnabled,
  });

  const { data: mobileReadyOrdersCount = 0 } = useQuery({
    queryKey: ["dashboard-mobile-ready-orders", restaurant?.id],
    queryFn: async () => {
      const { count, error } = await supabase
        .from("orders")
        .select("*", { count: "exact", head: true })
        .eq("restaurant_id", restaurant!.id)
        .eq("status", "ready");
      if (error) throw error;
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
    const restaurantId = onboardingRestaurantId;

    if (!signupApplication?.id || !restaurantId || !onboardingSelection) {
      toast({
        title: "Enregistrement de la carte indisponible",
        description: "Le dossier restaurateur ne contient pas encore tous les choix requis.",
        variant: "destructive",
      });
      return;
    }

    if (onboardingCheckoutLockRef.current) return;
    onboardingCheckoutLockRef.current = true;
    setOnboardingCheckoutLoading(true);
    try {
      const paymentAttemptId = getOrCreatePaymentAttemptId(
        onboardingAttemptScope(restaurantId),
        createPaymentAttemptOperationKey({
          checkoutKind: "restaurant-onboarding",
          signupApplicationId: signupApplication.id,
          restaurantId,
          planId: onboardingSelection.subscriptionPlanId,
          billingPeriod: onboardingSelection.subscriptionBillingPeriod,
        }),
      );
      const checkoutPayload = {
        payment_attempt_id: paymentAttemptId,
        checkout_kind: "restaurant-onboarding",
        items: [],
        payment_method: "card",
        return_url: buildCheckoutReturnUrl("/dashboard", { paymentAttemptId }),
        order_metadata: {
          payment_attempt_id: paymentAttemptId,
          checkout_kind: "restaurant-onboarding",
          signup_application_id: signupApplication.id,
          restaurant_id: restaurantId,
          plan_id: onboardingSelection.subscriptionPlanId,
          billing_period: onboardingSelection.subscriptionBillingPeriod,
        },
      };
      const checkout = await createCheckoutWithRecovery({
        paymentAttemptId,
        create: async () => {
          const { data, error } = await invokeSupabaseFunction("create-checkout", { body: checkoutPayload });
          if (error) throw error;
          return data;
        },
        getStatus: async () => {
          const { data, error } = await invokeSupabaseFunction("payment-attempt-status", {
            body: { payment_attempt_id: paymentAttemptId },
          });
          if (error) throw error;
          return data;
        },
      });

      if (!checkout.url) {
        throw new Error("Le paiement est en cours de vérification. Reprenez la même tentative dans quelques secondes.");
      }

      markPaymentAttemptRedirected(onboardingAttemptScope(restaurantId), paymentAttemptId);
      redirectToTrustedCheckoutUrl(checkout.url);
    } catch (error) {
      toast({
        title: isPaymentAttemptIndeterminateError(error) ? "Paiement en cours de vérification" : "Paiement impossible",
        description: error instanceof Error ? error.message : "Veuillez réessayer dans quelques instants.",
        variant: "destructive",
      });
    } finally {
      onboardingCheckoutLockRef.current = false;
      setOnboardingCheckoutLoading(false);
    }
  };

  const resubmitSignupApplication = useMutation({
    mutationFn: async (payload: SignupApplicationCorrectionPayload) => {
      if (!signupApplication?.id || signupApplication.requested_role !== "restaurateur") {
        throw new Error("Aucun dossier restaurateur à corriger.");
      }

      const documentEntries = Object.entries(payload.documentInputs) as Array<[SignupDocumentType, File | null | undefined]>;
      const uploadedDocuments = await uploadVerificationDocumentsWithRollback(
        documentEntries.flatMap(([documentType, file]) => file ? [{
          userId: signupApplication.user_id,
          role: "restaurateur" as const,
          documentType,
          file,
        }] : []),
      );
      const previousPathByDocumentType = new Map(
        (signupApplication.signup_application_documents || []).map((document) => [
          document.document_type,
          document.file_path,
        ]),
      );

      const existingMetadata = signupApplication.metadata && typeof signupApplication.metadata === "object"
        ? signupApplication.metadata
        : {};
      const correctionResubmittedAt = new Date().toISOString();

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
          correction_resubmitted_at: correctionResubmittedAt,
        },
        p_documents: uploadedDocuments,
      });

      if (error) {
        const { data: reconciledApplication, error: reconciliationError } = await supabase
          .from("signup_applications")
          .select("metadata")
          .eq("id", signupApplication.id)
          .maybeSingle();
        const reconciledMetadata = reconciledApplication?.metadata
          && typeof reconciledApplication.metadata === "object"
          ? reconciledApplication.metadata as Record<string, unknown>
          : null;
        const correctionWasCommitted = !reconciliationError
          && reconciledMetadata?.correction_resubmitted_at === correctionResubmittedAt;

        if (!correctionWasCommitted) {
          if (uploadedDocuments.length === 0) throw error;
          const uncommittedPaths = await findUncommittedVerificationDocumentPaths(
            signupApplication.user_id,
            uploadedDocuments.map((document) => document.file_path),
          );
          if (uncommittedPaths?.length) {
            await removeVerificationDocumentsBestEffort(uncommittedPaths);
          }
          if (uncommittedPaths === null || uncommittedPaths.length > 0) throw error;
        }
      }

      const replacedPaths = uploadedDocuments.flatMap((document) => {
        const previousPath = previousPathByDocumentType.get(document.document_type);
        return previousPath && previousPath !== document.file_path ? [previousPath] : [];
      });
      await removeVerificationDocumentsBestEffort(replacedPaths);
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
            onboardingAttempt={onboardingAttempt}
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
    <RestaurantDashboardHomeView
      restaurantName={restaurant.name}
      totalUpcomingOrders={totalUpcomingOrders}
      totalUpcomingReservations={totalUpcomingReservations}
      todayRevenue={todayRevenue}
      monthlyRevenue={monthlyRevenue}
      activeCampaignsCount={activeCampaignsCount}
      todayServiceCounts={todayServiceCounts}
      upcomingOrders={(upcomingOrders || []).map((order) => ({
        id: String(order.id),
        createdAt: typeof order.created_at === "string" ? order.created_at : null,
        totalAmount: Number(order.total_amount || 0),
        status: normalizeOrderStatus(order.status),
      }))}
      upcomingReservations={typedUpcomingReservations.map((reservation) => {
        const period = getServicePeriodFromMetadata(reservation.metadata, reservation.time);
        return {
          id: reservation.id,
          date: reservation.date,
          time: reservation.time,
          partySize: reservation.party_size,
          status: reservation.status,
          servicePeriodLabel: getServicePeriodLabel(period),
        };
      })}
      restaurantImageUrl={typeof restaurant.image_url === "string" ? restaurant.image_url : null}
      mobileMenuItems={mobileMenuItems}
      mobileTodayReservations={mobileTodayReservations}
      mobileReadyOrdersCount={mobileReadyOrdersCount}
      leadingContent={(
        <>
        <SignupApplicationStatusCard
          application={signupApplication}
          onStartRestaurantOnboardingPayment={startRestaurantOnboardingPayment}
          onboardingPaymentLoading={onboardingCheckoutLoading}
          onboardingAttempt={onboardingAttempt}
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
        </>
      )}
    />
  );
}
