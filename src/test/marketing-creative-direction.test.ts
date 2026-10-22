import { describe, expect, it } from "vitest";
import {
  MARKETING_MAX_COPY_SIMILARITY,
  TOK_CREATIVE_DIRECTIONS,
  assignTokCreativeDirections,
  buildTokCreativeDirectionPrompt,
  marketingCopySimilarity,
  marketingTextSimilarity,
} from "../../supabase/functions/_shared/marketing-creative-direction";

describe("TOK creative direction engine", () => {
  it("offers fifteen distinct one-scene directions instead of one fixed layout", () => {
    expect(TOK_CREATIVE_DIRECTIONS).toHaveLength(15);
    expect(new Set(TOK_CREATIVE_DIRECTIONS.map((direction) => direction.id)).size).toBe(15);
    expect(new Set(TOK_CREATIVE_DIRECTIONS.map((direction) => direction.kind))).toEqual(
      new Set(["food", "feature", "lifestyle", "local", "editorial"]),
    );
  });

  it("avoids recently overused chef, dark and feature directions", () => {
    const recent = Array.from({ length: 9 }, (_, index) => ({
      headline: "Ancien " + index,
      body: "Publication précédente " + index,
      visualPrompt: "Chef TOK sur fond noir présentant une fonctionnalité dashboard",
      creativeDirectionId: "chef-product-impact",
      primaryTemplateId: "studio_marketing",
    }));
    const selected = assignTokCreativeDirections(6, recent, "test");
    expect(selected[0].id).not.toBe("chef-product-impact");
    expect(selected.filter((direction) => direction.chef === "required").length).toBeLessThanOrEqual(2);
    expect(new Set(selected.map((direction) => direction.id)).size).toBe(6);
  });

  it("treats formatting-only changes as duplicates and allows genuinely different ideas", () => {
    expect(marketingTextSimilarity("  VOS RÉSERVATIONS — BIEN ORGANISÉES ! ", "Vos réservations bien organisées")).toBe(1);
    expect(marketingCopySimilarity(
      { headline: "Réservez sans attendre", body: "Préparez votre arrivée avant de rejoindre votre table." },
      { headline: "RÉSERVEZ SANS ATTENDRE", body: "Préparez votre arrivée avant de rejoindre votre table !" },
    )).toBeGreaterThanOrEqual(MARKETING_MAX_COPY_SIMILARITY);
    expect(marketingCopySimilarity(
      { headline: "Réservez sans attendre", body: "Préparez votre arrivée avant de rejoindre votre table." },
      { headline: "Genève à table", body: "Une soirée locale au bord du lac, autour d'une cuisine de saison." },
    )).toBeLessThan(MARKETING_MAX_COPY_SIMILARITY);
  });

  it("injects exact copy after choosing layout and explicitly forbids cloning a reference", () => {
    const direction = TOK_CREATIVE_DIRECTIONS[0];
    const prompt = buildTokCreativeDirectionPrompt({
      direction,
      headline: "Le plaisir, maintenant.",
      subjectBrief: "Présenter une réservation TOK.",
    });
    expect(prompt).toContain(JSON.stringify("Le plaisir, maintenant."));
    expect(prompt).toContain(direction.id);
    expect(prompt).toContain("Reproduce the visual language, not the layout");
    expect(prompt).toContain("one-scene");
  });
});
