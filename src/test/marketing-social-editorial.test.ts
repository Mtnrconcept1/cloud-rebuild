import { describe, expect, it } from "vitest";
import { buildGuidedPlanSchema, buildPlanSchema, MarketingPlanError, toBundlePayload, validateGuidedPlan } from "../../supabase/functions/_shared/marketing-ai-plan";
import { applyCampaignOptions, parseCampaignOptions } from "../../supabase/functions/_shared/marketing-campaign-options";
import { cleanGeneratedPublicText, editorialHashtagPool, isNearDuplicateEditorialCopy, normalizeEditorialHashtags, normalizeGeneratedEditorial, SOCIAL_EDITORIAL_CATALOG, socialEditorialPrompt, TOK_PUBLIC_HOME } from "../../supabase/functions/_shared/marketing-social-editorial";
import { composeMetaCaption } from "../../supabase/functions/_shared/meta-publishing";

const channels = ["instagram", "facebook"];
const options = parseCampaignOptions({ templateIds: ["zero_attente", "studio_marketing"], postCount: 2, cadence: "daily", formatsByChannel: { instagram: ["1:1", "4:5"], facebook: ["1:1"] } }, channels)!;
function rawPlan() {
  return {
    campaign: { name: "Découvrir TOK", objective: "Découvrir les services TOK", summary: "Une campagne utile.", channels,
      starts_at: "2027-02-01T08:00:00Z", ends_at: "2027-02-03T08:00:00Z", audience_name: "Clients", audience_definition: { audience_kind: "client" } },
    items: Array.from({ length: 2 }, (_, index) => ({ title: `Un repas préparé ${index}`, primary_template_id: index === 0 ? "zero_attente" : "studio_marketing",
      scheduled_at: "2027-02-01T08:00:00Z", audience_name: "Clients", targeting: { audience_kind: "client" }, visual_prompt: `Chef TOK, scène ${index}`,
      channel_variants: channels.map((channel) => ({ channel, content: { subject: null, headline: `${channel} accroche ${index}`,
        body: channel === "instagram"
          ? index === 0 ? "Envie de préparer votre sortie ? Retrouvez TOK @tok_suisse." : "Une communication claire donne une autre voix au restaurant. Le Studio TOK aide à préparer ses prochains contenus @tok_suisse."
          : index === 0 ? "Préparez votre prochaine visite avec TOK." : "Présentez le savoir-faire du restaurant avec un contenu adapté à Facebook.",
        call_to_action: "Cliquez https://evil.example/auth", hashtags: ["#ZeroAttente", "#Restaurant", "#viral", "#Geneve"] } })),
    })),
  };
}
const validated = () => validateGuidedPlan(rawPlan(), channels, options.templateIds, options.postCount);
const expanded = () => applyCampaignOptions(validated(), options, channels, "2027-02-01T08:00:00Z", "2027-02-03T08:00:00Z", "Genève");

describe("network-specific generated editorial", () => {
  it("requires a selected primary topic and one response per channel in the guided schema while preserving legacy", () => {
    const schema = buildGuidedPlanSchema(channels, options.templateIds).schema.properties.items.items;
    expect(schema.required).toContain("channel_variants");
    expect(schema.properties.primary_template_id.enum).toEqual(options.templateIds);
    expect(schema.properties.channel_variants.minItems).toBe(2);
    expect(schema.properties).not.toHaveProperty("content");
    expect(buildPlanSchema(channels).schema.properties.items.items.properties).toHaveProperty("content");
  });
  it("persists different network copy but identical copy for formats within the same network", () => {
    const plan = expanded();
    expect(plan.items).toHaveLength(6);
    expect(plan.items[0].content).toEqual(plan.items[1].content);
    expect(plan.items[0].content.body).not.toBe(plan.items[2].content.body);
    expect(plan.items[0].visual_prompt).toBe(plan.items[2].visual_prompt);
    expect(plan.items[0].content.call_to_action).toBe("À consulter : https://www.thetok.ch/zero-attente");
    expect(plan.items[3].content.call_to_action).toBe(`À consulter : ${TOK_PUBLIC_HOME}`);
    const bundle = toBundlePayload(plan, new Map()) as { items: Array<{ content: Record<string, unknown> }> };
    expect(bundle.items[0].content.editorial).toMatchObject({ primary_template_id: "zero_attente", destination_url: "https://www.thetok.ch/zero-attente" });
    expect(bundle.items.every((item) => !("approval_status" in item))).toBe(true);
    expect(composeMetaCaption(plan.items[0].content).match(/https:\/\//g)).toHaveLength(1);
  });
  it.each(["missing", "duplicate", "extra", "unselected-topic", "numeric-tag", "empty-body"])("rejects %s model responses", (reason) => {
    const raw = rawPlan();
    if (reason === "missing") raw.items[0].channel_variants.pop();
    if (reason === "duplicate") raw.items[0].channel_variants[1].channel = "instagram";
    if (reason === "extra") raw.items[0].channel_variants[1].channel = "tiktok";
    if (reason === "unselected-topic") raw.items[0].primary_template_id = "photo_pro";
    if (reason === "numeric-tag") (raw.items[0].channel_variants[0].content.hashtags as unknown[]) = [4];
    if (reason === "empty-body") raw.items[0].channel_variants[1].content.body = "  ";
    expect(() => validateGuidedPlan(raw, channels, options.templateIds, 2)).toThrow(MarketingPlanError);
  });
  it("rejects reused copy across networks or posts even when mentions differ", () => {
    const acrossNetworks = validated();
    acrossNetworks.items[0].channel_variants![1].content.body = acrossNetworks.items[0].channel_variants![0].content.body;
    expect(() => applyCampaignOptions(acrossNetworks, options, channels, "2027-02-01T08:00:00Z", "2027-02-03T08:00:00Z")).toThrow("duplicate_editorial_copy");
    const acrossPosts = validated();
    acrossPosts.items[1].channel_variants![0].content.body = acrossPosts.items[0].channel_variants![0].content.body;
    expect(() => applyCampaignOptions(acrossPosts, options, channels, "2027-02-01T08:00:00Z", "2027-02-03T08:00:00Z")).toThrow("duplicate_editorial_copy");
  });
  it("rejects near-duplicate captions and repeated headlines before any visual generation", () => {
    expect(isNearDuplicateEditorialCopy(
      "Envie de préparer votre sortie ? Retrouvez TOK pour organiser votre prochaine visite au restaurant.",
      "Envie de préparer votre sortie ? Retrouvez TOK pour organiser autrement votre prochaine visite au restaurant.",
    )).toBe(true);
    const near = validated();
    near.items[1].channel_variants![0].content.body = "Envie de préparer votre sortie ? Retrouvez TOK @tok_suisse, avec une idée de plus pour votre prochaine visite.";
    expect(() => applyCampaignOptions(near, options, channels, "2027-02-01T08:00:00Z", "2027-02-03T08:00:00Z")).toThrow("near_duplicate_editorial_copy");

    const repeatedHeadline = validated();
    repeatedHeadline.items[1].channel_variants![0].content.headline = repeatedHeadline.items[0].channel_variants![0].content.headline;
    expect(() => applyCampaignOptions(repeatedHeadline, options, channels, "2027-02-01T08:00:00Z", "2027-02-03T08:00:00Z")).toThrow("duplicate_editorial_headline");
  });
  it("also rejects copy already present in recent Instagram history", () => {
    const current = validated();
    const recent = [{ channel: "instagram", headline: "Ancienne accroche", body: "Envie de préparer votre sortie ? Retrouvez TOK." }];
    expect(() => applyCampaignOptions(current, options, channels, "2027-02-01T08:00:00Z", "2027-02-03T08:00:00Z", "Genève", recent)).toThrow("duplicate_editorial_copy");
  });
  it("assigns a different server-owned visual family to consecutive posts and records it in the bundle", () => {
    const plan = expanded();
    expect(plan.items[0].editorial?.visual_family).toBeTruthy();
    expect(plan.items[3].editorial?.visual_family).toBeTruthy();
    expect(plan.items[0].editorial?.visual_family).not.toBe(plan.items[3].editorial?.visual_family);
    expect(plan.items[0].visual_prompt).toContain("FAMILLE VISUELLE SERVEUR 1");
    expect(plan.items[3].visual_prompt).toContain("FAMILLE VISUELLE SERVEUR 2");
    expect(plan.items[0].visual_prompt).toContain(JSON.stringify("Un repas préparé 0"));
    const bundle = toBundlePayload(plan, new Map()) as { items: Array<{ content: { editorial?: Record<string, string> } }> };
    expect(bundle.items[0].content.editorial?.variation_id).toContain("guided:1:zero_attente:");
    expect(bundle.items[3].content.editorial?.variation_id).toContain("guided:2:studio_marketing:");
  });
  it("explicitly asks the provider to rotate copy structures instead of paraphrasing one template", () => {
    const prompt = socialEditorialPrompt(options.templateIds, "Genève").join("\n");
    expect(prompt).toContain("VARIATION OBLIGATOIRE");
    expect(prompt).toContain("punchline très courte en une phrase");
    expect(prompt).toContain("même headline");
    expect(prompt).toContain("seulement paraphrasée");
  });

  it("requires coverage of all selected topics when there are enough posts", () => {
    const raw = rawPlan(); raw.items[1].primary_template_id = "zero_attente";
    expect(() => validateGuidedPlan(raw, channels, options.templateIds, 2)).toThrow("missing_selected_template");
    raw.items.pop();
    expect(validateGuidedPlan(raw, channels, options.templateIds, 1).items).toHaveLength(1);
  });
  it("removes hallucinated URLs and partner mentions from every generated public field before adding one canonical CTA", () => {
    const raw = rawPlan();
    raw.items[0].visual_prompt += " https://evil.example/image @fake #viral";
    const source = raw.items[0].channel_variants[0].content;
    source.headline = "Préparez votre visite https://evil.example/auth @fake #fyp";
    source.body = "Un repas bien préparé. [Découvrir](https://www.thetok.ch/auth) www.evil.example, thetok.ch/dashboard /auth?next=foo @partenaire @tok_suisse #viral lien en bio";
    const plan = applyCampaignOptions(validateGuidedPlan(raw, channels, options.templateIds, 2), options, channels, "2027-02-01T08:00:00Z", "2027-02-03T08:00:00Z");
    const caption = composeMetaCaption(plan.items[0].content);
    expect(caption).not.toMatch(/evil|\/auth|dashboard|@partenaire|@fake|#viral|#fyp|lien en bio/);
    expect(caption.match(/https:\/\//g)).toHaveLength(1);
    expect(caption.match(/@tok_suisse/g)).toHaveLength(1);
    expect(plan.items[0].visual_prompt).not.toMatch(/https|@fake|#viral/);
  });
});

describe("bounded, curated hashtag and mention controls", () => {
  it("keeps IG between three and five relevant tags and Facebook between zero and two", () => {
    const pool = editorialHashtagPool("zero_attente", "Genève");
    const tags = normalizeEditorialHashtags([...pool, "#ZeroAttente", "#ZEROATTENTE", "#fyp", "#viral", "#fake", "#bad-tag", "#foo bar", "#123"], "instagram", "zero_attente", "Genève");
    expect(tags).toHaveLength(5);
    expect(new Set(tags.map((tag) => tag.toLowerCase())).size).toBe(5);
    expect(tags.every((tag) => /^#[\p{L}][\p{L}\p{N}_]{1,39}$/u.test(tag))).toBe(true);
    expect(normalizeEditorialHashtags(["#fyp", "#Geneve"], "instagram", "zero_attente")).toHaveLength(3);
    expect(normalizeEditorialHashtags(pool, "facebook", "zero_attente")).toHaveLength(2);
    expect(normalizeEditorialHashtags(["#fyp"], "facebook", "zero_attente")).toEqual([]);
    expect(normalizeEditorialHashtags(pool, "tok_news", "zero_attente")).toEqual([]);
  });
  it("does not invent local hashtags without an explicit location in the brief", () => {
    expect(editorialHashtagPool("photo_pro")).not.toContain("Geneve");
    expect(editorialHashtagPool("photo_pro", "Restaurateurs à Genève et Lausanne")).toEqual(expect.arrayContaining(["Geneve", "Lausanne"]));
  });
  it("retains only the verified Instagram mention, once, and no Facebook handles", () => {
    const content = { ...rawPlan().items[0].channel_variants[0].content, body: "Découvrez TOK @TOK_SUISSE @tok_suisse @fake @tok_suisse_bad." };
    expect(normalizeGeneratedEditorial(content, "instagram", "discovery").body.match(/@tok_suisse/g)).toHaveLength(1);
    expect(normalizeGeneratedEditorial(content, "facebook", "discovery").body).not.toContain("@");
    expect(normalizeGeneratedEditorial({ ...content, body: "Découvrez TOK." }, "instagram", "discovery").body).not.toContain("@");
    expect(normalizeGeneratedEditorial({ ...content, body: "Découvrez @tok_suisse." }, "instagram", "discovery").body).toContain("@tok_suisse");
    expect(normalizeGeneratedEditorial({ ...content, body: "Découvrez @tok_suisse.fake." }, "instagram", "discovery").body).not.toContain("@");
  });
  it("removes direct, markdown, Unicode-hidden, bare-domain, protocol and relative URLs", () => {
    expect(cleanGeneratedPublicText("Texte https://evil.test/x [ici](https://evil.test/x) www.evil.ch /dashboard (/auth) https://e\u200bvil.test javascript:alert(1) mailto:fake@evil.ch")).not.toMatch(/evil|dashboard|\/auth|javascript|mailto/);
  });
  it("cannot reconstruct HTML tags from malformed nested markup", () => {
    expect(cleanGeneratedPublicText("Cuisine <scr<script>ipt>alert(1)</scr<script>ipt> <img src=x onerror=alert(1)>")).not.toMatch(/[<>]/);
  });
  it("rejects overlong copy instead of silently truncating it", () => {
    const content = { ...rawPlan().items[0].channel_variants[0].content, body: "a".repeat(1401) };
    expect(() => normalizeGeneratedEditorial(content, "instagram", "discovery")).toThrow("editorial_content_too_long");
    expect(() => cleanGeneratedPublicText("a".repeat(121), 120)).toThrow("editorial_content_too_long");
  });
  it("has all twenty destinations and falls back to the public homepage for protected tools", () => {
    expect(Object.keys(SOCIAL_EDITORIAL_CATALOG)).toHaveLength(20);
    for (const id of ["studio_marketing", "photo_pro", "plan_salle", "menu_digital", "avis_clients", "actualites_restaurant"] as const) expect(SOCIAL_EDITORIAL_CATALOG[id].url).toBe(TOK_PUBLIC_HOME);
    expect(SOCIAL_EDITORIAL_CATALOG.livraison.url).toBe("https://www.thetok.ch/recherche?delivery=true");
    expect(SOCIAL_EDITORIAL_CATALOG.tables_5_chf.url).toContain("/restaurateurs/alternative-commission-couvert");
  });
  it("guides free briefs without introducing guided-only schema fields", () => {
    const prompt = socialEditorialPrompt(["zero_attente"], "", false).join("\n");
    expect(prompt).not.toContain("primary_template_id");
    expect(prompt).not.toContain("channel_variants");
    expect(prompt).toContain("https://www.thetok.ch/zero-attente");
    expect(prompt).toContain("@tok_suisse");
  });
});
