# TOK — audit et corrections du 27 octobre 2026

## Portée réelle

Base : `140a7fba720aa48ca46027ba5769298ff2864185`. Travail isolé sur
`fix/application-finalisation-audit-20261027`. Les corrections et les contrôles
locaux sont réalisés sans modification directe de main ni écriture en production.
L'utilisateur a ensuite autorisé le push et la fusion lorsque les validations
sont bonnes. Le statut effectif de la fusion et du déploiement doit être vérifié
sur la PR et le workflow de release, distinctement de cet état avant publication.

L'application comporte 133 fichiers de pages, 120 points d'entrée Edge Functions
et 577 migrations dans cette référence. L'inventaire des 12 domaines métier
(`node scripts/business-wiring-audit.mjs`) ne signale aucun raccord manquant.
Ce contrôle vérifie des références de code, pas le fonctionnement réel de chaque
parcours. Il ne permet donc pas de déclarer toute l'application finalisée.

Les accès GitHub, Supabase TOK, Vercel et Stripe TOK ont été vérifiés. L'audit
comprend les instructions du dépôt, les dépendances et versions verrouillées,
les configurations CI/CD, les variables référencées sans leurs valeurs, les PR
et issues ouvertes, les chemins critiques du code et les métadonnées Supabase.
Les fonctionnalités nécessitant des prestataires, des justificatifs ou une
recette financière réelle restent explicitement distinctes des corrections.

## Corrections livrées dans la branche

| Domaine | Défaut constaté | Correction et preuve attendue |
| --- | --- | --- |
| Recherche | Le seuil 9/10 devenait 4,5 dans la requête et les filtres sponsorisés. | Une même échelle sur 10 du filtre au catalogue ; régression sur arguments RPC et résultats sponsorisés. |
| Profil restaurant | Un profil sélectionné non chargé pouvait être interprété comme une création et inséré en doublon. | États de chargement/erreur/reprise et sauvegarde autorisée seulement pour le profil et formulaire correspondant à la sélection. |
| Catégories restaurant | Une sauvegarde rapide pouvait précéder la lecture des liens de cuisine et écraser les catégories existantes. | Hydratation et sauvegarde attendent les données nécessaires ; reprise explicite en cas d'erreur. |
| Vue d'ensemble | Des erreurs Supabase étaient converties en « Aucun restaurant », listes vides et chiffres à zéro. | Erreurs remontées, état de première lecture et reprise ; avertissement explicite si une actualisation échoue avec des données en cache. |
| TOK One | Un ancien événement Stripe pouvait remplacer l'identifiant et le statut d'un abonnement plus récent. | Identité Stripe préservée, nouvelle ligne pour la reprise légitime, association initiale protégée contre une écriture concurrente. |
| Classification abonnements | Les événements d'abonnement restaurateur pouvaient être écrits dans les abonnements clients et échouer avant la synchronisation restaurateur. | Exclusion des types restaurateur connus ; identité manquante d'un événement TOK One explicite signalée pour reprise. |
| Contrôle des conflits d'abonnement | Une montée de plan restaurateur contenant l'identifiant du propriétaire pouvait être bloquée par son abonnement client TOK One ; une ligne de test pouvait aussi provoquer un conflit avec le réel. | Classification avant contrôle, mode issu de l'objet Stripe récupéré et filtrage du fournisseur ; doublons du même mode toujours refusés. |
| Confirmation commande | Le rejeu d'une confirmation remettait une commande avancée à « confirmée » et pouvait relancer la première prise en charge. | Transition protégée contre les écritures concurrentes ; conservation des états avancés et de remboursement, réconciliation comptable conservée. |
| Avantages TOK One | Des abonnements ou paiements de test pouvaient accorder des avantages à une commande réelle. | Mode serveur explicite, live par défaut, appliqué à l'abonnement et à la récupération par paiement ; métadonnée client ignorée pour ce choix. |
| Coursiers / dispatch | Les permissions permettaient des écritures directes sur des états que les fonctions serveur doivent contrôler. | Migration additive proposant la fermeture des écritures directes et le maintien des chemins serveur autorisés. |
| Profil privé coursier | La règle de lecture pouvait exposer toute la ligne coursier à un client/restaurateur lié à une livraison, y compris des données privées. | Lecture directe limitée au coursier et à l'administrateur ; suivi de livraison limité à son contrat existant. |
| Plan de salle | L'auto-placement privilégié ne vérifiait pas le droit du demandeur sur la réservation. | Contrôle de l'acteur avant lecture/écriture privilégiée, avec tests d'isolation et de fonctionnement légitime. |

Les cas sont reproduits avec des doubles aux frontières externes et des données
synthétiques ; aucune commande réelle, souscription, campagne, notification,
facture, paiement ou remboursement n'a été déclenché pour les tester.

## État de production observé en lecture seule

- Vercel `cloud-rebuild-recovered` : dernier déploiement de production observé
  `dpl_37rLg2UDD9EscL6MGBPKUXF1eApw`, état `READY`, commit `140a7fba…`.
- Journaux Vercel : aucune ligne error/fatal retournée dans la fenêtre de
  30 minutes consultée. La rétention du plan ne permettait pas 24 heures.
  Cela ne démontre pas l'absence d'erreurs côté navigateur ou Supabase.
- Supabase TOK : projet `ACTIVE_HEALTHY`, 367 tables publiques avec RLS,
  quatre vues publiques en mode `security_invoker`, neuf buckets avec limites
  de taille et types MIME. Les buckets de vérification/preuve/IA/print privés
  sont configurés privés.
- Avis sécurité : 41 avertissements de fonctions privilégiées exécutables par
  anon, 280 par authenticated et 19 informations sur des tables sans policy.
  Ces avertissements nécessitent une analyse par fonction ; ils ne prouvent
  pas chacun une exposition. L'activation RLS seule ne suffit pas à valider les
  autorisations métier, comme le montrent les corrections ciblées ci-dessus.
- Deux branches Supabase de développement existantes portent l'état
  `MIGRATIONS_FAILED`. Elles n'ont été ni réinitialisées ni réutilisées.
- Navigateur public : accueil, navigation vers la recherche, chargement des
  résultats et ouverture des filtres inspectés. Le mode clair est actif.
  Aucun message d'erreur applicatif observé dans les journaux de cet onglet ;
  les seuls messages affichés provenaient d'une extension du navigateur.

## Chantiers existants restant à valider

Ces éléments ont déjà une issue ou une PR. Ils n'ont pas été fusionnés ou
réimplémentés à l'aveugle dans cette branche.

| Sujet | Référence existante | Validation ou dépendance restante |
| --- | --- | --- |
| Abonnements restaurateurs expirés | PR #951 | Tests d'expiration, visibilité, relances et recette avant activation. |
| Notifications métier | PR #943 ; issue #759 | Capture transactionnelle et compteur global/pagination à rapprocher du déploiement. |
| Variété des publications marketing | PR #975 / #976 | Consolider les variantes concurrentes, vérifier qualité native et absence de doublons sans publication réelle. |
| Tableau comptable | PR #920 ; issues #848 / #821 | Rapprochement exact Stripe/grand livre et encaissement des frais de réservation. |
| Plan de salle de service | PR #907 | Recette des placements, sauvegarde atomique et réservations terminées. |
| Marketing autonome | Issue #692 | Intégrations, attribution, canaris, droits et décisions produit détaillés dans le plan existant. |
| Connect restaurateurs | Issue #794 | Onboarding/KYC, routage, rapprochement, sinistres et validation des flux réels avant ouverture. |
| Google Actions Center | Issue #788 | Sandbox, horaires, éligibilité et homologation ; pas d'activation automatique. |
| Rappels commerciaux à échéance | Issue #758 | Planification durable et tests sans SMS/email non sollicités. |
| Corpus juridique | Issue #628 et travaux séparés en cours | Identité de l'exploitant vérifiée et revue juridique ; ne pas inventer de mentions. |
| Sécurité de livraison | Issues #629 / #627 | Protection de branche et prévention des crons Preview ciblant la production à vérifier séparément. |

Les PR ouvertes peuvent se recouper ou être partiellement présentes dans main.
Leur état ouvert n'est pas une preuve que toute leur fonctionnalité manque.

## Vérifications et limites

Environnement local : Node `24.22.1`, pnpm `10.28.1`, dépendances installées
depuis le lockfile inchangé. La CI du dépôt utilise Node 22.

| Contrôle | Résultat |
| --- | --- |
| `pnpm typecheck` | Réussite, après relance isolée. |
| `pnpm lint` | Réussite sur le dépôt complet, après relance isolée. |
| `pnpm build` | Réussite avec la configuration publique factice utilisée pour les contrôles locaux ; ce n'est pas un déploiement. |
| Recherche | 10 tests réussis, dont les régressions de seuil de note. |
| Chargement et sauvegarde du profil restaurant | 10 tests réussis. |
| Reprise du tableau de bord | 21 tests réussis et 15 tests voisins réussis. |
| Paiement / finalisation / tarification et voisins | 114 tests dans 11 fichiers réussis, dont 29 nouvelles régressions. |
| Conflits et synchronisation abonnements et voisins | 49 tests dans 5 fichiers réussis ; les groupes ci-dessus peuvent se recouper. |
| Propagation de l'erreur de rapprochement paiement | 32 tests réussis après adaptation du double de requête au filtre atomique nullable ; assertions Error/message/cause conservées. |
| Reprises ciblées panier abonnement et destinataires mailing | 19 tests réussis sans modification du code ni des délais. Les deux dépassements de délai de l'essai général ne se reproduisent pas isolément. |
| Permissions SQL | 5 défauts de la référence reproduits ; 40 assertions PostgreSQL réussies après migration, puis à nouveau après réapplication. |
| Revue indépendante | Aucun blocage restant sur le diff final, après correction des deux régressions décelées pendant revue. |
| Index applicatif | Régénéré et contrôle déterministe réussi. |
| Collisions de migration | Aucune collision avec origin/main. |
| `git diff --check` et encodage | Réussite ; fichiers texte UTF-8. |
| Suite générale | Essai isolé encore en cours à la préparation de la PR. Trois échecs observés : double de requête adapté puis 32/32 réussis ; deux délais UI puis 19/19 réussis sans changer les délais. Aucun résultat global vert n'est déduit de ces reprises. La CI de la PR doit valider le commit exact avant fusion. |

Les premiers essais de typecheck et build se sont arrêtés avec le code 137
lorsque les contrôles lourds tournaient simultanément. Deux essais généraux de
tests ont été interrompus ; des tests de l'inscription, du composeur social,
de la délégation OAuth, de la génération IA et de la vue Instagram ont échoué
ou dépassé leurs délais dans cette charge. Ces essais ne constituent pas une
suite verte ; les résultats de la validation finale isolée font autorité.

Le doctor Supabase local de production échoue parce que ce worktree ne contient
ni environnement frontend de production ni lien CLI. Aucune clé ni configuration
locale de production n'a été créée pour contourner ce résultat. La cible distante
a été vérifiée séparément par le connecteur en lecture seule. Cela ne valide pas
un déploiement de migration depuis ce worktree.

La recette authentifiée complète client/restaurateur/admin/coursier, les tests
Stripe en environnement bancaire, la livraison mobile iOS/Android, les envois
Resend/Meta, le build SEO complet dépendant des données de production et les
tests de charge ne sont pas équivalents aux contrôles locaux de cette branche.
Ces surfaces ne sont pas déclarées validées.

## Déploiement et retour arrière

Commits locaux : `88c8cc8f` (interfaces), `acec4160` (paiements et abonnements),
`5e8262f4` (permissions SQL). Les index et le présent bilan sont versionnés
séparément. La publication par API peut recréer les métadonnées des commits ;
l'identité des arbres et des blobs doit alors être comparée aux fichiers locaux.

Les premières tentatives de push ont été bloquées par l'approbation automatique.
Après vérification du dépôt public et des droits d'écriture, l'utilisateur a
explicitement autorisé « Pousse et fusionne quand tout est bon ». Le terminal
ne disposant pas d'identifiants GitHub, la publication utilise le connecteur
authentifié sur la même branche et le même dépôt. Aucun refus d'approbation
n'est contourné et aucune fusion n'est autorisée sur des contrôles en échec.

La migration de sécurité doit être examinée et appliquée via le processus de
release du dépôt après validation ; elle n'a pas été appliquée en production.
Vérifier les commandes, coursiers, lectures privées et réservations après mise
en place sur un environnement isolé avant production.

Les commits seront réversibles séparément. Revenir au frontend précédent par
la procédure de déploiement existante ; restaurer les fonctions Edge concernées
au commit précédent si nécessaire. Un revert Git de la migration ne restaure
pas les privilèges déjà appliqués : en cas de régression SQL, préparer une
migration corrective validée qui conserve les restrictions de confidentialité,
plutôt que de rétablir les droits vulnérables en bloc.

## Liste complète des fichiers modifiés

- `src/pages/Recherche.tsx`
- `src/pages/dashboard/DashboardHome.tsx`
- `src/pages/dashboard/DashboardRestaurant.tsx`
- `src/test/restaurant-search-preview.test.tsx`
- `src/test/dashboard-home-recovery.test.tsx`
- `src/test/dashboard-restaurant-loading.test.tsx`
- `src/test/order-checkout-finalization.test.ts`
- `src/test/order-pricing-tok-one-mode.test.ts`
- `src/test/tok-one-subscription-sync.test.ts`
- `src/test/stripe-webhook-subscription-conflicts.test.ts`
- `src/test/tok-connect-special-offers-commerce.test.ts` (double de requête adapté au contrôle atomique ; assertions de message et cause conservées)
- `supabase/functions/_shared/order-checkout.ts`
- `supabase/functions/_shared/order-pricing.ts`
- `supabase/functions/_shared/tok-one.ts`
- `supabase/functions/stripe-webhook/index.ts`
- `supabase/migrations/20261027020556_harden_courier_and_floor_plan_boundaries.sql`
- `supabase/tests/courier_floor_plan_security_fixture.sql`
- `supabase/tests/courier_floor_plan_security_assertions.sql`
- `docs/audits/2026-10-27-application-finalisation-plan.md`
- `docs/audits/2026-10-27-application-finalisation-report.md`
- `docs/architecture/tok-application-search-index.json` (généré)
- `docs/architecture/TOK_APPLICATION_REFERENCE.md` (généré)
- `src/data/tok-user-guide-catalog.generated.ts` (généré)

## Références de méthode

- [Supabase — RLS et privilèges](https://supabase.com/docs/guides/database/postgres/row-level-security)
- [Stripe — événements et webhooks](https://docs.stripe.com/webhooks)
- Plan local : `docs/audits/2026-10-27-application-finalisation-plan.md`.
