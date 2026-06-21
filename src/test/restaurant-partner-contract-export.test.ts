import { describe, expect, it } from "vitest";

import {
  RESTAURANT_PARTNER_CONTRACT_TITLE,
  RESTAURANT_PARTNER_CONTRACT_VERSION,
  generateRestaurantPartnerContractSha256,
  generateSignedRestaurantPartnerContractHtml,
} from "@/lib/restaurantPartnerContract";

const SIGNATURE_DATA_URL = "data:image/png;base64,aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";

describe("restaurant partner contract PDF export", () => {
  it("generates the V2 signed contract HTML with complete proof metadata", async () => {
    const input = {
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
      signerEmail: "marie@example.test",
      userId: "user-123",
      restaurantId: "restaurant-456",
      contractHash: "",
      acceptanceText: "J'ai lu et j'accepte l'intégralité du contrat restaurateur TOK.",
    };
    const contractHash = await generateRestaurantPartnerContractSha256(input);
    const html = generateSignedRestaurantPartnerContractHtml({ ...input, contractHash });

    expect(html).toContain(RESTAURANT_PARTNER_CONTRACT_TITLE);
    expect(html).toContain(`Version ${RESTAURANT_PARTNER_CONTRACT_VERSION}`);
    expect(html).toContain("TOK-CH-RP-2026-06-v2");
    expect(html).toContain("Horodatage d'export");
    expect(html).toContain("marie@example.test — user-123 — restaurant-456");
    expect(contractHash).toMatch(/^[a-f0-9]{64}$/);
    expect(html).toContain(contractHash);
    expect(html).toContain(SIGNATURE_DATA_URL);
    expect(html).not.toContain("Cette clause doit être validée par un juriste suisse");
    expect(html).not.toContain("8. Offres, ventes flash, anti-gaspi, fidélité et avantages");
    expect(html).toContain("8. Avis, support, incidents et qualité de service");
  });
});
