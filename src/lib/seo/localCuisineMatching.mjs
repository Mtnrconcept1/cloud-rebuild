// These cuisine aliases are shared with the static local-page inventory.
// Marketing route aliases stay in the router: they are not cuisine data.
export const LOCAL_CUISINE_ALIASES = Object.freeze({
  pizzeria: "pizza",
  pizzas: "pizza",
  italienne: "italien",
  japonaise: "japonais",
  indienne: "indien",
  libanaise: "libanais",
  africaine: "africain",
  vegetarienne: "vegetarien",
  vegetarian: "vegetarien",
  desserts: "dessert",
  streetfood: "street-food",
  fruitsdemer: "fruits-de-mer",
  "fruits-mer": "fruits-de-mer",
  creperie: "crepes",
  crepe: "crepes",
  peruvienne: "peruvien",
  portugaise: "portugais",
  americaine: "americain",
  ethiopienne: "ethiopien",
  grillade: "grillades",
  coreenne: "coreen",
  grecque: "grec",
  mexicaine: "mexicain",
  marocaine: "marocain",
  thailandais: "thai",
  thailandaise: "thai",
  chinoise: "chinois",
  suissee: "suisse",
});

function cuisineSlug(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function normalizeLocalCuisineSlug(value) {
  const slug = cuisineSlug(value);
  return Object.hasOwn(LOCAL_CUISINE_ALIASES, slug) ? LOCAL_CUISINE_ALIASES[slug] : slug;
}

export function extractLocalCuisineSlugs(value, extraSlugs = []) {
  const fromFreeText = String(value || "")
    .split(/[,;|/]+/)
    .map((part) => part.replace(/\+\s*\d+\s*$/, "").trim());
  return [...fromFreeText, ...(Array.isArray(extraSlugs) ? extraSlugs : [])]
    .map(normalizeLocalCuisineSlug)
    .filter((slug, index, slugs) => Boolean(slug) && slugs.indexOf(slug) === index);
}

export function getLocalCuisineCatalogPrefix(value) {
  const canonicalSlug = normalizeLocalCuisineSlug(value);
  if (!canonicalSlug) return null;

  // The catalog searches substrings, including keywords. A shared prefix keeps
  // candidates such as Pizzeria when requesting pizza; callers must still
  // check exact cuisine membership with extractLocalCuisineSlugs.
  const aliases = Object.entries(LOCAL_CUISINE_ALIASES)
    .filter(([, canonical]) => canonical === canonicalSlug)
    .map(([alias]) => alias);
  let prefix = canonicalSlug;
  for (const alias of aliases) {
    let length = 0;
    while (length < prefix.length && length < alias.length && prefix[length] === alias[length]) {
      length += 1;
    }
    prefix = prefix.slice(0, length);
  }
  return prefix || null;
}
