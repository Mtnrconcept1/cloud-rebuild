export type PublicRestaurantIllustration = {
  src: string;
  label: string;
};

type PublicRestaurantIllustrationInput = {
  name?: string | null;
  cuisine?: string | null;
  activity?: string | null;
  category?: string | null;
};

function normalize(value: unknown) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

const RULES: Array<{ keys: string[]; src: string; label: string }> = [
  { keys: ["pizza", "pizzeria"], src: "/images/public-listings/pizza.svg", label: "Pizzeria" },
  { keys: ["kebab", "doner", "shawarma", "dürüm", "durum"], src: "/images/public-listings/kebab.svg", label: "Kebab" },
  { keys: ["gastronom", "fine dining", "haute cuisine"], src: "/images/public-listings/gastronomique.svg", label: "Gastronomique" },
  { keys: ["sushi", "japon", "ramen", "yakitori"], src: "/images/public-listings/japonais.svg", label: "Japonais" },
  { keys: ["indien", "indian", "curry", "tandoori"], src: "/images/public-listings/indien.svg", label: "Indien" },
  { keys: ["libanais", "levant", "oriental", "falafel"], src: "/images/public-listings/oriental.svg", label: "Oriental" },
  { keys: ["thai", "chinois", "asiatique", "vietnam", "korean", "coreen"], src: "/images/public-listings/asiatique.svg", label: "Asiatique" },
  { keys: ["burger", "hamburger", "smash"], src: "/images/public-listings/burger.svg", label: "Burger" },
  { keys: ["poisson", "fruits de mer", "seafood", "perche"], src: "/images/public-listings/poisson.svg", label: "Poissons & mer" },
  { keys: ["vegetar", "vegan", "healthy", "salade"], src: "/images/public-listings/vegetarien.svg", label: "Végétarien" },
  { keys: ["grill", "steak", "bbq", "barbecue", "viande"], src: "/images/public-listings/grill.svg", label: "Grill" },
  { keys: ["mediterr", "grec", "greek"], src: "/images/public-listings/mediterraneen.svg", label: "Méditerranéen" },
  { keys: ["italien", "italian", "trattoria", "pasta"], src: "/images/public-listings/italien.svg", label: "Italien" },
  { keys: ["francais", "brasserie", "bistro", "traditionnel"], src: "/images/public-listings/francais.svg", label: "Français / traditionnel" },
  { keys: ["brunch", "coffee", "salon de the", "tea room", "cafe"], src: "/images/public-listings/cafe.svg", label: "Café & brunch" },
];

export function getPublicRestaurantIllustration(input: PublicRestaurantIllustrationInput): PublicRestaurantIllustration {
  // Deliberately do not use the broad REG category "Restaurant/cafe/snack/tea-room"
  // for keyword inference, otherwise almost every source row would be classified as a café.
  const haystack = normalize(`${input.name || ""} ${input.cuisine || ""} ${input.activity || ""}`);
  for (const rule of RULES) {
    if (rule.keys.some((key) => haystack.includes(normalize(key)))) {
      return { src: rule.src, label: rule.label };
    }
  }
  if (normalize(input.category) === "bar") {
    return { src: "/images/public-listings/bar.svg", label: "Bar & café" };
  }
  return { src: "/images/public-listings/restaurant.svg", label: "Restaurant" };
}
