import {
  HttpError,
  authenticateRequest,
  createAdminClient,
  jsonResponse,
  requireRestaurantAccess,
  writeAuditLog,
} from "../_shared/auth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const VALID_CAMPAIGN_TYPES = new Set(["boost", "banner", "push"]);
const VALID_TARGET_PAGES = new Set(["home", "search", "flash_sales", "anti_waste"]);
const VALID_PAYMENT_METHODS = new Set(["card", "twint", "postfinance_card", "postfinance_efinance", "cash"]);
const VALID_EDITABLE_STATUSES = new Set(["draft", "paused", "active", "ended", "pending_payment"]);
const VALID_CUSTOMER_SEGMENTS = new Set(["all", "new", "returning", "loyal", "inactive"]);
const VALID_JOURNEY_TYPES = new Set(["delivery", "takeaway", "reservation", "zero_attente"]);
const VALID_SERVICE_MOMENTS = new Set(["lunch", "dinner", "weekend"]);

type CampaignPortalAction = "list" | "save" | "update_status" | "delete" | "estimate_audience";

function normalizeText(value: unknown) {
  return String(value || "").trim();
}

function normalizeLower(value: unknown) {
  return normalizeText(value).toLowerCase();
}

function clampNonNegativeNumber(value: unknown) {
  return Math.max(0, Number(value) || 0);
}

function sanitizeStringArray(values: unknown, allowed?: Set<string>) {
  if (!Array.isArray(values)) return [];

  return Array.from(new Set(values
    .map((value) => normalizeLower(value))
    .filter((value) => value.length > 0)
    .filter((value) => !allowed || allowed.has(value))));
}

function sanitizeAudienceCriteria(raw: unknown) {
  const source = raw && typeof raw === "object" && !Array.isArray(raw)
    ? raw as Record<string, unknown>
    : {};

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

function sanitizeCampaignPayload(raw: unknown, existingCampaign?: Record<string, unknown> | null) {
  const source = raw && typeof raw === "object" && !Array.isArray(raw)
    ? raw as Record<string, unknown>
    : {};

  const title = normalizeText(source.title);
  const type = normalizeLower(source.type);
  const body = normalizeText(source.body) || null;
  const imageUrl = normalizeText(source.image_url) || null;
  const totalBudget = clampNonNegativeNumber(source.total_budget);
  const budgetDaily = clampNonNegativeNumber(source.budget_daily);
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

  return {
    title,
    body,
    type,
    image_url: imageUrl,
    target_pages: sanitizeStringArray(source.target_pages, VALID_TARGET_PAGES),
    target_criteria: sanitizeAudienceCriteria(source.target_criteria),
    total_budget: totalBudget,
    budget_daily: budgetDaily,
    starts_at: startsAt,
    ends_at: endsAt,
    payment_method: sanitizedPaymentMethod,
    payment_status: paymentStatus,
    status,
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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

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
        console.warn("campaign-portal estimate_audience fallback:", error);
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
    console.error("campaign-portal error:", error);
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
