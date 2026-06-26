import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import {
  buildTokConnectIntentPlan,
  tokConnectAccessLevels,
  tokConnectCoreEndpoints,
  tokConnectDeveloperPortalModules,
  tokConnectMcpPrompts,
  tokConnectMcpResources,
  tokConnectMcpTools,
  tokConnectPartnerWebhooks,
  tokConnectPricingTiers,
  tokConnectRoadmap,
  tokConnectSecurityControls,
} from "@/lib/tokConnect";
import { tokConnectOpenApiDocument } from "@/lib/tokConnectOpenApi";
import { getFeatureNameForRoute } from "@/lib/featureCatalog";

describe("TOK Connect public catalog", () => {
  it("turns a client dining intent into a confirmation-first booking plan", () => {
    const plan = buildTokConnectIntentPlan(
      "Trouve une table italienne ce soir a Geneve pour deux personnes avec confirmation client.",
    );

    expect(plan.actor).toBe("client");
    expect(plan.mode).toBe("suggest");
    expect(plan.primaryGoal).toBe("reservation");
    expect(plan.requiredScopes).toEqual(["restaurants:read", "availability:read", "reservations:create"]);
    expect(plan.steps.map((step) => step.title)).toContain("Préparer la réservation");
    expect(plan.guardrails).toContain("Confirmation client requise avant création de réservation");
  });

  it("keeps restaurant campaigns in preview mode with human approval", () => {
    const plan = buildTokConnectIntentPlan(
      "Je veux une campagne pour remplir mes tables vides jeudi sans diffusion automatique.",
    );

    expect(plan.actor).toBe("restaurant");
    expect(plan.mode).toBe("suggest");
    expect(plan.primaryGoal).toBe("campaign");
    expect(plan.requiredScopes).toEqual(["restaurants:read", "analytics:read", "credits:read", "campaigns:preview"]);
    expect(plan.limits?.humanApprovalRequired).toBe(true);
    expect(plan.guardrails).toContain("Autopilot désactivé en v1");
  });

  it("documents the real v1 API, webhooks and safe MCP surface", () => {
    expect(tokConnectCoreEndpoints.map((endpoint) => endpoint.path)).toEqual([
      "/v1/restaurants",
      "/v1/restaurants/{id}",
      "/v1/restaurants/{id}/menu",
      "/v1/restaurants/{id}/availability",
      "/v1/reservations/preview",
      "/v1/reservations",
      "/v1/reservations/{id}/cancel/preview",
      "/v1/reservations/{id}/cancel",
      "/v1/credits/balance",
      "/v1/campaigns/preview",
    ]);
    expect(tokConnectPartnerWebhooks.map((webhook) => webhook.event)).toEqual([
      "reservation.created",
      "reservation.cancelled",
      "webhook.test",
      "campaign.previewed",
    ]);
    expect(tokConnectMcpTools.map((tool) => tool.name)).toEqual([
      "search_restaurants",
      "get_real_time_availability",
      "prepare_reservation",
      "get_restaurant_performance",
      "estimate_campaign_credit_cost",
      "generate_campaign_preview",
    ]);
    expect(tokConnectMcpResources.map((resource) => resource.uri)).toContain("tok://availability/{restaurant_id}");
    expect(tokConnectMcpPrompts.map((prompt) => prompt.name)).toContain("prepare_guest_reservation");
  });

  it("documents portal, security controls, pricing and launch path", () => {
    expect(tokConnectAccessLevels.map((level) => level.name)).toEqual([
      "Discovery",
      "Booking",
      "Campaign Preview",
      "Analytics",
      "Enterprise MCP",
    ]);
    expect(tokConnectPricingTiers.map((tier) => tier.name)).toContain("Free Developer");
    expect(tokConnectDeveloperPortalModules).toContain("Documentation OpenAPI");
    expect(tokConnectSecurityControls.map((control) => control.title)).toEqual(expect.arrayContaining([
      "OAuth 2.0 avec scopes",
      "Secrets hashés et rotation",
      "Idempotence réservation",
      "Autopilot désactivé",
    ]));
    expect(tokConnectRoadmap).toHaveLength(5);
    expect(tokConnectRoadmap.at(-1)?.title).toBe("Autopilot contrôlé");
  });

  it("keeps all TOK Connect routes governed by feature flags", () => {
    expect(getFeatureNameForRoute("/tok-connect")).toBe("tok-connect");
    expect(getFeatureNameForRoute("/tok-connect/developer")).toBe("tok-connect");
    expect(getFeatureNameForRoute("/dashboard/tok-connect")).toBe("dashboard-tok-connect");
    expect(getFeatureNameForRoute("/admin/tok-connect")).toBe("admin-tok-connect");
  });

  it("ships a usable OpenAPI 3.1 document with schemas, examples and errors", () => {
    expect(tokConnectOpenApiDocument).toContain("openapi: 3.1.1");
    expect(tokConnectOpenApiDocument).toContain("operationId: listRestaurants");
    expect(tokConnectOpenApiDocument).toContain("operationId: createReservation");
    expect(tokConnectOpenApiDocument).toContain("operationId: cancelReservation");
    expect(tokConnectOpenApiDocument).toContain("TokConnectEnvelope");
    expect(tokConnectOpenApiDocument).toContain("TokConnectError");
    expect(tokConnectOpenApiDocument).toContain("ReservationCreateRequest");
    expect(tokConnectOpenApiDocument).toContain("Idempotency-Key");
    expect(tokConnectOpenApiDocument).toContain("idempotency_key_reused_with_different_body");
    expect(tokConnectOpenApiDocument).toContain("x-tok-request-example");
    expect(tokConnectOpenApiDocument).toContain("X-TOK-Signature");
  });

  it("keeps the TOK Connect README readable and implementation-oriented", () => {
    const readme = readFileSync(resolve(process.cwd(), "docs/tok-connect/README.md"), "utf8");

    expect(readme).not.toContain("\u0000");
    expect(readme).toContain("# TOK Connect");
    expect(readme).toContain("Socle technique");
    expect(readme).toContain("Mise en place pour un client partenaire");
    expect(readme).toContain("Mise en place pour TOK");
    expect(readme).toContain("tok-connect-webhook-dispatcher");
    expect(readme).toContain("Ce qui reste a mettre en place");
  });
});
