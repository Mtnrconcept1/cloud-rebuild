import {
  HttpError,
  authenticateRequest,
  assertProductionFlowAllowed,
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
const VALID_CTA_TYPES = new Set(["reserve", "order", "menu", "offer"]);
const VALID_GENDERS = new Set(["all", "female", "male"]);
const VALID_CUSTOMER_SEGMENTS = new Set(["all", "new", "returning", "loyal", "inactive"]);
const VALID_JOURNEY_TYPES = new Set(["delivery", "takeaway", "reservation", "zero_attente"]);
const VALID_SERVICE_MOMENTS = new Set(["lunch", "dinner", "weekend"]);
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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

type TargetCriteria = ReturnType<typeof normalizeTargetCriteria>;

type StorageImage = {
  url: string;
  bucket: "images" | "social-post-media";
  path: string;
};

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
      .flatMap((entry) => text(entry).split(/[,;]/g))
      .map(normalizeToken)
      .filter((token) => token && !/\+\d+$/.test(token) && (!allowed || allowed.has(token))),
  ));
}

function normalizeFiniteSelection(values: string[], allowed: Set<string>) {
  const allowedValues = Array.from(allowed);
  if (allowedValues.length > 0 && allowedValues.every((value) => values.includes(value))) {
    return [];
  }
  return values;
}

function normalizeTargetCriteria(value: unknown, restaurantId: string) {
  const source = value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
  const genders = normalizeTokenArray(source.genders, VALID_GENDERS);
  const normalizedGenders = genders.length > 0 ? genders : ["all"];
  const customerSegment = normalizeToken(source.customerSegment);
  const journeys = normalizeFiniteSelection(
    normalizeTokenArray(source.journeyTypes, VALID_JOURNEY_TYPES),
    VALID_JOURNEY_TYPES,
  );
  const moments = normalizeFiniteSelection(
    normalizeTokenArray(source.serviceMoments, VALID_SERVICE_MOMENTS),
    VALID_SERVICE_MOMENTS,
  );

  return {
    cities: normalizeTokenArray(source.cities),
    cuisines: normalizeTokenArray(source.cuisines),
    minOrders: Math.max(0, Math.round(positiveNumber(source.minOrders, 0))),
    maxDaysSinceOrder: Math.max(1, Math.round(positiveNumber(source.maxDaysSinceOrder, 365))),
    minAvgBasket: Math.max(0, positiveNumber(source.minAvgBasket, 0)),
    favoritesOnly: Boolean(source.favoritesOnly),
    genders: normalizedGenders,
    customerSegment: VALID_CUSTOMER_SEGMENTS.has(customerSegment) ? customerSegment : "all",
    journeyTypes: journeys,
    serviceMoments: moments,
    restaurantId,
    targetingWeights: TARGETING_WEIGHTS,
  };
}

function uuidOrNull(value: unknown) {
  const candidate = text(value);
  return UUID_PATTERN.test(candidate) ? candidate : null;
}

function inferCtaType(
  requestedCta: unknown,
  post: Record<string, unknown>,
  restaurant: Record<string, unknown>,
) {
  const requested = normalizeToken(requestedCta);
  if (VALID_CTA_TYPES.has(requested)) return requested;

  const existing = normalizeToken(post.cta_type);
  if (VALID_CTA_TYPES.has(existing)) return existing;

  const content = normalizeToken([
    post.body,
    post.post_type,
    post.campaign_goal,
  ].map(text).join(" "));
  const supportsReservation = restaurant.supports_reservation !== false;

  if (
    supportsReservation
    && /(reserv|table|places|service du soir|ce soir)/.test(content)
  ) {
    return "reserve";
  }

  if (/(command|livraison|emporter|retrait|menu|plat|burger|pizza|sushi)/.test(content)) {
    return "order";
  }

  return "menu";
}

function parseProjectStorageImage(value: unknown): StorageImage | null {
  const raw = text(value);
  const projectUrl = text(Deno.env.get("SUPABASE_URL"));
  if (!raw || !projectUrl) return null;

  try {
    const candidate = new URL(raw);
    const project = new URL(projectUrl);
    if (candidate.origin !== project.origin) return null;

    const match = candidate.pathname.match(
      /^\/storage\/v1\/object\/public\/(images|social-post-media)\/(.+)$/,
    );
    if (!match) return null;

    const bucket = match[1] as StorageImage["bucket"];
    const path = decodeURIComponent(match[2] || "").replace(/^\/+/, "");
    if (!path || path.includes("..")) return null;

    return { url: candidate.toString(), bucket, path };
  } catch {
    return null;
  }
}

function isAllowedStorageImage({
  image,
  existingMediaUrl,
  restaurantImageUrl,
  restaurantId,
  postId,
  actorUserId,
}: {
  image: StorageImage;
  existingMediaUrl: string;
  restaurantImageUrl: string;
  restaurantId: string;
  postId: string;
  actorUserId: string;
}) {
  if (image.url === existingMediaUrl || image.url === restaurantImageUrl) return true;

  if (image.bucket === "social-post-media") {
    return image.path.startsWith(`${restaurantId}/${postId}/`);
  }

  return Boolean(
    (actorUserId && image.path.startsWith(`${actorUserId}/`))
      || image.path.startsWith(`${restaurantId}/`)
      || image.path.startsWith(`ai-gallery/${restaurantId}/`),
  );
}

async function estimateAudience(
  adminClient: Awaited<ReturnType<typeof authenticateRequest>>["adminClient"],
  restaurantId: string,
  criteria: TargetCriteria,
) {
  const { data, error } = await adminClient.rpc("estimate_campaign_audience", {
    p_restaurant_id: restaurantId,
    p_criteria: criteria,
  });

  if (error) {
    throw new HttpError(503, `Estimation d'audience indisponible: ${error.message}`);
  }

  return Math.max(0, Number(data) || 0);
}

async function ensureReachableAudience(
  adminClient: Awaited<ReturnType<typeof authenticateRequest>>["adminClient"],
  restaurantId: string,
  initialCriteria: TargetCriteria,
) {
  const initialAudience = await estimateAudience(adminClient, restaurantId, initialCriteria);
  if (initialAudience > 0) {
    return {
      criteria: initialCriteria,
      estimatedAudience: initialAudience,
      adjusted: false,
      adjustment: null,
    };
  }

  const localBroadCriteria: TargetCriteria = {
    ...initialCriteria,
    cuisines: [],
    minOrders: 0,
    minAvgBasket: 0,
    favoritesOnly: false,
    customerSegment: "all",
    journeyTypes: [],
    serviceMoments: [],
    maxDaysSinceOrder: 365,
  };
  const localAudience = await estimateAudience(adminClient, restaurantId, localBroadCriteria);
  if (localAudience > 0) {
    return {
      criteria: localBroadCriteria,
      estimatedAudience: localAudience,
      adjusted: true,
      adjustment: "local_broadening",
    };
  }

  const broadCriteria: TargetCriteria = {
    ...localBroadCriteria,
    cities: [],
  };
  const broadAudience = await estimateAudience(adminClient, restaurantId, broadCriteria);
  if (broadAudience > 0) {
    return {
      criteria: broadCriteria,
      estimatedAudience: broadAudience,
      adjusted: true,
      adjustment: "global_broadening",
    };
  }

  throw new HttpError(
    409,
    "Aucun client éligible n'est disponible pour cette campagne. La mise en avant n'a pas été facturée.",
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
    await assertProductionFlowAllowed(actor, "boost publicitaire réel");
    const body = await req.json().catch(() => ({}));

    restaurantId = text(body.restaurantId);
    postId = text(body.postId);
    if (!restaurantId) throw new HttpError(400, "restaurantId requis");
    if (!postId) throw new HttpError(400, "postId requis");

    const restaurant = await requireRestaurantAccess(actor, restaurantId);
    const adminClient = actor.adminClient;

    const [{ data: post, error: postError }, { data: mediaRows, error: mediaError }] = await Promise.all([
      adminClient
        .from("social_posts")
        .select("id, restaurant_id, body, status, visibility, scheduled_at, published_at, post_type, campaign_goal, cta_type, cta_target_id")
        .eq("id", postId)
        .eq("restaurant_id", restaurant.id)
        .maybeSingle(),
      adminClient
        .from("social_post_media")
        .select("media_url, media_path, media_type, sort_order")
        .eq("post_id", postId)
        .eq("media_type", "image")
        .order("sort_order", { ascending: true })
        .limit(1),
    ]);

    if (postError) throw new HttpError(500, postError.message);
    if (mediaError) throw new HttpError(500, mediaError.message);
    if (!post) throw new HttpError(404, "Post Actualités introuvable");
    if (String(post.status) !== "published" || String(post.visibility || "public") !== "public") {
      throw new HttpError(400, "Seuls les posts publics et publiés peuvent être sponsorisés");
    }

    const totalBudget = positiveNumber(body.totalBudget, 25);
    const durationDays = Math.max(1, Math.round(positiveNumber(body.durationDays, 7)));
    const startsAt = sanitizeDate(body.startsAt) || new Date().toISOString();
    const endDate = new Date(startsAt);
    endDate.setDate(endDate.getDate() + durationDays - 1);
    const endsAt = endDate.toISOString();
    const strategy = normalizeCampaignPricingStrategy(body.pricingStrategy, "conversion");
    const pricing = getCampaignPricing(undefined, strategy);
    const dailyBudget = Math.round((totalBudget / durationDays) * 100) / 100;
    const title = text(body.title) || "Post sponsorisé Actualités";
    const campaignBody = text(body.body) || String(post.body || "").slice(0, 220);
    const availableCredits = await getCampaignCreditBalance(adminClient, restaurant.id);

    if (totalBudget > availableCredits) {
      throw new HttpError(
        402,
        `Crédits campagnes insuffisants. Solde disponible: ${availableCredits.toFixed(2)} CHF.`,
      );
    }

    const existingMedia = Array.isArray(mediaRows) ? mediaRows[0] : null;
    const existingMediaUrl = text(existingMedia?.media_url);
    const restaurantImageUrl = text((restaurant as Record<string, unknown>).image_url);
    const candidateImageUrl = existingMediaUrl || text(body.imageUrl) || restaurantImageUrl;
    const image = parseProjectStorageImage(candidateImageUrl);

    if (!image || !isAllowedStorageImage({
      image,
      existingMediaUrl,
      restaurantImageUrl,
      restaurantId: restaurant.id,
      postId: post.id,
      actorUserId: text(actor.userId),
    })) {
      throw new HttpError(
        400,
        "Une image TOK vérifiée est requise pour sponsoriser ce post. Ajoutez un visuel au post ou au restaurant.",
      );
    }

    const initialCriteria = normalizeTargetCriteria(body.targetCriteria, restaurant.id);
    const audience = await ensureReachableAudience(adminClient, restaurant.id, initialCriteria);
    const ctaType = inferCtaType(body.ctaType, post as Record<string, unknown>, restaurant as Record<string, unknown>);
    const requestedTargetId = uuidOrNull(body.ctaTargetId);
    const existingTargetId = uuidOrNull(post.cta_target_id);
    const ctaTargetId = requestedTargetId || existingTargetId || restaurant.id;
    const mediaAltText = text(body.imageAltText)
      || `Publication sponsorisée de ${text((restaurant as Record<string, unknown>).name) || "ce restaurant"}`;

    const { data: boostResult, error: boostError } = await adminClient.rpc(
      "create_social_post_boost_atomic",
      {
        p_restaurant_id: restaurant.id,
        p_post_id: post.id,
        p_title: title,
        p_body: campaignBody,
        p_image_url: image.url,
        p_image_path: image.path,
        p_media_alt_text: mediaAltText,
        p_target_criteria: audience.criteria,
        p_total_budget: totalBudget,
        p_budget_daily: dailyBudget,
        p_starts_at: startsAt,
        p_ends_at: endsAt,
        p_pricing_strategy: strategy,
        p_cpm_rate: pricing.cpmRate || DEFAULT_CAMPAIGN_PRICING.cpmRate,
        p_cpc_rate: pricing.cpcRate || DEFAULT_CAMPAIGN_PRICING.cpcRate,
        p_conversion_rate: pricing.conversionRate || DEFAULT_CAMPAIGN_PRICING.conversionRate,
        p_cta_type: ctaType,
        p_cta_target_id: ctaTargetId,
        p_created_by: actor.userId || null,
      },
    );

    if (boostError) {
      if (boostError.message.includes("social_post_boost_already_active")) {
        throw new HttpError(409, "Ce post possède déjà une mise en avant active sur cette période.");
      }
      if (boostError.message.includes("campaign_credits_insufficient")) {
        throw new HttpError(402, "Crédits campagnes insuffisants. Aucun budget n'a été réservé.");
      }
      throw new HttpError(500, boostError.message);
    }

    const result = boostResult && typeof boostResult === "object" && !Array.isArray(boostResult)
      ? boostResult as Record<string, unknown>
      : {};
    const campaign = result.campaign && typeof result.campaign === "object"
      ? result.campaign as Record<string, unknown>
      : null;

    if (!campaign?.id) {
      throw new HttpError(500, "La campagne n'a pas été créée de manière atomique.");
    }

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
        cta_type: ctaType,
        media_source: existingMediaUrl ? "post_media" : (candidateImageUrl === restaurantImageUrl ? "restaurant_image" : "request_image"),
        estimated_audience: audience.estimatedAudience,
        targeting_adjusted: audience.adjusted,
        targeting_adjustment: audience.adjustment,
      },
    });

    return jsonResponse({
      ...result,
      targeting: {
        estimatedAudience: audience.estimatedAudience,
        adjusted: audience.adjusted,
        adjustment: audience.adjustment,
      },
    }, 200, corsHeaders);
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
