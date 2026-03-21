import { lazy, Suspense, useEffect } from "react";
import { BrowserRouter, Navigate, Route, Routes, useNavigate } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import ErrorBoundary from "@/components/ErrorBoundary";
import Navbar from "@/components/Navbar";
import ProtectedRoute from "@/components/ProtectedRoute";
import DashboardRoute from "@/components/DashboardRoute";
import ScrollToTop from "@/components/ScrollToTop";
import SupportChat from "@/components/SupportChat";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/lib/auth";
import { CartProvider } from "@/lib/cart";
import { setupDeepLinks } from "@/lib/deep-links";
import { isNative } from "@/lib/platform";

import Index from "./pages/Index";
import Auth from "./pages/Auth";
import Recherche from "./pages/Recherche";
import RestaurantDetail from "./pages/RestaurantDetail";
import Reservations from "./pages/Reservations";
import Profil from "./pages/Profil";
import Notifications from "./pages/Notifications";
import NotFound from "./pages/NotFound";
import Contact from "./pages/Contact";
import CGU from "./pages/CGU";
import APropos from "./pages/APropos";
import Aide from "./pages/Aide";

const DashboardRestaurant = lazy(() => import("./pages/dashboard/DashboardRestaurant"));
const DashboardReservations = lazy(() => import("./pages/dashboard/DashboardReservations"));
const DashboardPhotos = lazy(() => import("./pages/dashboard/DashboardPhotos"));
const DashboardSupport = lazy(() => import("./pages/dashboard/DashboardSupport"));
const DashboardService = lazy(() => import("./pages/dashboard/DashboardService"));

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

    import("@/lib/push-native").then(({ setupNativePushListeners }) => {
      setupNativePushListeners((url) => navigate(url));
    });
  }, [navigate]);

  return null;
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
              <Navbar />
              <Suspense
                fallback={
                  <div className="flex min-h-screen items-center justify-center">
                    <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-primary" />
                  </div>
                }
              >
                <Routes>
                  <Route path="/" element={<Index />} />
                  <Route path="/auth" element={<Auth />} />
                  <Route path="/recherche" element={<Recherche />} />
                  <Route path="/restaurant/:id" element={<RestaurantDetail />} />
                  <Route path="/reservations" element={<ProtectedRoute><Reservations /></ProtectedRoute>} />
                  <Route path="/profil" element={<ProtectedRoute><Profil /></ProtectedRoute>} />
                  <Route path="/notifications" element={<ProtectedRoute><Notifications /></ProtectedRoute>} />

                  <Route path="/anti-gaspi" element={<Navigate to="/recherche" replace />} />
                  <Route path="/panier" element={<Navigate to="/recherche" replace />} />
                  <Route path="/commandes" element={<ProtectedRoute><Navigate to="/reservations" replace /></ProtectedRoute>} />
                  <Route path="/commande/:id" element={<ProtectedRoute><Navigate to="/reservations" replace /></ProtectedRoute>} />
                  <Route path="/creneaux-garantis" element={<Navigate to="/recherche" replace />} />
                  <Route path="/flex-prix-bas" element={<Navigate to="/recherche" replace />} />
                  <Route path="/match-groupes" element={<Navigate to="/recherche" replace />} />
                  <Route path="/multi-stop" element={<Navigate to="/recherche" replace />} />
                  <Route path="/multi-restaurant" element={<Navigate to="/recherche" replace />} />
                  <Route path="/chefs-table" element={<Navigate to="/recherche" replace />} />
                  <Route path="/zero-attente" element={<Navigate to="/recherche" replace />} />
                  <Route path="/garantie-qualite" element={<Navigate to="/recherche" replace />} />
                  <Route path="/budget-auto" element={<Navigate to="/recherche" replace />} />
                  <Route path="/abonnement" element={<Navigate to="/recherche" replace />} />
                  <Route path="/points-cadeau" element={<ProtectedRoute><Navigate to="/reservations" replace /></ProtectedRoute>} />
                  <Route path="/ventes-flash" element={<Navigate to="/recherche" replace />} />

                  <Route path="/dashboard" element={<DashboardRoute><Navigate to="/dashboard/reservations" replace /></DashboardRoute>} />
                  <Route path="/dashboard/restaurant" element={<DashboardRoute><DashboardRestaurant /></DashboardRoute>} />
                  <Route path="/dashboard/reservations" element={<DashboardRoute><DashboardReservations /></DashboardRoute>} />
                  <Route path="/dashboard/photos" element={<DashboardRoute><DashboardPhotos /></DashboardRoute>} />
                  <Route path="/dashboard/support" element={<DashboardRoute><DashboardSupport /></DashboardRoute>} />
                  <Route path="/dashboard/service" element={<DashboardRoute><DashboardService /></DashboardRoute>} />

                  <Route path="/dashboard/advisor" element={<DashboardRoute><Navigate to="/dashboard/reservations" replace /></DashboardRoute>} />
                  <Route path="/dashboard/menu" element={<DashboardRoute><Navigate to="/dashboard/restaurant" replace /></DashboardRoute>} />
                  <Route path="/dashboard/commandes" element={<DashboardRoute><Navigate to="/dashboard/reservations" replace /></DashboardRoute>} />
                  <Route path="/dashboard/recommandations" element={<DashboardRoute><Navigate to="/dashboard/reservations" replace /></DashboardRoute>} />
                  <Route path="/dashboard/performances" element={<DashboardRoute><Navigate to="/dashboard/reservations" replace /></DashboardRoute>} />
                  <Route path="/dashboard/comparaison" element={<DashboardRoute><Navigate to="/dashboard/reservations" replace /></DashboardRoute>} />
                  <Route path="/dashboard/avis" element={<DashboardRoute><Navigate to="/dashboard/reservations" replace /></DashboardRoute>} />
                  <Route path="/dashboard/compta" element={<Navigate to="/dashboard/reservations" replace />} />
                  <Route path="/dashboard/factures" element={<DashboardRoute><Navigate to="/dashboard/reservations" replace /></DashboardRoute>} />
                  <Route path="/dashboard/factures/parametres" element={<DashboardRoute><Navigate to="/dashboard/reservations" replace /></DashboardRoute>} />
                  <Route path="/dashboard/offres" element={<DashboardRoute><Navigate to="/dashboard/reservations" replace /></DashboardRoute>} />
                  <Route path="/dashboard/ventes-flash" element={<DashboardRoute><Navigate to="/dashboard/reservations" replace /></DashboardRoute>} />
                  <Route path="/dashboard/formules" element={<DashboardRoute><Navigate to="/dashboard/reservations" replace /></DashboardRoute>} />
                  <Route path="/dashboard/promotions" element={<DashboardRoute><Navigate to="/dashboard/reservations" replace /></DashboardRoute>} />
                  <Route path="/dashboard/campagne-overview" element={<DashboardRoute><Navigate to="/dashboard/reservations" replace /></DashboardRoute>} />
                  <Route path="/dashboard/reseaux-sociaux" element={<DashboardRoute><Navigate to="/dashboard/reservations" replace /></DashboardRoute>} />
                  <Route path="/dashboard/campagnes" element={<DashboardRoute><Navigate to="/dashboard/reservations" replace /></DashboardRoute>} />

                  <Route path="/courier" element={<Navigate to="/" replace />} />
                  <Route path="/courier/jobs" element={<Navigate to="/" replace />} />
                  <Route path="/courier/earnings" element={<Navigate to="/" replace />} />
                  <Route path="/courier/profile" element={<Navigate to="/" replace />} />

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
                  <Route path="/a-propos" element={<APropos />} />
                  <Route path="/aide" element={<Aide />} />
                  <Route path="*" element={<NotFound />} />
                </Routes>
              </Suspense>
              <SupportChat />
            </CartProvider>
          </AuthProvider>
        </BrowserRouter>
      </TooltipProvider>
    </QueryClientProvider>
  </ErrorBoundary>
);

export default App;
