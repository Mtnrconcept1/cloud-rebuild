import { lazy, Suspense, useEffect, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import ErrorBoundary from "@/components/ErrorBoundary";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { focusManager, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate, useLocation, useNavigate } from "react-router-dom";
import { AuthProvider } from "@/lib/auth";
import { useAuth } from "@/lib/auth-context";
import { CartProvider } from "@/lib/cart";
import Navbar from "@/components/Navbar";
import MobileLogoIntro from "@/components/MobileLogoIntro";
import FooterSection from "@/components/home/FooterSection";
import SupportChat from "@/components/SupportChat";
import ProtectedRoute from "@/components/ProtectedRoute";
import DashboardRoute from "@/components/DashboardRoute";
import ScrollToTop from "@/components/ScrollToTop";
import { BackNavigationButton, FloatingRouteBackButton } from "@/components/navigation/BackNavigationButton";
import AdminMobileNavigation from "@/components/admin/AdminMobileNavigation";
import ChefHelpButton from "@/components/help/ChefHelpButton";
import NotificationBell from "@/components/notifications/NotificationBell";
import RoleSpaceSwitcher from "@/components/navigation/RoleSpaceSwitcher";
import ThemeToggleButton from "@/components/theme/ThemeToggleButton";
import SignOutButton from "@/components/auth/SignOutButton";
import { setupDeepLinks } from "@/lib/deep-links";
import { getAdminHostRedirectTarget } from "@/lib/adminDomains";
import { canShowClientSurface, getRoleHomePath } from "@/lib/roleAccess";
import { useFeatureFlagSnapshot } from "@/lib/featureFlags";
import { isNative } from "@/lib/platform";
import { useTokLogoDocumentIcons } from "@/hooks/useTokLogo";

import Index from "./pages/Index";
import Auth from "./pages/Auth";
const Recherche = lazy(() => import("./pages/Recherche"));
const LocalRestaurants = lazy(() => import("./pages/LocalRestaurants"));
const RestaurantDetail = lazy(() => import("./pages/RestaurantDetail"));
const RestaurantBookingRedirect = lazy(() => import("./pages/RestaurantBookingRedirect"));
const AntiGaspi = lazy(() => import("./pages/AntiGaspi"));
const Panier = lazy(() => import("./pages/Panier"));
const NotFound = lazy(() => import("./pages/NotFound"));
const OrderConflictDialog = lazy(() => import("./components/OrderConflictDialog"));
const AdminUrgentActions = lazy(() => import("./components/admin/AdminUrgentActions"));

const Commandes = lazy(() => import("./pages/Commandes"));
const OrderConfirmation = lazy(() => import("./pages/OrderConfirmation"));
const Reservations = lazy(() => import("./pages/Reservations"));
const Profil = lazy(() => import("./pages/Profil"));
const Notifications = lazy(() => import("./pages/Notifications"));
const SuiviCommande = lazy(() => import("./pages/SuiviCommande"));
const Contact = lazy(() => import("./pages/Contact"));
const CGU = lazy(() => import("./pages/CGU"));
const PolitiqueConfidentialite = lazy(() => import("./pages/PolitiqueConfidentialite"));
const APropos = lazy(() => import("./pages/APropos"));
const PacksRestaurateur = lazy(() => import("./pages/PacksRestaurateur"));
const RestaurateursGeneve = lazy(() => import("./pages/RestaurateursGeneve"));
const RestaurateursGoogleBusiness = lazy(() => import("./pages/RestaurateursGoogleBusiness"));
const AlternativeCommissionCouvert = lazy(() => import("./pages/AlternativeCommissionCouvert"));
const MiamzSolidaires = lazy(() => import("./pages/MiamzSolidaires"));
const Aide = lazy(() => import("./pages/Aide"));
const CreneauxGarantis = lazy(() => import("./pages/CreneauxGarantis"));
const FlexPrixBas = lazy(() => import("./pages/FlexPrixBas"));
const MatchGroupes = lazy(() => import("./pages/MatchGroupes"));
const MultiStop = lazy(() => import("./pages/MultiStop"));
const MultiRestaurant = lazy(() => import("./pages/MultiRestaurant"));
const ChefsTable = lazy(() => import("./pages/ChefsTable"));
const ZeroAttente = lazy(() => import("./pages/ZeroAttente"));
const GarantieQualite = lazy(() => import("./pages/GarantieQualite"));
const BudgetAuto = lazy(() => import("./pages/BudgetAuto"));
const Abonnement = lazy(() => import("./pages/Abonnement"));
const GiftPoints = lazy(() => import("./pages/GiftPoints"));
const VentesFlash = lazy(() => import("./pages/VentesFlash"));
const Actualites = lazy(() => import("./pages/Actualites"));
const TokOne = lazy(() => import("./pages/TokOne"));
const DashboardHome = lazy(() => import("./pages/dashboard/DashboardHome"));
const DashboardRestaurant = lazy(() => import("./pages/dashboard/DashboardRestaurant"));
const DashboardMenu = lazy(() => import("./pages/dashboard/DashboardMenu"));
const DashboardReservations = lazy(() => import("./pages/dashboard/DashboardReservations"));
const DashboardCommandes = lazy(() => import("./pages/dashboard/DashboardCommandes"));
const DashboardOffres = lazy(() => import("./pages/dashboard/DashboardOffres"));
const DashboardVentesFlash = lazy(() => import("./pages/dashboard/DashboardVentesFlash"));
const DashboardFormules = lazy(() => import("./pages/dashboard/DashboardFormules"));
const DashboardCampagnes = lazy(() => import("./pages/dashboard/DashboardCampagnes"));
const DashboardPerformances = lazy(() => import("./pages/dashboard/DashboardPerformances"));
const DashboardComparaison = lazy(() => import("./pages/dashboard/DashboardComparaison"));
const DashboardAvis = lazy(() => import("./pages/dashboard/DashboardAvis"));
const DashboardPromotions = lazy(() => import("./pages/dashboard/DashboardPromotions"));
const DashboardReseauxSociaux = lazy(() => import("./pages/dashboard/DashboardReseauxSociaux"));
const DashboardActualites = lazy(() => import("./pages/dashboard/DashboardActualites"));
const DashboardFactures = lazy(() => import("./pages/dashboard/DashboardFactures"));
const DashboardFacturesInflow = lazy(() => import("./pages/dashboard/DashboardFacturesInflow"));
const DashboardFacturesOutflow = lazy(() => import("./pages/dashboard/DashboardFacturesOutflow"));
const DashboardInvoiceSettings = lazy(() => import("./pages/dashboard/DashboardInvoiceSettings"));
const DashboardAccountBilling = lazy(() => import("./pages/dashboard/DashboardAccountBilling"));
const DashboardPhotos = lazy(() => import("./pages/dashboard/DashboardPhotos"));
const DashboardNotifications = lazy(() => import("./pages/dashboard/DashboardNotifications"));
const DashboardSupport = lazy(() => import("./pages/dashboard/DashboardSupport"));
const DashboardService = lazy(() => import("./pages/dashboard/DashboardService"));
const DashboardPlanSalle = lazy(() => import("./pages/dashboard/DashboardPlanSalle"));
const DashboardAdvisor = lazy(() => import("./pages/dashboard/DashboardAdvisor"));
const DashboardPack = lazy(() => import("./pages/dashboard/DashboardPack"));

const CourierHome = lazy(() => import("./pages/courier/CourierHome"));
const CourierJobs = lazy(() => import("./pages/courier/CourierJobs"));
const CourierNotifications = lazy(() => import("./pages/courier/CourierNotifications"));
const CourierEarnings = lazy(() => import("./pages/courier/CourierEarnings"));
const CourierProfile = lazy(() => import("./pages/courier/CourierProfile"));

const AdminHome = lazy(() => import("./pages/admin/AdminHome"));
const AdminRestaurants = lazy(() => import("./pages/admin/AdminRestaurants"));
const AdminGoogleBusiness = lazy(() => import("./pages/admin/AdminGoogleBusiness"));
const AdminUtilisateurs = lazy(() => import("./pages/admin/AdminUtilisateurs"));
const AdminAvis = lazy(() => import("./pages/admin/AdminAvis"));
const AdminCatalog = lazy(() => import("./pages/admin/AdminCatalog"));
const AdminLoyalty = lazy(() => import("./pages/admin/AdminLoyalty"));
const DropsManagement = lazy(() => import("./pages/admin/DropsManagement"));
const AdminNotifications = lazy(() => import("./pages/admin/AdminNotifications"));
const AdminAuditLogs = lazy(() => import("./pages/admin/AdminAuditLogs"));
const AdminPlatformConfig = lazy(() => import("./pages/admin/AdminPlatformConfig"));
const AdminLaunchPacks = lazy(() => import("./pages/admin/AdminLaunchPacks"));
const AdminCompta = lazy(() => import("./pages/admin/AdminCompta"));
const AdminComptaInflow = lazy(() => import("./pages/admin/AdminComptaInflow"));
const AdminComptaOutflow = lazy(() => import("./pages/admin/AdminComptaOutflow"));
const AdminComptaAi = lazy(() => import("./pages/admin/AdminComptaAi"));
const AdminOperationsCenter = lazy(() => import("./pages/admin/AdminOperationsCenter"));
const AdminAiOperations = lazy(() => import("./pages/admin/AdminAiOperations"));
const AdminActualites = lazy(() => import("./pages/admin/AdminActualites"));
const AdminSinistres = lazy(() => import("./pages/admin/AdminSinistres"));

focusManager.setEventListener(() => () => undefined);

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      retry: 1,
    },
  },
});

function NativeIntegration() {
  const navigate = useNavigate();
  const { user } = useAuth();

  useEffect(() => {
    if (!isNative()) return;

    return setupDeepLinks((path) => navigate(path));
  }, [navigate]);

  useEffect(() => {
    if (!isNative() || !user?.id) return;

    const cleanups: Array<() => void> = [];
    let disposed = false;

    import("@/lib/push-native").then(({ setupNativePushListeners }) => {
      if (disposed) return;
      cleanups.push(setupNativePushListeners((url) => navigate(url)));
    });

    return () => {
      disposed = true;
      for (const cleanup of cleanups.splice(0)) cleanup();
    };
  }, [navigate, user?.id]);

  return null;
}

function AdminHostBoundary() {
  const location = useLocation();

  useEffect(() => {
    if (typeof window === "undefined") return;

    const redirectTarget = getAdminHostRedirectTarget({
      hostname: window.location.hostname,
      pathname: location.pathname,
      search: location.search,
      hash: location.hash,
    });

    if (redirectTarget && redirectTarget !== window.location.href) {
      window.location.replace(redirectTarget);
    }
  }, [location.hash, location.pathname, location.search]);

  return null;
}

function ClientSurfaceRoute({ children }: { children: React.ReactNode }) {
  const { user, loading, role, roles } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  if (user && !canShowClientSurface({ activeRole: role, roles })) {
    return <Navigate to={getRoleHomePath(role)} replace />;
  }

  return <>{children}</>;
}

function FeatureSwitch({ enabled, fallback = "/", children }: { enabled: boolean | null; fallback?: string; children: React.ReactNode }) {
  if (enabled === null) {
    return <div className="flex items-center justify-center min-h-screen"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" /></div>;
  }
  return enabled ? <>{children}</> : <Navigate to={fallback} replace />;
}

function shouldShowPublicNavbar(pathname: string) {
  return !(
    pathname === "/dashboard" ||
    pathname.startsWith("/dashboard/") ||
    pathname === "/admin" ||
    pathname.startsWith("/admin/") ||
    pathname === "/courier" ||
    pathname.startsWith("/courier/")
  );
}

function shouldShowPublicFooter(pathname: string) {
  return shouldShowPublicNavbar(pathname);
}

const adminBackButtonPortalStyle: CSSProperties = {
  left: "calc(env(safe-area-inset-left, 0px) + 0.75rem)",
  top: "calc(env(safe-area-inset-top, 0px) + 0.75rem)",
  zIndex: 1200,
};

export function AdminRouteFrame({
  children,
  fallback = "/admin",
}: {
  children: React.ReactNode;
  fallback?: string;
}) {
  const backButton = (
    <div
      className="pointer-events-none fixed"
      data-testid="admin-mobile-back-button"
      style={adminBackButtonPortalStyle}
    >
      <BackNavigationButton
        fallback={fallback}
        showLabel={false}
        className="pointer-events-auto h-11 w-11 shrink-0 justify-center border-primary bg-primary px-0 text-primary-foreground shadow-[0_14px_34px_rgba(15,23,42,0.22)] hover:bg-primary/90 dark:border-primary dark:bg-primary dark:text-primary-foreground dark:hover:bg-primary/90"
      />
    </div>
  );

  return (
    <div className="min-h-screen bg-background pb-24 pt-[calc(env(safe-area-inset-top,0px)+3.75rem)] md:pb-0">
      {typeof document === "undefined" ? backButton : createPortal(backButton, document.body)}
      <div className="fixed right-[calc(env(safe-area-inset-right,0px)+0.75rem)] top-[calc(env(safe-area-inset-top,0px)+0.75rem)] z-[1200] flex items-center gap-2">
        <ChefHelpButton surface="admin" compact className="hidden w-auto md:flex" />
        <RoleSpaceSwitcher compact />
        <ThemeToggleButton className="h-11 w-11 rounded-full border border-border/70 bg-background/95 text-foreground shadow-[0_14px_34px_rgba(15,23,42,0.16)] backdrop-blur-md hover:bg-background dark:border-[#5f7aad]/35 dark:bg-[#07142b]/95 dark:text-white dark:shadow-[0_20px_48px_rgba(0,0,0,0.5),0_0_30px_rgba(255,106,26,0.16)]" />
        <NotificationBell />
        <SignOutButton iconOnly />
      </div>
      <AdminMobileNavigation />
      {children}
    </div>
  );
}

function AdminDashboardRoute() {
  return (
    <ProtectedRoute requiredRole="admin">
      <AdminRouteFrame fallback="/">
        <div className="container pt-6">
          <AdminUrgentActions compact />
        </div>
        <AdminHome />
      </AdminRouteFrame>
    </ProtectedRoute>
  );
}

function AdminProtectedRoute({
  children,
  fallback = "/admin",
}: {
  children: React.ReactNode;
  fallback?: string;
}) {
  return (
    <ProtectedRoute requiredRole="admin">
      <AdminRouteFrame fallback={fallback}>
        {children}
      </AdminRouteFrame>
    </ProtectedRoute>
  );
}

function AppShell() {
  const { pathname } = useLocation();
  useTokLogoDocumentIcons();
  const { activeFeatures, loading: featureFlagsLoading } = useFeatureFlagSnapshot();
  const hasFeature = (flagName: string) => (featureFlagsLoading ? null : activeFeatures.has(flagName));
  const commandesEnabled = hasFeature("commandes");
  const antiWasteEnabled = hasFeature("anti-gaspi");
  const flashSalesEnabled = hasFeature("ventes-flash");
  const actualitesSocialesEnabled = hasFeature("actualites-sociales");
  const reservationEnabled = hasFeature("reservation");
  const abonnementEnabled = hasFeature("abonnement");
  const tokOneEnabled = hasFeature("tok-one");
  const giftPointsEnabled = hasFeature("points-cadeau");
  const dashboardOverviewEnabled = hasFeature("dashboard-overview");
  const dashboardAdvisorEnabled = hasFeature("dashboard-advisor");
  const dashboardRestaurantEnabled = hasFeature("dashboard-restaurant");
  const dashboardMenuEnabled = hasFeature("dashboard-menu");
  const dashboardReservationsEnabled = hasFeature("dashboard-reservations");
  const dashboardCommandesEnabled = hasFeature("dashboard-commandes");
  const dashboardPerformancesEnabled = hasFeature("dashboard-performances");
  const dashboardComparaisonEnabled = hasFeature("dashboard-comparaison");
  const dashboardAvisEnabled = hasFeature("dashboard-avis");
  const dashboardFacturesEnabled = hasFeature("dashboard-factures");
  const dashboardFacturesParametresEnabled = hasFeature("dashboard-factures-parametres");
  const dashboardBillingEnabled = hasFeature("dashboard-billing");
  const dashboardOffresEnabled = hasFeature("dashboard-offres");
  const dashboardVentesFlashEnabled = hasFeature("dashboard-ventes-flash");
  const dashboardFormulesEnabled = hasFeature("dashboard-formules");
  const dashboardPhotosEnabled = hasFeature("dashboard-photos");
  const dashboardPromotionsEnabled = hasFeature("dashboard-promotions");
  const dashboardReseauxSociauxEnabled = hasFeature("dashboard-reseaux-sociaux");
  const dashboardActualitesEnabled = hasFeature("dashboard-actualites");
  const dashboardCampagnesEnabled = hasFeature("dashboard-campagnes");
  const dashboardSupportEnabled = hasFeature("dashboard-support");
  const dashboardServiceEnabled = hasFeature("dashboard-service");
  const dashboardPlanSalleEnabled = hasFeature("dashboard-plan-salle");
  const dashboardPackEnabled = hasFeature("dashboard-pack");
  const courierHomeEnabled = hasFeature("courier-home");
  const courierJobsEnabled = hasFeature("courier-jobs");
  const courierEarningsEnabled = hasFeature("courier-earnings");
  const courierProfileEnabled = hasFeature("courier-profile");
  const adminRestaurantsEnabled = hasFeature("admin-restaurants");
  const adminUtilisateursEnabled = hasFeature("admin-utilisateurs");
  const adminAvisEnabled = hasFeature("admin-avis");
  const adminCatalogEnabled = hasFeature("admin-catalog");
  const adminLoyaltyEnabled = hasFeature("admin-loyalty");
  const adminDropsEnabled = hasFeature("admin-drops");
  const adminNotificationsEnabled = hasFeature("admin-notifications");
  const adminAuditEnabled = hasFeature("admin-audit");
  const adminPacksEnabled = hasFeature("admin-packs");
  const adminComptaEnabled = hasFeature("admin-compta");
  const adminComptaAiEnabled = hasFeature("ai_accounting_insights");
  const adminAiOperationsEnabled = hasFeature("ai_admin_monitoring");
  const adminActualitesEnabled = hasFeature("admin-actualites");
  const adminPlatformConfigEnabled = hasFeature("admin-platform-config");
  const adminOperationsCenterEnabled = hasFeature("admin-operations-center");
  const deliveryEnabled = hasFeature("livraison");
  const showPublicFooter = shouldShowPublicFooter(pathname);

  return (
    <>
      <MobileLogoIntro />
      {shouldShowPublicNavbar(pathname) ? <Navbar /> : null}
      <FloatingRouteBackButton />
      <Suspense fallback={<div className="flex items-center justify-center min-h-screen"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" /></div>}>
        <Routes>
          <Route path="/" element={<ClientSurfaceRoute><Index /></ClientSurfaceRoute>} />
          <Route path="/auth" element={<Auth />} />
          <Route path="/recherche" element={<ClientSurfaceRoute><Recherche /></ClientSurfaceRoute>} />
          <Route path="/restaurants/:city" element={<ClientSurfaceRoute><LocalRestaurants /></ClientSurfaceRoute>} />
          <Route path="/restaurants/:city/:category" element={<ClientSurfaceRoute><LocalRestaurants /></ClientSurfaceRoute>} />
          <Route path="/r/:slug" element={<ClientSurfaceRoute><RestaurantBookingRedirect /></ClientSurfaceRoute>} />
          <Route path="/restaurant/:id" element={<ClientSurfaceRoute><RestaurantDetail /></ClientSurfaceRoute>} />
          <Route path="/anti-gaspi" element={<ClientSurfaceRoute><FeatureSwitch enabled={antiWasteEnabled}><AntiGaspi /></FeatureSwitch></ClientSurfaceRoute>} />
          <Route path="/panier" element={<ClientSurfaceRoute><Panier /></ClientSurfaceRoute>} />
          <Route path="/commandes" element={<ProtectedRoute requiredRole="client"><FeatureSwitch enabled={commandesEnabled} fallback="/"><Commandes /></FeatureSwitch></ProtectedRoute>} />
          <Route path="/commande/confirmation" element={<ClientSurfaceRoute><FeatureSwitch enabled={commandesEnabled} fallback="/"><OrderConfirmation /></FeatureSwitch></ClientSurfaceRoute>} />
          <Route path="/commande/:id" element={<ProtectedRoute requiredRole="client"><FeatureSwitch enabled={commandesEnabled} fallback="/"><SuiviCommande /></FeatureSwitch></ProtectedRoute>} />
          <Route path="/reservations" element={<ProtectedRoute requiredRole="client"><FeatureSwitch enabled={reservationEnabled} fallback="/"><Reservations /></FeatureSwitch></ProtectedRoute>} />
          <Route path="/profil" element={<ProtectedRoute requiredRole="client"><Profil /></ProtectedRoute>} />
          <Route path="/notifications" element={<ProtectedRoute requiredRole="client"><Notifications /></ProtectedRoute>} />
          <Route path="/creneaux-garantis" element={<ClientSurfaceRoute><FeatureSwitch enabled={hasFeature("creneaux-garantis")}><CreneauxGarantis /></FeatureSwitch></ClientSurfaceRoute>} />
          <Route path="/flex-prix-bas" element={<ClientSurfaceRoute><FeatureSwitch enabled={hasFeature("flex-prix-bas")}><FlexPrixBas /></FeatureSwitch></ClientSurfaceRoute>} />
          <Route path="/match-groupes" element={<ClientSurfaceRoute><FeatureSwitch enabled={hasFeature("match-groupes")}><MatchGroupes /></FeatureSwitch></ClientSurfaceRoute>} />
          <Route path="/multi-stop" element={<ClientSurfaceRoute><FeatureSwitch enabled={hasFeature("multi-stop")}><MultiStop /></FeatureSwitch></ClientSurfaceRoute>} />
          <Route path="/multi-restaurant" element={<ClientSurfaceRoute><FeatureSwitch enabled={hasFeature("multi-restaurant")}><MultiRestaurant /></FeatureSwitch></ClientSurfaceRoute>} />
          <Route path="/chefs-table" element={<ClientSurfaceRoute><FeatureSwitch enabled={hasFeature("chefs-table")}><ChefsTable /></FeatureSwitch></ClientSurfaceRoute>} />
          <Route path="/zero-attente" element={<ClientSurfaceRoute><FeatureSwitch enabled={hasFeature("zero-attente")}><ZeroAttente /></FeatureSwitch></ClientSurfaceRoute>} />
          <Route path="/garantie-qualite" element={<ClientSurfaceRoute><FeatureSwitch enabled={hasFeature("garantie-qualite")}><GarantieQualite /></FeatureSwitch></ClientSurfaceRoute>} />
          <Route path="/budget-auto" element={<ClientSurfaceRoute><FeatureSwitch enabled={hasFeature("budget-auto")}><BudgetAuto /></FeatureSwitch></ClientSurfaceRoute>} />
          <Route path="/abonnement" element={<ClientSurfaceRoute><FeatureSwitch enabled={abonnementEnabled}><Abonnement /></FeatureSwitch></ClientSurfaceRoute>} />
          <Route path="/tok-one" element={<ClientSurfaceRoute><FeatureSwitch enabled={tokOneEnabled}><TokOne /></FeatureSwitch></ClientSurfaceRoute>} />
          <Route path="/miamz-solidaires" element={<MiamzSolidaires />} />
          <Route path="/points-cadeau" element={<ProtectedRoute requiredRole="client"><FeatureSwitch enabled={giftPointsEnabled}><GiftPoints /></FeatureSwitch></ProtectedRoute>} />
          <Route path="/ventes-flash" element={<ClientSurfaceRoute><FeatureSwitch enabled={flashSalesEnabled}><VentesFlash /></FeatureSwitch></ClientSurfaceRoute>} />
          <Route path="/actualites" element={<FeatureSwitch enabled={actualitesSocialesEnabled} fallback="/"><Actualites /></FeatureSwitch>} />
          <Route path="/dashboard" element={<DashboardRoute><FeatureSwitch enabled={dashboardOverviewEnabled} fallback="/"><DashboardHome /></FeatureSwitch></DashboardRoute>} />
          <Route path="/dashboard/restaurant" element={<DashboardRoute><FeatureSwitch enabled={dashboardRestaurantEnabled} fallback="/dashboard"><DashboardRestaurant /></FeatureSwitch></DashboardRoute>} />
          <Route path="/dashboard/advisor" element={<DashboardRoute><FeatureSwitch enabled={dashboardAdvisorEnabled} fallback="/dashboard"><DashboardAdvisor /></FeatureSwitch></DashboardRoute>} />
          <Route path="/dashboard/menu" element={<DashboardRoute><FeatureSwitch enabled={dashboardMenuEnabled} fallback="/dashboard"><DashboardMenu /></FeatureSwitch></DashboardRoute>} />
          <Route path="/dashboard/reservations" element={<DashboardRoute><FeatureSwitch enabled={dashboardReservationsEnabled} fallback="/dashboard"><DashboardReservations /></FeatureSwitch></DashboardRoute>} />
          <Route path="/dashboard/commandes" element={<DashboardRoute><FeatureSwitch enabled={dashboardCommandesEnabled} fallback="/dashboard"><DashboardCommandes /></FeatureSwitch></DashboardRoute>} />
          <Route path="/dashboard/recommandations" element={<Navigate to="/dashboard/advisor" replace />} />
          <Route path="/dashboard/performances" element={<DashboardRoute><FeatureSwitch enabled={dashboardPerformancesEnabled} fallback="/dashboard"><DashboardPerformances /></FeatureSwitch></DashboardRoute>} />
          <Route path="/dashboard/comparaison" element={<DashboardRoute><FeatureSwitch enabled={dashboardComparaisonEnabled} fallback="/dashboard"><DashboardComparaison /></FeatureSwitch></DashboardRoute>} />
          <Route path="/dashboard/avis" element={<DashboardRoute><FeatureSwitch enabled={dashboardAvisEnabled} fallback="/dashboard"><DashboardAvis /></FeatureSwitch></DashboardRoute>} />
          <Route path="/dashboard/compta" element={dashboardPerformancesEnabled === null ? <div className="flex items-center justify-center min-h-screen"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" /></div> : <Navigate to={dashboardPerformancesEnabled ? "/dashboard/performances" : "/dashboard"} replace />} />
          <Route path="/dashboard/factures" element={<DashboardRoute><FeatureSwitch enabled={dashboardFacturesEnabled} fallback="/dashboard"><DashboardFactures /></FeatureSwitch></DashboardRoute>} />
          <Route path="/dashboard/factures/entrees" element={<DashboardRoute><FeatureSwitch enabled={dashboardFacturesEnabled} fallback="/dashboard/factures"><DashboardFacturesInflow /></FeatureSwitch></DashboardRoute>} />
          <Route path="/dashboard/factures/sorties" element={<DashboardRoute><FeatureSwitch enabled={dashboardFacturesEnabled} fallback="/dashboard/factures"><DashboardFacturesOutflow /></FeatureSwitch></DashboardRoute>} />
          <Route path="/dashboard/factures/parametres" element={<DashboardRoute><FeatureSwitch enabled={dashboardFacturesParametresEnabled} fallback="/dashboard/factures"><DashboardInvoiceSettings /></FeatureSwitch></DashboardRoute>} />
          <Route path="/dashboard/mon-compte-facturation" element={<DashboardRoute><FeatureSwitch enabled={dashboardBillingEnabled} fallback="/dashboard"><DashboardAccountBilling /></FeatureSwitch></DashboardRoute>} />
          <Route path="/dashboard/offres" element={<DashboardRoute><FeatureSwitch enabled={dashboardOffresEnabled} fallback="/dashboard"><DashboardOffres /></FeatureSwitch></DashboardRoute>} />
          <Route path="/dashboard/ventes-flash" element={<DashboardRoute><FeatureSwitch enabled={dashboardVentesFlashEnabled} fallback="/dashboard"><DashboardVentesFlash /></FeatureSwitch></DashboardRoute>} />
          <Route path="/dashboard/formules" element={<DashboardRoute><FeatureSwitch enabled={dashboardFormulesEnabled} fallback="/dashboard"><DashboardFormules /></FeatureSwitch></DashboardRoute>} />
          <Route path="/dashboard/photos" element={<DashboardRoute><FeatureSwitch enabled={dashboardPhotosEnabled} fallback="/dashboard"><DashboardPhotos /></FeatureSwitch></DashboardRoute>} />
          <Route path="/dashboard/promotions" element={<DashboardRoute><FeatureSwitch enabled={dashboardPromotionsEnabled} fallback="/dashboard"><DashboardPromotions /></FeatureSwitch></DashboardRoute>} />
          <Route path="/dashboard/campagne-overview" element={<Navigate to="/dashboard/campagnes" replace />} />
          <Route path="/dashboard/reseaux-sociaux" element={<DashboardRoute><FeatureSwitch enabled={dashboardReseauxSociauxEnabled} fallback="/dashboard"><DashboardReseauxSociaux /></FeatureSwitch></DashboardRoute>} />
          <Route path="/dashboard/actualites" element={<DashboardRoute><FeatureSwitch enabled={dashboardActualitesEnabled} fallback="/dashboard"><DashboardActualites /></FeatureSwitch></DashboardRoute>} />
          <Route path="/dashboard/campagnes" element={<DashboardRoute><FeatureSwitch enabled={dashboardCampagnesEnabled} fallback="/dashboard"><DashboardCampagnes /></FeatureSwitch></DashboardRoute>} />
          <Route path="/dashboard/notifications" element={<DashboardRoute><DashboardNotifications /></DashboardRoute>} />
          <Route path="/dashboard/support" element={<DashboardRoute><FeatureSwitch enabled={dashboardSupportEnabled} fallback="/dashboard"><DashboardSupport /></FeatureSwitch></DashboardRoute>} />
          <Route path="/dashboard/service" element={<DashboardRoute><FeatureSwitch enabled={dashboardServiceEnabled} fallback="/dashboard"><DashboardService /></FeatureSwitch></DashboardRoute>} />
          <Route path="/dashboard/plan-salle" element={<DashboardRoute><FeatureSwitch enabled={dashboardPlanSalleEnabled} fallback="/dashboard"><DashboardPlanSalle /></FeatureSwitch></DashboardRoute>} />
          <Route path="/dashboard/pack" element={<DashboardRoute><FeatureSwitch enabled={dashboardPackEnabled} fallback="/dashboard"><DashboardPack /></FeatureSwitch></DashboardRoute>} />
          <Route path="/courier" element={<ProtectedRoute requiredRole="courier"><FeatureSwitch enabled={courierHomeEnabled}><CourierHome /></FeatureSwitch></ProtectedRoute>} />
          <Route path="/courier/jobs" element={<ProtectedRoute requiredRole="courier"><FeatureSwitch enabled={courierJobsEnabled} fallback="/courier"><CourierJobs /></FeatureSwitch></ProtectedRoute>} />
          <Route path="/courier/notifications" element={<ProtectedRoute requiredRole="courier"><CourierNotifications /></ProtectedRoute>} />
          <Route path="/courier/earnings" element={<ProtectedRoute requiredRole="courier"><FeatureSwitch enabled={courierEarningsEnabled} fallback="/courier"><CourierEarnings /></FeatureSwitch></ProtectedRoute>} />
          <Route path="/courier/profile" element={<ProtectedRoute requiredRole="courier"><FeatureSwitch enabled={courierProfileEnabled} fallback="/courier"><CourierProfile /></FeatureSwitch></ProtectedRoute>} />
          <Route path="/admin" element={<AdminDashboardRoute />} />
          <Route path="/admin/platform" element={<AdminProtectedRoute><FeatureSwitch enabled={adminPlatformConfigEnabled} fallback="/admin"><AdminPlatformConfig /></FeatureSwitch></AdminProtectedRoute>} />
          <Route path="/admin/restaurants" element={<AdminProtectedRoute><FeatureSwitch enabled={adminRestaurantsEnabled} fallback="/admin"><AdminRestaurants /></FeatureSwitch></AdminProtectedRoute>} />
          <Route path="/admin/restaurants/google-business" element={<AdminProtectedRoute><FeatureSwitch enabled={adminRestaurantsEnabled} fallback="/admin"><AdminGoogleBusiness /></FeatureSwitch></AdminProtectedRoute>} />
          <Route path="/admin/utilisateurs" element={<AdminProtectedRoute><FeatureSwitch enabled={adminUtilisateursEnabled} fallback="/admin"><AdminUtilisateurs /></FeatureSwitch></AdminProtectedRoute>} />
          <Route path="/admin/avis" element={<AdminProtectedRoute><FeatureSwitch enabled={adminAvisEnabled} fallback="/admin"><AdminAvis /></FeatureSwitch></AdminProtectedRoute>} />
          <Route path="/admin/catalog" element={<AdminProtectedRoute><FeatureSwitch enabled={adminCatalogEnabled} fallback="/admin"><AdminCatalog /></FeatureSwitch></AdminProtectedRoute>} />
          <Route path="/admin/loyalty" element={<AdminProtectedRoute><FeatureSwitch enabled={adminLoyaltyEnabled} fallback="/admin"><AdminLoyalty /></FeatureSwitch></AdminProtectedRoute>} />
          <Route path="/admin/drops" element={<AdminProtectedRoute><FeatureSwitch enabled={adminDropsEnabled} fallback="/admin"><DropsManagement /></FeatureSwitch></AdminProtectedRoute>} />
          <Route path="/admin/notifications" element={<AdminProtectedRoute><FeatureSwitch enabled={adminNotificationsEnabled} fallback="/admin"><AdminNotifications /></FeatureSwitch></AdminProtectedRoute>} />
          <Route path="/admin/actualites" element={<AdminProtectedRoute><FeatureSwitch enabled={adminActualitesEnabled} fallback="/admin"><AdminActualites /></FeatureSwitch></AdminProtectedRoute>} />
          <Route path="/admin/audit" element={<AdminProtectedRoute><FeatureSwitch enabled={adminAuditEnabled} fallback="/admin"><AdminAuditLogs /></FeatureSwitch></AdminProtectedRoute>} />
          <Route path="/admin/packs" element={<AdminProtectedRoute><FeatureSwitch enabled={adminPacksEnabled} fallback="/admin"><AdminLaunchPacks /></FeatureSwitch></AdminProtectedRoute>} />
          <Route path="/admin/compta" element={<AdminProtectedRoute><FeatureSwitch enabled={adminComptaEnabled} fallback="/admin"><AdminCompta /></FeatureSwitch></AdminProtectedRoute>} />
          <Route path="/admin/compta/entrees" element={<AdminProtectedRoute fallback="/admin/compta"><FeatureSwitch enabled={adminComptaEnabled} fallback="/admin/compta"><AdminComptaInflow /></FeatureSwitch></AdminProtectedRoute>} />
          <Route path="/admin/compta/sorties" element={<AdminProtectedRoute fallback="/admin/compta"><FeatureSwitch enabled={adminComptaEnabled} fallback="/admin/compta"><AdminComptaOutflow /></FeatureSwitch></AdminProtectedRoute>} />
          <Route path="/admin/compta/ia" element={<AdminProtectedRoute fallback="/admin/compta"><FeatureSwitch enabled={adminComptaAiEnabled} fallback="/admin/compta"><AdminComptaAi /></FeatureSwitch></AdminProtectedRoute>} />
          <Route path="/admin/commandes-reservations" element={<AdminProtectedRoute><FeatureSwitch enabled={adminOperationsCenterEnabled} fallback="/admin"><AdminOperationsCenter /></FeatureSwitch></AdminProtectedRoute>} />
          <Route path="/admin/sinistres" element={<AdminProtectedRoute><FeatureSwitch enabled={adminOperationsCenterEnabled} fallback="/admin"><AdminSinistres /></FeatureSwitch></AdminProtectedRoute>} />
          <Route path="/admin/ai-operations" element={<AdminProtectedRoute><FeatureSwitch enabled={adminAiOperationsEnabled} fallback="/admin"><AdminAiOperations /></FeatureSwitch></AdminProtectedRoute>} />
          <Route path="/contact" element={<Contact />} />
          <Route path="/cgu" element={<CGU />} />
          <Route path="/politique-confidentialite" element={<PolitiqueConfidentialite />} />
          <Route path="/a-propos" element={<APropos />} />
          <Route path="/packs-restaurateur" element={<PacksRestaurateur />} />
          <Route path="/restaurateurs/geneve" element={<RestaurateursGeneve />} />
          <Route path="/restaurateurs/google-business" element={<RestaurateursGoogleBusiness />} />
          <Route path="/restaurateurs/alternative-commission-couvert" element={<AlternativeCommissionCouvert />} />
          <Route path="/aide" element={<Aide />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </Suspense>
      <SupportChat />
      <Suspense fallback={null}>
        <OrderConflictDialog />
      </Suspense>
      {showPublicFooter ? <FooterSection deliveryEnabled={pathname === "/" && deliveryEnabled === true} /> : null}
    </>
  );
}

const App = () => (
  <ErrorBoundary>
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <ScrollToTop />
          <AdminHostBoundary />
          <AuthProvider>
            <NativeIntegration />
            <CartProvider>
              <AppShell />
            </CartProvider>
          </AuthProvider>
        </BrowserRouter>
      </TooltipProvider>
    </QueryClientProvider>
  </ErrorBoundary>
);

export default App;
