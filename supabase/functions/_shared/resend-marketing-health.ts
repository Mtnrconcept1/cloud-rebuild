import type { createAdminClient } from "./auth.ts";
import { readMarketingUnsubscribeSecrets } from "./marketing-unsubscribe-secrets.ts";

type Client = ReturnType<typeof createAdminClient>;
type Status = "connected" | "blocked_configuration";

export type ResendMarketingHealth = {
  status: Status;
  verifiedNow: boolean;
  checkedAt: string;
  senderDomain: string | null;
  reason: string | null;
};

const asRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};

function getSenderDomain(): string {
  const configured = Deno.env.get("EMAIL_FROM")?.trim() || "Tok <noreply@thetok.ch>";
  const match = configured.match(/^(?:[^<>]*<)?([a-zA-Z0-9._%+-]+@([a-zA-Z0-9.-]+\.[a-zA-Z]{2,}))>?$/);
  if (!match) throw new Error("sender_invalid");
  return match[2].toLowerCase();
}

function getUnsubscribeUrl(): void {
  const raw = Deno.env.get("SUPABASE_URL")?.trim() || "";
  let url: URL;
  try { url = new URL(raw); }
  catch { throw new Error("unsubscribe_url_invalid"); }
  if (url.protocol !== "https:" || url.username || url.password || !url.hostname) {
    throw new Error("unsubscribe_url_invalid");
  }
  if (!readMarketingUnsubscribeSecrets().signingSecret) throw new Error("unsubscribe_secret_missing");
}

const messages: Record<string, string> = {
  adapter_missing: "L’adaptateur Resend n’est pas déployé.",
  resend_key_missing: "La clé Resend manque dans les secrets Supabase du projet TOK.",
  sender_invalid: "L’adresse EMAIL_FROM du projet TOK est invalide.",
  unsubscribe_secret_missing: "Le secret de désinscription MARKETING_UNSUBSCRIBE_SECRET est absent ou trop court.",
  unsubscribe_url_invalid: "L’URL Supabase HTTPS nécessaire au désabonnement est invalide.",
  resend_access_denied: "Resend refuse la vérification des domaines. Vérifiez la clé et ses droits de lecture des domaines.",
  resend_domain_not_verified: "Le domaine d’expédition n’est pas vérifié dans le compte Resend associé à cette clé.",
  resend_response_invalid: "La réponse de vérification de Resend est invalide.",
  resend_rate_limited: "Resend limite provisoirement les contrôles. Réessayez plus tard.",
  resend_probe_unavailable: "Impossible de contacter Resend actuellement. L’état précédent est conservé.",
};

const permanentErrors = new Set([
  "adapter_missing", "resend_key_missing", "sender_invalid", "unsubscribe_secret_missing",
  "unsubscribe_url_invalid", "resend_access_denied", "resend_domain_not_verified",
]);

/** A read-only provider probe. It never creates or sends an email. */
async function probeResendDomain(domain: string, apiKey: string, request: typeof fetch): Promise<void> {
  const domainId = Deno.env.get("RESEND_DOMAIN_ID")?.trim() || "";
  // The ID is optional. Without it, use the account's domains listing.
  const path = domainId && /^[a-zA-Z0-9_-]{4,100}$/.test(domainId)
    ? `/domains/${encodeURIComponent(domainId)}`
    : "/domains?limit=100";
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  try {
    let response: Response;
    try {
      response = await request(`https://api.resend.com${path}`, {
        method: "GET",
        headers: { Authorization: `Bearer ${apiKey}`, Accept: "application/json" },
        redirect: "error",
        signal: controller.signal,
      });
    } catch { throw new Error("resend_probe_unavailable"); }
    if (response.status === 401 || response.status === 403) {
      await response.body?.cancel().catch(() => undefined);
      throw new Error("resend_access_denied");
    }
    if (response.status === 429) {
      await response.body?.cancel().catch(() => undefined);
      throw new Error("resend_rate_limited");
    }
    if (!response.ok) {
      await response.body?.cancel().catch(() => undefined);
      throw new Error(response.status >= 500 ? "resend_probe_unavailable" : "resend_response_invalid");
    }
    if (!response.body) throw new Error("resend_response_invalid");
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let body = "";
    let bytes = 0;
    try {
      while (true) {
        const chunk = await reader.read();
        if (chunk.done) break;
        bytes += chunk.value.byteLength;
        if (bytes > 64_000) {
          await reader.cancel();
          throw new Error("resend_response_invalid");
        }
        body += decoder.decode(chunk.value, { stream: true });
      }
      body += decoder.decode();
    } finally { reader.releaseLock(); }
    let parsed: Record<string, unknown>;
    try { parsed = asRecord(JSON.parse(body)); }
    catch { throw new Error("resend_response_invalid"); }
    const entries = domainId ? [parsed] : Array.isArray(parsed.data) ? parsed.data : null;
    if (!entries) throw new Error("resend_response_invalid");
    const verified = entries.some((entry) => {
      const item = asRecord(entry);
      return String(item.name || "").toLowerCase() === domain && item.status === "verified";
    });
    if (!verified) throw new Error("resend_domain_not_verified");
  } finally { clearTimeout(timeout); }
}

/**
 * Verify the actual TOK Edge configuration, not Freesendit's separate Vercel account.
 * Promote the integration only after an authenticated verified-domain response.
 * A transient Resend outage never overwrites an already-connected state.
 * No secrets, provider response bodies or recipient addresses are persisted.
 */
export async function checkResendMarketingConnection(
  client: Client,
  request: typeof fetch = fetch,
): Promise<{ email: ResendMarketingHealth }> {
  const { data, error } = await client.from("marketing_integrations")
    .select("id, channel, provider, status, capabilities")
    .eq("provider", "resend").eq("channel", "email").maybeSingle();
  if (error || !data) throw new Error("resend_integration_unavailable");
  const row = asRecord(data);
  const checkedAt = new Date().toISOString();
  const currentStatus: Status = row.status === "connected" ? "connected" : "blocked_configuration";
  let senderDomain: string | null = null;
  let status = currentStatus;
  let verifiedNow = false;
  let reason: string | null = null;
  let definitive = false;

  try {
    if (asRecord(row.capabilities).adapter_deployed !== true) throw new Error("adapter_missing");
    const apiKey = Deno.env.get("RESEND_API_KEY")?.trim() || "";
    if (!apiKey) throw new Error("resend_key_missing");
    senderDomain = getSenderDomain();
    getUnsubscribeUrl();
    await probeResendDomain(senderDomain, apiKey, request);
    verifiedNow = true;
    definitive = true;
    status = "connected";
  } catch (failure) {
    const code = failure instanceof Error ? failure.message : "";
    reason = messages[code] || "Vérification Resend indisponible. Aucun envoi de test effectué.";
    definitive = permanentErrors.has(code);
    if (definitive) status = "blocked_configuration";
  }

  const patch: Record<string, unknown> = {
    last_checked_at: checkedAt,
    last_error: reason,
    ...(definitive ? { status } : {}),
    ...(verifiedNow ? { configured_at: checkedAt } : {}),
  };
  const { error: updateError } = await client.from("marketing_integrations")
    .update(patch).eq("id", String(row.id));
  if (updateError) throw new Error("resend_health_storage_unavailable");
  return { email: { status, verifiedNow, checkedAt, senderDomain, reason } };
}
