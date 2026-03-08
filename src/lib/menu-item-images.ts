type ResolveMenuImageArgs = {
  name: string;
  description?: string | null;
  category?: string | null;
  imageUrl?: string | null;
};

const EXACT_HINT_BY_NAME: Record<string, string> = {
  "margherita dop": "margherita pizza bufala basil",
  diavola: "diavola pizza spicy salami",
  "burrata e prosciutto": "pizza burrata prosciutto",
  tartufo: "truffle mushroom pizza",
  tiramisu: "tiramisu dessert",
  "antipasti misti": "italian antipasti platter",
  "margherita classica": "classic margherita pizza",
  "4 fromages": "four cheese pizza",
  calzone: "calzone pizza",
  "panna cotta": "panna cotta dessert",
  "salade cesar": "caesar salad",
  "margherita gigante": "neapolitan margherita pizza",
  marinara: "marinara pizza",
  cosacca: "neapolitan pizza pecorino",
  bruschetta: "bruschetta tomatoes basil",
  "margherita al forno": "wood fired margherita pizza",
  parma: "prosciutto arugula pizza",
  focaccia: "focaccia bread rosemary",
  affogato: "affogato coffee ice cream",
  regina: "ham mushroom pizza",
  "quattro stagioni": "quattro stagioni pizza",
  carpaccio: "beef carpaccio parmesan arugula",
  "spaghetti carbonara": "spaghetti carbonara",
  "margherita verace": "vera pizza napoletana margherita",
  "nduja e burrata": "nduja burrata pizza",
  "vitello tonnato": "vitello tonnato",
  "panna cotta aux agrumes": "citrus panna cotta dessert",
  "le wagyu": "wagyu burger",
  "le truffe": "truffle burger",
  "le classic": "classic cheeseburger",
  "frites truffe": "truffle fries",
  milkshake: "vanilla chocolate strawberry milkshake",
  "le classique": "classic burger",
  "le fromager": "double cheese burger",
  "frites maison": "french fries",
  brownie: "chocolate brownie",
  "flat white": "flat white coffee",
  "pour over": "pour over coffee",
  "avocado toast": "avocado toast poached egg",
  "banana bread": "banana bread slice",
  omakase: "omakase sushi set",
  "sashimi premium": "premium sashimi plate",
  "mezze royal": "lebanese mezze platter",
  "agneau grille": "grilled lamb rice",
  "power bowl": "salmon quinoa bowl edamame",
  "green detox": "green detox salad",
  "tagliata di manzo": "italian tagliata steak",
  "risotto porcini": "porcini mushroom risotto",
  "menu degustation": "fine dining tasting menu",
  "filet de boeuf wagyu": "wagyu beef filet",
  "pad thai": "pad thai shrimp noodles",
  "biryani royal": "lamb biryani",
  "truffe signature": "chocolate truffles box",
  "doner kebab": "doner kebab pita",
  edamame: "edamame bowl",
  "california roll": "california roll sushi",
  "bento box": "japanese bento box",
  "green tea ice cream": "matcha green tea ice cream",
};

const EXACT_IMAGE_BY_NAME: Record<string, string> = {
  "frites truffe": "https://images.unsplash.com/photo-1706964527586-f841f2743c66?auto=format&fit=crop&fm=jpg&q=60&w=1200",
  "frites maison": "https://images.unsplash.com/photo-1706964527586-f841f2743c66?auto=format&fit=crop&fm=jpg&q=60&w=1200",
  milkshake: "https://images.unsplash.com/photo-1755835070338-6049da75951e?auto=format&fit=crop&fm=jpg&q=60&w=1200",
  "le classic": "https://images.unsplash.com/photo-1603064752734-4c48eff53d05?auto=format&fit=crop&fm=jpg&q=60&w=1200",
  "le classique": "https://images.unsplash.com/photo-1603064752734-4c48eff53d05?auto=format&fit=crop&fm=jpg&q=60&w=1200",
  "le truffe": "https://images.unsplash.com/photo-1603064752734-4c48eff53d05?auto=format&fit=crop&fm=jpg&q=60&w=1200",
};

const IMAGE_POOLS: Record<string, string[]> = {
  pizza: ["1513104890138-7c749659a591", "1565299624946-b28f40a0ae38", "1593560708863-f8a735987158", "1511393522233-c1961f983a12"],
  burger: ["1568901346375-23c9450c58cd", "1571091723914-1e849b1ca21a", "1550547660-53b0548ca9a6", "1547584323-ce2e0a446a42"],
  sushi: ["1579871494447-9811cf80d66c", "1583623025817-dc35262a0170", "1553621042-f6e147245754"],
  bowl: ["1546069901-ba9599a7e63c", "1512621776951-a57141f2eefd"],
  fries: ["1706964527586-f841f2743c66"],
  pasta: ["1546548970-71785318a17b", "1473093226734-3c83b8f550d5", "1563379921-c0107108969b"],
  salade: ["1512621776951-a57141f2eefd", "1540189549336-e6e99c35af5b", "1546069901-ba9599a7e63c"],
  kebab: ["1604908176997-125f25cc6f3d", "1529006557810-274b9b2fc783"],
  curry: ["1585937421612-70a0e210c98f", "1464454709132-9365744e1c92", "1476021453241-47139f33af60"],
  coffee: ["1509042239860-f550ce710b93", "1495474472287-4d71bcdd2085", "1444418185913-a687459600e2"],
  dessert: ["1551024506-0bccd828d307", "1565958011703-44f9829ba187", "1563729784404-f5659ea56246"],
  steak: ["1544025162-d76694265947", "1606416132774-32321415d482"],
  default: ["1546069901-ba9599a7e63c", "1565299624946-b28f40a0ae38", "1544025162-d76694265947", "1512621776951-a57141f2eefd"],
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

function poolUrlFromId(photoId: string): string {
  return photoId.includes("-")
    ? `https://images.unsplash.com/photo-${photoId}?w=400&h=400&fit=crop`
    : `https://images.unsplash.com/photo-1${photoId}?w=400&h=400&fit=crop`;
}

function inferPoolKey(text: string): keyof typeof IMAGE_POOLS {
  if (text.includes("pizza")) return "pizza";
  if (text.includes("burger")) return "burger";
  if (text.includes("sushi") || text.includes("sashimi") || text.includes("roll") || text.includes("omakase")) return "sushi";
  if (text.includes("bowl") || text.includes("edamame")) return "bowl";
  if (text.includes("frite") || text.includes("fries")) return "fries";
  if (text.includes("pates") || text.includes("spaghetti") || text.includes("risotto")) return "pasta";
  if (text.includes("salade") || text.includes("detox")) return "salade";
  if (text.includes("kebab") || text.includes("doner")) return "kebab";
  if (text.includes("thai") || text.includes("biryani") || text.includes("curry")) return "curry";
  if (text.includes("cafe") || text.includes("coffee") || text.includes("flat white")) return "coffee";
  if (text.includes("dessert") || text.includes("tiramisu") || text.includes("brownie") || text.includes("panna cotta") || text.includes("ice cream") || text.includes("truffe")) return "dessert";
  if (text.includes("wagyu") || text.includes("manzo") || text.includes("boeuf") || text.includes("steak")) return "steak";
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

  const hint = EXACT_HINT_BY_NAME[normalizedName] || "";
  const fullText = normalizeLabel(`${name || ""} ${description || ""} ${category || ""} ${hint}`);
  const poolKey = inferPoolKey(fullText);
  const pool = IMAGE_POOLS[poolKey] || IMAGE_POOLS.default;
  return poolUrlFromId(pool[hashOf(fullText || normalizedName || "default") % pool.length]);
}