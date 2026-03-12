import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

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

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  let actor: Awaited<ReturnType<typeof authenticateRequest>> | null = null;
  let restaurantId = "";

  try {
    actor = await authenticateRequest(req, { allowServiceRole: false });
    ({ restaurantId } = await req.json());
    if (!restaurantId) throw new HttpError(400, "restaurantId requis");

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const restaurant = await requireRestaurantAccess(actor, restaurantId);
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

    const contextSummary = `
Restaurant: ${restaurant.name}
Cuisine: ${restaurant.cuisine_type || "Non specifie"}
Ville: ${restaurant.city || "Inconnue"}
Note moyenne: ${avgRating.toFixed(1)}/5 (${reviews.length} avis)
Commandes 30j: ${completedOrders.length} (CA: ${totalRevenue.toFixed(0)} CHF, panier moyen: ${avgTicket.toFixed(0)} CHF)
Menu: ${menu.length} plats dans ${categories.length} categories (${categories.join(", ")})
Plats populaires: ${menu.slice(0, 5).map((item: any) => `${item.name} (${item.price} CHF)`).join(", ")}
Ventes flash actives: ${(flashRes.data || []).length}
Offres anti-gaspi actives: ${(antiWasteRes.data || []).length}
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

    if (!aiResponse.ok) {
      if (aiResponse.status === 429) {
        return jsonResponse({ error: "Trop de requetes, reessayez dans quelques instants." }, 429, corsHeaders);
      }
      if (aiResponse.status === 402) {
        return jsonResponse({ error: "Credits IA insuffisants." }, 402, corsHeaders);
      }
      throw new Error("Erreur du service IA");
    }

    const aiData = await aiResponse.json();
    let campaign: Record<string, unknown> = {};
    const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];
    if (toolCall?.function?.arguments) {
      try {
        campaign = JSON.parse(toolCall.function.arguments);
      } catch {
        campaign = {};
      }
    } else {
      const content = aiData.choices?.[0]?.message?.content || "";
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        campaign = JSON.parse(jsonMatch[0]);
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
        generated_title: typeof campaign?.title === "string" ? campaign.title : null,
        target_pages: Array.isArray(campaign?.target_pages) ? campaign.target_pages : [],
      },
    });

    return jsonResponse(campaign, 200, corsHeaders);
  } catch (error) {
    console.error("generate-campaign error:", error);
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
