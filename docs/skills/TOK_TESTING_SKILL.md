# TOK Testing Skill

À utiliser pour toute modification critique liée aux paiements, commandes, réservations, Supabase, RLS, admin, notifications, sécurité, SEO, migrations SQL, Storage ou IA.

## Objectif

Empêcher qu’une modification apparemment simple casse une commande payée, une réservation, un accès admin/restaurateur, une policy RLS, une migration ou une page publique importante.

## Règles obligatoires

1. Toute modification critique doit ajouter ou mettre à jour un test.
2. Les tests doivent protéger le comportement métier, pas seulement l’implémentation.
3. Les tests autour du paiement doivent couvrir l’idempotence et la réconciliation Stripe.
4. Les tests autour de Supabase doivent vérifier migrations, policies, fonctions et indexes quand c’est pertinent.
5. Les tests front doivent vérifier les parcours utilisateurs critiques.
6. Les tests ne doivent pas dépendre d’un environnement production réel.
7. Ne jamais supprimer un test qui protège un bug connu sans le remplacer.
8. Ajouter un guard test textuel si le repo utilise déjà ce pattern pour protéger une règle critique.

## Zones qui exigent des tests

- `create-checkout`
- `stripe-webhook`
- helpers de pricing
- création et finalisation de commande
- remboursement ou annulation
- réservation normale, Zero Attente et Chefs Table
- RLS et migrations sensibles
- dashboards restaurant et admin
- notifications critiques
- SEO public
- uploads Storage
- IA coûteuse ou visible publiquement

## Parcours critiques à protéger

1. Client crée un panier.
2. Client paie.
3. Webhook Stripe confirme.
4. Commande devient confirmée.
5. Restaurant reçoit la commande.
6. Restaurant accepte ou refuse.
7. Client reçoit le statut.
8. Admin retrouve la commande.
9. Remboursement ou annulation reste traçable.

## Commandes de validation attendues

Selon la modification :

- `pnpm lint`
- `pnpm test`
- `pnpm build`
- test Playwright ciblé si parcours navigateur
- vérification Supabase doctor/target si migration ou production DB

## Avant de finaliser

- Expliquer quels tests ont été ajoutés ou mis à jour.
- Expliquer quels tests n’ont pas été lancés si l’environnement ne le permet pas.
- Ne pas prétendre qu’un test a été exécuté s’il ne l’a pas été.
