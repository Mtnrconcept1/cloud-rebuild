import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { publish } = vi.hoisted(() => ({ publish: vi.fn() }));
vi.mock("../../supabase/functions/_shared/auth.ts", () => ({
  HttpError: class extends Error {},
}));
vi.mock("../../supabase/functions/_shared/meta-publishing.ts", async (importOriginal) => ({
  ...await importOriginal<typeof import("../../supabase/functions/_shared/meta-publishing")>(),
  publishMetaContent: publish,
}));
import { processMetaMarketingItem } from "../../supabase/functions/_shared/meta-marketing-orchestrator";
import { MetaPublishError } from "../../supabase/functions/_shared/meta-publishing";

const item = { id: "item-1", channel: "facebook", content: { body: "TOK" },
  lease_token: "lease-1", attempt_count: 1, max_attempts: 3 };
const instagramAccountId = "17841447348180505";
const dailyApprovalSource = "daily-series-standing-authorization";
const dailyAuthorization = {
  account_id: instagramAccountId, authorized_at: "2026-10-20T12:00:00+00:00", series_version: 3,
};
const dailyItem = { ...item, channel: "instagram", content: {
  body: "TOK", generated_by: "marketing-daily-generator", daily_run_id: "run-1", daily_series_id: "series-1",
  daily_publication_authorization: dailyAuthorization,
} };

function clientFixture(options: {
  summary?: Record<string, unknown>;
  providerId?: string;
  paused?: boolean;
  approved?: boolean;
  persistFails?: boolean;
  completionFails?: boolean;
  item?: Parameters<typeof processMetaMarketingItem>[1];
  campaignId?: string;
  approvalSource?: string;
  accountId?: string;
  storedContent?: Record<string, unknown>;
  replaceContentAtMarker?: Record<string, unknown>;
  campaignName?: string;
  scheduledAt?: string;
} = {}) {
  let summary = options.summary || {};
  let providerId = options.providerId || null;
  const claimedItem = options.item || item;
  let storedContent = options.storedContent || claimedItem.content;
  let accountId = options.accountId || instagramAccountId;
  let integrationStatus = "connected";
  let approvalSource = options.approvalSource || "";
  let version = 1;
  const completions: Record<string, unknown>[] = [];
  const filters: Array<[string, unknown]> = [];
  const integrationUpdates: Record<string, unknown>[] = [];
  const client = {
    rpc: vi.fn(async (name: string, args?: Record<string, unknown>) => {
      if (name === "marketing_runtime_enabled") return { data: !options.paused, error: null };
      completions.push(args || {});
      if (options.completionFails) return { data: null, error: new Error("Database offline") };
      summary = args?.p_result as Record<string, unknown>;
      return { data: { status: args?.p_status }, error: null };
    }),
    from: (table: string) => {
      let patch: Record<string, unknown> | undefined;
      let columns = "";
      let expectedVersion: unknown;
      const query = {
        select: (value: string) => { columns = value; return query; },
        eq: (key: string, value: unknown) => {
          filters.push([key, value]);
          if (key === "version") expectedVersion = value;
          return query;
        },
        gt: () => query, order: () => query, limit: () => query,
        update: (value: Record<string, unknown>) => {
          patch = value;
          if (table === "marketing_integrations") integrationUpdates.push(value);
          return query;
        },
        maybeSingle: async () => {
          if (table === "marketing_automations") return { data: { conditions: { global_pause: Boolean(options.paused) } }, error: null };
          if (table === "feature_flags") return { data: { is_active: true }, error: null };
          if (table === "marketing_integrations") return { data: {
            id: "integration-1", channel: claimedItem.channel, status: integrationStatus,
            capabilities: { adapter_deployed: true }, secret_ref: "META_SYSTEM_USER_TOKEN",
            public_configuration: { page_id: "1409554725565734", ig_user_id: accountId, graph_version: "v26.0" },
          }, error: null };
          if (table === "marketing_campaigns") return { data: {
            name: options.campaignName || "Campagne", status: "draft", approved_at: "2026-10-20T12:05:00Z", metadata: { approval_source: approvalSource },
          }, error: null };
          if (patch) {
            if (!patch.provider_external_id && options.replaceContentAtMarker) {
              storedContent = options.replaceContentAtMarker;
              version += 1;
            }
            if (expectedVersion !== undefined && expectedVersion !== version) return { data: null, error: null };
            if (patch.provider_external_id && options.persistFails) return { data: null, error: new Error("Offline") };
            summary = patch.result_summary as Record<string, unknown>;
            if (patch.provider_external_id) providerId = String(patch.provider_external_id);
            return { data: { id: claimedItem.id }, error: null };
          }
          if (columns.includes("approval_status")) return { data: {
            approval_status: options.approved === false ? "rejected" : "approved",
            approved_at: "2026-10-08T10:00:00Z", campaign_id: options.campaignId || null,
            content: storedContent, integration_id: "integration-1", version,
          }, error: null };
          return { data: { provider_external_id: providerId, result_summary: summary,
            integration_id: "integration-1", campaign_id: options.campaignId || null, content: storedContent,
            scheduled_at: options.scheduledAt || null }, error: null };
        },
        then: (resolve: (value: unknown) => unknown) => Promise.resolve({ error: null }).then(resolve),
      };
      return query;
    },
  };
  return { client: client as unknown as Parameters<typeof processMetaMarketingItem>[0], completions, filters, integrationUpdates,
    setStoredContent: (content: Record<string, unknown>) => { storedContent = content; version += 1; },
    setAccountId: (value: string) => { accountId = value; },
    setIntegrationStatus: (value: string) => { integrationStatus = value; },
    setApprovalSource: (value: string) => { approvalSource = value; },
  };
}

beforeEach(() => {
  publish.mockReset();
  vi.stubGlobal("Deno", { env: { get: () => "server-only-test-credential" } });
});

describe("Meta daily publication destination", () => {
  beforeEach(() => {
    publish.mockImplementation(async ({ beforeExternalPublish }) => {
      await beforeExternalPublish();
      return { providerExternalId: "123456789", graphVersion: "v26.0", instagramUserId: instagramAccountId };
    });
  });

  it("publishes the daily item only to the Instagram account named by its standing authorization", async () => {
    const fixture = clientFixture({ item: dailyItem, campaignId: "campaign-1", approvalSource: dailyApprovalSource });
    expect(await processMetaMarketingItem(fixture.client, dailyItem)).toMatchObject({ status: "published", recovered: false });
    expect(publish).toHaveBeenCalledOnce();
    expect(publish.mock.calls[0][0].config.instagramUserId).toBe(instagramAccountId);
  });

  it("rejects a changed Instagram destination before any provider call", async () => {
    const fixture = clientFixture({ item: dailyItem, campaignId: "campaign-1", approvalSource: dailyApprovalSource,
      accountId: "17841440000000000" });
    expect(await processMetaMarketingItem(fixture.client, dailyItem)).toMatchObject({
      status: "failed", error: "meta_daily_account_mismatch", ambiguous: false,
    });
    expect(publish).not.toHaveBeenCalled();
  });

  it.each([undefined, null, {}, { ...dailyAuthorization, account_id: "" },
    { ...dailyAuthorization, account_id: 123456789 }, { ...dailyAuthorization, account_id: "not-an-account" },
    { ...dailyAuthorization, authorized_at: "invalid" }, { ...dailyAuthorization, series_version: 0 },
  ])("rejects a missing or invalid daily authorization before any provider call: %j", async (authorization) => {
    const content: Record<string, unknown> = { body: "TOK", generated_by: "marketing-daily-generator" };
    if (authorization !== undefined) content.daily_publication_authorization = authorization;
    const claimedItem = { ...dailyItem, content };
    const fixture = clientFixture({ item: claimedItem, campaignId: "campaign-1", approvalSource: dailyApprovalSource });
    expect(await processMetaMarketingItem(fixture.client, claimedItem)).toMatchObject({
      status: "failed", error: "meta_daily_authorization_invalid", ambiguous: false,
    });
    expect(publish).not.toHaveBeenCalled();
  });

  it("rejects a daily authorization removed from the stored item after it was claimed", async () => {
    const fixture = clientFixture({ item: dailyItem, campaignId: "campaign-1", approvalSource: dailyApprovalSource,
      storedContent: { body: "TOK", generated_by: "marketing-daily-generator" } });
    expect(await processMetaMarketingItem(fixture.client, dailyItem)).toMatchObject({
      status: "failed", error: "meta_daily_authorization_invalid", ambiguous: false,
    });
    expect(publish).not.toHaveBeenCalled();
  });

  it("rejects a changed authorization snapshot before preparing media", async () => {
    const fixture = clientFixture({ item: dailyItem, campaignId: "campaign-1", approvalSource: dailyApprovalSource,
      storedContent: { ...dailyItem.content, daily_publication_authorization: { ...dailyAuthorization, series_version: 4 } } });
    expect(await processMetaMarketingItem(fixture.client, dailyItem)).toMatchObject({
      status: "failed", error: "meta_daily_authorization_changed", ambiguous: false,
    });
    expect(publish).not.toHaveBeenCalled();
  });

  it.each(["account", "authorization", "approval source", "integration status"])("rechecks the %s immediately before publication", async (change) => {
    const fixture = clientFixture({ item: dailyItem, campaignId: "campaign-1", approvalSource: dailyApprovalSource });
    let externalPosts = 0;
    publish.mockImplementation(async ({ beforeExternalPublish }) => {
      if (change === "account") fixture.setAccountId("17841440000000000");
      if (change === "authorization") fixture.setStoredContent({ ...dailyItem.content,
        daily_publication_authorization: { ...dailyAuthorization, series_version: 4 } });
      if (change === "approval source") fixture.setApprovalSource("manual-review");
      if (change === "integration status") fixture.setIntegrationStatus("disabled");
      await beforeExternalPublish();
      externalPosts += 1;
      return { providerExternalId: "123456789" };
    });
    expect(await processMetaMarketingItem(fixture.client, dailyItem)).toMatchObject({ status: "failed", ambiguous: false });
    expect(externalPosts).toBe(0);
    expect(fixture.completions[0].p_result).not.toHaveProperty("meta_publish_started_at");
    for (const update of fixture.integrationUpdates) expect(update).not.toHaveProperty("status");
  });

  it("does not publish when the stored item changes between the final check and marker write", async () => {
    const fixture = clientFixture({ item: dailyItem, campaignId: "campaign-1", approvalSource: dailyApprovalSource,
      replaceContentAtMarker: { ...dailyItem.content, daily_publication_authorization: { ...dailyAuthorization, series_version: 4 } } });
    let externalPosts = 0;
    publish.mockImplementation(async ({ beforeExternalPublish }) => {
      await beforeExternalPublish();
      externalPosts += 1;
      return { providerExternalId: "123456789" };
    });
    expect(await processMetaMarketingItem(fixture.client, dailyItem)).toMatchObject({
      status: "retrying", error: "meta_publish_marker_persist_failed", ambiguous: false,
    });
    expect(externalPosts).toBe(0);
    expect(fixture.completions[0].p_result).not.toHaveProperty("meta_publish_started_at");
  });

  it.each(["facebook", "instagram"])("preserves manually approved %s posts without a daily mandate", async (channel) => {
    const manual = { ...item, channel, content: { body: "TOK", generated_by: "marketing-daily-generator" } };
    const fixture = clientFixture({ item: manual, campaignId: "campaign-1", approvalSource: "manual-review" });
    expect(await processMetaMarketingItem(fixture.client, manual)).toMatchObject({ status: "published" });
    expect(publish).toHaveBeenCalledOnce();
  });

  it("recovers a known provider id after the integration changes without calling Meta again", async () => {
    const fixture = clientFixture({ item: dailyItem, campaignId: "campaign-1", approvalSource: dailyApprovalSource,
      accountId: "17841440000000000", providerId: "123456789", storedContent: {} });
    expect(await processMetaMarketingItem(fixture.client, dailyItem)).toMatchObject({ status: "published", recovered: true });
    expect(publish).not.toHaveBeenCalled();
  });
});

describe("Meta publication UTMs", () => {
  const itemId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
  const campaignItem = { ...item, id: itemId };

  it("tags links from the campaign name, the scheduled Swiss month and the calendar item id", async () => {
    publish.mockImplementation(async ({ beforeExternalPublish }) => {
      await beforeExternalPublish();
      return { providerExternalId: "123456789", graphVersion: "v26.0", utmApplied: true };
    });
    const fixture = clientFixture({ item: campaignItem, campaignId: "campaign-1",
      campaignName: "Guide Carouge terrasses", scheduledAt: "2026-11-02T08:00:00Z" });
    expect(await processMetaMarketingItem(fixture.client, campaignItem)).toMatchObject({ status: "published" });
    expect(publish.mock.calls[0][0].tagLinks("Voir https://www.thetok.ch/zero-attente"))
      .toBe(`Voir https://www.thetok.ch/zero-attente?utm_source=facebook&utm_medium=social&utm_campaign=guide-carouge-terrasses_202611&utm_content=${itemId}`);
    expect(fixture.completions.at(-1)?.p_result).toMatchObject({
      utm_applied: true, utm_campaign: "guide-carouge-terrasses_202611",
    });
  });

  it("records an untagged publication when the caption had no TOK link", async () => {
    publish.mockImplementation(async ({ beforeExternalPublish }) => {
      await beforeExternalPublish();
      return { providerExternalId: "123456789", graphVersion: "v26.0", utmApplied: false };
    });
    const fixture = clientFixture({ item: campaignItem, campaignId: "campaign-1" });
    await processMetaMarketingItem(fixture.client, campaignItem);
    const result = fixture.completions.at(-1)?.p_result as Record<string, unknown>;
    expect(result.utm_applied).toBe(false);
    expect(result).not.toHaveProperty("utm_campaign");
  });
});

describe("Meta durable publication recovery", () => {
  it("keeps Meta outside the generic completion fallback and claims bounded work", () => {
    const source = readFileSync("supabase/functions/marketing-orchestrator/index.ts", "utf8");
    const handler = source.slice(source.indexOf("async function processItem"), source.indexOf("async function processDelivery"));
    expect(handler.indexOf("return await processMetaMarketingItem")).toBeLessThan(handler.indexOf("try {"));
    expect(source).toContain("const MAX_ITEMS_PER_RUN = 1;");
    expect(source).toContain("p_limit: Math.min(MAX_ITEMS_PER_RUN, limit)");
  });
  it("recovers a stored provider id without publishing again", async () => {
    const fixture = clientFixture({ providerId: "123456789" });
    const result = await processMetaMarketingItem(fixture.client, item);
    expect(result).toMatchObject({ status: "published", recovered: true });
    expect(publish).not.toHaveBeenCalled();
  });

  it("requires reconciliation when a previous worker stopped after marking publication", async () => {
    const fixture = clientFixture({ summary: { meta_publish_started_at: "2026-10-08T10:00:00Z" } });
    expect(await processMetaMarketingItem(fixture.client, item)).toMatchObject({
      status: "failed", reconciliationRequired: true,
    });
    expect(publish).not.toHaveBeenCalled();
    expect(fixture.completions[0].p_result).toMatchObject({ external_effect_unknown: true });
  });

  it.each([{ paused: true }, { approved: false }])("checks current approval and runtime before the publishing POST: %j", async (options) => {
    let externalPosts = 0;
    publish.mockImplementation(async ({ beforeExternalPublish }) => {
      await beforeExternalPublish();
      externalPosts += 1;
      return { providerExternalId: "123456789" };
    });
    const fixture = clientFixture(options);
    await processMetaMarketingItem(fixture.client, item);
    expect(externalPosts).toBe(0);
  });

  it("preserves the successful provider result when saving it fails", async () => {
    publish.mockImplementation(async ({ beforeExternalPublish }) => {
      await beforeExternalPublish();
      return { providerExternalId: "123456789", graphVersion: "v26.0", pageId: "1409554725565734" };
    });
    const fixture = clientFixture({ persistFails: true });
    expect(await processMetaMarketingItem(fixture.client, item)).toMatchObject({ status: "failed", ambiguous: true });
    expect(fixture.completions[0].p_result).toMatchObject({ provider_external_id: "123456789", external_effect_committed: true });
    expect(fixture.filters).toContainEqual(["id", "integration-1"]);
  });

  it("propagates a database completion failure without erasing the durable marker", async () => {
    publish.mockImplementation(async ({ beforeExternalPublish }) => {
      await beforeExternalPublish();
      throw new MetaPublishError("meta_publish_outcome_unknown", { ambiguous: true });
    });
    const fixture = clientFixture({ completionFails: true });
    await expect(processMetaMarketingItem(fixture.client, item)).rejects.toThrow("Database offline");
    expect(fixture.completions[0].p_result).toMatchObject({
      external_effect_unknown: true, reconciliation_required: true,
    });
    expect(fixture.completions[0].p_result).toHaveProperty("meta_publish_started_at");
  });
});
