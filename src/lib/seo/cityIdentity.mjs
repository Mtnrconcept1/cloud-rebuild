// Identité de commune partagée par toute la chaîne SEO.
//
// « Carouge » et « Carouge GE » désignent la même commune. Tant que chaque script dérivait le slug de
// ville à sa manière, une simple variante d'orthographe en base scindait la commune en deux pages
// locales concurrentes et deux jeux d'URL de fiches, divisant l'inventaire et le signal de la requête
// locale. Ce module est la seule source de vérité : prerender-seo.mjs et
// harden-directory-restaurant-seo.mjs doivent produire exactement la même URL et désigner exactement
// le même titulaire en cas de conflit, sans quoi l'un réécrit la fiche de l'autre.

const SWISS_CANTON_SUFFIX =
  /[\s-]+(GE|VD|FR|VS|NE|BE|ZH|TI|JU|BS|BL|AG|SO|LU|SG|TG|GR|SZ|ZG|OW|NW|UR|GL|AR|AI)\s*$/i;

/** Libellé de commune sans son suffixe cantonal. Le suffixe n'est retiré qu'en fin de libellé. */
export function cityLabel(value) {
  return String(value || "").trim().replace(SWISS_CANTON_SUFFIX, "").trim();
}

// « Vandœuvres » et « Vandoeuvres » sont la même commune. La ligature ne se décompose pas en NFD :
// sans cette expansion elle tombe hors de [a-z0-9] et produit le slug cassé « vand-uvres ».
const LIGATURES = [[/\u0153/g, "oe"], [/\u0152/g, "OE"], [/\u00e6/g, "ae"], [/\u00c6/g, "AE"]];

function expandLigatures(value) {
  return LIGATURES.reduce((text, [pattern, replacement]) => text.replace(pattern, replacement), value);
}

/** Slug d'URL d'une commune, insensible au suffixe cantonal et aux ligatures. */
export function citySlug(value) {
  return expandLigatures(cityLabel(value))
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Vrai lorsque la ville stockée est déjà l'orthographe qui a produit l'URL. */
export function isCanonicalCitySpelling(value) {
  return String(value || "").trim() === cityLabel(value);
}

/**
 * Départage deux fiches qui revendiquent la même URL.
 *
 * L'orthographe canonique tranche en premier : c'est elle qui a produit l'URL, sa fiche en est donc le
 * titulaire naturel. L'identifiant tranche ensuite, pour que deux builds successifs choisissent la même.
 * La règle ne lit que `city` et `id` afin de rester calculable à l'identique par tous les scripts,
 * quels que soient les champs que chacun sélectionne.
 */
export function winsCityPathConflict(candidate, rival) {
  const canonical = (entry) => (isCanonicalCitySpelling(entry?.city) ? 1 : 0);
  const delta = canonical(candidate) - canonical(rival);
  if (delta !== 0) return delta > 0;
  return String(candidate?.id ?? "") < String(rival?.id ?? "");
}

/** Ne conserve qu'une fiche par URL, en appliquant `winsCityPathConflict`. */
export function pickOneRestaurantPerPath(entries, pathOf) {
  const byPath = new Map();
  for (const entry of entries) {
    const pathname = pathOf(entry);
    const rival = byPath.get(pathname);
    if (!rival || winsCityPathConflict(entry, rival)) byPath.set(pathname, entry);
  }
  return byPath;
}
