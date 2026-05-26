# Abonnements Et Entitlements Design

**Statut** : design retenu, en attente de revue utilisateur avant plan d'implementation.

## Objectif

Aligner les fonctionnalites disponibles avec les offres de l'application pour :

- les abonnements client : Tok One et abonnement repas ;
- les offres restaurateur : packs de lancement Decouverte, Essentiel, Pro et Premium.

La source de verite produit est le texte deja present dans l'application : pages commerciales, FAQ/Aide, CGU et seeds Supabase existants.

## Constat actuel

### Tok One

Tok One existe deja comme abonnement Stripe dans `create-checkout`, `stripe-webhook`, `tok_one_subscriptions`, `useTokOne`, `TokOne`, `Panier`, `ZeroAttente` et `Profil`.

Les avantages appliques aujourd'hui sont surtout :

- statut actif/trialing ;
- reduction panier via `subscription_benefits.discount_percentage`, avec fallback 20% ;
- livraison offerte via `subscription_benefits.free_delivery` ou `free_delivery_min_order` ;
- historique profil et metadata de commande.

Les textes promettent aussi :

- acces prioritaire La Table du Chef et evenements gastronomiques ;
- acces anticipe ventes flash ;
- support prioritaire ;
- offres surprises ;
- configuration admin claire des avantages.

Ces avantages ne sont pas encore modelises comme droits explicites et l'admin ne permet pas de configurer les `subscription_benefits` autrement que par champs de plan partiels.

### Abonnement repas

La page `/abonnement` permet de choisir des plats par jour et de remplir le panier. Les textes de l'app disent que l'abonnement se renouvelle chaque semaine, peut etre mis en pause et conserve les parametres.

Aujourd'hui, il manque :

- contrainte d'unicite par utilisateur + jour ;
- statut global actif/pause ;
- reprise fiable des parametres apres reload ;
- generation de panier basee sur une configuration propre ;
- separation claire entre "configuration recurrente" et "commande a payer maintenant".

L'iteration ne doit pas declencher des paiements automatiques sans validation explicite du client. Elle prepare une configuration recurrente fiable et une generation de panier controlee.

### Packs restaurateur

Les packs sont seedes dans `20260404120000_launch_offer_packs.sql` :

- Decouverte : mise en place, creation menu jusqu'a 20 plats ;
- Essentiel : Decouverte + 10 photos produits + reseaux sociaux ;
- Pro : Essentiel + menu illimite, 25 photos, 1 campagne avec 200 CHF, plan de salle ;
- Premium : Pro + photos completes, 3 campagnes avec 500 CHF, 3 mois de gestion reseaux sociaux, account manager.

Le frontend a deja `packFeatureGating.ts`, le dashboard pack, l'admin packs, le paiement launch-pack et le suivi des fulfillments.

Le probleme principal est la duplication de la logique pack -> fonctionnalites dans le webhook Stripe. Le webhook ne connait pas `dashboard-actualites`, alors que le frontend le debloque via `social_media_setup`. Les droits restaurateur peuvent donc diverger selon le point d'entree.

## Approche retenue

Mettre en place une couche d'entitlements centralisee, sans refonte billing complete.

Cette couche transforme une offre en droits concrets :

- droits client Tok One ;
- droits de configuration abonnement repas ;
- droits restaurateur issus des packs.

La logique doit etre partagee par l'UI, les tests et les flows Edge quand c'est possible. Pour les Edge Functions Deno, on duplique le minimum sous forme de helper partage dans `supabase/functions/_shared` ou on garde une implementation SQL/JSON testee qui suit le meme contrat.

## Design fonctionnel

### 1. Tok One

Creer un catalogue explicite des avantages Tok One :

- `free_delivery` : livraison offerte selon seuil et contexte ;
- `discount_percentage` : reduction configurable, fallback 20% si aucun avantage configure ;
- `chef_table_priority` : badge et message prioritaire sur La Table du Chef ;
- `flash_early_access` : badge et filtrage UI pour ventes flash en avance lorsque la donnee le permet ;
- `priority_support` : badge et routage de contexte support ;
- `surprise_offers` : affichage dans Tok One/Profil, pret pour offres futures.

Les avantages existants `subscription_benefits` restent compatibles. Les types non financiers servent d'abord a l'affichage, a l'activation UI et aux metadata, sans inventer de remise non configuree.

Admin :

- enrichir `AdminLoyalty` pour lire et editer les avantages d'un plan ;
- proposer des controles simples pour pourcentage, seuil livraison, contextes et toggles d'avantages non financiers ;
- stocker chaque avantage dans `subscription_benefits`.

Client :

- Tok One affiche les avantages reels du plan selectionne ;
- Profil affiche avantages actifs, paiements, economies et statut ;
- Panier/Zero Attente continuent d'utiliser les avantages financiers calcules depuis la meme source.

### 2. Abonnement repas

Conserver la table existante `user_subscriptions` comme liste de slots hebdomadaires, mais ajouter les garanties manquantes :

- une contrainte unique `(user_id, day_of_week)` pour eviter les doublons ;
- une table ou un etat dedie pour le statut global de l'abonnement repas : actif, pause, date de reprise facultative ;
- une couche `mealSubscription` cote frontend pour normaliser les jours, calculer total hebdo, slots actifs, statut et panier a generer ;
- une page `/abonnement` qui distingue clairement :
  - configuration hebdomadaire sauvegardee ;
  - pause/reprise ;
  - generation du panier pour la semaine choisie ;
  - passage au checkout explicite.

Le systeme ne creera pas de commande ni de paiement automatique dans cette iteration. Le texte UI doit eviter de promettre un debit automatique tant que ce flux n'existe pas.

### 3. Packs restaurateur

Centraliser le mapping pack service -> fonctionnalites :

- `mise_en_place` : dashboard de base, restaurant, menu, commandes, reservations, service, formules, offres, ventes flash, avis, factures, support, pack ;
- `menu_creation` : menu ;
- `product_photography` : photos ;
- `social_media_setup` : reseaux sociaux et actualites ;
- `advertising_campaign` : campagne overview et campagnes avancees ;
- `floor_plan_design` : plan de salle ;
- `account_manager` : assistant IA, recommandations, performances, comparaison.

Le webhook Stripe launch-pack doit utiliser le meme contrat que l'admin et le dashboard. Les features non incluses restent verrouillees dans la navigation.

Les quotas et details de service doivent etre visibles :

- max items menu ;
- quantite de photos ;
- nombre de campagnes ;
- budget inclus ;
- mois de gestion reseaux sociaux ;
- account manager.

Le suivi admin continue de piloter les fulfillments et peut surcharger les features restaurant, mais "Defaut pack" doit toujours revenir au calcul central.

## Architecture

### Fichiers a creer ou etendre

- `src/lib/subscriptionEntitlements.ts` : calcul des droits Tok One et aide a l'affichage des avantages.
- `src/lib/mealSubscription.ts` : normalisation des slots, statut actif/pause, calculs hebdomadaires et payload panier.
- `src/lib/packFeatureGating.ts` : exporter aussi le mapping service -> features et une fonction `computeEnabledFeatures`.
- `src/test/subscription-entitlements.test.ts` : tests des avantages Tok One.
- `src/test/meal-subscription.test.ts` : tests de slots, pause et generation panier.
- `src/test/pack-feature-gating.test.ts` : tests des droits pack, notamment `dashboard-actualites`.
- `supabase/functions/_shared/pack-entitlements.ts` : helper Edge pour le webhook launch-pack, ou equivalent local minimal si l'import frontend n'est pas possible.
- migration Supabase pour unicite meal slots et statut global d'abonnement repas.

### Fichiers a modifier

- `src/pages/admin/AdminLoyalty.tsx` : edition des avantages par plan.
- `src/pages/TokOne.tsx` : affichage base sur les avantages du plan.
- `src/pages/Profil.tsx` : resume des avantages actifs et statut.
- `src/pages/Panier.tsx` et `src/pages/ZeroAttente.tsx` : conserver le calcul financier mais l'adosser aux helpers.
- `src/pages/Abonnement.tsx` : refactoriser autour de `mealSubscription`.
- `src/pages/PacksRestaurateur.tsx`, `src/pages/dashboard/DashboardPack.tsx`, `src/pages/admin/AdminLaunchPacks.tsx` : afficher les details/quotas de service de facon coherente.
- `supabase/functions/stripe-webhook/index.ts` : remplacer le mapping hardcode launch-pack.

## Erreurs et securite

- Toute activation payante reste autoritaire cote Edge Function ou base.
- Les reductions Tok One sont recalculees cote Edge pour le checkout, pas seulement cote client.
- Les updates admin d'avantages doivent rester reserves aux admins via RLS existante ou service role selon le flux actuel.
- Les slots repas appartiennent au user connecte et doivent etre proteges par RLS.
- Les paiements automatiques d'abonnement repas sont hors scope de cette iteration.

## Tests et verification

Tests unitaires :

- Tok One : fallback 20%, avantages configures, contextes delivery/takeaway/reservation/zero-attente, avantages non financiers.
- Abonnement repas : unicite logique des jours, pause/reprise, calcul total, payload panier.
- Packs : chaque pack seed donne les features attendues ; `social_media_setup` debloque `dashboard-actualites`.

Verification build :

- `npm test -- subscription-entitlements meal-subscription pack-feature-gating`
- `npm run build`

Verification manuelle ciblee :

- Tok One affiche les avantages du plan actif.
- Panier applique toujours reduction/livraison offerte pour un membre actif.
- `/abonnement` sauvegarde, pause/reprend et genere le panier sans doublons.
- Achat pack restaurateur debloque les modules dashboard conformes au pack.
- Admin peut revenir au defaut pack et voir les services inclus.

## Hors scope explicite

- Debits automatiques hebdomadaires pour abonnement repas.
- Refonte complete Stripe des packs restaurateur.
- Nouvelles offres commerciales non presentes dans les textes de l'app.
- Quotas d'usage stricts sur les campagnes ou photos au-dela du suivi fulfillment existant.
