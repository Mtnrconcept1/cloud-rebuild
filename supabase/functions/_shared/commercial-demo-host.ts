export const COMMERCIAL_DEMO_HOSTNAME = "commercial.thetok.ch";

function hostnameFromUrl(value: string | null) {
  if (!value) return "";
  try {
    return new URL(value).hostname.toLowerCase().replace(/\.$/, "");
  } catch {
    return "";
  }
}

export function isCommercialDemoLocalOrTestHostname(hostname: string) {
  return hostname === "localhost"
    || hostname === "127.0.0.1"
    || hostname === "::1"
    || hostname.endsWith(".localhost")
    || hostname.endsWith(".test");
}

export function isCommercialDemoUrl(value: unknown) {
  return typeof value === "string" && hostnameFromUrl(value) === COMMERCIAL_DEMO_HOSTNAME;
}

/**
 * Browsers supply Origin on cross-origin Supabase Function requests and
 * Referer is retained as defense in depth. The production checkout endpoint
 * rejects the dedicated demonstration host before authentication, database
 * reads or selection of a Stripe runtime.
 */
export function isCommercialDemoHostRequest(req: Request) {
  return isCommercialDemoUrl(req.headers.get("origin"))
    || isCommercialDemoUrl(req.headers.get("referer"));
}

export function isCommercialDemoProductionRuntime() {
  const supabaseHostname = hostnameFromUrl(Deno.env.get("SUPABASE_URL"));
  return supabaseHostname.endsWith(".supabase.co")
    || Boolean(Deno.env.get("DENO_DEPLOYMENT_ID"));
}

export function getCommercialDemoRequestHostname(req: Request) {
  return hostnameFromUrl(req.headers.get("origin"))
    || hostnameFromUrl(req.headers.get("referer"))
    || hostnameFromUrl(req.url);
}

export function isCommercialDemoCheckoutRequestAllowed(req: Request) {
  const hostname = getCommercialDemoRequestHostname(req);
  if (hostname === COMMERCIAL_DEMO_HOSTNAME) return true;
  if (isCommercialDemoProductionRuntime()) return false;
  return isCommercialDemoLocalOrTestHostname(hostname);
}

