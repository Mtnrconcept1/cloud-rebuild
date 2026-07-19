export const COMMERCIAL_DEMO_HOSTNAME = "commercial.thetok.ch";
export const COMMERCIAL_DEMO_SUPABASE_ORIGIN =
  "https://hzldfhjfgjcadmpghhhf.supabase.co";

const COMMERCIAL_DEMO_CHECKOUT_FUNCTION = "commercial-demo-checkout";
const COMMERCIAL_DEMO_AI_FUNCTION = "commercial-demo-ai";

const PRODUCTION_TRANSACTION_TABLES = new Set([
  "carts",
  "cart_items",
  "cart_item_modifiers",
  "chef_table_checkout_holds",
  "credit_notes",
  "delivery_tracking",
  "dispatch_jobs",
  "financial_ledger",
  "group_members",
  "order_groups",
  "group_member_orders",
  "invoices",
  "orders",
  "order_addresses",
  "order_events",
  "order_fees",
  "order_items",
  "order_item_modifiers",
  "order_issues",
  "order_notes",
  "order_refunds",
  "order_status_history",
  "order_taxes",
  "reservations",
  "reservation_slots",
  "reservation_status_history",
  "payments",
  "payment_intents",
  "payment_transactions",
  "platform_revenue",
  "restaurant_credit_ledger",
  "restaurant_subscriptions",
  "stripe_checkout_sessions",
  "subscriptions",
  "tok_one_subscriptions",
  "user_payment_methods",
  "user_subscriptions",
]);

const PRODUCTION_TRANSACTION_FUNCTION_PATTERN = /(?:^|[-_])(?:billing|boosts?|charges?|checkout|credits?|invoices?|orders?|payments?|refunds?|reservations?|stripe|subscriptions?)(?:$|[-_])/i;
const PAID_AI_FUNCTION_PATTERN = /(?:^|[-_])(?:ai|advisors?|assistants?|campaigns?|chats?|generat(?:e|ions?)|images?|marketing|openai|photos?|studio|visuals?)(?:$|[-_])/i;
const PRODUCTION_TRANSACTION_RPC_PATTERN = /(?:^|_)(?:billing|boosts?|catalog|charges?|checkout|credits?|invoices?|menus?|orders?|payments?|refunds?|reservations?|restaurants?|subscriptions?)(?:$|_)/i;
const PAID_AI_API_HOSTS = new Set([
  "api.openai.com",
  "api.anthropic.com",
  "api.replicate.com",
  "fal.run",
  "api-inference.huggingface.co",
]);

function normalizeHostname(value: string) {
  return String(value || "").trim().toLowerCase().replace(/\.$/, "");
}

function getPathResource(url: URL, marker: string) {
  const markerIndex = url.pathname.indexOf(marker);
  if (markerIndex < 0) return null;
  return decodeURIComponent(url.pathname.slice(markerIndex + marker.length).split("/")[0] || "") || null;
}

function isExactFunctionPath(url: URL, functionName: string) {
  return url.pathname.replace(/\/+$/, "") === `/functions/v1/${functionName}`;
}

function isDedicatedDemoSupabaseOrigin(url: URL) {
  return url.origin === COMMERCIAL_DEMO_SUPABASE_ORIGIN;
}

function isTrustedSupabaseOrigin(url: URL, currentOrigin: string) {
  if (isDedicatedDemoSupabaseOrigin(url)) return true;

  let configuredOrigin = "";
  try {
    configuredOrigin = new URL(String(import.meta.env.VITE_SUPABASE_URL || "")).origin;
  } catch {
    configuredOrigin = "";
  }
  return url.origin === currentOrigin || (configuredOrigin !== "" && url.origin === configuredOrigin);
}

export function isCommercialDemoHost(hostname: string) {
  return normalizeHostname(hostname) === COMMERCIAL_DEMO_HOSTNAME;
}

export function isStripeTestCheckoutSessionId(value: unknown): value is string {
  return typeof value === "string" && /^cs_test_[A-Za-z0-9_]+$/.test(value.trim());
}

/**
 * Fail-closed browser guard for transactional requests made from the dedicated
 * commercial host. It deliberately leaves prospecting, authentication and
 * presentation reads untouched while preventing any production order,
 * reservation or Stripe endpoint from being reached.
 */
export function shouldBlockCommercialDemoHostRequest(input: {
  rawUrl: string;
  method: string;
  currentOrigin: string;
  currentHostname: string;
}) {
  if (!isCommercialDemoHost(input.currentHostname)) return false;

  const method = String(input.method || "GET").toUpperCase();
  if (method === "OPTIONS") return false;

  let url: URL;
  try {
    url = new URL(input.rawUrl, input.currentOrigin);
  } catch {
    // A malformed mutation must never escape the dedicated demo host.
    return !["GET", "HEAD"].includes(method);
  }

  if (PAID_AI_API_HOSTS.has(normalizeHostname(url.hostname))) return true;

  // The dedicated project is an isolated copy of the application. RLS and the
  // demo Auth session enforce access there, so every normal app capability may
  // run without weakening the production-origin guard below.
  if (isDedicatedDemoSupabaseOrigin(url)) return false;

  const functionName = getPathResource(url, "/functions/v1/");
  if (functionName) {
    if (
      functionName === COMMERCIAL_DEMO_AI_FUNCTION
      && isExactFunctionPath(url, COMMERCIAL_DEMO_AI_FUNCTION)
      && isTrustedSupabaseOrigin(url, input.currentOrigin)
      && method === "POST"
    ) return false;
    if (
      functionName === COMMERCIAL_DEMO_CHECKOUT_FUNCTION
      && isExactFunctionPath(url, COMMERCIAL_DEMO_CHECKOUT_FUNCTION)
      && isTrustedSupabaseOrigin(url, input.currentOrigin)
      && method === "POST"
    ) return false;
    return PRODUCTION_TRANSACTION_FUNCTION_PATTERN.test(functionName)
      || PAID_AI_FUNCTION_PATTERN.test(functionName);
  }

  const rpcName = getPathResource(url, "/rest/v1/rpc/");
  if (rpcName) {
    if (rpcName.startsWith("commercial_demo_")) {
      return !isTrustedSupabaseOrigin(url, input.currentOrigin) || method !== "POST";
    }
    return PRODUCTION_TRANSACTION_RPC_PATTERN.test(rpcName);
  }

  const tableName = getPathResource(url, "/rest/v1/");
  if (!tableName || tableName === "rpc") return false;
  if (tableName.startsWith("commercial_demo_")) {
    return !isTrustedSupabaseOrigin(url, input.currentOrigin);
  }
  return PRODUCTION_TRANSACTION_TABLES.has(tableName);
}
