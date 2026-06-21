import { describe, expect, it } from "vitest";

import {
  RESTAURANT_PARTNER_CONTRACT_TITLE,
  RESTAURANT_PARTNER_CONTRACT_VERSION,
  generateSignedRestaurantPartnerContractHtml,
} from "@/lib/restaurantPartnerContract";

const SIGNATURE_DATA_URL = "data:image/png;base64,aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";

describe("restaurant partner contract PDF export", () => {
  it("generates the V2 signed contract HTML without runtime errors", () => {
    const html = generateSignedRestaurantPartnerContractHtml({
      signerName: "Marie Dupont, gérante",
      signatureDataUrl: SIGNATURE_DATA_URL,
      signedAt: "2026-06-21T10:15:00.000Z",
      legalName: "Table Tok Sàrl",
      businessName: "Table Tok",
      restaurantName: "La Table Tok",
      restaurateurAddress: "Rue du Rhône 1, Genève",
      restaurateurPhone: "+41 79 000 00 00",
      businessRegistrationNumber: "CHE-123.456.789",
      taxId: "CHE-123.456.789 TVA",
      city: "Genève",
      signerRole: "Représentant autorisé",
      contractHash: `${RESTAURANT_PARTNER_CONTRACT_VERSION}:12`,
      acceptanceText: "J'ai lu et j'accepte l'intégralité du contrat restaurateur TOK.",
    });

    expect(html).toContain(RESTAURANT_PARTNER_CONTRACT_TITLE);
    expect(html).toContain(`Version ${RESTAURANT_PARTNER_CONTRACT_VERSION}`);
    expect(html).toContain("TOK-CH-RP-2026-06-v2");
    expect(html).toContain("Horodatage d'export");
    expect(html).toContain(SIGNATURE_DATA_URL);
  });
});
