import { describe, expect, it, vi } from "vitest";
import { applyCampaignOptions, buildCampaignSlots, CAMPAIGN_TEMPLATES, CampaignOptionsError, campaignOptionCounts, parseCampaignOptions } from "../../supabase/functions/_shared/marketing-campaign-options";
import { MARKETING_CHANNELS, toBundlePayload, validatePlan, type MarketingPlan } from "../../supabase/functions/_shared/marketing-ai-plan";
import { allocateMarketingVisuals } from "../../supabase/functions/_shared/marketing-visual-allocation";
import { parseCampaignOptions as parseCampaignRequest } from "../../supabase/functions/_shared/marketing-campaign-request";
const channels = ["instagram", "facebook"];
const options = () => ({ templateIds: ["zero_attente", "anti_gaspi"], postCount: 3, cadence: "daily", formatsByChannel: { instagram: ["1:1", "9:16"], facebook: ["1:1", "9:16"] } });
function plan(): MarketingPlan {
  return { campaign: { name: "TOK", objective: "Découverte", summary: "Campagne découverte", channels: ["instagram"], starts_at: "2026-10-24T08:00:00Z", ends_at: "2026-11-24T08:00:00Z", audience_name: "Clients", audience_definition: { audience_kind: "client" } },
    items: Array.from({ length: 3 }, (_, index) => ({ title: `Publication ${index}`, channel: "instagram", scheduled_at: "2026-10-24T08:00:00Z", audience_name: "Clients", targeting: { audience_kind: "client" }, content: { subject: null, headline: "TOK", body: `Découverte ${index}`, call_to_action: "Découvrir", hashtags: [] }, visual_prompt: `Chef TOK ${index}` })) };
}
describe("guided campaign server contract", () => {
  it("uses the caller-supplied template allowlist in the import-free request contract", () => {
    const ids = CAMPAIGN_TEMPLATES.map((template) => template.id);
    expect(parseCampaignRequest(options(), channels, ids)).toEqual(parseCampaignOptions(options(), channels));
    expect(() => parseCampaignRequest(options(), channels, ["zero_attente"])).toThrow(CampaignOptionsError);
    expect(() => parseCampaignRequest(options(), channels, [])).toThrow("campaign_templates_invalid");
  });
  it("preserves existing requests and accepts only explicit, bounded guided settings", () => {
    expect(parseCampaignOptions(undefined, channels)).toBeUndefined();
    const parsed = parseCampaignOptions(options(), channels)!;
    expect(campaignOptionCounts(parsed)).toEqual({ itemCount: 12, visualCount: 6 });
    expect(parseCampaignOptions({ ...options(), templateIds: CAMPAIGN_TEMPLATES.map((template) => template.id) }, channels)?.templateIds).toHaveLength(20);
  });
  it.each([
    null, { ...options(), unexpected: true }, { ...options(), templateIds: ["fake"] },
    { ...options(), templateIds: ["zero_attente", "zero_attente"] }, { ...options(), postCount: "3" },
    { ...options(), postCount: 1.5 }, { ...options(), cadence: "hourly" },
    { ...options(), formatsByChannel: { instagram: ["1:1"] } },
    { ...options(), formatsByChannel: { instagram: ["1:1"], facebook: ["1:1"], tiktok: ["1:1"] } },
    { ...options(), formatsByChannel: { instagram: ["1:1", "1:1"], facebook: ["1:1"] } },
    { ...options(), formatsByChannel: { instagram: ["3:2"], facebook: ["1:1"] } },
  ])("rejects malformed options before generation: %j", (value) => {
    expect(() => parseCampaignOptions(value, channels)).toThrow(CampaignOptionsError);
  });
  it("refuses excessive calendar items and excessive unique images independently", () => {
    expect(() => parseCampaignOptions({ ...options(), postCount: 4 }, channels)).toThrow("campaign_too_many_variants");
    expect(() => parseCampaignOptions({ ...options(), postCount: 4, formatsByChannel: { instagram: ["1:1", "9:16"] } }, ["instagram"])).toThrow("campaign_too_many_visuals");
    expect(() => parseCampaignOptions(options(), ["email"])).toThrow("campaign_channels_invalid");
  });
  it("creates exact channel/format variants and keeps the Swiss local hour through DST", () => {
    const parsed = parseCampaignOptions(options(), channels)!;
    const slots = buildCampaignSlots(parsed, channels, "2026-10-24T08:00:00Z");
    expect(slots).toHaveLength(12);
    expect(slots[4].scheduledAt).toBe("2026-10-25T09:00:00.000Z");
    expect(buildCampaignSlots(parsed, channels, "2027-03-27T09:00:00Z")[4].scheduledAt).toBe("2027-03-28T08:00:00.000Z");
    const output = applyCampaignOptions(plan(), parsed, channels, "2026-10-24T08:00:00Z", "2026-11-01T08:00:00Z");
    expect(output.items.map((item) => [item.channel, item.visual_format, item.scheduled_at])).toEqual(slots.map((slot) => [slot.channel, slot.format, slot.scheduledAt]));
    expect(output.items[0].content.body).toBe(output.items[3].content.body);
    expect(output.campaign.channels).toEqual(channels);
    const bundle = toBundlePayload(output, new Map()) as { items: Array<{ content: Record<string, unknown> }> };
    expect(bundle.items[0].content).toMatchObject({ visual_format: "1:1", post_index: 0, template_ids: ["zero_attente", "anti_gaspi"], visual_status: "pending_generation" });
    expect(bundle.items.every((item) => !("status" in item) && !("approval_status" in item))).toBe(true);
  });
  it("keeps all ten public posts of a mixed five-theme campaign within its approved audience", () => {
    const themes = ["zero_attente", "anti_gaspi", "studio_marketing", "photo_pro", "plan_salle"];
    const parsed = parseCampaignOptions({ templateIds: themes, postCount: 5, cadence: "daily",
      formatsByChannel: { instagram: ["1:1"], facebook: ["1:1"] } }, channels)!;
    const generated = plan();
    generated.campaign.audience_definition = { audience_kind: "mixed", city: " Genève ", canton: "GE", category: "" };
    generated.items = themes.map((theme, index) => ({ ...generated.items[0], title: theme,
      audience_name: index < 2 ? "Clients Genève" : "Restaurateurs Genève",
      targeting: { audience_kind: index < 2 ? "client" : "restaurant", city: "Genève", canton: "GE",
        contact_type: index < 2 ? "registered_user" : "restaurant_prospect" },
      content: { ...generated.items[0].content, body: `Découvrir ${theme}` },
    }));
    const expanded = applyCampaignOptions(validatePlan(generated, channels), parsed, channels,
      "2026-10-24T08:00:00Z", "2026-11-01T08:00:00Z");
    const before = structuredClone(expanded);
    const bundle = toBundlePayload(expanded, new Map()) as {
      campaign: { audience_definition: Record<string, string> };
      items: Array<{ channel: string; targeting: Record<string, string>; audience_name: string; content: { body: string } }>;
    };
    expect(bundle.campaign.audience_definition).toEqual({ audience_kind: "mixed", city: "Genève", canton: "GE" });
    expect(bundle.items).toHaveLength(10);
    expect(bundle.items.filter((item) => item.channel === "instagram")).toHaveLength(5);
    expect(bundle.items.filter((item) => item.channel === "facebook")).toHaveLength(5);
    bundle.items.forEach((item, index) => {
      expect(item.targeting).toEqual(bundle.campaign.audience_definition);
      expect(item.audience_name).toBe(expanded.items[index].audience_name);
      expect(item.content.body).toBe(expanded.items[index].content.body);
      expect(item).not.toHaveProperty("approval_status");
      expect(item).not.toHaveProperty("status");
    });
    expect(expanded).toEqual(before);
  });
  it.each(MARKETING_CHANNELS.filter((channel) => channel !== "instagram" && channel !== "facebook"))(
    "does not broaden the generated %s audience to the campaign audience", (channel) => {
      const generated = plan();
      generated.campaign.audience_definition = { audience_kind: "mixed", canton: "GE" };
      generated.items = [{ ...generated.items[0], channel,
        targeting: { audience_kind: "restaurant", canton: "GE", contact_type: "restaurant_prospect" } }];
      const bundle = toBundlePayload(generated, new Map()) as { items: Array<{ targeting: Record<string, string> }> };
      expect(bundle.items[0].targeting).toEqual(generated.items[0].targeting);
      expect(bundle.items[0].targeting).not.toEqual(generated.campaign.audience_definition);
    },
  );
  it.each(["every_other_day", "weekly"] as const)("enforces %s cadence", (cadence) => {
    const parsed = parseCampaignOptions({ ...options(), cadence }, channels)!;
    const slots = buildCampaignSlots(parsed, channels, "2026-11-01T09:00:00Z");
    expect(slots[4].scheduledAt).toBe(cadence === "weekly" ? "2026-11-08T09:00:00.000Z" : "2026-11-03T09:00:00.000Z");
  });
  it("rejects a cadence slot whose local hour does not exist during the spring clock change", () => {
    const parsed = parseCampaignOptions(options(), channels)!;
    expect(() => buildCampaignSlots(parsed, channels, "2027-03-27T01:30:00Z")).toThrow("campaign_local_time_unavailable");
  });
  it("preserves twice-weekly and fortnightly schedules from the earlier builder", () => {
    const fortnightly = parseCampaignOptions({ ...options(), cadence: "biweekly" }, channels)!;
    expect(buildCampaignSlots(fortnightly, channels, "2026-11-01T09:00:00Z")[4].scheduledAt).toBe("2026-11-15T09:00:00.000Z");
    const twiceWeekly = parseCampaignOptions({ ...options(), postCount: 4, cadence: "twice_weekly", formatsByChannel: { instagram: ["1:1"] } }, ["instagram"])!;
    expect(buildCampaignSlots(twiceWeekly, ["instagram"], "2026-11-01T09:00:00Z").map((slot) => slot.scheduledAt)).toEqual([
      "2026-11-01T09:00:00.000Z", "2026-11-04T09:00:00.000Z", "2026-11-08T09:00:00.000Z", "2026-11-11T09:00:00.000Z",
    ]);
  });
  it("refuses missing posts, missing image briefs and a window too short", () => {
    const parsed = parseCampaignOptions(options(), channels)!;
    const missing = plan(); missing.items.pop();
    expect(() => applyCampaignOptions(missing, parsed, channels, "2026-10-24T08:00:00Z", "2026-11-01T08:00:00Z")).toThrow("item_count_mismatch");
    expect(() => applyCampaignOptions(plan(), parsed, channels, "2026-10-24T08:00:00Z", "2026-10-25T08:00:00Z")).toThrow("campaign_window_too_short");
    const noVisual = plan(); noVisual.items[0].visual_prompt = null;
    expect(() => applyCampaignOptions(noVisual, parsed, channels, "2026-10-24T08:00:00Z", "2026-11-01T08:00:00Z")).toThrow("missing_visual_prompt");
  });
  it("shares an image across networks only when both post brief and ratio match", async () => {
    const parsed = parseCampaignOptions(options(), channels)!;
    const output = applyCampaignOptions(plan(), parsed, channels, "2026-10-24T08:00:00Z", "2026-11-01T08:00:00Z");
    const generate = vi.fn(async (_: string, index: number) => `https://example.com/${index}.jpg`);
    const visuals = await allocateMarketingVisuals(output.items, generate, 6);
    expect(generate).toHaveBeenCalledTimes(6); expect(visuals.size).toBe(12);
    expect(visuals.get(0)).toBe(visuals.get(2)); expect(visuals.get(0)).not.toBe(visuals.get(1));
  });
  it("starts bounded image work concurrently so each timeout does not add to the request duration", async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const generate = vi.fn(async (_: string, index: number) => { await gate; return `https://example.com/${index}.jpg`; });
    const pending = allocateMarketingVisuals([{ visual_prompt: "A" }, { visual_prompt: "B" }, { visual_prompt: "C" }], generate, 2);
    await Promise.resolve();
    expect(generate).toHaveBeenCalledTimes(2);
    release();
    expect((await pending).size).toBe(2);
  });
});
