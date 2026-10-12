/**
 * Small, bounded retry helper for public PostgREST reads during TOK's SEO build.
 * Never retries authorization/schema failures; production SEO still fails closed
 * when a required source is unavailable after the retry budget.
 */

export function formatSeoReadError(value) {
  if (value == null) return "réponse indisponible";
  if (typeof value === "string") return value;
  if (!(value instanceof Error) && typeof value !== "object") return String(value);

  const text = (...parts) => parts.filter((part) =>
    (typeof part === "string" && part.trim()) || Number.isFinite(part)
  ).map(String).join(" | ");

  const message = text(value.message, value.code ? `code=${value.code}` : "",
    value.details, value.hint, value.status ? `HTTP ${value.status}` : "");
  return message || "erreur PostgREST sans message";
}

export function isTransientSeoReadError(error, status = 0) {
  const numericStatus = Number(status || error?.status || 0);
  if ([408, 429, 500, 502, 503, 504, 520, 522, 524].includes(numericStatus)) return true;
  // A 400/401/403/404/409 response is not transient: fail rather than hide
  // a broken policy, invalid column, expired credential or schema change.
  if (numericStatus >= 400 && numericStatus < 500) return false;

  const code = String(error?.code || "").toUpperCase();
  if (code === "57014" || code.startsWith("08") || code.startsWith("PGRST00")) return true;
  // Supabase fetch errors may have no HTTP status or SQLSTATE.
  return numericStatus === 0 && /(?:timeout|timed out|fetch failed|network error|connection reset|econnreset|econnrefused|etimedout|gateway timeout|temporarily unavailable)/i
    .test(formatSeoReadError(error));
}

export async function loadSeoPageWithRetry(
  createQuery,
  { source = "PostgREST", attempts = 3, pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    warn = console.warn } = {},
) {
  if (typeof createQuery !== "function") throw new TypeError("createQuery must be a function");
  const maxAttempts = Math.max(1, Math.min(3, Math.trunc(Number(attempts) || 1)));
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    let result;
    try {
      result = await createQuery();
    } catch (error) {
      result = { data: null, error, status: 0 };
    }
    if (result && !result.error) return result;
    const error = result?.error || new Error("PostgREST returned no response");
    const status = Number(result?.status || error?.status || 0);
    if (attempt >= maxAttempts || !isTransientSeoReadError(error, status)) {
      return { ...(result || {}), data: null, error, status };
    }
    warn(`[seo] ${source}: lecture temporairement indisponible, reprise ${attempt + 1}/${maxAttempts} (${formatSeoReadError(error)}).`);
    await pause(Math.min(750, 200 * attempt));
  }
  throw new Error("SEO_RETRY_BUDGET_EXHAUSTED");
}
