const SAFE_SCOPED_READ_RPCS = new Set([
  "get_reservation_fee_invoice_lines",
  "get_restaurant_actualites_access",
  "get_restaurant_actualites_insights",
  "get_restaurant_actualites_premium_banner_audience",
  "get_restaurant_credit_usage",
  "get_restaurant_subscription_self_service_state",
]);

function getRpcName(url: URL) {
  const marker = "/rest/v1/rpc/";
  const markerIndex = url.pathname.indexOf(marker);
  if (markerIndex < 0) return null;
  return decodeURIComponent(url.pathname.slice(markerIndex + marker.length).split("/")[0] || "");
}

export function shouldProtectCommercialDemoRequest(rawUrl: string, method: string, currentOrigin: string) {
  const normalizedMethod = method.toUpperCase();
  if (normalizedMethod === "OPTIONS") return false;

  const url = new URL(rawUrl, currentOrigin);
  const isSupabaseFunctions = url.pathname.includes("/functions/v1/");
  const isStorageMutation = url.pathname.includes("/storage/v1/object")
    && !["GET", "HEAD"].includes(normalizedMethod);
  const isPostgrestMutation = url.pathname.includes("/rest/v1/")
    && !["GET", "HEAD"].includes(normalizedMethod);
  const rpcName = getRpcName(url);
  const isTrustedSupabaseOrigin = url.origin === currentOrigin || url.hostname.endsWith(".supabase.co");

  if (isSupabaseFunctions) return true;
  if (rpcName && SAFE_SCOPED_READ_RPCS.has(rpcName) && isTrustedSupabaseOrigin) return false;
  if (isStorageMutation || isPostgrestMutation) return true;

  const isExternalMutation = url.origin !== currentOrigin
    && !["GET", "HEAD"].includes(normalizedMethod)
    && !url.pathname.includes("/auth/v1/");
  const isSameOriginApiMutation = url.origin === currentOrigin
    && url.pathname.startsWith("/api/")
    && !["GET", "HEAD"].includes(normalizedMethod);

  return isExternalMutation || isSameOriginApiMutation;
}
