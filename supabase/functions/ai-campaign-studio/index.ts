import {
  HttpError,
  authenticateRequest,
  jsonResponse,
  writeAuditLog,
  requireRestaurantAccess,
} from "../_shared/auth.ts";
import { buildCorsHeaders, handleCorsPreflight } from "../_shared/cors.ts";
import { createRateLimiter } from "../_shared/rate-limit.ts";
import { makeLogger } from "../_shared/logging.ts";
import {
  OPENAI_API_KEY,
  createOpenAIResponse,
  estimateOpenAITextCostChf,
  extractUsage,
  getOpenAITextCreditUnits,
  parseStructuredOutput,
  selectTokAiModel,
} from "../_shared/openai.ts";
import {
  assertTokCreditSpendRecorded,
  estimateTextAiPreflightCredits,
  requireRestaurantTokCreditBalance,
} from "../_shared/restaurant-credits.ts";
import {
  clampNumber,
  createIdempotencyKey,
  isRecord,
  jsonObject,
  maybeUuid,
  normalizeStringArray,
  safeErrorMessage,
  sanitizeMultilineText,
  sanitizeText,
} from "../_shared/intelligence.ts";

type CampaignStudioAction = "generate" | "list" | "approve" | "mark_launched";

type CampaignStudioPlan = {
  title: string;
  summary: string;
  objective: string;
  campaign_payload: {
    title: string;
    body: string;
    type: "boost" | "banner" | "push";
    target_pages: string[];
    pricing_strategy: "visibility" | "traffic" | "conversion";
    base_budget: number;
    budget_daily: number;
    duration_days: number;
    starts_at: string;
    ends_at: string;
    target_criteria: {
      cuisines: string[];
      cities: string[];
      minOrders: number;
      maxDaysSinceOrder: number;
      minAvgBasket: number;
      favoritesOnly: boolean;
      customerSegment: "all" | "new" | "returning" | "loyal" | "inactive";
      journeyTypes: string[];
      serviceMoments: string[];
    };
    channels: {
      banner: boolean;
      restaurant_cards: boolean;
    };
  };
  projected_metrics: {
    estimated_reach: number;
    estimated_clicks: number;
    estimated_conversions: number;
    estimated_cost_per_conversion_chf: number;
  };
  rationale: string[];
  warnings: string[];
  confidence: "low" | "medium" | "high";
};

const FUNCTION_NAME = "ai-campaign-studio";
const MODEL = selectTokAiModel("strategy");
const VALID_ACTIONS = new Set<CampaignStudioAction>([
  "generate",
  "list",
  "approve",
  "mark_launched",
]);
const VALID_TYPES = new Set(["boost", "banner", "push"]);
const VALID_PAGES = new Set(["home", "search", "flash_sales", "anti_waste"]);
const VALID_STRATEGIES = new Set(["visibility", "traffic", "conversion"]);
const VALID_SEGMENTS = new Set(["all", "new", "returning", "loyal", "inactive"]);
const VALID_JOURNEYS = new Set(["delivery", "takeaway", "reservation", "zero_attente"]);
const VALID_MOMENTS = new Set(["lunch", "dinner", "weekend"]);

const OUTPUT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "title",
    "summary",
    "objective",
    "campaign_payload",
    "projected_metrics",
    "rationale",
    "warnings",
    "confidence",
  ],
  properties: {
    title: { type: "string" },
    summary: { type: "string" },
    objective: { type: "string" },
    campaign_payload: {
      type: "object",
      additionalProperties: false,
      required: [
        "title",
        "body",
        "type",
        "target_pages",
        "pricing_strategy",
        "base_budget",
        "budget_daily",
        "duration_days",
        "starts_at",
        "ends_at",
        "target_criteria",
        "channels",
      ],
      properties: {
        title: { type: "string" },
        body: { type: "string" },
        type: { type: "string", enum: ["boost", "banner", "push"] },
        target_pages: {
          type: "array",
          items: { type: "string", enum: ["home", "search", "flash_sales", "anti_waste"] },
        },
        pricing_strategy: {
          type: "string",
          enum: ["visibility", "traffic", "conversion"],
        },
        base_budget: { type: "number", minimum: 0, maximum: 5000 },
        budget_daily: { type: "number", minimum: 0, maximum: 1000 },
        duration_days: { type: "integer", minimum: 1, maximum: 31 },
        starts_at: { type: "string" },
        ends_at: { type: "string" },
        target_criteria: {
          type: "object",
          additionalProperties: false,
          required: [
            "cuisines",
            "cities",
            "minOrders",
            "maxDaysSinceOrder",
            "minAvgBasket",
            "favoritesOnly",
            "customerSegment",
            "journeyTypes",
            "serviceMoments",
          ],
          properties: {
            cuisines: { type: "array", items: { type: "string" } },
            cities: { type: "array", items: { type: "string" } },
            minOrders: { type: "integer", minimum: 0, maximum: 100 },
            maxDaysSinceOrder: { type: "integer", minimum: 1, maximum: 730 },
            minAvgBasket: { type: "number", minimum: 0, maximum: 1000 },
            favoritesOnly: { type: "boolean" },
            customerSegment: {
              type: "string",
              enum: ["all", "new", "returning", "loyal", "inactive"],
            },
            journeyTypes: {
              type: "array",
              items: {
                type: "string",
                enum: ["delivery", "takeaway", "reservation", "zero_attente"],
              },
            },
            serviceMoments: {
              type: "array",
              items: { type: "string", enum: ["lunch", "dinner", "weekend"] },
            },
          },
        },
        channels: {
          type: "object",
          additionalProperties: false,
          required: ["banner", "restaurant_cards"],
          properties: {
            banner: { type: "boolean" },
            restaurant_cards: { type: "boolean" },
          },
        },
      },
    },
    projected_metrics: {
      type: "object",
      additionalProperties: false,
      required: [
        "estimated_reach",
        "estimated_clicks",
        "estimated_conversions",
        "estimated_cost_per_conversion_chf",
      ],
      properties: {
        estimated_reach: { type: "integer", minimum: 0 },
        estimated_clicks: { type: "integer", minimum: 0 },
        estimated_conversions: { type: "integer", minimum: 0 },
        estimated_cost_per_conversion_chf: { type: "number", minimum: 0 },
      },
    },
    rationale: { type: "array", items: { type: "string" } },
    warnings: { type: "array", items: { type: "string" } },
    confidence: { type: "string", enum: ["low", "medium", "high"] },
  },
};

function normalizeAction(value: unknown): CampaignStudioAction {
  const action = sanitizeText(value, 40).toLowerCase() as CampaignStudioAction;
  if (!VALID_ACTIONS.has(action)) throw new HttpError(400, "invalid_action");
  return action;
}

function normalizeGuardrails(raw: unknown) {
  const source = jsonObject(raw);
  return {
    max_budget_chf: clampNumber(source.max_budget_chf, 0, 5000, 120),
    max_daily_budget_chf: clampNumber(source.max_daily_budget_chf, 0, 1000, 30),
    max_discount_percent: clampNumber(source.max_discount_percent, 0, 70, 15),
    max_conversions: Math.round(clampNumber(source.max_conversions, 1, 10000, 30)),
    stop_cost_per_conversion_chf: clampNumber(
      source.stop_cost_per_conversion_chf,
      0,
      1000,
      15,
    ),
    manual_approval_required: source.manual_approval_required !== false,
  };
}

function safeIso(value: unknown, fallback: Date) {
  const parsed = Date.parse(String(value || ""));
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : fallback.toISOString();
}

function enumChoice(value: unknown, allowed: Set<string>, fallback: string) {
  const normalized = sanitizeText(value, 50).toLowerCase();
  return allowed.has(normalized) ? normalized : fallback;
}

function normalizePlan(
  raw: CampaignStudioPlan,
  guardrails: ReturnType<typeof normalizeGuardrails>,
  restaurant: Record<string, unknown>,
): CampaignStudioPlan {
  const source = isRecord(raw) ? raw : {};
  const rawPayload = jsonObject(source.campaign_payload);
  const rawCriteria = jsonObject(rawPayload.target_criteria);
  const rawChannels = jsonObject(rawPayload.channels);
  const rawMetrics = jsonObject(source.projected_metrics);

  const now = new Date();
  const fallbackStart = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  fallbackStart.setUTCHours(10, 0, 0, 0);
  const durationDays = Math.round(clampNumber(rawPayload.duration_days, 1, 31, 7));
  const startsAt = safeIso(rawPayload.starts_at, fallbackStart);
  const fallbackEnd = new Date(Date.parse(startsAt) + durationDays * 24 * 60 * 60 * 1000);
  const endsAt = safeIso(rawPayload.ends_at, fallbackEnd);
  const baseBudget = Math.min(
    guardrails.max_budget_chf,
    clampNumber(rawPayload.base_budget, 0, guardrails.max_budget_chf, guardrails.max_budget_chf),
  );
  const dailyBudget = Math.min(
    baseBudget,
    guardrails.max_daily_budget_chf,
    clampNumber(rawPayload.budget_daily, 0, guardrails.max_daily_budget_chf, guardrails.max_daily_budget_chf),
  );

  return {
    title: sanitizeText(source.title, 120) || "Plan Campaign Studio",
    summary: sanitizeMultilineText(source.summary, 1200),
    objective: sanitizeText(source.objective, 240),
    campaign_payload: {
      title: sanitizeText(rawPayload.title, 60) || `Campagne ${sanitizeText(restaurant.name, 40)}`,
      body: sanitizeMultilineText(rawPayload.body, 200),
      type: enumChoice(rawPayload.type, VALID_TYPES, "boost") as "boost" | "banner" | "push",
      target_pages: normalizeStringArray(rawPayload.target_pages, 4, 30)
        .filter((page) => VALID_PAGES.has(page)),
      pricing_strategy: enumChoice(
        rawPayload.pricing_strategy,
        VALID_STRATEGIES,
        "conversion",
      ) as "visibility" | "traffic" | "conversion",
      base_budget: Number(baseBudget.toFixed(2)),
      budget_daily: Number(dailyBudget.toFixed(2)),
      duration_days: durationDays,
      starts_at: startsAt,
      ends_at: endsAt,
      target_criteria: {
        cuisines: normalizeStringArray(rawCriteria.cuisines, 12, 80),
        cities: normalizeStringArray(rawCriteria.cities, 12, 80),
        minOrders: Math.round(clampNumber(rawCriteria.minOrders, 0, 100, 0)),
        maxDaysSinceOrder: Math.round(clampNumber(rawCriteria.maxDaysSinceOrder, 1, 730, 365)),
        minAvgBasket: Number(clampNumber(rawCriteria.minAvgBasket, 0, 1000, 0).toFixed(2)),
        favoritesOnly: Boolean(rawCriteria.favoritesOnly),
        customerSegment: enumChoice(
          rawCriteria.customerSegment,
          VALID_SEGMENTS,
          "all",
        ) as "all" | "new" | "returning" | "loyal" | "inactive",
        journeyTypes: normalizeStringArray(rawCriteria.journeyTypes, 4, 40)
          .filter((value) => VALID_JOURNEYS.has(value)),
        serviceMoments: normalizeStringArray(rawCriteria.serviceMoments, 3, 40)
          .filter((value) => VALID_MOMENTS.has(value)),
      },
      channels: {
        banner: Boolean(rawChannels.banner),
        restaurant_cards: Boolean(rawChannels.restaurant_cards),
      },
    },
    projected_metrics: {
      estimated_reach: Math.round(clampNumber(rawMetrics.estimated_reach, 0, 10_000_000, 0)),
      estimated_clicks: Math.round(clampNumber(rawMetrics.estimated_clicks, 0, 1_000_000, 0)),
      estimated_conversions: Math.min(
        guardrails.max_conversions,
        Math.round(clampNumber(rawMetrics.estimated_conversions, 0, 100_000, 0)),
      ),
      estimated_cost_per_conversion_chf: Number(
        clampNumber(rawMetrics.estimated_cost_per_conversion_chf, 0, 1000, 0).toFixed(2),
      ),
    },
    rationale: Array.isArray(source.rationale)
      ? source.rationale.map((entry) => sanitizeText(entry, 300)).filter(Boolean).slice(0, 10)
      : [],
    warnings: Array.isArray(source.warnings)
      ? source.warnings.map((entry) => sanitizeText(entry, 300)).filter(Boolean).slice(0, 10)
      : [],
    confidence: source.confidence === "high" || source.confidence === "medium"
      ? source.confidence
      : "low",
  };
}

async function recordUsage(
  actor: Awaited<ReturnType<typeof authenticateRequest>>,
  input: {
    status: "success" | "failure";
    action: string;
    restaurantId?: string | null;
    model: string;
    usage?: ReturnType<typeof extractUsage>;
    metadata?: Record<string, unknown>;
  },
) {
  const usage = input.usage || {};
  const inputTokens = usage.input_tokens || 0;
  const outputTokens = usage.output_tokens || 0;
  const { error } = await actor.adminClient.from("ai_usage_logs").insert({
    function_name: FUNCTION_NAME,
    action: input.action,
    feature_name: "ai_marketing_campaigns",
    source: FUNCTION_NAME,
    model: input.model,
    user_id: actor.userId,
    restaurant_id: input.restaurantId || null,
    status: input.status,
    input_tokens: inputTokens,
    output_tokens: outputTokens,
    total_tokens: usage.total_tokens || inputTokens + outputTokens,
    estimated_cost_chf: estimateOpenAITextCostChf(input.model, inputTokens, outputTokens),
    metadata: {
      credit_kind: "ai_tools",
      credit_units: getOpenAITextCreditUnits(input.model, inputTokens, outputTokens),
      ...(input.metadata || {}),
    },
  });
  assertTokCreditSpendRecorded(error);
}

Deno.serve(async (req) => {
  const cors = buildCorsHeaders(req);
  const preflight = handleCorsPreflight(req, cors);
  if (preflight) return preflight;

  const log = makeLogger(FUNCTION_NAME);
  let actor: Awaited<ReturnType<typeof authenticateRequest>> | null = null;
  let restaurantId: string | null = null;
  let action: CampaignStudioAction | "unknown" = "unknown";

  try {
    actor = await authenticateRequest(req, { allowServiceRole: false });
    if (!actor.userId) throw new HttpError(401, "Unauthorized");

    const body = await req.json().catch(() => ({}));
    action = normalizeAction(body.action);
    restaurantId = maybeUuid(body.restaurantId);
    if (!restaurantId) throw new HttpError(400, "restaurant_required");

    const restaurant = await requireRestaurantAccess(actor, restaurantId);
    const rateLimiter = createRateLimiter(actor.adminClient, FUNCTION_NAME);
    await rateLimiter.consume(`user:${actor.userId}`, { maxRequests: 20, windowSeconds: 3600 });
    await rateLimiter.consume(`restaurant:${restaurantId}`, { maxRequests: 60, windowSeconds: 3600 });
    await rateLimiter.consume("global", { maxRequests: 120, windowSeconds: 60 });

    if (action === "list") {
      const { data, error } = await actor.adminClient
        .from("campaign_studio_runs")
        .select("*")
        .eq("restaurant_id", restaurantId)
        .order("created_at", { ascending: false })
        .limit(30);
      if (error) throw new HttpError(500, error.message);
      return jsonResponse({ runs: data || [] }, 200, cors);
    }

    const runId = maybeUuid(body.runId);
    if (action === "approve") {
      if (!runId) throw new HttpError(400, "run_required");
      const { data, error } = await actor.adminClient
        .from("campaign_studio_runs")
        .update({
          status: "approved",
          approved_by: actor.userId,
          approved_at: new Date().toISOString(),
          approval_snapshot: {
            guardrails: jsonObject(body.guardrails),
            approved_from: "dashboard",
          },
          updated_at: new Date().toISOString(),
        })
        .eq("id", runId)
        .eq("restaurant_id", restaurantId)
        .in("status", ["draft", "approved"])
        .select("*")
        .maybeSingle();
      if (error) throw new HttpError(500, error.message);
      if (!data) throw new HttpError(404, "campaign_studio_run_not_found");
      await writeAuditLog({
        adminClient: actor.adminClient,
        functionName: FUNCTION_NAME,
        action,
        status: "success",
        actor,
        request: req,
        targetEntityType: "campaign_studio_runs",
        targetEntityId: runId,
        metadata: { restaurant_id: restaurantId },
      });
      return jsonResponse({ run: data }, 200, cors);
    }

    if (action === "mark_launched") {
      if (!runId) throw new HttpError(400, "run_required");
      const campaignId = maybeUuid(body.campaignId);
      if (!campaignId) throw new HttpError(400, "campaign_required");

      const { data: campaign, error: campaignError } = await actor.adminClient
        .from("ad_campaigns")
        .select("id, restaurant_id, status")
        .eq("id", campaignId)
        .eq("restaurant_id", restaurantId)
        .maybeSingle();
      if (campaignError) throw new HttpError(500, campaignError.message);
      if (!campaign) throw new HttpError(404, "campaign_not_found");

      const status = campaign.status === "active" ? "launched" : "approved";
      const { data, error } = await actor.adminClient
        .from("campaign_studio_runs")
        .update({
          campaign_id: campaignId,
          status,
          launched_at: campaign.status === "active" ? new Date().toISOString() : null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", runId)
        .eq("restaurant_id", restaurantId)
        .select("*")
        .maybeSingle();
      if (error) throw new HttpError(500, error.message);
      if (!data) throw new HttpError(404, "campaign_studio_run_not_found");

      await writeAuditLog({
        adminClient: actor.adminClient,
        functionName: FUNCTION_NAME,
        action,
        status: "success",
        actor,
        request: req,
        targetEntityType: "campaign_studio_runs",
        targetEntityId: runId,
        metadata: {
          restaurant_id: restaurantId,
          campaign_id: campaignId,
          campaign_status: campaign.status,
        },
      });
      return jsonResponse({ run: data, campaign }, 200, cors);
    }

    if (action !== "generate") throw new HttpError(400, "invalid_action");
    if (!OPENAI_API_KEY) throw new HttpError(503, "ai_service_unavailable");

    const prompt = sanitizeMultilineText(body.prompt, 4000);
    if (!prompt) throw new HttpError(400, "prompt_required");
    const guardrails = normalizeGuardrails(body.guardrails);
    const idempotencyKey = createIdempotencyKey("campaign-studio", body.idempotencyKey);

    const { data: existing, error: existingError } = await actor.adminClient
      .from("campaign_studio_runs")
      .select("*")
      .eq("restaurant_id", restaurantId)
      .eq("idempotency_key", idempotencyKey)
      .maybeSingle();
    if (existingError) throw new HttpError(500, existingError.message);
    if (existing) return jsonResponse({ run: existing, reused: true }, 200, cors);

    const since = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
    const [
      ordersResult,
      reservationsResult,
      campaignsResult,
      menuResult,
      kpisResult,
    ] = await Promise.all([
      actor.adminClient
        .from("orders")
        .select("id, status, total_amount, created_at, type, source")
        .eq("restaurant_id", restaurantId)
        .gte("created_at", since)
        .order("created_at", { ascending: false })
        .limit(500),
      actor.adminClient
        .from("reservations")
        .select("id, status, party_size, date, time, feature, acquisition_source")
        .eq("restaurant_id", restaurantId)
        .gte("created_at", since)
        .order("created_at", { ascending: false })
        .limit(500),
      actor.adminClient
        .from("ad_campaigns")
        .select("id, title, type, status, impressions, clicks, conversions, spent, total_budget, starts_at, ends_at, pricing_strategy")
        .eq("restaurant_id", restaurantId)
        .order("created_at", { ascending: false })
        .limit(25),
      actor.adminClient
        .from("menu_items")
        .select("id, name, category, price, is_available")
        .eq("restaurant_id", restaurantId)
        .limit(80),
      actor.adminClient
        .from("restaurant_daily_kpis")
        .select("*")
        .eq("restaurant_id", restaurantId)
        .order("date", { ascending: false })
        .limit(45),
    ]);

    const orders = ordersResult.data || [];
    const reservations = reservationsResult.data || [];
    const revenue = orders.reduce(
      (sum: number, order: Record<string, unknown>) => sum + Number(order.total_amount || 0),
      0,
    );
    const historicalCampaigns = campaignsResult.data || [];
    const aggregateCampaigns = historicalCampaigns.reduce(
      (acc: Record<string, number>, campaign: Record<string, unknown>) => ({
        impressions: acc.impressions + Number(campaign.impressions || 0),
        clicks: acc.clicks + Number(campaign.clicks || 0),
        conversions: acc.conversions + Number(campaign.conversions || 0),
        spent: acc.spent + Number(campaign.spent || 0),
      }),
      { impressions: 0, clicks: 0, conversions: 0, spent: 0 },
    );

    const context = {
      requested_at: new Date().toISOString(),
      timezone: "Europe/Zurich",
      prompt,
      guardrails,
      restaurant: {
        id: restaurant.id,
        name: restaurant.name,
        city: restaurant.city,
        cuisine_type: restaurant.cuisine_type,
      },
      metrics_90d: {
        order_count: orders.length,
        reservation_count: reservations.length,
        revenue_chf: Number(revenue.toFixed(2)),
        average_order_chf: orders.length ? Number((revenue / orders.length).toFixed(2)) : 0,
      },
      campaign_history: {
        totals: aggregateCampaigns,
        recent: historicalCampaigns,
      },
      menu_sample: menuResult.data || [],
      daily_kpis: kpisResult.data || [],
    };

    const maxOutputTokens = 2100;
    const requiredCredits = estimateTextAiPreflightCredits({
      model: MODEL,
      input: context,
      maxOutputTokens,
    });
    const creditPreflight = await requireRestaurantTokCreditBalance({
      adminClient: actor.adminClient,
      restaurantId,
      requiredCredits,
    });

    const response = await createOpenAIResponse({
      model: MODEL,
      input: [
        {
          role: "system",
          content: `Tu es TOK Campaign Studio, le directeur marketing IA d'une plateforme suisse de restauration.
Produis un plan exploitable par le moteur de campagne TOK, jamais une promesse.
Respecte strictement les garde-fous fournis par le restaurateur. Le budget, les plafonds de conversion et l'approbation humaine sont autoritaires.
N'invente aucune statistique historique. Les projections doivent être prudentes et explicitement estimatives.
Ne propose aucun ciblage fondé sur la santé, la religion, l'origine, la politique, la sexualité, les difficultés financières ou des données de support.
Aucune campagne n'est publiée par cette réponse : elle crée uniquement un brouillon validable.
Les dates doivent être des ISO 8601 cohérentes et le fuseau métier est Europe/Zurich.
Les textes visibles doivent être en français naturel, premium et concis.`,
        },
        { role: "user", content: JSON.stringify(context) },
      ],
      maxOutputTokens,
      jsonSchema: {
        name: "tok_campaign_studio_plan",
        description: "A safe, structured campaign plan compatible with TOK campaign-portal.",
        schema: OUTPUT_SCHEMA,
      },
      reasoning: { effort: "medium" },
    });

    const rawPlan = parseStructuredOutput<CampaignStudioPlan>(response);
    const plan = normalizePlan(rawPlan, guardrails, restaurant);
    const usage = extractUsage(response);

    const { data: run, error: runError } = await actor.adminClient
      .from("campaign_studio_runs")
      .insert({
        restaurant_id: restaurantId,
        created_by: actor.userId,
        idempotency_key: idempotencyKey,
        status: "draft",
        objective: plan.objective,
        request_prompt: prompt,
        plan,
        guardrails,
        projected_metrics: plan.projected_metrics,
      })
      .select("*")
      .single();
    if (runError) throw new HttpError(500, runError.message);

    await recordUsage(actor, {
      status: "success",
      action,
      restaurantId,
      model: MODEL,
      usage,
      metadata: {
        run_id: run.id,
        confidence: plan.confidence,
        preflight_required_credit_units: creditPreflight.requiredCredits,
        preflight_available_tok_credits: creditPreflight.availableCredits,
      },
    });

    await writeAuditLog({
      adminClient: actor.adminClient,
      functionName: FUNCTION_NAME,
      action,
      status: "success",
      actor,
      request: req,
      targetEntityType: "campaign_studio_runs",
      targetEntityId: run.id,
      metadata: {
        restaurant_id: restaurantId,
        confidence: plan.confidence,
        max_budget_chf: guardrails.max_budget_chf,
      },
    });

    return jsonResponse({ run, reused: false }, 200, cors);
  } catch (error) {
    const status = error instanceof HttpError ? error.status : 500;
    const message = safeErrorMessage(error);
    log.error("request_failed", { status, message, action, restaurantId });

    if (actor) {
      if (action === "generate") {
        await recordUsage(actor, {
          status: "failure",
          action,
          restaurantId,
          model: MODEL,
          metadata: { error: message, rid: log.rid },
        }).catch(() => {});
      }
      await writeAuditLog({
        adminClient: actor.adminClient,
        functionName: FUNCTION_NAME,
        action,
        status: "failure",
        actor,
        request: req,
        targetEntityType: restaurantId ? "restaurants" : null,
        targetEntityId: restaurantId,
        errorMessage: message,
        metadata: { rid: log.rid },
      }).catch(() => {});
    }

    return jsonResponse({ error: message, rid: log.rid }, status, cors);
  }
});
