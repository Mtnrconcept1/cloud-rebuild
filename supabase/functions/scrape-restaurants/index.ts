import {
  HttpError,
  authenticateRequest,
  requireRole,
} from "../_shared/auth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const actor = await authenticateRequest(req, { allowServiceRole: false });
    requireRole(actor, ["admin"]);
    const body = await req.json().catch(() => ({}));
    const ownerId = typeof body?.owner_id === "string" && body.owner_id.trim().length > 0
      ? body.owner_id.trim()
      : actor.userId;

    if (!ownerId) {
      throw new HttpError(400, "owner_id requis");
    }

    const supabase = actor.adminClient;
    // Check if restaurants already exist
    const { count } = await supabase.from("restaurants").select("*", { count: "exact", head: true });
    if (count && count > 0) {
      return new Response(
        JSON.stringify({ success: true, message: `${count} restaurants already exist. Skipping.` }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }



    // Insert all Geneva restaurants
    const restaurants = getGenevaRestaurants();
    const { data: inserted, error: insertError } = await supabase
      .from("restaurants")
      .insert(restaurants.map((r) => ({ ...r, owner_id: ownerId })))
      .select("id, cuisine_type, name");

    if (insertError) {
      return new Response(
        JSON.stringify({ success: false, error: insertError.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Add menu items for each restaurant
    const allMenuItems: any[] = [];
    for (const rest of inserted || []) {
      const items = generateMenuItems(rest.cuisine_type || "Européen");
      for (const item of items) {
        allMenuItems.push({ ...item, restaurant_id: rest.id });
      }
    }

    if (allMenuItems.length > 0) {
      await supabase.from("menu_items").insert(allMenuItems);
    }

    // Now try Firecrawl for extra restaurants
    const FIRECRAWL_API_KEY = Deno.env.get("FIRECRAWL_API_KEY");
    let firecrawlResults: string[] = [];

    if (FIRECRAWL_API_KEY) {
      try {
        const searchResponse = await fetch("https://api.firecrawl.dev/v1/search", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${FIRECRAWL_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            query: "meilleurs restaurants Genève Suisse 2024 2025",
            limit: 5,
            lang: "fr",
            country: "ch",
          }),
        });

        const searchData = await searchResponse.json();
        const results = searchData.data || [];

        const existingNames = new Set(restaurants.map((r) => r.name.toLowerCase()));

        for (const result of results) {
          const names = extractNames(result.title || "", result.description || "");
          for (const name of names) {
            if (!existingNames.has(name.toLowerCase()) && name.length > 3 && name.length < 50) {
              existingNames.add(name.toLowerCase());
              const { error } = await supabase.from("restaurants").insert({
                owner_id: ownerId,
                name,
                description: result.description?.slice(0, 300) || null,
                cuisine_type: "Européen",
                address: "Genève, Suisse",
                city: "Genève",
                price_range: 2,
                is_active: true,
                rating: parseFloat((Math.random() * 1.5 + 3.5).toFixed(1)),
                review_count: Math.floor(Math.random() * 100 + 5),
              });
              if (!error) firecrawlResults.push(name);
            }
          }
        }
      } catch (e) {
        console.error("Firecrawl error (non-blocking):", e);
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        inserted: (inserted?.length || 0) + firecrawlResults.length,
        known: inserted?.map((r) => r.name) || [],
        scraped: firecrawlResults,
        menuItems: allMenuItems.length,
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

function extractNames(title: string, description: string): string[] {
  const names: string[] = [];
  const combined = title + " " + description;
  // Match restaurant-like names between quotes or after common patterns
  const quoted = combined.match(/[«"']([^»"']{4,40})[»"']/g);
  if (quoted) {
    for (const q of quoted) {
      names.push(q.replace(/[«»"'"']/g, "").trim());
    }
  }
  return names;
}

function getGenevaRestaurants() {
  return [
    { name: "Le Chat-Botté", description: "Restaurant gastronomique au Beau-Rivage, cuisine française raffinée avec vue sur le lac Léman.", cuisine_type: "Français", address: "13 Quai du Mont-Blanc, 1201 Genève", city: "Genève", price_range: 4, latitude: 46.2088, longitude: 6.1507, is_active: true, delivery_available: false, rating: 4.8, review_count: 156 },
    { name: "Café du Soleil", description: "Institution genevoise depuis 1891. La meilleure fondue de Genève dans un cadre authentique au Petit-Saconnex.", cuisine_type: "Suisse", address: "6 Place du Petit-Saconnex, 1209 Genève", city: "Genève", price_range: 2, latitude: 46.2197, longitude: 6.1328, is_active: true, delivery_available: true, delivery_fee: 3.5, rating: 4.6, review_count: 312 },
    { name: "Bayview by Michel Roth", description: "Restaurant gastronomique étoilé Michelin à l'Hôtel Président Wilson. Cuisine française contemporaine d'exception.", cuisine_type: "Français", address: "47 Quai Wilson, 1211 Genève", city: "Genève", price_range: 4, latitude: 46.2149, longitude: 6.1542, is_active: true, delivery_available: false, rating: 4.9, review_count: 89 },
    { name: "Chez Ma Cousine", description: "Chaîne locale populaire spécialisée dans le poulet rôti. Ambiance conviviale, prix doux, portions généreuses.", cuisine_type: "Européen", address: "6 Place du Bourg-de-Four, 1204 Genève", city: "Genève", price_range: 1, latitude: 46.2002, longitude: 6.1522, is_active: true, delivery_available: true, delivery_fee: 2.5, rating: 4.3, review_count: 478 },
    { name: "Izumi", description: "Restaurant japonais contemporain à l'Hôtel Président Wilson. Sushi, sashimi et robatayaki d'exception.", cuisine_type: "Japonais", address: "47 Quai Wilson, 1211 Genève", city: "Genève", price_range: 4, latitude: 46.2149, longitude: 6.1542, is_active: true, delivery_available: false, rating: 4.7, review_count: 102 },
    { name: "Brasserie du Molard", description: "Brasserie typiquement genevoise au cœur de la vieille ville. Spécialités locales et plats du jour.", cuisine_type: "Français", address: "Place du Molard, 1204 Genève", city: "Genève", price_range: 2, latitude: 46.2028, longitude: 6.1480, is_active: true, delivery_available: true, delivery_fee: 3.0, rating: 4.2, review_count: 234 },
    { name: "La Bottega", description: "Authentique trattoria italienne à Carouge. Pâtes fraîches maison, pizzas au feu de bois et ambiance chaleureuse.", cuisine_type: "Italien", address: "24 Rue Saint-Joseph, 1227 Carouge", city: "Genève", price_range: 2, latitude: 46.1838, longitude: 6.1389, is_active: true, delivery_available: true, delivery_fee: 4.0, rating: 4.5, review_count: 267 },
    { name: "Le Thé", description: "Restaurant thaïlandais réputé dans le quartier des Eaux-Vives. Cuisine authentique et épicée.", cuisine_type: "Thaïlandais", address: "3 Rue Ami-Lullin, 1207 Genève", city: "Genève", price_range: 2, latitude: 46.2013, longitude: 6.1590, is_active: true, delivery_available: true, delivery_fee: 3.5, rating: 4.4, review_count: 189 },
    { name: "Al-Amir", description: "Restaurant libanais convivial avec mezzés généreux, grillades au charbon et ambiance orientale.", cuisine_type: "Libanais", address: "12 Rue de Zurich, 1201 Genève", city: "Genève", price_range: 2, latitude: 46.2100, longitude: 6.1470, is_active: true, delivery_available: true, delivery_fee: 3.0, rating: 4.5, review_count: 198 },
    { name: "Hamburger Foundation", description: "Les meilleurs burgers artisanaux de Genève. Viande locale, buns maison et frites croustillantes.", cuisine_type: "Américain", address: "Rue du Rhône 56, 1204 Genève", city: "Genève", price_range: 1, latitude: 46.2020, longitude: 6.1470, is_active: true, delivery_available: true, delivery_fee: 2.5, rating: 4.4, review_count: 356 },
    { name: "L'Entrecôte Couronnée", description: "Steakhouse genevois réputé pour sa viande de qualité suisse, ses accompagnements maison et sa cave à vins.", cuisine_type: "Français", address: "5 Rue des Pâquis, 1201 Genève", city: "Genève", price_range: 3, latitude: 46.2102, longitude: 6.1488, is_active: true, delivery_available: false, rating: 4.6, review_count: 145 },
    { name: "Tandoori Corner", description: "Cuisine indienne authentique avec tandoori, curry et naans fraîchement préparés dans un four traditionnel.", cuisine_type: "Indien", address: "15 Rue de Berne, 1201 Genève", city: "Genève", price_range: 2, latitude: 46.2098, longitude: 6.1470, is_active: true, delivery_available: true, delivery_fee: 3.5, rating: 4.3, review_count: 167 },
    { name: "Ô Maguey", description: "Restaurant mexicain coloré proposant tacos, burritos, guacamole frais et margaritas artisanales.", cuisine_type: "Mexicain", address: "20 Rue de la Servette, 1202 Genève", city: "Genève", price_range: 2, latitude: 46.2140, longitude: 6.1360, is_active: true, delivery_available: true, delivery_fee: 3.0, rating: 4.2, review_count: 134 },
    { name: "Les Armures", description: "Restaurant historique en vieille ville. Fondue, raclette et spécialités suisses dans un cadre médiéval unique.", cuisine_type: "Suisse", address: "1 Rue du Puits-Saint-Pierre, 1204 Genève", city: "Genève", price_range: 3, latitude: 46.2005, longitude: 6.1493, is_active: true, delivery_available: false, rating: 4.5, review_count: 289 },
    { name: "Green Gorilla", description: "Restaurant 100% végétarien et vegan. Bowls, salades créatives et smoothies dans une ambiance zen.", cuisine_type: "Végétarien", address: "10 Rue de la Coulouvrenière, 1204 Genève", city: "Genève", price_range: 2, latitude: 46.2000, longitude: 6.1400, is_active: true, delivery_available: true, delivery_fee: 3.0, rating: 4.4, review_count: 112 },
    { name: "Le Relais d'Entrecôte", description: "La célèbre formule unique : salade aux noix et entrecôte sauce secrète, frites à volonté.", cuisine_type: "Français", address: "49 Rue du Rhône, 1204 Genève", city: "Genève", price_range: 2, latitude: 46.2018, longitude: 6.1465, is_active: true, delivery_available: false, rating: 4.3, review_count: 423 },
    { name: "Cottage Café", description: "Brunch populaire et cuisine healthy. Avocado toast, pancakes et jus pressés dans un cadre cosy.", cuisine_type: "Européen", address: "7 Rue Adhémar-Fabri, 1201 Genève", city: "Genève", price_range: 2, latitude: 46.2095, longitude: 6.1482, is_active: true, delivery_available: true, delivery_fee: 3.5, rating: 4.5, review_count: 234 },
    { name: "Auberge de Savièse", description: "Spécialités valaisannes authentiques au cœur de Genève. Raclette, viande séchée et vins du Valais.", cuisine_type: "Suisse", address: "20 Place du Cirque, 1204 Genève", city: "Genève", price_range: 2, latitude: 46.1998, longitude: 6.1410, is_active: true, delivery_available: false, rating: 4.4, review_count: 187 },
    { name: "Miyako", description: "Restaurant japonais traditionnel avec teppanyaki, sushi bar et salon privé tatami.", cuisine_type: "Japonais", address: "11 Rue de Chantepoulet, 1201 Genève", city: "Genève", price_range: 3, latitude: 46.2085, longitude: 6.1445, is_active: true, delivery_available: true, delivery_fee: 5.0, rating: 4.6, review_count: 145 },
    { name: "Luigia", description: "Pizzeria napolitaine branchée à la Praille. Four à bois, pâte 72h et ingrédients importés d'Italie.", cuisine_type: "Italien", address: "Centre Commercial La Praille, 1227 Carouge", city: "Genève", price_range: 2, latitude: 46.1850, longitude: 6.1350, is_active: true, delivery_available: true, delivery_fee: 4.0, rating: 4.3, review_count: 378 },
  ];
}

function generateMenuItems(cuisineType: string) {
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
    Thaïlandais: [
      { name: "Tom Yum Kung", description: "Soupe épicée aux crevettes, citronnelle et galanga", price: 14, category: "Soupes" },
      { name: "Pad Thai", description: "Nouilles sautées aux crevettes, cacahuètes et citron vert", price: 20, category: "Plats" },
      { name: "Curry vert poulet", description: "Curry vert au lait de coco, poulet, aubergines thaï", price: 22, category: "Curry" },
      { name: "Mango Sticky Rice", description: "Riz gluant à la mangue fraîche et lait de coco", price: 10, category: "Desserts" },
      { name: "Rouleaux de printemps", description: "Rouleaux frais aux crevettes, vermicelles et herbes", price: 12, category: "Entrées" },
    ],
    Américain: [
      { name: "Classic Burger", description: "Steak haché 180g, cheddar, laitue, tomate, oignon", price: 18, category: "Burgers" },
      { name: "Bacon Cheeseburger", description: "Double steak, bacon croustillant, cheddar fondu", price: 22, category: "Burgers" },
      { name: "Chicken Wings", description: "Ailes de poulet marinées, sauce BBQ ou Buffalo", price: 14, category: "Starters" },
      { name: "Milkshake", description: "Milkshake crémeux vanille, chocolat ou fraise", price: 8, category: "Boissons" },
      { name: "Cheesecake NY", description: "Cheesecake New York style avec coulis de fruits rouges", price: 10, category: "Desserts" },
    ],
    Mexicain: [
      { name: "Guacamole frais", description: "Avocat, citron vert, coriandre, piment, chips tortilla", price: 12, category: "Entrées" },
      { name: "Tacos al pastor", description: "3 tacos au porc mariné, ananas, oignon, coriandre", price: 16, category: "Tacos" },
      { name: "Burrito bowl", description: "Riz, haricots noirs, poulet grillé, salsa, crème", price: 20, category: "Plats" },
      { name: "Quesadilla", description: "Tortilla au fromage fondu, poulet, poivrons grillés", price: 14, category: "Plats" },
      { name: "Churros", description: "Churros croustillants avec sauce chocolat chaud", price: 8, category: "Desserts" },
    ],
    Végétarien: [
      { name: "Buddha Bowl", description: "Quinoa, avocat, patate douce rôtie, houmous, graines", price: 18, category: "Bowls" },
      { name: "Salade Rainbow", description: "Crudités multicolores, tofu grillé, sauce tahini", price: 16, category: "Salades" },
      { name: "Burger végétal", description: "Steak de betterave et lentilles, pain brioche, frites", price: 20, category: "Burgers" },
      { name: "Smoothie vert", description: "Épinards, banane, mangue, lait d'amande, spiruline", price: 8, category: "Boissons" },
      { name: "Energy Balls", description: "Boules énergétiques dattes, cacao, noix de coco", price: 6, category: "Snacks" },
    ],
  };

  return menus[cuisineType] || [
    { name: "Salade du marché", description: "Salade fraîche de saison avec vinaigrette maison", price: 14, category: "Entrées" },
    { name: "Plat du jour", description: "Suggestion du chef selon l'arrivage", price: 22, category: "Plats" },
    { name: "Burger maison", description: "Steak haché frais, cheddar, oignons caramélisés, frites", price: 24, category: "Plats" },
    { name: "Poke bowl saumon", description: "Riz, saumon frais, avocat, edamame, sauce soja sésame", price: 20, category: "Bowls" },
    { name: "Fondant au chocolat", description: "Fondant cœur coulant, glace vanille", price: 12, category: "Desserts" },
  ];
}

