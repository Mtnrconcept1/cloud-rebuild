import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const REVIEW_COMMENTS_FR = [
  "Excellent restaurant, cuisine raffinée et service impeccable. On y retourne avec plaisir !",
  "Très bon rapport qualité-prix. Les plats sont généreux et savoureux.",
  "Cadre agréable et ambiance chaleureuse. Le personnel est aux petits soins.",
  "Découverte culinaire incroyable ! Chaque plat était une surprise.",
  "Service un peu lent mais la qualité des plats compense largement.",
  "Nous avons adoré la fondue, un vrai délice ! Ambiance typiquement suisse.",
  "Les portions sont généreuses et les prix raisonnables pour Genève.",
  "Un de mes restaurants préférés à Genève. Toujours constant dans la qualité.",
  "Belle terrasse en été avec vue. La carte change régulièrement, c'est top !",
  "Parfait pour un dîner en amoureux. Cuisine créative et présentation soignée.",
  "Les desserts sont exceptionnels, surtout le fondant au chocolat.",
  "Accueil très sympathique. On se sent comme à la maison.",
  "Superbe expérience gastronomique. Le menu dégustation vaut le détour.",
  "Bon restaurant de quartier. Simple mais efficace, je recommande.",
  "La fraîcheur des ingrédients se ressent dans chaque bouchée.",
  "Un peu bruyant en soirée mais la nourriture est excellente.",
  "Service rapide et professionnel. Idéal pour une pause déjeuner.",
  "Les pâtes fraîches maison sont à tomber ! Un vrai régal.",
  "Carte des vins impressionnante avec de belles références suisses.",
  "Mention spéciale pour le chef qui est venu nous saluer. Très appréciable.",
  "Cuisine authentique et savoureuse. On sent le savoir-faire du chef.",
  "Le brunch du dimanche est fantastique. Réservation indispensable !",
  "Plats bien assaisonnés et joliment présentés. Une adresse à retenir.",
  "Super ambiance le soir avec musique live. La cuisine est à la hauteur.",
  "Vegetarian options were great! Finally a place that takes veggie food seriously.",
  "Les sushis sont parmi les meilleurs de Genève. Ultra frais.",
  "Très belle carte et service attentionné. Un peu cher mais justifié.",
  "La qualité est au rendez-vous à chaque visite. Notre QG du vendredi.",
  "Excellent choix pour les groupes. Le menu partagé est parfait.",
  "J'y vais souvent pour le lunch. Rapport qualité-prix imbattable.",
];

const REVIEWER_NAMES = [
  "Marie L.", "Thomas B.", "Sophie D.", "Antoine M.", "Julie R.",
  "Pierre C.", "Camille V.", "Lucas G.", "Emma F.", "Hugo P.",
  "Léa S.", "Maxime T.", "Chloé N.", "Nicolas H.", "Laura K.",
  "Alexandre D.", "Manon J.", "Vincent W.", "Sarah A.", "Julien E.",
  "Clara M.", "Romain B.", "Inès L.", "Paul V.", "Charlotte R.",
  "David F.", "Anaïs G.", "Mathieu S.", "Louise C.", "Olivier T.",
];

function randomInt(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomFloat(min: number, max: number, decimals = 1) {
  return parseFloat((Math.random() * (max - min) + min).toFixed(decimals));
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
  const FIRECRAWL_API_KEY = Deno.env.get("FIRECRAWL_API_KEY");

  try {
    // Get all restaurants
    const { data: restaurants } = await supabase
      .from("restaurants")
      .select("id, name, cuisine_type, image_url, city, rating")
      .eq("is_active", true);

    if (!restaurants || restaurants.length === 0) {
      return new Response(
        JSON.stringify({ success: false, error: "No restaurants found" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check which restaurants already have reviews
    const { data: existingReviews } = await supabase
      .from("reviews")
      .select("restaurant_id");
    
    const restaurantsWithReviews = new Set((existingReviews || []).map((r: any) => r.restaurant_id));

    // Check which restaurants already have media
    const { data: existingMedia } = await supabase
      .from("restaurant_media")
      .select("restaurant_id");
    
    const restaurantsWithMedia = new Set((existingMedia || []).map((r: any) => r.restaurant_id));

    let reviewsAdded = 0;
    let photosAdded = 0;
    let imagesUpdated = 0;

    // Get a demo user to attach reviews to
    const { data: profiles } = await supabase.from("profiles").select("user_id").limit(10);
    const userIds = (profiles || []).map((p: any) => p.user_id);
    
    // If no users exist, create a demo client
    if (userIds.length === 0) {
      const { data: demoUser } = await supabase.auth.admin.createUser({
        email: "demo-client@bitebook.ch",
        password: "DemoClient2024!",
        email_confirm: true,
        user_metadata: { full_name: "Client Démo" },
      });
      if (demoUser?.user) {
        userIds.push(demoUser.user.id);
      }
    }

    // --- STEP 1: Scrape photos via Firecrawl ---
    if (FIRECRAWL_API_KEY) {
      // Get restaurants needing images (no image or default placeholder)
      const needsImage = restaurants.filter(
        (r) => !r.image_url || r.image_url.includes("placeholder") || r.image_url.includes("unsplash.com/photo-1517248135467")
      );

      for (const restaurant of needsImage.slice(0, 5)) {
        try {
          const searchResponse = await fetch("https://api.firecrawl.dev/v1/search", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${FIRECRAWL_API_KEY}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              query: `${restaurant.name} restaurant ${restaurant.city || "Genève"} photo`,
              limit: 3,
              lang: "fr",
              country: "ch",
              scrapeOptions: { formats: ["markdown", "links"] },
            }),
          });

          const searchData = await searchResponse.json();
          const results = searchData.data || [];

          // Extract image URLs from results
          for (const result of results) {
            const markdown = result.markdown || "";
            const imgMatches = markdown.match(/!\[.*?\]\((https?:\/\/[^\s)]+\.(jpg|jpeg|png|webp)[^\s)]*)\)/gi) || [];
            
            for (const match of imgMatches.slice(0, 3)) {
              const urlMatch = match.match(/\((https?:\/\/[^\s)]+)\)/);
              if (urlMatch && urlMatch[1]) {
                const imgUrl = urlMatch[1];
                // Skip tiny icons and logos
                if (imgUrl.includes("logo") || imgUrl.includes("icon") || imgUrl.includes("favicon")) continue;
                
                // Add to restaurant_media
                if (!restaurantsWithMedia.has(restaurant.id)) {
                  await supabase.from("restaurant_media").insert({
                    restaurant_id: restaurant.id,
                    media_url: imgUrl,
                    media_type: "photo",
                    alt_text: `Photo de ${restaurant.name}`,
                    position: photosAdded % 5,
                    is_cover: photosAdded === 0,
                  });
                  photosAdded++;
                }

                // Update main image if restaurant doesn't have one
                if (!restaurant.image_url || restaurant.image_url.includes("placeholder")) {
                  await supabase
                    .from("restaurants")
                    .update({ image_url: imgUrl })
                    .eq("id", restaurant.id);
                  imagesUpdated++;
                  break; // Only need one main image
                }
              }
            }
          }
        } catch (e) {
          console.error(`Firecrawl error for ${restaurant.name}:`, e);
        }
      }
    }

    // --- STEP 2: Generate reviews for restaurants without them ---
    const reviewsToInsert: any[] = [];
    const usedComments = new Set<number>();

    for (const restaurant of restaurants) {
      if (restaurantsWithReviews.has(restaurant.id)) continue;
      if (userIds.length === 0) continue;

      const numReviews = randomInt(3, 12);
      const baseRating = (restaurant.rating || 4) * 2; // Convert to /10 scale

      for (let i = 0; i < numReviews; i++) {
        // Pick a comment that hasn't been used for this restaurant
        let commentIdx: number;
        do {
          commentIdx = randomInt(0, REVIEW_COMMENTS_FR.length - 1);
        } while (usedComments.has(commentIdx) && usedComments.size < REVIEW_COMMENTS_FR.length);
        usedComments.add(commentIdx);

        // Generate rating around the restaurant's base rating
        const overallRating = Math.min(10, Math.max(1, Math.round(baseRating + randomFloat(-2, 1.5, 0))));
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

      // Reset used comments for next restaurant
      usedComments.clear();
    }

    // Insert reviews in batches
    if (reviewsToInsert.length > 0) {
      const batchSize = 50;
      for (let i = 0; i < reviewsToInsert.length; i += batchSize) {
        const batch = reviewsToInsert.slice(i, i + batchSize);
        const { error } = await supabase.from("reviews").insert(batch);
        if (error) {
          console.error("Review insert error:", error);
        } else {
          reviewsAdded += batch.length;
        }
      }

      // Recompute review stats for enriched restaurants
      const enrichedIds = new Set(reviewsToInsert.map((r) => r.restaurant_id));
      for (const rid of enrichedIds) {
        await supabase.rpc("recompute_restaurant_review_stats", { p_restaurant_id: rid });
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        reviewsAdded,
        photosAdded,
        imagesUpdated,
        totalRestaurants: restaurants.length,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error:", error);
    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
