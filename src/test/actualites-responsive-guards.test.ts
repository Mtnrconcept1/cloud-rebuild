import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

function read(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

describe("Actualites responsive guards", () => {
  it("keeps the public feed blocks responsive across client, restaurateur and admin access", () => {
    const page = read("src/pages/Actualites.tsx");
    const card = read("src/components/social/SocialPostCard.tsx");
    const app = read("src/App.tsx");
    const dialog = read("src/components/ui/dialog.tsx");
    const alertDialog = read("src/components/ui/alert-dialog.tsx");

    expect(app).toContain("{publicNavbar}");
    expect(app).not.toContain('max-sm:hidden">{publicNavbar}</div>');
    expect(dialog).toContain("hideCloseButton?: boolean;");
    expect(dialog).toContain("{!hideCloseButton ? (");
    expect(dialog).toContain(
      "max-h-[calc(100dvh-env(safe-area-inset-top,0px)-env(safe-area-inset-bottom,0px)-1rem)]",
    );
    expect(dialog).toContain(
      "w-[calc(100vw-env(safe-area-inset-left,0px)-env(safe-area-inset-right,0px)-1rem)]",
    );
    expect(alertDialog).toContain(
      "max-h-[calc(100dvh-env(safe-area-inset-top,0px)-env(safe-area-inset-bottom,0px)-1rem)]",
    );
    expect(alertDialog).toContain(
      "w-[calc(100vw-env(safe-area-inset-left,0px)-env(safe-area-inset-right,0px)-1rem)]",
    );
    expect(page).toContain("overflow-x-clip");
    expect(page).toContain("xl:grid-cols-[minmax(0,1fr)_minmax(18rem,21rem)]");
    expect(page).toContain("container grid min-w-0 gap-5");
    expect(page).toContain("min-w-0 max-w-full space-y-2");
    expect(page).not.toContain("max-sm:w-[calc(100%+37px)]");
    expect(page).not.toContain("max-sm:-ml-[9px]");
    expect(page).toContain(
      "min-w-0 space-y-4 xl:sticky xl:top-28 xl:self-start",
    );
    expect(page).toContain("grid-cols-1 gap-2 sm:grid-cols-2");
    expect(page).not.toContain('src="/chef2.png"');
    expect(page).toContain('src="/chef3.png"');
    expect(page).toContain("bg-[image:url('/fondbanniere.png')]");
    expect(page).toContain("max-sm:bg-[image:url('/fondbanniere2.png')]");
    expect(page).toContain("ActualitesBoostBanner");
    expect(page).toContain("Mettre mon restaurant en avant");
    expect(page).toContain("<TrendingUp");
    expect(page).toContain("<BellRing");
    expect(page).toContain("<Rocket");
    expect(page).toContain("max-sm:ml-[12.5rem]");
    expect(page).toContain("max-[379px]:ml-0");
    expect(page).toContain("onSponsorClick={() => setSponsorDialogRequest");
    expect(page).toContain('id="actualites-composer"');
    expect(page).not.toContain(
      "pointer-events-none absolute -right-8 bottom-0 z-0",
    );
    expect(page).not.toContain("h-[7.25rem] w-auto object-contain opacity-15");
    expect(page).toContain(
      "relative z-10 flex min-w-0 flex-col gap-2 lg:flex-row lg:items-center",
    );
    expect(page).toContain('data-testid="actualites-search"');
    expect(page).toContain("grid h-auto w-full grid-cols-2");
    expect(page).toContain("sm:grid-cols-5");
    expect(page).toContain("whitespace-normal");
    expect(page).toContain("compact");
    expect(page).not.toContain("Publier pour");
    expect(page).not.toContain("min-h-screen overflow-hidden");

    expect(card).toContain("flex items-start justify-between gap-3");
    expect(card).toContain("max-sm:relative max-sm:block max-sm:pt-9");
    expect(card).toContain("max-sm:absolute max-sm:right-0 max-sm:top-0");
    expect(card).toContain("w-full min-w-0 flex-1");
    expect(card).toContain(
      "max-sm:-mx-2 max-sm:overflow-visible max-sm:rounded-none max-sm:border-0 max-sm:shadow-none",
    );
    expect(card).toContain("p-5 max-sm:px-0");
    expect(card).toContain(
      "lg:grid-cols-[minmax(0,0.78fr)_minmax(22rem,1.35fr)]",
    );
    expect(card).toContain("order-1 lg:order-1");
    expect(card).toContain("order-2 max-sm:mt-2 lg:order-2");
    expect(card).toContain("getCollapsedMobileBody");
    expect(card).toContain("collapsedMobileBody");
    expect(card).toContain("Afficher plus");
    expect(card).toContain("max-sm:h-10 max-sm:w-screen");
    expect(card).toContain(
      "max-sm:relative max-sm:left-1/2 max-sm:mt-2.5 max-sm:h-10 max-sm:w-screen max-sm:-translate-x-1/2",
    );
    expect(card).not.toContain("max-sm:-mx-6");
    expect(card).toContain("max-sm:rounded-none");
    expect(card).toContain("max-sm:max-h-6");
    expect(card).toContain("max-sm:px-2 max-sm:py-0.5 max-sm:text-[11px]");
    expect(card).toContain(
      "hidden whitespace-pre-wrap text-sm font-medium leading-5 text-slate-950 max-sm:block",
    );
    expect(card).toContain("Voir le menu");
    expect(card).toContain(
      "grid min-w-0 grid-cols-[repeat(5,minmax(0,1fr))] gap-1",
    );
    expect(card).toContain(
      "grid min-w-0 grid-cols-[repeat(6,minmax(0,1fr))] gap-1",
    );
    expect(card).toContain("hidden -space-x-1 sm:flex");
    expect(card).toContain("max-sm:gap-0.5 max-sm:rounded-xl max-sm:px-0.5 max-sm:text-xs");
    expect(card).toContain('<span className="max-sm:sr-only">');
    expect(card).toContain("MobileMediaActionRail");
    expect(card).toContain('hasMedia && "max-sm:mt-2 max-sm:px-0"');
    expect(card).not.toContain('hasMedia && "max-sm:hidden"');
    expect(card).not.toContain("bottom-20 right-3");
    expect(card).toContain("rounded-[1.1rem]");
    expect(card).toContain("Commentaires ({post.commentsCount})");
    expect(card).toContain("Écrire un commentaire...");
    expect(card).toContain("max-sm:h-11 max-sm:w-full");
    expect(card).toContain('aria-label="Signaler le post"');
    expect(card).toContain("MoreVertical");
    expect(card).toContain("TriangleAlert");
    expect(card).not.toContain("MoreHorizontal");

    const carousel = read("src/components/social/SocialMediaCarousel.tsx");
    expect(carousel).toContain("aspect-[16/9] min-h-0");
    expect(carousel).toContain("isVerticalSocialVideoDimensions");
    expect(carousel).toContain("onLoadedMetadata");
    expect(carousel).toContain("mobileOverlay");
    expect(carousel).toContain("AutoPlayOnViewVideo");
    expect(carousel).toContain("IntersectionObserver");
    expect(carousel).toContain('data-autoplay-on-view="true"');
    expect(carousel).toContain("data-media-overlay-state");
    expect(carousel).toContain("hidden-while-playing");
    expect(carousel).toContain("max-sm:pointer-events-none max-sm:opacity-0");
    expect(carousel).toContain("prefers-reduced-motion: reduce");
    expect(carousel).toContain("portraitImageIds");
    expect(carousel).toContain("isPortraitMedia");
    expect(carousel).toContain("bg-black object-contain");
    expect(carousel).toContain("cursor-zoom-in");
    expect(carousel).toContain('className="h-full w-full object-contain"');
    expect(carousel).toContain("constrainedPreview");
    expect(carousel).toContain("flex max-h-[min(62dvh,36rem)] items-center justify-center");
    expect(carousel).toContain("Like/commentaire visibles");
    expect(carousel).toContain("lightboxEngagement");
    expect(carousel).toContain(
      "max-sm:relative max-sm:left-1/2 max-sm:w-screen max-sm:-translate-x-1/2",
    );
    expect(carousel).not.toContain("max-sm:-mx-6");
    expect(carousel).toContain("max-sm:rounded-none");
    expect(carousel).toContain("max-sm:border-0 max-sm:shadow-none");
    expect(carousel).toContain("flex max-h-[min(70dvh,42rem)] items-center justify-center");
    expect(carousel).toContain("getOptimizedImageUrl");
    expect(carousel).toContain('height: undefined, resize: "contain"');
    expect(carousel).toContain('"h-auto max-h-[min(62dvh,36rem)] w-auto max-w-full"');
    expect(carousel).toContain('"h-auto max-h-[min(70dvh,42rem)] w-auto max-w-full"');
    expect(carousel).toContain('"h-auto w-full"');
    expect(carousel).not.toContain('className="h-full w-full object-cover"');
    expect(carousel).toContain('preload="metadata"');
    expect(carousel).toContain("<DialogContent\n        hideCloseButton");
    expect(carousel).toContain(
      'className="flex h-[100dvh] max-h-none w-screen max-w-none',
    );
    expect(carousel).toContain(
      "left-[calc(env(safe-area-inset-left,0px)+1rem)]",
    );
    expect(carousel).toContain(
      "right-[calc(env(safe-area-inset-right,0px)+1.25rem)]",
    );
    expect(carousel).toContain(
      "pb-[calc(env(safe-area-inset-bottom,0px)+1rem)]",
    );
    expect(carousel.match(/aria-label="Fermer le média"/g) ?? []).toHaveLength(1);
  });

  it("keeps the restaurant dashboard composer controls inside their column", () => {
    const dashboard = read("src/pages/dashboard/DashboardActualites.tsx");
    const composer = read("src/components/social/SocialComposer.tsx");

    expect(dashboard).toContain(
      "flex min-w-0 flex-col gap-3 sm:flex-row sm:items-center sm:justify-between",
    );
    expect(dashboard).toContain("SheetTrigger asChild");
    expect(dashboard).toContain("Statistique");
    expect(dashboard).toContain("DashboardActualitesStatsPanel");
    expect(dashboard).toContain('SheetContent side="right"');
    expect(dashboard).not.toContain(
      "xl:grid-cols-[minmax(18rem,22rem)_minmax(0,1fr)]",
    );
    expect(dashboard).not.toContain(
      "flex flex-wrap items-center gap-x-3 gap-y-2",
    );

    expect(composer).toContain("flex min-w-0 flex-col sm:flex-row");
    expect(composer).toContain('compact ? "gap-2" : "gap-4"');
    expect(composer).toContain('compact ? "gap-2" : "gap-3"');
    expect(composer).toContain("w-full max-w-full overflow-hidden");
    expect(composer).toContain("flex min-w-0 flex-col sm:flex-row");
    expect(composer).toContain("grid min-w-0 grid-cols-1 items-stretch md:grid-cols-2");
    expect(composer).toContain("2xl:grid-cols-[minmax(0,0.8fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.05fr)]");
    expect(composer).toContain("h-auto min-h-11 w-full whitespace-normal");
    expect(composer).toContain("min-w-0 overflow-hidden rounded-2xl border bg-white shadow-sm");
    expect(composer).toContain("[overflow-wrap:anywhere]");
    expect(composer).toContain(
      "grid w-full min-w-0 grid-cols-1 items-stretch gap-2 sm:grid-cols-[minmax(0,1fr)_auto] 2xl:h-full",
    );
    expect(composer).toContain("sponsorDialogRequest?: number");
    expect(composer).toContain("setSponsorDialogOpen(true)");
    expect(composer).toContain("social-post-premium-banner");
    expect(composer).toContain("Banniere premium");
    expect(composer).toContain("useRestaurantActualitesPremiumBannerAudience");
    expect(composer).toContain("useCreatePremiumActualitesBanner");
    expect(composer).toContain("affichages chacun");
    expect(composer).not.toContain("basis-full");
    expect(composer).not.toContain("sm:basis-[13rem]");
    expect(composer).not.toContain("2xl:flex-row");
    expect(composer).not.toContain("2xl:w-auto");
    expect(composer).not.toContain("2xl:shrink-0");
    expect(composer).not.toContain(
      "flex shrink-0 flex-wrap items-center gap-2",
    );
    expect(composer).not.toContain("flex min-w-[230px]");
  });

  it("keeps the restaurant dashboard impact metrics compact", () => {
    const dashboard = read("src/pages/dashboard/DashboardActualites.tsx");

    expect(dashboard).toContain("grid grid-cols-2 gap-1.5 sm:gap-2");
    expect(dashboard).toContain("grid grid-cols-4 gap-1.5 rounded-2xl");
    expect(dashboard).toContain("w-[92vw] max-w-none flex-col overflow-hidden");
    expect(dashboard).toContain("overflow-y-auto px-4 pb-[calc(env(safe-area-inset-bottom,0px)+1rem)] pt-4 sm:px-5");
    expect(dashboard).toContain('<span className="sm:hidden">Impr.</span>');
    expect(dashboard).toContain('<span className="sm:hidden">Eng.</span>');
    expect(dashboard).toContain("aria-label={label} title={label}");
    expect(dashboard).toContain('mobileLabel="Posts CTA"');
    expect(dashboard).toContain("[overflow-wrap:anywhere]");
    expect(dashboard).not.toContain(
      "grid gap-2 rounded-2xl border border-orange-100",
    );
    expect(dashboard).not.toContain(
      'label="Zéro Attente attribués" value={zeroAttenteConversions} className="col-span-2"',
    );
  });
});
