import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("La Tok d’Or — refonte conforme aux références", () => {
  it("uses the uploaded native WebP in the final, page-scoped stylesheet", () => {
    const css = source("src/styles/golden-tok-chefs-table-v6.css");
    const main = source("src/main.tsx");
    const fixture = source("src/test/fixtures/golden-tok-preview.tsx");

    expect(css).toContain("url('/images/converted_tok_dor.webp')");
    expect(css).toContain("@keyframes golden-tok-gold-glint");
    expect(css).toContain("backdrop-filter: blur(23px)");
    expect(main.indexOf("golden-tok-chefs-table-v6.css")).toBeGreaterThan(
      main.indexOf("golden-tok-chefs-table-v5.css"),
    );
    expect(fixture).toContain('import "@/styles/golden-tok-chefs-table-v6.css"');
  });

  it("renders one shared benefits band without individual card borders", () => {
    const wizard = source("src/components/FeatureWizard.tsx");
    const css = source("src/styles/golden-tok-chefs-table-v6.css");

    expect(wizard.match(/className="golden-tok-benefits"/g)).toHaveLength(1);
    expect(wizard).not.toContain('index % 2 === 1 ? "border-l"');
    expect(wizard).toContain('className="golden-tok-hero-virtues"');
    expect(wizard).toContain('className="golden-tok-hero-quote"');
    expect(css).toContain("background: transparent !important;");
    expect(css).toContain(".golden-tok-benefit + .golden-tok-benefit");
  });

  it("removes the video action from the actual page", () => {
    const page = source("src/pages/ChefsTable.tsx");
    expect(page).not.toContain("golden-tok-video-button");
    expect(page).not.toContain("Voir la vidéo");
    expect(page).not.toContain("  Play,");
    expect(page).toContain("golden-tok-alert-action");
  });
});
