import { requestPinnedPublicHttp, waitForPublicHttpSignal } from "./pinned-public-http.ts";
import { resolveSafePublicUrl } from "./public-url-validation.ts";

export { assertSafePublicUrl, isUnsafePublicHostname, resolveSafePublicUrl } from "./public-url-validation.ts";
export type { PublicNetworkAddress, ResolvedPublicUrl } from "./public-url-validation.ts";

export type FetchPublicUrlOptions = {
  init?: RequestInit;
  timeoutMs?: number;
  maxRedirects?: number;
};

const PUBLIC_IMAGE_HEADERS = new Set(["accept", "accept-language", "range", "if-none-match", "if-modified-since"]);
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

/** A public image download never carries credentials, including across redirects. */
export async function fetchPublicUrl(input: string | URL, options: FetchPublicUrlOptions = {}) {
  const method = (options.init?.method || "GET").toUpperCase();
  if (method !== "GET" && method !== "HEAD") throw new Error("unsafe_method");
  if (options.init?.body != null) throw new Error("unsafe_request_body");
  if (options.init?.credentials && options.init.credentials !== "omit") throw new Error("unsafe_credentials");
  const headers = new Headers(options.init?.headers);
  for (const name of headers.keys()) {
    if (!PUBLIC_IMAGE_HEADERS.has(name)) throw new Error("unsafe_public_image_header");
  }
  const maxRedirects = Math.max(0, Math.min(6, options.maxRedirects ?? 3));
  const timeoutMs = Math.max(1_000, Math.min(30_000, options.timeoutMs ?? 12_000));
  if (!Number.isFinite(timeoutMs) || !Number.isInteger(maxRedirects)) throw new Error("invalid_fetch_limits");
  const controller = new AbortController();
  const externalSignal = options.init?.signal;
  const externalAbort = () => controller.abort();
  externalSignal?.addEventListener("abort", externalAbort, { once: true });
  if (externalSignal?.aborted) controller.abort();
  const cleanup = () => {
    clearTimeout(timer);
    externalSignal?.removeEventListener("abort", externalAbort);
  };
  // One deadline includes DNS, every redirect, connection, TLS and the body.
  const timer = setTimeout(() => { controller.abort(); cleanup(); }, timeoutMs);
  let current: string | URL = input;
  try {
    for (let redirect = 0; redirect <= maxRedirects; redirect += 1) {
      if (controller.signal.aborted) throw new Error("request_timeout");
      const target = await waitForPublicHttpSignal(resolveSafePublicUrl(current), controller.signal);
      const response = await requestPinnedPublicHttp(target, { method, headers, signal: controller.signal });
      if (REDIRECT_STATUSES.has(response.status)) {
        const location = response.headers.get("location");
        await response.body?.cancel();
        if (!location || redirect === maxRedirects) throw new Error("redirect_limit");
        const next = new URL(location, target.url);
        if (target.url.protocol === "https:" && next.protocol !== "https:") throw new Error("unsafe_redirect_protocol");
        current = next;
        continue;
      }
      if (!response.body) { cleanup(); return response; }
      const reader = response.body.getReader();
      const body = new ReadableStream<Uint8Array>({
        async pull(stream) {
          try {
            const chunk = await reader.read();
            if (chunk.done) { cleanup(); stream.close(); reader.releaseLock(); }
            else stream.enqueue(chunk.value);
          } catch (error) { cleanup(); stream.error(error); reader.releaseLock(); }
        },
        async cancel() { cleanup(); try { await reader.cancel(); } finally { reader.releaseLock(); } },
      }, { highWaterMark: 0 });
      return new Response(body, { status: response.status, statusText: response.statusText, headers: response.headers });
    }
    throw new Error("redirect_limit");
  } catch (error) { cleanup(); throw error; }
}
