# Correctifs abonnements, MIAMZ et promotions TOK

Date : 11 octobre 2026. Branche : `codex/fix-subscriptions-benefits-20261011`.
Base : `94d53e799ed28ef227bdbc595a3e9f95f264e5cd` (main actualisée).

Risque **niveau 3** : calcul de commande, droits payants, remboursements, RLS et facturation multisite. Cette livraison est une proposition de code et de migrations. Aucune migration, réparation de données, facturation, notification ou mise en production n’a été exécutée.

## Correspondance avec l’audit

| Constat | Correctif livré |
| --- | --- |
| Crédits inclus encore disponibles après expiration/résiliation | Les crédits inclus et quotas IA exigent un contrat live actif pendant sa période. Les crédits achetés séparément conservent leur traitement distinct. |
| Tok One pouvait être reconstitué depuis un ancien paiement | Suppression du secours fondé sur `payment_transactions`, côté panier et interface. Sélection prioritaire du contrat live actif ; une période Stripe absente ne crée plus de droits fictifs. |
| Codes non cumulables ignorés | Allocateur commun en centimes ; le code exclusif remplace les autres remises et points, uniquement s’il est plus avantageux. Le panier explique ce choix. |
| Livraison déduite plusieurs fois | Plafond partagé sur les frais réellement facturés entre promotion, Tok One et MIAMZ ; séparation des remises alimentaires et des frais. Le panier consulte les tarifs des restaurants. |
| Support prioritaire Tok One absent | Vérification serveur du bénéfice actif dans les déclencheurs de priorité support, sans diminuer une priorité supérieure. |
| Avant-première flash absente | Fenêtre paramétrable de 0 à 120 minutes, contrôle au paiement et visibilité membre. Horaires Europe/Zurich partagés entre navigateur et serveur ; mise à jour de la visibilité toutes les 15 secondes. |
| Multisite Elite uniquement annoncé | Rattachement de restaurants du même propriétaire, trois établissements selon le contrat, crédits et quotas mutualisés, commission marketplace héritée du contrat. Ajout payant Stripe idempotent, consentement explicite, droits après paiement confirmé, capacité synchronisée par webhook et réconciliation. |
| Annuel annoncé alors que désactivé | Public et facturation respectent le drapeau annuel. Le champ annuel Tok One est identifié comme tarif de référence non commercialisé. Aucun drapeau de commercialisation n’est activé. |
| Cadeaux, surprises et invitations sans exécution | Campagnes administrables, dates, ciblage Tok One/MIAMZ, réclamation idempotente, référence de retrait, remise confirmée par un administrateur et auditée. Les codes associés restent soumis aux droits de la campagne. |
| Avantages désactivés / zéro mal interprétés | Zéro est conservé ; les droits désactivés ne reviennent ni par héritage ni par le secours emporter/livraison. Accès Table du Chef contrôlé par le bénéfice serveur. |
| Paliers MIAMZ absents et seuils divergents | Initialisation des quatre paliers si absents ; seuils administrés utilisés côté serveur et interface ; validation de l’ordre des seuils et multiplicateur maximal de 5. |
| Remboursements partiels sans ajustement MIAMZ | Ajustement au prorata sur le journal, sérialisé par commande et idempotent, y compris dons. Fonction de reprise historique par lots, sans rejouer les autres déclencheurs de commande. |
| Administration et aperçu des codes incomplets | Création/modification auditée, restrictions membres, plafonds, cumul, première commande et livraison offerte. Une modification du panier invalide le code prévisualisé ; les réponses obsolètes sont ignorées. |
| Réconciliation incomplète / répétition du premier lot | Curseur dédié `last_reconciled_at`, lots bornés et ordre stable, prise en charge Tok One Stripe, contrôle live/test, protection contre l’écrasement concurrent d’un webhook. Les erreurs restent journalisées. |

Le rattachement Elite conserve les consommations dans le groupe. Un établissement rattaché ne peut pas acheter ou modifier un contrat indépendant. Un changement de formule ou un détachement d’un groupe existant passe par le support : aucune suppression de lien ne doit effacer l’historique des consommations ou laisser une ligne Stripe facturée. Les sites supplémentaires annuels suivent la règle existante de onze mensualités pour douze mois. La suppression d’une capacité Stripe suspend les droits correspondants, sans multiplier les crédits des autres sites.

## Validation locale

- Sept migrations exécutées intégralement dans PostgreSQL embarqué (PGlite 0.5.8), sur un schéma de test sans données de production.
- 25 scénarios SQL : live/test, expiration, désactivation, seuils personnalisés, héritage, support, remboursement partiel puis total, replay, dons, reprise historique, partage Elite, quatrième site payant, révocation de capacité, isolation des propriétaires, accès et remise des offres.
- Suites Vitest ciblées : abonnements, MIAMZ, fidélité, promotions, paiement, fenêtres horaires et index applicatif. 173 tests dans 35 fichiers.
- TypeScript frontend : sortie 0 après correction du typage Elite/flash. ESLint complet : sortie 0 (18 avertissements existants). Build Vite production : sortie 0. `supabase:doctor:prod` vérifié lors de l’implémentation.
- Suite complète sous Node 22 : 3 032 tests réussis sur 3 033. Le dernier test échoue uniquement sur un avertissement du proxy local dans stderr ; recontrôle ciblé avec `NODE_NO_WARNINGS=1` réussi (23 tests dans quatre fichiers, incluant ce test et les registres corrigés). Le contrôle GitHub de la dernière révision fait autorité pour le résultat CI.
- Vérification Deno ciblée des deux fonctions de gestion/réconciliation et du moteur de tarification. Les téléchargements directs esm.sh/jsr sont bloqués dans cet environnement ; contrôle réalisé avec les mêmes paquets npm locaux Supabase 2.106.2 et Stripe 22.3.2 et une déclaration vide pour le seul import de types `edge-runtime.d.ts`. Ce contrôle n’est pas une exécution hébergée Supabase.
- Fixture SQL : schéma réduit et frontières notifications/feature flags simulées. Elle ne remplace pas une répétition des migrations sur une branche Supabase complète.

Reproduction SQL, sans URL de base ni clé :

```sh
npm install --prefix /tmp/tok-sql-check --no-audit --no-fund @electric-sql/pglite@0.5.8
node scripts/tests/subscription-benefits.mjs /tmp/tok-sql-check/node_modules/@electric-sql/pglite/dist/index.js
```

## Conditions restantes avant fusion et production

La PR reste en brouillon selon le gate critique de `TOK_RELEASE_GATEKEEPER.md`. Le connecteur disponible donne accès au compte Stripe live ; aucune transaction réelle n’a été utilisée comme test.

1. Répéter les migrations sur une branche de recette Supabase complète ; vérifier les politiques et déclencheurs déjà présents.
2. Tester en Stripe **test** la souscription, le renouvellement, l’impayé, la résiliation, les webhooks dupliqués/inversés et le rattachement Elite payant : paiement accepté/refusé, authentification requise, timeout puis reprise, retrait de capacité. Le code actuel suit le mode réel du contrat ; la recette doit utiliser une configuration isolée adaptée.
3. Vérifier visuellement les parcours mobile/desktop et les offres avec de vrais comptes de recette. Aucun navigateur de recette accessible n’a été utilisé dans cette session.
4. Attribuer les anciens HTTP 401 de l’audit à un appel précis et contrôler l’exécution du cron après déploiement. Leur cause n’était pas démontrée ; les protections d’authentification n’ont pas été supprimées.
5. Créer les véritables campagnes/codes et leurs modalités dans l’administration. Aucun cadeau, partenaire, remise ou événement commercial fictif n’a été créé. Les abonnements repas et les ventes annuelles restent soumis à leurs drapeaux et configurations existants.

## Ordre de livraison et exploitation

1. Appliquer les migrations `20261011070000` à `20261011070600` en recette, puis, après validation, en production.
2. Déployer ensemble les fonctions modifiées : `create-checkout`, `daily-dish-ai`, `manage-restaurant-subscription`, `manage-restaurant-establishments`, `stripe-subscription-reconcile`, `stripe-webhook` et leurs modules partagés. Les autres fonctions qui importent les modules partagés bénéficient des corrections lors de leur prochain déploiement ; inclure notamment les consommateurs du moteur de tarification dans le lot backend.
3. Déployer le frontend. Les nouvelles interfaces dépendent des RPC et colonnes précédentes.
4. Contrôler le cron, les audits, l’absence de droits test en production et les totaux d’un panier de recette.
5. Pour les remboursements historiques, examiner le lot avant reprise. Appeler `reconcile_refunded_order_miamz_batch(p_after, p_limit)` avec le rôle de service, plafond 100, puis avancer `p_after` au dernier identifiant retourné jusqu’au lot vide. Les seules écritures sont les ajustements MIAMZ/dons et l’audit ; le replay ne recrédite pas les points. Cette reprise n’est pas lancée automatiquement par la migration.

Retour arrière : désactiver les campagnes concernées, suspendre les nouvelles souscriptions/ajouts si nécessaire et redéployer la version applicative précédente. Conserver les tables, liens, lignes Stripe et journaux financiers. Ne pas supprimer les migrations ni annuler les ajustements par un effacement ; utiliser une correction compensatoire auditée après analyse. Les facturations existantes nécessitent une décision explicite avant toute annulation ou remboursement.

## Finalisation après contrôles GitHub

La première CI a identifié deux erreurs de typage (contrat Elite et avant-première flash), une description manquante dans le journal admin et une carte des codes d’erreur à régénérer. Ces quatre points sont corrigés. Le précédent bilan de typecheck était erroné : seuls les résultats des vérifications relancées après ces corrections font foi.

Le quota Vercel a bloqué le déploiement automatique du projet `cloud-rebuild-recovered`. La recette Stripe/Supabase décrite plus haut reste nécessaire. Aucun merge ni déploiement de migrations n’a été effectué.

## Fichiers modifiés

La liste ci-dessous constitue le périmètre complet du correctif, index applicatif inclus.

- `docs/architecture/TOK_APPLICATION_REFERENCE.md`
- `docs/architecture/tok-application-search-index.json`
- `docs/audits/TOK_SUBSCRIPTION_FIXES_2026-10-11.md`
- `scripts/tests/subscription-benefits.mjs`
- `src/components/LoyaltyStatus.tsx`
- `src/components/MemberBenefitOffers.tsx`
- `src/components/PromoCodeInput.tsx`
- `src/components/PromotionDetector.tsx`
- `src/components/admin/BenefitCampaignManager.tsx`
- `src/components/dashboard/EliteEstablishments.tsx`
- `src/hooks/useTokOne.ts`
- `src/hooks/useTokOneEntitlements.ts`
- `src/lib/admin/auditLogNarrative.ts`
- `src/lib/businessTime.ts`
- `src/lib/loyaltyBenefits.ts`
- `src/lib/specialOffers.ts`
- `src/lib/subscriptionEntitlements.ts`
- `src/pages/ChefsTable.tsx`
- `src/pages/PacksRestaurateur.tsx`
- `src/pages/Panier.tsx`
- `src/pages/TokOne.tsx`
- `src/pages/VentesFlash.tsx`
- `src/pages/admin/AdminLoyalty.tsx`
- `src/pages/dashboard/DashboardAccountBilling.tsx`
- `src/pages/dashboard/DashboardVentesFlash.tsx`
- `src/test/application-search-index.test.ts`
- `src/test/chef-table-vip-miamz-access.test.ts`
- `src/test/loyalty-status-dialog-layout.test.tsx`
- `src/test/miamz-business-logic-guards.test.ts`
- `src/test/subscription-discount-allocation.test.ts`
- `src/test/subscription-entitlements.test.ts`
- `supabase/config.toml`
- `supabase/functions/_shared/business-time.ts`
- `supabase/functions/_shared/checkout-discounts.ts`
- `supabase/functions/_shared/error-code-map.ts`
- `supabase/functions/_shared/marketplace-finance.ts`
- `supabase/functions/_shared/order-pricing.ts`
- `supabase/functions/_shared/restaurant-establishments.ts`
- `supabase/functions/_shared/tok-one.ts`
- `supabase/functions/create-checkout/index.ts`
- `supabase/functions/daily-dish-ai/index.ts`
- `supabase/functions/manage-restaurant-establishments/index.ts`
- `supabase/functions/manage-restaurant-subscription/index.ts`
- `supabase/functions/stripe-subscription-reconcile/index.ts`
- `supabase/functions/stripe-webhook/index.ts`
- `supabase/migrations/20261011070000_subscription_credit_expiry.sql`
- `supabase/migrations/20261011070100_subscription_benefit_authority.sql`
- `supabase/migrations/20261011070200_partial_refund_miamz_reconciliation.sql`
- `supabase/migrations/20261011070300_subscription_reconciliation_cursor.sql`
- `supabase/migrations/20261011070400_flash_member_early_access.sql`
- `supabase/migrations/20261011070500_member_campaigns_and_promo_management.sql`
- `supabase/migrations/20261011070600_elite_establishment_entitlements.sql`
- `supabase/tests/subscription_benefits_fixture.sql`
