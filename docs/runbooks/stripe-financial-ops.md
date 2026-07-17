# Runbook Stripe et reconciliation financiere

## Objectif
Garantir que chaque commande, reservation et remboursement a un etat financier coherent entre Stripe, Supabase et le cockpit admin.

## Configuration live
- Endpoint webhook: `https://wwcrtyoueexyxkkikaos.supabase.co/functions/v1/stripe-webhook`
- Verification obligatoire: `STRIPE_WEBHOOK_SECRET` live, signature Stripe validee, idempotence par event id.
- Evenements minimum: `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed`, `checkout.session.expired`, `payment_intent.succeeded`, `payment_intent.payment_failed`, `charge.refunded`, `invoice.paid`, `invoice.payment_succeeded`, `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`.
- Stripe Connect: chaque restaurant payable doit avoir un compte connecte actif et les requirements Stripe resolus.

## Regles financieres autoritatives
- Reservation classique: 5.00 CHF factures au restaurant lorsqu'elle devient facturable, soit 4.50 CHF pour TOK et 0.50 CHF pour le developpeur.
- Commande, Zero Attente et Table du Chef: 90% transferes au compte Connect du restaurant, 9% restent a TOK et 1% revient au developpeur.
- Le flux Stripe d'une commande utilise une destination charge: 90% restaurant et 10% application fee plateforme. Le ledger isole ensuite 1% du brut dans `developer_payable`, laissant 9% a TOK.
- Abonnements, Tok One, credits et services TOK: 100% constituent un revenu TOK avant la part contractuelle du developpeur.
- Developpeur: 10% du revenu appartenant a TOK uniquement. Les 90% restaurant, la TVA, les remboursements et les chargebacks sont exclus de la base.
- Les frais de traitement Stripe sont comptabilises separement et ne changent jamais les pourcentages contractuels. Ils restent a la charge de la plateforme tant que le contrat ne dit pas autrement.
- Tous les montants du ledger sont en centimes entiers. Les lignes historiques sont inversees, jamais modifiees.

## Activation Stripe Connect
Le deploiement initialise `finance_runtime_config.connect_routing_enabled` a `false` pour ne pas interrompre la production pendant l'onboarding. Avant activation:
1. Chaque restaurant actif doit avoir termine l'onboarding Stripe Connect.
2. `stripe_connect_details_submitted`, `stripe_connect_charges_enabled` et `stripe_connect_payouts_enabled` doivent etre vrais, sans requirement courant.
3. Effectuer un paiement test mono-restaurant et verifier l'application fee, le transfert et le ledger.
4. Activer le routage uniquement apres validation admin, puis surveiller les premiers paiements live.

Ne jamais reactiver le reversement manuel 90/10 une fois le routage Connect actif.

## Versement Stripe Connect au developpeur
La part developpeur est versee depuis un releve mensuel valide, et non depuis un montant fourni par le navigateur. Cette methode permet de deduire les remboursements et chargebacks avant le virement.

1. Configurer le compte Connect du developpeur avec `admin_configure_developer_connect_transfer`.
2. Laisser `developer_connect_transfers_enabled = false` tant que `details_submitted`, `payouts_enabled` et la capacite `transfers` ne sont pas actifs.
3. Rafraichir le releve avec `refresh_developer_statement`; il prend la somme exacte de `developer_payable` et exclut Stripe Test.
4. Valider le montant exact avec `admin_validate_developer_statement(statement_id, expected_amount_cents)`.
5. Executer d'abord `settle-developer-statement` en mode `test`. Le test ne marque jamais le releve paye.
6. Apres reconciliation, executer le meme endpoint en mode `live`. La cle d'idempotence est stable; une coupure reseau ou un double clic ne peut pas produire deux virements.
7. Le succes live est la seule transition autorisee de `validated` vers `paid`.

Exemples de controle:
- 1 reservation facturee 5.00 CHF: `developer_payable = 50` centimes et TOK net = 450 centimes.
- 1 commande de 100.00 CHF: restaurateur = 9'000 centimes, developpeur = 100 centimes et TOK net = 900 centimes.

## Reconciliation quotidienne
1. Ouvrir `/admin/compta` et verifier la carte `Ecart financier a verifier`.
2. Aucun dossier ne doit rester en capture manquante, paiement echoue non traite ou remboursement pending.
3. Comparer `orders`, `reservations`, `payment_transactions`, factures restaurants et exports Stripe.
4. Verifier que chaque paiement Stripe paye possede des ecritures equilibrees dans `financial_ledger` et qu'aucune ligne `finance_reconciliation_suspense` ne reste ouverte.
5. Verifier que les releves developpeur payes ont exactement un `developer_stripe_transfers.status = 'succeeded'` et un identifiant Stripe `tr_...`.
6. Controler les remboursements dans `/admin/commandes-reservations`, puis executer le remboursement Stripe ou le marquage manuel avec justification.
7. Verifier les alertes Sentry et les logs `edge_function_audit_logs` pour `stripe-webhook`, `process-refund`, `create-checkout`, `settle-developer-statement` et `complete-order-checkout`.

## Incidents
- Webhook falsifie: verifier que l'appel retourne une erreur de signature et ne cree aucune mutation metier.
- Paiement confirme non capture: bloquer la livraison/retrait, relancer verification Stripe, puis corriger `payment_status` uniquement apres preuve Stripe.
- Remboursement partiel: conserver le montant rembourse, le reste a rembourser et la raison dans les colonnes de refund.
- Ecart facture restaurant: suspendre la facture, corriger les lignes sources, regenerer la facture et journaliser l'action admin.

