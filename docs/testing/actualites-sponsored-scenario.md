# Scénario Actualités sponsorisées

Ce scénario documente le parcours complet d'une Actualité sponsorisée, depuis le post restaurateur jusqu'à l'attribution de conversion.

## Préconditions

- Le restaurateur possède un restaurant actif avec le module Actualités et le module Campagnes activés.
- Stripe Checkout est configuré pour les campagnes.
- Les migrations Actualités sponsorisées sont appliquées en production.
- L'utilisateur test client n'est ni propriétaire du restaurant, ni administrateur, afin d'éviter les métriques internes.

## Parcours attendu

1. Le restaurateur publie un post depuis `/dashboard/actualites`.
2. Le restaurateur clique sur `Mettre en avant`, choisit budget, durée, stratégie et ciblage.
3. Le checkout Stripe est lancé avec `checkout_kind=campaign`.
4. Après paiement réussi, la campagne liée passe en statut payé et la promotion devient éligible.
5. Le post apparaît dans `/actualites` avec le badge `Sponsorisé`.
6. Une impression sponsorisée est enregistrée sans modifier les métriques organiques.
7. Le client clique sur le post ou sur son CTA.
8. Une commande, une réservation ou une réservation Zéro Attente aboutit.
9. La conversion est attribuée uniquement si un clic sponsorisé payé existe dans la fenêtre d'attribution.
10. Le restaurateur voit les métriques sponsorisées dans `/dashboard/actualites` et `/dashboard/campagnes`.
11. L'admin voit la campagne dans `/admin/actualites`, avec budget, dépense, impressions, clics, CTA, conversions, signaux suspects et actions de suspension/réactivation.

## Garde-fous vérifiés

- Les métriques organiques et sponsorisées restent séparées.
- Les propriétaires du restaurant et les administrateurs sont marqués comme acteurs internes et ne gonflent pas les métriques payantes.
- La rotation sponsorisée est pondérée par budget payé et budget restant.
- Les conversions ne sont comptées qu'après commande ou réservation aboutie.
- Les actions admin de suspension et réactivation sont journalisées dans `audit_log`.

## Tests automatisés liés

- `src/test/actualites-sponsored-sql.test.ts`
- `src/test/supabase-critical-rpc-contracts.test.ts`
- `src/test/sponsored-placement.test.ts`
- `src/test/campaign-pricing.test.ts`
- `src/test/admin-actualites-sponsored.test.ts`
