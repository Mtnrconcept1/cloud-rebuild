import { describe, expect, it } from "vitest";

import {
  NEWSLETTER_TEMPLATES,
  analyzeNewsletterDeliverability,
  buildNewsletterCampaignFromTemplate,
} from "@/lib/newsletterTemplates";

describe("newsletterTemplates", () => {
  it("ships exactly twenty reusable newsletter templates", () => {
    expect(NEWSLETTER_TEMPLATES).toHaveLength(20);
    expect(new Set(NEWSLETTER_TEMPLATES.map((template) => template.id)).size).toBe(20);
    expect(NEWSLETTER_TEMPLATES.every((template) => template.subject.length > 0 && template.body.length > 80)).toBe(true);
  });

  it("builds a scheduled notification campaign from a template", () => {
    const campaign = buildNewsletterCampaignFromTemplate("gold_rewards", {
      createdBy: "admin-1",
      scheduledAt: "2026-06-01T09:00:00.000Z",
      targetCities: ["Geneve"],
    });

    expect(campaign).toMatchObject({
      title: "Vos avantages Gold sont prets",
      category: "marketing",
      status: "scheduled",
      scheduled_at: "2026-06-01T09:00:00.000Z",
      created_by: "admin-1",
      target_roles: ["client"],
      target_cities: ["Geneve"],
    });
    expect(campaign.channels).toEqual({ in_app: true, email: true, push: false });
  });

  it("flags risky newsletter copy before it is sent", () => {
    const healthy = analyzeNewsletterDeliverability({
      subject: NEWSLETTER_TEMPLATES[0].subject,
      body: NEWSLETTER_TEMPLATES[0].body,
      scheduledAt: "2026-06-01T09:00:00.000Z",
      hasMarketingConsentFilter: true,
      hasUnsubscribeLink: true,
      senderDomainAuthenticated: true,
    });
    const risky = analyzeNewsletterDeliverability({
      subject: "URGENT !!! GRATUIT GRATUIT GAGNEZ MAINTENANT",
      body: "PROMO !!! CLIQUEZ VITE !!!",
      scheduledAt: "",
      hasMarketingConsentFilter: false,
      hasUnsubscribeLink: false,
      senderDomainAuthenticated: false,
    });

    expect(healthy.status).toBe("ready");
    expect(healthy.score).toBeGreaterThanOrEqual(85);
    expect(risky.status).toBe("blocked");
    expect(risky.blockers).toContain("missing_marketing_consent");
    expect(risky.blockers).toContain("missing_unsubscribe_link");
  });
});

