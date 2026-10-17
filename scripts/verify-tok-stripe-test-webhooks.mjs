import { pathToFileURL } from "node:url";

// The test project is deliberately not provisioned by this script.
// Never treat the production database as a Stripe Test acceptance environment.
export const PRODUCTION_SUPABASE_REF = "wwcrtyoueexyxkkikaos";
export const REQUIRED_CHECKOUT_EVENTS = [
  "checkout.session.completed",
  "checkout.session.async_payment_succeeded",
];

const MAX_PAGES = 20;
const PAGE_SIZE = 100;

export function assertStripeTestTarget(env) {
  const projectRef = (env.TOK_TEST_SUPABASE_PROJECT_REF || "").trim();
  const projectUrl = (env.TOK_TEST_SUPABASE_URL || "").trim();
  const stripeKey = env.STRIPE_SECRET_KEY_TEST || "";

  if (!/^[a-z0-9]{20}$/.test(projectRef) || projectRef === PRODUCTION_SUPABASE_REF) {
    throw new Error("STRIPE_TEST_ISOLATED_PROJECT_REQUIRED");
  }
  if (projectUrl !== "https://" + projectRef + ".supabase.co") {
    throw new Error("STRIPE_TEST_PROJECT_URL_MISMATCH");
  }
  if (!stripeKey.startsWith("sk_test_") || stripeKey.length <= "sk_test_".length) {
    throw new Error("STRIPE_TEST_SECRET_KEY_REQUIRED");
  }

  return {
    projectRef,
    projectUrl,
    webhookUrl: projectUrl + "/functions/v1/stripe-webhook",
    stripeKey,
  };
}

function isProductionHostname(hostname) {
  const normalized = hostname.toLowerCase();
  return normalized === PRODUCTION_SUPABASE_REF + ".supabase.co"
    || normalized === "thetok.ch"
    || normalized.endsWith(".thetok.ch");
}

function hasCheckoutEvents(endpoint) {
  const events = endpoint.enabled_events;
  return Array.isArray(events) && (
    events.includes("*") || REQUIRED_CHECKOUT_EVENTS.every((event) => events.includes(event))
  );
}

export async function inspectStripeTestWebhooks({
  env = process.env,
  fetchImpl = fetch,
} = {}) {
  // All local checks execute before the first network request.
  const config = assertStripeTestTarget(env);
  const endpoints = [];
  const seenCursors = new Set();
  let startingAfter = "";

  for (let page = 0; page < MAX_PAGES; page += 1) {
    const url = new URL("https://api.stripe.com/v1/webhook_endpoints");
    url.searchParams.set("limit", String(PAGE_SIZE));
    if (startingAfter) url.searchParams.set("starting_after", startingAfter);

    const response = await fetchImpl(url.toString(), {
      method: "GET",
      headers: { Authorization: "Bearer " + config.stripeKey },
      signal: AbortSignal.timeout(15000),
    });

    // Stripe error bodies may contain account details; never print them or the API key.
    if (!response.ok) throw new Error("STRIPE_TEST_WEBHOOK_READ_FAILED_" + response.status);
    let payload;
    try {
      payload = await response.json();
    } catch {
      throw new Error("STRIPE_TEST_WEBHOOK_RESPONSE_INVALID");
    }
    if (!payload || !Array.isArray(payload.data) || typeof payload.has_more !== "boolean") {
      throw new Error("STRIPE_TEST_WEBHOOK_RESPONSE_INVALID");
    }
    endpoints.push(...payload.data);
    if (!payload.has_more) break;

    const cursor = payload.data.at(-1)?.id;
    if (!cursor || seenCursors.has(cursor)) {
      throw new Error("STRIPE_TEST_WEBHOOK_PAGINATION_INVALID");
    }
    if (page === MAX_PAGES - 1) {
      throw new Error("STRIPE_TEST_WEBHOOK_PAGINATION_LIMIT");
    }
    seenCursors.add(cursor);
    startingAfter = cursor;
  }

  const enabled = endpoints.filter((endpoint) => endpoint.status === "enabled");
  for (const endpoint of enabled) {
    if (endpoint.livemode !== false) throw new Error("STRIPE_TEST_LIVE_WEBHOOK_RETURNED");
    let hostname;
    try {
      hostname = new URL(endpoint.url).hostname;
    } catch {
      throw new Error("STRIPE_TEST_WEBHOOK_URL_INVALID");
    }
    if (isProductionHostname(hostname)) {
      throw new Error("ACTIVE_STRIPE_TEST_WEBHOOK_TARGETS_PRODUCTION");
    }
  }

  const matching = enabled.filter((endpoint) => endpoint.url === config.webhookUrl && hasCheckoutEvents(endpoint));
  if (!matching.length) throw new Error("ISOLATED_STRIPE_TEST_WEBHOOK_NOT_READY");
  if (matching.length !== 1) throw new Error("DUPLICATE_ISOLATED_STRIPE_TEST_WEBHOOKS");

  return {
    projectRef: config.projectRef,
    activeWebhookCount: enabled.length,
    disabledWebhookCount: endpoints.length - enabled.length,
    isolatedCheckoutWebhookCount: matching.length,
    status: "ready",
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  inspectStripeTestWebhooks()
    .then((result) => console.log(JSON.stringify(result)))
    .catch((error) => {
      console.error(error instanceof Error ? error.message : "STRIPE_TEST_WEBHOOK_CHECK_FAILED");
      process.exitCode = 1;
    });
}
