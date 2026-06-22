import {
  HttpError,
  authenticateRequest,
  createAdminClient,
  jsonResponse,
  requireRestaurantAccess,
  writeAuditLog,
} from "../_shared/auth.ts";
import { buildCorsHeaders, handleCorsPreflight } from "../_shared/cors.ts";
import { createRateLimiter } from "../_shared/rate-limit.ts";
import { makeLogger } from "../_shared/logging.ts";
import {
  OPENAI_API_KEY,
  createOpenAIResponse,
  extractUsage,
  parseStructuredOutput,
  selectTokAiModel,
} from "../_shared/openai.ts";

const VALID_CAMPAIGN_TYPES = new Set(["boost", "banner", "push"]);
const VALID_TARGET_PAGES = new Set(["home", "search", "flash_sales", "anti_waste"]);

function clampBudget(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function roundBudget(value: number) {
  return Math.round(value / 5) * 5;
}


function getServiceMomentFromHour(hour: number) {
  if (hour >= 11 && hour <= 14) return "lunch";
  if (hour >= 18 && hour <= 22) return "dinner";
  return null;
}

function getHourLabel(hour: number) {
  return `${String(hour).padStart(2, "0")}h-${String((hour + 1) % 24).padStart(2, "0")}h`;
}

function rankEntries<T extends { score: number }>(entries: T[], limit: number) {
  return [...entries].sort((a, b) => b.score - a.score).slice(0, limit);
}

function buildHourlyPerformance(orders: any[], reservations: any[]) {
  const buckets = new Map<number, { hour: number; orders: number; reservations: number; revenue: number; score: number }>();
  const getBucket = (hour: number) => {
    const normalizedHour = Number.isFinite(hour) ? Math.max(0, Math.min(23, Math.floor(hour))) : 12;
    const existing = buckets.get(normalizedHour);
    if (existing) return existing;
    const created = { hour: normalizedHour, orders: 0, reservations: 0, revenue: 0, score: 0 };
    buckets.set(normalizedHour, created);
    return created;
  };

  for (const order of orders) {
    const createdAt = Date.parse(String(order.created_at || ""));
    if (!Number.isFinite(createdAt)) continue;
    const bucket = getBucket(new Date(createdAt).getUTCHours());
    bucket.orders += 1;
    bucket.revenue += Number(order.total_amount || 0);
    bucket.score += 3 + Math.min(10, Number(order.total_amount || 0) / 10);
  }

  for (const reservation of reservations) {
    const [hourText] = String(reservation.time || "").split(":");
    const hour = Number(hourText);
    if (!Number.isFinite(hour)) continue;
    const bucket = getBucket(hour);
    bucket.reservations += 1;
    bucket.score += 2 + Math.min(8, Number(reservation.party_size || 0));
  }

  return rankEntries(Array.from(buckets.values()), 5);
}

function buildProductPerformance(orderItems: any[], menu: any[]) {
  const menuById = new Map(menu.map((item: any) => [String(item.id || ""), item]));
  const productMap = new Map<string, { name: string; category: string; quantity: number; revenue: number; score: number }>();

  for (const item of orderItems) {
    const menuItem = menuById.get(String(item.menu_item_id || ""));
    const name = String(menuItem?.name || item.metadata?.name || item.metadata?.title || "Produit TOK").trim();
    const category = String(menuItem?.category || item.metadata?.category || "").trim();
    const key = String(item.menu_item_id || name).toLowerCase();
    const current = productMap.get(key) || { name, category, quantity: 0, revenue: 0, score: 0 };
    const quantity = Math.max(1, Number(item.quantity || 1));
    const revenue = Number(item.total_price || 0);
    current.quantity += quantity;
    current.revenue += revenue;
    current.score += quantity * 3 + revenue;
    productMap.set(key, current);
  }

  return rankEntries(Array.from(productMap.values()), 8);
}

function deriveAudienceCriteria({
  restaurant,
  avgTicket,
  categories,
  hourlyPerformance,
  completedOrders,
  reservations,
}: {
  restaurant: Record<string, unknown>;
  avgTicket: number;
  categories: string[];
  hourlyPerformance: ReturnType<typeof buildHourlyPerformance>;
  completedOrders: any[];
  reservations: any[];
}) {
  const topMoments = Array.from(new Set(hourlyPerformance
    .map((entry) => getServiceMomentFromHour(entry.hour))
    .filter((entry): entry is "lunch" | "dinner" => Boolean(entry))));
  const hasReservations = reservations.length > completedOrders.length * 0.35;
  const journeyTypes = hasReservations ? ["reservation"] : ["delivery", "takeaway"];
  const repeatCustomerCount = completedOrders.reduce((acc: Record<string, number>, order: any) => {
    const userId = String(order.user_id || "");
    if (userId) acc[userId] = (acc[userId] || 0) + 1;
    return acc;
  }, {});
  const loyalShare = Object.values(repeatCustomerCount).filter((count) => Number(count) >= 3).length;
  const customerSegment = loyalShare >= 5 ? "loyal" : completedOrders.length >= 20 ? "returning" : "new";

  return {
    cuisines: categories.slice(0, 3).map((category) => String(category).toLowerCase()),
    cities: restaurant.city ? [String(restaurant.city).toLowerCase()] : [],
    minOrders: customerSegment === "loyal" ? 3 : customerSegment === "returning" ? 1 : 0,
    maxDaysSinceOrder: customerSegment === "new" ? 365 : 60,
    minAvgBasket: avgTicket >= 25 ? Math.max(15, Math.round(avgTicket * 0.75)) : 0,
    favoritesOnly: customerSegment === "loyal",
    genders: ["all"],
    customerSegment,
    journeyTypes,
    serviceMoments: topMoments.length > 0 ? topMoments : ["lunch", "dinner"],
    restaurantId: String(restaurant.id || ""),
  };
}

function deriveSchedule({ hourlyPerformance, totalBudget }: { hourlyPerformance: ReturnType<typeof buildHourlyPerformance>; totalBudget: number }) {
  const bestHour = hourlyPerformance[0]?.hour ?? 11;
  const startsAt = new Date();
  startsAt.setUTCDate(startsAt.getUTCDate() + 1);
  startsAt.setUTCHours(Math.max(0, bestHour - 1), 0, 0, 0);
  const durationDays = totalBudget >= 150 ? 14 : 7;
  const endsAt = new Date(startsAt);
  endsAt.setUTCDate(endsAt.getUTCDate() + durationDays);
  endsAt.setUTCHours(Math.min(23, bestHour + 2), 59, 59, 0);

  return {
    starts_at: startsAt.toISOString(),
    ends_at: endsAt.toISOString(),
    publish_hour_utc: Math.max(0, bestHour - 1),
    stop_hour_utc: Math.min(23, bestHour + 2),
    duration_days: durationDays,
  };
}

function normalizeTargetPages(value: unknown, fallback: string[]) {
  if (!Array.isArray(value)) return fallback;

  const pages = Array.from(new Set(value
    .map((entry) => String(entry || "").trim().toLowerCase())
    .filter((entry) => VALID_TARGET_PAGES.has(entry))));

  return pages.length > 0 ? pages : fallback;
}

function buildFallbackCampaign({
  restaurant,
  avgRating,
  totalRevenue,
  avgTicket,
  categories,
  flashCount,
  antiWasteCount,
  hourlyPerformance,
}: {
  restaurant: Record<string, unknown>;
  avgRating: number;
  totalRevenue: number;
  avgTicket: number;
  categories: string[];
  flashCount: number;
  antiWasteCount: number;
  hourlyPerformance: ReturnType<typeof buildHourlyPerformance>;
}) {
  const restaurantName = String(restaurant.name || "Votre restaurant").trim();
  const cuisineType = String(restaurant.cuisine_type || "").trim();
  const city = String(restaurant.city || "").trim();
  const firstCategory = categories.find(Boolean) || cuisineType || "vos specialites";

  let title = `Découvrez ${restaurantName}`;
  let body = `${restaurantName} met a l'honneur ${firstCategory}${city ? ` a ${city}` : ""}. Donnez envie aux clients de passer commande aujourd'hui.`;
  const type = "boost";
  let targetPages = ["home", "search"];

  if (flashCount > 0) {
    title = `Vos ventes flash ${restaurantName}`;
    body = `Mettez vos ventes flash en avant pour accelerer les commandes et capter les clients deja actifs sur la plateforme.`;
    targetPages = ["flash_sales", "home"];
  } else if (antiWasteCount > 0) {
    title = `Offres anti-gaspi a saisir`;
    body = `${restaurantName} peut attirer de nouveaux clients avec ses offres anti-gaspi et convertir la demande locale rapidement.`;
    targetPages = ["anti_waste", "home"];
  } else if (avgRating >= 4.5) {
    title = `${restaurantName} fait parler de lui`;
    body = `Capitalisez sur votre note de ${avgRating.toFixed(1)}/5 pour attirer des clients en recherche d'une adresse fiable et bien notee.`;
    targetPages = ["home", "search"];
  } else if (avgTicket >= 35) {
    title = `Boostez votre panier moyen`;
    body = `${restaurantName} peut mettre en avant ${firstCategory} pour transformer l'intention en commande a forte valeur.`;
    targetPages = ["search", "home"];
  }

  const peakMultiplier = hourlyPerformance.length > 0 ? 1.15 : 1;
  const revenueBase = Math.max(totalRevenue, avgTicket * 20, 120) * peakMultiplier;
  const totalBudget = roundBudget(clampBudget(revenueBase * 0.08, 20, 500));
  const budgetDaily = roundBudget(clampBudget(totalBudget / 7, 5, Math.max(5, totalBudget)));

  return {
    title: title.slice(0, 60),
    body: body.slice(0, 200),
    type,
    target_pages: targetPages,
    total_budget: totalBudget,
    budget_daily: Math.min(budgetDaily, totalBudget),
    target_criteria: deriveAudienceCriteria({ restaurant, avgTicket, categories, hourlyPerformance, completedOrders: [], reservations: [] }),
    optimization_notes: [],
  };
}

function normalizeGeneratedCampaign(raw: unknown, fallbackCampaign: Record<string, unknown>) {
  const source = raw && typeof raw === "object" && !Array.isArray(raw)
    ? raw as Record<string, unknown>
    : {};

  const fallbackType = String(fallbackCampaign.type || "boost");
  const fallbackPages = Array.isArray(fallbackCampaign.target_pages)
    ? (fallbackCampaign.target_pages as string[])
    : ["home", "search"];
  const fallbackTotalBudget = Number(fallbackCampaign.total_budget || 20);
  const fallbackDailyBudget = Number(fallbackCampaign.budget_daily || 5);

  const type = String(source.type || fallbackType).trim().toLowerCase();
  const totalBudget = clampBudget(Number(source.total_budget) || fallbackTotalBudget, 0, 5000);
  const budgetDaily = clampBudget(Number(source.budget_daily) || fallbackDailyBudget, 0, Math.max(totalBudget, fallbackDailyBudget, 5));
  const targetCriteria = source.target_criteria && typeof source.target_criteria === "object" && !Array.isArray(source.target_criteria)
    ? source.target_criteria as Record<string, unknown>
    : fallbackCampaign.target_criteria;
  const optimizationNotes = Array.isArray(source.optimization_notes)
    ? source.optimization_notes.map((note) => String(note || "").trim()).filter(Boolean).slice(0, 6)
    : fallbackCampaign.optimization_notes;

  return {
    title: String(source.title || fallbackCampaign.title || "Nouvelle campagne").trim().slice(0, 60),
    body: String(source.body || fallbackCampaign.body || "").trim().slice(0, 200),
    type: VALID_CAMPAIGN_TYPES.has(type) ? type : fallbackType,
    target_pages: normalizeTargetPages(source.target_pages, fallbackPages),
    total_budget: totalBudget,
    budget_daily: Math.min(budgetDaily, Math.max(totalBudget, budgetDaily, 5)),
    target_criteria: targetCriteria,
    starts_at: typeof source.starts_at === "string" ? source.starts_at : fallbackCampaign.starts_at,
    ends_at: typeof source.ends_at === "string" ? source.ends_at : fallbackCampaign.ends_at,
    optimization_notes: optimizationNotes,
  };
}

Deno.serve(async (req) => {
  const corsHeaders = buildCorsHeaders(req);
  const preflight = handleCorsPreflight(req, corsHeaders);
  if (preflight) return preflight;

  const log = makeLogger("generate-campaign");
  let actor: Awaited<ReturnType<typeof authenticateRequest>> | null = null;
  let restaurantId = "";

  try {
    actor = await authenticateRequest(req, { allowServiceRole: false });
    if (!actor.userId) throw new HttpError(401, "Unauthorized");
    ({ restaurantId } = await req.json());
    if (!restaurantId) throw new HttpError(400, "restaurantId requis");

    const restaurant = await requireRestaurantAccess(actor, restaurantId);

    // Rate limit: expensive AI call, fail-closed.
    const rl = createRateLimiter(actor.adminClient, "generate-campaign");
    await rl.consume(`user:${actor.userId}`, { maxRequests: 10, windowSeconds: 3600 });
    await rl.consume(`restaurant:${restaurantId}`, { maxRequests: 20, windowSeconds: 3600 });
    await rl.consume("global", { maxRequests: 100, windowSeconds: 60 });

    const adminClient = actor.adminClient;
    const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString();

    const [ordersRes, reviewsRes, menuRes, campaignsRes, flashRes, antiWasteRes, reservationsRes] = await Promise.all([
      adminClient.from("orders").select("id, user_id, total_amount, status, created_at")
        .eq("restaurant_id", restaurantId).gte("created_at", thirtyDaysAgo),
      adminClient.from("reviews").select("rating, comment, quality_rating, service_rating, speed_rating")
        .eq("restaurant_id", restaurantId).order("created_at", { ascending: false }).limit(20),
      adminClient.from("menu_items").select("id, name, price, category, image_url, is_available")
        .eq("restaurant_id", restaurantId),
      adminClient.from("ad_campaigns").select("title, type, status, impressions, clicks, conversions, spent, total_budget")
        .eq("restaurant_id", restaurantId).order("created_at", { ascending: false }).limit(10),
      adminClient.from("flash_sales").select("title, original_price, discounted_price, quantity_available")
        .eq("restaurant_id", restaurantId).eq("is_active", true).limit(5),
      adminClient.from("anti_waste_offers").select("title, original_price, discounted_price")
        .eq("restaurant_id", restaurantId).eq("is_active", true).limit(5),
      adminClient.from("reservations").select("date, time, party_size, status, feature, total_amount, created_at")
        .eq("restaurant_id", restaurantId).gte("created_at", thirtyDaysAgo).limit(500),
    ]);

    const orders = ordersRes.data || [];
    const completedOrders = orders.filter((order: any) => order.status !== "cancelled");
    const totalRevenue = completedOrders.reduce((sum: number, order: any) => sum + Number(order.total_amount || 0), 0);
    const avgTicket = completedOrders.length > 0 ? totalRevenue / completedOrders.length : 0;
    const reviews = reviewsRes.data || [];
    const avgRating = reviews.length > 0
      ? reviews.reduce((sum: number, review: any) => sum + Number(review.rating), 0) / reviews.length
      : 0;
    const menu = menuRes.data || [];
    const categories = [...new Set(menu.map((item: any) => item.category).filter(Boolean))];
    const pastCampaigns = campaignsRes.data || [];
    const reservations = (reservationsRes.data || []).filter((reservation: any) => reservation.status !== "cancelled");
    const orderIds = completedOrders.map((order: any) => order.id).filter(Boolean);
    const orderItemsRes = orderIds.length > 0
      ? await adminClient.from("order_items").select("order_id, menu_item_id, quantity, total_price, metadata")
        .eq("restaurant_id", restaurantId).in("order_id", orderIds).limit(1000)
      : { data: [], error: null };
    if (orderItemsRes.error) log.warn("order_items_unavailable", { message: orderItemsRes.error.message });
    const productPerformance = buildProductPerformance(orderItemsRes.data || [], menu);
    const hourlyPerformance = buildHourlyPerformance(completedOrders, reservations);
    const targetCriteria = deriveAudienceCriteria({ restaurant, avgTicket, categories, hourlyPerformance, completedOrders, reservations });
    const flashCount = (flashRes.data || []).length;
    const antiWasteCount = (antiWasteRes.data || []).length;
    const fallbackCampaign = buildFallbackCampaign({
      restaurant,
      avgRating,
      totalRevenue,
      avgTicket,
      categories,
      flashCount,
      antiWasteCount,
      hourlyPerformance,
    });
    Object.assign(fallbackCampaign, {
      target_criteria: targetCriteria,
      ...deriveSchedule({ hourlyPerformance, totalBudget: Number(fallbackCampaign.total_budget || 0) }),
      optimization_notes: [
        productPerformance[0] ? `Produit prioritaire: ${productPerformance[0].name}` : "Catalogue analyse sans produit dominant",
        hourlyPerformance[0] ? `Meilleur horaire: ${getHourLabel(hourlyPerformance[0].hour)}` : "Horaire par defaut midi/soir",
        reservations.length > completedOrders.length * 0.35 ? "Axe reservation prioritaire" : "Axe commande prioritaire",
      ],
    });
    let campaign: Record<string, unknown> = fallbackCampaign;
    let generationSource = "fallback";
    let fallbackReason: string | null = null;
    const aiModel = selectTokAiModel("strategy");
    let aiUsage = { input_tokens: 0, output_tokens: 0, total_tokens: 0 };

    const contextSummary = `
Restaurant: ${restaurant.name}
Cuisine: ${restaurant.cuisine_type || "Non specifie"}
Ville: ${restaurant.city || "Inconnue"}
Note moyenne: ${avgRating.toFixed(1)}/5 (${reviews.length} avis)
Commandes 30j: ${completedOrders.length} (CA: ${totalRevenue.toFixed(0)} CHF, panier moyen: ${avgTicket.toFixed(0)} CHF)
Menu: ${menu.length} plats dans ${categories.length} categories (${categories.join(", ")})
Produits les plus performants: ${productPerformance.length > 0 ? productPerformance.map((item) => `${item.name} (${item.quantity} ventes, ${item.revenue.toFixed(0)} CHF)`).join(", ") : menu.slice(0, 5).map((item: any) => `${item.name} (${item.price} CHF)`).join(", ")}
Horaires les plus performants: ${hourlyPerformance.length > 0 ? hourlyPerformance.map((entry) => `${getHourLabel(entry.hour)}: ${entry.orders} commandes, ${entry.reservations} reservations, ${entry.revenue.toFixed(0)} CHF`).join("; ") : "Donnees insuffisantes"}
Reservations 30j: ${reservations.length} (${reservations.reduce((sum: number, reservation: any) => sum + Number(reservation.party_size || 0), 0)} couverts)
Ventes flash actives: ${flashCount}
Offres anti-gaspi actives: ${antiWasteCount}
Campagnes passees: ${pastCampaigns.length} (${pastCampaigns.filter((campaign: any) => campaign.status === "active").length} actives)
${pastCampaigns.length > 0 ? `Perf campagnes: ${pastCampaigns.reduce((sum: number, campaign: any) => sum + (campaign.impressions || 0), 0)} impressions, ${pastCampaigns.reduce((sum: number, campaign: any) => sum + (campaign.clicks || 0), 0)} clics, ${pastCampaigns.reduce((sum: number, campaign: any) => sum + (campaign.conversions || 0), 0)} conversions` : ""}
Avis recents negatifs: ${reviews.filter((review: any) => review.rating <= 3).map((review: any) => review.comment).filter(Boolean).slice(0, 3).join(" | ") || "Aucun"}
`;

    const systemPrompt = `Tu es un expert en marketing digital pour la restauration. Tu dois generer UNE campagne publicitaire optimisee pour le restaurant ci-dessous.

CONTEXTE DU RESTAURANT:
${contextSummary}

Tu dois retourner un JSON valide avec exactement ces champs:
{
  "title": "Titre accrocheur de la campagne (max 60 caracteres)",
  "body": "Description engageante de la campagne (max 200 caracteres). Doit donner envie et etre actionnable.",
  "type": "boost",
  "target_pages": ["home", "search", "flash_sales", "anti_waste"],
  "total_budget": number,
  "budget_daily": number,
  "target_criteria": { "customerSegment": "all|new|returning|loyal|inactive", "journeyTypes": ["delivery|takeaway|reservation|zero_attente"], "serviceMoments": ["lunch|dinner|weekend"], "cities": [], "cuisines": [], "minOrders": number, "maxDaysSinceOrder": number, "minAvgBasket": number, "favoritesOnly": boolean, "genders": ["all"] },
  "starts_at": "ISO datetime",
  "ends_at": "ISO datetime",
  "optimization_notes": ["raison factuelle courte"]
}

REGLES:
- Le titre doit etre accrocheur
- La description doit creer l'urgence ou la curiosite
- Choisis les target_pages les plus pertinentes (2-3 max)
- Selectionne automatiquement le segment client, les parcours, les moments de service, l heure de publication et l heure d arret selon les ventes/reservations
- Le budget doit etre realiste (5-15% du CA mensuel) et pace par jour
- Priorise les produits et horaires qui performent le mieux
- Adapte le message aux forces du restaurant

Retourne UNIQUEMENT le JSON, sans explication.`;

    if (!OPENAI_API_KEY) {
      fallbackReason = "openai_key_missing";
    } else {
      try {
        const aiData = await createOpenAIResponse({
          model: aiModel,
          input: [
            { role: "system", content: systemPrompt },
            { role: "user", content: "Genere une campagne publicitaire optimisee pour ce restaurant." },
          ],
          maxOutputTokens: 500,
          jsonSchema: {
            name: "tok_campaign_recommendation",
            description: "Campagne publicitaire TOK optimisee pour un restaurant.",
            strict: true,
            schema: {
              type: "object",
              properties: {
                title: { type: "string" },
                body: { type: "string" },
                type: { type: "string", enum: ["boost", "banner", "push"] },
                target_pages: {
                  type: "array",
                  items: { type: "string", enum: ["home", "search", "flash_sales", "anti_waste"] },
                },
                total_budget: { type: "number" },
                budget_daily: { type: "number" },
                target_criteria: {
                  type: "object",
                  properties: {
                    cuisines: { type: "array", items: { type: "string" } },
                    cities: { type: "array", items: { type: "string" } },
                    minOrders: { type: "number" },
                    maxDaysSinceOrder: { type: "number" },
                    minAvgBasket: { type: "number" },
                    favoritesOnly: { type: "boolean" },
                    genders: { type: "array", items: { type: "string", enum: ["all", "female", "male"] } },
                    customerSegment: { type: "string", enum: ["all", "new", "returning", "loyal", "inactive"] },
                    journeyTypes: { type: "array", items: { type: "string", enum: ["delivery", "takeaway", "reservation", "zero_attente"] } },
                    serviceMoments: { type: "array", items: { type: "string", enum: ["lunch", "dinner", "weekend"] } },
                  },
                  required: ["cuisines", "cities", "minOrders", "maxDaysSinceOrder", "minAvgBasket", "favoritesOnly", "genders", "customerSegment", "journeyTypes", "serviceMoments"],
                  additionalProperties: false,
                },
                starts_at: { type: "string" },
                ends_at: { type: "string" },
                optimization_notes: { type: "array", items: { type: "string" } },
              },
              required: ["title", "body", "type", "target_pages", "total_budget", "budget_daily", "target_criteria", "starts_at", "ends_at", "optimization_notes"],
              additionalProperties: false,
            },
          },
        });

        const rawCampaign = parseStructuredOutput<Record<string, unknown>>(aiData);
        campaign = normalizeGeneratedCampaign(rawCampaign, fallbackCampaign);
        generationSource = "ai";
        aiUsage = extractUsage(aiData);
      } catch (aiError) {
        log.error("ai_fallback", { message: aiError instanceof Error ? aiError.message : "unknown" });
        if (aiError instanceof HttpError && aiError.status === 429) {
          fallbackReason = "rate_limited";
        } else if (aiError instanceof HttpError && aiError.status === 402) {
          fallbackReason = "insufficient_credits";
        } else {
          fallbackReason = "openai_error";
        }
      }
    }

    await actor.adminClient.from("ai_usage_logs").insert({
      function_name: "generate-campaign",
      action: "generate_campaign_copy",
      feature_name: "campaign_assistant",
      source: "generate-campaign",
      model: generationSource === "ai" ? aiModel : "fallback",
      user_id: actor.userId,
      restaurant_id: restaurantId,
      status: "success",
      input_tokens: aiUsage.input_tokens || 0,
      output_tokens: aiUsage.output_tokens || 0,
      total_tokens: aiUsage.total_tokens || 0,
      estimated_cost_chf: 0,
      metadata: {
        credit_kind: "ai_tools",
        credit_units: 5,
        generation_source: generationSource,
        fallback_reason: fallbackReason,
      },
    });

    await writeAuditLog({
      adminClient: actor.adminClient,
      actor,
      request: req,
      functionName: "generate-campaign",
      action: "generate_campaign_copy",
      status: "success",
      targetEntityType: "restaurants",
      targetEntityId: restaurantId,
      metadata: {
        generation_source: generationSource,
        fallback_reason: fallbackReason,
        generated_title: typeof campaign?.title === "string" ? campaign.title : null,
        target_pages: Array.isArray(campaign?.target_pages) ? campaign.target_pages : [],
        target_criteria: campaign?.target_criteria || null,
        optimization_notes: Array.isArray(campaign?.optimization_notes) ? campaign.optimization_notes : [],
      },
    });

    return jsonResponse(campaign, 200, corsHeaders);
  } catch (error) {
    log.error("request_failed", { message: error instanceof Error ? error.message : "unknown" });
    await writeAuditLog({
      adminClient: actor?.adminClient || createAdminClient(),
      actor,
      request: req,
      functionName: "generate-campaign",
      action: "generate_campaign_copy",
      status: "failure",
      targetEntityType: restaurantId ? "restaurants" : null,
      targetEntityId: restaurantId || null,
      errorMessage: error instanceof Error ? error.message : "Erreur interne",
    });
    if (error instanceof HttpError) {
      return jsonResponse({ error: error.message }, error.status, corsHeaders);
    }
    return jsonResponse({ error: error instanceof Error ? error.message : "Erreur inconnue" }, 500, corsHeaders);
  }
});
