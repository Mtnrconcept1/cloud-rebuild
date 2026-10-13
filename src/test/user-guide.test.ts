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
});
