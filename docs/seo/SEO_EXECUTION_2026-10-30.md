# Exécution SEO TOK — 30 octobre 2026

## Périmètre et stratégie

TOK combine un annuaire public, une marketplace de réservation/commande quand les services sont activés et des outils restaurateurs. Priorité : Suisse romande, français suisse (`fr-CH`), Genève et communes disposant d'un inventaire public. Lausanne est un marché d'expansion ; ne pas indexer sa page avant de disposer d'adresses publiques suffisantes et de contenu vérifié.

Objectifs distincts : marque (TOK), découverte locale (commune/cuisine/lieu), transaction (réservation/commande réellement disponible), acquisition restaurateur et information pratique. Les filtres interactifs ne constituent pas automatiquement des pages SEO. Une intention, une page principale ; les variantes lexicales partagent cette page.

Avantage à documenter avec des preuves : services réellement disponibles, transparence entre fiche annuaire et partenaire, proximité des lieux de sortie, conditions et coût réel pour le restaurateur. Ne pas prétendre à une disponibilité temps réel ou à un partenariat absent.

## Carte de 20 groupes de requêtes

Ce sont des groupes de travail, pas des estimations de volume ni des promesses de position. Les impressions, clics et CTR se mesurent dans Search Console ; les conversions sont des réservations/commandes confirmées ou contacts restaurateurs qualifiés, jamais de simples clics sur un bouton.

| Groupe et variantes | Intention | Page principale | KPI de résultat |
|---|---|---|---|
| restaurant Genève, restaurants Genève | Découvrir/comparer | `/restaurants/geneve` | Clics qualifiés vers les fiches ; réservations confirmées |
| restaurant Carouge, restaurants Carouge | Découvrir/comparer | `/restaurants/carouge` | Clics fiches ; réservations confirmées |
| restaurant italien Carouge | Comparer/agir | `/restaurants/carouge/italien` | Clics fiches ; conversions confirmées |
| restaurant italien Genève | Comparer/agir | `/restaurants/geneve/italien` | Clics fiches ; conversions confirmées |
| pizzeria Genève, pizza Genève | Comparer/agir | `/restaurants/geneve/pizza` | Commandes confirmées si le service est disponible |
| sushi Genève | Comparer/agir | `/restaurants/geneve/sushi` | Commandes/réservations confirmées |
| restaurant japonais Genève | Comparer/agir | `/restaurants/geneve/japonais` | Clics fiches ; conversions confirmées |
| restaurant libanais Genève | Comparer/agir | `/restaurants/geneve/libanais` | Clics fiches ; conversions confirmées |
| restaurant indien Genève | Comparer/agir | `/restaurants/geneve/indien` | Clics fiches ; conversions confirmées |
| restaurant chinois Genève | Comparer/agir | `/restaurants/geneve/chinois` | Clics fiches ; conversions confirmées |
| restaurant français Genève | Comparer/agir | `/restaurants/geneve/francais` | Clics fiches ; conversions confirmées |
| restaurant thaï Genève | Comparer/agir | `/restaurants/geneve/thai` | Clics fiches ; conversions confirmées |
| restaurant asiatique Genève | Comparer/agir | `/restaurants/geneve/asiatique` | Clics fiches ; conversions confirmées |
| cuisine suisse Genève | Comparer/agir | `/restaurants/geneve/suisse` | Clics fiches ; conversions confirmées |
| bistrot Genève | Comparer/agir | `/restaurants/geneve/bistro` | Clics fiches ; conversions confirmées |
| restaurant Meyrin | Découvrir/comparer | `/restaurants/meyrin` | Clics fiches ; conversions confirmées |
| restaurant près Arena Genève | Découvrir/planifier | `/restaurants-pres/arena-de-geneve` | Clics vers une fiche utile |
| plateforme restaurateur Genève | Comparer/contacter | `/restaurateurs/geneve` | Contacts restaurateurs qualifiés |
| alternative commission par couvert | Comparer/contacter | `/restaurateurs/alternative-commission-couvert` | Contacts qualifiés et partenaires activés |
| réservation directe Google Business | Comprendre/agir | `/restaurateurs/google-business` | Contacts qualifiés et intégrations réellement activées |

Le groupe « TOK restaurant » relève de la marque et cible l'accueil. Les recherches d'enseignes ciblent leur fiche canonique. Les pages sans inventaire public ne deviennent pas des cibles d'acquisition par simple ajout de texte.

## Architecture et conventions

- Accueil → recherche / plan des adresses → commune, cuisine, lieu → fiche restaurant.
- Services et informations : pages restaurateurs, packs, à propos, contact, aide et conditions ; seuls les services publiquement activés entrent dans le sitemap.
- Fiche canonique : `/restaurants/<commune>/r/<slug>`. Ancienne entrée `/restaurant/<uuid>` : redirection HTTP 301 uniquement vers une fiche finale publique, indexable et auto-canonique. GET/HEAD inconnus : vraie 404 compréhensible ; POST et espaces privés inchangés.
- Slugs stables, minuscules, mots séparés par tirets ; ne pas traduire les URL sans véritable version éditoriale et `hreflang` réciproque. Une seule langue française ne justifie pas des variantes fictives.
- Suppression sans remplacement équivalent : 404/410. Remplacement du même établissement : 301 vers la fiche équivalente validée, sans chaîne. Fermeture temporaire : conserver seulement avec une information visible fiable. Ne pas rediriger toutes les suppressions vers l'accueil.
- `lastmod` correspond à une révision significative des données/contenus, pas à l'heure de chaque build.
- Aucune fiche Business Profile par partenaire sans mandat de gestion ; l'annuaire en ligne ne prouve pas l'éligibilité de TOK à un établissement recevant les clients.

## Contrôles ajoutés

Employer `pnpm exec node scripts/seo-artifact-audit.mjs --dir dist --output seo-audit.json`, ou `pnpm seo:audit` pour le dossier `dist` par défaut.

L'audit lit les sitemaps XML et le HTML final sans réseau et sans exécuter de scripts. Il bloque : XML invalide, URL non canonique, date invalide/future, cycles de sitemap, dépassement des limites, URL privée, fichier absent, titres manquants/doublons, H1 absent/multiple, description absente, canonique contradictoire, `noindex`/`googlebot noindex`, JSON-LD invalide et interdiction globale du crawl. Il signale les images sans `alt` et les pages hors du graphe de navigation de l'accueil.

Le plan `/decouvrir` utilise exclusivement les URL finales des sitemaps après durcissement. Sa navigation est visible hors de la racine React, y compris après hydratation. La page reste utilisable sans JavaScript. Aucun inventaire privé, avis, tarif ou service fictif n'y est ajouté. Les doublons et pages déclassées ne sont pas réintroduits.

Le contrôle après déploiement valide la structure XML et les dates effectives ; il ne réclame plus une date figée. Ces validations ne remplacent ni le Rich Results Test, ni le rendu Google, ni les données terrain Web Vitals.

## Backlog et objectifs

Priorité de travail : impact × confiance ÷ effort, réévaluation mensuelle. Les niveaux sont des estimations internes, sans métrique Google associée.

| Travail | Impact /5 | Confiance | Effort en jours | Responsable fonctionnel | Critère de sortie |
|---|---:|---:|---:|---|---|
| Canonicalisation des entrées UUID | 5 | 1,0 | 2 | Développement | 301 vers cible publique ; inconnus en 404 ; query conservée |
| Maillage et plan des adresses | 4 | 1,0 | 1 | Développement/SEO | Aucune page de sitemap orpheline dans le HTML final |
| Contrôle automatique de l'artefact | 5 | 0,9 | 1 | Développement | Build bloqué sur erreurs critiques et tests de régression verts |
| Attribution organique et conversions | 5 | 0,8 | 3 | Produit/mesure | Une conversion confirmée reliée à une entrée SEO, avec choix de confidentialité respectés |
| Gouvernance des sources publiques | 5 | 0,9 | 2 | Catalogue/produit | Sélection des sources documentée, retraits et pertes de visibilité expliqués |
| Dix fiches stratégiques enrichies | 4 | 0,8 | 5 | Éditorial/restaurateurs | Photos originales autorisées, informations vérifiées, aide au choix concrète |
| Validation Rich Results | 3 | 0,9 | 1 | SEO | Échantillon par template sans erreur, cohérence avec contenu visible |
| Mesure mobile LCP/INP/CLS | 4 | 0,8 | 3 | Performance/mesure | Valeurs au 75e percentile par famille si volume suffisant |
| Couverture Lausanne | 4 | 0,6 | 8 | Catalogue/partenariats | Inventaire public réel, fiche complète et contenu local distinct |
| Mentions et co-créations locales | 3 | 0,6 | 5 | Communication | Mention éditoriale utile obtenue, sans achat de liens manipulatoire |

- **30 jours** : vérifier la publication des corrections, traiter les alertes d'indexation par famille, confirmer les conversions organiques, conserver le point zéro et un journal des déploiements.
- **60 jours** : enrichir dix pages prioritaires avec de vraies données originales, vérifier leur indexation, améliorer les fiches incomplètes avant d'étendre les communes.
- **90 jours** : comparer les périodes de 28 jours et les conversions, examiner les requêtes 4–15 et le CTR, revoir le trimestre suivant sur les données réelles. Ne pas attribuer automatiquement une variation à un changement isolé.

Les réservations tests doivent être faites en recette ; aucune commande payée, sollicitation d'avis, prise de contact presse ou modification de fiche partenaire n'est déclenchée par ce document.

## Références primaires

- [SEO JavaScript Google](https://developers.google.com/search/docs/crawling-indexing/javascript/javascript-seo-basics)
- [Sitemaps Google](https://developers.google.com/search/docs/crawling-indexing/sitemaps/build-sitemap)
- [Canonicalisation Google](https://developers.google.com/search/docs/crawling-indexing/consolidate-duplicate-urls)
- [Routing Middleware Vercel](https://vercel.com/docs/routing-middleware)
- [Association des commerçants de Carouge — cafés/restaurants](https://commerces-carouge.ch/commerces/cafes-restaurants/) : source sectorielle locale à étudier, sans contact automatique.

## Livraison et retour arrière

Risque standard pour le contenu/maillage et critique pour la publication du routage. Les nouveaux scripts restent en lecture sur la production ; ils écrivent uniquement l'artefact local. Pas de migration ni de changement RLS, de secret ou de catalogue. Retour arrière : revert de la PR, reconstruction et redéploiement par le workflow habituel. Les mesures privées et exports Search Console restent dans le rapport remis au propriétaire, pas dans le dépôt public.
