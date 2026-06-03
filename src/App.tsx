import { lazy, Suspense, useEffect } from "react";
import ErrorBoundary from "@/components/ErrorBoundary";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { focusManager, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate, useLocation, useNavigate } from "react-router-dom";
import { AuthProvider } from "@/lib/auth";
import { CartProvider } from "@/lib/cart";
import Navbar from "@/components/Navbar";
import MobileLogoIntro from "@/components/MobileLogoIntro";
import ProtectedRoute from "@/components/ProtectedRoute";
import DashboardRoute from "@/components/DashboardRoute";
import ScrollToTop from "@/components/ScrollToTop";
import { setupDeepLinks } from "@/lib/deep-links";
import { useFeatureFlagSnapshot } from "@/lib/featureFlags";
import { isNative } from "@/lib/platform";

import Index from "./pages/Index";
import Auth from "./pages/Auth";
const Recherche = lazy(() => import("./pages/Recherche"));
const LocalRestaurants = lazy(() => import("./pages/LocalRestaurants"));
const RestaurantDetail = lazy(() => import("./pages/RestaurantDetail"));
const AntiGaspi = lazy(() => import("./pages/AntiGaspi"));
const Panier = lazy(() => import("./pages/Panier"));
const NotFound = lazy(() => import("./pages/NotFound"));
const SupportChat = lazy(() => import("./components/SupportChat"));
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
const DashboardRecommandations = lazy(() => import("./pages/dashboard/DashboardRecommandations"));
const DashboardPerformances = lazy(() => import("./pages/dashboard/DashboardPerformances"));
const DashboardComparaison = lazy(() => import("./pages/dashboard/DashboardComparaison"));
const DashboardAvis = lazy(() => import("./pages/dashboard/DashboardAvis"));
const DashboardPromotions = lazy(() => import("./pages/dashboard/DashboardPromotions"));
const DashboardCampagneOverview = lazy(() => import("./pages/dashboard/DashboardCampagneOverview"));
const DashboardReseauxSociaux = lazy(() => import("./pages/dashboard/DashboardReseauxSociaux"));
const DashboardActualites = lazy(() => import("./pages/dashboard/DashboardActualites"));
const DashboardFactures = lazy(() => import("./pages/dashboard/DashboardFactures"));
const DashboardFacturesInflow = lazy(() => import("./pages/dashboard/DashboardFacturesInflow"));
const DashboardFacturesOutflow = lazy(() => import("./pages/dashboard/DashboardFacturesOutflow"));
const DashboardInvoiceSettings = lazy(() => import("./pages/dashboard/DashboardInvoiceSettings"));
const DashboardPhotos = lazy(() => import("./pages/dashboard/DashboardPhotos"));
const DashboardSupport = lazy(() => import("./pages/dashboard/DashboardSupport"));
const DashboardService = lazy(() => import("./pages/dashboard/DashboardService"));
const DashboardPlanSalle = lazy(() => import("./pages/dashboard/DashboardPlanSalle"));
const DashboardAdvisor = lazy(() => import("./pages/dashboard/DashboardAdvisor"));
const DashboardPack = lazy(() => import("./pages/dashboard/DashboardPack"));

const CourierHome = lazy(() => import("./pages/courier/CourierHome"));
const CourierJobs = lazy(() => import("./pages/courier/CourierJobs"));
const CourierEarnings = lazy(() => import("./pages/courier/CourierEarnings"));
const CourierProfile = lazy(() => import("./pages/courier/CourierProfile"));

const AdminHome = lazy(() => import("./pages/admin/AdminHome"));
const AdminRestaurants = lazy(() => import("./pages/admin/AdminRestaurants"));
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

  useEffect(() => {
    if (!isNative()) return;

    const cleanups: Array<() => void> = [setupDeepLinks((path) => navigate(path))];
    let disposed = false;

    import("@/lib/push-native").then(({ setupNativePushListeners }) => {
      if (disposed) return;
      cleanups.push(setupNativePushListeners((url) => navigate(url)));
    });

    return () => {
      disposed = true;
      for (const cleanup of cleanups.splice(0)) cleanup();
    };
  }, [navigate]);

  return null;
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

function AdminDashboardRoute() {
  return (
    <ProtectedRoute requiredRole="admin">
      <div className="container pt-8">
        <AdminUrgentActions compact />
      </div>
      <AdminHome />
    </ProtectedRoute>
  );
}

function AppShell() {
  const { pathname } = useLocation();
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
  const dashboardRecommandationsEnabled = hasFeature("dashboard-recommandations");
  const dashboardPerformancesEnabled = hasFeature("dashboard-performances");
  const dashboardComparaisonEnabled = hasFeature("dashboard-comparaison");
  const dashboardAvisEnabled = hasFeature("dashboard-avis");
  const dashboardFacturesEnabled = hasFeature("dashboard-factures");
  const dashboardFacturesParametresEnabled = hasFeature("dashboard-factures-parametres");
  const dashboardOffresEnabled = hasFeature("dashboard-offres");
  const dashboardVentesFlashEnabled = hasFeature("dashboard-ventes-flash");
  const dashboardFormulesEnabled = hasFeature("dashboard-formules");
  const dashboardPhotosEnabled = hasFeature("dashboard-photos");
  const dashboardPromotionsEnabled = hasFeature("dashboard-promotions");
  const dashboardCampagneOverviewEnabled = hasFeature("dashboard-campagne-overview");
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

  return (
    <>
      <MobileLogoIntro />
      {shouldShowPublicNavbar(pathname) ? <Navbar /> : null}
      <Suspense fallback={<div className="flex items-center justify-center min-h-screen"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" /></div>}>
        <Routes>
          <Route path="/" element={<Index />} />
          <Route path="/auth" element={<Auth />} />
          <Route path="/recherche" element={<Recherche />} />
          <Route path="/restaurants/:city" element={<LocalRestaurants />} />
          <Route path="/restaurants/:city/:category" element={<LocalRestaurants />} />
          <Route path="/restaurant/:id" element={<RestaurantDetail />} />
          <Route path="/anti-gaspi" element={<FeatureSwitch enabled={antiWasteEnabled}><AntiGaspi /></FeatureSwitch>} />
          <Route path="/panier" element={<Panier />} />
          <Route path="/commandes" element={<ProtectedRoute requiredRole="client"><FeatureSwitch enabled={commandesEnabled} fallback="/"><Commandes /></FeatureSwitch></ProtectedRoute>} />
          <Route path="/commande/confirmation" element={<FeatureSwitch enabled={commandesEnabled} fallback="/"><OrderConfirmation /></FeatureSwitch>} />
          <Route path="/commande/:id" element={<ProtectedRoute requiredRole="client"><FeatureSwitch enabled={commandesEnabled} fallback="/"><SuiviCommande /></FeatureSwitch></ProtectedRoute>} />
          <Route path="/reservations" element={<ProtectedRoute requiredRole="client"><FeatureSwitch enabled={reservationEnabled} fallback="/"><Reservations /></FeatureSwitch></ProtectedRoute>} />
          <Route path="/profil" element={<ProtectedRoute requiredRole="client"><Profil /></ProtectedRoute>} />
          <Route path="/notifications" element={<ProtectedRoute requiredRole="client"><Notifications /></ProtectedRoute>} />
          <Route path="/creneaux-garantis" element={<FeatureSwitch enabled={hasFeature("creneaux-garantis")}><CreneauxGarantis /></FeatureSwitch>} />
          <Route path="/flex-prix-bas" element={<FeatureSwitch enabled={hasFeature("flex-prix-bas")}><FlexPrixBas /></FeatureSwitch>} />
          <Route path="/match-groupes" element={<FeatureSwitch enabled={hasFeature("match-groupes")}><MatchGroupes /></FeatureSwitch>} />
          <Route path="/multi-stop" element={<FeatureSwitch enabled={hasFeature("multi-stop")}><MultiStop /></FeatureSwitch>} />
          <Route path="/multi-restaurant" element={<FeatureSwitch enabled={hasFeature("multi-restaurant")}><MultiRestaurant /></FeatureSwitch>} />
          <Route path="/chefs-table" element={<FeatureSwitch enabled={hasFeature("chefs-table")}><ChefsTable /></FeatureSwitch>} />
          <Route path="/zero-attente" element={<FeatureSwitch enabled={hasFeature("zero-attente")}><ZeroAttente /></FeatureSwitch>} />
          <Route path="/garantie-qualite" element={<FeatureSwitch enabled={hasFeature("garantie-qualite")}><GarantieQualite /></FeatureSwitch>} />
          <Route path="/budget-auto" element={<FeatureSwitch enabled={hasFeature("budget-auto")}><BudgetAuto /></FeatureSwitch>} />
          <Route path="/abonnement" element={<FeatureSwitch enabled={abonnementEnabled}><Abonnement /></FeatureSwitch>} />
          <Route path="/tok-one" element={<FeatureSwitch enabled={tokOneEnabled}><TokOne /></FeatureSwitch>} />
          <Route path="/points-cadeau" element={<ProtectedRoute requiredRole="client"><FeatureSwitch enabled={giftPointsEnabled}><GiftPoints /></FeatureSwitch></ProtectedRoute>} />
          <Route path="/ventes-flash" element={<FeatureSwitch enabled={flashSalesEnabled}><VentesFlash /></FeatureSwitch>} />
          <Route path="/actualites" element={<FeatureSwitch enabled={actualitesSocialesEnabled} fallback="/"><Actualites /></FeatureSwitch>} />
          <Route path="/dashboard" element={<DashboardRoute><FeatureSwitch enabled={dashboardOverviewEnabled} fallback="/"><DashboardHome /></FeatureSwitch></DashboardRoute>} />
          <Route path="/dashboard/restaurant" element={<DashboardRoute><FeatureSwitch enabled={dashboardRestaurantEnabled} fallback="/dashboard"><DashboardRestaurant /></FeatureSwitch></DashboardRoute>} />
          <Route path="/dashboard/advisor" element={<DashboardRoute><FeatureSwitch enabled={dashboardAdvisorEnabled} fallback="/dashboard"><DashboardAdvisor /></FeatureSwitch></DashboardRoute>} />
          <Route path="/dashboard/menu" element={<DashboardRoute><FeatureSwitch enabled={dashboardMenuEnabled} fallback="/dashboard"><DashboardMenu /></FeatureSwitch></DashboardRoute>} />
          <Route path="/dashboard/reservations" element={<DashboardRoute><FeatureSwitch enabled={dashboardReservationsEnabled} fallback="/dashboard"><DashboardReservations /></FeatureSwitch></DashboardRoute>} />
          <Route path="/dashboard/commandes" element={<DashboardRoute><FeatureSwitch enabled={dashboardCommandesEnabled} fallback="/dashboard"><DashboardCommandes /></FeatureSwitch></DashboardRoute>} />
          <Route path="/dashboard/recommandations" element={<DashboardRoute><FeatureSwitch enabled={dashboardRecommandationsEnabled} fallback="/dashboard"><DashboardRecommandations /></FeatureSwitch></DashboardRoute>} />
          <Route path="/dashboard/performances" element={<DashboardRoute><FeatureSwitch enabled={dashboardPerformancesEnabled} fallback="/dashboard"><DashboardPerformances /></FeatureSwitch></DashboardRoute>} />
          <Route path="/dashboard/comparaison" element={<DashboardRoute><FeatureSwitch enabled={dashboardComparaisonEnabled} fallback="/dashboard"><DashboardComparaison /></FeatureSwitch></DashboardRoute>} />
          <Route path="/dashboard/avis" element={<DashboardRoute><FeatureSwitch enabled={dashboardAvisEnabled} fallback="/dashboard"><DashboardAvis /></FeatureSwitch></DashboardRoute>} />
          <Route path="/dashboard/compta" element={dashboardPerformancesEnabled === null ? <div className="flex items-center justify-center min-h-screen"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" /></div> : <Navigate to={dashboardPerformancesEnabled ? "/dashboard/performances" : "/dashboard"} replace />} />
          <Route path="/dashboard/factures" element={<DashboardRoute><FeatureSwitch enabled={dashboardFacturesEnabled} fallback="/dashboard"><DashboardFactures /></FeatureSwitch></DashboardRoute>} />
          <Route path="/dashboard/factures/entrees" element={<DashboardRoute><FeatureSwitch enabled={dashboardFacturesEnabled} fallback="/dashboard/factures"><DashboardFacturesInflow /></FeatureSwitch></DashboardRoute>} />
          <Route path="/dashboard/factures/sorties" element={<DashboardRoute><FeatureSwitch enabled={dashboardFacturesEnabled} fallback="/dashboard/factures"><DashboardFacturesOutflow /></FeatureSwitch></DashboardRoute>} />
          <Route path="/dashboard/factures/parametres" element={<DashboardRoute><FeatureSwitch enabled={dashboardFacturesParametresEnabled} fallback="/dashboard/factures"><DashboardInvoiceSettings /></FeatureSwitch></DashboardRoute>} />
          <Route path="/dashboard/offres" element={<DashboardRoute><FeatureSwitch enabled={dashboardOffresEnabled} fallback="/dashboard"><DashboardOffres /></FeatureSwitch></DashboardRoute>} />
          <Route path="/dashboard/ventes-flash" element={<DashboardRoute><FeatureSwitch enabled={dashboardVentesFlashEnabled} fallback="/dashboard"><DashboardVentesFlash /></FeatureSwitch></DashboardRoute>} />
          <Route path="/dashboard/formules" element={<DashboardRoute><FeatureSwitch enabled={dashboardFormulesEnabled} fallback="/dashboard"><DashboardFormules /></FeatureSwitch></DashboardRoute>} />
          <Route path="/dashboard/photos" element={<DashboardRoute><FeatureSwitch enabled={dashboardPhotosEnabled} fallback="/dashboard"><DashboardPhotos /></FeatureSwitch></DashboardRoute>} />
          <Route path="/dashboard/promotions" element={<DashboardRoute><FeatureSwitch enabled={dashboardPromotionsEnabled} fallback="/dashboard"><DashboardPromotions /></FeatureSwitch></DashboardRoute>} />
          <Route path="/dashboard/campagne-overview" element={<DashboardRoute><FeatureSwitch enabled={dashboardCampagneOverviewEnabled} fallback="/dashboard"><DashboardCampagneOverview /></FeatureSwitch></DashboardRoute>} />
          <Route path="/dashboard/reseaux-sociaux" element={<DashboardRoute><FeatureSwitch enabled={dashboardReseauxSociauxEnabled} fallback="/dashboard"><DashboardReseauxSociaux /></FeatureSwitch></DashboardRoute>} />
          <Route path="/dashboard/actualites" element={<DashboardRoute><FeatureSwitch enabled={dashboardActualitesEnabled} fallback="/dashboard"><DashboardActualites /></FeatureSwitch></DashboardRoute>} />
          <Route path="/dashboard/campagnes" element={<DashboardRoute><FeatureSwitch enabled={dashboardCampagnesEnabled} fallback="/dashboard"><DashboardCampagnes /></FeatureSwitch></DashboardRoute>} />
          <Route path="/dashboard/support" element={<DashboardRoute><FeatureSwitch enabled={dashboardSupportEnabled} fallback="/dashboard"><DashboardSupport /></FeatureSwitch></DashboardRoute>} />
          <Route path="/dashboard/service" element={<DashboardRoute><FeatureSwitch enabled={dashboardServiceEnabled} fallback="/dashboard"><DashboardService /></FeatureSwitch></DashboardRoute>} />
          <Route path="/dashboard/plan-salle" element={<DashboardRoute><FeatureSwitch enabled={dashboardPlanSalleEnabled} fallback="/dashboard"><DashboardPlanSalle /></FeatureSwitch></DashboardRoute>} />
          <Route path="/dashboard/pack" element={<DashboardRoute><FeatureSwitch enabled={dashboardPackEnabled} fallback="/dashboard"><DashboardPack /></FeatureSwitch></DashboardRoute>} />
          <Route path="/courier" element={<ProtectedRoute requiredRole="courier"><FeatureSwitch enabled={courierHomeEnabled}><CourierHome /></FeatureSwitch></ProtectedRoute>} />
          <Route path="/courier/jobs" element={<ProtectedRoute requiredRole="courier"><FeatureSwitch enabled={courierJobsEnabled} fallback="/courier"><CourierJobs /></FeatureSwitch></ProtectedRoute>} />
          <Route path="/courier/earnings" element={<ProtectedRoute requiredRole="courier"><FeatureSwitch enabled={courierEarningsEnabled} fallback="/courier"><CourierEarnings /></FeatureSwitch></ProtectedRoute>} />
          <Route path="/courier/profile" element={<ProtectedRoute requiredRole="courier"><FeatureSwitch enabled={courierProfileEnabled} fallback="/courier"><CourierProfile /></FeatureSwitch></ProtectedRoute>} />
          <Route path="/admin" element={<AdminDashboardRoute />} />
          <Route path="/admin/platform" element={<ProtectedRoute requiredRole="admin"><FeatureSwitch enabled={adminPlatformConfigEnabled} fallback="/admin"><AdminPlatformConfig /></FeatureSwitch></ProtectedRoute>} />
          <Route path="/admin/restaurants" element={<ProtectedRoute requiredRole="admin"><FeatureSwitch enabled={adminRestaurantsEnabled} fallback="/admin"><AdminRestaurants /></FeatureSwitch></ProtectedRoute>} />
          <Route path="/admin/utilisateurs" element={<ProtectedRoute requiredRole="admin"><FeatureSwitch enabled={adminUtilisateursEnabled} fallback="/admin"><AdminUtilisateurs /></FeatureSwitch></ProtectedRoute>} />
          <Route path="/admin/avis" element={<ProtectedRoute requiredRole="admin"><FeatureSwitch enabled={adminAvisEnabled} fallback="/admin"><AdminAvis /></FeatureSwitch></ProtectedRoute>} />
          <Route path="/admin/catalog" element={<ProtectedRoute requiredRole="admin"><FeatureSwitch enabled={adminCatalogEnabled} fallback="/admin"><AdminCatalog /></FeatureSwitch></ProtectedRoute>} />
          <Route path="/admin/loyalty" element={<ProtectedRoute requiredRole="admin"><FeatureSwitch enabled={adminLoyaltyEnabled} fallback="/admin"><AdminLoyalty /></FeatureSwitch></ProtectedRoute>} />
          <Route path="/admin/drops" element={<ProtectedRoute requiredRole="admin"><FeatureSwitch enabled={adminDropsEnabled} fallback="/admin"><DropsManagement /></FeatureSwitch></ProtectedRoute>} />
          <Route path="/admin/notifications" element={<ProtectedRoute requiredRole="admin"><FeatureSwitch enabled={adminNotificationsEnabled} fallback="/admin"><AdminNotifications /></FeatureSwitch></ProtectedRoute>} />
          <Route path="/admin/actualites" element={<ProtectedRoute requiredRole="admin"><FeatureSwitch enabled={adminActualitesEnabled} fallback="/admin"><AdminActualites /></FeatureSwitch></ProtectedRoute>} />
          <Route path="/admin/audit" element={<ProtectedRoute requiredRole="admin"><FeatureSwitch enabled={adminAuditEnabled} fallback="/admin"><AdminAuditLogs /></FeatureSwitch></ProtectedRoute>} />
          <Route path="/admin/packs" element={<ProtectedRoute requiredRole="admin"><FeatureSwitch enabled={adminPacksEnabled} fallback="/admin"><AdminLaunchPacks /></FeatureSwitch></ProtectedRoute>} />
          <Route path="/admin/compta" element={<ProtectedRoute requiredRole="admin"><FeatureSwitch enabled={adminComptaEnabled} fallback="/admin"><AdminCompta /></FeatureSwitch></ProtectedRoute>} />
          <Route path="/admin/compta/entrees" element={<ProtectedRoute requiredRole="admin"><FeatureSwitch enabled={adminComptaEnabled} fallback="/admin/compta"><AdminComptaInflow /></FeatureSwitch></ProtectedRoute>} />
          <Route path="/admin/compta/sorties" element={<ProtectedRoute requiredRole="admin"><FeatureSwitch enabled={adminComptaEnabled} fallback="/admin/compta"><AdminComptaOutflow /></FeatureSwitch></ProtectedRoute>} />
          <Route path="/admin/compta/ia" element={<ProtectedRoute requiredRole="admin"><FeatureSwitch enabled={adminComptaAiEnabled} fallback="/admin/compta"><AdminComptaAi /></FeatureSwitch></ProtectedRoute>} />
          <Route path="/admin/commandes-reservations" element={<ProtectedRoute requiredRole="admin"><FeatureSwitch enabled={adminOperationsCenterEnabled} fallback="/admin"><AdminOperationsCenter /></FeatureSwitch></ProtectedRoute>} />
          <Route path="/admin/ai-operations" element={<ProtectedRoute requiredRole="admin"><FeatureSwitch enabled={adminAiOperationsEnabled} fallback="/admin"><AdminAiOperations /></FeatureSwitch></ProtectedRoute>} />
          <Route path="/contact" element={<Contact />} />
          <Route path="/cgu" element={<CGU />} />
          <Route path="/politique-confidentialite" element={<PolitiqueConfidentialite />} />
          <Route path="/a-propos" element={<APropos />} />
          <Route path="/packs-restaurateur" element={<PacksRestaurateur />} />
          <Route path="/aide" element={<Aide />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </Suspense>
      <Suspense fallback={null}>
        <SupportChat />
        <OrderConflictDialog />
      </Suspense>
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
          <NativeIntegration />
          <AuthProvider>
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
