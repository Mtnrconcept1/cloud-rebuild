import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import {
  TOK_USER_GUIDE_META,
  TOK_USER_GUIDE_ROUTES,
  TOK_USER_GUIDE_TOOLS,
} from "@/data/tok-user-guide-catalog.generated";
import {
  BUYER_GUIDE_CHAPTERS,
  GUIDE_SCREENSHOTS,
  RESTAURANT_GUIDE_CHAPTERS,
  RESTAURANT_GUIDE_ROUTE_LABELS,
  isRestaurantGuideRoute,
} from "@/data/userGuideContent";
import { canAccessRestaurantDashboardRoute } from "@/pages/dashboard/useDashboardRestaurant";
import {
  getRouteGuideDetail,
  getToolGuideDetail,
} from "@/data/userGuideFeatureDetails";

describe("guides d’utilisation TOK", () => {
  it("affiche les intitulés exacts du menu restaurateur avec une capture par rubrique", () => {
    const source = readFileSync(path.join(process.cwd(), "src/components/DashboardLayout.tsx"), "utf8");
    const names = RESTAURANT_GUIDE_CHAPTERS.map((chapter) => chapter.title);
    expect(names).toEqual([
      "Pilotage",
      "Marketing",
      "Finances",
      "Mon offre",
      "Mon restaurant",
      "Assistance",
    ]);
    for (const chapter of RESTAURANT_GUIDE_CHAPTERS) {
      expect(source).toContain(`title: "${chapter.title}"`);
      expect(chapter.screenshots?.length).toBeGreaterThan(0);
      for (const shot of chapter.screenshots || []) {
        expect(shot.alt.length).toBeGreaterThan(10);
        expect(shot.caption.length).toBeGreaterThan(25);
        expect(shot.src).toMatch(/^\/images\/user-guide\//);
        expect(existsSync(path.join(process.cwd(), "public", shot.src.slice(1)))).toBe(true);
        expect(shot.src).not.toMatch(/admin-/);
      }
      for (const route of chapter.routes) {
        const label = RESTAURANT_GUIDE_ROUTE_LABELS[route];
        expect(label).toBeTruthy();
        expect(source).toContain(`to: "${route}", label: "${label}"`);
        expect(label).not.toMatch(/^\//);
      }
    }
  });
  it("illustre également tous les chapitres du guide administrateur", () => {
    for (const chapter of BUYER_GUIDE_CHAPTERS) {
      expect(chapter.screenshots?.length).toBeGreaterThan(0);
      for (const screenshot of chapter.screenshots || []) {
        expect(screenshot.caption.length).toBeGreaterThan(20);
        expect(screenshot.audiences).toContain("buyer");
        expect(existsSync(path.join(process.cwd(), "public", screenshot.src.slice(1)))).toBe(true);
      }
    }
  });

  it("ne montre aucun catalogue technique ou chemin brut au restaurateur", () => {
    const guide = readFileSync(path.join(process.cwd(), "src/pages/GuideUtilisateur.tsx"), "utf8");
    expect(guide).toContain("isRestaurant ? <RestaurantGuideIndex");
    expect(guide).toContain('if (!isRestaurant) for (const surface');
    expect(guide).toContain("RESTAURANT_GUIDE_ROUTE_LABELS[route]");
    expect(guide).toContain("loadGuidePdfImage(image.src, image.caption)");
  });
  it("reserve les deux guides aux routes de dashboard protègees", () => {
    const app = readFileSync(path.join(process.cwd(), "src/App.tsx"), "utf8");
    const prerender = readFileSync(path.join(process.cwd(), "scripts/prerender-seo.mjs"), "utf8");
    expect(app).toContain('path="/dashboard/guide" element={<DashboardRoute><GuideUtilisateur /></DashboardRoute>}');
    expect(app).toContain('path="/admin/guide" element={<AdminProtectedRoute><GuideUtilisateur /></AdminProtectedRoute>}');
    expect(app).not.toContain('path="/guide/plateforme" element={<GuideUtilisateur />}');
    expect(prerender).not.toContain('path: "/guide/plateforme"');
    expect(prerender).not.toContain('path: "/guide/restaurateur"');
    expect(canAccessRestaurantDashboardRoute({
      pathname: "/dashboard/guide",
      dashboardAccessLocked: true,
      onboardingConfigurationUnlocked: false,
    })).toBe(true);
  });
  it("conserve un inventaire complet et cohérent pour le guide plateforme", () => {
    expect(TOK_USER_GUIDE_ROUTES).toHaveLength(TOK_USER_GUIDE_META.routeCount);
    expect(TOK_USER_GUIDE_TOOLS).toHaveLength(TOK_USER_GUIDE_META.toolCount);
    expect(TOK_USER_GUIDE_ROUTES.some((route) => route.path === "/admin/guardian")).toBe(true);
    expect(TOK_USER_GUIDE_ROUTES.some((route) => route.path === "/dashboard/commandes")).toBe(true);
    expect(TOK_USER_GUIDE_TOOLS.some((tool) => tool.name === "stripe-webhook")).toBe(true);
  });

  it("isole strictement le catalogue visible du guide restaurateur", () => {
    const restaurantRoutes = TOK_USER_GUIDE_ROUTES.filter(isRestaurantGuideRoute);
    expect(restaurantRoutes.some((route) => route.path === "/dashboard/menu")).toBe(true);
    expect(restaurantRoutes.some((route) => route.path.startsWith("/admin"))).toBe(false);
    expect(restaurantRoutes.some((route) => route.surface === "commercial")).toBe(false);
    expect(restaurantRoutes.some((route) => route.surface === "marketing")).toBe(false);
    expect(JSON.stringify(RESTAURANT_GUIDE_CHAPTERS).toLowerCase()).not.toContain("/admin");
    expect(JSON.stringify(RESTAURANT_GUIDE_CHAPTERS).toLowerCase()).not.toContain("administrateur");
    expect(JSON.stringify(RESTAURANT_GUIDE_CHAPTERS).toLowerCase()).not.toContain("administration");
  });

  it("référence des chapitres et captures disponibles pour les deux audiences", () => {
    expect(RESTAURANT_GUIDE_CHAPTERS.length).toBe(6);
    expect(BUYER_GUIDE_CHAPTERS.length).toBeGreaterThanOrEqual(7);
    expect(GUIDE_SCREENSHOTS.filter((item) => item.audiences.includes("restaurant")).length).toBeGreaterThanOrEqual(2);
    expect(GUIDE_SCREENSHOTS.filter((item) => item.audiences.includes("buyer")).length).toBeGreaterThanOrEqual(4);

    for (const screenshot of GUIDE_SCREENSHOTS) {
      expect(existsSync(path.join(process.cwd(), "public", screenshot.src.replace(/^\//, "")))).toBe(true);
    }
  });

  it("fournit une fiche détaillée et ne substitue jamais une capture générique à une route", () => {
    let exactScreenshotCount = 0;

    for (const route of TOK_USER_GUIDE_ROUTES) {
      const detail = getRouteGuideDetail(route);
      expect(detail.id).toContain("route:");
      expect(detail.purpose.length).toBeGreaterThan(20);
      expect(detail.explanation.length).toBeGreaterThan(40);
      expect(detail.prerequisites.length).toBeGreaterThan(0);
      expect(detail.steps.length).toBeGreaterThanOrEqual(3);
      expect(detail.expectedResults.length).toBeGreaterThan(0);
      expect(detail.safeguards.length).toBeGreaterThan(0);

      if (detail.screenshot) {
        exactScreenshotCount += 1;
        expect(detail.screenshot.representation).toBe("exact-route");
        expect(detail.screenshot.capturedRoute).toBe(route.path);
        expect(detail.screenshot.provenance.toLowerCase()).toContain("capture directe");
        expect(existsSync(path.join(process.cwd(), "public", detail.screenshot.src.replace(/^\//, "")))).toBe(true);
      } else {
        expect(detail.technicalNotes.join(" ")).toContain("aucun visuel générique de remplacement");
      }
    }

    expect(exactScreenshotCount).toBeGreaterThanOrEqual(30);

    const cart = TOK_USER_GUIDE_ROUTES.find((route) => route.path === "/panier");
    expect(cart).toBeDefined();
    const cartDetail = getRouteGuideDetail(cart!);
    expect(cartDetail.screenshot?.src).toBe("/images/user-guide/routes/panier.png");
    expect(cartDetail.screenshot?.capturedRoute).toBe("/panier");
    expect(cartDetail.screenshot?.src).not.toContain("accueil");

    const menu = TOK_USER_GUIDE_ROUTES.find((route) => route.path === "/dashboard/menu");
    expect(menu).toBeDefined();
    expect(getRouteGuideDetail(menu!).screenshot).toBeNull();
  });

  it("documente chaque outil serveur sans lui inventer une interface autonome", () => {
    for (const tool of TOK_USER_GUIDE_TOOLS) {
      const detail = getToolGuideDetail(tool);
      expect(detail.id).toBe(`tool:${tool.name}`);
      expect(detail.explanation).toContain("n’est pas une page autonome");
      expect(detail.steps.join(" ")).toContain(tool.endpoint);
      expect(detail.technicalNotes.join(" ")).toMatch(/n’est pas présentée comme l’écran de l’endpoint|ne possède pas d’écran autonome/);
      if (detail.screenshot) {
        expect(detail.screenshot.representation).toBe("related-surface");
        expect(detail.screenshot.provenance).toContain("et non capture de l’endpoint lui-même");
        expect(existsSync(path.join(process.cwd(), "public", detail.screenshot.src.replace(/^\//, "")))).toBe(true);
      }
    }
  });

  it("ne laisse aucune information d’administration entrer dans les fiches restaurateur", () => {
    const restaurantDetails = TOK_USER_GUIDE_ROUTES
      .filter(isRestaurantGuideRoute)
      .map(getRouteGuideDetail);
    const serialized = JSON.stringify(restaurantDetails).toLocaleLowerCase("fr");

    expect(serialized).not.toContain("route:admin");
    expect(serialized).not.toContain("back-office");
    expect(serialized).not.toContain("rôle administrateur");
    expect(serialized).not.toContain("console d’administration");
  });
  it("couvre les chapitres avec toutes les captures disponibles sans visuel inventé", () => {
    for (const [chapters, minimum] of [
      [RESTAURANT_GUIDE_CHAPTERS, 2],
      [BUYER_GUIDE_CHAPTERS, 3],
    ] as const) {
      for (const chapter of chapters) {
        expect(chapter.screenshots?.length).toBeGreaterThanOrEqual(minimum);
        const shots = chapter.screenshots || [];
        expect(new Set(shots.map((shot) => shot.src)).size).toBe(shots.length);
        for (const shot of shots) {
          expect(existsSync(path.join(process.cwd(), "public", shot.src.slice(1)))).toBe(true);
        }
      }
    }
    const paths = new Set([...RESTAURANT_GUIDE_CHAPTERS, ...BUYER_GUIDE_CHAPTERS]
      .flatMap((chapter) => (chapter.screenshots || []).map((shot) => shot.src)));
    expect(paths.size).toBe(38);
  });

});
