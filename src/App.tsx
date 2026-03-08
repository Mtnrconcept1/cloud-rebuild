import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/lib/auth";
import { CartProvider } from "@/lib/cart";
import Navbar from "@/components/Navbar";
import ProtectedRoute from "@/components/ProtectedRoute";
import ScrollToTop from "@/components/ScrollToTop";
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
import DashboardHome from "./pages/dashboard/DashboardHome";
import DashboardRestaurant from "./pages/dashboard/DashboardRestaurant";
import DashboardMenu from "./pages/dashboard/DashboardMenu";
import DashboardReservations from "./pages/dashboard/DashboardReservations";
import DashboardCommandes from "./pages/dashboard/DashboardCommandes";
import DashboardOffres from "./pages/dashboard/DashboardOffres";
import DashboardVentesFlash from "./pages/dashboard/DashboardVentesFlash";
import DashboardFormules from "./pages/dashboard/DashboardFormules";
import DashboardCompta from "./pages/dashboard/DashboardCompta";
import DashboardCampagnes from "./pages/dashboard/DashboardCampagnes";
import DashboardRecommandations from "./pages/dashboard/DashboardRecommandations";
import DashboardPerformances from "./pages/dashboard/DashboardPerformances";
import DashboardComparaison from "./pages/dashboard/DashboardComparaison";
import DashboardAvis from "./pages/dashboard/DashboardAvis";
import DashboardPromotions from "./pages/dashboard/DashboardPromotions";
import DashboardCampagneOverview from "./pages/dashboard/DashboardCampagneOverview";
import DashboardReseauxSociaux from "./pages/dashboard/DashboardReseauxSociaux";
import DashboardFactures from "./pages/dashboard/DashboardFactures";
import DashboardInvoiceSettings from "./pages/dashboard/DashboardInvoiceSettings";
import DashboardPhotos from "./pages/dashboard/DashboardPhotos";
import DashboardSupport from "./pages/dashboard/DashboardSupport";
import DashboardService from "./pages/dashboard/DashboardService";
import SuiviCommande from "./pages/SuiviCommande";
import AdminHome from "./pages/admin/AdminHome";
import AdminRestaurants from "./pages/admin/AdminRestaurants";
import AdminUtilisateurs from "./pages/admin/AdminUtilisateurs";
import AdminAvis from "./pages/admin/AdminAvis";
import DropsManagement from "./pages/admin/DropsManagement";
import AdminNotifications from "./pages/admin/AdminNotifications";
import NotFound from "./pages/NotFound";
import Contact from "./pages/Contact";
import CGU from "./pages/CGU";
import APropos from "./pages/APropos";
import Aide from "./pages/Aide";
import SupportChat from "./components/SupportChat";
// New features
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
import OrderConflictDialog from "./components/OrderConflictDialog";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <ScrollToTop />
        <AuthProvider>
          <CartProvider>
            <Navbar />
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
              <Route path="/dashboard" element={<ProtectedRoute requiredRole="restaurateur"><DashboardHome /></ProtectedRoute>} />
              <Route path="/dashboard/restaurant" element={<ProtectedRoute requiredRole="restaurateur"><DashboardRestaurant /></ProtectedRoute>} />
              <Route path="/dashboard/menu" element={<ProtectedRoute requiredRole="restaurateur"><DashboardMenu /></ProtectedRoute>} />
              <Route path="/dashboard/reservations" element={<ProtectedRoute requiredRole="restaurateur"><DashboardReservations /></ProtectedRoute>} />
              <Route path="/dashboard/commandes" element={<ProtectedRoute requiredRole="restaurateur"><DashboardCommandes /></ProtectedRoute>} />
              <Route path="/dashboard/recommandations" element={<ProtectedRoute requiredRole="restaurateur"><DashboardRecommandations /></ProtectedRoute>} />
              <Route path="/dashboard/performances" element={<ProtectedRoute requiredRole="restaurateur"><DashboardPerformances /></ProtectedRoute>} />
              <Route path="/dashboard/comparaison" element={<ProtectedRoute requiredRole="restaurateur"><DashboardComparaison /></ProtectedRoute>} />
              <Route path="/dashboard/avis" element={<ProtectedRoute requiredRole="restaurateur"><DashboardAvis /></ProtectedRoute>} />
              <Route path="/dashboard/compta" element={<ProtectedRoute requiredRole="restaurateur"><DashboardCompta /></ProtectedRoute>} />
              <Route path="/dashboard/factures" element={<ProtectedRoute requiredRole="restaurateur"><DashboardFactures /></ProtectedRoute>} />
              <Route path="/dashboard/factures/parametres" element={<ProtectedRoute requiredRole="restaurateur"><DashboardInvoiceSettings /></ProtectedRoute>} />
              <Route path="/dashboard/offres" element={<ProtectedRoute requiredRole="restaurateur"><DashboardOffres /></ProtectedRoute>} />
              <Route path="/dashboard/ventes-flash" element={<ProtectedRoute requiredRole="restaurateur"><DashboardVentesFlash /></ProtectedRoute>} />
              <Route path="/dashboard/formules" element={<ProtectedRoute requiredRole="restaurateur"><DashboardFormules /></ProtectedRoute>} />
              <Route path="/dashboard/photos" element={<ProtectedRoute requiredRole="restaurateur"><DashboardPhotos /></ProtectedRoute>} />
              <Route path="/dashboard/promotions" element={<ProtectedRoute requiredRole="restaurateur"><DashboardPromotions /></ProtectedRoute>} />
              <Route path="/dashboard/campagne-overview" element={<ProtectedRoute requiredRole="restaurateur"><DashboardCampagneOverview /></ProtectedRoute>} />
              <Route path="/dashboard/reseaux-sociaux" element={<ProtectedRoute requiredRole="restaurateur"><DashboardReseauxSociaux /></ProtectedRoute>} />
              <Route path="/dashboard/campagnes" element={<ProtectedRoute requiredRole="restaurateur"><DashboardCampagnes /></ProtectedRoute>} />
              <Route path="/dashboard/support" element={<ProtectedRoute requiredRole="restaurateur"><DashboardSupport /></ProtectedRoute>} />
              <Route path="/dashboard/service" element={<ProtectedRoute requiredRole="restaurateur"><DashboardService /></ProtectedRoute>} />
              {/* Admin */}
              <Route path="/admin" element={<ProtectedRoute requiredRole="admin"><AdminHome /></ProtectedRoute>} />
              <Route path="/admin/restaurants" element={<ProtectedRoute requiredRole="admin"><AdminRestaurants /></ProtectedRoute>} />
              <Route path="/admin/utilisateurs" element={<ProtectedRoute requiredRole="admin"><AdminUtilisateurs /></ProtectedRoute>} />
              <Route path="/admin/avis" element={<ProtectedRoute requiredRole="admin"><AdminAvis /></ProtectedRoute>} />
              <Route path="/admin/drops" element={<ProtectedRoute requiredRole="admin"><DropsManagement /></ProtectedRoute>} />
              <Route path="/admin/notifications" element={<ProtectedRoute requiredRole="admin"><AdminNotifications /></ProtectedRoute>} />
              <Route path="/contact" element={<Contact />} />
              <Route path="/cgu" element={<CGU />} />
              <Route path="/a-propos" element={<APropos />} />
              <Route path="/aide" element={<Aide />} />
              <Route path="*" element={<NotFound />} />
            </Routes>
            <SupportChat />
            <OrderConflictDialog />
          </CartProvider>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;