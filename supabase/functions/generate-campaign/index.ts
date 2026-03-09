import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { restaurantId } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const authHeader = req.headers.get("Authorization");
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Verify user
    let userId: string | null = null;
    if (authHeader) {
      const userClient = createClient(supabaseUrl, supabaseKey, {
        global: { headers: { Authorization: authHeader } },
      });
      const { data: { user } } = await userClient.auth.getUser();
      userId = user?.id || null;
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    // Verify ownership
    const { data: restaurant } = await adminClient
      .from("restaurants")
      .select("*")
      .eq("id", restaurantId)
      .single();

    if (!restaurant) {
      return new Response(JSON.stringify({ error: "Restaurant introuvable" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (userId && restaurant.owner_id !== userId) {
      return new Response(JSON.stringify({ error: "Non autorisé" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Gather restaurant data
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
    const completedOrders = orders.filter((o: any) => o.status !== "cancelled");
    const totalRevenue = completedOrders.reduce((s: number, o: any) => s + Number(o.total_amount || 0), 0);
    const avgTicket = completedOrders.length > 0 ? totalRevenue / completedOrders.length : 0;
    const reviews = reviewsRes.data || [];
    const avgRating = reviews.length > 0
      ? reviews.reduce((s: number, r: any) => s + Number(r.rating), 0) / reviews.length
      : 0;
    const menu = menuRes.data || [];
    const categories = [...new Set(menu.map((m: any) => m.category).filter(Boolean))];
    const pastCampaigns = campaignsRes.data || [];

    const contextSummary = `
Restaurant: ${restaurant.name}
Cuisine: ${restaurant.cuisine_type || "Non spécifié"}
Ville: ${restaurant.city}
Note moyenne: ${avgRating.toFixed(1)}/5 (${reviews.length} avis)
Commandes 30j: ${completedOrders.length} (CA: ${totalRevenue.toFixed(0)} CHF, panier moyen: ${avgTicket.toFixed(0)} CHF)
Menu: ${menu.length} plats dans ${categories.length} catégories (${categories.join(", ")})
Plats populaires: ${menu.slice(0, 5).map((m: any) => `${m.name} (${m.price} CHF)`).join(", ")}
Ventes flash actives: ${(flashRes.data || []).length}
Offres anti-gaspi actives: ${(antiWasteRes.data || []).length}
Campagnes passées: ${pastCampaigns.length} (${pastCampaigns.filter((c: any) => c.status === "active").length} actives)
${pastCampaigns.length > 0 ? `Perf campagnes: ${pastCampaigns.reduce((s: number, c: any) => s + (c.impressions || 0), 0)} impressions, ${pastCampaigns.reduce((s: number, c: any) => s + (c.clicks || 0), 0)} clics, ${pastCampaigns.reduce((s: number, c: any) => s + (c.conversions || 0), 0)} conversions` : ""}
Avis récents négatifs: ${reviews.filter((r: any) => r.rating <= 3).map((r: any) => r.comment).filter(Boolean).slice(0, 3).join(" | ") || "Aucun"}
`;

    const systemPrompt = `Tu es un expert en marketing digital pour la restauration. Tu dois générer UNE campagne publicitaire optimisée pour le restaurant ci-dessous.

CONTEXTE DU RESTAURANT:
${contextSummary}

Tu dois retourner un JSON valide avec exactement ces champs:
{
  "title": "Titre accrocheur de la campagne (max 60 caractères)",
  "body": "Description engageante de la campagne (max 200 caractères). Doit donner envie et être actionnable.",
  "type": "boost",
  "target_pages": ["home", "search", "flash_sales", "anti_waste"],
  "total_budget": number (en CHF, adapté au CA du restaurant),
  "budget_daily": number (en CHF)
}

RÈGLES:
- Le titre doit être accrocheur, utiliser des emojis si pertinent
- La description doit créer l'urgence ou la curiosité
- Choisis les target_pages les plus pertinentes (2-3 max):
  - "home" pour visibilité générale
  - "search" pour capter les recherches
  - "flash_sales" si le restaurant fait des ventes flash
  - "anti_waste" si le restaurant a des offres anti-gaspi
- Le budget doit être réaliste (5-15% du CA mensuel)
- Adapte le message aux forces du restaurant (note, cuisine, promotions)
- Si la note est basse, focus sur une offre spéciale pour reconquérir
- Si le panier moyen est bas, propose une offre qui l'augmente

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
          { role: "user", content: "Génère une campagne publicitaire optimisée pour ce restaurant." },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "create_campaign",
              description: "Crée une campagne publicitaire optimisée",
              parameters: {
                type: "object",
                properties: {
                  title: { type: "string", description: "Titre accrocheur (max 60 chars)" },
                  body: { type: "string", description: "Description engageante (max 200 chars)" },
                  type: { type: "string", enum: ["boost", "banner", "push"] },
                  target_pages: {
                    type: "array",
                    items: { type: "string", enum: ["home", "search", "flash_sales", "anti_waste"] },
                  },
                  total_budget: { type: "number", description: "Budget total en CHF" },
                  budget_daily: { type: "number", description: "Budget quotidien en CHF" },
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
      const status = aiResponse.status;
      if (status === 429) {
        return new Response(JSON.stringify({ error: "Trop de requêtes, réessayez dans quelques instants." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (status === 402) {
        return new Response(JSON.stringify({ error: "Crédits IA insuffisants." }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      throw new Error("Erreur du service IA");
    }

    const aiData = await aiResponse.json();

    // Extract from tool call
    let campaign: any = {};
    const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];
    if (toolCall?.function?.arguments) {
      try {
        campaign = JSON.parse(toolCall.function.arguments);
      } catch {
        // Fallback: try content
        const content = aiData.choices?.[0]?.message?.content || "";
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        if (jsonMatch) campaign = JSON.parse(jsonMatch[0]);
      }
    } else {
      // Fallback: parse content
      const content = aiData.choices?.[0]?.message?.content || "";
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) campaign = JSON.parse(jsonMatch[0]);
    }

    return new Response(JSON.stringify(campaign), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("generate-campaign error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Erreur inconnue" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
