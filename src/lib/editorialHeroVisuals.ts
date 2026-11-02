import {
  getCustomerDashboardVisual,
  getRestaurantDashboardVisual,
} from "@/lib/dashboardVisuals";

const editorialRouteHeroes: Record<string, string> = {
  "/admin": "/images/tok-refonte/heroes/admin-platform.webp",
  "/admin/platform": "/images/dashboard-3d/analytics.webp",
  "/admin/restaurants": "/images/dashboard-3d/admin-restaurants.webp",
  "/admin/equipe": "/images/dashboard-3d/restaurant-service.webp",
  "/admin/restaurants/google-business": "/images/dashboard-3d/restaurant-profile.webp",
  "/admin/utilisateurs": "/images/dashboard-3d/admin-users.webp",
  "/admin/avis": "/images/dashboard-3d/restaurant-reviews.webp",
  "/admin/catalog": "/images/dashboard-3d/admin-catalog.webp",
  "/admin/loyalty": "/images/dashboard-3d/admin-loyalty.webp",
  "/admin/drops": "/images/dashboard-3d/creations.webp",
  "/admin/notifications": "/images/dashboard-3d/marketing.webp",
  "/admin/actualites": "/images/dashboard-3d/restaurant-news.webp",
  "/admin/crm": "/images/dashboard-3d/restaurant-crm.webp",
  "/admin/audit": "/images/dashboard-3d/admin-audit.webp",
  "/admin/packs": "/images/dashboard-3d/restaurant-pack.webp",
  "/admin/compta": "/images/dashboard-3d/commercial-accounting-empty.webp",
  "/admin/tok-printer": "/images/tok-refonte/heroes/admin-printer.webp",
  "/admin/compta/entrees": "/images/dashboard-3d/client-orders-empty.webp",
  "/admin/compta/sorties": "/images/dashboard-3d/gallery.webp",
  "/admin/compta/ia": "/images/dashboard-3d/photo-add.webp",
  "/admin/commandes-reservations": "/images/dashboard-3d/admin-operations.webp",
  "/admin/sinistres": "/images/dashboard-3d/admin-incidents.webp",
  "/admin/support-resolution": "/images/tok-refonte/heroes/admin-support.webp",
  "/admin/guardian": "/images/tok-refonte/heroes/admin-guardian.webp",
  "/admin/security-center": "/images/tok-refonte/heroes/admin-security.webp",
  "/admin/ai-operations": "/images/dashboard-3d/admin-ai-operations.webp",
  "/admin/guide": "/images/tok-refonte/heroes/admin-guide.webp",
  "/admin/tok-connect": "/images/tok-refonte/heroes/admin-tok-connect.webp",
  "/commercial": "/images/tok-refonte/heroes/commercial-prospection.webp",
  "/commercial/comptabilite": "/images/tok-refonte/heroes/commercial-accounting.webp",
  "/commercial/demo-live": "/images/tok-refonte/heroes/commercial-multispace.webp",
  "/courier": "/images/tok-refonte/heroes/courier-operations.webp",
};

function normalizePath(pathname: string) {
  const normalized = pathname.replace(/\/$/, "");
  return normalized || "/";
}

export function getEditorialHeroVisual(pathname: string, search = "") {
  const normalizedPath = normalizePath(pathname);
  return getRestaurantDashboardVisual(normalizedPath)?.hero
    ?? getCustomerDashboardVisual(normalizedPath, search)?.hero
    ?? editorialRouteHeroes[normalizedPath];
}

export const EDITORIAL_ROUTE_HEROES = editorialRouteHeroes;
