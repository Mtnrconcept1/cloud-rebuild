#!/usr/bin/env node

const args = new Set(process.argv.slice(2));
const dryRun = !args.has("--execute");
const refuseProduction = !args.has("--allow-production");
const baseUrl = (process.env.TOK_LOAD_TEST_BASE_URL || "").trim().replace(/\/+$/, "");
const concurrencyScale = Math.max(1, Number(process.env.TOK_LOAD_TEST_SCALE || 1));

const scenarios = [
  {
    name: "100 utilisateurs simultanes sur la homepage",
    method: "GET",
    path: "/",
    concurrency: 100,
  },
  {
    name: "100 recherches restaurant en parallele",
    method: "GET",
    path: "/recherche?q=pizza&ville=geneve",
    concurrency: 100,
  },
  {
    name: "50 paniers simultanes",
    method: "GET",
    path: "/panier",
    concurrency: 50,
  },
  {
    name: "20 paiements Stripe test en parallele",
    method: "POST",
    pathEnv: "TOK_LOAD_TEST_CHECKOUT_ENDPOINT",
    concurrency: 20,
    requiresFixture: true,
  },
  {
    name: "Webhook Stripe recu plusieurs fois",
    method: "POST",
    pathEnv: "TOK_LOAD_TEST_STRIPE_WEBHOOK_REPLAY_ENDPOINT",
    concurrency: 5,
    requiresFixture: true,
  },
  {
    name: "Commande payee mais restaurant muet",
    method: "POST",
    pathEnv: "TOK_LOAD_TEST_RECONCILE_ENDPOINT",
    concurrency: 5,
    requiresFixture: true,
  },
  {
    name: "Restaurant qui refuse une commande payee",
    method: "POST",
    pathEnv: "TOK_LOAD_TEST_RESTAURANT_REFUSAL_ENDPOINT",
    concurrency: 5,
    requiresFixture: true,
  },
  {
    name: "Produit supprime pendant paiement",
    method: "POST",
    pathEnv: "TOK_LOAD_TEST_DELETED_PRODUCT_CHECKOUT_ENDPOINT",
    concurrency: 5,
    requiresFixture: true,
  },
  {
    name: "Double reservation",
    method: "POST",
    pathEnv: "TOK_LOAD_TEST_DOUBLE_RESERVATION_ENDPOINT",
    concurrency: 2,
    requiresFixture: true,
  },
  {
    name: "Upload massif d'images",
    method: "POST",
    pathEnv: "TOK_LOAD_TEST_IMAGE_UPLOAD_ENDPOINT",
    concurrency: 20,
    requiresFixture: true,
  },
  {
    name: "Connexion simultanee client, restaurateur et admin",
    method: "POST",
    pathEnv: "TOK_LOAD_TEST_AUTH_ENDPOINT",
    concurrency: 3,
    requiresFixture: true,
  },
];

function isProductionTarget(url) {
  return /(^|\.)thetok\.ch$/i.test(url.hostname)
    || /cloud-rebuild-recovered\.vercel\.app$/i.test(url.hostname);
}

function resolveScenarioPath(scenario) {
  if (scenario.path) return scenario.path;
  const configured = process.env[scenario.pathEnv || ""];
  return configured ? configured.trim() : "";
}

function printPlan() {
  console.log(JSON.stringify({
    dryRun,
    refuseProduction,
    baseUrl: baseUrl || null,
    executeWith: "TOK_LOAD_TEST_BASE_URL=http://localhost:4173 pnpm test:launch:10k -- --execute",
    scenarios: scenarios.map((scenario) => ({
      name: scenario.name,
      concurrency: Math.max(1, Math.round(scenario.concurrency * concurrencyScale)),
      method: scenario.method,
      path: resolveScenarioPath(scenario) || null,
      requiresFixture: Boolean(scenario.requiresFixture),
    })),
  }, null, 2));
}

async function requestOnce(url, scenario) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  const started = performance.now();
  try {
    const response = await fetch(url, {
      method: scenario.method,
      headers: {
        "content-type": "application/json",
        ...(process.env.TOK_LOAD_TEST_AUTH_TOKEN
          ? { authorization: `Bearer ${process.env.TOK_LOAD_TEST_AUTH_TOKEN}` }
          : {}),
      },
      body: scenario.method === "GET" ? undefined : "{}",
      signal: controller.signal,
    });
    return {
      ok: response.ok,
      status: response.status,
      durationMs: Math.round(performance.now() - started),
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function runScenario(scenario) {
  const path = resolveScenarioPath(scenario);
  if (!path) {
    return {
      name: scenario.name,
      skipped: true,
      reason: `Fixture endpoint missing: ${scenario.pathEnv}`,
    };
  }

  const concurrency = Math.max(1, Math.round(scenario.concurrency * concurrencyScale));
  const url = path.startsWith("http") ? path : `${baseUrl}${path.startsWith("/") ? path : `/${path}`}`;
  const results = await Promise.allSettled(
    Array.from({ length: concurrency }, () => requestOnce(url, scenario)),
  );
  const fulfilled = results
    .filter((result) => result.status === "fulfilled")
    .map((result) => result.value);
  const failed = results.length - fulfilled.length;
  const badStatuses = fulfilled.filter((result) => !result.ok).length;
  const durations = fulfilled.map((result) => result.durationMs).sort((a, b) => a - b);
  const p95 = durations.length ? durations[Math.min(durations.length - 1, Math.floor(durations.length * 0.95))] : null;

  return {
    name: scenario.name,
    skipped: false,
    concurrency,
    requests: results.length,
    failed,
    badStatuses,
    p95Ms: p95,
  };
}

if (dryRun || !baseUrl) {
  printPlan();
  process.exit(0);
}

const parsedBaseUrl = new URL(baseUrl);
if (refuseProduction && isProductionTarget(parsedBaseUrl)) {
  console.error("Production target refused. Use --allow-production only from an authorized release/load-test window.");
  process.exit(2);
}

const results = [];
for (const scenario of scenarios) {
  results.push(await runScenario(scenario));
}

console.log(JSON.stringify({ baseUrl, dryRun, refuseProduction, results }, null, 2));

const failed = results.some((result) => !result.skipped && (result.failed > 0 || result.badStatuses > 0));
process.exit(failed ? 1 : 0);
