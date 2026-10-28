import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ensureSeoMetadataForRoute } from "@/hooks/useSeoMeta";

function clearRouteMetadata() {
  document.head.innerHTML = "";
  delete document.head.dataset.tokSeoPath;
  delete document.head.dataset.tokSeoOwner;
}

describe("workforce entry metadata", () => {
  beforeEach(() => {
    clearRouteMetadata();
    document.title = "Page introuvable | TOK";
  });
  afterEach(clearRouteMetadata);

  it.each([
    "/equipe/mon-espace",
    "/equipe/gestion",
    "/equipe/mon-espace?restaurant=10000000-0000-4000-8000-000000000001",
    "/equipe/gestion?restaurant=10000000-0000-4000-8000-000000000001",
  ])("recognizes %s as a private workspace instead of a missing page", (route) => {
    ensureSeoMetadataForRoute(route);

    expect(document.title).toBe("Espace sécurisé | TOK");
    expect(document.querySelector('meta[name="robots"]')).toHaveAttribute("content", "noindex,nofollow,noarchive");
    expect(document.querySelector('meta[property="og:title"]')).toHaveAttribute("content", "Espace sécurisé | TOK");
    expect(document.querySelector('link[rel="canonical"]')).toHaveAttribute("href", `https://www.thetok.ch${route.split("?")[0]}`);
  });

  it.each(["/equipe", "/equipe/inconnue", "/equipe/mon-espace-extra", "/equipe/gestion-extra"])("keeps the not-found metadata for the unregistered route %s", (route) => {
    ensureSeoMetadataForRoute(route);

    expect(document.title).toBe("Page introuvable | TOK");
    expect(document.querySelector('meta[name="robots"]')).toHaveAttribute("content", "noindex,nofollow,noarchive");
    expect(document.querySelector('link[rel="canonical"]')).toHaveAttribute("href", `https://www.thetok.ch${route}`);
  });

  it("restores public metadata when leaving the workforce workspace", () => {
    ensureSeoMetadataForRoute("/equipe/mon-espace");
    ensureSeoMetadataForRoute("/recherche");

    expect(document.title).toBe("Recherche restaurants à Genève et en Suisse romande | TOK");
    expect(document.querySelector('meta[name="robots"]')?.getAttribute("content")).toMatch(/^index,follow/);
    expect(document.querySelector('link[rel="canonical"]')).toHaveAttribute("href", "https://www.thetok.ch/recherche");
  });
});
