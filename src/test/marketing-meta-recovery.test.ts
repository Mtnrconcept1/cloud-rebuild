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

function clientFixture(options: {
  summary?: Record<string, unknown>;
  providerId?: string;
  paused?: boolean;
  approved?: boolean;
  persistFails?: boolean;
  completionFails?: boolean;
} = {}) {
  let summary = options.summary || {};
  let providerId = options.providerId || null;
  const completions: Record<string, unknown>[] = [];
  const filters: Array<[string, unknown]> = [];
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
      const query = {
        select: (value: string) => { columns = value; return query; },
        eq: (key: string, value: unknown) => { filters.push([key, value]); return query; },
        gt: () => query, order: () => query, limit: () => query,
        update: (value: Record<string, unknown>) => { patch = value; return query; },
        maybeSingle: async () => {
          if (table === "marketing_automations") return { data: { conditions: { global_pause: Boolean(options.paused) } }, error: null };
          if (table === "feature_flags") return { data: { is_active: true }, error: null };
          if (table === "marketing_integrations") return { data: {
            id: "integration-1", channel: "facebook", status: "connected",
            capabilities: { adapter_deployed: true }, secret_ref: "META_SYSTEM_USER_TOKEN",
            public_configuration: { page_id: "1409554725565734", graph_version: "v26.0" },
          }, error: null };
          if (patch) {
            if (patch.provider_external_id && options.persistFails) return { data: null, error: new Error("Offline") };
            summary = patch.result_summary as Record<string, unknown>;
            if (patch.provider_external_id) providerId = String(patch.provider_external_id);
            return { data: { id: item.id }, error: null };
          }
          if (columns.includes("approval_status")) return { data: {
            approval_status: options.approved === false ? "rejected" : "approved",
            approved_at: "2026-10-08T10:00:00Z", campaign_id: null,
          }, error: null };
          return { data: { provider_external_id: providerId, result_summary: summary,
            integration_id: "integration-1" }, error: null };
        },
        then: (resolve: (value: unknown) => unknown) => Promise.resolve({ error: null }).then(resolve),
      };
      return query;
    },
  };
  return { client: client as unknown as Parameters<typeof processMetaMarketingItem>[0], completions, filters };
}

beforeEach(() => {
  publish.mockReset();
  vi.stubGlobal("Deno", { env: { get: () => "server-only-test-credential" } });
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
