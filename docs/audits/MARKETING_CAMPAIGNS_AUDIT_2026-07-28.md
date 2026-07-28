# Audit des campagnes marketing TOK — 28 juillet 2026

## Périmètre

Audit du parcours complet des campagnes marketing :

- publications Actualités organiques et sponsorisées ;
- bannières sponsorisées ;
- cartes restaurant sponsorisées dans la recherche ;
- ciblage, rotation, budgets et facturation ;
- impressions, clics et conversions ;
- attribution commande, réservation et Zéro Attente ;
- statistiques restaurateur et données de production Supabase.

Références auditées : branche `main`, fonctions Edge déployées et base de production `wwcrtyoueexyxkkikaos`. Aucun événement artificiel n’a été injecté en production.

## Conclusion

Le système est réellement branché et collecte déjà des données de production. Les impressions des bannières et cartes sponsorisées sont enregistrées, dédupliquées, facturées et réconciliées avec les compteurs de campagne. Le fil Actualités collecte également les impressions et clics organiques et possède son propre pipeline sponsorisé, son ciblage, son attribution et ses métriques quotidiennes.

Deux défauts majeurs ont toutefois été confirmés :

1. le ciblage utilisait une logique de score permissive : un seul critère correspondant pouvait rendre une campagne éligible alors que d’autres critères actifs ne correspondaient pas ;
2. une commande Stripe était déclarée comme conversion avant confirmation du paiement.

La branche `fix/campaign-marketing-audit` corrige ces défauts et ajoute une attribution serveur de secours.

## Preuves observées en production

### Campagne publicitaire active

Au moment de l’audit, une campagne payante active diffuse sur :

- bannière Accueil ;
- bannière Anti-gaspi ;
- bannière Ventes flash ;
- bannière Recherche ;
- carte restaurant sponsorisée Accueil ;
- carte restaurant sponsorisée Recherche.

État observé :

- 14 impressions dans `ad_campaign_events` ;
- 14 impressions dans le compteur `ad_campaigns.impressions` ;
- 0 clic enregistré ;
- 0 conversion enregistrée ;
- 0,112 CHF dépensé ;
- aucune divergence entre les événements détaillés et les compteurs agrégés.

La concordance exacte confirme le fonctionnement du RPC atomique de comptabilisation, de la déduplication, du budget journalier et du débit selon la stratégie tarifaire.

### Actualités

État observé sur les trente derniers jours :

- 37 impressions organiques dans le fil Actualités ;
- 7 clics organiques ;
- alimentation de `social_feed_events` et de `social_post_metrics_daily` ;
- 4 publications au total, dont 3 publiées ;
- aucune promotion Actualités payante active pendant l’audit.

Le parcours sponsorisé Actualités est présent : création du boost, campagne payante liée, promotion du post, ciblage, rotation pondérée, impressions, clics CTA, conversion serveur et agrégats quotidiens. En l’absence de campagne Actualités payante active, son comportement réel n’a pas été testé en injectant de faux événements dans la production.

## Matrice de branchement

| Fonction | État avant correction | Contrôle |
|---|---:|---|
| Bannière sponsorisée | Branchée | impression à 45 % de visibilité, clic, source et page |
| Carte sponsorisée Recherche | Branchée | impression, clic et position sponsorisée |
| Actualités organiques | Branchées | impression à 55 %, clic, CTA, réactions, enregistrements |
| Actualités sponsorisées | Branchées, sans campagne active observée | promotion, ciblage, budget, attribution et métriques |
| Budget total et journalier | Branché | garde avant écriture et débit atomique |
| Déduplication | Branchée | fenêtres différentes pour impression, clic et conversion |
| Attribution clic → conversion | Branchée | fenêtre de 24 heures et multi-campagne |
| Commande Stripe | Incorrecte avant correction | conversion envoyée avant paiement confirmé |
| Réservation | Trop précoce avant correction | conversion envoyée dès création, souvent encore `pending` |
| Estimation d’audience | Partiellement alignée | genre et certains moments/parcours incomplets |
| Ciblage multi-critères | Trop permissif | logique de score OR entre familles de critères |
| Isolation des données de démonstration | Branchée | politiques restrictives Supabase présentes |

## Corrections apportées

### Ciblage strict

La nouvelle règle est :

- OR à l’intérieur d’une même famille, par exemple Genève **ou** Puplinge ;
- AND entre les familles actives, par exemple ville **et** cuisine **et** segment **et** moment ;
- une campagne non ciblée reste visible aux visiteurs anonymes ;
- une campagne ciblée nécessite désormais des signaux d’audience correspondants ;
- le propriétaire conserve la prévisualisation de sa propre campagne ;
- le ciblage Actualités et l’estimation affichée au restaurateur suivent la même logique.

Les signaux couverts sont : ville, genre déjà stocké, cuisines, favoris, nombre d’interactions, panier moyen, récence, segment client, parcours livraison/retrait/réservation/Zéro Attente et moments midi/soir/week-end.

### Conversion confirmée côté serveur

Une attribution est désormais :

1. acceptée côté serveur ;
2. conservée dans `ad_campaign_pending_conversions` lorsque la commande ou réservation n’est pas encore confirmée ;
3. transformée en conversion facturable seulement lorsque l’état métier devient confirmé ;
4. annulée ou expirée si l’entité échoue, est refusée ou dépasse la fenêtre d’attribution ;
5. dédupliquée par campagne, type de conversion et entité métier.

Un fallback serveur utilise aussi le dernier clic authentifié des 24 dernières heures. Il protège le parcours Stripe lorsque le navigateur quitte la page avant la fin de la requête d’attribution.

## Données disponibles pour le pilotage

Chaque événement sponsorisé peut contenir :

- campagne et restaurant ;
- utilisateur authentifié lorsqu’il existe ;
- type d’événement ;
- type de conversion ;
- source, page et emplacement ;
- identifiant de déduplication ;
- identifiant de commande ou réservation ;
- parcours livraison, retrait, réservation ou Zéro Attente ;
- moyen de paiement ;
- clic attribué et date du clic ;
- modèle et fenêtre d’attribution ;
- charge campagne, budget total et budget journalier.

Les Actualités ajoutent notamment le post, la promotion, le CTA, le visiteur, la portée, les réactions, les sauvegardes, les commentaires et les agrégats quotidiens.

## Points restant à traiter séparément

### Résilience réseau du client analytique

Le client `analytics.ts` désactive actuellement le tracking général ou sponsorisé pour toute la session après une erreur de fonction, même transitoire. La conversion serveur ajoutée limite fortement l’impact sur le chiffre d’affaires attribué, mais les impressions et clics peuvent encore être perdus après une panne ponctuelle. Une reprise avec délai progressif, file locale et nouvelle tentative doit remplacer cette désactivation permanente.

### Consentement analytique et marketing

La PR #419 contient une évolution de consentement granulaire qui touche déjà `campaignVisibility.ts`, `sponsoredAttribution.ts` et le client Supabase. Elle est encore en brouillon au moment de l’audit. La fusion doit être coordonnée avec la présente correction afin de ne pas perdre le ciblage strict et de distinguer analytics nécessaires, mesure d’audience et marketing personnalisé.

### Nommage des pages

Le ciblage utilise parfois `search`, tandis que les événements stockent `recherche`; des variantes existent aussi pour `anti_waste` / `anti-gaspi` et `flash_sales` / `ventes-flash`. Les données restent exploitables, mais un dictionnaire canonique simplifiera les tableaux de bord et les comparaisons multi-pages.

### Tests de production

Aucun clic ou achat artificiel n’a été créé. Après fusion et migration, un test contrôlé avec une campagne interne à budget nul ou environnement de développement devra confirmer : impression visible, clic, commande Stripe payée en mode test, conversion confirmée, déduplication et absence de conversion en cas d’annulation.

## Stratégie de retour arrière

- revert de la PR pour restaurer le comportement TypeScript ;
- suppression des nouveaux déclencheurs et fonctions de conversion ;
- conservation possible de la table de pending pour audit, sans lecture par le runtime ;
- aucune donnée historique de campagne n’est modifiée ou recalculée par les migrations.
