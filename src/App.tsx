import { lazy, Suspense } from "react";
import ErrorBoundary from "@/components/ErrorBoundary";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Outlet } from "react-router-dom";
import { AuthProvider } from "@/lib/auth";
import { CartProvider } from "@/lib/cart";
import Navbar from "@/components/Navbar";
import ProtectedRoute from "@/components/ProtectedRoute";
import ScrollToTop from "@/components/ScrollToTop";
import { OwnerRestaurantProvider } from "./pages/dashboard/OwnerRestaurantContext";
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
const DashboardCompta = lazy(() => import("./pages/dashboard/DashboardCompta"));
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

const queryClient = new QueryClient();

function DashboardOwnerScope() {
  return (
    <ProtectedRoute requiredRole="restaurateur">
      <OwnerRestaurantProvider>
        <Outlet />
      </OwnerRestaurantProvider>
    </ProtectedRoute>
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
          <AuthProvider>
            <CartProvider>
              <Navbar />
              <Suspense fallback={<div className="flex items-center justify-center min-h-screen"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" /></div>}>
                <Routes>
                  <Route path="/" element={<Index />} />
                  <Route path="/auth" element={<Auth />} />
                  <Route path="/recherche" element={<Recherche />} />
                  <Route path="/restaurant/:id" element={<RestaurantDetail />} />
                  <Route path="/anti-gaspi" element={<AntiGaspi />} />

                  <Route path="/panier" element={<Panier />} />
                  <Route path="/commandes" element={<ProtectedRoute><Commandes /></ProtectedRoute>} />
                  <Route path="/commande/:id" element={<ProtectedRoute><SuiviCommande /></ProtectedRoute>} />
                  <Route path="/reservations" element={<ProtectedRoute><Reservations /></ProtectedRoute>} />
                  <Route path="/profil" element={<ProtectedRoute><Profil /></ProtectedRoute>} />
                  <Route path="/notifications" element={<ProtectedRoute><Notifications /></ProtectedRoute>} />
                  {/* New features */}
                  <Route path="/creneaux-garantis" element={<CreneauxGarantis />} />
                  <Route path="/flex-prix-bas" element={<FlexPrixBas />} />
                  <Route path="/match-groupes" element={<MatchGroupes />} />
                  <Route path="/multi-stop" element={<MultiStop />} />
                  <Route path="/multi-restaurant" element={<MultiRestaurant />} />
                  <Route path="/chefs-table" element={<ChefsTable />} />
                  <Route path="/zero-attente" element={<ZeroAttente />} />
                  <Route path="/garantie-qualite" element={<GarantieQualite />} />
                  <Route path="/budget-auto" element={<BudgetAuto />} />
                  <Route path="/abonnement" element={<Abonnement />} />
                  <Route path="/points-cadeau" element={<ProtectedRoute><GiftPoints /></ProtectedRoute>} />
                  <Route path="/ventes-flash" element={<VentesFlash />} />
                  {/* Dashboard restaurateur */}
                  <Route path="/dashboard" element={<DashboardOwnerScope />}>
                    <Route index element={<DashboardHome />} />
                    <Route path="restaurant" element={<DashboardRestaurant />} />
                    <Route path="advisor" element={<DashboardAdvisor />} />
                    <Route path="menu" element={<DashboardMenu />} />
                    <Route path="reservations" element={<DashboardReservations />} />
                    <Route path="commandes" element={<DashboardCommandes />} />
                    <Route path="recommandations" element={<DashboardRecommandations />} />
                    <Route path="performances" element={<DashboardPerformances />} />
                    <Route path="comparaison" element={<DashboardComparaison />} />
                    <Route path="avis" element={<DashboardAvis />} />
                    <Route path="compta" element={<DashboardCompta />} />
                    <Route path="factures" element={<DashboardFactures />} />
                    <Route path="factures/parametres" element={<DashboardInvoiceSettings />} />
                    <Route path="offres" element={<DashboardOffres />} />
                    <Route path="ventes-flash" element={<DashboardVentesFlash />} />
                    <Route path="formules" element={<DashboardFormules />} />
                    <Route path="photos" element={<DashboardPhotos />} />
                    <Route path="promotions" element={<DashboardPromotions />} />
                    <Route path="campagne-overview" element={<DashboardCampagneOverview />} />
                    <Route path="reseaux-sociaux" element={<DashboardReseauxSociaux />} />
                    <Route path="campagnes" element={<DashboardCampagnes />} />
                    <Route path="support" element={<DashboardSupport />} />
                    <Route path="service" element={<DashboardService />} />
                  </Route>
                  {/* Courier App */}
                  <Route path="/courier" element={<ProtectedRoute requiredRole="courier"><CourierHome /></ProtectedRoute>} />
                  <Route path="/courier/jobs" element={<ProtectedRoute requiredRole="courier"><CourierJobs /></ProtectedRoute>} />
                  <Route path="/courier/earnings" element={<ProtectedRoute requiredRole="courier"><CourierEarnings /></ProtectedRoute>} />
                  <Route path="/courier/profile" element={<ProtectedRoute requiredRole="courier"><CourierProfile /></ProtectedRoute>} />
                  {/* Admin */}
                  <Route path="/admin" element={<ProtectedRoute requiredRole="admin"><AdminHome /></ProtectedRoute>} />
                  <Route path="/admin/restaurants" element={<ProtectedRoute requiredRole="admin"><AdminRestaurants /></ProtectedRoute>} />
                  <Route path="/admin/utilisateurs" element={<ProtectedRoute requiredRole="admin"><AdminUtilisateurs /></ProtectedRoute>} />
                  <Route path="/admin/avis" element={<ProtectedRoute requiredRole="admin"><AdminAvis /></ProtectedRoute>} />
                  <Route path="/admin/catalog" element={<ProtectedRoute requiredRole="admin"><AdminCatalog /></ProtectedRoute>} />
                  <Route path="/admin/loyalty" element={<ProtectedRoute requiredRole="admin"><AdminLoyalty /></ProtectedRoute>} />
                  <Route path="/admin/drops" element={<ProtectedRoute requiredRole="admin"><DropsManagement /></ProtectedRoute>} />
                  <Route path="/admin/notifications" element={<ProtectedRoute requiredRole="admin"><AdminNotifications /></ProtectedRoute>} />
                  <Route path="/contact" element={<Contact />} />
                  <Route path="/cgu" element={<CGU />} />
                  <Route path="/a-propos" element={<APropos />} />
                  <Route path="/aide" element={<Aide />} />
                  <Route path="*" element={<NotFound />} />
                </Routes>
              </Suspense>
              <SupportChat />
              <OrderConflictDialog />
            </CartProvider>
          </AuthProvider>
        </BrowserRouter>
      </TooltipProvider>
    </QueryClientProvider>
  </ErrorBoundary>
);

export default App;
