# TOK Connect — prévention des commandes fantômes avant Stripe Connect

**Diagnostic : 17 octobre 2026 — paiement Live non disponible tant que Stripe Connect n'est pas activé et vérifié.**

## Problème reproduit

Après correction de l'heure de retrait (PR #884), le client TOK a demandé une Penne carbonara à emporter chez Les Brasseurs, le 18 octobre à 19 h, pour 21 CHF.

L'appel `tok_checkout_customer_cart` a alors été rejeté par le garde-fou de `resolveMarketplaceRouting` :

`MARKETPLACE_CONNECT_ROUTING_NOT_READY`

État confirmé en production, par lectures autorisées :

- `finance_runtime_config.connect_routing_enabled=false`.
- Les Brasseurs n'ont pas de `stripe_account_id`, ni statut `details_submitted`, `charges_enabled` ou `payouts_enabled`.
- Le compte Stripe Live de TOK ne contient aucun compte Connect restaurateur.
- Stripe n'a créé aucun Checkout pour cette opération ; le backend n'a créé aucune ligne `payment_attempts` ni `payment_transactions`.
- TOK avait pourtant persisté une commande `pending_payment` **avant** de tester le routage financier. Cette commande impayée a ensuite été clôturée, après contrôle financier, en `payment_failed` et `payment_status=failed`.

**Ce comportement n'est pas un motif pour désactiver le garde-fou.** En l'absence de compte Connect, Stripe ne peut pas assurer l'acheminement du règlement vers le restaurant.

## Correctif technique

Avant de créer une commande native, la passerelle client TOK Connect appelle `resolveMarketplaceRouting` avec le restaurant, le total CHF vérifié par le serveur, le type de Checkout et le mode `live`.

Le **même contrôle autoritatif** reste dans `create-checkout` : un changement entre le précontrôle et la création de session reste refusé (fail closed).

- Garde désactivé : réponse serveur 503, sans création de commande, avec `retry_safe=true`.
- Restaurant non vérifié : réponse serveur 409, sans création de commande.
- Zéro Attente gratuit : conserve l'exception déjà implémentée dans `resolveMarketplaceRouting`, sans forcer de paiement.
- Réception d'un devis (quote) : aucune mutation financière, même si Connect est désactivé.
- Paiement déjà démarré : conserver la clé d'idempotence et vérifier l'état plutôt que recommencer.

Le nouveau précontrôle est également appliqué à la livraison et aux offres anti-gaspi/flash ; les tests de ces parcours sont adaptés.

## Déblocage opérationnel réel

1. Le propriétaire légal de chaque restaurant éligible accède à [Dashboard restaurant TOK](https://www.thetok.ch/dashboard/restaurant), section **Paiements Stripe Connect**.
2. Il clique **Connecter mon compte Stripe**, puis fournit à Stripe les informations et documents KYC requis, ainsi que son compte de versement **réel et autorisé**. Aucun identifiant bancaire ne doit être saisi dans ChatGPT.
3. La fonction `stripe-connect-status` synchronise ensuite `details_submitted`, `charges_enabled`, `payouts_enabled` et `requirements_due`.
4. Le propriétaire de la plateforme vérifie les comptes, réalise une recette isolée Stripe Test avec webhook et ledger, approuve l'activation du routage `finance_runtime_config.connect_routing_enabled` et surveille les premiers transferts Live.
5. Le Checkout réel n'est créé qu'après confirmation du panier par le client. Une session Stripe **ouverte** n'est jamais présentée comme une commande payée.

Ne jamais assigner le compte Stripe personnel d'un tiers au restaurant, activer `connect_routing_enabled` sans destination vérifiée, inventer des informations KYC ou rediriger les parts restaurateurs sur le compte TOK.

## Critères de recette

- Source métier côté serveur, CHF et pourcentage de commission cohérents.
- Sans Connect : devis OK, Checkout refusé **avant commande** et `retry_safe=true`.
- Après Connect : destination charge correcte, applications fees et transferts cohérents et rapprochés.
- Vérifier idempotence, refus de paiements multiples, webhook signé, compte client, restaurant propriétaire, facture, notification et reprise après panne.
- Le commit validé et la PR sont des étapes distinctes de la **publication de la fonction Edge**. Ne pas annoncer un paiement réel réussi sans preuve Stripe/TOK.

## Retour arrière

Revenir au commit précédant cette PR ou fermer la branche ; aucune migration SQL, aucun secret, aucun compte Stripe et aucun paramètre financier global n'est changé par ce patch.

## Rapprochement supplémentaire

Une autre tentative identique a créé la commande provisoire `b20675bc-3520-4a35-b075-d7c451065a41`. La tentative `f3564b93-5e8f-4a8b-ab01-60cc4539fc96` a reçu le même refus 503, sans session Stripe ni entrée `payment_attempts`, `payment_transactions` ou réserve de stock. Après vérification des invariants, l'ordre a été clôturé avec `status=payment_failed`, `payment_status=failed` et une trace de la cause `marketplace_connect_routing_not_ready`. Aucune recette payante n'est annoncée.
