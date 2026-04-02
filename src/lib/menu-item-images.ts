type ResolveMenuImageArgs = {
  name: string;
  description?: string | null;
  category?: string | null;
  imageUrl?: string | null;
};

const EXACT_IMAGE_BY_NAME: Record<string, string> = {
  "margherita dop": "/images/pizza diavola.avif",
  diavola: "/images/pizza diavola.avif",
  "burrata e prosciutto": "/images/prosciutto e rucola.avif",
  tartufo: "/images/truffe nera.webp",
  tiramisu: "/images/1.webp",
  "antipasti misti": "/images/lebanese-mezze.jpeg",
  "margherita classica": "/images/pizza diavola.avif",
  "4 fromages": "/images/pizza quatre fromage.jpg",
  calzone: "/images/calzone.webp",
  "panna cotta": "/images/pannacotta.webp",
  "salade cesar": "/images/fattouche.webp",
  "spaghetti carbonara": "/images/pasta-assortment.jpeg",
  "le wagyu": "/images/smash-burger-single.jpeg",
  "le truffe": "/images/burger truffe.webp",
  "le classic": "/images/gourmet-burgers.jpeg",
  "le classique": "/images/gourmet-burgers.jpeg",
  "le fromager": "/images/smash-burger-single.jpeg",
  "frites truffe": "/images/chicken-bucket-fries.jpeg",
  "frites maison": "/images/chicken-bucket-fries.jpeg",
  milkshake: "/images/milshake vanille.jpeg",
  brownie: "/images/1.webp",
  "flat white": "/images/1.webp",
  "pour over": "/images/1.webp",
  "avocado toast": "/images/acai bowl.jpg",
  "banana bread": "/images/1.webp",
  omakase: "/images/salmon roll.webp",
  "sashimi premium": "/images/salmon roll.webp",
  "mezze royal": "/images/lebanese-mezze.jpeg",
  "agneau grille": "/images/mixed-grill-platter.jpeg",
  "power bowl": "/images/poke-bowls.jpeg",
  "green detox": "/images/smoothie vert.jpg",
  "tagliata di manzo": "/images/mixed-grill-platter.jpeg",
  "risotto porcini": "/images/pasta-assortment.jpeg",
  "menu degustation": "/images/octopus-fine-dining.jpeg",
  "filet de boeuf wagyu": "/images/mixed-grill-platter.jpeg",
  "pad thai": "/images/thai-pad-thai.jpeg",
  "biryani royal": "/images/byriani.jpg",
  "doner kebab": "/images/doner-kebab-plate.jpeg",
  edamame: "/images/edamame.webp",
  "california roll": "/images/california roll.jpg",
  "bento box": "/images/thai-spread.jpeg",
  "green tea ice cream": "/images/moshi glac\u00e9s.jpg",
  carpaccio: "/images/octopus-fine-dining.jpeg",
  bruschetta: "/images/bruschetta.jpg",
  focaccia: "/images/bruschetta.jpg",
  affogato: "/images/1.webp",
  lahmacun: "/images/pizza diavola.avif",
  "adana kebab": "/images/mixed-grill-platter.jpeg",
  "falafel assiette": "/images/assiette mixte libanaise.jpeg",
  "the turc": "/images/limonade menthe.jpeg",
  "tikka masala": "/images/indian-curry-bowls.jpeg",
  "curry vert poulet": "/images/thai-curry-spread.jpeg",
  "curry rouge boeuf": "/images/thai-curry-spread.jpeg",
  "som tam": "/images/fattouche.webp",
  "rouleaux de printemps": "/images/thai-curry-spread.jpeg",
  "tom yum kung": "/images/ramen miso.jpg",
  "riz gluant mangue": "/images/acai bowl.jpg",
  "bubble tea taro": "/images/mango lassi.jpeg",
  "chicken crispy": "/images/gfc-fried-chicken.jpeg",
  "sweet potato fries": "/images/chicken-bucket-fries.jpeg",
  "dim sum vapeur 6 pcs": "/images/gyoza porc.webp",
  "bao porc caramelise": "/images/gyoza porc.webp",
  "poulet kung pao": "/images/thai-curry-spread.jpeg",
  "riz cantonais": "/images/byriani.jpg",
  "soupe wonton": "/images/ramen miso.jpg",
  "perles de coco": "/images/moshi glac\u00e9s.jpg",
  "chicken teriyaki": "/images/poke-bowls.jpeg",
  "tartare de boeuf": "/images/octopus-fine-dining.jpeg",
  "salade nicoise": "/images/fattouche.webp",
  "croque monsieur": "/images/bruschetta.jpg",
  "quiche du jour": "/images/tarte aux noix.webp",
  "planche apero": "/images/assiette mixte libanaise.jpeg",
  "creme brulee": "/images/pannacotta.webp",
  "fondant au chocolat": "/images/1.webp",
  "korean fried chicken": "/images/gfc-fried-chicken.jpeg",
  "kimchi jjigae": "/images/ramen miso.jpg",
  japchae: "/images/thai-pad-thai.jpeg",
  "kimbap 8 pcs": "/images/california roll.jpg",
  "mandu 6 pcs": "/images/gyoza porc.webp",
  tteokbokki: "/images/thai-pad-thai.jpeg",
  "soju original": "/images/kombucha.jpeg",
  "tajine agneau pruneaux": "/images/indian-feast.jpeg",
  "tajine poulet citron": "/images/indian-feast.jpeg",
  "pastilla au poulet": "/images/samosa.jpg",
  "briouates viande": "/images/samosa.jpg",
  harira: "/images/ramen miso.jpg",
  "cornes de gazelle": "/images/baklava.jpg",
  "the a la menthe": "/images/limonade menthe.jpeg",
  "souvlaki mixte assiette": "/images/greek-gyros.jpeg",
  moussaka: "/images/WhatsApp Image 2026-03-12 at 19.54.57.jpeg",
  "salade grecque": "/images/fattouche.webp",
  tzatziki: "/images/raita.webp",
  spanakopita: "/images/samosa.jpg",
  loukoumades: "/images/gulam jamun.jpg",
  "frappe cafe": "/images/milshake vanille.jpeg",
};

const IMAGE_POOLS: Record<string, string[]> = {
  pizza: [
    "/images/pizza diavola.avif",
    "/images/pizza quatre fromage.jpg",
    "/images/prosciutto e rucola.avif",
    "/images/calzone.webp",
  ],
  burger: [
    "/images/gourmet-burgers.jpeg",
    "/images/smash-burgers.jpeg",
    "/images/smash-burger-single.jpeg",
    "/images/burger truffe.webp",
    "/images/veggie burger.jpg",
  ],
  sushi: [
    "/images/california roll.jpg",
    "/images/salmon roll.webp",
    "/images/gyoza porc.webp",
  ],
  bowl: ["/images/poke-bowls.jpeg", "/images/acai bowl.jpg"],
  fries: ["/images/chicken-bucket-fries.jpeg", "/images/lobster-roll-fries.jpeg"],
  pasta: ["/images/pasta-assortment.jpeg"],
  salade: ["/images/fattouche.webp", "/images/salade du march\u00e9.jpg"],
  kebab: [
    "/images/doner-kebab-plate.jpeg",
    "/images/kebab-box-spread.jpeg",
    "/images/greek-gyros.jpeg",
  ],
  curry: [
    "/images/indian-curry-bowls.jpeg",
    "/images/indian-feast.jpeg",
    "/images/thai-curry-spread.jpeg",
  ],
  soup: ["/images/ramen miso.jpg", "/images/thai-spread.jpeg"],
  coffee: ["/images/1.webp", "/images/milshake vanille.jpeg"],
  dessert: [
    "/images/1.webp",
    "/images/pannacotta.webp",
    "/images/baklava.jpg",
    "/images/gulam jamun.jpg",
    "/images/tarte aux noix.webp",
    "/images/churros.jpg",
  ],
  steak: ["/images/mixed-grill-platter.jpeg", "/images/assiette mixte libanaise.jpeg"],
  chicken: [
    "/images/gfc-fried-chicken.jpeg",
    "/images/crispy-chicken.jpeg",
    "/images/chicken-bucket-fries.jpeg",
    "/images/rotisserie-chicken.jpeg",
  ],
  default: [
    "/images/lebanese-mezze.jpeg",
    "/images/poke-bowls.jpeg",
    "/images/thai-spread.jpeg",
    "/images/indian-feast.jpeg",
    "/images/mixed-grill-platter.jpeg",
  ],
};

function normalizeLabel(value: string): string {
  return value
    .toLowerCase()
    .replace(/\u0153/g, "oe")
    .replace(/\u00e6/g, "ae")
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
  if (text.includes("bao") || text.includes("dim sum") || text.includes("mandu") || text.includes("wonton") || text.includes("kimbap")) return "sushi";
  if (text.includes("bowl") || text.includes("edamame") || text.includes("poke")) return "bowl";
  if (text.includes("frite") || text.includes("fries")) return "fries";
  if (text.includes("pates") || text.includes("spaghetti") || text.includes("risotto") || text.includes("pasta")) return "pasta";
  if (text.includes("salade") || text.includes("detox") || text.includes("salad")) return "salade";
  if (text.includes("kebab") || text.includes("doner") || text.includes("gyro") || text.includes("shawarma")) return "kebab";
  if (text.includes("thai") || text.includes("biryani") || text.includes("curry") || text.includes("indien") || text.includes("indian") || text.includes("tandoori") || text.includes("naan")) return "curry";
  if (text.includes("soupe") || text.includes("soup") || text.includes("ramen") || text.includes("jjigae")) return "soup";
  if (text.includes("poulet") || text.includes("chicken") || text.includes("nugget") || text.includes("tender") || text.includes("wing")) return "chicken";
  if (text.includes("cafe") || text.includes("coffee") || text.includes("flat white") || text.includes("latte") || text.includes("frappe")) return "coffee";
  if (text.includes("dessert") || text.includes("tiramisu") || text.includes("brownie") || text.includes("panna cotta") || text.includes("ice cream") || text.includes("gateau")) return "dessert";
  if (text.includes("wagyu") || text.includes("manzo") || text.includes("boeuf") || text.includes("steak") || text.includes("viande") || text.includes("grille") || text.includes("agneau")) return "steak";
  return "default";
}

function normalizeImageUrl(value: string): string {
  return value.trim().replace(/\\/g, "/");
}

export function resolveMenuItemImageUrl({
  name,
  description,
  category,
  imageUrl,
}: ResolveMenuImageArgs): string {
  const normalizedName = normalizeLabel(name || "");
  const exactImage = EXACT_IMAGE_BY_NAME[normalizedName];
  const normalizedImageUrl = imageUrl ? normalizeImageUrl(imageUrl) : "";

  // Prefer curated local matches over stale seeded /images paths.
  if (exactImage && (!normalizedImageUrl || normalizedImageUrl.startsWith("/images/"))) {
    return exactImage;
  }

  if (imageUrl) return imageUrl;

  const fullText = normalizeLabel(`${name || ""} ${description || ""} ${category || ""}`);
  const poolKey = inferPoolKey(fullText);
  const pool = IMAGE_POOLS[poolKey] || IMAGE_POOLS.default;
  return pool[hashOf(fullText || normalizedName || "default") % pool.length];
}
