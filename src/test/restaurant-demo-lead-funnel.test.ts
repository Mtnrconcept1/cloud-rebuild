import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  parseRestaurantDemoInput,
  RESTAURANT_DEMO_CONSENT_VERSION,
} from "../../supabase/functions/_shared/restaurant-demo";

const request = {
  requestId: "550e8400-e29b-41d4-a716-446655440000",
  city: " Genève ",
  phone: "+41 22 123 45 67",
  tableCount: 24,
  primaryNeed: "Réservations",
  marketingConsent: false,
};

const edge = readFileSync(
  resolve(process.cwd(), "supabase/functions/contact-support/index.ts"), "utf8",
);
const front = readFileSync(
  resolve(process.cwd(), "src/pages/RestaurateursGeneve.tsx"), "utf8",
);

describe("restaurant demo: verified inbound prospect CRM", () => {
  it("requires a valid idempotency UUID and bounded lead details", () => {
    const parsed = parseRestaurantDemoInput(request);
    expect(parsed.city).toBe("Genève");
    expect(parsed.tableCount).toBe(24);
    expect(parsed.marketingConsent).toBe(false);
    expect(RESTAURANT_DEMO_CONSENT_VERSION).toMatch(/^restaurant_demo_optin_/);

    for (const invalid of [
      null, [], { ...request, requestId: "not-uuid" },
      { ...request, city: "" }, { ...request, phone: "123" },
      { ...request, tableCount: -1 }, { ...request, tableCount: 1.5 },
      { ...request, tableCount: 10001 },
      { ...request, marketingConsent: "true" },
      { ...request, primaryNeed: "a".repeat(161) },
    ]) {
      expect(() => parseRestaurantDemoInput(invalid)).toThrow("invalid_restaurant_demo_details");
    }
  });

  it("persists marketing consent as unverified evidence only, without forced subscription", () => {
    const parsed = parseRestaurantDemoInput({ ...request, marketingConsent: true, tableCount: null });
    expect(parsed.marketingConsent).toBe(true);
    expect(parsed.tableCount).toBe(null);
    expect(edge).toContain('marketing_opt_in_requested: demoLead.marketingConsent');
    expect(edge).toContain('marketing_status: "unverified"');
    expect(edge).not.toContain('lawful_basis: "consent"');
    expect(front).toContain('name="marketing_optin" type="checkbox"');
    expect(front).toContain('marketingConsent: data.get("marketing_optin") === "on"');
  });

  it("records only unverified, bounded campaign hints after distinct tracking consent", () => {
    const sample = {
      utm: { utm_source: "Instagram", utm_campaign: "tok_october", utm_medium: "social" },
      referrerHost: "instagram.com",
      landingPath: "/restaurateurs/geneve?email=private@example.ch",
      touchedAt: new Date().toISOString(),
    };
    const withoutConsent = parseRestaurantDemoInput({ ...request, acquisitionTouch: sample });
    expect(withoutConsent.acquisitionTouch).toBeNull();

    const withConsent = parseRestaurantDemoInput({ ...request, marketingTrackingConsent: true, acquisitionTouch: sample });
    expect(withConsent.acquisitionTouch).toEqual({
      utm: { utm_source: "instagram", utm_campaign: "tok_october", utm_medium: "social" },
      referrerHost: "instagram.com",
      touchedAt: sample.touchedAt,
    });
    expect(withConsent.acquisitionTouch).not.toHaveProperty("landingPath");
    expect(parseRestaurantDemoInput({ ...request, marketingTrackingConsent: true, acquisitionTouch: {
      ...sample, utm: { utm_source: "person@example.ch" }, referrerHost: null,
    } }).acquisitionTouch).toBeNull();
    expect(parseRestaurantDemoInput({ ...request, marketingTrackingConsent: true, acquisitionTouch: {
      ...sample, touchedAt: "2024-01-01T00:00:00.000Z",
    } }).acquisitionTouch).toBeNull();
    expect(edge).toContain('status: "self_reported_unverified"');
    expect(edge).not.toContain("marketing_attribution_facts");
    expect(front).toContain('hasConsent("marketing")');
  });

  it("offers a direct, explicit restaurant signup and confirms demo receipt without purchase", () => {
    expect(front).toContain('<Link to="/auth?role=restaurateur">');
    expect(front).toContain('data-testid="restaurant-demo-confirmation"');
    expect(front).toContain("Aucun abonnement ni paiement déclenché par une demande de démonstration");
  });

  it("enforces CAPTCHA, per-recipient caps, deduplication and a transactional-only reply", () => {
    expect(edge.indexOf("await verifyTurnstileIfConfigured")).toBeLessThan(
      edge.indexOf('.from("restaurant_leads")'),
    );
    expect(edge).toContain("restaurant-demo:${fingerprint}");
    expect(edge).toContain("maxRequests: 2, windowSeconds: 86400");
    expect(edge).toContain('leadError.code !== "23505"');
    expect(edge).toContain('restaurantLeadCreated && restaurantLeadId');
    expect(edge).toContain('source: "restaurant_demo_ack"');
    expect(edge).toContain('il ne vous inscrit pas à une liste publicitaire');
    expect(edge).toContain('restaurant_demo_crm_unavailable');
    expect(edge).toContain("source === \"public_contact\" && subject === RESTAURANT_DEMO_SUBJECT");
  });
});
