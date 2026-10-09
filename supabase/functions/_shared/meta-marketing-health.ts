import type { createAdminClient } from "./auth.ts";
import { MetaPublishError, validateMetaPublishingConfig } from "./meta-publishing.ts";

type Client = ReturnType<typeof createAdminClient>;
type Channel = "facebook" | "instagram";
export type MetaConnectionHealth = {
  channel: Channel;
  status: "connected" | "blocked_configuration";
  accountName: string | null;
  accountId: string | null;
  checkedAt: string;
  reason: string | null;
};

const record = (value: unknown): Record<string, unknown> => value && typeof value === "object" && !Array.isArray(value)
  ? value as Record<string, unknown> : {};
const text = (value: unknown) => typeof value === "string" ? value.trim() : "";

async function graphRead(version: string, id: string, fields: string, token: string, secret: string) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const digest = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(token));
  const proof = Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
  const url = new URL(`https://graph.facebook.com/${version}/${id}`);
  url.searchParams.set("fields", fields);
  url.searchParams.set("appsecret_proof", proof);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  try {
    const response = await fetch(url, {
      method: "GET", headers: { Authorization: `Bearer ${token}` },
      signal: controller.signal, redirect: "error",
    });
    if (!response.ok) {
      await response.body?.cancel().catch(() => undefined);
      throw new Error(response.status === 429 ? "meta_rate_limited" : "meta_access_unavailable");
    }
    if (!response.body) throw new Error("meta_response_invalid");
    const reader = response.body.getReader();
    let size = 0;
    let body = "";
    const decoder = new TextDecoder();
    try {
      while (true) {
        const chunk = await reader.read();
        if (chunk.done) break;
        size += chunk.value.byteLength;
        if (size > 64_000) {
          await reader.cancel();
          throw new Error("meta_response_invalid");
        }
        body += decoder.decode(chunk.value, { stream: true });
      }
      body += decoder.decode();
    } finally { reader.releaseLock(); }
    const value = record(JSON.parse(body));
    if (value.error || text(value.id) !== id) throw new Error("meta_account_mismatch");
    return value;
  } finally { clearTimeout(timeout); }
}

/** Verifies read access only. Never enables publishing or changes integration status. */
export async function checkMetaMarketingConnections(client: Client): Promise<{ accounts: MetaConnectionHealth[] }> {
  const accounts: MetaConnectionHealth[] = [];
  for (const channel of ["facebook", "instagram"] as const) {
    const { data, error } = await client.from("marketing_integrations")
      .select("id, channel, status, public_configuration")
      .eq("channel", channel).order("updated_at", { ascending: false }).limit(1).maybeSingle();
    if (error) throw new Error("meta_health_storage_unavailable");
    const row = record(data);
    const account: MetaConnectionHealth = {
      channel, status: "blocked_configuration", accountName: null, accountId: null,
      checkedAt: new Date().toISOString(), reason: null,
    };
    try {
      if (!data) throw new Error("meta_integration_missing");
      const configuration = record(row.public_configuration);
      const config = validateMetaPublishingConfig({
        graphVersion: text(configuration.graph_version), pageId: text(configuration.page_id),
        instagramUserId: text(configuration.ig_user_id),
        systemUserToken: Deno.env.get("META_SYSTEM_USER_TOKEN") || "",
        appSecret: Deno.env.get("META_APP_SECRET") || "",
      }, channel);
      const page = await graphRead(config.graphVersion, config.pageId, "id,name,instagram_business_account", config.systemUserToken, config.appSecret);
      let identity = page;
      if (channel === "instagram") {
        if (text(record(page.instagram_business_account).id) !== config.instagramUserId) throw new Error("meta_account_mismatch");
        identity = await graphRead(config.graphVersion, config.instagramUserId!, "id,username", config.systemUserToken, config.appSecret);
      }
      const name = text(channel === "facebook" ? identity.name : identity.username);
      if (!name) throw new Error("meta_response_invalid");
      account.status = "connected";
      account.accountName = name.slice(0, 200);
      account.accountId = text(identity.id);
    } catch (failure) {
      // Never persist provider bodies, URLs, tokens or arbitrary exception text.
      const code = failure instanceof MetaPublishError ? failure.code : failure instanceof Error ? failure.message : "";
      account.reason = code === "meta_integration_missing" ? "Intégration non configurée."
        : code === "meta_account_mismatch" ? "Le compte Meta ne correspond pas à la configuration ou à la Page liée."
        : code === "meta_rate_limited" ? "Meta limite les vérifications. Réessayez plus tard."
        : failure instanceof MetaPublishError ? "Configuration Meta incomplète ou invalide côté serveur."
        : "Accès Meta non confirmé. Vérifiez les autorisations du compte ou réessayez plus tard.";
    }
    if (data) {
      const { error: updateError } = await client.from("marketing_integrations").update({
        last_checked_at: account.checkedAt, last_error: account.reason,
      }).eq("id", row.id);
      if (updateError) throw new Error("meta_health_storage_unavailable");
    }
    accounts.push(account);
  }
  return { accounts };
}
