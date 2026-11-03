import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = (file: string) => readFileSync(resolve(process.cwd(), file), "utf8");

describe("Assistant TOK : espace de conversation sur mobile", () => {
  const layout = source("src/components/DashboardLayout.tsx");
  const advisor = source("src/pages/dashboard/DashboardAdvisor.tsx");
  const css = source("src/components/dashboard/RestaurantWorkspacePages.css");

  it("ne rend pas le hero de secours au-dessus de l'entête natif de l'assistant", () => {
    expect(layout).toContain("hideRouteHero?: boolean");
    expect(layout).toContain("hideRouteHero = false");
    expect(layout).toContain("{!hideRouteHero && (");
    expect(layout).toContain("<RouteHeroBanner");
    expect(advisor).toContain("<DashboardLayout constrainToViewport hideRouteHero");
    // The default layout still renders the fallback for other dashboard pages.
    expect(layout).not.toContain("pathname !== \"/dashboard/advisor\"");
  });

  it("réserve une zone défilante aux messages et évite un accueil centré hors écran", () => {
    expect(advisor).toContain(
      'tok-advisor-conversation min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain',
    );
    expect(advisor).toContain(
      'tok-advisor-welcome flex min-h-full flex-col items-center justify-start',
    );
    expect(advisor).toContain('tok-advisor-composer min-w-0 shrink-0');
    expect(advisor).toContain('min-w-0 flex-1 max-h-32 min-h-[48px] resize-none');
    expect(css).toContain(".tok-page-advisor .tok-advisor-composer");
    expect(css).toContain("-webkit-overflow-scrolling: touch");
  });

  it("affiche l'historique à la place du chat sur téléphone, sans rétrécir la saisie", () => {
    expect(advisor).toContain('tok-advisor-history mb-2 flex min-h-0 flex-1');
    expect(advisor).toContain('historyOpen ? "max-md:hidden" : ""');
    expect(advisor).toContain("md:max-h-[40dvh] md:flex-none");
    expect(advisor).toContain("aria-expanded={historyOpen}");
  });

  it("préserve les contrôles tactiles, les safe areas et un seul titre lisible", () => {
    expect(css).toContain(".tok-workspace-content.tok-page-advisor");
    expect(css).toContain("env(safe-area-inset-top, 0px)");
    expect(css).toContain("env(safe-area-inset-bottom, 0px)");
    expect(css).toContain(".tok-page-advisor .tok-advisor-header");
    expect(css).toContain("grid-template-columns: repeat(2, minmax(0, 1fr))");
    expect(css).toContain("min-height: 36px");
    expect(advisor).toContain('className="hidden h-16 w-16 shrink-0 object-contain');
    expect(advisor).toContain("Modifier mon restaurant");
    expect(advisor).toContain("Historique");
  });

  it("garde les consignes de confidentialité accessibles sans occuper tout l'écran", () => {
    expect(advisor).toContain("ADVISOR_ATTACHMENT_WARNING");
    expect(advisor).toContain('className="mt-2 hidden text-center text-[10px] text-muted-foreground sm:block"');
    expect(advisor).toContain('<details className="mt-1 text-center text-[11px] text-muted-foreground sm:hidden">');
    expect(advisor).toContain("Pièces jointes : données sensibles interdites");
    expect(advisor).toContain("ADVISOR_MAX_ATTACHMENTS");
    expect(advisor).toContain("ADVISOR_MAX_TOTAL_BYTES");
  });
});
