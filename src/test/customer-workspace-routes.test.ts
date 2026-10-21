import { matchPath } from "react-router-dom";
import { describe, expect, it } from "vitest";

import { isCustomerWorkspacePath } from "@/lib/customerWorkspaceRoutes";

const customerPages = [
  "/mon-espace", "/reservations", "/commandes", "/mes-avis",
  "/profil", "/notifications", "/memoire-tok", "/commande/confirmation",
];

describe("customer workspace chrome classification", () => {
  it("recognizes all pages that provide their own customer workspace toolbar", () => {
    for (const path of customerPages) expect(isCustomerWorkspacePath(path), path).toBe(true);
  });

  it("agrees with route matching for trailing slashes and case variants", () => {
    for (const path of customerPages) {
      for (const variant of [`${path}/`, `${path}///`, path.toUpperCase()]) {
        expect(matchPath(path, variant), variant).not.toBeNull();
        expect(isCustomerWorkspacePath(variant), variant).toBe(true);
      }
    }
  });

  it("does not claim public discovery, order tracking or routes in another workspace", () => {
    for (const path of [
      "/", "/recherche", "/panier", "/restaurant/la-table", "/commande/order-123",
      "/commande", "/profil/edit", "/profilage", "/notifications/preferences",
      "/commandes/facture", "/mon-espace-public", "/dashboard", "/dashboard/notifications",
      "/admin", "/courier/profile", "/commercial", "/marketing", "",
    ]) expect(isCustomerWorkspacePath(path), path).toBe(false);
  });
});
