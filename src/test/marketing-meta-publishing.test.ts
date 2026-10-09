import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";

import {
  MetaPublishError,
  META_REQUEST_TIMEOUT_MS,
  buildMetaCaption,
  normalizeMetaMediaUrl,
  publishMetaContent,
  validateMetaPublishingConfig,
} from "../../supabase/functions/_shared/meta-publishing";

const metaIntegrationMigration = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20261006022139_configure_meta_marketing_integrations.sql"),
  "utf8",
);

const baseConfig = {
  graphVersion: "v26.0",
  pageId: "1409554725565734",
  instagramUserId: "17841447348180505",
  systemUserToken: "EAA_TEST_SYSTEM_USER_TOKEN_1234567890",
  appSecret: "0123456789abcdef0123456789abcdef",
};

type FetchCall = {
  url: string;
  method: string;
  body: string;
};

type MockResponse = {
  status?: number;
  body: Record<string, unknown>;
};

function queuedFetch(responses: Array<MockResponse | Error>) {
  const calls: FetchCall[] = [];
  const queue = [...responses];
  const fetchImpl = async (input: string | URL | Request, init?: RequestInit) => {
    calls.push({
      url: String(input),
      method: init?.method || "GET",
      body: String(init?.body || ""),
    });
    const next = queue.shift();
    if (!next) throw new Error("Unexpected Meta request");
    if (next instanceof Error) throw next;
    return new Response(JSON.stringify(next.body), {
      status: next.status ?? 200,
      headers: { "Content-Type": "application/json" },
    });
  };
  return { fetchImpl, calls };
}

describe("Meta marketing publishing adapter", () => {
  it("builds the existing TOK social content contract without inventing another payload shape", () => {
    expect(buildMetaCaption({
      headline: "TOK à Genève",
      body: "Réservez sans attendre.",
      call_to_action: "Découvrir TOK",
      hashtags: ["TOK", "#Geneve", "TOK"],
    }, "instagram")).toBe(
      "TOK à Genève\n\nRéservez sans attendre.\n\nDécouvrir TOK\n\n#TOK #Geneve",
    );
  });

  it("publishes a Facebook text item to the Page feed after resolving the Page token", async () => {
    const { fetchImpl, calls } = queuedFetch([
      {
        body: {
          data: [{
            id: baseConfig.pageId,
            access_token: "PAGE_TOKEN_12345678901234567890",
            tasks: ["CREATE_CONTENT"],
            instagram_business_account: { id: baseConfig.instagramUserId },
          }],
        },
      },
      { body: { id: `${baseConfig.pageId}_9988776655` } },
    ]);

    const result = await publishMetaContent({
      channel: "facebook",
      content: { body: "Bonjour Genève", hashtags: ["TOK"] },
      config: baseConfig,
      fetchImpl,
    });

    expect(result.providerExternalId).toBe(`${baseConfig.pageId}_9988776655`);
    expect(calls).toHaveLength(2);
    expect(calls[0].url).toContain("/me/accounts?");
    expect(calls[1].url).toMatch(new RegExp(`/${baseConfig.pageId}/feed$`));
    expect(calls[1].body).toContain("message=Bonjour+Gen%C3%A8ve");
    expect(calls[1].body).toContain("access_token=PAGE_TOKEN_");
  });

  it("publishes a Facebook visual item through the Page photos endpoint", async () => {
    const { fetchImpl, calls } = queuedFetch([
      {
        body: {
          data: [{
            id: baseConfig.pageId,
            access_token: "PAGE_TOKEN_12345678901234567890",
            tasks: ["CREATE_CONTENT"],
          }],
        },
      },
      { body: { id: "12345678901234567" } },
    ]);

    await publishMetaContent({
      channel: "facebook",
      content: {
        body: "Une table vous attend",
        visual_url: "https://cdn.example.com/tok.jpg",
      },
      config: baseConfig,
      fetchImpl,
    });

    expect(calls[1].url).toMatch(new RegExp(`/${baseConfig.pageId}/photos$`));
    expect(calls[1].body).toContain("url=https%3A%2F%2Fcdn.example.com%2Ftok.jpg");
    expect(calls[1].body).toContain("caption=Une+table+vous+attend");
    expect(calls[1].body).toContain("published=true");
  });

  it("publishes Instagram in two stages only for the configured account linked to the Page", async () => {
    const { fetchImpl, calls } = queuedFetch([
      {
        body: {
          data: [{
            id: baseConfig.pageId,
            access_token: "PAGE_TOKEN_12345678901234567890",
            tasks: ["CREATE_CONTENT"],
            instagram_business_account: { id: baseConfig.instagramUserId },
          }],
        },
      },
      { body: { id: "18270815569115548" } },
      { body: { id: "18270815569115548", status_code: "FINISHED", status: "Finished" } },
      { body: { id: "90011803596441" } },
    ]);

    const result = await publishMetaContent({
      channel: "instagram",
      content: {
        body: "Bonjour Genève",
        hashtags: ["TOK"],
        visual_url: "https://cdn.example.com/ig-tok.jpg",
      },
      config: baseConfig,
      fetchImpl,
      sleepImpl: async () => {},
    });

    expect(result.providerExternalId).toBe("90011803596441");
    expect(result.containerId).toBe("18270815569115548");
    expect(calls[1].url).toMatch(new RegExp(`/${baseConfig.instagramUserId}/media$`));
    expect(calls[2].url).toContain("/18270815569115548?");
    expect(calls[3].url).toMatch(new RegExp(`/${baseConfig.instagramUserId}/media_publish$`));
    expect(calls[3].body).toContain("creation_id=18270815569115548");
  });

  it("fails closed when the Page is linked to a different Instagram account", async () => {
    const { fetchImpl, calls } = queuedFetch([
      {
        body: {
          data: [{
            id: baseConfig.pageId,
            access_token: "PAGE_TOKEN_12345678901234567890",
            tasks: ["CREATE_CONTENT"],
            instagram_business_account: { id: "17841440000000000" },
          }],
        },
      },
    ]);

    await expect(publishMetaContent({
      channel: "instagram",
      content: { body: "Bonjour", visual_url: "https://cdn.example.com/tok.jpg" },
      config: baseConfig,
      fetchImpl,
    })).rejects.toMatchObject({
      code: "meta_instagram_identity_mismatch",
      blockedConfiguration: true,
    });
    expect(calls).toHaveLength(1);
  });

  it("runs the durable pre-publish guard immediately before the externally visible request", async () => {
    const order: string[] = [];
    const fetchImpl = async (input: string | URL | Request, init?: RequestInit) => {
      if ((init?.method || "GET") === "GET") {
        order.push("identity");
        return new Response(JSON.stringify({
          data: [{
            id: baseConfig.pageId,
            access_token: "PAGE_TOKEN_12345678901234567890",
            tasks: ["CREATE_CONTENT"],
          }],
        }), { status: 200, headers: { "Content-Type": "application/json" } });
      }
      order.push("publish");
      return new Response(JSON.stringify({ id: `${baseConfig.pageId}_123456789` }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    };

    await publishMetaContent({
      channel: "facebook",
      content: { body: "Bonjour" },
      config: baseConfig,
      fetchImpl,
      beforeExternalPublish: async () => { order.push("marker"); },
    });

    expect(order).toEqual(["identity", "marker", "publish"]);
  });

  it("does not auto-retry an ambiguous network failure after a publishing POST", async () => {
    const { fetchImpl } = queuedFetch([
      {
        body: {
          data: [{
            id: baseConfig.pageId,
            access_token: "PAGE_TOKEN_12345678901234567890",
            tasks: ["CREATE_CONTENT"],
          }],
        },
      },
      new Error("socket closed after submit"),
    ]);

    let caught: unknown;
    try {
      await publishMetaContent({
        channel: "facebook",
        content: { body: "Bonjour" },
        config: baseConfig,
        fetchImpl,
      });
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(MetaPublishError);
    expect(caught).toMatchObject({
      code: "meta_publish_outcome_unknown",
      retryable: false,
      ambiguous: true,
    });
  });

  it("never auto-retries a throttled publishing request because the outcome can be ambiguous", async () => {
    const { fetchImpl } = queuedFetch([
      {
        body: {
          data: [{
            id: baseConfig.pageId,
            access_token: "PAGE_TOKEN_12345678901234567890",
            tasks: ["CREATE_CONTENT"],
          }],
        },
      },
      { status: 429, body: { error: { code: 4, message: "rate limit" } } },
    ]);

    await expect(publishMetaContent({
      channel: "facebook",
      content: { body: "Bonjour" },
      config: baseConfig,
      fetchImpl,
    })).rejects.toMatchObject({
      code: "meta_publish_outcome_unknown",
      retryable: false,
      ambiguous: true,
    });
  });

  it("treats a successful POST without an id as an unknown publication outcome", async () => {
    const { fetchImpl } = queuedFetch([
      { body: { data: [{ id: baseConfig.pageId, access_token: "PAGE_TOKEN_12345678901234567890", tasks: ["CREATE_CONTENT"] }] } },
      { body: {} },
    ]);
    await expect(publishMetaContent({ channel: "facebook", content: { body: "TOK" }, config: baseConfig, fetchImpl }))
      .rejects.toMatchObject({ code: "meta_facebook_post_id_missing", ambiguous: true, retryable: false });
  });

  it("aborts a stalled provider request within the lease budget", async () => {
    vi.useFakeTimers();
    try {
      const fetchImpl = (_input: string | URL | Request, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(new DOMException("Timed out", "AbortError")));
      });
      const request = publishMetaContent({ channel: "facebook", content: { body: "TOK" }, config: baseConfig, fetchImpl });
      const assertion = expect(request).rejects.toMatchObject({ code: "meta_provider_unreachable", retryable: true, ambiguous: false });
      // Let the native WebCrypto proof complete before advancing its fetch timer.
      await vi.waitFor(() => expect(vi.getTimerCount()).toBeGreaterThan(0));
      await vi.advanceTimersByTimeAsync(META_REQUEST_TIMEOUT_MS);
      await assertion;
    } finally { vi.useRealTimers(); }
  });

  it("refuses to silently truncate approved Instagram copy", () => {
    expect(() => buildMetaCaption({ body: "x".repeat(2_201) }, "instagram"))
      .toThrow("meta_content_too_long");
  });

  it("rejects unsafe media URLs and incomplete credential configuration", () => {
    expect(() => normalizeMetaMediaUrl("http://localhost/private.jpg")).toThrow("meta_media_url_invalid");
    expect(() => validateMetaPublishingConfig({
      ...baseConfig,
      appSecret: "",
    }, "facebook")).toThrow("meta_app_secret_missing");
  });
});

describe("Meta integration rollout migration", () => {
  it("versions the real Page/Instagram ids and Graph v26 without connecting blindly", () => {
    expect(metaIntegrationMigration).toContain("'page_id', '1409554725565734'");
    expect(metaIntegrationMigration).toContain("'ig_user_id', '17841447348180505'");
    expect(metaIntegrationMigration).toContain("'graph_version', 'v26.0'");
    expect(metaIntegrationMigration).toContain("secret_ref = 'META_SYSTEM_USER_TOKEN'");
    expect(metaIntegrationMigration).toContain("status = 'disconnected'");
    expect(metaIntegrationMigration).not.toMatch(/status\s*=\s*'connected'/);
  });

  it("keeps Facebook and Instagram as distinct providers while marking the Meta adapter deployed", () => {
    expect(metaIntegrationMigration).toContain("channel IN ('facebook', 'instagram')");
    expect(metaIntegrationMigration).toContain("'adapter_deployed', true");
    expect(metaIntegrationMigration).not.toContain("provider = 'meta'");
  });
});
