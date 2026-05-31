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

function text(value: unknown) {
  return String(value || "").trim();
}

function positiveNumber(value: unknown, fallback = 0) {
  const next = Number(value);
  return Number.isFinite(next) && next > 0 ? next : fallback;
}

function sanitizeDate(value: unknown) {
  const raw = text(value);
  if (!raw) return null;
  const date = new Date(raw);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
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

    const { data: campaign, error: campaignError } = await adminClient
      .from("ad_campaigns")
      .insert({
        restaurant_id: restaurant.id,
        title,
        body: campaignBody,
        type: "boost",
        image_url: text(body.imageUrl) || null,
        target_pages: ["actualites"],
        target_criteria: body.targetCriteria && typeof body.targetCriteria === "object" ? body.targetCriteria : {},
        total_budget: totalBudget,
        budget_daily: dailyBudget,
        starts_at: startsAt,
        ends_at: endsAt,
        payment_method: "card",
        payment_status: "unpaid",
        status: "draft",
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
        status: "pending_payment",
        starts_at: startsAt,
        ends_at: endsAt,
        budget_amount: totalBudget,
        currency: "CHF",
        placement: "actualites_feed",
        boost_weight: 1,
        targeting: body.targetCriteria && typeof body.targetCriteria === "object" ? body.targetCriteria : {},
        created_by: actor.user?.id || null,
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
      metadata: { restaurant_id: restaurant.id, campaign_id: campaign.id },
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
