import {
  HttpError,
  authenticateRequest,
  jsonResponse,
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

function estimateCostChf(inputTokens = 0, outputTokens = 0) {
  return Number(((inputTokens * 0.00000025) + (outputTokens * 0.000001)).toFixed(6));
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
  let insightId: string | null = null;
  let action: AccountingAction = "monthly_summary";
  const model = selectTokAiModel("accounting");

  try {
    actor = await authenticateRequest(req, { allowServiceRole: false });
    requireUserRole(actor, ["admin"]);
    if (!OPENAI_API_KEY) throw new HttpError(503, "ai_service_unavailable");

    const body = await req.json().catch(() => ({}));
    restaurantId = maybeUuid(body.restaurantId);
    action = sanitizeAction(body.action);
    const period = parsePeriod(body.month);

    const rl = createRateLimiter(actor.adminClient, FUNCTION_NAME);
    await rl.consume(`user:${actor.userId}`, { maxRequests: 20, windowSeconds: 3600 });
    await rl.consume("global", { maxRequests: 80, windowSeconds: 60 });

    let quota: unknown = null;
    if (restaurantId) {
      const { data, error } = await actor.adminClient.rpc("check_restaurant_ai_quota", {
        p_restaurant_id: restaurantId,
        p_feature: FEATURE_NAME,
        p_units: 1,
      });
      if (error) throw new HttpError(503, error.message);
      quota = data;
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

    const paymentsQuery = actor.adminClient
      .from("payment_transactions")
      .select("id, order_id, amount, status, provider, created_at, stripe_payment_intent_id, stripe_checkout_session_id")
      .gte("created_at", `${period.start}T00:00:00Z`)
      .lte("created_at", `${period.end}T23:59:59Z`)
      .order("created_at", { ascending: false })
      .limit(300);

    const usageQuery = actor.adminClient
      .from("ai_usage_logs")
      .select("function_name, action, feature_name, restaurant_id, status, total_tokens, estimated_cost_chf, created_at")
      .gte("created_at", `${period.start}T00:00:00Z`)
      .lte("created_at", `${period.end}T23:59:59Z`)
      .order("created_at", { ascending: false })
      .limit(300);
    if (restaurantId) usageQuery.eq("restaurant_id", restaurantId);

    const [invoicesResult, ordersResult, paymentsResult, usageResult] = await Promise.all([
      invoicesQuery,
      ordersQuery,
      paymentsQuery,
      usageQuery,
    ]);

    if (invoicesResult.error) throw new HttpError(500, invoicesResult.error.message);
    if (ordersResult.error) throw new HttpError(500, ordersResult.error.message);
    if (paymentsResult.error) throw new HttpError(500, paymentsResult.error.message);
    if (usageResult.error) throw new HttpError(500, usageResult.error.message);

    const orders = ordersResult.data || [];
    const invoices = invoicesResult.data || [];
    const aiUsage = usageResult.data || [];
    const grossRevenue = orders.reduce((sum: number, order: Record<string, unknown>) => sum + Number(order.total_amount || 0), 0);
    const invoiceTotal = invoices.reduce((sum: number, invoice: Record<string, unknown>) => sum + Number(invoice.amount_ttc || 0), 0);
    const aiCost = aiUsage.reduce((sum: number, row: Record<string, unknown>) => sum + Number(row.estimated_cost_chf || 0), 0);

    const context = {
      action,
      period,
      restaurant_id: restaurantId,
      quota,
      metrics: {
        order_count: orders.length,
        gross_revenue_chf: Number(grossRevenue.toFixed(2)),
        invoice_total_chf: Number(invoiceTotal.toFixed(2)),
        estimated_tok_commission_chf: Number((grossRevenue * 0.1).toFixed(2)),
        estimated_restaurant_payout_chf: Number((grossRevenue * 0.9).toFixed(2)),
        ai_cost_chf: Number(aiCost.toFixed(4)),
      },
      invoices,
      orders_sample: orders.slice(0, 80),
      payments_sample: paymentsResult.data || [],
      ai_usage_sample: aiUsage,
    };

    const systemPrompt = `Tu es l'agent IA comptable interne TOK.
Tu analyses les factures, commissions, frais Stripe, impayes, couts IA et previsions.
Garde toutes les recommandations en brouillon: aucune ecriture comptable, aucun verrouillage mensuel, aucune annulation et aucun remboursement.
Mentionne les incertitudes et les donnees manquantes. Reponds en francais business, factuel et exportable.`;

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

    const result = parseStructuredOutput<AccountingResult>(openAIResponse);
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
