export type RestaurantCategoryDefinition = {
  slug: string;
  name: string;
  keywords: string[];
};

export const PREDEFINED_RESTAURANT_CATEGORIES: RestaurantCategoryDefinition[] = [
  { slug: "italien", name: "Italien", keywords: ["pizza", "pates", "lasagne", "risotto", "trattoria"] },
  { slug: "pizza", name: "Pizza", keywords: ["pizzeria", "margherita", "napolitaine", "calzone"] },
  { slug: "pates", name: "Pates", keywords: ["spaghetti", "penne", "tagliatelle", "gnocchi"] },
  { slug: "burger", name: "Burger", keywords: ["hamburger", "smash burger", "cheeseburger", "frites"] },
  { slug: "grillades", name: "Grillades", keywords: ["steak", "barbecue", "viande", "bbq", "cote de boeuf"] },
  { slug: "francais", name: "Francais", keywords: ["brasserie", "bistrot", "traditionnel", "terroir"] },
  { slug: "suisse", name: "Suisse", keywords: ["fondue", "raclette", "rosti", "brasserie suisse"] },
  { slug: "japonais", name: "Japonais", keywords: ["sushi", "ramen", "yakitori", "izakaya"] },
  { slug: "sushi", name: "Sushi", keywords: ["maki", "nigiri", "sashimi", "chirashi"] },
  { slug: "ramen", name: "Ramen", keywords: ["udon", "bouillon", "nouilles japonaises"] },
  { slug: "chinois", name: "Chinois", keywords: ["dim sum", "wok", "canard laque", "nouilles"] },
  { slug: "thai", name: "Thai", keywords: ["pad thai", "curry thai", "tom yum", "thai street food"] },
  { slug: "indien", name: "Indien", keywords: ["curry", "tandoori", "naan", "biryani"] },
  { slug: "pakistanais", name: "Pakistanais", keywords: ["karahi", "biryani", "grill pakistanais"] },
  { slug: "libanais", name: "Libanais", keywords: ["mezze", "shawarma", "falafel", "manouche"] },
  { slug: "turc", name: "Turc", keywords: ["kebab", "doner", "lahmacun", "grill turc"] },
  { slug: "kebab", name: "Kebab", keywords: ["doner", "durum", "galette", "sandwich kebab"] },
  { slug: "tacos", name: "Tacos", keywords: ["tacos gratine", "french tacos", "double viande"] },
  { slug: "mexicain", name: "Mexicain", keywords: ["burrito", "quesadilla", "nachos", "guacamole"] },
  { slug: "mediterraneen", name: "Mediterraneen", keywords: ["mezze", "grillades", "huile d olive", "soleil"] },
  { slug: "marocain", name: "Marocain", keywords: ["couscous", "tajine", "pastilla", "maroc"] },
  { slug: "africain", name: "Africain", keywords: ["maf", "yassa", "alloco", "thieb"] },
  { slug: "creole", name: "Creole", keywords: ["accras", "colombo", "bokit", "antillais"] },
  { slug: "americain", name: "Americain", keywords: ["fried chicken", "bbq", "ribs", "diner"] },
  { slug: "halal", name: "Halal", keywords: ["halal food", "viande halal", "grill halal"] },
  { slug: "vegetarien", name: "Vegetarien", keywords: ["veggie", "sans viande", "vegetal"] },
  { slug: "vegan", name: "Vegan", keywords: ["plant based", "100 vegetal", "sans produit animal"] },
  { slug: "healthy", name: "Healthy", keywords: ["equilibre", "fit", "light", "bien être"] },
  { slug: "salades", name: "Salades", keywords: ["bowl", "fraicheur", "caesar", "crudites"] },
  { slug: "poke", name: "Poke", keywords: ["poke bowl", "saumon", "avocat", "hawaiien"] },
  { slug: "brunch", name: "Brunch", keywords: ["petit déjeuner", "oeufs benedict", "pancakes"] },
  { slug: "petit-dejeuner", name: "Petit-dejeuner", keywords: ["cafe", "croissant", "tartine", "matin"] },
  { slug: "boulangerie", name: "Boulangerie", keywords: ["pain", "viennoiserie", "sandwich", "artisan"] },
  { slug: "patisserie", name: "Patisserie", keywords: ["gateau", "dessert", "tarte", "eclair"] },
  { slug: "desserts", name: "Desserts", keywords: ["glace", "crepe", "gaufre", "sucre"] },
  { slug: "cafe", name: "Cafe", keywords: ["coffee shop", "espresso", "latte", "cappuccino"] },
  { slug: "sandwich", name: "Sandwich", keywords: ["panini", "club sandwich", "bagel", "wrap"] },
  { slug: "street-food", name: "Street Food", keywords: ["snacking", "street", "finger food", "sur le pouce"] },
];

export type RestaurantCategoryLike = {
  name?: string | null;
  slug?: string | null;
  keywords?: string[] | null;
};

export function normalizeRestaurantCategoryText(value: string | null | undefined): string {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function formatRestaurantCategorySummary(
  categoryNames: Array<string | null | undefined>,
  fallback = ""
): string {
  const uniqueNames = Array.from(
    new Set(
      categoryNames
        .map((name) => String(name || "").trim())
        .filter(Boolean)
    )
  );

  if (uniqueNames.length === 0) return fallback;
  if (uniqueNames.length <= 4) return uniqueNames.join(", ");
  return `${uniqueNames.slice(0, 4).join(", ")} +${uniqueNames.length - 4}`;
}

export function buildRestaurantCategorySearchTerms(input: {
  categories?: RestaurantCategoryLike[];
  legacyCuisineType?: string | null;
}): string[] {
  const terms = new Set<string>();

  if (input.legacyCuisineType) {
    const normalizedCuisineType = normalizeRestaurantCategoryText(input.legacyCuisineType);
    if (normalizedCuisineType) terms.add(normalizedCuisineType);
  }

  (input.categories || []).forEach((category) => {
    const fields = [
      category.name,
      category.slug,
      ...(Array.isArray(category.keywords) ? category.keywords : []),
    ];
    fields.forEach((field) => {
      const normalized = normalizeRestaurantCategoryText(field);
      if (normalized) terms.add(normalized);
    });
  });

  return Array.from(terms);
}

export function restaurantMatchesCategoryFilter(input: {
  query?: string | null;
  cuisineFilter?: string | null;
  categories?: RestaurantCategoryLike[];
  legacyCuisineType?: string | null;
}): boolean {
  const terms = buildRestaurantCategorySearchTerms({
    categories: input.categories,
    legacyCuisineType: input.legacyCuisineType,
  });
  const query = normalizeRestaurantCategoryText(input.query);
  const cuisineFilter = normalizeRestaurantCategoryText(input.cuisineFilter);

  const matchesText = (value: string) => terms.some((term) => term.includes(value));

  if (query && !matchesText(query)) return false;
  if (cuisineFilter && !matchesText(cuisineFilter)) return false;
  return true;
}
