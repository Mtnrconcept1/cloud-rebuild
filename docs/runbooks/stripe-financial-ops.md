# Runbook Stripe et reconciliation financiere

## Objectif
Garantir que chaque commande, reservation et remboursement a un etat financier coherent entre Stripe, Supabase et le cockpit admin.

## Configuration live
- Endpoint webhook: `https://wwcrtyoueexyxkkikaos.supabase.co/functions/v1/stripe-webhook`
- Verification obligatoire: `STRIPE_WEBHOOK_SECRET` live, signature Stripe validee, idempotence par event id.
- Evenements minimum: `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed`, `checkout.session.expired`, `payment_intent.succeeded`, `payment_intent.payment_failed`, `charge.refunded`, `invoice.paid`, `invoice.payment_succeeded`, `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`.
- Stripe Connect: chaque restaurant payable doit avoir un compte connecte actif et les requirements Stripe resolus.

## Regles financieres autoritatives
- Reservation classique: 5.00 CHF factures au restaurant lorsqu'elle devient facturable.
- Commande, Zero Attente et Table du Chef: 10% de frais d'application TOK et 90% transferes au compte Connect du restaurant.
- Abonnements, Tok One, credits et services TOK: 100% constituent un revenu TOK.
- Developpeur: 10% du revenu appartenant a TOK uniquement. Les 90% restaurant, la TVA, les remboursements et les chargebacks sont exclus de la base.
- Tous les montants du ledger sont en centimes entiers. Les lignes historiques sont inversees, jamais modifiees.

## Activation Stripe Connect
Le deploiement initialise `finance_runtime_config.connect_routing_enabled` a `false` pour ne pas interrompre la production pendant l'onboarding. Avant activation:
1. Chaque restaurant actif doit avoir termine l'onboarding Stripe Connect.
2. `stripe_connect_details_submitted`, `stripe_connect_charges_enabled` et `stripe_connect_payouts_enabled` doivent etre vrais, sans requirement courant.
3. Effectuer un paiement test mono-restaurant et verifier l'application fee, le transfert et le ledger.
4. Activer le routage uniquement apres validation admin, puis surveiller les premiers paiements live.

Ne jamais reactiver le reversement manuel 90/10 une fois le routage Connect actif.

## Reconciliation quotidienne
1. Ouvrir `/admin/compta` et verifier la carte `Ecart financier a verifier`.
2. Aucun dossier ne doit rester en capture manquante, paiement echoue non traite ou remboursement pending.
3. Comparer `orders`, `reservations`, `payment_transactions`, factures restaurants et exports Stripe.
4. Verifier que chaque paiement Stripe paye possede des ecritures equilibrees dans `financial_ledger` et qu'aucune ligne `finance_reconciliation_suspense` ne reste ouverte.
5. Controler les remboursements dans `/admin/commandes-reservations`, puis executer le remboursement Stripe ou le marquage manuel avec justification.
6. Verifier les alertes Sentry et les logs `edge_function_audit_logs` pour `stripe-webhook`, `process-refund`, `create-checkout` et `complete-order-checkout`.

## Incidents
- Webhook falsifie: verifier que l'appel retourne une erreur de signature et ne cree aucune mutation metier.
- Paiement confirme non capture: bloquer la livraison/retrait, relancer verification Stripe, puis corriger `payment_status` uniquement apres preuve Stripe.
- Remboursement partiel: conserver le montant rembourse, le reste a rembourser et la raison dans les colonnes de refund.
- Ecart facture restaurant: suspendre la facture, corriger les lignes sources, regenerer la facture et journaliser l'action admin.

