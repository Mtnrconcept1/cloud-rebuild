import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const FIRECRAWL_API_KEY = Deno.env.get("FIRECRAWL_API_KEY");
  if (!FIRECRAWL_API_KEY) {
    return new Response(
      JSON.stringify({ success: false, error: "FIRECRAWL_API_KEY not configured" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, supabaseKey);

  try {
    // Step 1: Search for Geneva restaurants using Firecrawl
    const searchQueries = [
      "meilleurs restaurants Genève Suisse",
      "restaurants gastronomiques Genève",
      "restaurants Carouge Genève",
      "brasseries bistrots Genève centre",
      "restaurants Eaux-Vives Plainpalais Genève",
    ];

    const allRestaurants: any[] = [];

    for (const query of searchQueries) {
      console.log(`Searching: ${query}`);

      const searchResponse = await fetch("https://api.firecrawl.dev/v1/search", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${FIRECRAWL_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          query,
          limit: 5,
          lang: "fr",
          country: "ch",
          scrapeOptions: { formats: ["markdown"] },
        }),
      });

      const searchData = await searchResponse.json();

      if (!searchResponse.ok) {
        console.error(`Search failed for "${query}":`, searchData);
        continue;
      }

      const results = searchData.data || [];
      console.log(`Found ${results.length} results for "${query}"`);

      for (const result of results) {
        const markdown = result.markdown || "";
        const title = result.title || "";
        const url = result.url || "";

        // Extract restaurant info from the scraped content
        const extracted = extractRestaurantInfo(markdown, title, url);
        if (extracted.length > 0) {
          allRestaurants.push(...extracted);
        }
      }

      // Small delay between searches
      await new Promise((r) => setTimeout(r, 500));
    }

    // Deduplicate by name
    const seen = new Set<string>();
    const unique = allRestaurants.filter((r) => {
      const key = r.name.toLowerCase().trim();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    console.log(`Total unique restaurants found: ${unique.length}`);

    // If we didn't find enough from scraping, add well-known Geneva restaurants
    const knownRestaurants = getKnownGenevaRestaurants();
    for (const kr of knownRestaurants) {
      const key = kr.name.toLowerCase().trim();
      if (!seen.has(key)) {
        seen.add(key);
        unique.push(kr);
      }
    }

    // Step 2: Insert into database
    // We need a dummy owner_id - create a system user or use a placeholder
    // For now, we'll create restaurants with a placeholder owner
    let ownerId: string;

    // Check if there's any existing user we can use
    const { data: existingProfiles } = await supabase
      .from("profiles")
      .select("user_id")
      .limit(1);

    if (existingProfiles && existingProfiles.length > 0) {
      ownerId = existingProfiles[0].user_id;
    } else {
      // Create a system/demo user via auth admin
      const { data: authUser, error: authError } = await supabase.auth.admin.createUser({
        email: "demo-restaurateur@bitebook.ch",
        password: "DemoRestaurateur2024!",
        email_confirm: true,
        user_metadata: { full_name: "Restaurateur Démo" },
      });

      if (authError) {
        console.error("Error creating demo user:", authError);
        return new Response(
          JSON.stringify({ success: false, error: "Could not create demo owner: " + authError.message }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      ownerId = authUser.user.id;

      // Give them restaurateur role
      await supabase.from("user_roles").upsert({
        user_id: ownerId,
        role: "restaurateur",
      }, { onConflict: "user_id,role" });
    }

    const inserted: string[] = [];
    const errors: string[] = [];

    for (const restaurant of unique) {
      const { error: insertError } = await supabase.from("restaurants").insert({
        owner_id: ownerId,
        name: restaurant.name,
        description: restaurant.description || null,
        cuisine_type: restaurant.cuisine_type || null,
        address: restaurant.address,
        city: restaurant.city || "Genève",
        phone: restaurant.phone || null,
        image_url: restaurant.image_url || null,
        price_range: restaurant.price_range || 2,
        latitude: restaurant.latitude || null,
        longitude: restaurant.longitude || null,
        is_active: true,
        delivery_available: Math.random() > 0.5,
        delivery_fee: parseFloat((Math.random() * 5 + 2).toFixed(2)),
        min_order_amount: parseFloat((Math.random() * 15 + 10).toFixed(2)),
        rating: parseFloat((Math.random() * 1.5 + 3.5).toFixed(1)),
        review_count: Math.floor(Math.random() * 200 + 10),
      });

      if (insertError) {
        console.error(`Error inserting ${restaurant.name}:`, insertError);
        errors.push(`${restaurant.name}: ${insertError.message}`);
      } else {
        inserted.push(restaurant.name);
        console.log(`Inserted: ${restaurant.name}`);
      }
    }

    // Step 3: Add some menu items for each restaurant
    const { data: insertedRestaurants } = await supabase
      .from("restaurants")
      .select("id, cuisine_type, name")
      .eq("city", "Genève");

    if (insertedRestaurants) {
      for (const rest of insertedRestaurants) {
        const menuItems = generateMenuItems(rest.cuisine_type || "Européen");
        for (const item of menuItems) {
          await supabase.from("menu_items").insert({
            restaurant_id: rest.id,
            name: item.name,
            description: item.description,
            price: item.price,
            category: item.category,
            is_available: true,
          });
        }
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        inserted: inserted.length,
        errors: errors.length,
        restaurants: inserted,
        errorDetails: errors,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error:", error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

function extractRestaurantInfo(markdown: string, title: string, _url: string): any[] {
  const restaurants: any[] = [];

  // Try to extract restaurant names and details from markdown content
  const lines = markdown.split("\n");
  let currentName = "";
  let currentDesc = "";

  for (const line of lines) {
    // Look for restaurant name patterns (headers, bold text, numbered lists)
    const headerMatch = line.match(/^#{1,3}\s+(.+)/);
    const boldMatch = line.match(/\*\*(.+?)\*\*/);
    const numberedMatch = line.match(/^\d+[\.\)]\s+\*?\*?(.+?)\*?\*?\s*[-–]/);

    const nameCandidate = headerMatch?.[1] || boldMatch?.[1] || numberedMatch?.[1];

    if (nameCandidate && nameCandidate.length > 3 && nameCandidate.length < 60) {
      // Filter out non-restaurant headers
      const skip = /accueil|menu|contact|réserv|blog|article|guide|meilleur|top\s\d+|comment|notre|politique/i;
      if (!skip.test(nameCandidate)) {
        if (currentName) {
          restaurants.push({
            name: currentName.trim(),
            description: currentDesc.trim().slice(0, 300) || null,
            address: extractAddress(currentDesc) || "Genève, Suisse",
            city: "Genève",
            cuisine_type: extractCuisineType(currentDesc + " " + currentName),
            price_range: extractPriceRange(currentDesc),
          });
        }
        currentName = nameCandidate;
        currentDesc = "";
      }
    } else if (currentName && line.trim()) {
      currentDesc += " " + line.trim();
    }
  }

  // Push last one
  if (currentName) {
    restaurants.push({
      name: currentName.trim(),
      description: currentDesc.trim().slice(0, 300) || null,
      address: extractAddress(currentDesc) || "Genève, Suisse",
      city: "Genève",
      cuisine_type: extractCuisineType(currentDesc + " " + currentName),
      price_range: extractPriceRange(currentDesc),
    });
  }

  return restaurants;
}

function extractAddress(text: string): string | null {
  // Try common Geneva street patterns
  const match = text.match(
    /(\d+[\s,]*(?:rue|avenue|boulevard|place|quai|chemin|route|cours)\s+[A-Za-zÀ-ÿ\s\-']+(?:\d{4}\s+Genève)?)/i
  );
  if (match) return match[1].trim();

  const match2 = text.match(/(\d{4}\s+Genève)/i);
  if (match2) return match2[1];

  return null;
}

function extractCuisineType(text: string): string {
  const lower = text.toLowerCase();
  if (/japonais|sushi|ramen|izakaya/i.test(lower)) return "Japonais";
  if (/italien|pizza|pasta|trattoria|risotto/i.test(lower)) return "Italien";
  if (/français|bistrot|brasserie|gastronomique/i.test(lower)) return "Français";
  if (/libanais|mezzé|falafel/i.test(lower)) return "Libanais";
  if (/indien|curry|tandoori|naan/i.test(lower)) return "Indien";
  if (/thaï|pad thai|thai/i.test(lower)) return "Thaïlandais";
  if (/chinois|dim sum|cantonais/i.test(lower)) return "Chinois";
  if (/mexicain|tacos|burrito/i.test(lower)) return "Mexicain";
  if (/suisse|fondue|raclette|rösti/i.test(lower)) return "Suisse";
  if (/méditerranéen/i.test(lower)) return "Méditerranéen";
  if (/végétarien|vegan|végétalien/i.test(lower)) return "Végétarien";
  if (/burger|américain/i.test(lower)) return "Américain";
  return "Européen";
}

function extractPriceRange(text: string): number {
  const lower = text.toLowerCase();
  if (/gastronomique|étoilé|luxe|prestige/i.test(lower)) return 4;
  if (/haut de gamme|raffiné|fine dining/i.test(lower)) return 3;
  if (/bon marché|pas cher|économique|street food/i.test(lower)) return 1;
  return 2;
}

function getKnownGenevaRestaurants(): any[] {
  return [
    {
      name: "Le Chat-Botté",
      description: "Restaurant gastronomique au Beau-Rivage, cuisine française raffinée avec vue sur le lac Léman.",
      cuisine_type: "Français",
      address: "13 Quai du Mont-Blanc, 1201 Genève",
      city: "Genève",
      price_range: 4,
      latitude: 46.2088,
      longitude: 6.1507,
    },
    {
      name: "Café du Soleil",
      description: "Institution genevoise depuis 1891. La meilleure fondue de Genève dans un cadre authentique au Petit-Saconnex.",
      cuisine_type: "Suisse",
      address: "6 Place du Petit-Saconnex, 1209 Genève",
      city: "Genève",
      price_range: 2,
      latitude: 46.2197,
      longitude: 6.1328,
    },
    {
      name: "Bayview by Michel Roth",
      description: "Restaurant gastronomique étoilé Michelin à l'Hôtel Président Wilson. Cuisine française contemporaine d'exception.",
      cuisine_type: "Français",
      address: "47 Quai Wilson, 1211 Genève",
      city: "Genève",
      price_range: 4,
      latitude: 46.2149,
      longitude: 6.1542,
    },
    {
      name: "Chez Ma Cousine",
      description: "Chaîne locale populaire spécialisée dans le poulet rôti. Ambiance conviviale, prix doux, portions généreuses.",
      cuisine_type: "Européen",
      address: "6 Place du Bourg-de-Four, 1204 Genève",
      city: "Genève",
      price_range: 1,
      latitude: 46.2002,
      longitude: 6.1522,
    },
    {
      name: "Izumi",
      description: "Restaurant japonais contemporain à l'Hôtel Président Wilson. Sushi, sashimi et robatayaki d'exception.",
      cuisine_type: "Japonais",
      address: "47 Quai Wilson, 1211 Genève",
      city: "Genève",
      price_range: 4,
      latitude: 46.2149,
      longitude: 6.1542,
    },
    {
      name: "Brasserie du Molard",
      description: "Brasserie typiquement genevoise au cœur de la vieille ville. Spécialités locales et plats du jour.",
      cuisine_type: "Français",
      address: "Place du Molard, 1204 Genève",
      city: "Genève",
      price_range: 2,
      latitude: 46.2028,
      longitude: 6.1480,
    },
    {
      name: "La Bottega",
      description: "Authentique trattoria italienne à Carouge. Pâtes fraîches maison, pizzas au feu de bois et ambiance chaleureuse.",
      cuisine_type: "Italien",
      address: "24 Rue Saint-Joseph, 1227 Carouge",
      city: "Genève",
      price_range: 2,
      latitude: 46.1838,
      longitude: 6.1389,
    },
    {
      name: "Le Thé",
      description: "Restaurant thaïlandais réputé dans le quartier des Eaux-Vives. Cuisine authentique et épicée.",
      cuisine_type: "Thaïlandais",
      address: "3 Rue Ami-Lullin, 1207 Genève",
      city: "Genève",
      price_range: 2,
      latitude: 46.2013,
      longitude: 6.1590,
    },
    {
      name: "Al-Amir",
      description: "Restaurant libanais convivial avec mezzés généreux, grillades au charbon et ambiance orientale.",
      cuisine_type: "Libanais",
      address: "12 Rue de Zurich, 1201 Genève",
      city: "Genève",
      price_range: 2,
      latitude: 46.2100,
      longitude: 6.1470,
    },
    {
      name: "Hamburger Foundation",
      description: "Les meilleurs burgers artisanaux de Genève. Viande locale, buns maison et frites croustillantes.",
      cuisine_type: "Américain",
      address: "Rue du Rhône 56, 1204 Genève",
      city: "Genève",
      price_range: 1,
      latitude: 46.2020,
      longitude: 6.1470,
    },
    {
      name: "L'Entrecôte Couronnée",
      description: "Steakhouse genevois réputé pour sa viande de qualité suisse, ses accompagnements maison et sa cave à vins.",
      cuisine_type: "Français",
      address: "5 Rue des Pâquis, 1201 Genève",
      city: "Genève",
      price_range: 3,
      latitude: 46.2102,
      longitude: 6.1488,
    },
    {
      name: "Tandoori Corner",
      description: "Cuisine indienne authentique avec tandoori, curry et naans fraîchement préparés dans un four traditionnel.",
      cuisine_type: "Indien",
      address: "15 Rue de Berne, 1201 Genève",
      city: "Genève",
      price_range: 2,
      latitude: 46.2098,
      longitude: 6.1470,
    },
    {
      name: "Ô Maguey",
      description: "Restaurant mexicain coloré proposant tacos, burritos, guacamole frais et margaritas artisanales.",
      cuisine_type: "Mexicain",
      address: "20 Rue de la Servette, 1202 Genève",
      city: "Genève",
      price_range: 2,
      latitude: 46.2140,
      longitude: 6.1360,
    },
    {
      name: "Les Armures",
      description: "Restaurant historique en vieille ville. Fondue, raclette et spécialités suisses dans un cadre médiéval unique.",
      cuisine_type: "Suisse",
      address: "1 Rue du Puits-Saint-Pierre, 1204 Genève",
      city: "Genève",
      price_range: 3,
      latitude: 46.2005,
      longitude: 6.1493,
    },
    {
      name: "Green Gorilla",
      description: "Restaurant 100% végétarien et vegan. Bowls, salades créatives et smoothies dans une ambiance zen.",
      cuisine_type: "Végétarien",
      address: "10 Rue de la Coulouvrenière, 1204 Genève",
      city: "Genève",
      price_range: 2,
      latitude: 46.2000,
      longitude: 6.1400,
    },
  ];
}

function generateMenuItems(cuisineType: string): any[] {
  const menus: Record<string, any[]> = {
    Français: [
      { name: "Soupe à l'oignon gratinée", description: "Soupe traditionnelle avec croûtons et gruyère fondu", price: 14, category: "Entrées" },
      { name: "Tartare de bœuf", description: "Tartare préparé minute, frites maison", price: 28, category: "Plats" },
      { name: "Filet de perche", description: "Filets de perche du lac, sauce tartare, pommes vapeur", price: 32, category: "Plats" },
      { name: "Crème brûlée", description: "Crème brûlée à la vanille de Madagascar", price: 12, category: "Desserts" },
      { name: "Salade de chèvre chaud", description: "Mesclun, chèvre gratiné, miel et noix", price: 16, category: "Entrées" },
    ],
    Suisse: [
      { name: "Fondue moitié-moitié", description: "Gruyère et vacherin fribourgeois, pain artisanal", price: 28, category: "Fondues" },
      { name: "Raclette traditionnelle", description: "Fromage à raclette du Valais, pommes de terre et condiments", price: 32, category: "Spécialités" },
      { name: "Rösti bernois", description: "Rösti croustillant avec lard, fromage et œuf au plat", price: 22, category: "Plats" },
      { name: "Longeole genevoise", description: "Saucisse genevoise IGP, gratin de cardons", price: 26, category: "Plats" },
      { name: "Meringue double crème", description: "Meringue de Gruyère avec double crème de la Gruyère", price: 14, category: "Desserts" },
    ],
    Italien: [
      { name: "Bruschetta al pomodoro", description: "Pain grillé, tomates fraîches, basilic et huile d'olive", price: 12, category: "Antipasti" },
      { name: "Tagliatelle alla bolognese", description: "Pâtes fraîches maison, ragù mijoté 6 heures", price: 22, category: "Pasta" },
      { name: "Pizza Margherita", description: "Tomate San Marzano, mozzarella di bufala, basilic frais", price: 18, category: "Pizza" },
      { name: "Tiramisu", description: "Tiramisu classique au mascarpone et café espresso", price: 12, category: "Dolci" },
      { name: "Risotto ai funghi porcini", description: "Risotto crémeux aux cèpes frais", price: 26, category: "Risotti" },
    ],
    Japonais: [
      { name: "Edamame", description: "Fèves de soja grillées au sel de mer", price: 8, category: "Entrées" },
      { name: "Sashimi mixte", description: "12 pièces de poisson ultra-frais: saumon, thon, daurade", price: 32, category: "Sashimi" },
      { name: "Chirashi saumon", description: "Bol de riz vinaigré, saumon frais, avocat, sésame", price: 26, category: "Plats" },
      { name: "Ramen tonkotsu", description: "Bouillon de porc 12h, nouilles fraîches, œuf mollet, chashu", price: 22, category: "Ramen" },
      { name: "Mochi glacé", description: "Assortiment de 3 mochis: matcha, sésame noir, yuzu", price: 10, category: "Desserts" },
    ],
    Libanais: [
      { name: "Mezzé mixte", description: "Houmous, baba ganoush, taboulé, fattouch", price: 18, category: "Mezzés" },
      { name: "Falafel assiette", description: "Falafels maison, houmous, salade, pain pita", price: 16, category: "Plats" },
      { name: "Shawarma poulet", description: "Poulet mariné, sauce à l'ail, pickles, pain saj", price: 20, category: "Plats" },
      { name: "Kebbé", description: "Boulettes de viande et boulgour, sauce yaourt", price: 22, category: "Plats" },
      { name: "Baklava", description: "Pâtisserie feuilletée aux noix et sirop de fleur d'oranger", price: 10, category: "Desserts" },
    ],
    Indien: [
      { name: "Samosas végétariens", description: "Beignets croustillants aux légumes épicés, chutney menthe", price: 10, category: "Entrées" },
      { name: "Butter Chicken", description: "Poulet tandoori dans une sauce tomate crémeuse au beurre", price: 24, category: "Curry" },
      { name: "Biryani agneau", description: "Riz basmati parfumé à l'agneau mijoté et aux épices", price: 26, category: "Plats" },
      { name: "Naan au fromage", description: "Pain naan fourré au fromage, cuit au tandoor", price: 6, category: "Pains" },
      { name: "Gulab Jamun", description: "Beignets de lait au sirop de cardamome et rose", price: 8, category: "Desserts" },
    ],
  };

  // Default menu for cuisines not specifically defined
  const defaultMenu = [
    { name: "Salade du marché", description: "Salade fraîche de saison avec vinaigrette maison", price: 14, category: "Entrées" },
    { name: "Plat du jour", description: "Suggestion du chef selon l'arrivage", price: 22, category: "Plats" },
    { name: "Burger maison", description: "Steak haché frais, cheddar, oignons caramélisés, frites", price: 24, category: "Plats" },
    { name: "Poke bowl saumon", description: "Riz, saumon frais, avocat, edamame, sauce soja sésame", price: 20, category: "Bowls" },
    { name: "Fondant au chocolat", description: "Fondant cœur coulant, glace vanille", price: 12, category: "Desserts" },
  ];

  return menus[cuisineType] || defaultMenu;
}
