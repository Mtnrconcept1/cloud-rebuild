# Audit indexation et correctifs SEO — 2 septembre 2026

Périmètre : `https://www.thetok.ch`, dépôt `Mtnrconcept1/cloud-rebuild`, projet Supabase `Tok`
(`wwcrtyoueexyxkkikaos`), hébergement Vercel.

## Ce qui a réellement été mesuré

Aucune donnée Google Search Console n'a pu être consultée : l'environnement d'exécution n'a pas de
session Google authentifiée et aucune connexion manuelle n'est possible depuis une session distante.
Les chiffres ci-dessous proviennent donc de sources vérifiables : requêtes HTTP sur la production,
lecture de la base Supabase et exécution réelle du générateur de sitemaps.

### Production avant correctif

| Mesure | Valeur |
| --- | --- |
| URLs dans les sitemaps | 1824 (1799 restaurants, 22 pages, 3 actualités) |
| Réponses HTTP non-200 | 0 sur 1824 |
| Redirections dans les sitemaps | 0 |
| `sitemap-seo.xml` | **HTTP 404** |
| Soft 404 sur URL inconnue | Aucun : vraie 404 + `noindex,nofollow,noarchive` |
| Canonicals avec paramètres | Aucun : `?utm_source`/`?page` sont bien retirés |
| Routes privées | `X-Robots-Tag: noindex` présent, `/admin` en 307 |

### Base Supabase

| Mesure | Valeur |
| --- | --- |
| Restaurants actifs | 4047 |
| Dont issus de `commercial_prospect_catalog` | 4044, tous créés le 2026-08-31 |
| Exposés au public (RLS `directory_public_name_verified`) | 1683 |
| `price_range` compris entre 1 et 2 | **4049 / 4049 (100 %)** |
| Sans cuisine dans `restaurants.cuisine_type` | 1364 / 1683 (81 %) |
| Cuisine connue dans `restaurant_cuisines` | 1483 / 1683 (88 %) |
| Sans image | 1409 / 1683 (84 %) |
| Sans horaires | 1681 / 1683 (99,9 %) |

Le garde RLS `production_hide_demo_restaurants` / `restaurants_public_select` fonctionne : aucune des
1162 fiches portant une forme juridique (`SA`, `Sàrl`, `GmbH`…) n'est exposée publiquement.

## Problèmes détectés et corrigés

### P0 — 43 pages `/<ville>/pas-cher` en doublon strict de leur page ville

`LOCAL_INTENTS` déclare l'intention `pas-cher` comme `price_range BETWEEN 1 AND 2`. Ce prédicat est
vrai pour **100 %** du catalogue : `/restaurants/<ville>/pas-cher` reprenait donc exactement la même
liste que `/restaurants/<ville>`. Vérifié par comparaison des ensembles de fiches :
Russin 3/3, Soral 3/3, Aïre 4/4, Meyrin 43/43, Carouge GE 76/76, Genève 100/100 — ensembles identiques.

Correctif : garde générique `MAX_LOCAL_PARENT_COVERAGE` (0,8 par défaut). Toute page cuisine, quartier
ou intention qui couvre 80 % ou plus de l'inventaire de sa page ville est servie en
`noindex,follow,noarchive` et exclue du sitemap. Au build final, 73 pages sont déclassées à ce titre :
les 43 pages `pas-cher` déjà publiées, plus 30 combinaisons ville x cuisine qui auraient dégénéré en
doublon une fois `restaurant_cuisines` branché — le garde les a interceptées avant publication.

### P0 — `sitemap-seo.xml` en 404

Ce fichier n'est référencé nulle part : ni dans le dépôt, ni dans `sitemap.xml`. Il s'agit d'une
soumission résiduelle dans Search Console. Correctif : redirection 301 `/sitemap-seo.xml`,
`/sitemap_index.xml` et `/sitemap-index.xml` vers `/sitemap.xml` dans `vercel.json`.

### P1 — 17 pages communales trop minces

`SEO_MIN_LOCAL_RESTAURANTS` valait 1 : 11 pages ne listaient qu'un seul restaurant pour environ
85 mots, 6 en listaient deux. Le plancher passe à 3, aligné sur celui des pages spécialisées.
Les fiches restaurants de ces communes restent indexables et portent l'intention locale.

### P1 — 1164 cuisines vérifiées invisibles du SEO

`prerender-seo.mjs` ne lisait que `restaurants.cuisine_type` (319 fiches renseignées) alors que la
table `restaurant_cuisines` couvre 1483 fiches. Correctif : lecture de `restaurant_cuisines` jointe à
`cuisines`, fusionnée avec le texte libre existant qui reste prioritaire. La lecture est
non bloquante : un échec dégrade l'enrichissement sans casser le build.

Effet : 70 nouvelles pages ville × cuisine réellement pourvues (`geneve/sushi`, `geneve/burger`,
`geneve/kebab`, `geneve/thai`, `geneve/brunch`, `carouge-ge/sushi`, `meyrin/thai`…) et `servesCuisine`
renseigné sur les fiches jusque-là muettes.

### P1 — 30 fiches en doublon strict, 168 titres ambigus

27 groupes de fiches partagent nom **et** adresse dans la même ville (exemple : sept fiches
« Swisscanonica » Route de l'Aéroport, dont le nom porte la société exploitante et non l'enseigne).
72 groupes partagent le nom dans une même ville avec des adresses distinctes — ce sont de vraies
succursales, mais leurs titres étaient identiques.

Correctif :
- même nom **et** même adresse : une seule fiche reste indexable (représentant choisi de façon
  déterministe), les 30 autres passent en `noindex,follow,noarchive` et sortent du sitemap ;
- même nom, adresses distinctes : le titre et le H1 sont suffixés par l'adresse réellement
  enregistrée. Aucune donnée n'est inventée.

### P2 — Maillage interne des fiches

Chaque fiche ne portait que deux liens (ville + recherche). Elle pointe désormais vers sa ville, ses
pages cuisine réellement publiables (seuil ≥ 3 fiches) et ses six voisines les plus proches, calculées
par distance géodésique sur les coordonnées enregistrées.

## Effet mesuré sur les sitemaps

| | Avant (production) | Après (build vérifié) |
| --- | --- | --- |
| URLs totales | 1824 | 1804 |
| Pages `<ville>/pas-cher` en doublon | 43 | **0** |
| Pages ville ou commune | 60 | 43 (17 minces retirées) |
| Fiches en doublon strict | 30 | **0** |
| Pages ville × cuisine pourvues | 14 | **84** |
| Fiches restaurants | 1682 | 1652 |
| URLs en 404 | 0 | **0** |
| Conflits noindex / sitemap | — | **0** |
| Canonical ≠ `<loc>` | — | **0** |

La baisse nette de 20 URLs recouvre un échange favorable : 90 pages en doublon ou trop minces sont
retirées (43 `pas-cher`, 17 communales minces, 30 fiches dupliquées), 70 pages cuisine réellement
pourvues sont ajoutées, et aucune fiche de qualité n'est perdue.

## Ce qui reste à traiter, hors périmètre de ce correctif

Ces points demandent une décision produit ou une source de données, pas un changement de code SEO :

1. **Noms d'enseigne écrasés par la raison sociale.** Pour les groupes en doublon strict, le `slug`
   porte souvent la vraie enseigne (`breaktime`, `soho-coffee-shop`, `swiss-chalet`, `le-cellier`)
   alors que `name` porte l'exploitant. Restaurer l'enseigne exigerait une source vérifiable ; la
   gouvernance `directory_public_name_source` du dépôt l'impose et il ne faut pas la contourner en
   dérivant le nom depuis le slug. Requête d'identification :

   ```sql
   select city, lower(btrim(name)) as nom, lower(btrim(address)) as adresse,
          count(*) as fiches, array_agg(slug order by slug) as slugs
   from restaurants
   where is_active and (is_directory_listing is false or directory_public_name_verified is true)
   group by 1,2,3 having count(*) > 1 order by fiches desc;
   ```

2. **`price_range` uniforme à 1–2 sur tout le catalogue.** Tant que la valeur n'est pas différenciée,
   aucune page « pas cher » ne peut exister honnêtement, et `priceRange` en JSON-LD reste peu
   informatif. Le garde de couverture republiera ces pages automatiquement dès que la donnée
   deviendra discriminante.

3. **Horaires absents sur 99,9 % des fiches et images sur 84 %.** C'est le principal levier de qualité
   restant. Les schémas n'affichent que ce qui est renseigné : aucun horaire ni note n'est inventé.

4. **Search Console.** Voir la section suivante.

## Actions Search Console à effectuer manuellement

Elles requièrent une session Google authentifiée, impossible depuis cette session :

1. Supprimer la soumission résiduelle `sitemap-seo.xml` (la redirection 301 la neutralise déjà côté
   serveur, mais l'entrée restera affichée en erreur tant qu'elle n'est pas retirée).
2. Resoumettre `https://www.thetok.ch/sitemap.xml` après déploiement.
3. Lancer la validation des corrections sur les motifs « Page en double, Google n'a pas sélectionné
   la même page canonique » et « Explorée, actuellement non indexée » — ce sont les deux motifs que
   les 107 pages retirées alimentaient.
4. Inspecter une dizaine d'URL stratégiques seulement (`/restaurants/geneve`,
   `/restaurants/geneve/italien`, `/restaurants/geneve/sushi`, `/restaurants/geneve/burger`,
   quelques fiches). Ne pas demander l'indexation en masse : la découverte doit passer par les
   sitemaps et le maillage interne.

Les effets sur l'indexation ne seront visibles qu'après un nouveau crawl, ce qui prend
généralement de plusieurs jours à plusieurs semaines.

## Validations exécutées

- `pnpm typecheck` — succès
- `pnpm lint` — 0 erreur, 13 avertissements préexistants hors fichiers modifiés
- `npx vitest run` — 456 fichiers, 2282 tests, tous passants
- `pnpm run build:prod` — build Vite + prérendu SEO + durcissement annuaire : succès
- Sitemaps régénérés sur données réelles : XML valide, 1804 URLs uniques, 0 fichier manquant,
  0 conflit noindex, 0 canonical divergente, 0 paramètre d'URL, aucune route privée
- JSON-LD : 120 pages échantillonnées, 0 invalide, 0 note ou avis inventé
