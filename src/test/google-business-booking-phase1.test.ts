import { existsSync, readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const root = process.cwd();

function read(relativePath: string) {
  const absolutePath = resolve(root, relativePath);
  expect(existsSync(absolutePath), `${relativePath} should exist`).toBe(true);
  return readFileSync(absolutePath, "utf8");
}

function readLatestMigrationContaining(pattern: string) {
  const migrationsDir = resolve(root, "supabase/migrations");
  const migrationName = readdirSync(migrationsDir)
    .filter((name) => name.endsWith(".sql"))
    .sort()
    .reverse()
    .find((name) => readFileSync(resolve(migrationsDir, name), "utf8").includes(pattern));

  expect(migrationName, `a migration containing ${pattern} should exist`).toBeTruthy();
  return readFileSync(resolve(migrationsDir, migrationName!), "utf8");
}

function extractFunction(sql: string, functionName: string) {
  const escaped = functionName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = sql.match(new RegExp(`CREATE OR REPLACE FUNCTION public\\.${escaped}[\\s\\S]*?\\$\\$;`, "i"));
  expect(match, `function ${functionName} should exist`).toBeTruthy();
  return match?.[0] || "";
}

describe("Google Business booking button phase 1", () => {
  it("adds a protected setup table, event table and controlled RPC access", () => {
    const sql = readLatestMigrationContaining("restaurant_google_booking_setup");

    expect(sql).toContain("CREATE TABLE IF NOT EXISTS public.restaurant_google_booking_setup");
    expect(sql).toContain("restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE");
    expect(sql).toContain("booking_slug text NOT NULL");
    expect(sql).toContain("tok_booking_url text NOT NULL");
    expect(sql).toContain("UNIQUE (restaurant_id)");
    expect(sql).toContain("UNIQUE (booking_slug)");
    expect(sql).toContain("google_booking_status text NOT NULL DEFAULT 'not_configured'");
    expect(sql).toContain("'not_configured'");
    expect(sql).toContain("'link_copied'");
    expect(sql).toContain("'in_progress'");
    expect(sql).toContain("'configured'");
    expect(sql).toContain("'problem'");
    expect(sql).toContain("needs_google_help boolean NOT NULL DEFAULT false");
    expect(sql).toContain("confirmation_screenshot_url text");
    expect(sql).toContain("admin_notes text");
    expect(sql).toContain("CHECK (google_business_url IS NULL OR google_business_url ~* '^https://')");

    expect(sql).toContain("CREATE TABLE IF NOT EXISTS public.restaurant_google_booking_events");
    expect(sql).toContain("'google_booking_link_copied'");
    expect(sql).toContain("'google_booking_help_requested'");
    expect(sql).toContain("'google_booking_configured_confirmed'");
    expect(sql).toContain("'google_booking_link_clicked'");
    expect(sql).toContain("'google_booking_reservation_started'");
    expect(sql).toContain("'google_booking_reservation_completed'");

    expect(sql).toContain("ALTER TABLE public.restaurant_google_booking_setup ENABLE ROW LEVEL SECURITY");
    expect(sql).toContain("ALTER TABLE public.restaurant_google_booking_events ENABLE ROW LEVEL SECURITY");
    expect(sql).toContain("REVOKE ALL ON public.restaurant_google_booking_setup FROM anon, authenticated");
    expect(sql).toContain("REVOKE ALL ON public.restaurant_google_booking_events FROM anon, authenticated");

    const ownerReadRpc = extractFunction(sql, "restaurant_get_google_booking_setup");
    expect(ownerReadRpc).not.toContain("admin_notes");

    expect(sql).toContain("CREATE OR REPLACE FUNCTION public.restaurant_update_google_booking_setup");
    expect(sql).toContain("CREATE OR REPLACE FUNCTION public.admin_list_google_booking_setups");
    expect(sql).toContain("CREATE OR REPLACE FUNCTION public.admin_update_google_booking_setup");
    expect(sql).toContain("CREATE OR REPLACE FUNCTION public.resolve_google_booking_slug");
    expect(sql).toContain("CREATE OR REPLACE FUNCTION public.track_google_booking_event");
    expect(sql).toContain("REVOKE ALL ON FUNCTION public.track_google_booking_event(uuid, text, jsonb) FROM PUBLIC");
    expect(sql).toContain("GRANT EXECUTE ON FUNCTION public.track_google_booking_event(uuid, text, jsonb) TO anon, authenticated");
  });

  it("wires the public short route to reservation opening and Google tracking", () => {
    const app = read("src/App.tsx");
    const redirectPage = read("src/pages/RestaurantBookingRedirect.tsx");
    const restaurantDetail = read("src/pages/RestaurantDetail.tsx");
    const reservationDialog = read("src/components/ReservationDialog.tsx");

    expect(app).toContain('const RestaurantBookingRedirect = lazy(() => import("./pages/RestaurantBookingRedirect"))');
    expect(app).toContain('<Route path="/r/:slug" element={<ClientSurfaceRoute><RestaurantBookingRedirect /></ClientSurfaceRoute>} />');

    expect(redirectPage).toContain("resolve_google_booking_slug");
    expect(redirectPage).toContain("trackGoogleBookingEvent");
    expect(redirectPage).toContain('"google_booking_link_clicked"');
    expect(redirectPage).toContain("open=reservation");
    expect(redirectPage).toContain("utm_source=google_business");
    expect(redirectPage).toContain("Restaurant indisponible");

    expect(restaurantDetail).toContain('searchParams.get("open")');
    expect(restaurantDetail).toContain('"google_booking_reservation_started"');
    expect(reservationDialog).toContain('"google_booking_reservation_completed"');
  });

  it("adds the restaurateur dashboard card with copy, guide, confirmation and help actions", () => {
    const dashboard = read("src/pages/dashboard/DashboardHome.tsx");
    const component = read("src/components/dashboard/GoogleBusinessBookingCard.tsx");
    const hooks = read("src/hooks/useGoogleBusinessBooking.ts");
    const helpers = read("src/lib/googleBusinessBooking.ts");

    expect(dashboard).toContain("GoogleBusinessBookingCard");
    expect(component).toContain("Bouton Google Business");
    expect(component).toContain("Copier mon lien");
    expect(component).toContain("Voir le guide Google Business");
    expect(component).toContain("J'ai configure mon bouton Google");
    expect(component).toContain("Demander l'aide de TOK");
    expect(component).toContain("navigator.clipboard.writeText");
    expect(component).toContain('action: "copy"');
    expect(component).toContain('action: "help"');
    expect(component).toContain('action: "configured"');
    expect(component).toContain("TOK ne modifie pas automatiquement votre fiche Google");

    expect(hooks).toContain("restaurant_get_google_booking_setup");
    expect(hooks).toContain("restaurant_update_google_booking_setup");
    expect(helpers).toContain("GOOGLE_BOOKING_STATUS_LABELS");
    expect(helpers).toContain("PREVIOUS_BOOKING_PROVIDER_OPTIONS");
    expect(helpers).toContain("isHttpsUrl");
  });

  it("adds an admin follow-up view reachable from admin restaurant navigation", () => {
    const app = read("src/App.tsx");
    const adminPage = read("src/pages/admin/AdminGoogleBusiness.tsx");
    const hooks = read("src/hooks/useGoogleBusinessBooking.ts");
    const adminHome = read("src/pages/admin/AdminHome.tsx");
    const adminMobileNav = read("src/components/admin/AdminMobileNavigation.tsx");

    expect(app).toContain('const AdminGoogleBusiness = lazy(() => import("./pages/admin/AdminGoogleBusiness"))');
    expect(app).toContain('path="/admin/restaurants/google-business"');
    expect(adminHome).toContain("/admin/restaurants/google-business");
    expect(adminMobileNav).toContain("/admin/restaurants/google-business");

    expect(hooks).toContain("admin_list_google_booking_setups");
    expect(hooks).toContain("admin_update_google_booking_setup");
    expect(adminPage).toContain("Aide demandee");
    expect(adminPage).toContain("Marquer comme en cours");
    expect(adminPage).toContain("Marquer comme configure");
    expect(adminPage).toContain("Marquer comme probleme");
    expect(adminPage).toContain("Derniere relance");
    expect(adminPage).toContain("Notes admin");
  });

  it("gives visible feedback for Google Business actions and records a complete admin reminder", () => {
    const adminPage = read("src/pages/admin/AdminGoogleBusiness.tsx");
    const dashboardCard = read("src/components/dashboard/GoogleBusinessBookingCard.tsx");
    const hooks = read("src/hooks/useGoogleBusinessBooking.ts");

    expect(adminPage).toContain("pendingAction");
    expect(adminPage).toContain("Relance enregistrée");
    expect(adminPage).toContain("Marquage en cours");
    expect(adminPage).toContain('status: row.google_booking_status === "configured" ? undefined : "in_progress"');
    expect(adminPage).toContain("lastAdminContactAt: timestamp");

    expect(dashboardCard).toContain("GOOGLE_BOOKING_ACTION_TOASTS");
    expect(dashboardCard).toContain("Configuration confirmée");
    expect(dashboardCard).toContain("Demande d'aide envoyée");

    expect(hooks).toContain("queryClient.setQueryData");
    expect(hooks).toContain("queryClient.setQueriesData");
  });

  it("hides restaurateur Google Business setup buttons once configured", () => {
    const dashboardCard = read("src/components/dashboard/GoogleBusinessBookingCard.tsx");

    expect(dashboardCard).toContain('const isConfigured = status === "configured"');
    expect(dashboardCard).toContain("{!isConfigured ? (");
    expect(dashboardCard).toContain("disabled={isConfigured}");
    expect(dashboardCard).toContain("configuration est confirmée");
  });
});
