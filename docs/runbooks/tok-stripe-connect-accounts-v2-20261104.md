# TOK — mise en service contrôlée de Stripe Connect Accounts v2

Mise à jour : 4 novembre 2026. Compte plateforme : `acct_1SHGJ2GTQigE34su`. Projet Supabase : `wwcrtyoueexyxkkikaos`.

## Périmètre de la PR

- Nouveaux restaurants : Accounts v2, tableau de bord Express, configuration `recipient` et capacité `stripe_balance.stripe_transfers`. La plateforme gère la tarification et les soldes négatifs ; il ne faut pas accepter ces responsabilités contractuelles sans le représentant autorisé.
- Comptes Connect v1 existants : lecture et onboarding historique conservés en repli explicite.
- Compte Stripe jamais attribué à deux restaurants sans détection d'un conflit.
- Notifications v2 : signature Stripe vérifiée, événements de compte rattachés à la plateforme, récupération de l'état actualisé chez Stripe, lease et idempotence par événement. Synchronisation limitée au restaurant correspondant à `stripe_account_id`.
- Checkout, commissions, remboursements et partage développeur : calculs existants non modifiés. Aucune transaction ni activation automatique.

## Contrôles exigés avant la première opération réelle

1. Un représentant autorisé doit compléter le [profil Connect de la plateforme](https://dashboard.stripe.com/settings/connect/platform-profile) et examiner les responsabilités de solde négatif, litiges, remboursements, frais Stripe et KYC.
2. Après revue, déployer le code via le workflow contrôlé du dépôt, et vérifier les logs de `stripe-connect-onboard`, `stripe-connect-status` et `stripe-webhook`.
3. Dans Stripe Workbench, vérifier que la destination production « TOK Connect v2 - événements comptes » pointe sur la bonne fonction, utilise **Your account** et les événements `v2.core.account.*`. Installer son secret de signature réel dans Supabase sous `STRIPE_CONNECT_WEBHOOK_SECRET` (par canal de secrets, jamais dans Git, des logs ou un ticket). Il s'agit d'un secret **distinct** de celui de la destination v1.
4. Rejouer en sandbox : compte restaurant, onboarding Stripe, identité, moyen de virement, passage de `stripe_transfers` à `active`, mise à jour automatique des drapeaux en base et refus si compte suspendu. Vérifier un événement en double et un événement dans le désordre.
5. Vérifier le calcul de chaque frais avec la configuration commerciale de l'abonnement réel : réservations TOK éligibles, commandes, livraisons, Zéro Attente, pourboires, remboursements et litiges. Les tarifs ne doivent jamais être déduits des métadonnées arbitraires du client.
6. Vérifier le compte bénéficiaire développeur et l'assiette contractuelle de ses 10 % de la **commission TOK**, puis réconcilier les transferts sur un scénario de test. Un webhook signé ne prouve pas qu'un virement bancaire a réussi.
7. Activer `finance_runtime_config.connect_routing_enabled` en production **seulement après** validation de la conformité, des comptes receveurs, des webhooks, de la réconciliation et des procédures de remboursements. Aucune activation automatique dans cette PR.

## Points non automatisables

Les restaurateurs doivent eux-mêmes fournir leurs coordonnées et terminer les contrôles KYC. Le représentant légal doit valider les responsabilités financières imposées par Stripe. Le connecteur Stripe ne permet pas d'extraire le secret de signature de la destination v2, ni de confirmer un compte bénéficiaire bancaire à la place du titulaire.

## Retour arrière

Révoquer la modification par `git revert` de la PR puis redéployer via le workflow officiel. Maintenir le routage financier désactivé pendant le diagnostic ; ne supprimer aucun compte Stripe ni aucun paiement. Ne jamais réutiliser un ancien secret de webhook pour une nouvelle destination.
