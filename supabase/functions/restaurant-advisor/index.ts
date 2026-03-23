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
    const { messages, restaurantId } = await req.json();

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Non autorisé" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Create supabase client with user token to verify ownership
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const userClient = createClient(supabaseUrl, supabaseKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: authError } = await userClient.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Non autorisé" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Use service role to gather all data
    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    // Verify restaurant ownership
    const { data: restaurant, error: restError } = await adminClient
      .from("restaurants")
      .select("*")
      .eq("id", restaurantId)
      .eq("owner_id", user.id)
      .single();

    if (restError || !restaurant) {
      return new Response(JSON.stringify({ error: "Restaurant introuvable" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Gather all restaurant data in parallel
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();

    const [
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
      // Orders (last 30 days)
      adminClient
        .from("orders")
        .select("id, total_amount, status, created_at, delivery_fee, discount_amount")
        .eq("restaurant_id", restaurantId)
        .gte("created_at", thirtyDaysAgo)
        .order("created_at", { ascending: false }),
      // Reservations (last 30 days)
      adminClient
        .from("reservations")
        .select("id, date, time, party_size, status, feature, total_amount, created_at")
        .eq("restaurant_id", restaurantId)
        .gte("created_at", thirtyDaysAgo)
        .order("created_at", { ascending: false }),
      // Reviews
      adminClient
        .from("reviews")
        .select("id, rating, quality_rating, service_rating, speed_rating, comment, created_at")
        .eq("restaurant_id", restaurantId)
        .order("created_at", { ascending: false })
        .limit(50),
      // Menu items
      adminClient
        .from("menu_items")
        .select("id, name, price, category, is_available, is_exclusive, image_url")
        .eq("restaurant_id", restaurantId),
      // Ad campaigns
      adminClient
        .from("ad_campaigns")
        .select("id, title, type, status, impressions, clicks, conversions, spent, total_budget, starts_at, ends_at")
        .eq("restaurant_id", restaurantId)
        .order("created_at", { ascending: false })
        .limit(10),
      // Flash sales
      adminClient
        .from("flash_sales")
        .select("id, title, original_price, discounted_price, quantity_available, is_active, sale_date")
        .eq("restaurant_id", restaurantId)
        .order("created_at", { ascending: false })
        .limit(10),
      // Photos
      adminClient
        .from("restaurant_media")
        .select("id, media_url, media_type, is_cover, alt_text")
        .eq("restaurant_id", restaurantId),
      // Anti-waste offers
      adminClient
        .from("anti_waste_offers")
        .select("id, title, original_price, discounted_price, quantity_available, is_active")
        .eq("restaurant_id", restaurantId)
        .limit(10),
      // Meal formulas
      adminClient
        .from("meal_formulas")
        .select("id, name, discount_percent, is_active, applies_to")
        .eq("restaurant_id", restaurantId),
      // Promotions
      adminClient
        .from("restaurant_promotions")
        .select("id, name, promotion_type, promotion_value, active, start_at, end_at, target")
        .eq("restaurant_id", restaurantId)
        .limit(10),
    ]);

    // Compute analytics
    const orders = ordersResult.data || [];
    const reservations = reservationsResult.data || [];
    const reviews = reviewsResult.data || [];
    const menuItems = menuResult.data || [];
    const campaigns = campaignsResult.data || [];
    const flashSales = flashSalesResult.data || [];
    const photos = photosResult.data || [];
    const antiWaste = antiWasteResult.data || [];
    const formulas = formulasResult.data || [];
    const promotions = promotionsResult.data || [];

    const totalRevenue = orders.reduce((s, o) => s + Number(o.total_amount || 0), 0);
    const avgTicket = orders.length > 0 ? totalRevenue / orders.length : 0;
    const cancelledOrders = orders.filter((o) => o.status === "cancelled").length;
    const cancelRate = orders.length > 0 ? (cancelledOrders / orders.length * 100).toFixed(1) : "0";
    const avgRating = reviews.length > 0 ? (reviews.reduce((s, r) => s + r.rating, 0) / reviews.length).toFixed(1) : "N/A";
    const avgQuality = reviews.length > 0 ? (reviews.reduce((s, r) => s + r.quality_rating, 0) / reviews.length).toFixed(1) : "N/A";
    const avgService = reviews.length > 0 ? (reviews.reduce((s, r) => s + r.service_rating, 0) / reviews.length).toFixed(1) : "N/A";
    const avgSpeed = reviews.length > 0 ? (reviews.reduce((s, r) => s + r.speed_rating, 0) / reviews.length).toFixed(1) : "N/A";

    const totalImpressions = campaigns.reduce((s, c) => s + (c.impressions || 0), 0);
    const totalClicks = campaigns.reduce((s, c) => s + (c.clicks || 0), 0);
    const totalConversions = campaigns.reduce((s, c) => s + (c.conversions || 0), 0);
    const ctr = totalImpressions > 0 ? (totalClicks / totalImpressions * 100).toFixed(2) : "0";
    const conversionRate = totalClicks > 0 ? (totalConversions / totalClicks * 100).toFixed(2) : "0";

    const recentReviews = reviews.slice(0, 5).map((r) => ({
      rating: r.rating,
      comment: r.comment || "(pas de commentaire)",
      date: r.created_at,
    }));

    const menuCategories = [...new Set(menuItems.map((m) => m.category || "Sans catégorie"))];
    const itemsWithoutImage = menuItems.filter((m) => !m.image_url).length;
    const unavailableItems = menuItems.filter((m) => !m.is_available).length;

    const contextData = {
      restaurant: {
        name: restaurant.name,
        city: restaurant.city,
        cuisine_type: restaurant.cuisine_type,
        rating: restaurant.rating,
        review_count: restaurant.review_count,
        price_range: restaurant.price_range,
        delivery_available: restaurant.delivery_available,
        delivery_fee: restaurant.delivery_fee,
        min_order_amount: restaurant.min_order_amount,
      },
      sales_30d: {
        total_orders: orders.length,
        total_revenue: totalRevenue.toFixed(2) + " CHF",
        average_ticket: avgTicket.toFixed(2) + " CHF",
        cancel_rate: cancelRate + "%",
        cancelled_orders: cancelledOrders,
        orders_by_status: orders.reduce((acc, o) => {
          acc[o.status] = (acc[o.status] || 0) + 1;
          return acc;
        }, {} as Record<string, number>),
      },
      reservations_30d: {
        total: reservations.length,
        by_feature: reservations.reduce((acc, r) => {
          acc[r.feature] = (acc[r.feature] || 0) + 1;
          return acc;
        }, {} as Record<string, number>),
        by_status: reservations.reduce((acc, r) => {
          acc[r.status] = (acc[r.status] || 0) + 1;
          return acc;
        }, {} as Record<string, number>),
        avg_party_size: reservations.length > 0
          ? (reservations.reduce((s, r) => s + r.party_size, 0) / reservations.length).toFixed(1)
          : "0",
      },
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
        price_range: menuItems.length > 0
          ? { min: Math.min(...menuItems.map((m) => Number(m.price))).toFixed(2), max: Math.max(...menuItems.map((m) => Number(m.price))).toFixed(2) }
          : null,
      },
      campaigns: {
        total: campaigns.length,
        active: campaigns.filter((c) => c.status === "active").length,
        total_impressions: totalImpressions,
        total_clicks: totalClicks,
        total_conversions: totalConversions,
        ctr: ctr + "%",
        conversion_rate: conversionRate + "%",
        total_spent: campaigns.reduce((s, c) => s + Number(c.spent || 0), 0).toFixed(2) + " CHF",
      },
      photos: {
        total: photos.length,
        has_cover: photos.some((p) => p.is_cover),
        types: photos.reduce((acc, p) => {
          acc[p.media_type] = (acc[p.media_type] || 0) + 1;
          return acc;
        }, {} as Record<string, number>),
      },
      flash_sales: {
        total: flashSales.length,
        active: flashSales.filter((f) => f.is_active).length,
      },
      anti_waste: {
        total: antiWaste.length,
        active: antiWaste.filter((a) => a.is_active).length,
      },
      formulas: {
        total: formulas.length,
        active: formulas.filter((f) => f.is_active).length,
      },
      promotions: {
        total: promotions.length,
        active: promotions.filter((p) => p.active).length,
      },
    };

    const systemPrompt = `Tu es l'assistant IA expert en restauration de la plateforme Tok. Tu aides les restaurateurs à optimiser leurs ventes, améliorer leur visibilité et augmenter leur chiffre d'affaires.

Tu as accès aux données complètes du restaurant "${restaurant.name}" :

${JSON.stringify(contextData, null, 2)}

RÈGLES :
- Réponds toujours en français
- Sois concis, actionnable et bienveillant
- Donne des conseils concrets basés sur les VRAIES données (pas de généralités vagues)
- Utilise des émojis pour structurer tes réponses
- Formate en Markdown avec des titres, listes et gras pour la clarté
- Si on te demande des données que tu n'as pas, dis-le honnêtement
- Compare les performances aux bonnes pratiques du secteur de la restauration
- Propose des actions prioritaires classées par impact potentiel
- Mentionne les fonctionnalités de la plateforme (ventes flash, anti-gaspi, formules, campagnes, Zéro Attente, Chef's Table) quand c'est pertinent

DOMAINES D'EXPERTISE :
1. Analyse des ventes et du panier moyen
2. Optimisation du menu (prix, photos, catégories)
3. Gestion des réservations et taux de remplissage
4. Stratégie de campagnes marketing et ROI
5. Amélioration de la satisfaction client (avis)
6. Utilisation des promotions et formules
7. Stratégie anti-gaspi et ventes flash
8. Optimisation des photos et de la page restaurant`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: systemPrompt },
          ...messages,
        ],
        stream: true,
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Trop de requêtes. Réessayez dans quelques instants." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "Crédits IA épuisés. Veuillez recharger votre compte." }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const errorText = await response.text();
      console.error("AI gateway error:", response.status, errorText);
      return new Response(JSON.stringify({ error: "Erreur du service IA" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(response.body, {
      headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
    });
  } catch (e) {
    console.error("restaurant-advisor error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Erreur inconnue" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
