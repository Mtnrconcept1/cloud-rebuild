import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const REVIEW_COMMENTS_FR = [
  "Excellent restaurant, cuisine raffinée et service impeccable !",
  "Très bon rapport qualité-prix. Les plats sont généreux.",
  "Cadre agréable et ambiance chaleureuse.",
  "Découverte culinaire incroyable !",
  "Service un peu lent mais la qualité compense.",
  "Nous avons adoré, un vrai délice !",
  "Portions généreuses et prix raisonnables pour Genève.",
  "Un de mes restaurants préférés à Genève.",
  "Belle terrasse en été. La carte change régulièrement.",
  "Parfait pour un dîner en amoureux.",
  "Les desserts sont exceptionnels.",
  "Accueil très sympathique.",
  "Superbe expérience gastronomique.",
  "Bon restaurant de quartier, je recommande.",
  "La fraîcheur des ingrédients se ressent.",
  "Un peu bruyant mais la nourriture est excellente.",
  "Service rapide et professionnel.",
  "Les pâtes fraîches sont à tomber !",
  "Carte des vins impressionnante.",
  "Le chef est venu nous saluer, très appréciable.",
  "Cuisine authentique et savoureuse.",
  "Le brunch du dimanche est fantastique.",
  "Plats bien assaisonnés et joliment présentés.",
  "Super ambiance le soir.",
  "Les sushis sont parmi les meilleurs de Genève.",
  "Très belle carte et service attentionné.",
  "Notre QG du vendredi soir.",
  "Excellent choix pour les groupes.",
  "J'y vais souvent pour le lunch.",
  "Rapport qualité-prix imbattable.",
];

function randomInt(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomDate(daysBack: number): string {
  const d = new Date();
  d.setDate(d.getDate() - randomInt(1, daysBack));
  d.setHours(randomInt(10, 22), randomInt(0, 59));
  return d.toISOString();
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, supabaseKey);

  try {
    const body = await req.json().catch(() => ({}));
    const mode = body.mode || "reviews"; // "reviews" or "photos"
    
    console.log("Starting enrich-restaurants, mode:", mode);

    // Get all active restaurants
    const { data: restaurants, error: restErr } = await supabase
      .from("restaurants")
      .select("id, name, cuisine_type, image_url, city, rating")
      .eq("is_active", true);

    if (restErr) throw new Error("Failed to fetch restaurants: " + restErr.message);
    console.log("Found", restaurants?.length, "restaurants");

    if (!restaurants || restaurants.length === 0) {
      return new Response(
        JSON.stringify({ success: true, message: "No restaurants" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (mode === "reviews") {
      // Check existing reviews
      const { data: existingReviews } = await supabase
        .from("reviews")
        .select("restaurant_id");
      const restaurantsWithReviews = new Set((existingReviews || []).map((r: any) => r.restaurant_id));
      console.log("Restaurants with reviews:", restaurantsWithReviews.size);

      // Get user IDs for reviews
      const { data: profiles } = await supabase.from("profiles").select("user_id").limit(10);
      const userIds = (profiles || []).map((p: any) => p.user_id);
      console.log("Available user IDs:", userIds.length);

      if (userIds.length === 0) {
        return new Response(
          JSON.stringify({ success: false, error: "No users found. Create an account first." }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Generate reviews for restaurants without them
      const reviewsToInsert: any[] = [];

      for (const restaurant of restaurants) {
        if (restaurantsWithReviews.has(restaurant.id)) continue;

        const numReviews = randomInt(3, 8);
        const baseRating = ((restaurant.rating || 4) * 2);

        for (let i = 0; i < numReviews; i++) {
          const commentIdx = randomInt(0, REVIEW_COMMENTS_FR.length - 1);
          const overallRating = Math.min(10, Math.max(1, Math.round(baseRating + (Math.random() * 3 - 1.5))));
          const serviceRating = Math.min(10, Math.max(1, overallRating + randomInt(-1, 1)));
          const qualityRating = Math.min(10, Math.max(1, overallRating + randomInt(-1, 1)));
          const speedRating = Math.min(10, Math.max(1, overallRating + randomInt(-2, 1)));
          const userId = userIds[randomInt(0, userIds.length - 1)];

          reviewsToInsert.push({
            restaurant_id: restaurant.id,
            user_id: userId,
            rating: overallRating,
            service_rating: serviceRating,
            quality_rating: qualityRating,
            speed_rating: speedRating,
            comment: REVIEW_COMMENTS_FR[commentIdx],
            created_at: randomDate(180),
          });
        }
      }

      console.log("Reviews to insert:", reviewsToInsert.length);

      // Insert reviews in batches
      let reviewsAdded = 0;
      const batchSize = 100;
      for (let i = 0; i < reviewsToInsert.length; i += batchSize) {
        const batch = reviewsToInsert.slice(i, i + batchSize);
        const { error } = await supabase.from("reviews").insert(batch);
        if (error) {
          console.error("Review insert error at batch", i, ":", error.message);
        } else {
          reviewsAdded += batch.length;
        }
      }

      console.log("Reviews added:", reviewsAdded);

      // Recompute review stats for top 50 restaurants (to avoid timeout)
      const enrichedIds = [...new Set(reviewsToInsert.map((r) => r.restaurant_id))].slice(0, 50);
      for (const rid of enrichedIds) {
        await supabase.rpc("recompute_restaurant_review_stats", { p_restaurant_id: rid });
      }

      return new Response(
        JSON.stringify({ success: true, reviewsAdded, totalRestaurants: restaurants.length }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (mode === "photos") {
      const FIRECRAWL_API_KEY = Deno.env.get("FIRECRAWL_API_KEY");
      if (!FIRECRAWL_API_KEY) {
        return new Response(
          JSON.stringify({ success: false, error: "FIRECRAWL_API_KEY not configured" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const needsImage = restaurants.filter(
        (r) => !r.image_url || r.image_url.includes("placeholder") || r.image_url.includes("unsplash.com/photo-1517248135467")
      ).slice(0, 5);

      console.log("Restaurants needing images:", needsImage.length);
      let photosAdded = 0;

      for (const restaurant of needsImage) {
        try {
          console.log("Searching images for:", restaurant.name);
          const searchResponse = await fetch("https://api.firecrawl.dev/v1/search", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${FIRECRAWL_API_KEY}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              query: `${restaurant.name} restaurant ${restaurant.city || "Genève"} photos`,
              limit: 2,
              lang: "fr",
              country: "ch",
              scrapeOptions: { formats: ["markdown"] },
            }),
          });

          const searchData = await searchResponse.json();
          if (!searchResponse.ok) {
            console.error("Firecrawl error:", JSON.stringify(searchData));
            continue;
          }

          const results = searchData.data || [];
          for (const result of results) {
            const markdown = result.markdown || "";
            const imgMatches = markdown.match(/!\[.*?\]\((https?:\/\/[^\s)]+\.(jpg|jpeg|png|webp)[^\s)]*)\)/gi) || [];

            for (const match of imgMatches.slice(0, 2)) {
              const urlMatch = match.match(/\((https?:\/\/[^\s)]+)\)/);
              if (urlMatch?.[1]) {
                const imgUrl = urlMatch[1];
                if (imgUrl.includes("logo") || imgUrl.includes("icon") || imgUrl.includes("favicon") || imgUrl.length > 500) continue;

                await supabase.from("restaurant_media").insert({
                  restaurant_id: restaurant.id,
                  media_url: imgUrl,
                  media_type: "photo",
                  alt_text: `Photo de ${restaurant.name}`,
                  position: photosAdded % 5,
                  is_cover: photosAdded === 0,
                });
                photosAdded++;

                // Set as main image if none
                if (!restaurant.image_url || restaurant.image_url.includes("placeholder")) {
                  await supabase.from("restaurants").update({ image_url: imgUrl }).eq("id", restaurant.id);
                }
                break;
              }
            }
          }
        } catch (e) {
          console.error(`Error for ${restaurant.name}:`, e);
        }
      }

      return new Response(
        JSON.stringify({ success: true, photosAdded }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (mode === "product_photos") {
      const FIRECRAWL_API_KEY = Deno.env.get("FIRECRAWL_API_KEY");
      if (!FIRECRAWL_API_KEY) {
        return new Response(
          JSON.stringify({ success: false, error: "FIRECRAWL_API_KEY not configured" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const { data: menuItems, error: menuErr } = await supabase
        .from("menu_items")
        .select("id, name, category, restaurant_id, image_url")
        .eq("is_available", true)
        .or("image_url.is.null,image_url.eq.")
        .limit(8);

      if (menuErr) throw new Error("Failed to fetch menu items: " + menuErr.message);

      let productPhotosAdded = 0;

      for (const item of menuItems || []) {
        try {
          const searchResponse = await fetch("https://api.firecrawl.dev/v1/search", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${FIRECRAWL_API_KEY}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              query: `${item.name} ${item.category || "plat"} photo food`,
              limit: 2,
              lang: "fr",
              country: "ch",
              scrapeOptions: { formats: ["markdown"] },
            }),
          });

          const searchData = await searchResponse.json();
          if (!searchResponse.ok) continue;

          const results = searchData.data || [];
          let selectedImg: string | null = null;

          for (const result of results) {
            const markdown = result.markdown || "";
            const imgMatches = markdown.match(/!\[.*?\]\((https?:\/\/[^\s)]+\.(jpg|jpeg|png|webp)[^\s)]*)\)/gi) || [];
            for (const match of imgMatches) {
              const urlMatch = match.match(/\((https?:\/\/[^\s)]+)\)/);
              const candidate = urlMatch?.[1];
              if (!candidate) continue;
              if (candidate.includes("logo") || candidate.includes("icon") || candidate.includes("favicon") || candidate.length > 500) continue;
              selectedImg = candidate;
              break;
            }
            if (selectedImg) break;
          }

          if (selectedImg) {
            const { error } = await supabase.from("menu_items").update({ image_url: selectedImg }).eq("id", item.id);
            if (!error) productPhotosAdded++;
          }
        } catch (e) {
          console.error(`Error for menu item ${item.name}:`, e);
        }
      }

      return new Response(
        JSON.stringify({ success: true, productPhotosAdded }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ success: false, error: "Invalid mode. Use 'reviews', 'photos' or 'product_photos'" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error:", error);
    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
