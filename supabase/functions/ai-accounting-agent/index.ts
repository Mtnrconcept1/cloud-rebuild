import {
  HttpError,
  authenticateRequest,
  jsonResponse,
  requireRestaurantAccess,
  requireUserRole,
  writeAuditLog,
} from "../_shared/auth.ts";
import { buildCorsHeaders, handleCorsPreflight } from "../_shared/cors.ts";
import { makeLogger } from "../_shared/logging.ts";
import { createRateLimiter } from "../_shared/rate-limit.ts";
import {
  OPENAI_API_KEY,
  createOpenAIResponse,
  extractUsage,
  parseStructuredOutput,
  selectTokAiModel,
} from "../_shared/openai.ts";

type AccountingAction = "monthly_summary" | "invoice_anomalies" | "revenue_forecast" | "margin_review";

type AccountingResult = {
  summary: string;
  anomalies: Array<{ label: string; severity: "low" | "medium" | "high"; evidence: string }>;
  unpaid_invoices: string[];
  risky_restaurants: string[];
  revenue_forecast: string;
  margin_notes: string[];
  recommended_actions: string[];
  export_markdown: string;
};

const FUNCTION_NAME = "ai-accounting-agent";
const FEATURE_NAME = "ai_accounting_insights";
const DEFAULT_RESTAURANT_LABEL = "le restaurant concerné";
const UUID_PATTERN = /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/gi;
const SNAKE_CASE_PATTERN = /\b[a-z][a-z0-9]*(?:_[a-z0-9]+)+\b/g;

const ORDER_STATUS_LABELS: Record<string, string> = {
  pending_payment: "paiement en attente",
  payment_pending: "paiement en attente",
  pending: "en attente",
  preparing: "en préparation",
  accepted: "acceptée",
  completed: "terminée",
  delivered: "livrée",
  cancelled: "annulée",
  refunded: "remboursée",
};

const PUBLIC_COPY_REPLACEMENTS: Array<[RegExp, string]> = [
  [/\bpending_payment\b/gi, "paiement en attente"],
  [/\bpayment_pending\b/gi, "paiement en attente"],
  [/\bpreparing\b/gi, "en préparation"],
  [/\baccepted\b/gi, "acceptée"],
  [/\bcompleted\b/gi, "terminée"],
  [/\bdelivered\b/gi, "livrée"],
  [/\bcancelled\b/gi, "annulée"],
  [/\brefunded\b/gi, "remboursée"],
  [/\bdonn(?:ées|ees)\s+back[- ]?end\b/gi, "données disponibles"],
  [/\bbackend\b/gi, "données disponibles"],
  [/\bback-end\b/gi, "données disponibles"],
  [/\bSupabase\b/gi, "plateforme"],
  [/\bStripe\b/gi, "paiement"],
  [/\bcut[- ]off\b/gi, "clôture"],
  [/\bpayment_transactions\b/gi, "transactions de paiement"],
  [/\bai_usage_logs\b/gi, "consommation IA"],
  [/\borders\b/gi, "commandes"],
  [/\brestaurant_invoices\b/gi, "factures"],
];

const OUTPUT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "summary",
    "anomalies",
    "unpaid_invoices",
    "risky_restaurants",
    "revenue_forecast",
    "margin_notes",
    "recommended_actions",
    "export_markdown",
  ],
  properties: {
    summary: { type: "string" },
    anomalies: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["label", "severity", "evidence"],
        properties: {
          label: { type: "string" },
          severity: { type: "string", enum: ["low", "medium", "high"] },
          evidence: { type: "string" },
        },
      },
    },
    unpaid_invoices: { type: "array", items: { type: "string" } },
    risky_restaurants: { type: "array", items: { type: "string" } },
    revenue_forecast: { type: "string" },
    margin_notes: { type: "array", items: { type: "string" } },
    recommended_actions: { type: "array", items: { type: "string" } },
    export_markdown: { type: "string" },
  },
};

function maybeUuid(raw: unknown) {
  return typeof raw === "string" && /^[0-9a-f-]{36}$/i.test(raw) ? raw : null;
}

function sanitizeAction(raw: unknown): AccountingAction {
  if (raw === "invoice_anomalies" || raw === "revenue_forecast" || raw === "margin_review") return raw;
  return "monthly_summary";
}

function parsePeriod(rawMonth: unknown) {
  const month = typeof rawMonth === "string" && /^\d{4}-\d{2}$/.test(rawMonth)
    ? rawMonth
    : new Date().toISOString().slice(0, 7);
  const start = `${month}-01`;
  const endDate = new Date(`${start}T00:00:00Z`);
  endDate.setUTCMonth(endDate.getUTCMonth() + 1);
  endDate.setUTCDate(endDate.getUTCDate() - 1);
  return { month, start, end: endDate.toISOString().slice(0, 10) };
}

function isQuotaAllowed(value: unknown) {
  if (!value || typeof value !== "object") return true;
  return (value as Record<string, unknown>).allowed !== false;
}

function isMissingQuotaRpc(error: { message?: string } | null | undefined) {
  const message = error?.message || "";
  return message.includes("check_restaurant_ai_quota") || message.includes("schema cache");
}

async function checkRestaurantQuota(
  actor: Awaited<ReturnType<typeof authenticateRequest>>,
  restaurantId: string,
) {
  const { data, error } = await actor.adminClient.rpc("check_restaurant_ai_quota", {
    p_restaurant_id: restaurantId,
    p_feature: FEATURE_NAME,
    p_units: 1,
  });

  if (!error) return data;
  if (!isMissingQuotaRpc(error)) throw new HttpError(503, error.message);

  return {
    allowed: true,
    feature: FEATURE_NAME,
    degraded: true,
    reason: "quota_rpc_unavailable",
  };
}

function estimateCostChf(inputTokens = 0, outputTokens = 0) {
  return Number(((inputTokens * 0.00000025) + (outputTokens * 0.000001)).toFixed(6));
}

function getDisplayName(raw: unknown, fallback = DEFAULT_RESTAURANT_LABEL) {
  return typeof raw === "string" && raw.trim() ? raw.trim() : fallback;
}

function formatOrderStatus(raw: unknown) {
  const status = typeof raw === "string" ? raw.trim() : "";
  return ORDER_STATUS_LABELS[status] || status.replace(/_/g, " ") || "statut non précisé";
}

function replaceSnakeCaseToken(token: string) {
  return token.split("_").filter(Boolean).join(" ");
}

function sanitizeAccountingText(value: unknown, restaurantName?: string | null) {
  if (typeof value !== "string" || !value.trim()) return "";

  const displayName = getDisplayName(restaurantName);
  let text = value;

  text = text.replace(/\brestaurant[_\s-]?id\b\s*:?\s*/gi, "restaurant ");
  text = text.replace(UUID_PATTERN, displayName);

  for (const [pattern, replacement] of PUBLIC_COPY_REPLACEMENTS) {
    text = text.replace(pattern, replacement);
  }

  text = text.replace(SNAKE_CASE_PATTERN, replaceSnakeCaseToken);

  return text
    .replace(/\brestaurant\s+le restaurant concerné\b/gi, DEFAULT_RESTAURANT_LABEL)
    .replace(/\bpaiement\/paiement\b/gi, "paiement")
    .replace(/\s+([,.])/g, "$1")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

function sanitizeAccountingResult(result: AccountingResult, restaurantName?: string | null): AccountingResult {
  return {
    ...result,
    summary: sanitizeAccountingText(result.summary, restaurantName),
    anomalies: result.anomalies.map((anomaly) => ({
      ...anomaly,
      label: sanitizeAccountingText(anomaly.label, restaurantName),
      evidence: sanitizeAccountingText(anomaly.evidence, restaurantName),
    })),
    unpaid_invoices: result.unpaid_invoices.map((item) => sanitizeAccountingText(item, restaurantName)),
    risky_restaurants: result.risky_restaurants.map((item) => sanitizeAccountingText(item, restaurantName)),
    revenue_forecast: sanitizeAccountingText(result.revenue_forecast, restaurantName),
    margin_notes: result.margin_notes.map((item) => sanitizeAccountingText(item, restaurantName)),
    recommended_actions: result.recommended_actions.map((item) => sanitizeAccountingText(item, restaurantName)),
    export_markdown: sanitizeAccountingText(result.export_markdown, restaurantName),
  };
}

function getRestaurantNameForRow(row: Record<string, unknown>, restaurantNames: Map<string, string>, fallback: string) {
  const rowRestaurantId = typeof row.restaurant_id === "string" ? row.restaurant_id : "";
  return restaurantNames.get(rowRestaurantId) || fallback;
}

function buildPublicInvoices(invoices: Array<Record<string, unknown>>, restaurantNames: Map<string, string>, fallback: string) {
  return invoices.map((invoice) => ({
    restaurant: getRestaurantNameForRow(invoice, restaurantNames, fallback),
    invoice_number: invoice.invoice_number || null,
    period_start: invoice.period_start || null,
    period_end: invoice.period_end || null,
    amount_ht: Number(invoice.amount_ht || 0),
    amount_tva: Number(invoice.amount_tva || 0),
    amount_ttc: Number(invoice.amount_ttc || 0),
    status: formatOrderStatus(invoice.status),
    due_at: invoice.due_at || null,
    created_at: invoice.created_at || null,
  }));
}

function buildPublicOrders(orders: Array<Record<string, unknown>>, restaurantNames: Map<string, string>, fallback: string) {
  return orders.slice(0, 80).map((order) => ({
    restaurant: getRestaurantNameForRow(order, restaurantNames, fallback),
    status: formatOrderStatus(order.status),
    total_amount: Number(order.total_amount || 0),
    delivery_fee: Number(order.delivery_fee || 0),
    discount_amount: Number(order.discount_amount || 0),
    created_at: order.created_at || null,
  }));
}

function buildPublicPayments(payments: Array<Record<string, unknown>>) {
  return payments.map((payment) => ({
    amount: Number(payment.amount || 0),
    status: formatOrderStatus(payment.status),
    type: formatOrderStatus(payment.type),
    method: "paiement en ligne",
    created_at: payment.created_at || null,
  }));
}

function buildPublicAiUsage(rows: Array<Record<string, unknown>>, restaurantNames: Map<string, string>, fallback: string) {
  return rows.map((row) => ({
    restaurant: getRestaurantNameForRow(row, restaurantNames, fallback),
    action: formatOrderStatus(row.action),
    status: formatOrderStatus(row.status),
    total_tokens: Number(row.total_tokens || 0),
    estimated_cost_chf: Number(row.estimated_cost_chf || 0),
    created_at: row.created_at || null,
  }));
}

async function insertUsage(
  actor: Awaited<ReturnType<typeof authenticateRequest>>,
  payload: {
    status: "success" | "failure";
    action: string;
    restaurantId?: string | null;
    insightId?: string | null;
    model: string;
    usage?: ReturnType<typeof extractUsage>;
    metadata?: Record<string, unknown>;
  },
) {
  await actor.adminClient.from("ai_usage_logs").insert({
    function_name: FUNCTION_NAME,
    action: payload.action,
    feature_name: FEATURE_NAME,
    source: FUNCTION_NAME,
    model: payload.model,
    user_id: actor.userId,
    restaurant_id: payload.restaurantId || null,
    status: payload.status,
    input_tokens: payload.usage?.input_tokens ?? 0,
    output_tokens: payload.usage?.output_tokens ?? 0,
    total_tokens: payload.usage?.total_tokens ?? 0,
    estimated_cost_chf: estimateCostChf(payload.usage?.input_tokens, payload.usage?.output_tokens),
    metadata: {
      feature: FEATURE_NAME,
      credit_kind: "ai_tools",
      credit_units: 5,
      accounting_insight_id: payload.insightId || null,
      ...(payload.metadata || {}),
    },
  });
}

Deno.serve(async (req) => {
  const cors = buildCorsHeaders(req);
  const preflight = handleCorsPreflight(req, cors);
  if (preflight) return preflight;

  const log = makeLogger(FUNCTION_NAME);
  let actor: Awaited<ReturnType<typeof authenticateRequest>> | null = null;
  let restaurantId: string | null = null;
  let restaurantDisplayName = DEFAULT_RESTAURANT_LABEL;
  let insightId: string | null = null;
  let action: AccountingAction = "monthly_summary";
  const model = selectTokAiModel("accounting");

  try {
    actor = await authenticateRequest(req, { allowServiceRole: false });
    const body = await req.json().catch(() => ({}));
    restaurantId = maybeUuid(body.restaurantId);
    const requestedRestaurantName = typeof body.restaurantName === "string" ? body.restaurantName.trim() : "";

    if (restaurantId) {
      const restaurant = await requireRestaurantAccess(actor, restaurantId);
      restaurantDisplayName = getDisplayName(restaurant.name, requestedRestaurantName || DEFAULT_RESTAURANT_LABEL);
    } else {
      requireUserRole(actor, ["admin"]);
      restaurantDisplayName = getDisplayName(requestedRestaurantName, "tous les restaurants");
    }

    if (!OPENAI_API_KEY) throw new HttpError(503, "ai_service_unavailable");

    action = sanitizeAction(body.action);
    const period = parsePeriod(body.month);

    const rl = createRateLimiter(actor.adminClient, FUNCTION_NAME);
    await rl.consume(`user:${actor.userId}`, { maxRequests: 20, windowSeconds: 3600 });
    await rl.consume("global", { maxRequests: 80, windowSeconds: 60 });

    let quota: unknown = null;
    if (restaurantId) {
      quota = await checkRestaurantQuota(actor, restaurantId);
      if (!isQuotaAllowed(quota)) throw new HttpError(402, "ai_quota_exceeded");
    }

    const invoicesQuery = actor.adminClient
      .from("restaurant_invoices")
      .select("id, restaurant_id, invoice_number, period_start, period_end, amount_ht, amount_tva, amount_ttc, status, due_at, created_at")
      .gte("period_start", period.start)
      .lte("period_end", period.end)
      .order("amount_ttc", { ascending: false })
      .limit(200);
    if (restaurantId) invoicesQuery.eq("restaurant_id", restaurantId);

    const ordersQuery = actor.adminClient
      .from("orders")
      .select("id, restaurant_id, status, total_amount, delivery_fee, discount_amount, created_at")
      .gte("created_at", `${period.start}T00:00:00Z`)
      .lte("created_at", `${period.end}T23:59:59Z`)
      .order("created_at", { ascending: false })
      .limit(400);
    if (restaurantId) ordersQuery.eq("restaurant_id", restaurantId);

    const usageQuery = actor.adminClient
      .from("ai_usage_logs")
      .select("function_name, action, feature_name, restaurant_id, status, total_tokens, estimated_cost_chf, created_at")
      .gte("created_at", `${period.start}T00:00:00Z`)
      .lte("created_at", `${period.end}T23:59:59Z`)
      .order("created_at", { ascending: false })
      .limit(300);
    if (restaurantId) usageQuery.eq("restaurant_id", restaurantId);

    const [invoicesResult, ordersResult, usageResult] = await Promise.all([
      invoicesQuery,
      ordersQuery,
      usageQuery,
    ]);

    if (invoicesResult.error) throw new HttpError(500, invoicesResult.error.message);
    if (ordersResult.error) throw new HttpError(500, ordersResult.error.message);
    if (usageResult.error) throw new HttpError(500, usageResult.error.message);

    const orders = ordersResult.data || [];
    const invoices = invoicesResult.data || [];
    const aiUsage = usageResult.data || [];
    let paymentRows: Array<Record<string, unknown>> = [];

    if (!restaurantId || orders.length > 0) {
      const paymentsQuery = actor.adminClient
        .from("payment_transactions")
        .select("order_id, amount, status, type, created_at")
        .gte("created_at", `${period.start}T00:00:00Z`)
        .lte("created_at", `${period.end}T23:59:59Z`)
        .order("created_at", { ascending: false })
        .limit(300);

      if (restaurantId) {
        paymentsQuery.in("order_id", orders.map((order: Record<string, unknown>) => String(order.id)).filter(Boolean));
      }

      const paymentsResult = await paymentsQuery;
      if (paymentsResult.error) throw new HttpError(500, paymentsResult.error.message);
      paymentRows = (paymentsResult.data || []) as Array<Record<string, unknown>>;
    }

    const restaurantIdsInScope = new Set<string>();
    if (restaurantId) restaurantIdsInScope.add(restaurantId);
    for (const row of [...orders, ...invoices, ...aiUsage] as Array<Record<string, unknown>>) {
      if (typeof row.restaurant_id === "string" && row.restaurant_id) restaurantIdsInScope.add(row.restaurant_id);
    }

    const restaurantNames = new Map<string, string>();
    if (restaurantId) restaurantNames.set(restaurantId, restaurantDisplayName);
    if (restaurantIdsInScope.size > 0) {
      const { data: restaurantRows, error: restaurantsError } = await actor.adminClient
        .from("restaurants")
        .select("id, name")
        .in("id", [...restaurantIdsInScope]);

      if (restaurantsError) throw new HttpError(500, restaurantsError.message);
      for (const row of (restaurantRows || []) as Array<Record<string, unknown>>) {
        if (typeof row.id === "string") restaurantNames.set(row.id, getDisplayName(row.name, restaurantNames.get(row.id) || DEFAULT_RESTAURANT_LABEL));
      }
    }

    const grossRevenue = orders.reduce((sum: number, order: Record<string, unknown>) => sum + Number(order.total_amount || 0), 0);
    const invoiceTotal = invoices.reduce((sum: number, invoice: Record<string, unknown>) => sum + Number(invoice.amount_ttc || 0), 0);
    const aiCost = aiUsage.reduce((sum: number, row: Record<string, unknown>) => sum + Number(row.estimated_cost_chf || 0), 0);

    const context = {
      action,
      period,
      restaurant: {
        name: restaurantDisplayName,
        scope: restaurantId ? "restaurant" : "plateforme",
      },
      quota: restaurantId ? { status: "disponible" } : null,
      metrics: {
        order_count: orders.length,
        gross_revenue_chf: Number(grossRevenue.toFixed(2)),
        invoice_total_chf: Number(invoiceTotal.toFixed(2)),
        estimated_tok_commission_chf: Number((grossRevenue * 0.1).toFixed(2)),
        estimated_restaurant_payout_chf: Number((grossRevenue * 0.9).toFixed(2)),
        ai_cost_chf: Number(aiCost.toFixed(4)),
      },
      invoices: buildPublicInvoices(invoices as Array<Record<string, unknown>>, restaurantNames, restaurantDisplayName),
      orders_sample: buildPublicOrders(orders as Array<Record<string, unknown>>, restaurantNames, restaurantDisplayName),
      payments_sample: buildPublicPayments(paymentRows),
      ai_usage_sample: buildPublicAiUsage(aiUsage as Array<Record<string, unknown>>, restaurantNames, restaurantDisplayName),
    };

    const systemPrompt = `Tu es l'agent IA comptable interne TOK.
Tu analyses les factures, commissions, frais de paiement, impayes, couts IA et previsions.
Garde toutes les recommandations en brouillon: aucune ecriture comptable, aucun verrouillage mensuel, aucune annulation et aucun remboursement.
Mentionne les incertitudes et les donnees manquantes. Reponds en francais business, factuel et exportable.
Utilise uniquement les noms visibles des restaurants fournis dans le contexte.
N'affiche jamais d'identifiant technique, UUID, nom de table, nom de colonne, statut brut, fournisseur de paiement, backend, Supabase ou Stripe.
Convertis les statuts techniques en libelles metier comprehensibles.`;

    const openAIResponse = await createOpenAIResponse({
      model,
      input: [
        { role: "system", content: systemPrompt },
        { role: "user", content: JSON.stringify(context) },
      ],
      maxOutputTokens: 1800,
      jsonSchema: {
        name: "tok_ai_accounting_result",
        description: "Admin accounting AI summary and export.",
        schema: OUTPUT_SCHEMA,
      },
    });

    const result = sanitizeAccountingResult(
      parseStructuredOutput<AccountingResult>(openAIResponse),
      restaurantDisplayName,
    );
    const usage = extractUsage(openAIResponse);

    const { data: insight, error: insightError } = await actor.adminClient
      .from("ai_accounting_insights")
      .insert({
        restaurant_id: restaurantId,
        user_id: actor.userId,
        period_start: period.start,
        period_end: period.end,
        summary: result.summary,
        anomalies: result.anomalies,
        forecast: {
          revenue_forecast: result.revenue_forecast,
          unpaid_invoices: result.unpaid_invoices,
          risky_restaurants: result.risky_restaurants,
        },
        margin_snapshot: {
          gross_revenue_chf: context.metrics.gross_revenue_chf,
          estimated_tok_commission_chf: context.metrics.estimated_tok_commission_chf,
          estimated_restaurant_payout_chf: context.metrics.estimated_restaurant_payout_chf,
          ai_cost_chf: context.metrics.ai_cost_chf,
          margin_notes: result.margin_notes,
        },
        model,
        metadata: { action, export_markdown: result.export_markdown },
      })
      .select("id")
      .single();

    if (insightError) throw new HttpError(500, insightError.message);
    insightId = insight.id;

    await insertUsage(actor, {
      status: "success",
      action,
      restaurantId,
      insightId,
      model,
      usage,
      metadata: { period, anomaly_count: result.anomalies.length },
    });

    await writeAuditLog({
      adminClient: actor.adminClient,
      functionName: FUNCTION_NAME,
      status: "success",
      action,
      actor,
      request: req,
      targetEntityType: "ai_accounting_insights",
      targetEntityId: insightId,
      metadata: { rid: log.rid, restaurant_id: restaurantId, period },
    });

    return jsonResponse({
      ...result,
      action,
      period,
      restaurantId,
      insightId,
      metrics: context.metrics,
      quota,
    }, 200, cors);
  } catch (err) {
    const status = err instanceof HttpError ? err.status : 500;
    const message = err instanceof HttpError ? err.message : "internal_error";
    log.error("request_failed", { status, message });

    if (actor) {
      await insertUsage(actor, {
        status: "failure",
        action,
        restaurantId,
        insightId,
        model,
        metadata: { error: message, rid: log.rid },
      }).catch(() => {});

      await writeAuditLog({
        adminClient: actor.adminClient,
        functionName: FUNCTION_NAME,
        status: "failure",
        action,
        actor,
        request: req,
        targetEntityType: "ai_accounting_insights",
        targetEntityId: insightId || restaurantId,
        errorMessage: message,
        metadata: { rid: log.rid },
      }).catch(() => {});
    }

    return jsonResponse({ error: message, rid: log.rid }, status, cors);
  }
});
