# Sources - section coûts restaurateur

## Données TOK internes

- Packs de lancement : `supabase/migrations/20260404120000_launch_offer_packs.sql`
- Abonnements restaurateur : `supabase/migrations/20260615001515_restaurateur_onboarding_payment_gate.sql`
- Frais de réservation : `supabase/migrations/20260417120000_reservation_billing_schema.sql`
- Commission comptable TOK : `src/lib/comptaFlow.ts`
- Mise en avant / pricing campagne : `src/lib/campaignPricing.ts`

## Sources concurrentes utilisées

- Uber Eats Merchant pricing : https://merchants.ubereats.com/us/en/pricing/
- Uber Help, marketplace fee changes : https://help.uber.com/merchants-and-restaurants/article/uber-eats-marketplace-fee-changes--?nodeId=2cec9c6f-a7b8-47b5-8cc8-07c8a2c24569
- TheFork Manager, restaurant software price/features : https://www.theforkmanager.com/en/restaurant-software-price
- TheFork Manager, packages Visibility / Performance / Enterprise : https://www.theforkmanager.com/en/blog/thefork-tools/new-packages-thefork-manager
- TheFork Manager, booking widget and direct reservations : https://www.theforkmanager.com/en/restaurant-booking-management
- Just Eat Takeaway.com, rapports et documents investisseurs : https://www.justeattakeaway.com/investors/shareholders-meetings/2025/default.aspx

## Limites

- TheFork ne publie pas un prix universel par couvert ou par réservation sur les pages consultées. Les pages officielles indiquent que le widget direct est sans commission et que le plan/commission applicable dépend du compte/contrat.
- Just Eat Suisse ne publie pas de grille tarifaire restaurateur complète sur les pages publiques consultées. Le rapport annuel JET décrit les catégories de revenus : commissions, frais de paiement, frais administratifs, placements promus et abonnements.
- Uber Eats publie des taux de référence, mais précise que certains frais varient par marché, canal et configuration partenaire.
