/**
 * Shared CORS helper for Supabase edge functions.
 *
 * Usage:
 *   import { buildCorsHeaders, handleCorsPreflight } from "../_shared/cors.ts";
 *
 *   Deno.serve(async (req) => {
 *     const cors = buildCorsHeaders(req);
 *     const preflight = handleCorsPreflight(req, cors);
 *     if (preflight) return preflight;
 *     ...
 *     return jsonResponse(payload, 200, cors);
 *   });
 *
 * Allowed origins come from the ALLOWED_ORIGINS env var (comma-separated).
 * A small set of platform defaults is always honored so the Capacitor webview
 * and localhost dev keep working:
 *   - https://thetok.ch, https://www.thetok.ch, https://app.thetok.ch
 *   - https://admin.thetok.ch                         (dedicated admin UI)
 *   - https://marketing.thetok.ch                     (isolated marketing operations)
 *   - https://commercial.thetok.ch                    (commercial workspace)
 *   - https://demo-client.thetok.ch                    (focused client demo)
 *   - https://demo-restaurateur.thetok.ch              (focused restaurant demo)
 *   - https://demo-livreur.thetok.ch                   (focused courier demo)
 *   - capacitor://localhost, ionic://localhost         (iOS WKWebView)
 *   - http://localhost, https://localhost              (Android WebView + web dev)
 *   - http://localhost:<port>                          (Vite dev server)
 *   - https://cloud-rebuild-recovered.vercel.app       (current production frontend target)
 *   - owned Vercel preview deployments for cloud-rebuild-recovered
 */

const DEFAULT_ALLOWED_ORIGINS = [
  "https://thetok.ch",
  "https://www.thetok.ch",
  "https://app.thetok.ch",
  "https://admin.thetok.ch",
  "https://marketing.thetok.ch",
  "https://commercial.thetok.ch",
  "https://demo-client.thetok.ch",
  "https://demo-restaurateur.thetok.ch",
  "https://demo-livreur.thetok.ch",
  "https://chatgpt.com",
  "https://cloud-rebuild-recovered.vercel.app",
  "capacitor://localhost",
  "ionic://localhost",
  "http://localhost",
  "https://localhost",
];

const LOCALHOST_REGEX = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;
const TOK_VERCEL_PREVIEW_REGEX =
  /^https:\/\/cloud-rebuild-recovered-[a-z0-9-]+-mtnrconcepts-projects\.vercel\.app$/;

const ALLOWED_HEADERS = [
  "authorization",
  "x-client-info",
  "apikey",
  "content-type",
  "x-supabase-client-platform",
  "x-supabase-client-platform-version",
  "x-supabase-client-runtime",
  "x-supabase-client-runtime-version",
  "x-internal-cron-secret",
  "x-cron-secret",
  "idempotency-key",
  "x-tok-event",
  "x-tok-delivery",
  "x-tok-timestamp",
  "x-tok-signature",
  "stripe-signature",
  "mcp-protocol-version",
  "mcp-session-id",
  "last-event-id",
].join(", ");

function normalizeOrigin(value: string | null | undefined): string | null {
  const cleaned = value?.trim();
  if (!cleaned) return null;

  try {
    return new URL(cleaned).origin;
  } catch {
    return null;
  }
}

function parseAllowedOrigins(): string[] {
  const configuredOrigins = (Deno.env.get("ALLOWED_ORIGINS")?.trim() || "")
    .split(",")
    .map((entry) => normalizeOrigin(entry))
    .filter((entry): entry is string => Boolean(entry));

  const appOrigins = [
    normalizeOrigin(Deno.env.get("APP_BASE_URL")),
    normalizeOrigin(Deno.env.get("PUBLIC_APP_URL")),
    normalizeOrigin(Deno.env.get("SITE_URL")),
  ].filter((entry): entry is string => Boolean(entry));

  return Array.from(new Set([
    ...DEFAULT_ALLOWED_ORIGINS,
    ...configuredOrigins,
    ...appOrigins,
  ]));
}

function isOriginAllowed(origin: string | null, allowed: string[]): boolean {
  if (!origin) return false;
  if (allowed.includes(origin)) return true;
  // Allow any localhost port for dev (Vite picks random ports).
  if (LOCALHOST_REGEX.test(origin)) return true;
  if (TOK_VERCEL_PREVIEW_REGEX.test(origin)) return true;
  return false;
}

/**
 * Server-to-server requests commonly omit Origin. When an Origin is present,
 * callers can use this helper to reject browser requests outside the allowlist.
 */
export function isRequestOriginAllowed(req: Request): boolean {
  const origin = req.headers.get("origin");
  if (!origin) return true;
  return isOriginAllowed(normalizeOrigin(origin), parseAllowedOrigins());
}

/**
 * Build CORS headers for a given request. If the Origin header is not in the
 * allowlist, `Access-Control-Allow-Origin` is omitted entirely — the browser
 * will then block the response, which is exactly what we want.
 */
export function buildCorsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get("origin");
  const allowed = parseAllowedOrigins();

  const headers: Record<string, string> = {
    "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": ALLOWED_HEADERS,
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin",
  };

  if (isOriginAllowed(origin, allowed)) {
    headers["Access-Control-Allow-Origin"] = origin as string;
    headers["Access-Control-Allow-Credentials"] = "true";
  }

  return headers;
}

/**
 * Handle the CORS preflight (OPTIONS) request. Returns a Response if the
 * request is a preflight, otherwise null (so the caller can continue).
 */
export function handleCorsPreflight(
  req: Request,
  corsHeaders: Record<string, string>,
): Response | null {
  if (req.method !== "OPTIONS") return null;
  return new Response(null, { status: 204, headers: corsHeaders });
}

/**
 * Back-compat export: some legacy functions still reference a static
 * `corsHeaders` object. They should migrate to `buildCorsHeaders(req)`, but in
 * the meantime this export provides a permissive baseline *without* an
 * Access-Control-Allow-Origin (so the browser still blocks cross-origin).
 * Prefer the dynamic helper for any new code.
 */
export const corsHeadersStatic: Record<string, string> = {
  "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": ALLOWED_HEADERS,
  "Vary": "Origin",
};


