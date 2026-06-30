import {
  HttpError,
  authenticateRequest,
  jsonResponse,
  requireRestaurantAccess,
  writeAuditLog,
} from "../_shared/auth.ts";
import {
  DEFAULT_CAMPAIGN_PRICING,
  getCampaignPricing,
  normalizeCampaignPricingStrategy,
} from "../_shared/campaign-pricing.ts";
import { buildCorsHeaders, handleCorsPreflight } from "../_shared/cors.ts";
import { makeLogger } from "../_shared/logging.ts";

const TOK_CREDITS_PER_CAMPAIGN_CHF = 15;

function text(value: unknown) {
  return String(value || "").trim();
}

function positiveNumber(value: unknown, fallback = 0) {
  const next = Number(value);
  return Number.isFinite(next) && next > 0 ? next : fallback;
}

function nonNegativeNumber(value: unknown) {
  const next = Number(value);
  return Number.isFinite(next) && next > 0 ? next : 0;
}

function sanitizeDate(value: unknown) {
  const raw = text(value);
  if (!raw) return null;
  const date = new Date(raw);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

const TARGETING_WEIGHTS = {
  gender: 1,
  serviceMoment: 3,
  journeyType: 4,
  recentActivity: 5,
  minAvgBasket: 5,
  minOrders: 5,
  customerSegment: 6,
  city: 8,
  favoriteRestaurant: 8,
  cuisine: 10,
} as const;

const VALID_GENDERS = new Set(["all", "female", "male"]);
const VALID_CUSTOMER_SEGMENTS = new Set(["all", "new", "returning", "loyal", "inactive"]);
const VALID_JOURNEY_TYPES = new Set(["delivery", "takeaway", "reservation", "zero_attente"]);
const VALID_SERVICE_MOMENTS = new Set(["lunch", "dinner", "weekend"]);

function normalizeToken(value: unknown) {
  return text(value)
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
}

function normalizeTokenArray(value: unknown, allowed?: Set<string>) {
  if (!Array.isArray(value)) return [];
  return Array.from(new Set(
    value
      .map(normalizeToken)
      .filter((token) => token && (!allowed || allowed.has(token))),
  ));
}

function normalizeTargetCriteria(value: unknown, restaurantId: string) {
  const source = value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
  const genders = normalizeTokenArray(source.genders, VALID_GENDERS);
  const normalizedGenders = genders.length > 0 ? genders : ["all"];
  const customerSegment = normalizeToken(source.customerSegment);

  return {
    cities: normalizeTokenArray(source.cities),
    cuisines: normalizeTokenArray(source.cuisines),
    minOrders: Math.max(0, Math.round(positiveNumber(source.minOrders, 0))),
    maxDaysSinceOrder: Math.max(1, Math.round(positiveNumber(source.maxDaysSinceOrder, 365))),
    minAvgBasket: Math.max(0, positiveNumber(source.minAvgBasket, 0)),
    favoritesOnly: Boolean(source.favoritesOnly),
    genders: normalizedGenders,
    customerSegment: VALID_CUSTOMER_SEGMENTS.has(customerSegment) ? customerSegment : "all",
    journeyTypes: normalizeTokenArray(source.journeyTypes, VALID_JOURNEY_TYPES),
    serviceMoments: normalizeTokenArray(source.serviceMoments, VALID_SERVICE_MOMENTS),
    restaurantId,
    targetingWeights: TARGETING_WEIGHTS,
  };
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
  const tokCredit = credits.find((credit) => String(credit.kind || "") === "tok_credits");
  if (tokCredit) {
    return nonNegativeNumber(tokCredit.balance) / TOK_CREDITS_PER_CAMPAIGN_CHF;
  }

  const campaignCredit = credits.find((credit) => String(credit.kind || "") === "campaign");
  return nonNegativeNumber(campaignCredit?.balance);
}

Deno.serve(async (req) => {
  const corsHeaders = buildCorsHeaders(req);
  const preflight = handleCorsPreflight(req, corsHeaders);
  if (preflight) return preflight;

  const log = makeLogger("create-social-post-boost");
  let actor: Awaited<ReturnType<typeof authenticateRequest>> | null = null;
  let restaurantId = "";
  let postId = "";

  try {
    if (req.method !== "POST") throw new HttpError(405, "Method not allowed");
    actor = await authenticateRequest(req, { allowServiceRole: false });
    const body = await req.json().catch(() => ({}));

    restaurantId = text(body.restaurantId);
    postId = text(body.postId);
    if (!restaurantId) throw new HttpError(400, "restaurantId requis");
    if (!postId) throw new HttpError(400, "postId requis");

    const restaurant = await requireRestaurantAccess(actor, restaurantId);
    const adminClient = actor.adminClient;

    const { data: post, error: postError } = await adminClient
      .from("social_posts")
      .select("id, restaurant_id, body, status")
      .eq("id", postId)
      .eq("restaurant_id", restaurant.id)
      .maybeSingle();

    if (postError) throw new HttpError(500, postError.message);
    if (!post) throw new HttpError(404, "Post Actualites introuvable");
    if (String(post.status) !== "published") throw new HttpError(400, "Seuls les posts publies peuvent etre sponsorises");

    const totalBudget = positiveNumber(body.totalBudget, 25);
    const durationDays = Math.max(1, Math.round(positiveNumber(body.durationDays, 7)));
    const startsAt = sanitizeDate(body.startsAt) || new Date().toISOString();
    const endDate = new Date(startsAt);
    endDate.setDate(endDate.getDate() + durationDays - 1);
    const endsAt = endDate.toISOString();
    const strategy = normalizeCampaignPricingStrategy(body.pricingStrategy, "conversion");
    const pricing = getCampaignPricing(undefined, strategy);
    const dailyBudget = Math.round((totalBudget / durationDays) * 100) / 100;
    const title = text(body.title) || "Post sponsorise Actualites";
    const campaignBody = text(body.body) || String(post.body || "").slice(0, 220);
    const targetCriteria = normalizeTargetCriteria(body.targetCriteria, restaurant.id);
    const availableCredits = await getCampaignCreditBalance(adminClient, restaurant.id);

    if (totalBudget > availableCredits) {
      throw new HttpError(
        402,
        `Credits campagnes insuffisants. Solde disponible: ${availableCredits.toFixed(2)} CHF.`,
      );
    }

    const { data: campaign, error: campaignError } = await adminClient
      .from("ad_campaigns")
      .insert({
        restaurant_id: restaurant.id,
        title,
        body: campaignBody,
        type: "boost",
        image_url: text(body.imageUrl) || null,
        target_pages: ["actualites"],
        target_criteria: targetCriteria,
        total_budget: totalBudget,
        budget_daily: dailyBudget,
        starts_at: startsAt,
        ends_at: endsAt,
        payment_method: "credits",
        payment_status: "paid",
        paid_amount: totalBudget,
        paid_at: new Date().toISOString(),
        status: "active",
        activated_at: new Date().toISOString(),
        pricing_strategy: strategy,
        cpm_rate: pricing.cpmRate || DEFAULT_CAMPAIGN_PRICING.cpmRate,
        cpc_rate: pricing.cpcRate || DEFAULT_CAMPAIGN_PRICING.cpcRate,
        conversion_rate: pricing.conversionRate || DEFAULT_CAMPAIGN_PRICING.conversionRate,
      })
      .select("*")
      .single();

    if (campaignError) throw new HttpError(500, campaignError.message);

    const { error: promotionError } = await adminClient
      .from("social_post_promotions")
      .insert({
        post_id: post.id,
        campaign_id: campaign.id,
        restaurant_id: restaurant.id,
        status: "active",
        starts_at: startsAt,
        ends_at: endsAt,
        budget_amount: totalBudget,
        currency: "CHF",
        placement: "actualites_feed",
        boost_weight: 1,
        targeting: targetCriteria,
        created_by: actor.userId || null,
      });

    if (promotionError) throw new HttpError(500, promotionError.message);

    await writeAuditLog({
      adminClient,
      actor,
      request: req,
      functionName: "create-social-post-boost",
      action: "create_social_post_boost",
      status: "success",
      targetEntityType: "social_posts",
      targetEntityId: post.id,
      metadata: {
        restaurant_id: restaurant.id,
        campaign_id: campaign.id,
        payment_method: "credits",
        total_budget: totalBudget,
      },
    });

    return jsonResponse({ campaign }, 200, corsHeaders);
  } catch (error) {
    log.error("create-social-post-boost error", { message: error instanceof Error ? error.message : "unknown" });
    const adminClient = actor?.adminClient;
    if (adminClient) {
      await writeAuditLog({
        adminClient,
        actor,
        request: req,
        functionName: "create-social-post-boost",
        action: "create_social_post_boost",
        status: "failure",
        targetEntityType: postId ? "social_posts" : (restaurantId ? "restaurants" : null),
        targetEntityId: postId || restaurantId || null,
        errorMessage: error instanceof Error ? error.message : "Erreur interne",
      });
    }
    if (error instanceof HttpError) return jsonResponse({ error: error.message }, error.status, corsHeaders);
    return jsonResponse({ error: error instanceof Error ? error.message : "Erreur interne" }, 500, corsHeaders);
  }
});
