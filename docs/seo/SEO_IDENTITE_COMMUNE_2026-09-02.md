# Réunification des communes scindées par une variante d'orthographe — 2 septembre 2026

Complète `docs/seo/SEO_INDEXATION_2026-09-02.md`, qui listait ce point comme restant à traiter.

## Le problème

Le slug de commune était dérivé directement de `restaurants.city`. Deux orthographes du même nom
produisaient donc deux pages locales concurrentes et deux jeux d'URL de fiches, divisant l'inventaire
et le signal de la requête locale.

| Commune | Orthographes en base | Effet observé en production |
| --- | --- | --- |
| Carouge | `Carouge` et `Carouge GE` | `/restaurants/carouge` (32 fiches) et `/restaurants/carouge-ge` (76) — **aucun restaurant en commun**, titres quasi identiques |
| Vandœuvres | `Vandoeuvres` et `Vandœuvres` | `/restaurants/vandoeuvres` (2) et `/restaurants/vand-uvres` (1) — deux pages sous le seuil, donc aucune indexée |
| Corsier | `Corsier GE` seulement | `/restaurants/corsier-ge`, pas de scission mais une URL inutilement suffixée |

Deux causes distinctes :

1. **le suffixe cantonal** (`GE`, `VD`, …), déjà traité comme du bruit par
   `restaurant_address_city_is_consistent` en base, mais pas par la chaîne SEO ;
2. **la ligature `œ`**, qui ne se décompose pas en NFD : elle tombait hors de `[a-z0-9]` et produisait
   le slug cassé `vand-uvres`.

## Ce qui a été fait

### Une seule source de vérité pour l'identité de commune

`src/lib/seo/cityIdentity.mjs` expose `cityLabel`, `citySlug`, `isCanonicalCitySpelling`,
`winsCityPathConflict` et `pickOneRestaurantPerPath`. `prerender-seo.mjs` et
`harden-directory-restaurant-seo.mjs` l'importent tous les deux et ne redéfinissent plus rien
localement — un test garantit qu'aucune copie ne réapparaît.

Ce point n'est pas cosmétique : les deux scripts écrivent dans les mêmes fichiers. Tant que chacun
dérivait le chemin à sa manière, le durcissement cherchait les fiches sous l'ancienne orthographe, ne
les trouvait pas, et les laissait sans description enrichie ni lien de revendication — 77 fiches de
Carouge en ont fait les frais pendant un build intermédiaire.

### Un conflit d'URL ne peut plus faire disparaître une page

Deux fiches peuvent revendiquer la même URL une fois les orthographes réunies. `dedupePages` en
gardait une au hasard de l'ordre de lecture. Désormais `winsCityPathConflict` tranche : l'orthographe
canonique l'emporte — c'est elle qui a produit l'URL — puis l'identifiant, pour que deux builds
successifs choisissent la même fiche. Le conflit est journalisé, jamais silencieux.

La règle ne lit volontairement que `city` et `id`, les deux seuls champs que tous les scripts
sélectionnent : une règle plus riche divergerait d'un script à l'autre et l'un réécrirait la fiche de
l'autre avec un titre et une description qui ne parlent pas du même établissement.

### Migration `20260902190000_normalize_carouge_city_variant.sql`

L'index unique `idx_restaurants_city_slug_unique` porte sur `(lower(city), slug)` **sans filtre sur
`is_active`** : renommer une fiche dont le slug existe déjà côté « Carouge » ferait échouer la
migration. Les doublons sont donc fusionnés avant la normalisation, dans cet ordre :

1. reprise des cuisines vérifiées que seule la jumelle portait — 1 lien ;
2. reprise du téléphone public que seule la jumelle renseignait — 3 fiches ;
3. désactivation de la jumelle — 4 fiches, soft delete réversible ;
4. normalisation `Carouge GE` → `Carouge` — 210 fiches ;
5. normalisation `Vandœuvres` → `Vandoeuvres` — 1 fiche, aucune collision.

Les 4 jumelles désactivées conservent leur ancienne ville : l'index unique ne tolérerait pas deux
lignes `(carouge, <slug>)`, même inactive. Aucune ligne n'est supprimée.

Le choix du titulaire est motivé : dans les 4 cas la fiche « Carouge » porte le nom commercial vérifié
et la jumelle « Carouge GE » une variante issue du registre ou du site web — `Le Jardin de Pinchat`
contre `JARDIN-PINCHAT.ch`, par exemple.

### Redirections

`vercel.json` redirige en 301 permanent `/restaurants/carouge-ge`, `/restaurants/vand-uvres` et
`/restaurants/corsier-ge`, ainsi que leurs sous-chemins, vers les URL canoniques.

## Effet mesuré sur le build

| | Avant | Après |
| --- | --- | --- |
| Pages ville pour Carouge | 2 (32 + 76 fiches) | **1** (104 fiches) |
| Pages cuisine Carouge | 3 | **14** |
| Pages ville pour Vandœuvres | 2, toutes deux sous le seuil | **1**, indexable (3 fiches) |
| URLs `carouge-ge` / `vand-uvres` / `corsier-ge` | présentes | **0** |
| Fiches perdues sur conflit d'URL | silencieux | **0**, conflit journalisé |
| Fiches annuaire enrichies | 1681 | 1679 sur 1679 contrôlées |

Sitemaps régénérés sur données de production : 1800 URLs uniques, XML valide, 0 fichier manquant,
0 conflit noindex/sitemap, 0 canonical divergente, aucune route privée.

## Ordre de déploiement, à connaître

Le workflow construit la sortie Vercel **avant** de pousser les migrations. Au premier déploiement, le
prérendu lit donc des données encore non normalisées — c'est précisément pourquoi le garde de conflit
d'URL était nécessaire et non optionnel. La consolidation est déjà complète dans ce build grâce à la
normalisation côté code ; la migration aligne ensuite la base pour que le libellé affiché soit lui
aussi unique.

## Ce qui reste hors périmètre

Les doublons d'établissement au-delà des orthographes de ville. Certaines adresses portent encore
plusieurs fiches sous des noms différents — `Fleurs de Beyrouth`, `FS Management Sàrl`,
`Z&K Sàrl` et `A&l KURDE Sàrl` à Rue Ancienne 23, par exemple. Les distinguer d'établissements
réellement distincts partageant une adresse (`Route des Acacias 30` en héberge plusieurs) demande une
source vérifiable, pas une heuristique. Le garde nom + adresse déjà en place en neutralise 31.
