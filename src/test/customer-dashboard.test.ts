import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const readSource = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("espace client central", () => {
  it("expose une route client protégée et des alias explicites", () => {
    const app = readSource("src/App.tsx");

    expect(app).toContain('const ClientDashboardHome = lazy(() => import("./pages/ClientDashboardHome"))');
    expect(app).toContain('const ClientReviews = lazy(() => import("./pages/ClientReviews"))');
    expect(app).toContain('path="/mon-espace"');
    expect(app).toContain('<ProtectedRoute requiredRole="client"><ClientDashboardHome /></ProtectedRoute>');
    expect(app).toContain('path="/compte" element={<Navigate to="/mon-espace" replace />}');
    expect(app).toContain('path="/mes-avis"');
  });

  it("centralise les outils utiles sans exposer les services désactivés", () => {
    const dashboard = readSource("src/pages/ClientDashboardHome.tsx");

    expect(dashboard).toContain('activeFeatures.has("reservation")');
    expect(dashboard).toContain('activeFeatures.has("commandes")');
    expect(dashboard).toContain('activeFeatures.has(action.feature)');
    expect(dashboard).toContain('.eq("user_id", user!.id)');
    expect(dashboard).toContain('from("favorites")');
    expect(dashboard).toContain('from("reviews")');
    expect(dashboard).toContain('to="/profil?tab=fidelite"');
    expect(dashboard).toContain('to="/contact"');
    expect(dashboard).not.toContain("SUPABASE_SERVICE_ROLE_KEY");
  });

  it("rend toute la navigation accessible sur mobile sans tableau horizontal", () => {
    const layout = readSource("src/components/CustomerDashboardLayout.tsx");

    expect(layout).toContain('aria-label="Navigation de l’espace client"');
    expect(layout).toContain("overflow-x-auto");
    expect(layout).toContain("snap-x");
    expect(layout).toContain('aria-current={active ? "page" : undefined}');
    expect(layout).toContain('to: "/profil?tab=favoris"');
    expect(layout).toContain('to: "/profil?tab=fidelite"');
    expect(layout).toContain('to: "/mes-avis"');
    expect(layout).toContain('fallback="/mon-espace"');
  });

  it("affiche les avis du seul utilisateur connecté et les réponses des restaurants", () => {
    const reviews = readSource("src/pages/ClientReviews.tsx");

    expect(reviews).toContain('from("reviews")');
    expect(reviews).toContain('.eq("user_id", user!.id)');
    expect(reviews).toContain("review_replies(id, reply_text, author_type, created_at)");
    expect(reviews).toContain("Impossible de charger vos avis");
    expect(reviews).toContain("Aucun avis pour le moment");
  });

  it("fait du dashboard la destination du rôle client", () => {
    const roleAccess = readSource("src/lib/roleAccess.ts");
    const navbar = readSource("src/components/Navbar.tsx");

    expect(roleAccess).toContain('client: "/mon-espace"');
    expect(navbar).toContain('<Link to="/mon-espace">Mon espace</Link>');
    expect(navbar).toContain('to="/mon-espace" className="flex items-center gap-2');
  });

  it("ferme les écritures client qui pouvaient contourner les workflows", () => {
    const security = readSource("supabase/migrations/20260712061702_harden_client_dashboard_boundaries.sql");
    const stripeHardening = readSource("supabase/migrations/20260711120000_audit_security_hardening.sql");
    const publicHome = readSource("src/pages/Index.tsx");

    expect(security).toContain("revoke insert, update, delete, truncate on public.profiles from public, anon, authenticated");
    expect(security).toContain("revoke insert, update, delete, truncate on public.gift_points from public, anon, authenticated");
    expect(security).toContain("revoke insert, update, delete, truncate on public.loyalty_transactions from public, anon, authenticated");
    expect(security).toContain("revoke insert, update, delete, truncate on public.user_profiles from public, anon, authenticated");
    expect(security).toContain('drop policy if exists "Anyone can view solidarity donations"');
    expect(security).toContain("revoke select on public.solidarity_donations from public, anon, authenticated");
    expect(security).toContain('drop policy if exists "Users manage own orders" on public.orders');
    expect(security).toContain('drop policy if exists "Users manage own reservations" on public.reservations');
    expect(security).toContain('create policy "user_profiles_self_select"');
    expect(security).toContain("create or replace function public.update_client_profile");
    expect(security).toContain("create or replace function public.send_gift_points_v2");
    expect(security).toContain("create or replace function public.claim_gift_points_v2");
    expect(security).toContain("'miamz_bonus_points', 0");
    expect(security).toContain("at time zone 'Europe/Zurich'");
    expect(publicHome).toContain('rpc("get_total_donated_points")');
    expect(publicHome).not.toContain('from("solidarity_donations"');
    expect(stripeHardening).toContain("DO $$");
    expect(stripeHardening).toContain("to_regprocedure('stripe.set_updated_at()')");
  });

  it("crédite les Miamz à la livraison ou à la présence, jamais au pending", () => {
    const lifecycle = readSource("supabase/migrations/20260712061703_fix_miamz_reward_lifecycle.sql");
    const reservationDialog = readSource("src/components/ReservationDialog.tsx");

    expect(lifecycle).toContain("v_status in ('delivered', 'completed')");
    expect(lifecycle).toContain("v_payment_status in ('paid', 'captured')");
    expect(lifecycle).toContain("v_status in ('arrived', 'seated', 'completed')");
    expect(lifecycle).toContain("after insert or update of status, payment_status");
    expect(lifecycle).toContain("reverses_transaction_id");
    expect(lifecycle).toContain("reinstates_transaction_id");
    expect(lifecycle).toContain("migration_reward_not_yet_eligible");
    expect(lifecycle).toContain("lock table public.profiles in access exclusive mode");
    expect(lifecycle).toContain("lock table public.orders, public.reservations in share row exclusive mode");
    expect(lifecycle).toContain("v_effective_multiplier := least(5");
    expect(lifecycle).not.toContain("new.status = 'pending'");
    expect(reservationDialog).toContain("donate_earned_xp: donatePoints");
    expect(reservationDialog).not.toContain('("donate_points_for_meal"');
  });

  it("n’invente plus de stock, de compteur ou d’urgence commerciale", () => {
    const flash = readSource("src/pages/VentesFlash.tsx");
    const antiWaste = readSource("src/pages/AntiGaspi.tsx");
    const card = readSource("src/components/AntiWasteCard.tsx");

    expect(flash).toContain("parseBusinessDateTime");
    expect(flash).not.toContain("getTargetFromMinutes");
    expect(flash).not.toContain("Ventes flash réservées");
    expect(antiWaste).not.toContain("942kg");
    expect(antiWaste).toContain("portionsAvailable");
    expect(card).toContain("quantityInCart");
    expect(card).toContain("offerImage?.trim()");
    expect(card).not.toContain("return <Link to={`/restaurant/${restaurantId}`} className=\"group block\">{content}</Link>");
  });

  it("refuse Match groupes désactivé et recalcule toujours les prix côté serveur", () => {
    const authorization = readSource("supabase/functions/authorize-match-group-order/index.ts");

    expect(authorization).toContain('.eq("name", "match-groupes")');
    expect(authorization).toContain('featureFlag?.is_active !== true');
    expect(authorization).toContain('.from("menu_items")');
    expect(authorization).toContain('menuItem.restaurant_id !== order.restaurant_id');
    expect(authorization).toContain("canonicalSubtotal");
    expect(authorization).toContain("authorization_amount: canonicalSubtotal");
    expect(authorization).not.toContain("unit_amount: cents(item.original_price)");
  });
});
