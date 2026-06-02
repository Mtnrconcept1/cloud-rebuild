# TOK Payment Skill

À utiliser pour toute modification liée au panier, à la commande, au paiement Stripe, aux webhooks, aux remboursements, aux factures, aux statuts de paiement ou aux reversements restaurateurs.

## Objectif

Garantir qu’un client ne puisse jamais payer une commande perdue, dupliquée, mal tarifée ou impossible à traiter.

## Règles obligatoires

1. Stripe doit rester idempotent.
2. Un webhook Stripe peut être reçu plusieurs fois et dans un ordre inattendu.
3. Ne jamais créer deux commandes pour un même paiement.
4. Ne jamais créer deux transactions réussies pour une même session Stripe.
5. Les prix doivent être recalculés côté serveur avant la création du paiement.
6. Ne jamais faire confiance au total envoyé par le front.
7. Les remises, frais, points, abonnements et promotions doivent être recalculés ou validés côté serveur.
8. Chaque commande payée doit pouvoir être réconciliée avec Stripe.
9. Un paiement réussi sans commande confirmée doit apparaître dans l’admin/support.
10. Une commande payée mais non acceptée par le restaurant doit avoir un flux clair : acceptation, timeout, annulation ou remboursement.

## Données minimales à conserver

Chaque commande ou transaction paiement doit permettre de retrouver :

- `order_id`
- `checkout_id` si utilisé
- `checkout_group_id` si utilisé
- `stripe_checkout_session_id`
- `stripe_payment_intent_id`
- `payment_status`
- `order_status`
- `checkout_session_state`
- montant autoritaire calculé côté serveur
- méthode de paiement
- historique ou audit log des changements critiques

## Machine d’état recommandée

Les statuts doivent rester explicites et compatibles avec les flows existants :

- `pending_payment`
- `confirmed`
- `accepted`
- `preparing`
- `ready`
- `completed`
- `cancelled`
- `refunded`
- `failed`

Ne pas introduire un nouveau statut sans vérifier les dashboards, l’admin, le suivi client, les notifications et les tests.

## Avant de finaliser

- Vérifier `supabase/functions/create-checkout/index.ts`.
- Vérifier `supabase/functions/stripe-webhook/index.ts`.
- Vérifier les helpers de pricing et d’order checkout.
- Vérifier `payment_transactions`.
- Vérifier les logs/audit.
- Ajouter ou mettre à jour un test Vitest ou Playwright.
