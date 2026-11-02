import { readFileSync } from "node:fs";
import path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, afterEach } from "vitest";

import PageHeading from "@/components/editorial/PageHeading";
import { HERO_SUBTITLE_STYLES, getHeroSubtitleStyle } from "@/lib/heroSubtitleStyles";

const originalURL = window.location.href;

afterEach(() => {
  window.history.replaceState(null, "", originalURL);
});

describe("TOK five editorial dashboard subtitle styles", () => {
  it("uses each approved reference on a representative restaurant hero", () => {
    const routes = [
      "/dashboard/restaurant",
      "/dashboard/menu",
      "/dashboard/commandes",
      "/dashboard/reservations",
      "/dashboard/ventes-flash",
    ];
    expect(routes.map((route) => getHeroSubtitleStyle(route))).toEqual([...HERO_SUBTITLE_STYLES]);
  });

  it("also makes all five styles visible on client dashboard routes", () => {
    const routes = ["/mon-espace", "/reservations", "/commandes", "/mes-avis", "/ventes-flash"];
    expect(routes.map((route) => getHeroSubtitleStyle(route))).toEqual([...HERO_SUBTITLE_STYLES]);
  });

  it("stays stable across reloads, trailing slashes, irrelevant URL parameters and profile tabs", () => {
    expect(getHeroSubtitleStyle("/dashboard/menu/")).toBe(getHeroSubtitleStyle("/dashboard/menu"));
    expect(getHeroSubtitleStyle("/dashboard/menu", "?utm_source=newsletter")).toBe("surligneur-abricot");
    expect(getHeroSubtitleStyle("/profil", "?tab=infos&utm_source=instagram")).toBe(getHeroSubtitleStyle("/profil", "?tab=infos"));
    expect(HERO_SUBTITLE_STYLES).toContain(getHeroSubtitleStyle("/dashboard/notifications"));
  });

  it("keeps the subtitle as accessible text while applying its route treatment", () => {
    window.history.replaceState(null, "", "/dashboard/restaurant");
    const html = renderToStaticMarkup(
      <PageHeading
        title="Mon restaurant"
        description="Gardez l'identité et les moyens de paiement."
        mascot={false}
      />,
    );
    expect(html).toContain('data-subtitle-style="brosse-orange"');
    expect(html).toContain("Gardez l&#x27;identité et les moyens de paiement.");
    expect(html).toContain('class="tok-editorial-heading__description"');
  });

  it("preserves the same treatment on the mobile restaurant dashboard hero", () => {
    const mobileOverview = readFileSync(
      path.resolve(process.cwd(), "src/components/dashboard/RestaurantDashboardHomeView.tsx"),
      "utf8",
    );
    expect(mobileOverview).toContain('data-subtitle-style={getHeroSubtitleStyle("/dashboard")}');
    expect(mobileOverview).toMatch(/tok-editorial-heading__description mt-0\.5/);
    expect(mobileOverview).not.toMatch(/mt-0\.5 truncate text-\[0\.98rem\]/);
  });

  it("does not restyle an unrelated page or a hero with no description", () => {
    window.history.replaceState(null, "", "/auth");
    expect(renderToStaticMarkup(<PageHeading title="Connexion" description="Bienvenue" mascot={false} />))
      .not.toContain("data-subtitle-style");
    window.history.replaceState(null, "", "/dashboard/restaurant");
    expect(renderToStaticMarkup(<PageHeading title="Mon restaurant" mascot={false} />))
      .not.toContain("data-subtitle-style");
  });
});
