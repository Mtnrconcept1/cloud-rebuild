import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { DASHBOARD_ILLUSTRATIONS } from "@/lib/dashboardIllustrations";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

const GENERATED_ASSETS = [
  "marketing",
  "photopro",
  "photo-add",
  "gallery",
  "creations",
  "analytics",
  "restaurant-service",
  "restaurant-orders",
  "restaurant-floor-plan",
  "restaurant-profile",
  "restaurant-advisor",
  "restaurant-performance",
  "restaurant-comparison",
  "restaurant-crm",
  "restaurant-support",
  "restaurant-campaigns",
  "restaurant-promotions",
  "restaurant-reviews",
  "restaurant-social",
  "restaurant-news",
  "restaurant-formulas",
  "restaurant-tok-connect",
  "restaurant-pack",
  "restaurant-billing",
  "restaurant-invoice-settings",
  "client-orders-empty",
  "courier-jobs-empty",
  "commercial-accounting-empty",
  "admin-restaurants",
  "admin-users",
  "admin-catalog",
  "admin-loyalty",
  "admin-operations",
  "admin-ai-operations",
  "admin-incidents",
  "admin-audit",
] as const;

function readUint24LE(bytes: Buffer, offset: number) {
  return bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16);
}

function readWebpChunks(bytes: Buffer, name: string) {
  expect(bytes.readUInt32LE(4) + 8, name + " RIFF size").toBe(bytes.length);
  const chunks: string[] = [];
  let offset = 12;

  while (offset < bytes.length) {
    expect(offset + 8, name + " chunk header").toBeLessThanOrEqual(bytes.length);
    const chunkName = bytes.subarray(offset, offset + 4).toString();
    const chunkSize = bytes.readUInt32LE(offset + 4);
    const chunkEnd = offset + 8 + chunkSize;
    expect(chunkEnd, name + " " + chunkName + " chunk").toBeLessThanOrEqual(bytes.length);
    chunks.push(chunkName);
    offset = chunkEnd + (chunkSize % 2);
  }

  expect(offset, name + " chunk table").toBe(bytes.length);
  return chunks;
}

describe("dashboard 3D illustrations", () => {
  it("ships 36 optimized square WebP assets with alpha", () => {
    const generatedDirectory = resolve(process.cwd(), "public/images/dashboard-3d");
    const diskAssets = readdirSync(generatedDirectory)
      .filter((name) => name.endsWith(".webp"))
      .map((name) => name.slice(0, -5))
      .sort();
    const registryPaths = Object.values(DASHBOARD_ILLUSTRATIONS)
      .map((illustration) => illustration.src)
      .filter((src) => src.startsWith("/images/dashboard-3d/"));
    const registryAssets = registryPaths
      .map((src) => src.slice(src.lastIndexOf("/") + 1, -5))
      .sort();

    expect(GENERATED_ASSETS).toHaveLength(36);
    expect(new Set(GENERATED_ASSETS).size).toBe(36);
    expect([...GENERATED_ASSETS].sort()).toEqual(diskAssets);
    expect(registryPaths).toHaveLength(36);
    expect(new Set(registryPaths).size).toBe(36);
    expect(registryAssets).toEqual(diskAssets);

    let totalBytes = 0;

    for (const name of GENERATED_ASSETS) {
      const path = resolve(process.cwd(), "public/images/dashboard-3d/" + name + ".webp");
      expect(existsSync(path), name + " should exist").toBe(true);

      const bytes = readFileSync(path);
      totalBytes += statSync(path).size;

      expect(bytes.subarray(0, 4).toString(), name + " should be RIFF").toBe("RIFF");
      expect(bytes.subarray(8, 12).toString(), name + " should be WEBP").toBe("WEBP");
      expect(bytes.subarray(12, 16).toString(), name + " should use VP8X").toBe("VP8X");
      const chunks = readWebpChunks(bytes, name);
      expect(chunks, name + " should carry an alpha chunk").toContain("ALPH");
      expect(chunks.some((chunk) => chunk === "VP8 " || chunk === "VP8L"), name + " should carry image data").toBe(true);
      expect(bytes[20] & 0x10, name + " should preserve transparency").toBe(0x10);
      expect(readUint24LE(bytes, 24) + 1, name + " width").toBe(512);
      expect(readUint24LE(bytes, 27) + 1, name + " height").toBe(512);
      expect(statSync(path).size, name + " should stay lightweight").toBeLessThan(25_000);
    }

    expect(totalBytes).toBeLessThan(750_000);
  });

  it("uses one bounded media component for loading, sizing and fallback", () => {
    const media = read("src/components/dashboard/DashboardIllustrationMedia.tsx");
    const hero = read("src/components/dashboard/DashboardPageHero.tsx");
    const actionCard = read("src/components/dashboard/IllustratedActionCard.tsx");

    expect(media).toContain('loading={eager ? "eager" : "lazy"}');
    expect(media).toContain('decoding="async"');
    expect(media).toContain("object-contain");
    expect(media).toContain("data-dashboard-illustration-fallback");
    expect(hero).toContain("DashboardIllustrationMedia");
    expect(actionCard).toContain("DashboardIllustrationMedia");
    expect(hero).not.toContain("<img");
    expect(actionCard).not.toContain("<img");
  });

  it("uses illustrated photo actions with a responsive one-to-three column grid", () => {
    const photos = read("src/pages/dashboard/DashboardPhotos.tsx");
    expect(photos).toContain("IllustratedActionCard");
    expect(photos).toContain('<h1 className="sr-only">Photos et créations</h1>');
    expect(photos).toContain("sm:grid-cols-2 md:grid-cols-1 lg:grid-cols-2 xl:grid-cols-3");

    for (const key of ["photoMarketing", "photoPro", "photoAdd", "photoGallery", "photoCreations"]) {
      expect(photos).toContain("DASHBOARD_ILLUSTRATIONS." + key);
    }
  });

  it("wires page art into the intended heroes and empty states", () => {
    const heroPages = [
      ["src/pages/dashboard/DashboardService.tsx", "restaurantService"],
      ["src/pages/dashboard/DashboardCommandes.tsx", "restaurantOrders"],
      ["src/pages/dashboard/DashboardRestaurant.tsx", "restaurantProfile"],
      ["src/pages/dashboard/DashboardPerformances.tsx", "restaurantPerformance"],
      ["src/pages/dashboard/DashboardComparaison.tsx", "restaurantComparison"],
      ["src/pages/dashboard/DashboardSupport.tsx", "restaurantSupport"],
      ["src/pages/dashboard/DashboardCampagnes.tsx", "restaurantCampaigns"],
      ["src/pages/dashboard/DashboardPromotions.tsx", "restaurantPromotions"],
      ["src/pages/dashboard/DashboardAvis.tsx", "restaurantReviews"],
      ["src/pages/dashboard/DashboardReseauxSociaux.tsx", "restaurantSocial"],
      ["src/pages/dashboard/DashboardActualites.tsx", "restaurantNews"],
      ["src/pages/dashboard/DashboardFormules.tsx", "restaurantFormulas"],
      ["src/pages/dashboard/DashboardTokConnect.tsx", "restaurantTokConnect"],
      ["src/pages/dashboard/DashboardPack.tsx", "restaurantPack"],
      ["src/pages/dashboard/DashboardAccountBilling.tsx", "restaurantBilling"],
      ["src/pages/dashboard/DashboardInvoiceSettings.tsx", "restaurantInvoiceSettings"],
      ["src/pages/admin/AdminRestaurants.tsx", "adminRestaurants"],
      ["src/pages/admin/AdminUtilisateurs.tsx", "adminUsers"],
      ["src/pages/admin/AdminCatalog.tsx", "adminCatalog"],
      ["src/pages/admin/AdminLoyalty.tsx", "adminLoyalty"],
      ["src/pages/admin/AdminOperationsCenter.tsx", "adminOperations"],
      ["src/pages/admin/AdminAiOperations.tsx", "adminAiOperations"],
      ["src/pages/admin/AdminSinistres.tsx", "adminIncidents"],
      ["src/pages/admin/AdminAuditLogs.tsx", "adminAudit"],
    ] as const;

    for (const [path, key] of heroPages) {
      expect(read(path), path + " should pass " + key + " to its hero")
        .toContain("illustration={DASHBOARD_ILLUSTRATIONS." + key + "}");
    }

    const targetedStates = [
      ["src/pages/admin/AdminHome.tsx", "adminAnalytics"],
      ["src/pages/dashboard/DashboardPlanSalle.tsx", "restaurantFloorPlan"],
      ["src/pages/dashboard/DashboardAdvisor.tsx", "restaurantAdvisor"],
      ["src/pages/Commandes.tsx", "clientOrdersEmpty"],
      ["src/pages/courier/CourierHome.tsx", "courierJobsEmpty"],
      ["src/pages/CommercialComptabilite.tsx", "commercialAccountingEmpty"],
    ] as const;

    for (const [path, key] of targetedStates) {
      expect(read(path), path + " should use " + key).toContain("DASHBOARD_ILLUSTRATIONS." + key);
    }

    const crm = read("src/components/crm/CustomerCrmDashboard.tsx");
    expect(crm).toContain('illustration={surface === "restaurant"');
    expect(crm).toContain("DASHBOARD_ILLUSTRATIONS.restaurantCrm");
  });
});
