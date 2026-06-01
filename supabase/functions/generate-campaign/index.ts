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

const VALID_CAMPAIGN_TYPES = new Set(["boost", "banner", "push"]);
const VALID_TARGET_PAGES = new Set(["home", "search", "flash_sales", "anti_waste"]);

function clampBudget(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function roundBudget(value: number) {
  return Math.round(value / 5) * 5;
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
}: {
  restaurant: Record<string, unknown>;
  avgRating: number;
  totalRevenue: number;
  avgTicket: number;
  categories: string[];
  flashCount: number;
  antiWasteCount: number;
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

  const revenueBase = Math.max(totalRevenue, avgTicket * 20, 120);
  const totalBudget = roundBudget(clampBudget(revenueBase * 0.08, 20, 500));
  const budgetDaily = roundBudget(clampBudget(totalBudget / 7, 5, Math.max(5, totalBudget)));

  return {
    title: title.slice(0, 60),
    body: body.slice(0, 200),
    type,
    target_pages: targetPages,
    total_budget: totalBudget,
    budget_daily: Math.min(budgetDaily, totalBudget),
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

  return {
    title: String(source.title || fallbackCampaign.title || "Nouvelle campagne").trim().slice(0, 60),
    body: String(source.body || fallbackCampaign.body || "").trim().slice(0, 200),
    type: VALID_CAMPAIGN_TYPES.has(type) ? type : fallbackType,
    target_pages: normalizeTargetPages(source.target_pages, fallbackPages),
    total_budget: totalBudget,
    budget_daily: Math.min(budgetDaily, Math.max(totalBudget, budgetDaily, 5)),
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

    const [ordersRes, reviewsRes, menuRes, campaignsRes, flashRes, antiWasteRes] = await Promise.all([
      adminClient.from("orders").select("total_amount, status, created_at")
        .eq("restaurant_id", restaurantId).gte("created_at", thirtyDaysAgo),
      adminClient.from("reviews").select("rating, comment, quality_rating, service_rating, speed_rating")
        .eq("restaurant_id", restaurantId).order("created_at", { ascending: false }).limit(20),
      adminClient.from("menu_items").select("name, price, category, image_url, is_available")
        .eq("restaurant_id", restaurantId),
      adminClient.from("ad_campaigns").select("title, type, status, impressions, clicks, conversions, spent, total_budget")
        .eq("restaurant_id", restaurantId).order("created_at", { ascending: false }).limit(10),
      adminClient.from("flash_sales").select("title, original_price, discounted_price, quantity_available")
        .eq("restaurant_id", restaurantId).eq("is_active", true).limit(5),
      adminClient.from("anti_waste_offers").select("title, original_price, discounted_price")
        .eq("restaurant_id", restaurantId).eq("is_active", true).limit(5),
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
    });
    let campaign: Record<string, unknown> = fallbackCampaign;
    let generationSource = "fallback";
    let fallbackReason: string | null = null;

    const contextSummary = `
Restaurant: ${restaurant.name}
Cuisine: ${restaurant.cuisine_type || "Non specifie"}
Ville: ${restaurant.city || "Inconnue"}
Note moyenne: ${avgRating.toFixed(1)}/5 (${reviews.length} avis)
Commandes 30j: ${completedOrders.length} (CA: ${totalRevenue.toFixed(0)} CHF, panier moyen: ${avgTicket.toFixed(0)} CHF)
Menu: ${menu.length} plats dans ${categories.length} categories (${categories.join(", ")})
Plats populaires: ${menu.slice(0, 5).map((item: any) => `${item.name} (${item.price} CHF)`).join(", ")}
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
  "budget_daily": number
}

REGLES:
- Le titre doit etre accrocheur
- La description doit creer l'urgence ou la curiosite
- Choisis les target_pages les plus pertinentes (2-3 max)
- Le budget doit etre realiste (5-15% du CA mensuel)
- Adapte le message aux forces du restaurant

Retourne UNIQUEMENT le JSON, sans explication.`;

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");

    if (!LOVABLE_API_KEY) {
      fallbackReason = "lovable_key_missing";
    } else {
      try {
        const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${LOVABLE_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "google/gemini-2.5-flash",
            messages: [
              { role: "system", content: systemPrompt },
              { role: "user", content: "Genere une campagne publicitaire optimisee pour ce restaurant." },
            ],
            tools: [
              {
                type: "function",
                function: {
                  name: "create_campaign",
                  description: "Cree une campagne publicitaire optimisee",
                  parameters: {
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
                    },
                    required: ["title", "body", "type", "target_pages", "total_budget", "budget_daily"],
                    additionalProperties: false,
                  },
                },
              },
            ],
            tool_choice: { type: "function", function: { name: "create_campaign" } },
          }),
        });

        if (aiResponse.ok) {
          const aiData = await aiResponse.json();
          let rawCampaign: Record<string, unknown> = {};
          const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];
          if (toolCall?.function?.arguments) {
            try {
              rawCampaign = JSON.parse(toolCall.function.arguments);
            } catch {
              rawCampaign = {};
            }
          } else {
            const content = aiData.choices?.[0]?.message?.content || "";
            const jsonMatch = content.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
              rawCampaign = JSON.parse(jsonMatch[0]);
            }
          }

          campaign = normalizeGeneratedCampaign(rawCampaign, fallbackCampaign);
          generationSource = "ai";
        } else if (aiResponse.status === 429) {
          fallbackReason = "rate_limited";
        } else if (aiResponse.status === 402) {
          fallbackReason = "insufficient_credits";
        } else {
          fallbackReason = `gateway_${aiResponse.status}`;
        }
      } catch (_aiError) {
        log.error("ai_fallback");
        fallbackReason = "gateway_error";
      }
    }

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
