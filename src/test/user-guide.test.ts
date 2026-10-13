import { existsSync } from "node:fs";
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
  isRestaurantGuideRoute,
} from "@/data/userGuideContent";
import {
  getRouteGuideDetail,
  getToolGuideDetail,
} from "@/data/userGuideFeatureDetails";

describe("guides d’utilisation TOK", () => {
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
    expect(RESTAURANT_GUIDE_CHAPTERS.length).toBeGreaterThanOrEqual(7);
    expect(BUYER_GUIDE_CHAPTERS.length).toBeGreaterThanOrEqual(7);
    expect(GUIDE_SCREENSHOTS.filter((item) => item.audiences.includes("restaurant")).length).toBeGreaterThanOrEqual(2);
    expect(GUIDE_SCREENSHOTS.filter((item) => item.audiences.includes("buyer")).length).toBeGreaterThanOrEqual(4);

    for (const screenshot of GUIDE_SCREENSHOTS) {
      expect(existsSync(path.join(process.cwd(), "public", screenshot.src.replace(/^\//, "")))).toBe(true);
    }
  });

  it("fournit une fiche détaillée et une capture réelle pour chaque route", () => {
    for (const route of TOK_USER_GUIDE_ROUTES) {
      const detail = getRouteGuideDetail(route);
      expect(detail.id).toContain("route:");
      expect(detail.purpose.length).toBeGreaterThan(20);
      expect(detail.explanation.length).toBeGreaterThan(40);
      expect(detail.prerequisites.length).toBeGreaterThan(0);
      expect(detail.steps.length).toBeGreaterThanOrEqual(3);
      expect(detail.expectedResults.length).toBeGreaterThan(0);
      expect(detail.safeguards.length).toBeGreaterThan(0);
      expect(detail.screenshot.provenance.toLowerCase()).toContain("capture directe");
      expect(existsSync(path.join(process.cwd(), "public", detail.screenshot.src.replace(/^\//, "")))).toBe(true);
    }
  });

  it("documente chaque outil serveur sans lui inventer une interface autonome", () => {
    for (const tool of TOK_USER_GUIDE_TOOLS) {
      const detail = getToolGuideDetail(tool);
      expect(detail.id).toBe(`tool:${tool.name}`);
      expect(detail.explanation).toContain("n’est pas une page autonome");
      expect(detail.steps.join(" ")).toContain(tool.endpoint);
      expect(detail.technicalNotes.join(" ")).toContain("ne possède pas d’écran propre");
      expect(existsSync(path.join(process.cwd(), "public", detail.screenshot.src.replace(/^\//, "")))).toBe(true);
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
});
