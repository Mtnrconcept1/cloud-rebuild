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

  it("keeps the sponsored restaurant hero title prominent on desktop", () => {
    const templateCard = readSource("src/components/campaigns/SponsoredRestaurantTemplateCard.tsx");

    expect(templateCard).toContain("text-4xl sm:text-5xl lg:text-[3.15rem] xl:text-[4.1rem] 2xl:text-[5.25rem]");
  });

  it("persists creative choices in channels and normalizes them server-side", () => {
    const dashboard = readSource("src/pages/dashboard/DashboardCampagnes.tsx");
    const portal = readSource("supabase/functions/campaign-portal/index.ts");
    const card = readSource("src/components/campaigns/SponsoredRestaurantTemplateCard.tsx");

    expect(dashboard).toContain("CampaignCreativeStudio");
    expect(dashboard).toContain("CREATIVE_BANNER_PLACEMENT_OPTIONS");
    expect(dashboard).toContain("CREATIVE_BANNER_SEPARATOR_OPTIONS");
    expect(dashboard).toContain("creative: campaignCreative");
    expect(dashboard).toContain("getCampaignCreativeFromChannels(initial?.channels)");
    expect(dashboard).not.toContain("Nuancier des blocs");
    expect(dashboard).not.toContain("Masque photo");
    expect(dashboard).not.toContain("CAMPAIGN_CREATIVE_TEMPLATES.map");

    expect(portal).toContain("sanitizeCampaignCreative");
    expect(portal).toContain("tok_spotlight");
    expect(portal).toContain("VALID_BANNER_TEXT_PLACEMENTS");
    expect(portal).toContain("VALID_BANNER_SEPARATORS");
    expect(portal).not.toContain("VALID_CREATIVE_TONES");
    expect(portal).toContain("creative,");

    expect(card).toContain("ad-card-spotlight");
    expect(card).toContain("ad-banner-spotlight");
    expect(card).not.toContain("Photo mise en avant");
    expect(card).not.toContain("mt-6 inline-flex h-12 w-fit");
    expect(card).not.toContain("getBannerSeparatorClass");
    expect(card).not.toContain("getBannerPhotoPanelClass");
    expect(card).toContain('variant = "card"');
    expect(card).not.toContain("TEMPLATE_NUMBERS");
    expect(card).not.toContain("photo-zone-template");
  });
});
