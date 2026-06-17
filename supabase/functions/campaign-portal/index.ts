import {
  HttpError,
  authenticateRequest,
  createAdminClient,
  jsonResponse,
  requireRestaurantAccess,
  writeAuditLog,
} from "../_shared/auth.ts";
import {
  DEFAULT_CAMPAIGN_PRICING,
  calculateCampaignTotalCost,
  getCampaignPricing,
  normalizeCampaignPlacementSelection,
  normalizeCampaignPricingStrategy,
} from "../_shared/campaign-pricing.ts";
import { buildCorsHeaders, handleCorsPreflight } from "../_shared/cors.ts";
import { makeLogger } from "../_shared/logging.ts";

const VALID_CAMPAIGN_TYPES = new Set(["boost", "banner", "push"]);
const VALID_TARGET_PAGES = new Set(["home", "search", "flash_sales", "anti_waste"]);
const VALID_PAYMENT_METHODS = new Set(["card", "twint", "postfinance_card", "postfinance_efinance", "cash", "credits"]);
const VALID_EDITABLE_STATUSES = new Set(["draft", "paused", "active", "ended", "pending_payment"]);
const VALID_CUSTOMER_SEGMENTS = new Set(["all", "new", "returning", "loyal", "inactive"]);
const VALID_JOURNEY_TYPES = new Set(["delivery", "takeaway", "reservation", "zero_attente"]);
const VALID_SERVICE_MOMENTS = new Set(["lunch", "dinner", "weekend"]);
const VALID_CREATIVE_TEMPLATES = new Set(["tok_spotlight"]);
const VALID_BANNER_TEXT_PLACEMENTS = new Set(["left", "right", "top", "bottom"]);
const VALID_BANNER_SEPARATORS = new Set(["fade", "wave", "curve", "straight"]);
const VALID_CREATIVE_TEXT_ELEMENTS = ["badge", "discount", "restaurant", "headline", "body", "cta"] as const;

const DEFAULT_CREATIVE_TEXT = {
  badge: { x: 0, y: 0, scale: 100, rotation: 0, color: "#ffffff", font: "sans", style: "bold" },
  discount: { x: 0, y: 0, scale: 100, rotation: 0, color: "#ffffff", font: "sans", style: "bold" },
  restaurant: { x: 0, y: 0, scale: 100, rotation: 0, color: "#111827", font: "display", style: "bold" },
  headline: { x: 0, y: 0, scale: 100, rotation: 0, color: "#111827", font: "sans", style: "bold" },
  body: { x: 0, y: 0, scale: 100, rotation: 0, color: "#334155", font: "sans", style: "normal" },
  cta: { x: 0, y: 0, scale: 100, rotation: 0, color: "#ffffff", font: "sans", style: "bold" },
};

type CampaignPortalAction = "list" | "save" | "update_status" | "delete" | "estimate_audience";

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function normalizeText(value: unknown) {
  return String(value || "").trim();
}

function normalizeLower(value: unknown) {
  return normalizeText(value).toLowerCase();
}

function clampNonNegativeNumber(value: unknown) {
  return Math.max(0, Number(value) || 0);
}

function clampPositiveRate(value: unknown) {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : 0;
}

function sanitizeStringArray(values: unknown, allowed?: Set<string>) {
  if (!Array.isArray(values)) return [];

  return Array.from(new Set(values
    .map((value) => normalizeLower(value))
    .filter((value) => value.length > 0)
    .filter((value) => !allowed || allowed.has(value))));
}

function sanitizeChoice(value: unknown, allowed: Set<string>, fallback: string) {
  const normalized = normalizeLower(value);
  return allowed.has(normalized) ? normalized : fallback;
}

function clampNumber(value: unknown, min: number, max: number, fallback: number) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.min(max, Math.max(min, numeric));
}

function sanitizeHexColor(value: unknown, fallback: string) {
  const normalized = normalizeText(value);
  return /^#[0-9a-fA-F]{6}$/.test(normalized) ? normalized.toLowerCase() : fallback;
}

function sanitizeCreativeTextStyle(raw: unknown, fallback: typeof DEFAULT_CREATIVE_TEXT.badge) {
  const source = isRecord(raw) ? raw : {};
  const font = sanitizeChoice(source.font, new Set(["display", "sans", "serif"]), fallback.font);
  const style = sanitizeChoice(source.style, new Set(["normal", "bold", "italic"]), fallback.style);

  return {
    x: clampNumber(source.x, -120, 120, fallback.x),
    y: clampNumber(source.y, -120, 120, fallback.y),
    scale: clampNumber(source.scale, 70, 150, fallback.scale),
    rotation: clampNumber(source.rotation, -35, 35, fallback.rotation),
    color: sanitizeHexColor(source.color, fallback.color),
    font,
    style,
  };
}

function sanitizeCreativeText(raw: unknown) {
  const source = isRecord(raw) ? raw : {};

  return VALID_CREATIVE_TEXT_ELEMENTS.reduce((acc, key) => {
    acc[key] = sanitizeCreativeTextStyle(source[key], DEFAULT_CREATIVE_TEXT[key]);
    return acc;
  }, {} as Record<typeof VALID_CREATIVE_TEXT_ELEMENTS[number], ReturnType<typeof sanitizeCreativeTextStyle>>);
}

function sanitizeCampaignCreative(raw: unknown, existingRaw?: unknown) {
  const existing = isRecord(existingRaw) ? existingRaw : {};
  const source = isRecord(raw) ? { ...existing, ...raw } : existing;

  return {
    template: sanitizeChoice(source.template, VALID_CREATIVE_TEMPLATES, "tok_spotlight"),
    bannerTextPlacement: sanitizeChoice(source.bannerTextPlacement, VALID_BANNER_TEXT_PLACEMENTS, "left"),
    bannerSeparator: sanitizeChoice(source.bannerSeparator, VALID_BANNER_SEPARATORS, "fade"),
    text: sanitizeCreativeText(source.text),
  };
}

function sanitizeAudienceCriteria(raw: unknown) {
  const source = isRecord(raw) ? raw : {};

  const customerSegment = normalizeLower(source.customerSegment);

  return {
    cuisines: sanitizeStringArray(source.cuisines),
    cities: sanitizeStringArray(source.cities),
    minOrders: Math.max(0, Math.trunc(Number(source.minOrders) || 0)),
    maxDaysSinceOrder: Math.max(1, Math.trunc(Number(source.maxDaysSinceOrder) || 365)),
    minAvgBasket: clampNonNegativeNumber(source.minAvgBasket),
    favoritesOnly: Boolean(source.favoritesOnly),
    customerSegment: VALID_CUSTOMER_SEGMENTS.has(customerSegment) ? customerSegment : "all",
    journeyTypes: sanitizeStringArray(source.journeyTypes, VALID_JOURNEY_TYPES),
    serviceMoments: sanitizeStringArray(source.serviceMoments, VALID_SERVICE_MOMENTS),
  };
}

function sanitizeCampaignChannels(raw: unknown, type: string, existingChannels: unknown) {
  const source = isRecord(raw) ? raw : {};
  const existing = isRecord(existingChannels) ? existingChannels : {};
  const placements = normalizeCampaignPlacementSelection(source, type);
  const creative = sanitizeCampaignCreative(source.creative, existing.creative);

  return {
    ...existing,
    ...source,
    creative,
    banner: placements.banner,
    restaurant_cards: placements.restaurant_cards,
  };
}

function sanitizeCampaignPayload(raw: unknown, existingCampaign?: Record<string, unknown> | null) {
  const source = raw && typeof raw === "object" && !Array.isArray(raw)
    ? raw as Record<string, unknown>
    : {};

  const title = normalizeText(source.title);
  const type = normalizeLower(source.type);
  const body = normalizeText(source.body) || null;
  const imageUrl = normalizeText(source.image_url) || null;
  const paymentMethod = normalizeLower(source.payment_method);
  const startsAt = normalizeText(source.starts_at) || null;
  const endsAt = normalizeText(source.ends_at) || null;
  const requestedStatus = normalizeLower(source.status);
  const existingPaymentStatus = normalizeLower(existingCampaign?.payment_status);
  const existingStatus = normalizeLower(existingCampaign?.status);
  const isAlreadyPaid = existingPaymentStatus === "paid";

  if (!title) {
    throw new HttpError(400, "Titre de campagne requis");
  }

  if (!VALID_CAMPAIGN_TYPES.has(type)) {
    throw new HttpError(400, "Type de campagne invalide");
  }

  const channels = sanitizeCampaignChannels(source.channels, type, existingCampaign?.channels);
  const hasBaseBudget = Object.prototype.hasOwnProperty.call(source, "base_budget");
  const baseBudget = hasBaseBudget ? clampNonNegativeNumber(source.base_budget) : clampNonNegativeNumber(source.total_budget);
  const totalBudget = hasBaseBudget
    ? calculateCampaignTotalCost(baseBudget, channels, type)
    : clampNonNegativeNumber(source.total_budget);
  const hasBaseDailyBudget = Object.prototype.hasOwnProperty.call(source, "budget_daily_base");
  const budgetDaily = hasBaseDailyBudget
    ? calculateCampaignTotalCost(source.budget_daily_base, channels, type)
    : clampNonNegativeNumber(source.budget_daily);

  let sanitizedPaymentMethod: string | null = null;
  if (paymentMethod) {
    if (!VALID_PAYMENT_METHODS.has(paymentMethod)) {
      throw new HttpError(400, "Methode de paiement invalide");
    }
    sanitizedPaymentMethod = paymentMethod;
  } else if (typeof existingCampaign?.payment_method === "string") {
    sanitizedPaymentMethod = String(existingCampaign.payment_method);
  }

  let paymentStatus = isAlreadyPaid ? "paid" : "unpaid";
  let status = "draft";

  if (isAlreadyPaid) {
    status = VALID_EDITABLE_STATUSES.has(requestedStatus)
      ? requestedStatus
      : (VALID_EDITABLE_STATUSES.has(existingStatus) ? existingStatus : "draft");
  } else if (totalBudget > 0 && sanitizedPaymentMethod === "cash") {
    paymentStatus = "pending";
    status = "pending_payment";
  } else if (totalBudget > 0 && sanitizedPaymentMethod === "credits") {
    paymentStatus = "paid";
    status = requestedStatus === "active" ? "active" : "draft";
  } else if (totalBudget <= 0) {
    paymentStatus = "unpaid";
    status = requestedStatus === "active" ? "active" : "draft";
  } else {
    paymentStatus = "unpaid";
    status = "draft";
  }

  if (totalBudget > 0 && paymentStatus !== "paid" && status === "active") {
    status = "draft";
  }

  const pricingStrategy = normalizeCampaignPricingStrategy(
    source.pricing_strategy ?? existingCampaign?.pricing_strategy,
    "conversion",
  );
  const existingPricingStrategy = normalizeCampaignPricingStrategy(existingCampaign?.pricing_strategy, "conversion");
  const resetPricingFromStrategy = !existingCampaign || pricingStrategy !== existingPricingStrategy;
  const pricing = getCampaignPricing({
    cpmRate: resetPricingFromStrategy ? 0 : clampPositiveRate(existingCampaign?.cpm_rate),
    cpcRate: resetPricingFromStrategy ? 0 : clampPositiveRate(existingCampaign?.cpc_rate),
    conversionRate: resetPricingFromStrategy ? 0 : clampPositiveRate(existingCampaign?.conversion_rate),
  }, pricingStrategy);

  return {
    title,
    body,
    type,
    image_url: imageUrl,
    channels,
    target_pages: sanitizeStringArray(source.target_pages, VALID_TARGET_PAGES),
    target_criteria: sanitizeAudienceCriteria(source.target_criteria),
    total_budget: totalBudget,
    budget_daily: budgetDaily,
    starts_at: startsAt,
    ends_at: endsAt,
    payment_method: sanitizedPaymentMethod,
    payment_status: paymentStatus,
    status,
    pricing_strategy: pricingStrategy,
    cpm_rate: pricing.cpmRate || DEFAULT_CAMPAIGN_PRICING.cpmRate,
    cpc_rate: pricing.cpcRate || DEFAULT_CAMPAIGN_PRICING.cpcRate,
    conversion_rate: pricing.conversionRate || DEFAULT_CAMPAIGN_PRICING.conversionRate,
  };
}

function getRpcUnavailableReason(error: { code?: string | null; message?: string | null; details?: string | null; hint?: string | null }) {
  const text = [
    error?.code,
    error?.message,
    error?.details,
    error?.hint,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  if (!text) return "unknown_error";
  if (text.includes("split_part") || text.includes("time without time zone")) return "legacy_time_sql";
  if (text.includes("schema cache") || text.includes("could not find the function")) return "rpc_unavailable";
  if (text.includes("forbidden")) return "forbidden";
  return "rpc_error";
}

function getCreditCommittedAmount(campaign?: Record<string, unknown> | null) {
  if (!campaign) return 0;
  const paymentMethod = normalizeLower(campaign.payment_method);
  const paymentStatus = normalizeLower(campaign.payment_status);
  if (paymentMethod !== "credits" || paymentStatus !== "paid") return 0;
  return Math.max(
    clampNonNegativeNumber(campaign.total_budget),
    clampNonNegativeNumber(campaign.spent),
  );
}

async function getCampaignCreditBalance(
  adminClient: Awaited<ReturnType<typeof authenticateRequest>>["adminClient"],
  restaurantId: string,
) {
  const { data, error } = await adminClient.rpc("get_restaurant_credit_usage", {
    p_restaurant_id: restaurantId,
  });

  if (error) {
    throw new HttpError(500, error.message);
  }

  const usage = data && typeof data === "object" && !Array.isArray(data)
    ? data as Record<string, unknown>
    : {};
  const credits = Array.isArray(usage.credits) ? usage.credits as Array<Record<string, unknown>> : [];
  const campaignCredit = credits.find((credit) => String(credit.kind || "") === "campaign");

  return clampNonNegativeNumber(campaignCredit?.balance);
}

Deno.serve(async (req) => {
  const corsHeaders = buildCorsHeaders(req);
  const preflight = handleCorsPreflight(req, corsHeaders);
  if (preflight) return preflight;

  const log = makeLogger("campaign-portal");

  let actor: Awaited<ReturnType<typeof authenticateRequest>> | null = null;
  let restaurantId = "";
  let action: CampaignPortalAction | "" = "";
  let campaignId = "";

  try {
    actor = await authenticateRequest(req, { allowServiceRole: false });

    const body = await req.json().catch(() => ({}));
    action = normalizeLower(body?.action) as CampaignPortalAction;
    restaurantId = normalizeText(body?.restaurantId);
    campaignId = normalizeText(body?.campaignId);

    if (!restaurantId) {
      throw new HttpError(400, "restaurantId requis");
    }
    if (!["list", "save", "update_status", "delete", "estimate_audience"].includes(action)) {
      throw new HttpError(400, "Action invalide");
    }

    const restaurant = await requireRestaurantAccess(actor, restaurantId);
    const adminClient = actor.adminClient;

    if (action === "list") {
      const { data, error } = await adminClient
        .from("ad_campaigns")
        .select("*")
        .eq("restaurant_id", restaurant.id)
        .order("created_at", { ascending: false });

      if (error) throw new HttpError(500, error.message);
      return jsonResponse({ campaigns: data || [] }, 200, corsHeaders);
    }

    if (action === "estimate_audience") {
      if (!actor.userClient) {
        throw new HttpError(401, "Unauthorized");
      }

      const criteria = sanitizeAudienceCriteria(body?.criteria);
      const { data, error } = await actor.userClient.rpc("estimate_campaign_audience", {
        p_restaurant_id: restaurant.id,
        p_criteria: criteria,
      });

      if (error) {
        log.warn("campaign-portal estimate_audience fallback", { message: error instanceof Error ? error.message : "unknown" });
        return jsonResponse({
          estimate: 0,
          unavailable: true,
          reason: getRpcUnavailableReason(error),
        }, 200, corsHeaders);
      }

      return jsonResponse({
        estimate: Math.max(Number(data) || 0, 0),
        unavailable: false,
        reason: null,
      }, 200, corsHeaders);
    }

    if (!campaignId && action !== "save") {
      throw new HttpError(400, "campaignId requis");
    }

    if (action === "save") {
      let existingCampaign: Record<string, unknown> | null = null;

      if (campaignId) {
        const { data, error } = await adminClient
          .from("ad_campaigns")
          .select("*")
          .eq("id", campaignId)
          .eq("restaurant_id", restaurant.id)
          .maybeSingle();

        if (error) throw new HttpError(500, error.message);
        if (!data) throw new HttpError(404, "Campagne introuvable");
        existingCampaign = data as Record<string, unknown>;
      }

      const payload = sanitizeCampaignPayload(body?.payload, existingCampaign);
      const creditsBudget = payload.payment_method === "credits" && payload.total_budget > 0
        ? payload.total_budget
        : 0;

      if (creditsBudget > 0) {
        const availableCredits = await getCampaignCreditBalance(adminClient, restaurant.id);
        const reusableCommitment = getCreditCommittedAmount(existingCampaign);
        const effectiveAvailable = availableCredits + reusableCommitment;

        if (creditsBudget > effectiveAvailable) {
          throw new HttpError(
            402,
            `Credits campagnes insuffisants. Solde disponible: ${effectiveAvailable.toFixed(2)} CHF.`,
          );
        }

        Object.assign(payload, {
          payment_status: "paid",
          paid_amount: creditsBudget,
          paid_at: existingCampaign?.paid_at || new Date().toISOString(),
        });

        if (payload.status === "active") {
          Object.assign(payload, {
            activated_at: existingCampaign?.activated_at || new Date().toISOString(),
          });
        }
      }
      let savedCampaign: unknown = null;

      if (campaignId) {
        const { data, error } = await adminClient
          .from("ad_campaigns")
          .update(payload)
          .eq("id", campaignId)
          .eq("restaurant_id", restaurant.id)
          .select("*")
          .single();

        if (error) throw new HttpError(500, error.message);
        savedCampaign = data;
      } else {
        const { data, error } = await adminClient
          .from("ad_campaigns")
          .insert({ ...payload, restaurant_id: restaurant.id })
          .select("*")
          .single();

        if (error) throw new HttpError(500, error.message);
        savedCampaign = data;
      }

      await writeAuditLog({
        adminClient,
        actor,
        request: req,
        functionName: "campaign-portal",
        action: campaignId ? "update_campaign" : "create_campaign",
        status: "success",
        targetEntityType: "ad_campaigns",
        targetEntityId: String((savedCampaign as { id?: unknown } | null)?.id || campaignId || ""),
        metadata: {
          restaurant_id: restaurant.id,
          type: payload.type,
          payment_status: payload.payment_status,
          payment_method: payload.payment_method,
          status: payload.status,
        },
      });

      return jsonResponse({ campaign: savedCampaign }, 200, corsHeaders);
    }

    if (action === "update_status") {
      const nextStatus = normalizeLower(body?.status);
      if (!VALID_EDITABLE_STATUSES.has(nextStatus)) {
        throw new HttpError(400, "Statut de campagne invalide");
      }

      const { data: existingCampaign, error: campaignError } = await adminClient
        .from("ad_campaigns")
        .select("id, restaurant_id, status, payment_status, total_budget")
        .eq("id", campaignId)
        .eq("restaurant_id", restaurant.id)
        .maybeSingle();

      if (campaignError) throw new HttpError(500, campaignError.message);
      if (!existingCampaign) throw new HttpError(404, "Campagne introuvable");

      if (
        nextStatus === "active" &&
        Number(existingCampaign.total_budget || 0) > 0 &&
        String(existingCampaign.payment_status || "unpaid") !== "paid"
      ) {
        throw new HttpError(400, "Une campagne payante ne peut etre activee sans paiement verifie.");
      }

      const { data, error } = await adminClient
        .from("ad_campaigns")
        .update({ status: nextStatus })
        .eq("id", campaignId)
        .eq("restaurant_id", restaurant.id)
        .select("*")
        .single();

      if (error) throw new HttpError(500, error.message);

      await writeAuditLog({
        adminClient,
        actor,
        request: req,
        functionName: "campaign-portal",
        action: "update_campaign_status",
        status: "success",
        targetEntityType: "ad_campaigns",
        targetEntityId: campaignId,
        metadata: {
          restaurant_id: restaurant.id,
          previous_status: existingCampaign.status,
          next_status: nextStatus,
        },
      });

      return jsonResponse({ campaign: data }, 200, corsHeaders);
    }

    if (action === "delete") {
      const { error } = await adminClient
        .from("ad_campaigns")
        .delete()
        .eq("id", campaignId)
        .eq("restaurant_id", restaurant.id);

      if (error) throw new HttpError(500, error.message);

      await writeAuditLog({
        adminClient,
        actor,
        request: req,
        functionName: "campaign-portal",
        action: "delete_campaign",
        status: "success",
        targetEntityType: "ad_campaigns",
        targetEntityId: campaignId,
        metadata: {
          restaurant_id: restaurant.id,
        },
      });

      return jsonResponse({ deleted: true }, 200, corsHeaders);
    }

    throw new HttpError(400, "Action non prise en charge");
  } catch (error) {
    log.error("campaign-portal error", { message: error instanceof Error ? error.message : "unknown" });
    await writeAuditLog({
      adminClient: actor?.adminClient || createAdminClient(),
      actor,
      request: req,
      functionName: "campaign-portal",
      action: action || "unknown",
      status: "failure",
      targetEntityType: campaignId ? "ad_campaigns" : (restaurantId ? "restaurants" : null),
      targetEntityId: campaignId || restaurantId || null,
      errorMessage: error instanceof Error ? error.message : "Erreur interne",
    });

    if (error instanceof HttpError) {
      return jsonResponse({ error: error.message }, error.status, corsHeaders);
    }

    return jsonResponse({ error: error instanceof Error ? error.message : "Erreur interne" }, 500, corsHeaders);
  }
});
