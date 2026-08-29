# TOK SEO Skill

À utiliser pour toute modification liée aux pages publiques, restaurants, villes, cuisines, sitemap, meta tags, OpenGraph, canonical, indexation ou données structurées.

## Objectif

Rendre TOK découvrable sur Google sans exposer de pages privées, sans noindex accidentel en production et avec des pages restaurant/locales suffisamment propres pour le SEO.

## Règles obligatoires

1. Ne jamais laisser `noindex` sur les pages publiques de production.
2. Chaque page restaurant publique doit avoir un titre unique.
3. Chaque page restaurant publique doit avoir une meta description utile.
4. Les pages publiques doivent pointer vers le domaine canonique `https://www.thetok.ch` ou le domaine production validé.
5. OpenGraph doit utiliser les bonnes URLs, images et titres.
6. Ajouter ou préserver un `canonical` cohérent.
7. Ajouter `schema.org/Restaurant` sur les pages restaurant quand les données sont disponibles.
8. Ajouter ou préserver le sitemap.
9. Ne jamais indexer les dashboards, pages admin, pages privées, paniers, profils ou URLs sensibles.
10. Les pages ville/cuisine doivent contenir du vrai contenu, pas seulement une grille vide.

## Pages prioritaires

- `/`
- `/recherche`
- `/restaurant/:id`
- pages ville : Genève, Lausanne, Fribourg, Neuchâtel, etc.
- pages cuisine : pizza, burger, sushi, libanais, africain, indien, brunch, desserts
- pages restaurateurs/B2B
- pages bons plans et réservation

## À vérifier avant de finaliser

- `robots.txt`
- headers `x-robots-tag`
- meta robots
- sitemap
- canonical
- OpenGraph
- données structurées
- titres et descriptions uniques
- absence d’indexation des espaces privés

## Fiches restaurant : entité, preuve et fraîcheur

- Générer le titre, la description et le JSON-LD depuis les mêmes données que l'interface.
- Relier `WebPage`, `Restaurant`, `BreadcrumbList` et `Menu` avec des `@id` stables.
- N'émettre `aggregateRating`, `GeoCoordinates`, horaires et actions de réservation que lorsque les données sources les justifient.
- Rendre le fil d'Ariane avec de vrais liens HTML crawlables.
- Afficher une zone visible « Provenance et fraîcheur des informations » avec la date de mise à jour.
- Ne jamais inventer d'horaires, de sous-notes d'avis, de services, de prix ou de disponibilité.
- Garder les démonstrations commerciales et les fiches introuvables en `noindex`.
