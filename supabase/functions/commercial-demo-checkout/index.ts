import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import {
  HttpError,
  authenticateRequest,
  buildRequestMetadata,
  createAdminClient,
  jsonResponse,
  writeAuditLog,
} from "../_shared/auth.ts";
import { buildCorsHeaders, handleCorsPreflight } from "../_shared/cors.ts";
import { isCommercialDemoCheckoutRequestAllowed } from "../_shared/commercial-demo-host.ts";
import { makeLogger } from "../_shared/logging.ts";
import { createRateLimiter } from "../_shared/rate-limit.ts";

const FUNCTION_NAME = "commercial-demo-checkout";
const DEMO_ENVIRONMENT = "commercial_demo";
const DEMO_PROJECT_URL = "https://hzldfhjfgjcadmpghhhf.supabase.co";
const PAYMENT_MODE = "simulated";
const MAX_DEMO_TOTAL_CENTS = 100_000;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type DemoCheckoutAction = "simulate" | "create" | "confirm";

type DemoCheckoutBody = {
  action?: unknown;
  demo_restaurant_id?: unknown;
  demo_session_id?: unknown;
};

type DemoCheckoutOrder = {
  order_id: string;
  session_id: string;
  commercial_user_id: string;
  order_number: string;
  total_amount_cents: number;
  currency: string;
  stripe_mode: string;
  payment_status: string;
};

class DemoCheckoutError extends HttpError {
  code: string;

  constructor(status: number, code: string, message: string) {
    super(status, message);
    this.code = code;
  }
}

function requireUuid(value: unknown, field: string) {
  const normalized = typeof value === "string" ? value.trim() : "";
  if (!UUID_PATTERN.test(normalized)) {
    throw new DemoCheckoutError(400, "INVALID_DEMO_CHECKOUT_REQUEST", `${field} invalide`);
  }
  return normalized;
}

function normalizeAction(value: unknown): DemoCheckoutAction {
  const normalized = String(value || "create").trim().toLowerCase();
  if (normalized === "simulate" || normalized === "create" || normalized === "confirm") return normalized;
  throw new DemoCheckoutError(400, "INVALID_DEMO_CHECKOUT_ACTION", "Action de paiement simulé invalide");
}

function normalizeOrder(raw: unknown): DemoCheckoutOrder {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new DemoCheckoutError(404, "DEMO_ORDER_NOT_FOUND", "Commande de démonstration introuvable");
  }

  const value = raw as Record<string, unknown>;
  const order: DemoCheckoutOrder = {
    order_id: String(value.order_id || ""),
    session_id: String(value.session_id || ""),
    commercial_user_id: String(value.commercial_user_id || ""),
    order_number: String(value.order_number || "Commande démo").slice(0, 80),
    total_amount_cents: Number(value.total_amount_cents),
    currency: String(value.currency || "").trim().toLowerCase(),
    stripe_mode: String(value.stripe_mode || "").trim().toLowerCase(),
    payment_status: String(value.payment_status || "").trim().toLowerCase(),
  };

  if (
    !UUID_PATTERN.test(order.order_id) ||
    !UUID_PATTERN.test(order.session_id) ||
    !UUID_PATTERN.test(order.commercial_user_id)
  ) {
    throw new DemoCheckoutError(500, "INVALID_DEMO_ORDER_CONTEXT", "Contexte de commande démo invalide");
  }
  if (
    !Number.isSafeInteger(order.total_amount_cents) ||
    order.total_amount_cents < 50 ||
    order.total_amount_cents > MAX_DEMO_TOTAL_CENTS
  ) {
    throw new DemoCheckoutError(400, "INVALID_DEMO_ORDER_TOTAL", "Montant de commande démo invalide");
  }
  if (order.currency !== "chf" || order.stripe_mode !== "test") {
    throw new DemoCheckoutError(409, "DEMO_ORDER_NOT_TEST_ONLY", "La commande n'est pas isolée en mode test");
  }

  return order;
}

async function sha256Hex(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function requireDedicatedDemoRuntime() {
  const runtimeUrl = String(Deno.env.get("SUPABASE_URL") || "").replace(/\/+$/, "");
  if (runtimeUrl !== DEMO_PROJECT_URL) {
    throw new DemoCheckoutError(
      403,
      "DEDICATED_DEMO_PROJECT_REQUIRED",
      "Le simulateur de paiement fonctionne uniquement dans le projet Démo dédié",
    );
  }
}

async function buildSimulationReference(order: DemoCheckoutOrder) {
  const digest = await sha256Hex(
    `${DEMO_ENVIRONMENT}:${order.commercial_user_id}:${order.session_id}:${order.order_id}`,
  );
  return `demo_sim_${digest.slice(0, 48)}`;
}

async function getAuthorizedOrder(input: {
  actor: Awaited<ReturnType<typeof authenticateRequest>>;
  demoRestaurantId: string;
  demoSessionId: string;
}) {
  const { actor, demoRestaurantId, demoSessionId } = input;
  const hasAllowedRole = actor.roles.includes("commercial") || actor.roles.includes("admin");
  if (!actor.userId || !hasAllowedRole) {
    throw new DemoCheckoutError(403, "FORBIDDEN", "Accès réservé aux commerciaux et administrateurs");
  }

  const { data: rawOrder, error: orderError } = await actor.adminClient.rpc(
    "commercial_demo_get_checkout_order",
    { p_session_id: demoSessionId },
  );
  if (orderError) {
    if (["PGRST116", "P0001", "P0002"].includes(orderError.code || "")) {
      throw new DemoCheckoutError(404, "DEMO_ORDER_NOT_FOUND", "Commande de démonstration introuvable");
    }
    throw new DemoCheckoutError(500, "DEMO_ORDER_LOOKUP_FAILED", "Lecture de la commande démo impossible");
  }
  const order = normalizeOrder(rawOrder);

  if (order.session_id !== demoSessionId) {
    throw new DemoCheckoutError(409, "DEMO_SESSION_MISMATCH", "Commande et session de démonstration incompatibles");
  }
  if (!actor.isAdmin && order.commercial_user_id !== actor.userId) {
    throw new DemoCheckoutError(403, "FORBIDDEN", "Cette commande appartient à une autre démonstration");
  }

  // Validate the authoritative mapping even for administrators. This binds
  // the order to one active commercial demo account and one non-public demo
  // restaurant without ever trusting a restaurant id supplied by the client.
  const { data: mapping, error: mappingError } = await actor.adminClient
    .from("commercial_demo_accounts")
    .select("user_id,demo_restaurant_id,is_active")
    .eq("user_id", order.commercial_user_id)
    .eq("demo_restaurant_id", demoRestaurantId)
    .eq("is_active", true)
    .maybeSingle();

  if (mappingError) {
    throw new DemoCheckoutError(500, "DEMO_ACCOUNT_LOOKUP_FAILED", "Vérification du compte démo impossible");
  }
  if (!mapping) {
    throw new DemoCheckoutError(403, "DEMO_ACCOUNT_INACTIVE", "Compte commercial de démonstration inactif");
  }

  const { data: restaurant, error: restaurantError } = await actor.adminClient
    .from("restaurants")
    .select("id,is_demo,is_active,status,stripe_account_id,stripe_connect_details_submitted,stripe_connect_charges_enabled,stripe_connect_payouts_enabled")
    .eq("id", demoRestaurantId)
    .maybeSingle();

  if (restaurantError) {
    throw new DemoCheckoutError(500, "DEMO_RESTAURANT_LOOKUP_FAILED", "Vérification du restaurant démo impossible");
  }
  if (
    !restaurant ||
    restaurant.is_demo !== true ||
    restaurant.is_active !== true ||
    restaurant.status !== "demo" ||
    restaurant.stripe_account_id ||
    restaurant.stripe_connect_details_submitted === true ||
    restaurant.stripe_connect_charges_enabled === true ||
    restaurant.stripe_connect_payouts_enabled === true
  ) {
    throw new DemoCheckoutError(403, "DEMO_RESTAURANT_REQUIRED", "Restaurant de démonstration isolé requis");
  }

  return order;
}

Deno.serve(async (req) => {
  const corsHeaders = buildCorsHeaders(req);
  const preflight = handleCorsPreflight(req, corsHeaders);
  if (preflight) return preflight;

  const log = makeLogger(FUNCTION_NAME);
  let actor: Awaited<ReturnType<typeof authenticateRequest>> | null = null;
  let action: DemoCheckoutAction = "create";
  let demoOrderId = "";

  try {
    if (req.method !== "POST") {
      throw new DemoCheckoutError(405, "METHOD_NOT_ALLOWED", "Méthode non autorisée");
    }
    if (!isCommercialDemoCheckoutRequestAllowed(req)) {
      throw new DemoCheckoutError(
        403,
        "COMMERCIAL_DEMO_HOST_REQUIRED",
        "Le paiement de démonstration est réservé au domaine commercial.thetok.ch.",
      );
    }

    requireDedicatedDemoRuntime();
    actor = await authenticateRequest(req, { allowServiceRole: false });
    if (!actor.userId) {
      throw new DemoCheckoutError(401, "AUTH_REQUIRED", "Authentification requise");
    }

    const requestMetadata = buildRequestMetadata(req);
    const rateLimiter = createRateLimiter(actor.adminClient, FUNCTION_NAME);
    await rateLimiter.consume(`user:${actor.userId}`, { maxRequests: 20, windowSeconds: 300 });
    if (requestMetadata.ip) {
      await rateLimiter.consume(`ip:${requestMetadata.ip}`, { maxRequests: 80, windowSeconds: 300 });
    }
    await rateLimiter.consume("global", { maxRequests: 300, windowSeconds: 60 });

    let body: DemoCheckoutBody;
    try {
      body = await req.json() as DemoCheckoutBody;
    } catch {
      throw new DemoCheckoutError(400, "INVALID_DEMO_CHECKOUT_REQUEST", "Corps JSON invalide");
    }
    action = normalizeAction(body.action);
    const demoRestaurantId = requireUuid(body.demo_restaurant_id, "demo_restaurant_id");
    const demoSessionId = requireUuid(body.demo_session_id, "demo_session_id");
    const order = await getAuthorizedOrder({
      actor,
      demoRestaurantId,
      demoSessionId,
    });
    demoOrderId = order.order_id;

    if (!["requires_payment", "test_paid"].includes(order.payment_status)) {
      throw new DemoCheckoutError(409, "DEMO_ORDER_NOT_PAYABLE", "Cette commande démo n'est pas payable");
    }

    const simulationId = await buildSimulationReference(order);
    const { data: snapshot, error: confirmError } = await actor.adminClient.rpc(
      "commercial_demo_confirm_simulated_payment",
      {
        p_order_id: order.order_id,
        p_simulation_id: simulationId,
      },
    );
    if (confirmError) {
      log.error("commercial_demo_payment_simulation_rejected", {
        demoOrderId: order.order_id,
        errorCode: confirmError.code || null,
      });
      throw new DemoCheckoutError(
        409,
        "DEMO_PAYMENT_SIMULATION_REJECTED",
        "La simulation du paiement démo a été refusée",
      );
    }

    await writeAuditLog({
      adminClient: actor.adminClient,
      actor,
      request: req,
      functionName: FUNCTION_NAME,
      action: "confirm_simulated_payment",
      status: "success",
      targetEntityType: "commercial_demo_order",
      targetEntityId: order.order_id,
      metadata: {
        demo_environment: DEMO_ENVIRONMENT,
        payment_mode: PAYMENT_MODE,
        payment_provider_called: false,
        simulation_id: simulationId,
        amount_cents: order.total_amount_cents,
        currency: order.currency,
        no_financial_ledger: true,
      },
    });

    return jsonResponse({
      paid: true,
      simulated: true,
      payment_status: "test_paid",
      mode: PAYMENT_MODE,
      payment_provider: "none",
      simulation_id: simulationId,
      demo_order_id: order.order_id,
      demo_session_id: order.session_id,
      snapshot,
    }, 200, corsHeaders);
  } catch (error) {
    const httpError = error instanceof HttpError ? error : null;
    const code = error instanceof DemoCheckoutError
      ? error.code
      : httpError?.status === 401
      ? "AUTH_REQUIRED"
      : httpError?.status === 429
      ? "RATE_LIMITED"
      : "DEMO_CHECKOUT_FAILED";
    const status = httpError?.status || 500;
    const safeMessage = error instanceof DemoCheckoutError
      ? error.message
      : code === "AUTH_REQUIRED"
      ? "Authentification requise"
      : code === "RATE_LIMITED"
      ? "Trop de tentatives de paiement démo"
      : "La simulation du paiement de démonstration a échoué";

    log.error("commercial_demo_payment_simulation_failed", {
      action,
      code,
      status,
      demoOrderId: demoOrderId || null,
    });

    try {
      await writeAuditLog({
        adminClient: actor?.adminClient || createAdminClient(),
        actor,
        request: req,
        functionName: FUNCTION_NAME,
        action: `${action}_simulated_payment`,
        status: "failure",
        targetEntityType: "commercial_demo_order",
        targetEntityId: demoOrderId || null,
        errorMessage: safeMessage,
        metadata: { code, demo_environment: DEMO_ENVIRONMENT, payment_mode: PAYMENT_MODE },
      });
    } catch {
      // The original, sanitized error response remains authoritative.
    }

    return jsonResponse({ error: safeMessage, code }, status, corsHeaders);
  }
});
