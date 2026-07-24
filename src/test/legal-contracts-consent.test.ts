import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import {
  DEFAULT_PRIVACY_CATEGORIES,
  PRIVACY_CONSENT_VERSION,
  PRIVACY_TECHNOLOGY_INVENTORY,
  createPrivacyConsentRecord,
  markPrivacyConsentSynced,
  readPrivacyConsent,
  writePrivacyConsent,
} from "@/lib/privacyConsentState";

function read(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

function memoryStorage(): Storage {
  const values = new Map<string, string>();
  return {
    get length() { return values.size; },
    clear() { values.clear(); },
    getItem(key: string) { return values.get(key) ?? null; },
    key(index: number) { return [...values.keys()][index] ?? null; },
    removeItem(key: string) { values.delete(key); },
    setItem(key: string, value: string) { values.set(key, value); },
  };
}

const requiredLegalDocuments = [
  ["public/legal/conditions-clients.html", "TOK-CLIENT-2026-07-v1"],
  ["public/legal/contrat-restaurateur.html", "TOK-RESTAURANT-2026-07-v1"],
  ["public/legal/abonnements-commissions.html", "TOK-PRICING-2026-07-v1"],
  ["public/legal/tok-connect-api.html", "TOK-CONNECT-2026-07-v1"],
  ["public/legal/contrat-coursier.html", "TOK-COURIER-2026-07-v1"],
  ["public/legal/annulations-remboursements.html", "TOK-REFUND-2026-07-v1"],
  ["public/legal/miamz-solidaires.html", "TOK-MIAMZ-2026-07-v1"],
  ["public/legal/ventes-flash-anti-gaspi.html", "TOK-OFFERS-2026-07-v1"],
  ["public/legal/licence-contenus-restaurateurs.html", "TOK-CONTENT-2026-07-v1"],
  ["public/legal/responsabilites-restauration.html", "TOK-RACI-2026-07-v1"],
] as const;

describe("separate TOK contract corpus", () => {
  it("publishes every required relationship as a distinct versioned document", () => {
    const index = read("public/legal/index.html");
    for (const [path, version] of requiredLegalDocuments) {
      const content = read(path);
      expect(content).toContain(version);
      expect(content).toContain("<h1>");
      expect(content).toContain("/legal/index.html");
      expect(index).toContain(`/${path.replace("public/", "")}`);
    }
  });

  it("does not duplicate the digitally signed restaurant snapshot authority", () => {
    const contract = read("public/legal/contrat-restaurateur.html");
    expect(contract).toContain("snapshot généré lors de l’onboarding");
    expect(contract).toContain("version et le hash contractuel");
    expect(contract).toContain("/conditions-restaurateurs");
    expect(read("src/lib/restaurantPartnerContract.ts")).toContain("RESTAURANT_PARTNER_CONTRACT_VERSION");
    expect(read("supabase/migrations/20260621120000_restaurant_partner_contracts.sql")).toContain("restaurant_contracts");
  });

  it("requires factual courier-status qualification before real delivery", () => {
    const courier = read("public/legal/contrat-coursier.html");
    for (const expected of [
      "Le titre du contrat ne suffit jamais",
      "conditions réelles",
      "assurances sociales",
      "requalifié",
      "Aucune livraison propre ne doit être ouverte",
    ]) {
      expect(courier).toContain(expected);
    }
  });

  it("assigns restaurant responsibility for prices, allergens, availability and food quality", () => {
    const matrix = read("public/legal/responsabilites-restauration.html");
    for (const expected of [
      "Prix, taxes produit et menus",
      "Disponibilité, stock et horaires",
      "Ingrédients et allergènes",
      "Qualité, hygiène et sécurité alimentaire",
      "Exactitude de l’interface et calculs techniques",
    ]) {
      expect(matrix).toContain(expected);
    }
  });
});

describe("granular privacy consent", () => {
  it("defaults every optional category to false while necessary remains true", () => {
    expect(DEFAULT_PRIVACY_CATEGORIES).toEqual({
      necessary: true,
      analytics: false,
      marketing: false,
      personalization: false,
      geolocation: false,
    });
  });

  it("stores a versioned, expiring and server-syncable decision", () => {
    const storage = memoryStorage();
    const now = new Date("2026-07-24T07:00:00.000Z");
    const record = createPrivacyConsentRecord({
      categories: {
        necessary: true,
        analytics: true,
        marketing: false,
        personalization: true,
        geolocation: false,
      },
      action: "save_preferences",
      source: "banner",
      storage,
      now,
    });

    writePrivacyConsent(record, storage);
    expect(readPrivacyConsent(storage, now.getTime())).toMatchObject({
      version: PRIVACY_CONSENT_VERSION,
      pendingSync: true,
      categories: {
        necessary: true,
        analytics: true,
        marketing: false,
        personalization: true,
        geolocation: false,
      },
    });

    markPrivacyConsentSynced(record.recordId, "2026-07-24T07:00:01.000Z", storage);
    expect(readPrivacyConsent(storage, now.getTime())).toMatchObject({
      pendingSync: false,
      serverRecordedAt: "2026-07-24T07:00:01.000Z",
    });
  });

  it("maintains an exact inventory with provider and duration for every technology", () => {
    expect(PRIVACY_TECHNOLOGY_INVENTORY.length).toBeGreaterThanOrEqual(9);
    const ids = new Set<string>();
    for (const item of PRIVACY_TECHNOLOGY_INVENTORY) {
      expect(item.provider.trim()).not.toBe("");
      expect(item.duration.trim()).not.toBe("");
      expect(item.purpose.trim()).not.toBe("");
      expect(ids.has(item.id)).toBe(false);
      ids.add(item.id);
    }
    expect(new Set(PRIVACY_TECHNOLOGY_INVENTORY.map((item) => item.category))).toEqual(
      new Set(["necessary", "analytics", "marketing", "personalization", "geolocation"]),
    );
  });

  it("offers equally direct accept, reject, customize and withdrawal controls", () => {
    const banner = read("src/components/legal/LegalConsentBanner.tsx");
    const footer = read("src/components/home/FooterSection.tsx");
    for (const expected of ["Tout refuser", "Tout accepter", "Enregistrer mes choix", "necessary: true"]) {
      expect(banner).toContain(expected);
    }
    expect(footer).toContain("Gérer mes préférences");
    expect(banner).not.toContain("tok_legal_consent_");
  });

  it("gates analytics, marketing personalization and geolocation in application code", () => {
    expect(read("src/integrations/supabase/client.ts")).toContain("privacyAwareFetch");
    expect(read("src/lib/sponsoredAttribution.ts")).toContain("isPrivacyCategoryAllowed(\"marketing\")");
    expect(read("src/lib/campaignVisibility.ts")).toContain("isPrivacyCategoryAllowed(\"personalization\")");
    expect(read("src/lib/geolocation-native.ts")).toContain("assertGeolocationConsent");
  });

  it("records append-only server evidence without storing raw IP addresses", () => {
    const migration = read("supabase/migrations/20260724070000_privacy_consent_events.sql");
    const edge = read("supabase/functions/record-privacy-consent/index.ts");
    for (const expected of [
      "ENABLE ROW LEVEL SECURITY",
      "REVOKE ALL ON public.privacy_consent_events FROM PUBLIC, anon, authenticated",
      "privacy_consent_events_are_append_only",
      "retention_until",
    ]) {
      expect(migration).toContain(expected);
    }
    expect(edge).toContain("PRIVACY_CONSENT_IP_SALT");
    expect(edge).toContain("SHA-256");
    expect(edge).toContain("createRateLimiter");
    expect(edge).not.toContain("ip_address:");
  });
});
