import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const html = readFileSync(
  resolve(process.cwd(), "docs/marketing/previews/tok-autopilot-restaurateurs.html"),
  "utf8",
);
const metricool = readFileSync(resolve(process.cwd(), "src/lib/metricoolTracking.ts"), "utf8");
const plan = readFileSync(resolve(process.cwd(), "docs/marketing/TOK_AUTOPILOT_EXPLOITATION_20261031.md"), "utf8");

describe("TOK AutoPilot sales preview and brand separation", () => {
  it("displays complete reviewable marketing drafts and the real, disclosed pricing", () => {
    for (const id of ["initial", "followup", "social", "funnel", "routine", "metricool"]) {
      expect(html).toContain('id="' + id + '"');
      expect(html).toContain('data-open="' + id + '"');
    }
    expect(html).toContain("Vos réservations et vos offres, au même endroit");
    expect(html).toContain("TOK : voir concrètement le coût pour votre restaurant ?");
    expect(html).toContain("69 CHF/mois");
    expect(html).toContain("5 CHF par table");
    expect(html).toContain("119 CHF");
    expect(html).toContain("Demander une démo gratuite");
    expect(html).toContain("https://www.thetok.ch/restaurateurs/geneve?");
    expect(html).toContain("Lien individuel de désinscription");
  });

  it("does not implement any sending, payment, data submission or hidden tracking", () => {
    expect(html).toMatch(/<meta name="robots" content="noindex,nofollow,noarchive">/);
    expect(html).not.toMatch(/<form[\s>]/i);
    expect(html).not.toMatch(/\bfetch\s*\(/);
    expect(html).not.toMatch(/\bXMLHttpRequest\b/);
    expect(html).not.toMatch(/<script[^>]*\bsrc\s*=/i);
    expect(html).not.toMatch(/tracker\.metricool\.com/);
    expect(html).not.toMatch(/stripe\.com\/checkout/i);
    expect(html).toContain("Aucun e-mail ni publication n’est envoyé");
  });

  it("requires a new Metricool brand AND new website hash, rather than the mixed brand", () => {
    expect(metricool).toContain('LEGACY_MIXED_BRAND_ID = "6954835"');
    expect(metricool).toContain('brandId === LEGACY_MIXED_BRAND_ID');
    expect(metricool).toContain('trackerHash === LEGACY_MIXED_TRACKER_HASH');
    expect(metricool).toContain("VITE_METRICOOL_TOK_BRAND_ID");
    expect(metricool).toContain("VITE_METRICOOL_TOK_TRACKER_HASH");
    expect(plan).toContain("Ne rien supprimer ni transférer automatiquement");
    expect(plan).toContain("TOK AutoPilot Vigie");
  });

  it("keeps all economic and reputational claims clearly qualified", () => {
    expect(html).not.toMatch(/garanti(?:s|e|es)?\s+(?:des\s+)?(?:ventes|réservations)/i);
    expect(html).toContain("uniquement avec autorisation de contact vérifiée");
    expect(html).toMatch(/Aucun abonnement ni paiement/i);
  });
});
