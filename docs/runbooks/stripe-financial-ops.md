# Runbook Stripe et reconciliation financiere

## Objectif
Garantir que chaque commande, reservation et remboursement a un etat financier coherent entre Stripe, Supabase et le cockpit admin.

## Configuration live
- Endpoint webhook: `https://wwcrtyoueexyxkkikaos.supabase.co/functions/v1/stripe-webhook`
- Verification obligatoire: `STRIPE_WEBHOOK_SECRET` live, signature Stripe validee, idempotence par event id.
- Evenements minimum: `checkout.session.completed`, `checkout.session.expired`, `payment_intent.succeeded`, `payment_intent.payment_failed`, `charge.refunded`, `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`.
- Stripe Connect: chaque restaurant payable doit avoir un compte connecte actif et les requirements Stripe resolus.

## Reconciliation quotidienne
1. Ouvrir `/admin/compta` et verifier la carte `Ecart financier a verifier`.
2. Aucun dossier ne doit rester en capture manquante, paiement echoue non traite ou remboursement pending.
3. Comparer `orders`, `reservations`, `payment_transactions`, factures restaurants et exports Stripe.
4. Controler les remboursements dans `/admin/commandes-reservations`, puis executer le remboursement Stripe ou le marquage manuel avec justification.
5. Verifier les alertes Sentry et les logs `edge_function_audit_logs` pour `stripe-webhook`, `process-refund`, `create-checkout` et `complete-order-checkout`.

## Incidents
- Webhook falsifie: verifier que l'appel retourne une erreur de signature et ne cree aucune mutation metier.
- Paiement confirme non capture: bloquer la livraison/retrait, relancer verification Stripe, puis corriger `payment_status` uniquement apres preuve Stripe.
- Remboursement partiel: conserver le montant rembourse, le reste a rembourser et la raison dans les colonnes de refund.
- Ecart facture restaurant: suspendre la facture, corriger les lignes sources, regenerer la facture et journaliser l'action admin.

