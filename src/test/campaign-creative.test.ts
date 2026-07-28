import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import SponsoredRestaurantTemplateCard from "@/components/campaigns/SponsoredRestaurantTemplateCard";
import {
  CAMPAIGN_CREATIVE_TEMPLATES,
  DEFAULT_CAMPAIGN_CREATIVE,
  getCampaignCreativeSummary,
  normalizeCampaignCreative,
} from "@/lib/campaignCreative";

function readSource(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

describe("campaign creative studio", () => {
  it("ships one fixed sponsored creative model", () => {
    expect(CAMPAIGN_CREATIVE_TEMPLATES).toHaveLength(1);
    expect(CAMPAIGN_CREATIVE_TEMPLATES.map((template) => template.id)).toEqual([
      "tok_spotlight",
    ]);
  });

  it("normalizes campaign creative choices to supported values only", () => {
    expect(normalizeCampaignCreative({
      template: "tok_spotlight",
      tone: "night_gold",
      font: "editorial",
      background: "dark_grain",
      shape: "grunge",
      colors: {
        frame: "#111111",
        button: "#ff3300",
      },
    })).toMatchObject({
      template: "tok_spotlight",
      bannerTextPlacement: DEFAULT_CAMPAIGN_CREATIVE.bannerTextPlacement,
      bannerSeparator: DEFAULT_CAMPAIGN_CREATIVE.bannerSeparator,
      text: DEFAULT_CAMPAIGN_CREATIVE.text,
    });

    expect(normalizeCampaignCreative({
      template: "unsafe-template",
      tone: "rainbow",
      font: "comic",
      background: "remote-css",
      shape: "blob",
      colors: {
        frame: "#111111",
      },
    })).toEqual(DEFAULT_CAMPAIGN_CREATIVE);

    expect(normalizeCampaignCreative({
      bannerTextPlacement: "right",
      bannerSeparator: "wave",
    })).toMatchObject({
      bannerTextPlacement: "right",
      bannerSeparator: "wave",
    });

    expect(normalizeCampaignCreative({
      bannerTextPlacement: "unsafe-side",
      bannerSeparator: "remote-css",
    })).toMatchObject({
      bannerTextPlacement: DEFAULT_CAMPAIGN_CREATIVE.bannerTextPlacement,
      bannerSeparator: DEFAULT_CAMPAIGN_CREATIVE.bannerSeparator,
    });
  });

  it("keeps editable text controls within safe ranges", () => {
    expect(normalizeCampaignCreative({
      text: {
        headline: {
          x: 88,
          y: -42,
          scale: 135,
          rotation: -18,
          color: "#AbC123",
          font: "modern",
          align: "center",
        },
      },
    })).toMatchObject({
      text: {
        headline: {
          x: 88,
          y: -42,
          scale: 135,
          rotation: -18,
          color: "#abc123",
        },
      },
    });

    expect(normalizeCampaignCreative({
      copy: {
        badge: "À l'affiche",
        restaurant: "L'adega",
        sealMain: "Flash",
      },
      text: {
        restaurant: {
          font: "rounded",
          style: "italic",
        },
        sealMain: {
          font: "mono",
          style: "bold",
        },
      },
    })).toMatchObject({
      copy: {
        badge: "À l'affiche",
        restaurant: "L'adega",
        sealMain: "Flash",
      },
      text: {
        restaurant: {
          font: "rounded",
          style: "italic",
        },
        sealMain: {
          font: "mono",
          style: "bold",
        },
      },
    });
  });

  it("keeps a readable summary for campaign operators", () => {
    expect(getCampaignCreativeSummary({
      ...DEFAULT_CAMPAIGN_CREATIVE,
      template: "tok_spotlight",
    })).toContain("TOK Spotlight");
  });

  it("does not duplicate the sponsored badge on banner placements", () => {
    const duplicateSponsoredMarkup = renderToStaticMarkup(createElement(SponsoredRestaurantTemplateCard, {
      variant: "banner",
      restaurantName: "Quirinale",
      discountLabel: "Sponsorisé",
    }));
    const discountMarkup = renderToStaticMarkup(createElement(SponsoredRestaurantTemplateCard, {
      variant: "banner",
      restaurantName: "Quirinale",
      discountLabel: "-30%",
    }));

    expect(duplicateSponsoredMarkup.match(/Sponsorisé/g)).toHaveLength(1);
    expect(discountMarkup).toContain("-30%");
  });

  it("keeps the sponsored restaurant hero title prominent without oversized overflow", () => {
    const templateCard = readSource("src/components/campaigns/SponsoredRestaurantTemplateCard.tsx");

    expect(templateCard).toContain("[overflow-wrap:anywhere] [text-wrap:balance]");
    expect(templateCard).toContain("text-3xl sm:text-4xl md:text-[2rem] lg:text-[2.75rem] xl:text-[3.25rem] 2xl:text-[3.75rem]");
    expect(templateCard).not.toContain("2xl:text-[4.8rem]");
    expect(templateCard).not.toContain("mt-1 line-clamp-2 overflow-visible pb-2 leading-[1.04]");
  });

  it("lets every sponsored placement grow with max-length customized copy", () => {
    const maxCopy = {
      badge: "B".repeat(90),
      discount: "D".repeat(90),
      eyebrow: "E".repeat(90),
      restaurant: "R".repeat(90),
      tagline: "T".repeat(90),
      address: "A".repeat(90),
      headline: "H".repeat(90),
      body: "O".repeat(90),
      sealTop: "S".repeat(90),
      sealMain: "M".repeat(90),
      sealBottom: "L".repeat(90),
      cta: "C".repeat(90),
    };
    const variants = [
      { variant: "banner" as const, compactBanner: false },
      { variant: "banner" as const, compactBanner: true },
      { variant: "card" as const, compactBanner: false },
    ];

    for (const variant of variants) {
      const markup = renderToStaticMarkup(createElement(SponsoredRestaurantTemplateCard, {
        ...variant,
        creative: { copy: maxCopy },
        restaurantName: "Fallback restaurant",
        address: "Fallback address",
        headline: "Fallback headline",
        body: "Fallback body",
        ctaLabel: "Fallback CTA",
        discountLabel: "-30%",
      }));
      const visibleFields = variant.variant === "banner"
        ? [
            maxCopy.badge,
            maxCopy.discount,
            maxCopy.eyebrow,
            maxCopy.restaurant,
            maxCopy.tagline,
            maxCopy.address,
            maxCopy.headline,
            maxCopy.body,
            maxCopy.sealTop,
            maxCopy.sealMain,
            maxCopy.sealBottom,
          ]
        : [
            maxCopy.badge,
            maxCopy.discount,
            maxCopy.restaurant,
            maxCopy.address,
            maxCopy.headline,
            maxCopy.body,
            maxCopy.cta,
          ];

      for (const visibleField of visibleFields) {
        expect(visibleField).toHaveLength(90);
        expect(markup).toContain(visibleField);
      }
      expect(markup).not.toContain("line-clamp-2");
      expect(markup).not.toContain("truncate");
      if (variant.variant === "banner") {
        expect(markup).not.toContain("aspect-[16/5]");
        expect(markup).toContain("data-sponsored-banner-seal");
      } else {
        expect(markup).toContain("data-sponsored-card-badges");
      }
    }

    const templateCard = readSource("src/components/campaigns/SponsoredRestaurantTemplateCard.tsx");
    const bannerBranch = templateCard
      .split('if (variant === "banner")')[1]
      .split('if (variant === "push")')[0];

    expect(bannerBranch).toBeTruthy();
    expect(bannerBranch).not.toContain("max-h-");
    expect(bannerBranch).not.toContain("truncate");
    expect(bannerBranch).not.toContain("line-clamp");
    expect(bannerBranch).not.toMatch(/(?:^|[\s"'`])(?:[a-z]+:)*h-\[\d+px\](?=$|[\s"'`])/);
    expect(bannerBranch).not.toContain("aspect-[16/5]");
    expect(bannerBranch).toContain("data-sponsored-banner-seal");
    const sealMarkerIndex = bannerBranch.indexOf("data-sponsored-banner-seal");
    const sealOpeningTag = bannerBranch.slice(bannerBranch.lastIndexOf("<div", sealMarkerIndex), sealMarkerIndex);
    expect(sealOpeningTag).not.toMatch(/\b(?:absolute|fixed|sticky)\b/);

    const cardBadgeMarkerIndex = templateCard.indexOf("data-sponsored-card-badges");
    const cardBadgeOpeningTag = templateCard.slice(templateCard.lastIndexOf("<div", cardBadgeMarkerIndex), cardBadgeMarkerIndex);
    expect(cardBadgeMarkerIndex).toBeGreaterThan(-1);
    expect(cardBadgeOpeningTag).not.toMatch(/\b(?:absolute|fixed|sticky)\b/);
    expect(templateCard).not.toContain("absolute left-3 right-14 top-3");
    expect(templateCard).not.toContain("absolute bottom-3 left-3 right-3");
  });

  it("persists creative choices in channels and normalizes them server-side", () => {
    const dashboard = readSource("src/pages/dashboard/DashboardCampagnes.tsx");
    const portal = readSource("supabase/functions/campaign-portal/index.ts");
    const card = readSource("src/components/campaigns/SponsoredRestaurantTemplateCard.tsx");

    expect(dashboard).toContain("CampaignCreativeStudio");
    expect(dashboard).toContain("CREATIVE_BANNER_PLACEMENT_OPTIONS");
    expect(dashboard).toContain("CREATIVE_BANNER_SEPARATOR_OPTIONS");
    expect(dashboard).toContain("Textes personnalisables");
    expect(dashboard).toContain("Tous les textes de la bannière sont personnalisables");
    expect(dashboard).toContain("Chaque zone de texte dispose de son champ");
    expect(dashboard).toContain("Police");
    expect(dashboard).toContain("Style");
    expect(dashboard).toContain("Couleur");
    expect(dashboard).toContain("Rond centre");
    expect(dashboard).toContain("Arrondie");
    expect(dashboard).toContain("Compacte");
    expect(dashboard).toContain("creative: campaignCreative");
    expect(dashboard).toContain("getCampaignCreativeFromChannels(initial?.channels)");
    expect(dashboard).not.toContain("Nuancier des blocs");
    expect(dashboard).not.toContain("Masque photo");
    expect(dashboard).not.toContain("CAMPAIGN_CREATIVE_TEMPLATES.map");

    expect(portal).toContain("sanitizeCampaignCreative");
    expect(portal).toContain("tok_spotlight");
    expect(portal).toContain("VALID_BANNER_TEXT_PLACEMENTS");
    expect(portal).toContain("VALID_BANNER_SEPARATORS");
    expect(portal).toContain("DEFAULT_CREATIVE_COPY");
    expect(portal).toContain("sanitizeCreativeCopy");
    expect(portal).toContain("rounded");
    expect(portal).toContain("mono");
    expect(portal).not.toContain("VALID_CREATIVE_TONES");
    expect(portal).toContain("creative,");

    expect(card).toContain("ad-card-spotlight");
    expect(card).toContain("ad-banner-spotlight");
    expect(card).toContain("getCreativeCopy");
    expect(card).toContain("displaySealMain");
    expect(card).not.toContain("Photo mise en avant");
    expect(card).not.toContain("mt-6 inline-flex h-12 w-fit");
    expect(card).not.toContain("getBannerSeparatorClass");
    expect(card).not.toContain("getBannerPhotoPanelClass");
    expect(card).toContain('variant = "card"');
    expect(card).not.toContain("TEMPLATE_NUMBERS");
    expect(card).not.toContain("photo-zone-template");
  });
});
