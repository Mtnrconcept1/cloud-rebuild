import { describe, expect, it } from "vitest";
import {
  TOK_RESTAURANT_ACQUISITION_CAMPAIGN,
  renderTokRestaurantAcquisitionCampaign,
} from "../../supabase/functions/_shared/marketing-restaurant-acquisition-email";

const brand = {
  siteUrl: "https://www.thetok.ch",
  senderName: "TOK",
  senderAddress: "Genève, Suisse",
  unsubscribeUrl: "https://unsubscribe.example.org/marketing?token=signed-test-token",
};

describe("TOK Geneva restaurateur acquisition email", () => {
  it("is a prospecting campaign, not a reservation confirmation", () => {
    const { html, text } = renderTokRestaurantAcquisitionCampaign(brand);
    expect(TOK_RESTAURANT_ACQUISITION_CAMPAIGN.id).toBe("tok_restaurateurs_geneve");
    expect(text).toContain("Découvrez ce que TOK peut apporter à votre établissement");
    expect(text).toContain("100 % GRATUITE POUR LES 100 PREMIERS RESTAURANTS");
    expect(text).toContain("Avec TOK, chaque table compte.");
    expect(text).not.toContain("Confirmation de réservation");
    expect(html).toContain('role="presentation"');
    expect(html).toContain('width="600"');
  });

  it("includes only the supplied banner as an image, without ornamental logo or chef", () => {
    const { html } = renderTokRestaurantAcquisitionCampaign(brand);
    expect(html.match(/<img\b/g)).toHaveLength(1);
    expect(html).toContain(TOK_RESTAURANT_ACQUISITION_CAMPAIGN.bannerUrl);
    expect(html).not.toContain("/logo3df.png");
    expect(html).not.toContain("/chef.png");
  });

  it("keeps every advertised functionality in HTML and plain text", () => {
    const { html, text } = renderTokRestaurantAcquisitionCampaign(brand);
    for (const name of [
      "Réservations intelligentes",
      "Zéro Attente",
      "Ventes Flash",
      "TOK d’Or",
      "Anti-gaspillage",
      "MIAMZ",
      "Studio Marketing",
      "Un tableau de bord centralisé",
    ]) {
      expect(html).toContain(name);
      expect(text).toContain(name);
    }
    expect(html).not.toContain("## ");
    expect(text).not.toContain("## ");
  });

  it("keeps a visible unsubscribe link and a plain-text unsubscribe line", () => {
    const { html, text } = renderTokRestaurantAcquisitionCampaign(brand);
    expect(html).toContain("Se désabonner en un clic");
    expect(html).toContain(brand.unsubscribeUrl);
    expect(text).toContain(`Se désabonner : ${brand.unsubscribeUrl}`);
    expect(html).toContain(brand.senderAddress);
  });

  it("fails closed when the real unsubscribe URL or sender identification is missing", () => {
    expect(() => renderTokRestaurantAcquisitionCampaign({ ...brand, unsubscribeUrl: null })).toThrow(/unsubscribe/);
    expect(() => renderTokRestaurantAcquisitionCampaign({ ...brand, unsubscribeUrl: "http://unsafe.example/" })).toThrow(/unsubscribe/);
    expect(() => renderTokRestaurantAcquisitionCampaign({ ...brand, senderAddress: "" })).toThrow(/sender/);
  });
});
