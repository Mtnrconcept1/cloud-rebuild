# TOK Connect — échec Checkout à emporter hors horaire de service

**Diagnostic : 17 octobre 2026. Risque : critique (commandes, capacité, Stripe).**

## Preuve de l'incident

Le client TOK a demandé une commande à emporter chez Les Brasseurs pour le **18 octobre 2026 à 19:00 Europe/Zurich**, pour **21 CHF**.

La commande a été créée à **2026-10-17 04:51:14 UTC**, avec le `checkout_id` et la clé d'idempotence associés à la tentative du widget. Elle est restée `status=pending` et `payment_status=pending`. La table `payment_attempts` ne contient aucune tentative correspondante, et aucun nouveau Checkout Stripe Live n'apparaît au moment de l'incident. Le registre `tok_connect_mcp_action_idempotency` contient un échec `HTTP 500` avec `retry_safe=false`.

Le journal d'audit montre `validate-order:preview_order_pricing = success`, puis `validate-order:validate_and_create_order = failure` avec un message vide. Le déclencheur `tg_orders_guard_acceptance_capacity` recalcule la capacité lors du passage vers `pending_payment`, à partir de `COALESCE(NEW.scheduled_at, NEW.created_at)`.

Le code `validate-order` vérifiait correctement la capacité au créneau fourni par `resolveCapacityRequestedAt`, puis écrivait `scheduled_at: scheduledDelivery?.scheduledAt || null`. Pour **à emporter**, `scheduledDelivery` était nécessairement `null`, et donc `scheduled_at` demeurait `null`.

La fonction STABLE `get_profile_order_window`, interrogée en lecture seule sur les horaires réels de ce restaurant, confirme :

- Heure de création : `service=lunch`, `open=false`, `reason=service_closed`, `message=""`.
- Heure demandée : `service=dinner`, `open=true`.

Le refus et le message vide sont ainsi reproduits sans tentative de paiement.

## Correction applicative proposée

1. Conserver le créneau UTC calculé et vérifié côté serveur lors du devis.
2. Pour les commandes **explicitement planifiées à emporter**, enregistrer ce même instant dans `orders.scheduled_at` avant le passage à `pending_payment`, afin que le déclencheur contrôle le bon service.
3. Vérifier que le timestamp correspond exactement à `pickup_date` et `pickup_time` en **Europe/Zurich** ; rejeter les métadonnées incohérentes. Conserver le fonctionnement des commandes à emporter immédiates, sans date explicite.
4. Ne pas modifier la logique de livraison déjà planifiée, ni la fonction SQL historique, ni la configuration Stripe.
5. Renvoyer un code d'erreur stable et non vide sur les échecs d'UPDATE ; enregistrer seulement l'identifiant et le code technique en logs serveur.

## Acceptation et non-régression

Tests unitaires de l'instant de retrait (heure d'été et d'hiver), créneau absent, format incorrect, décalage de timezone et métadonnées incompatibles. Tests de contrat garantissant que la vérification de capacité et l'UPDATE utilisent le même timestamp.

Après revue/CI et déploiement autorisé : création d'un devis/Checkout en mode Stripe Test sur environnement isolé, webhook signé, commande visible chez restaurateur, notification, idempotence et absence de double débit. Une lecture seule de l'état Stripe et TOK est requise avant tout essai Live consenti.

## Tentative précédente à traiter distinctement

La commande provisoire et sa clé de tentative sont **bloquées** par `retry_safe=false`. Ne pas effacer directement cette preuve, ne pas appeler automatiquement le checkout sous une nouvelle clé et ne pas marquer la commande payée sans preuve. Réconcilier/annuler explicitement cette tentative sous contrôle administratif **après** confirmation qu'aucun Stripe Checkout/PaymentIntent ne lui correspond.

Les erreurs `401 Unauthorized` récurrentes de `stripe-worker` et `reconcile-paid-order-checkouts` constituent une anomalie **distincte** à auditer, sans désactiver les protections d'authentification.

## Retour arrière

Tout code reste dans la PR dédiée. La fermer ou revenir au commit avant modification suffit ; aucune clé, montant, RLS, donnée, service restaurant ou webhook Stripe Live n'est modifié par cette PR.
