import { resolveSafePublicUrl } from "./safe-public-fetch.ts";
import { requestPinnedPublicHttp, waitForPublicHttpSignal } from "./pinned-public-http.ts";

export const WEBHOOK_TIMEOUT_MS = 10_000;
export const WEBHOOK_RESPONSE_PREFIX_BYTES = 2_000;

export type PublicWebhookResult = {
  ok: boolean;
  status: number;
  body: string;
  truncated: boolean;
};

// A bounded diagnostic prefix is sufficient: large successful responses must
// not cause a retry of a webhook which the recipient has already accepted.
async function readResponsePrefix(response: Response) {
  if (!response.body) return { body: "", truncated: false };
  const reader = response.body.getReader();
  const prefix = new Uint8Array(WEBHOOK_RESPONSE_PREFIX_BYTES);
  let length = 0;
  let truncated = false;
  try {
    while (length < prefix.length) {
      const chunk = await reader.read();
      if (chunk.done) break;
      const count = Math.min(chunk.value.byteLength, prefix.length - length);
      prefix.set(chunk.value.subarray(0, count), length);
      length += count;
      if (length === prefix.length) {
        // Do not read another chunk to discover its size: stop at the budget.
        truncated = true;
        break;
      }
    }
    return { body: new TextDecoder().decode(prefix.subarray(0, length)), truncated };
  } finally {
    await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
}

export async function postPublicWebhook(
  input: string,
  headers: Record<string, string>,
  payload: string,
): Promise<PublicWebhookResult> {
  let url: URL;
  try {
    if (input.length > 8_192) throw new Error("invalid_url");
    url = new URL(input);
    if (url.protocol !== "https:" || url.username || url.password || url.hash) {
      throw new Error("invalid_url");
    }
  } catch {
    throw new Error("unsafe_webhook_url");
  }
  const bytes = new TextEncoder().encode(payload);
  if (bytes.byteLength > 256 * 1_024) throw new Error("webhook_payload_too_large");

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), WEBHOOK_TIMEOUT_MS);
  try {
    // DNS and the complete HTTP exchange share one deadline. The transport
    // connects to the validated IP and uses the original hostname for TLS.
    const target = await waitForPublicHttpSignal(resolveSafePublicUrl(url), controller.signal);
    const response = await requestPinnedPublicHttp(target, {
      method: "POST",
      headers,
      body: bytes,
      signal: controller.signal,
    });
    if (response.status >= 300 && response.status < 400) {
      await response.body?.cancel().catch(() => undefined);
      return { ok: false, status: response.status, body: "", truncated: false };
    }
    const prefix = await readResponsePrefix(response);
    return { ok: response.ok, status: response.status, ...prefix };
  } catch (error) {
    if (controller.signal.aborted) throw new Error("request_timeout");
    const code = error instanceof Error ? error.message : "";
    if (/^(?:invalid_url|unsafe_protocol|unsafe_credentials|unsafe_or_private_host)$/.test(code)) {
      throw new Error("unsafe_webhook_url");
    }
    // Never persist URLs, credentials, TLS internals or the original error.
    throw new Error("webhook_request_failed");
  } finally {
    clearTimeout(timeout);
  }
}
