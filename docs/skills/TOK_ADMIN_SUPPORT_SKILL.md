# TOK Admin Support Skill

À utiliser pour toute modification liée à l’admin TOK, au support client, au support restaurant, aux litiges, remboursements, commandes bloquées, paiements anormaux ou incidents opérationnels.

## Objectif

Permettre à l’équipe TOK de comprendre et corriger rapidement un problème critique : paiement réussi sans commande confirmée, restaurant non notifié, commande bloquée, réservation introuvable, client à rembourser ou incident restaurateur.

## Règles obligatoires

1. L’admin doit pouvoir retrouver une commande rapidement.
2. La recherche admin doit permettre de filtrer par commande, client, restaurant, statut, date et identifiants Stripe.
3. L’admin doit voir les commandes payées mais non confirmées.
4. L’admin doit voir les commandes bloquées en attente de paiement, webhook, acceptation restaurant ou remboursement.
5. L’admin doit voir les paiements sans commande liée.
6. L’admin doit pouvoir comprendre l’historique de statut d’une commande.
7. L’admin doit pouvoir déclencher ou préparer annulation/remboursement selon les règles du produit.
8. Toute action admin sensible doit être auditée.
9. Un restaurateur ne doit jamais voir les commandes d’un autre restaurant.
10. Les écrans admin ne doivent jamais reposer uniquement sur un bouton caché ou une route non visible pour la sécurité.

## Recherche minimale attendue

Les vues support/admin doivent pouvoir retrouver une opération par :

- `order_id`
- numéro de commande
- client
- restaurant
- `stripe_checkout_session_id`
- `stripe_payment_intent_id`
- date
- statut paiement
- statut commande
- type d’incident

## Incidents critiques à détecter

- paiement réussi sans commande confirmée
- commande confirmée sans transaction réussie
- commande en `pending_payment` trop longtemps
- webhook Stripe en échec
- restaurant non notifié
- commande payée non acceptée par restaurant
- remboursement nécessaire non traité
- réservation confirmée mais invisible pour le restaurant

## Avant de finaliser

- Vérifier les filtres admin.
- Vérifier les permissions admin.
- Vérifier les permissions restaurateur.
- Vérifier les audit logs.
- Vérifier que les identifiants Stripe sont visibles aux admins autorisés.
- Ajouter ou mettre à jour un test si une vue ou action critique change.
