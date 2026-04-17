import {
  HttpError,
  authenticateRequest,
  jsonResponse,
  requireRestaurantAccess,
  writeAuditLog,
} from "../_shared/auth.ts";
import { buildCorsHeaders, handleCorsPreflight } from "../_shared/cors.ts";
import { createRateLimiter } from "../_shared/rate-limit.ts";
import { makeLogger } from "../_shared/logging.ts";

// Restaurant columns sent to the AI. Keep this list minimal and business-only:
// never send owner_id, stripe_account_id, internal flags, raw addresses, etc.
const RESTAURANT_COLUMNS =
  "id, name, city, cuisine_type, rating, review_count, price_range, delivery_available, delivery_fee, min_order_amount";

type ChatMessage = { role: "system" | "user" | "assistant"; content: string };

function sanitizeMessages(raw: unknown): ChatMessage[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((m): m is Record<string, unknown> => Boolean(m) && typeof m === "object")
    .slice(-20) // cap to last 20 messages to bound cost
    .map((m) => {
      const role = m.role === "user" || m.role === "assistant" ? m.role : "user";
      const content = typeof m.content === "string" ? m.content.slice(0, 4000) : "";
      return { role, content } as ChatMessage;
    })
    .filter((m) => m.content.length > 0);
}

Deno.serve(async (req) => {
  const cors = buildCorsHeaders(req);
  const preflight = handleCorsPreflight(req, cors);
  if (preflight) return preflight;

  const log = makeLogger("restaurant-advisor");
  let actor: Awaited<ReturnType<typeof authenticateRequest>> | null = null;

  try {
    actor = await authenticateRequest(req, { allowServiceRole: false });
    if (!actor.userId) throw new HttpError(401, "Unauthorized");

    const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!OPENAI_API_KEY && !LOVABLE_API_KEY) {
      log.error("ai_provider_missing");
      throw new HttpError(503, "ai_service_unavailable");
    }

    const body = await req.json().catch(() => ({}));
    const restaurantId = typeof body.restaurantId === "string" ? body.restaurantId : "";
    const messages = sanitizeMessages(body.messages);
    if (!restaurantId || messages.length === 0) {
      throw new HttpError(400, "invalid_request");
    }

    const restaurant = await requireRestaurantAccess(actor, restaurantId);

    // Fail-closed rate limits: per user (cost protection), per restaurant
    // (multi-owner fairness), and global (platform brake).
    const rl = createRateLimiter(actor.adminClient, "restaurant-advisor");
    await rl.consume(`user:${actor.userId}`, { maxRequests: 20, windowSeconds: 3600 });
    await rl.consume(`restaurant:${restaurantId}`, { maxRequests: 50, windowSeconds: 3600 });
    await rl.consume("global", { maxRequests: 200, windowSeconds: 60 });

    // Gather restaurant data (minimal columns).
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();

    const [
      restaurantFullResult,
      ordersResult,
      reservationsResult,
      reviewsResult,
      menuResult,
      campaignsResult,
      flashSalesResult,
      photosResult,
      antiWasteResult,
      formulasResult,
      promotionsResult,
    ] = await Promise.all([
      actor.adminClient
        .from("restaurants")
        .select(RESTAURANT_COLUMNS)
        .eq("id", restaurantId)
        .maybeSingle(),
      actor.adminClient
        .from("orders")
        .select("id, total_amount, status, created_at, delivery_fee, discount_amount")
        .eq("restaurant_id", restaurantId)
        .gte("created_at", thirtyDaysAgo)
        .order("created_at", { ascending: false })
        .limit(500),
      actor.adminClient
        .from("reservations")
        .select("id, date, time, party_size, status, feature, total_amount, created_at")
        .eq("restaurant_id", restaurantId)
        .gte("created_at", thirtyDaysAgo)
        .order("created_at", { ascending: false })
        .limit(500),
      actor.adminClient
        .from("reviews")
        .select("id, rating, quality_rating, service_rating, speed_rating, comment, created_at")
        .eq("restaurant_id", restaurantId)
        .order("created_at", { ascending: false })
        .limit(50),
      actor.adminClient
        .from("menu_items")
        .select("id, name, price, category, is_available, is_exclusive, image_url")
        .eq("restaurant_id", restaurantId),
      actor.adminClient
        .from("ad_campaigns")
        .select("id, title, type, status, impressions, clicks, conversions, spent, total_budget, starts_at, ends_at")
        .eq("restaurant_id", restaurantId)
        .order("created_at", { ascending: false })
        .limit(10),
      actor.adminClient
        .from("flash_sales")
        .select("id, title, original_price, discounted_price, quantity_available, is_active, sale_date")
        .eq("restaurant_id", restaurantId)
        .order("created_at", { ascending: false })
        .limit(10),
      actor.adminClient
        .from("restaurant_media")
        .select("id, media_type, is_cover")
        .eq("restaurant_id", restaurantId),
      actor.adminClient
        .from("anti_waste_offers")
        .select("id, title, original_price, discounted_price, quantity_available, is_active")
        .eq("restaurant_id", restaurantId)
        .limit(10),
      actor.adminClient
        .from("meal_formulas")
        .select("id, name, discount_percent, is_active, applies_to")
        .eq("restaurant_id", restaurantId),
      actor.adminClient
        .from("restaurant_promotions")
        .select("id, name, promotion_type, promotion_value, active, start_at, end_at, target")
        .eq("restaurant_id", restaurantId)
        .limit(10),
    ]);

    const safeRestaurant = (restaurantFullResult.data ?? {
      name: restaurant.name,
      city: restaurant.city,
      cuisine_type: restaurant.cuisine_type,
    }) as Record<string, unknown>;

    const orders = (ordersResult.data ?? []) as Array<Record<string, unknown>>;
    const reservations = (reservationsResult.data ?? []) as Array<Record<string, unknown>>;
    const reviews = (reviewsResult.data ?? []) as Array<Record<string, unknown>>;
    const menuItems = (menuResult.data ?? []) as Array<Record<string, unknown>>;
    const campaigns = (campaignsResult.data ?? []) as Array<Record<string, unknown>>;
    const flashSales = (flashSalesResult.data ?? []) as Array<Record<string, unknown>>;
    const photos = (photosResult.data ?? []) as Array<Record<string, unknown>>;
    const antiWaste = (antiWasteResult.data ?? []) as Array<Record<string, unknown>>;
    const formulas = (formulasResult.data ?? []) as Array<Record<string, unknown>>;
    const promotions = (promotionsResult.data ?? []) as Array<Record<string, unknown>>;

    const totalRevenue = orders.reduce((s, o) => s + Number(o.total_amount ?? 0), 0);
    const avgTicket = orders.length > 0 ? totalRevenue / orders.length : 0;
    const cancelledOrders = orders.filter((o) => o.status === "cancelled").length;
    const cancelRate = orders.length > 0 ? ((cancelledOrders / orders.length) * 100).toFixed(1) : "0";

    const fmt1 = (arr: number[]) =>
      arr.length > 0 ? (arr.reduce((s, n) => s + n, 0) / arr.length).toFixed(1) : "N/A";
    const avgRating = fmt1(reviews.map((r) => Number(r.rating ?? 0)));
    const avgQuality = fmt1(reviews.map((r) => Number(r.quality_rating ?? 0)));
    const avgService = fmt1(reviews.map((r) => Number(r.service_rating ?? 0)));
    const avgSpeed = fmt1(reviews.map((r) => Number(r.speed_rating ?? 0)));

    const totalImpressions = campaigns.reduce((s, c) => s + Number(c.impressions ?? 0), 0);
    const totalClicks = campaigns.reduce((s, c) => s + Number(c.clicks ?? 0), 0);
    const totalConversions = campaigns.reduce((s, c) => s + Number(c.conversions ?? 0), 0);
    const ctr = totalImpressions > 0 ? ((totalClicks / totalImpressions) * 100).toFixed(2) : "0";
    const conversionRate = totalClicks > 0 ? ((totalConversions / totalClicks) * 100).toFixed(2) : "0";

    const recentReviews = reviews.slice(0, 5).map((r) => ({
      rating: r.rating,
      // Comments may contain PII from reviewers — truncate defensively.
      comment: typeof r.comment === "string" ? r.comment.slice(0, 500) : "(pas de commentaire)",
      date: r.created_at,
    }));

    const menuCategories = [...new Set(menuItems.map((m) => m.category || "Sans catégorie"))];
    const itemsWithoutImage = menuItems.filter((m) => !m.image_url).length;
    const unavailableItems = menuItems.filter((m) => m.is_available === false).length;

    const contextData = {
      restaurant: safeRestaurant,
      sales_30d: {
        total_orders: orders.length,
        total_revenue: totalRevenue.toFixed(2) + " CHF",
        average_ticket: avgTicket.toFixed(2) + " CHF",
        cancel_rate: cancelRate + "%",
        cancelled_orders: cancelledOrders,
      },
      reservations_30d: { total: reservations.length },
      reviews: {
        total: reviews.length,
        avg_rating: avgRating,
        avg_quality: avgQuality,
        avg_service: avgService,
        avg_speed: avgSpeed,
        recent: recentReviews,
      },
      menu: {
        total_items: menuItems.length,
        categories: menuCategories,
        items_without_image: itemsWithoutImage,
        unavailable_items: unavailableItems,
      },
      campaigns: {
        total: campaigns.length,
        active: campaigns.filter((c) => c.status === "active").length,
        total_impressions: totalImpressions,
        total_clicks: totalClicks,
        total_conversions: totalConversions,
        ctr: ctr + "%",
        conversion_rate: conversionRate + "%",
      },
      flash_sales: { total: flashSales.length, active: flashSales.filter((f) => f.is_active).length },
      anti_waste: { total: antiWaste.length, active: antiWaste.filter((a) => a.is_active).length },
      formulas: { total: formulas.length, active: formulas.filter((f) => f.is_active).length },
      promotions: { total: promotions.length, active: promotions.filter((p) => p.active).length },
      photos: { total: photos.length, has_cover: photos.some((p) => p.is_cover) },
    };

    const systemPrompt = `Tu es l'assistant IA expert en restauration de la plateforme Tok. Tu aides les restaurateurs à optimiser leurs ventes.

Données du restaurant "${restaurant.name}" :

${JSON.stringify(contextData, null, 2)}

RÈGLES :
- Réponds en français, concis, actionnable
- Base tes conseils sur les VRAIES données (jamais de PII individuelle)
- Format Markdown, émojis pour structurer
- Si une donnée manque, dis-le honnêtement
- Propose des actions prioritaires classées par impact`;

    const useOpenAI = !!OPENAI_API_KEY;
    const OPENAI_MODEL = Deno.env.get("OPENAI_MODEL") || "gpt-4o-mini";

    const aiUrl = useOpenAI
      ? "https://api.openai.com/v1/chat/completions"
      : "https://ai.gateway.lovable.dev/v1/chat/completions";

    const response = await fetch(aiUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${useOpenAI ? OPENAI_API_KEY : LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: useOpenAI ? OPENAI_MODEL : "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: systemPrompt },
          ...messages,
        ],
        stream: true,
      }),
    });

    if (!response.ok) {
      log.error("ai_gateway_error", { status: response.status });
      if (response.status === 429) {
        throw new HttpError(429, "Trop de requêtes. Réessayez dans quelques instants.");
      }
      if (response.status === 402) {
        throw new HttpError(402, "Crédits IA épuisés.");
      }
      throw new HttpError(502, "ai_service_error");
    }

    // Audit success (fire-and-forget).
    writeAuditLog({
      adminClient: actor.adminClient,
      functionName: "restaurant-advisor",
      status: "success",
      actor,
      request: req,
      targetEntityType: "restaurants",
      targetEntityId: restaurantId,
      metadata: { rid: log.rid, message_count: messages.length },
    }).catch(() => {});

    return new Response(response.body, {
      headers: { ...cors, "Content-Type": "text/event-stream" },
    });
  } catch (err) {
    const status = err instanceof HttpError ? err.status : 500;
    const message = err instanceof HttpError ? err.message : "internal_error";
    log.error("request_failed", { status, message });

    if (actor) {
      writeAuditLog({
        adminClient: actor.adminClient,
        functionName: "restaurant-advisor",
        status: "failure",
        actor,
        request: req,
        errorMessage: message,
        metadata: { rid: log.rid },
      }).catch(() => {});
    }

    return jsonResponse({ error: message, rid: log.rid }, status, cors);
  }
});
