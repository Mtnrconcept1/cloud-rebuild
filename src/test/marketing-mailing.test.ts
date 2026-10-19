import { beforeEach, describe, expect, it, vi } from "vitest";
const { provider } = vi.hoisted(() => ({ provider: vi.fn() }));
vi.mock("../../supabase/functions/_shared/openai.ts", () => ({ createOpenAIResponse: provider, parseStructuredOutput: (value: unknown) => value, selectTokAiModel: () => "test-model" }));
import { MAILING_FIELDS, assertMailingReady, mailingAudience, mailingAudienceLabel, parseMailingOptions, parseMailingSelections, parseMailingRecipientEmails, type MailingField, type MailingFacetPage } from "../../supabase/functions/_shared/marketing-mailing";
import { applyMailingOptions, interpretMailingBrief } from "../../supabase/functions/_shared/marketing-mailing-plan";
import { toBundlePayload, type MarketingPlan } from "../../supabase/functions/_shared/marketing-ai-plan";
import { prepareTargetedMailingContent, renderTargetedMailingEmail } from "../../supabase/functions/_shared/marketing-mailing-email";
import { allocateMarketingVisuals } from "../../supabase/functions/_shared/marketing-visual-allocation";

const options = { selections: { city: ["Genève", "Carouge"], category: ["Pizzeria"] }, emailCount: 4, cadence: "weekly" as const };
function source(): MarketingPlan {
  return { campaign: { name: "Pizzerias", objective: "Présenter les outils TOK", summary: "Quatre bénéfices", channels: ["email"], starts_at: "2026-10-18T07:00:00Z", ends_at: "2026-11-09T08:00:00Z", audience_name: "Tous", audience_definition: { audience_kind: "mixed" } },
    items: Array.from({ length: 4 }, (_, i) => ({ title: `E-mail ${i + 1}`, channel: "email", scheduled_at: "2026-10-18T07:00:00Z", audience_name: "Tous", targeting: { audience_kind: "mixed" }, content: { subject: `Sujet ${i + 1}`, headline: `Bénéfice ${i + 1}`, body: `Message complet ${i + 1}`, call_to_action: "Découvrir TOK", hashtags: [] }, visual_prompt: `Bannière ${i + 1}` })) };
}
beforeEach(() => provider.mockReset());
describe("targeted mailing contracts", () => {
  it("normalizes an exclusive list and never accepts an empty or malformed audience", () => {
    expect(parseMailingRecipientEmails([" A@EXAMPLE.CH ", "a@example.ch", "b@example.ch"])).toEqual(["a@example.ch", "b@example.ch"]);
    for (const value of [[], null, undefined, "a@example.ch", [null], ["a@localhost"], ["a@@example.ch"], ["a@-example.ch"],
      ["a@example.ch/path"], ["a@example.ch\nb@example.ch"], ["é@example.ch"], [".a@example.ch"], ["a..b@example.ch"],
      ["a@example..ch"], ["a".repeat(65) + "@example.ch"], Array(501).fill("a@example.ch")]) {
      expect(() => parseMailingRecipientEmails(value)).toThrow();
    }
    const emails = Array.from({ length: 500 }, (_, i) => `contact${i}@example.ch`);
    expect(parseMailingRecipientEmails(emails)).toHaveLength(500);
    expect(parseMailingOptions({ ...options, selections: {}, recipientEmails: emails })?.recipientEmails).toEqual(emails);
    expect(() => parseMailingOptions({ ...options, recipientEmails: emails })).toThrow();
    expect(() => parseMailingOptions({ ...options, selections: {}, recipientEmails: undefined })).toThrow();
    expect(() => mailingAudience({ city: ["Genève"] }, emails)).toThrow();
    expect(mailingAudienceLabel({}, emails)).toBe("500 destinataire(s) sélectionné(s)");
    expect(mailingAudienceLabel({}, emails)).not.toContain("@");
  });
  it("keeps legacy generated mode and rejects an invalid image-mode choice", () => {
    expect(parseMailingOptions(options)?.imageMode).toBe("generated");
    expect(parseMailingOptions({ ...options, imageMode: "manual" })?.imageMode).toBe("manual");
    for (const imageMode of [null, "", "upload", true, []]) expect(() => parseMailingOptions({ ...options, imageMode })).toThrow();
  });
  it("persists the exact explicit audience in every item of the final bundle", () => {
    const recipientEmails = ["first@example.ch", "second@example.ch"];
    const plan = applyMailingOptions(source(), { ...options, selections: {}, recipientEmails }, source().campaign.starts_at, source().campaign.ends_at);
    const bundle = toBundlePayload(plan, new Map()) as { campaign: Record<string, unknown>; items: Array<Record<string, unknown>> };
    const target = { audience_kind: "mixed", recipient_emails: recipientEmails };
    expect(bundle.campaign.audience_definition).toEqual(target);
    expect(bundle.items).toHaveLength(4);
    for (const item of bundle.items) expect(item.targeting).toEqual(target);
    for (const recipient_emails of [[], null, undefined, ["invalid"]]) {
      const corrupted = structuredClone(plan);
      corrupted.campaign.audience_definition = { audience_kind: "mixed", recipient_emails };
      expect(() => toBundlePayload(corrupted, new Map())).toThrow();
      const corruptedItem = structuredClone(plan);
      corruptedItem.items[1].targeting = { audience_kind: "mixed", recipient_emails };
      expect(() => toBundlePayload(corruptedItem, new Map())).toThrow();
    }
  });
  it("creates manual text-only drafts and ignores accidental generated images", () => {
    const raw = source(); raw.items[0].visual_prompt = null;
    const plan = applyMailingOptions(raw, { ...options, imageMode: "manual" }, raw.campaign.starts_at, raw.campaign.ends_at);
    expect(plan.items.every((item) => item.visual_prompt === null)).toBe(true);
    const bundle = toBundlePayload(plan, new Map([[0, "https://assets.example/unrequested.jpg"]])) as { items: Array<{ content: Record<string, unknown> }> };
    for (const item of bundle.items) {
      expect(item.content).toMatchObject({ mailing_version: "tok-mailing-v1", image_mode: "manual", visual_source: "upload",
        visual_status: "pending_upload", visual_required: true, visual_url: null, visual_prompt: null, visual_format: null });
      expect(item.content).not.toHaveProperty("visual_brand_profile");
      expect(item.content).not.toHaveProperty("visual_reference_ids");
      expect(() => assertMailingReady(item.content)).toThrow();
      expect(() => assertMailingReady({ ...item.content, visual_url: "https://assets.example/import.jpg", visual_status: "ready" })).not.toThrow();
    }
  });
  it("distinguishes all from none and rejects unsupported/widening payloads", () => {
    expect(parseMailingSelections({})).toEqual({});
    expect(parseMailingSelections({ city: [] })).toEqual({ city: [] });
    expect(() => parseMailingOptions({ ...options, selections: { city: [] } })).toThrow();
    for (const selections of [{ role: ["admin"] }, { city: "Genève" }, { city: [null] }, { city: Array(101).fill("Genève") }]) {
      expect(() => parseMailingSelections(selections)).toThrow();
    }
    expect(() => parseMailingOptions({ ...options, approved: true })).toThrow();
    expect(() => parseMailingOptions({ ...options, emailCount: 4.5 })).toThrow();
  });
  it("pins recipients and weekly local time across DST, independent of model output", async () => {
    const plan = applyMailingOptions(source(), options, "2026-10-18T07:00:00Z", "2026-11-09T08:00:00Z");
    expect(plan.items.map((item) => item.scheduled_at)).toEqual(["2026-10-18T07:00:00.000Z", "2026-10-25T08:00:00.000Z", "2026-11-01T08:00:00.000Z", "2026-11-08T08:00:00.000Z"]);
    for (const item of plan.items) expect(item.targeting).toEqual({ audience_kind: "restaurant", selections: options.selections });
    expect(plan.campaign.audience_definition).toEqual({ audience_kind: "restaurant", selections: options.selections });
    const generate = vi.fn().mockResolvedValue("https://assets.example/banner.jpg");
    const visuals = await allocateMarketingVisuals(plan.items, generate, 1);
    expect(generate).toHaveBeenCalledTimes(1);
    expect(visuals.size).toBe(4);
    const bundle = toBundlePayload(plan, visuals) as { campaign: Record<string, unknown>; items: Array<Record<string, unknown>> };
    expect(bundle.campaign.audience_definition).toEqual(plan.campaign.audience_definition);
    for (const item of bundle.items) {
      expect(item.targeting).toEqual(plan.campaign.audience_definition);
      expect(item.content).toMatchObject({ mailing_version: "tok-mailing-v1", visual_status: "ready", visual_url: "https://assets.example/banner.jpg" });
      expect(item).not.toHaveProperty("approval_status");
      expect(item).not.toHaveProperty("status");
    }
  });
  it("rejects missing or duplicate copy, missing banner and a short window", () => {
    const plan = source(); plan.items[1].content.subject = plan.items[0].content.subject;
    expect(() => applyMailingOptions(plan, options, plan.campaign.starts_at, plan.campaign.ends_at)).toThrow();
    const missing = source(); missing.items[0].visual_prompt = null;
    expect(() => applyMailingOptions(missing, options, missing.campaign.starts_at, missing.campaign.ends_at)).toThrow();
    expect(() => applyMailingOptions(source(), options, "2026-10-18T07:00:00Z", "2026-10-19T07:00:00Z")).toThrow();
  });
  it("interprets the prompt only against known values and reports uncertainty", async () => {
    const facets = Object.fromEntries(Object.keys(MAILING_FIELDS).map((key) => [key, { items: [], next: null }])) as Record<MailingField, MailingFacetPage>;
    facets.city.items = [{ value: "Genève", count: 3 }]; facets.category.items = [{ value: "Pizzeria", count: 3 }];
    const selections = Object.fromEntries(Object.keys(MAILING_FIELDS).map((key) => [key, null]));
    provider.mockResolvedValue({ selections: { ...selections, city: ["Genève"], category: ["Pizzeria"] }, emailCount: 4, cadence: "weekly", unresolved: ["Le chiffre d’affaires n’est pas renseigné."], summary: "Pizzerias à Genève" });
    const result = await interpretMailingBrief("4 e-mails sur un mois aux pizzerias de Genève", facets);
    expect(result.mailingOptions.selections).toEqual({ city: ["Genève"], category: ["Pizzeria"] });
    expect(result.unresolved).toHaveLength(1);
    provider.mockResolvedValue({ selections: { city: ["Paris"] }, emailCount: 4, cadence: "weekly", unresolved: [], summary: "Paris" });
    await expect(interpretMailingBrief("Paris", facets)).rejects.toThrow();
  });
  it("uses the same escaped template at review and delivery, with a signed unsubscribe URL", () => {
    const content = { mailing_version: "tok-mailing-v1", subject: "Objet", headline: "Bonjour", body: '<script>alert("x")</script>', call_to_action: "Découvrir", visual_url: "https://assets.example/banner.jpg", visual_status: "ready" };
    expect(() => assertMailingReady({ ...content, visual_status: "pending_generation" })).toThrow();
    expect(() => assertMailingReady({ ...content, visual_url: "https://user:pass@example.com/x" })).toThrow();
    const result = prepareTargetedMailingContent(content, "https://example.com/unsubscribe?token=signed");
    expect(result.html).toContain("&lt;script&gt;");
    expect(result.html).not.toContain("<script>");
    expect(result.html).toContain("token=signed");
    expect(result.html).toContain("https://assets.example/banner.jpg");
    expect(renderTargetedMailingEmail({ subject: "Objet", headline: "Bonjour", body: content.body, callToAction: "Découvrir", visualUrl: content.visual_url }).html).toContain("https://www.thetok.ch/packs-restaurateur");
  });
});
