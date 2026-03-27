import { lazy, Suspense, useEffect } from "react";
import ErrorBoundary from "@/components/ErrorBoundary";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate, useNavigate } from "react-router-dom";
import { AuthProvider } from "@/lib/auth";
import { CartProvider } from "@/lib/cart";
import Navbar from "@/components/Navbar";
import ProtectedRoute from "@/components/ProtectedRoute";
import DashboardRoute from "@/components/DashboardRoute";
import ScrollToTop from "@/components/ScrollToTop";
import { setupDeepLinks } from "@/lib/deep-links";
import { useActiveFeatures } from "@/lib/featureFlags";
import { isNative } from "@/lib/platform";
// Client-facing pages (eagerly loaded for instant first paint)
import Index from "./pages/Index";
import Auth from "./pages/Auth";
import Recherche from "./pages/Recherche";
import RestaurantDetail from "./pages/RestaurantDetail";
import AntiGaspi from "./pages/AntiGaspi";
import Panier from "./pages/Panier";
import Commandes from "./pages/Commandes";
import Reservations from "./pages/Reservations";
import Profil from "./pages/Profil";
import Notifications from "./pages/Notifications";
import SuiviCommande from "./pages/SuiviCommande";
import NotFound from "./pages/NotFound";
import Contact from "./pages/Contact";
import CGU from "./pages/CGU";
import PolitiqueConfidentialite from "./pages/PolitiqueConfidentialite";
import APropos from "./pages/APropos";
import Aide from "./pages/Aide";
import SupportChat from "./components/SupportChat";
import OrderConflictDialog from "./components/OrderConflictDialog";
// New features (eagerly loaded — lightweight client pages)
import CreneauxGarantis from "./pages/CreneauxGarantis";
import FlexPrixBas from "./pages/FlexPrixBas";
import MatchGroupes from "./pages/MatchGroupes";
import MultiStop from "./pages/MultiStop";
import MultiRestaurant from "./pages/MultiRestaurant";
import ChefsTable from "./pages/ChefsTable";
import ZeroAttente from "./pages/ZeroAttente";
import GarantieQualite from "./pages/GarantieQualite";
import BudgetAuto from "./pages/BudgetAuto";
import Abonnement from "./pages/Abonnement";
import GiftPoints from "./pages/GiftPoints";
import VentesFlash from "./pages/VentesFlash";

// ── Lazy-loaded chunks: Dashboard Restaurateur ──
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
const DashboardFactures = lazy(() => import("./pages/dashboard/DashboardFactures"));
const DashboardInvoiceSettings = lazy(() => import("./pages/dashboard/DashboardInvoiceSettings"));
const DashboardPhotos = lazy(() => import("./pages/dashboard/DashboardPhotos"));
const DashboardSupport = lazy(() => import("./pages/dashboard/DashboardSupport"));
const DashboardService = lazy(() => import("./pages/dashboard/DashboardService"));
const DashboardAdvisor = lazy(() => import("./pages/dashboard/DashboardAdvisor"));

// ── Lazy-loaded chunks: Courier App ──
const CourierHome = lazy(() => import("./pages/courier/CourierHome"));
const CourierJobs = lazy(() => import("./pages/courier/CourierJobs"));
const CourierEarnings = lazy(() => import("./pages/courier/CourierEarnings"));
const CourierProfile = lazy(() => import("./pages/courier/CourierProfile"));

// ── Lazy-loaded chunks: Admin Back-Office ──
const AdminHome = lazy(() => import("./pages/admin/AdminHome"));
const AdminRestaurants = lazy(() => import("./pages/admin/AdminRestaurants"));
const AdminUtilisateurs = lazy(() => import("./pages/admin/AdminUtilisateurs"));
const AdminAvis = lazy(() => import("./pages/admin/AdminAvis"));
const AdminCatalog = lazy(() => import("./pages/admin/AdminCatalog"));
const AdminLoyalty = lazy(() => import("./pages/admin/AdminLoyalty"));
const DropsManagement = lazy(() => import("./pages/admin/DropsManagement"));
const AdminNotifications = lazy(() => import("./pages/admin/AdminNotifications"));
const AdminAuditLogs = lazy(() => import("./pages/admin/AdminAuditLogs"));

const queryClient = new QueryClient();

function NativeIntegration() {
  const navigate = useNavigate();

  useEffect(() => {
    if (!isNative()) return;
    setupDeepLinks((path) => navigate(path));

    // Setup native push notification tap handler
    import("@/lib/push-native").then(({ setupNativePushListeners }) => {
      setupNativePushListeners((url) => navigate(url));
    });
  }, [navigate]);

  return null;
}

function FeatureSwitch({
  enabled,
  fallback = "/",
  children,
}: {
  enabled: boolean;
  fallback?: string;
  children: React.ReactNode;
}) {
  return enabled ? <>{children}</> : <Navigate to={fallback} replace />;
}

function AppShell() {
  const activeFeatures = useActiveFeatures();
  const commandesEnabled = activeFeatures.has("commandes");
  const antiWasteEnabled = activeFeatures.has("anti-gaspi");
  const flashSalesEnabled = activeFeatures.has("ventes-flash");
  const campaignsEnabled = activeFeatures.has("campagnes-pub");
  const performanceEnabled = activeFeatures.has("performances");
  const courierEnabled = activeFeatures.has("espace-livreur");

  return (
    <>
      <Navbar />
      <Suspense fallback={<div className="flex items-center justify-center min-h-screen"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" /></div>}>
        <Routes>
          <Route path="/" element={<Index />} />
          <Route path="/auth" element={<Auth />} />
          <Route path="/recherche" element={<Recherche />} />
          <Route path="/restaurant/:id" element={<RestaurantDetail />} />
          <Route path="/anti-gaspi" element={<FeatureSwitch enabled={antiWasteEnabled}><AntiGaspi /></FeatureSwitch>} />

          <Route path="/panier" element={<Panier />} />
          <Route path="/commandes" element={<ProtectedRoute><FeatureSwitch enabled={commandesEnabled} fallback="/"><Commandes /></FeatureSwitch></ProtectedRoute>} />
          <Route path="/commande/:id" element={<ProtectedRoute><SuiviCommande /></ProtectedRoute>} />
          <Route path="/reservations" element={<ProtectedRoute><Reservations /></ProtectedRoute>} />
          <Route path="/profil" element={<ProtectedRoute><Profil /></ProtectedRoute>} />
          <Route path="/notifications" element={<ProtectedRoute><Notifications /></ProtectedRoute>} />
          <Route path="/creneaux-garantis" element={<FeatureSwitch enabled={activeFeatures.has("creneaux-garantis")}><CreneauxGarantis /></FeatureSwitch>} />
          <Route path="/flex-prix-bas" element={<FeatureSwitch enabled={activeFeatures.has("flex-prix-bas")}><FlexPrixBas /></FeatureSwitch>} />
          <Route path="/match-groupes" element={<FeatureSwitch enabled={activeFeatures.has("match-groupes")}><MatchGroupes /></FeatureSwitch>} />
          <Route path="/multi-stop" element={<FeatureSwitch enabled={activeFeatures.has("multi-stop")}><MultiStop /></FeatureSwitch>} />
          <Route path="/multi-restaurant" element={<FeatureSwitch enabled={activeFeatures.has("multi-restaurant")}><MultiRestaurant /></FeatureSwitch>} />
          <Route path="/chefs-table" element={<FeatureSwitch enabled={activeFeatures.has("chefs-table")}><ChefsTable /></FeatureSwitch>} />
          <Route path="/zero-attente" element={<FeatureSwitch enabled={activeFeatures.has("zero-attente")}><ZeroAttente /></FeatureSwitch>} />
          <Route path="/garantie-qualite" element={<FeatureSwitch enabled={activeFeatures.has("garantie-qualite")}><GarantieQualite /></FeatureSwitch>} />
          <Route path="/budget-auto" element={<FeatureSwitch enabled={activeFeatures.has("budget-auto")}><BudgetAuto /></FeatureSwitch>} />
          <Route path="/abonnement" element={<FeatureSwitch enabled={activeFeatures.has("abonnement")}><Abonnement /></FeatureSwitch>} />
          <Route path="/points-cadeau" element={<ProtectedRoute><GiftPoints /></ProtectedRoute>} />
          <Route path="/ventes-flash" element={<FeatureSwitch enabled={flashSalesEnabled}><VentesFlash /></FeatureSwitch>} />
          <Route path="/dashboard" element={<DashboardRoute><DashboardHome /></DashboardRoute>} />
          <Route path="/dashboard/restaurant" element={<DashboardRoute><DashboardRestaurant /></DashboardRoute>} />
          <Route path="/dashboard/advisor" element={<DashboardRoute><DashboardAdvisor /></DashboardRoute>} />
          <Route path="/dashboard/menu" element={<DashboardRoute><DashboardMenu /></DashboardRoute>} />
          <Route path="/dashboard/reservations" element={<DashboardRoute><DashboardReservations /></DashboardRoute>} />
          <Route path="/dashboard/commandes" element={<DashboardRoute><FeatureSwitch enabled={commandesEnabled} fallback="/dashboard"><DashboardCommandes /></FeatureSwitch></DashboardRoute>} />
          <Route path="/dashboard/commandes-anti-gaspi" element={<DashboardRoute><FeatureSwitch enabled={antiWasteEnabled} fallback="/dashboard"><DashboardCommandes /></FeatureSwitch></DashboardRoute>} />
          <Route path="/dashboard/commandes-ventes-flash" element={<DashboardRoute><FeatureSwitch enabled={flashSalesEnabled} fallback="/dashboard"><DashboardCommandes /></FeatureSwitch></DashboardRoute>} />
          <Route path="/dashboard/recommandations" element={<DashboardRoute><DashboardRecommandations /></DashboardRoute>} />
          <Route path="/dashboard/performances" element={<DashboardRoute><FeatureSwitch enabled={performanceEnabled} fallback="/dashboard"><DashboardPerformances /></FeatureSwitch></DashboardRoute>} />
          <Route path="/dashboard/comparaison" element={<DashboardRoute><FeatureSwitch enabled={performanceEnabled} fallback="/dashboard"><DashboardComparaison /></FeatureSwitch></DashboardRoute>} />
          <Route path="/dashboard/avis" element={<DashboardRoute><DashboardAvis /></DashboardRoute>} />
          <Route path="/dashboard/compta" element={<Navigate to={performanceEnabled ? "/dashboard/performances" : "/dashboard"} replace />} />
          <Route path="/dashboard/factures" element={<DashboardRoute><DashboardFactures /></DashboardRoute>} />
          <Route path="/dashboard/factures/parametres" element={<DashboardRoute><DashboardInvoiceSettings /></DashboardRoute>} />
          <Route path="/dashboard/offres" element={<DashboardRoute><FeatureSwitch enabled={antiWasteEnabled} fallback="/dashboard"><DashboardOffres /></FeatureSwitch></DashboardRoute>} />
          <Route path="/dashboard/ventes-flash" element={<DashboardRoute><FeatureSwitch enabled={flashSalesEnabled} fallback="/dashboard"><DashboardVentesFlash /></FeatureSwitch></DashboardRoute>} />
          <Route path="/dashboard/formules" element={<DashboardRoute><DashboardFormules /></DashboardRoute>} />
          <Route path="/dashboard/photos" element={<DashboardRoute><DashboardPhotos /></DashboardRoute>} />
          <Route path="/dashboard/promotions" element={<DashboardRoute><DashboardPromotions /></DashboardRoute>} />
          <Route path="/dashboard/campagne-overview" element={<DashboardRoute><FeatureSwitch enabled={campaignsEnabled} fallback="/dashboard"><DashboardCampagneOverview /></FeatureSwitch></DashboardRoute>} />
          <Route path="/dashboard/reseaux-sociaux" element={<DashboardRoute><FeatureSwitch enabled={campaignsEnabled} fallback="/dashboard"><DashboardReseauxSociaux /></FeatureSwitch></DashboardRoute>} />
          <Route path="/dashboard/campagnes" element={<DashboardRoute><FeatureSwitch enabled={campaignsEnabled} fallback="/dashboard"><DashboardCampagnes /></FeatureSwitch></DashboardRoute>} />
          <Route path="/dashboard/support" element={<DashboardRoute><DashboardSupport /></DashboardRoute>} />
          <Route path="/dashboard/service" element={<DashboardRoute><DashboardService /></DashboardRoute>} />
          <Route path="/courier" element={<ProtectedRoute requiredRole="courier"><FeatureSwitch enabled={courierEnabled}><CourierHome /></FeatureSwitch></ProtectedRoute>} />
          <Route path="/courier/jobs" element={<ProtectedRoute requiredRole="courier"><FeatureSwitch enabled={courierEnabled}><CourierJobs /></FeatureSwitch></ProtectedRoute>} />
          <Route path="/courier/earnings" element={<ProtectedRoute requiredRole="courier"><FeatureSwitch enabled={courierEnabled}><CourierEarnings /></FeatureSwitch></ProtectedRoute>} />
          <Route path="/courier/profile" element={<ProtectedRoute requiredRole="courier"><FeatureSwitch enabled={courierEnabled}><CourierProfile /></FeatureSwitch></ProtectedRoute>} />
          <Route path="/admin" element={<ProtectedRoute requiredRole="admin"><AdminHome /></ProtectedRoute>} />
          <Route path="/admin/restaurants" element={<ProtectedRoute requiredRole="admin"><AdminRestaurants /></ProtectedRoute>} />
          <Route path="/admin/utilisateurs" element={<ProtectedRoute requiredRole="admin"><AdminUtilisateurs /></ProtectedRoute>} />
          <Route path="/admin/avis" element={<ProtectedRoute requiredRole="admin"><AdminAvis /></ProtectedRoute>} />
          <Route path="/admin/catalog" element={<ProtectedRoute requiredRole="admin"><AdminCatalog /></ProtectedRoute>} />
          <Route path="/admin/loyalty" element={<ProtectedRoute requiredRole="admin"><AdminLoyalty /></ProtectedRoute>} />
          <Route path="/admin/drops" element={<ProtectedRoute requiredRole="admin"><DropsManagement /></ProtectedRoute>} />
          <Route path="/admin/notifications" element={<ProtectedRoute requiredRole="admin"><AdminNotifications /></ProtectedRoute>} />
          <Route path="/admin/audit" element={<ProtectedRoute requiredRole="admin"><AdminAuditLogs /></ProtectedRoute>} />
          <Route path="/contact" element={<Contact />} />
          <Route path="/cgu" element={<CGU />} />
          <Route path="/politique-confidentialite" element={<PolitiqueConfidentialite />} />
          <Route path="/a-propos" element={<APropos />} />
          <Route path="/aide" element={<Aide />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </Suspense>
      <SupportChat />
      <OrderConflictDialog />
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
