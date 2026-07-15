const SAFE_SCOPED_READ_RPCS = new Set([
  "commercial_demo_ai_history",
  "get_reservation_fee_invoice_lines",
  "get_restaurant_actualites_access",
  "get_restaurant_actualites_insights",
  "get_restaurant_actualites_premium_banner_audience",
  "get_restaurant_credit_usage",
  "get_restaurant_subscription_self_service_state",
]);

const SAFE_COMMERCIAL_DEMO_MUTATION_RPCS = new Set([
  "commercial_demo_ai_archive_conversation",
]);

const COMMERCIAL_DEMO_AI_FUNCTION = "commercial-demo-ai";

function getRpcName(url: URL) {
  const marker = "/rest/v1/rpc/";
  const markerIndex = url.pathname.indexOf(marker);
  if (markerIndex < 0) return null;
  return decodeURIComponent(url.pathname.slice(markerIndex + marker.length).split("/")[0] || "");
}

function getFunctionName(url: URL) {
  const marker = "/functions/v1/";
  const markerIndex = url.pathname.indexOf(marker);
  if (markerIndex < 0) return null;
  return decodeURIComponent(url.pathname.slice(markerIndex + marker.length).split("/")[0] || "");
}

function isExactFunctionPath(url: URL, functionName: string) {
  return url.pathname.replace(/\/+$/, "") === `/functions/v1/${functionName}`;
}

function isTrustedSupabaseOrigin(url: URL, currentOrigin: string) {
  let configuredOrigin = "";
  try {
    configuredOrigin = new URL(String(import.meta.env.VITE_SUPABASE_URL || "")).origin;
  } catch {
    configuredOrigin = "";
  }
  return url.origin === currentOrigin || (configuredOrigin !== "" && url.origin === configuredOrigin);
}

export function shouldProtectCommercialDemoRequest(rawUrl: string, method: string, currentOrigin: string) {
  const normalizedMethod = method.toUpperCase();
  if (normalizedMethod === "OPTIONS") return false;

  const url = new URL(rawUrl, currentOrigin);
  const functionName = getFunctionName(url);
  const isStorageMutation = url.pathname.includes("/storage/v1/object")
    && !["GET", "HEAD"].includes(normalizedMethod);
  const isPostgrestMutation = url.pathname.includes("/rest/v1/")
    && !["GET", "HEAD"].includes(normalizedMethod);
  const rpcName = getRpcName(url);

  if (
    functionName === COMMERCIAL_DEMO_AI_FUNCTION
    && isExactFunctionPath(url, COMMERCIAL_DEMO_AI_FUNCTION)
    && isTrustedSupabaseOrigin(url, currentOrigin)
    && normalizedMethod === "POST"
  ) return false;
  if (functionName) return true;
  if (rpcName && SAFE_SCOPED_READ_RPCS.has(rpcName) && isTrustedSupabaseOrigin(url, currentOrigin)) return false;
  if (rpcName && SAFE_COMMERCIAL_DEMO_MUTATION_RPCS.has(rpcName) && isTrustedSupabaseOrigin(url, currentOrigin)) return false;
  if (isStorageMutation || isPostgrestMutation) return true;

  const isTrustedAuthMutation = url.pathname.includes("/auth/v1/")
    && isTrustedSupabaseOrigin(url, currentOrigin);
  const isExternalMutation = url.origin !== currentOrigin
    && !["GET", "HEAD"].includes(normalizedMethod)
    && !isTrustedAuthMutation;
  const isSameOriginApiMutation = url.origin === currentOrigin
    && url.pathname.startsWith("/api/")
    && !["GET", "HEAD"].includes(normalizedMethod);

  return isExternalMutation || isSameOriginApiMutation;
}
