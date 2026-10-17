# TOK Connect — acceptation d'un vrai paiement

**Statut au 17 octobre 2026 : backend Live présent, paiement réel complet via ChatGPT non homologué.**

## Éléments vérifiés en lecture seule

- Stripe TOK : un endpoint webhook **Live actif** vers `https://wwcrtyoueexyxkkikaos.supabase.co/functions/v1/stripe-webhook`, abonné à `checkout.session.completed` et `checkout.session.async_payment_succeeded`.
- Resend : `thetok.ch` est vérifié pour l'envoi. Les confirmations et annulations de réservation d'une précédente recette affichent le statut `delivered`.
- Supabase : les fonctions `create-checkout`, `stripe-webhook`, `payment-attempt-status`, `create-reservation` et les modules TOK Connect sont déployés.
- Le catalogue du MCP contient les outils de devis, Checkout, suivi, réservation, commande et annulation.
- L'identité TOK Connect utilisée lors du diagnostic possède le rôle `restaurateur` mais **pas** le rôle `client` : un devis de commande client a été refusé à juste titre. Ne pas contourner cette séparation.
- Les Brasseurs a des plats réels au menu, mais ses modes de vente à emporter et livraison sont désactivés. Ne pas forcer de commande réelle sur cet établissement.
- La branche Supabase Test de l'ancienne PR #879 a été supprimée à la suite d'un échec de migrations. Ne jamais relancer l'historique SQL sans quarantaine démontrée.

Ces observations ne constituent **pas** un test E2E de paiement : aucun achat Live n'a été débité pendant cette vérification.

## Paiement reçu versus commande finalisée

Un Checkout Stripe `paid` ne signifie pas automatiquement qu'une commande est visible chez le restaurateur. Le webhook doit authentifier la signature, vérifier le mode et le montant, respecter la clé d'idempotence, finaliser la commande native TOK et créer les événements de notification.

La fonction `payment-attempt-status` et le bridge MCP préservent la distinction :

1. `session_bound` : lien Stripe encore payable, commande non confirmée.
2. `paid` : Stripe a reçu le paiement, réconciliation TOK en cours ; **aucun nouveau paiement**.
3. `finalized` + `webhook_received` : le backend TOK a finalisé la tentative ; conserver l'historique et les preuves.
4. `indeterminate` : lookup Stripe impossible, tentative verrouillée, jamais de deuxième Checkout automatique.
5. `cancelled` / `failed` / `expired` : retrouver l'état réel, ne pas réutiliser la même tentative pour une opération différente.

Si TOK a déjà persisté une finalisation signée, une indisponibilité temporaire de l'API Stripe ne doit pas faire revenir l'interface en état non payé.

## Mise en place d'un bac à sable dédié

Le connecteur Supabase indique 10 USD/mois pour un projet supplémentaire Micro (hors usages), contre 0,01344 USD/heure pour une branche. **Une approbation explicite du coût affiché est requise avant la création.**

Pour éviter le risque de replay des migrations de production, privilégier un **nouveau projet dédié**, vide, région eu-central-2, sans copie de données clients. Déployer uniquement un schéma audité depuis les sources contrôlées, puis les fonctions nécessaires au parcours ; ne pas appliquer tout l'historique historique avant d'avoir neutralisé cron, HTTP, Vault, e-mail, livraison et webhooks.

Le contrôleur de la PR #882 (`scripts/verify-tok-stripe-test-webhooks.mjs`) doit être exécuté avec une cible de test explicite. Une vraie clé `sk_test_` et un webhook signé pointant exclusivement vers ce projet sont obligatoires. Ne pas réactiver les anciens webhooks Test visant la production.

## Recette obligatoire avant ouverture commerciale

- Utiliser deux **comptes autorisés distincts** : client et propriétaire d'un restaurant de démonstration. Le client ne doit accéder ni aux commandes d'autrui ni aux données d'autres restaurants.
- Activer uniquement les créneaux et modalités prévus sur le restaurant de démonstration. Vérifier les refus quand les services sont désactivés.
- Réservation classique : devis, éventuelle garantie, demande réelle, acceptation restaurateur, affichage dans les deux espaces, notifications et annulation contrôlée.
- Commander : devis serveur avec prix CHF et mode, confirmation explicite, ouverture Checkout Stripe Test, paiement avec carte de test, webhook signé, `payment_attempts.finalized`, `orders.payment_status`, puis réception client et restaurateur.
- Répéter l'événement webhook, réessayer Checkout avec la même clé, simuler une expiration, une déconnexion OAuth et une panne Stripe ; aucun double débit ni double commande ne doit apparaître.
- Valider Zéro Attente, anti-gaspi, vente flash, Tok d'Or, commandes à emporter, livraison, formules et abonnement uniquement selon leurs prérequis métier réels.
- Vérifier RLS, absence de fuite des secrets, autorisations par rôle et support opérationnel en cas de paiement `paid` sans finalisation.
- Tester les livraisons et e-mails **sur identités de recette** pour ne pas contacter de vraies personnes.
- Faire ensuite un unique micro-achat Live **consenti par un vrai payeur**, avec produit, prix, destinataire et conditions affichés avant confirmation, puis rapprochement en lecture seule Stripe/TOK. Ne pas lancer de prélèvement de test sur un client réel sans consentement et instructions de remboursement.

## Critères de refus de mise en production

Bloquer toute activation générale s'il manque la preuve du paiement relié à une commande persistée, s'il existe un webhook Test actif vers la production, si une session payée est marquée réessayable comme nouveau paiement, si les droits client/restaurateur se mélangent, ou si la recette ne démontre pas la réception des notifications.

## Retour arrière

Toutes les modifications applicatives doivent rester sur branche et PR jusqu'à vérification ; ne pas modifier `main` directement. Pour la correction de projection de statut, fermer la PR ou revenir à son commit parent. Aucune donnée de production, clé Stripe, flux de facturation ni webhook ne sont changés par cette documentation.
