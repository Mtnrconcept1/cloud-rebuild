type ResolveMenuImageArgs = {
  name: string;
  description?: string | null;
  category?: string | null;
  imageUrl?: string | null;
};

const EXACT_IMAGE_BY_NAME: Record<string, string> = {
  "margherita dop": "/images/pasta-assortment.jpeg",
  diavola: "/images/pasta-assortment.jpeg",
  "burrata e prosciutto": "/images/octopus-fine-dining.jpeg",
  tartufo: "/images/octopus-fine-dining.jpeg",
  tiramisu: "/images/kebab-box-spread.jpeg",
  "antipasti misti": "/images/lebanese-mezze.jpeg",
  "margherita classica": "/images/pasta-assortment.jpeg",
  "4 fromages": "/images/pasta-assortment.jpeg",
  calzone: "/images/pasta-assortment.jpeg",
  "panna cotta": "/images/octopus-fine-dining.jpeg",
  "salade cesar": "/images/poke-bowls.jpeg",
  "spaghetti carbonara": "/images/pasta-assortment.jpeg",
  "le wagyu": "/images/smash-burger-single.jpeg",
  "le truffe": "/images/smash-burgers.jpeg",
  "le classic": "/images/gourmet-burgers.jpeg",
  "le classique": "/images/gourmet-burgers.jpeg",
  "le fromager": "/images/smash-burger-single.jpeg",
  "frites truffe": "/images/lobster-roll-fries.jpeg",
  "frites maison": "/images/lobster-roll-fries.jpeg",
  milkshake: "/images/stack-shake-spread.jpeg",
  brownie: "/images/gfc-fried-chicken.jpeg",
  "flat white": "/images/stack-shake-spread.jpeg",
  "pour over": "/images/stack-shake-spread.jpeg",
  "avocado toast": "/images/poke-bowls.jpeg",
  "banana bread": "/images/poke-bowls.jpeg",
  omakase: "/images/poke-bowls.jpeg",
  "sashimi premium": "/images/poke-bowls.jpeg",
  "mezze royal": "/images/lebanese-mezze.jpeg",
  "agneau grille": "/images/mixed-grill-platter.jpeg",
  "power bowl": "/images/poke-bowls.jpeg",
  "green detox": "/images/poke-bowls.jpeg",
  "tagliata di manzo": "/images/mixed-grill-platter.jpeg",
  "risotto porcini": "/images/pasta-assortment.jpeg",
  "menu degustation": "/images/octopus-fine-dining.jpeg",
  "filet de boeuf wagyu": "/images/mixed-grill-platter.jpeg",
  "pad thai": "/images/thai-pad-thai.jpeg",
  "biryani royal": "/images/indian-feast.jpeg",
  "doner kebab": "/images/doner-kebab-plate.jpeg",
  edamame: "/images/poke-bowls.jpeg",
  "california roll": "/images/poke-bowls.jpeg",
  "bento box": "/images/thai-spread.jpeg",
  "green tea ice cream": "/images/thai-spread.jpeg",
  carpaccio: "/images/octopus-fine-dining.jpeg",
  bruschetta: "/images/lebanese-mezze.jpeg",
  focaccia: "/images/pasta-assortment.jpeg",
  affogato: "/images/octopus-fine-dining.jpeg",
};

const IMAGE_POOLS: Record<string, string[]> = {
  pizza: ["/images/pasta-assortment.jpeg"],
  burger: ["/images/smash-burgers.jpeg", "/images/smash-burger-single.jpeg", "/images/gourmet-burgers.jpeg", "/images/burgers-wings.jpeg", "/images/stack-shake-spread.jpeg"],
  sushi: ["/images/poke-bowls.jpeg", "/images/thai-spread.jpeg"],
  bowl: ["/images/poke-bowls.jpeg", "/images/indian-curry-bowls.jpeg"],
  fries: ["/images/lobster-roll-fries.jpeg", "/images/chicken-bucket-fries.jpeg"],
  pasta: ["/images/pasta-assortment.jpeg"],
  salade: ["/images/poke-bowls.jpeg", "/images/lebanese-mezze.jpeg"],
  kebab: ["/images/kebab-box-spread.jpeg", "/images/doner-kebab-plate.jpeg", "/images/greek-gyros.jpeg"],
  curry: ["/images/indian-curry-bowls.jpeg", "/images/indian-feast.jpeg", "/images/thai-curry-spread.jpeg", "/images/thai-pad-thai.jpeg", "/images/thai-spread.jpeg"],
  coffee: ["/images/stack-shake-spread.jpeg", "/images/octopus-fine-dining.jpeg"],
  dessert: ["/images/gfc-fried-chicken.jpeg", "/images/octopus-fine-dining.jpeg"],
  steak: ["/images/mixed-grill-platter.jpeg", "/images/rotisserie-chicken.jpeg"],
  chicken: ["/images/crispy-chicken.jpeg", "/images/chicken-bucket-fries.jpeg", "/images/gfc-fried-chicken.jpeg", "/images/rotisserie-chicken.jpeg"],
  default: ["/images/kebab-box-spread.jpeg", "/images/stack-shake-spread.jpeg", "/images/mixed-grill-platter.jpeg", "/images/lebanese-mezze.jpeg", "/images/poke-bowls.jpeg", "/images/gourmet-burgers.jpeg"],
};

function normalizeLabel(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function hashOf(value: string): number {
  let hash = 0;
  for (let i = 0; i < value.length; i++) {
    hash = (hash << 5) - hash + value.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

function inferPoolKey(text: string): keyof typeof IMAGE_POOLS {
  if (text.includes("pizza")) return "pizza";
  if (text.includes("burger")) return "burger";
  if (text.includes("sushi") || text.includes("sashimi") || text.includes("roll") || text.includes("omakase")) return "sushi";
  if (text.includes("bowl") || text.includes("edamame") || text.includes("poke")) return "bowl";
  if (text.includes("frite") || text.includes("fries")) return "fries";
  if (text.includes("pates") || text.includes("spaghetti") || text.includes("risotto") || text.includes("pasta")) return "pasta";
  if (text.includes("salade") || text.includes("detox") || text.includes("salad")) return "salade";
  if (text.includes("kebab") || text.includes("doner") || text.includes("gyro") || text.includes("shawarma")) return "kebab";
  if (text.includes("thai") || text.includes("biryani") || text.includes("curry") || text.includes("indien") || text.includes("indian") || text.includes("tandoori") || text.includes("naan")) return "curry";
  if (text.includes("poulet") || text.includes("chicken") || text.includes("nugget") || text.includes("tender") || text.includes("wing")) return "chicken";
  if (text.includes("cafe") || text.includes("coffee") || text.includes("flat white") || text.includes("latte")) return "coffee";
  if (text.includes("dessert") || text.includes("tiramisu") || text.includes("brownie") || text.includes("panna cotta") || text.includes("ice cream") || text.includes("gateau")) return "dessert";
  if (text.includes("wagyu") || text.includes("manzo") || text.includes("boeuf") || text.includes("steak") || text.includes("viande") || text.includes("grille") || text.includes("agneau")) return "steak";
  return "default";
}

export function resolveMenuItemImageUrl({
  name,
  description,
  category,
  imageUrl,
}: ResolveMenuImageArgs): string {
  if (imageUrl) return imageUrl;

  const normalizedName = normalizeLabel(name || "");
  const exactImage = EXACT_IMAGE_BY_NAME[normalizedName];
  if (exactImage) return exactImage;

  const fullText = normalizeLabel(`${name || ""} ${description || ""} ${category || ""}`);
  const poolKey = inferPoolKey(fullText);
  const pool = IMAGE_POOLS[poolKey] || IMAGE_POOLS.default;
  return pool[hashOf(fullText || normalizedName || "default") % pool.length];
}
