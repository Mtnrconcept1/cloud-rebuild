# TOK — Audit et amélioration du plan de salle

Date : 19 octobre 2026. Branche de travail : `feat/tok-floorplan-service-ux-20261019`.
Base de comparaison après synchronisation : `491af1101d25210d1b12312bd7f2772c1918e754`.

**Livraison sur une branche dédiée, avec PR pour revue.** Le commit publié et la PR identifient la version exacte de ce lot. Les modifications et validations locales décrites ici ne sont pas encore déployées : aucune migration distante ni fusion vers `main` n’a été effectuée pendant cette intervention.

Niveau de risque retenu : **3**, car la persistance des réservations, les autorisations des fonctions SQL et la progression de service sont concernées.

## Périmètre et méthode

L’audit porte sur l’outil de plan de salle, les réservations qui l’alimentent, les liens entre ces écrans, le parcours de démonstration et les contrats de sauvegarde/installations. Il ne prétend pas constituer une recette de toutes les routes de TOK.

Les parcours ont été cartographiés à partir du routeur, de leurs composants réellement importés, des requêtes, des mutations, des migrations et des tests. Les règles de `AGENTS.md` et les skills TOK relatifs à l’application, aux opérations restaurant, aux tests et à la livraison ont été utilisés, ainsi que les skills de développement frontend et applicatif.

Les connecteurs GitHub, Supabase, Vercel et Stripe ont fait l’objet des contrôles préalables de disponibilité. Cela ne constitue ni une vérification du schéma effectivement déployé, ni une autorisation de publier la branche en production.

## Inventaire des routes et entrées

| Route ou entrée | Rôle et contrat vérifié dans le code |
| --- | --- |
| `/dashboard` | Accueil restaurant ; la navigation de `DashboardLayout` expose une seule entrée « Plan de salle ». Le contexte restaurant provient de `useDashboardRestaurant`. |
| `/dashboard/plan-salle` | Route canonique, protégée par `DashboardRoute` et la fonctionnalité `dashboard-plan-salle`. Elle charge `DashboardPlanSalle`, puis la vue de service ou l’édition de la salle. |
| `/dashboard/plan-salle?date=YYYY-MM-DD&branch=…&reservation=…&service=lunch\|dinner` | Liens directs vers une date, un établissement et une réservation. Une date doit correspondre à un vrai jour du calendrier ; les paramètres de service admis sont explicites. |
| `/dashboard/plan-salle-v2` | Ancien favori conservé comme redirection vers la route canonique. Le correctif conserve les paramètres et le fragment d’URL. Aucun second éditeur n’est routé ici. |
| `/dashboard/reservations` | Liste et détail des réservations, dont les informations utiles au placement et au zéro-attente. Aller-retour avec le plan en conservant date, établissement, service et réservation lorsque ces informations sont disponibles. La clôture explicite se fait depuis le détail. |
| `/dashboard/service` | Pilotage de service adjacent, distinct de l’éditeur de salle. Son existence a été relevée ; sa refonte complète est hors de ce lot. |
| `/auth`, `/auth/demo`, `/auth/callback` | Entrées d’authentification. L’accès distant à `https://www.thetok.ch/dashboard/plan-salle` a abouti au mur d’authentification avec une redirection vers la destination demandée. |
| `/commercial/demo-live` | Hôte de démonstration protégé pour les rôles prévus. Le scénario restaurant propose « Présenter le plan de salle ». |
| `/commercial/demo-live/frame/restaurant/:sessionId/dashboard/plan-salle` et `/dashboard/reservations` sous le même préfixe | Routes du cadre restaurant avec `BrowserRouter basename`. Elles utilisent le contexte et les données de démonstration isolés. Les liens internes restent relatifs au routeur pour conserver ce préfixe. |

Sources principales : `src/App.tsx`, `src/components/DashboardLayout.tsx`, `src/pages/dashboard/useDashboardRestaurant.ts`, `src/lib/floorPlanNavigation.ts`, `src/lib/commercialDemoFrame.ts`, `src/components/dashboard/CommercialDemoScenario.tsx`.

### Composants et doublons

Le parcours actif utilise `SimpleReservationQueue`, `ServiceBoard`, `TableContextDrawer`, puis `StudioCanvas`, `StudioPalette` et `StudioInspector` pour l’édition. Les actions de statut partagées passent par `ReservationServiceActions` et les règles de `serviceShared`.

`ReservationQueue.tsx` est un ancien composant encore présent, sans import productif trouvé dans l’inventaire. Il reste hors du parcours actif. `TableConfigDialog.tsx` sert à configurer les places. La redirection historique v2 conserve les favoris et les liens existants. Les anciens panneaux détachables et les helpers dupliqués dans la page principale ont été retirés.

## Incohérences prouvées et corrections du lot

| Constat | Conséquence pour le restaurant | Correction et preuve à retenir |
| --- | --- | --- |
| L’occupation dépendait de la liste de réservations filtrée par recherche/statut. | Rechercher un client pouvait faire paraître libre une table occupée par quelqu’un d’autre. | L’occupation utilise les réservations actives du service indépendamment de la recherche. Test de la vraie page avec une recherche sur un client non placé et une autre table occupée. |
| Réservations annulées, absentes ou terminées mélangées au service actif. | Clients non pertinents dans les placements, actions proposées sur l’historique et faux états d’occupation. | Listes « À placer », « Placés », « Historique » ; historique consultable sans mutation. Statuts terminaux normalisés, dont `no-show`, `expired` et `declined`. |
| `honored_at` pouvait être confondu avec une fin de service. | L’arrivée peut déjà sceller les frais ; une table occupée risquait alors d’être libérée visuellement trop tôt. | Seul le statut terminal libère la table. Une réservation arrivée ou installée, déjà honorée, continue d’occuper sa table. |
| « Installer » utilisait un contrat général qui verrouille les réservations déjà honorées. | Le passage physique arrivée → installation échouait après l’arrivée facturée. | RPC dédiée `restaurant_seat_floor_plan_reservation`, transition `arrived → seated`, sans nouvelle facturation. Tests PostgreSQL avec les fonctions et triggers financiers extraits des migrations locales. |
| Le placement automatique peut créer un slot en laissant `reservations.branch_id` à `NULL`. | Exiger cette colonne empêche l’installation malgré une table déjà attribuée. | La migration d’installation déduit la branche de l’unique table attribuée, contrôle restaurant/accès puis revalide sous verrous. Le test PostgreSQL couvre cette arrivée déjà comptabilisée et confirme la conservation des frais. |
| Choix de la réservation principale dépendant de l’ordre de la liste. | Un futur client pouvait prendre la place visuelle du client réellement installé. | Priorité cohérente : installé, arrivé, réservation en cours, prochaine arrivée. Durée issue des métadonnées avec repli à 120 minutes et minimum de 30 minutes. |
| Des mutations ou rechargements pouvaient écraser un brouillon ou son contexte. | Perte de déplacements, d’affectations ou de l’historique d’annulation ; retour intempestif vers un autre restaurant après une réponse tardive. | Brouillons et identité de sauvegarde rattachés au contexte ; conservation sur erreur et rechargement en arrière-plan ; tests de changement de restaurant et de réponse différée. |
| Sauvegardes de géométrie et d’affectations séparées. | Échec intermédiaire susceptible de laisser un état partiel. | Une transaction v3 couvre inventaire, ajustements du jour et différences d’affectation. Contrôle de révision sur données brutes, identifiant idempotent, erreurs explicites et absence de repli vers des écritures séquentielles. |
| Une disposition ou une proposition pouvait recréer les identifiants de tables existantes. | Risque de perdre les liens avec les réservations, les préférences ou l’historique. | Conservation des identifiants survivants et fusion des propositions ; validation de chargement d’une disposition sans effacement des affectations. |
| La suppression d’un ajustement du jour ignorait ses propriétés héritées supplémentaires. | Une simple sauvegarde de placement pouvait supprimer des informations du service, même sans déplacement. | Le helper compare maintenant l’ajustement complet avant de décider sa suppression ; les propriétés JSON supplémentaires sont préservées. |
| Un élément masqué disparaissait aussi des possibilités d’édition. | Réactivation difficile et inventaire difficile à comprendre. | Éléments masqués visibles et sélectionnables en édition, avec apparence atténuée ; exclus du service et des recommandations. Libellés de formulaire associés aux champs et limite de nom cohérente. |
| Un montant de réservation/zéro-attente pouvait être interprété comme preuve de paiement. | Le tiroir affichait une certitude non établie sur le paiement. | Présentation distinguant paiement confirmé et paiement à vérifier. La clôture réutilise `markReservationHonored` : montant réellement encaissé demandé lorsque nécessaire ; aucune nouvelle saisie financière si déjà honorée. |
| Listes terminales différentes entre v3 et le writer historique appelé. | Faux conflits d’occupation avec un alias ancien ou une réservation expirée/refusée. | Troisième migration additive harmonisant les statuts sans modifier les migrations historiques ni effacer leurs placements. Les tests PostgreSQL vérifient aussi les conflits entre deux dates et le refus explicite d’une identité de démonstration restreinte. |

Les détails exacts et les extraits de code complets doivent être examinés dans le diff de la PR. Cette note résume leurs effets et les preuves, sans dupliquer l’implémentation.

## Comportement UX attendu

Le restaurateur ouvre le service du jour, choisit l’établissement et le service, puis voit immédiatement les clients à placer, les clients placés et les tables disponibles. La recherche et le tri changent la liste de clients sans changer artificiellement l’occupation de la salle. Une proposition de table tient compte du nombre de couverts, des réservations qui se chevauchent, des préférences et des éléments actifs.

Un clic ouvre le client ou la table dans un tiroir commun : notes complètes, téléphone, détails de réservation, affectation et prochaine action autorisée. Une absence demande une confirmation. Les commandes de mutation sont désactivées pendant une sauvegarde ou un changement de statut ; la consultation reste possible. Une erreur restaure l’état de statut précédent et conserve les brouillons de placement.

« Actualiser » relit les données en conservant le brouillon et son historique. Une révision concurrente incompatible est refusée : l’interface explique comment abandonner explicitement le brouillon pour reprendre la version enregistrée. Elle ne fusionne pas automatiquement deux modifications concurrentes de la même géométrie. Le rafraîchissement périodique s’exécute uniquement lorsque le plan est propre et l’onglet visible.

« Modifier la salle » ouvre l’inventaire et les contrôles de géométrie. Les ajustements du jour restent distincts du modèle de salle. Zoom et recentrage sont accessibles ; les éléments masqués restent récupérables dans l’éditeur. Le passage entre service et édition attend la sauvegarde lorsque nécessaire et reste sur le travail courant si elle échoue.

La fin de service est explicite depuis la réservation : « Clôturer la table ». L’installation ne vaut pas clôture, et une réservation déjà honorée ne demande pas un second montant ignoré par le serveur. Aucun statut `completed` n’est envoyé par la RPC générale de changement de statut.

## Ce qui est vérifié, et ce qui reste à vérifier

| Niveau de preuve | Portée réelle |
| --- | --- |
| Inventaire et revue de code | Routeur, entrées de navigation, composants importés, requêtes, contrats de mutation, migrations historiques pertinentes et nouvelles migrations. |
| Tests frontend locaux | Composants, règles de service, navigation, clôture, helper de persistance et page réelle montée avec QueryClient ; réponses réseau simulées pour erreurs, concurrence de contexte, reprise et statut optimiste. Ils ne prouvent pas le comportement d’une base distante. |
| Tests PostgreSQL locaux | Script PGlite jetable qui charge les nouvelles fonctions et des définitions/triggers réels tirés des migrations locales. Il couvre les transactions, rejouements, droits et garde-fous ciblés. La fixture ne vaut pas application intégrale de toutes les migrations de production. |
| UI distante | L’entrée réelle du plan a été atteinte, puis bloquée par l’authentification. Aucun parcours restaurateur authentifié complet ni recette tactile réelle ne sont attestés. |
| UI locale par CUA | Le serveur local n’était pas joignable depuis le navigateur CUA. Aucune validation visuelle complète du nouveau rendu dans ce navigateur ne peut être revendiquée. |
| Supabase distant | Les définitions SQL effectivement actives n’ont pas été vérifiées : la lecture distante n’a pas abouti. Les conclusions sur le serveur concernent le schéma du dépôt et les tests locaux. |
| Production, Vercel et Stripe | Aucun déploiement, encaissement, honor réel, mutation de données client ou migration distante effectué pour cette recette. |

### Résultats de validation locale

Environnement : Node **24.19.0**, pnpm **10.28.1**, dépendances installées depuis le lockfile après synchronisation avec `491af11`. La suite globale couvre 681 fichiers ; ses compteurs de « suites » incluent aussi les blocs `describe` et ne représentent donc pas ce nombre de fichiers.

| Contrôle | Résultat final / preuve |
| --- | --- |
| Version livrée | Branche dédiée indiquée en tête de document ; le commit et la PR sont fournis dans le compte rendu de livraison. Aucun merge ou déploiement effectué. |
| Tests du plan de salle | **177 cas réussis dans 18 fichiers**, dont 14 parcours de la page réelle avec ses composants et QueryClient, ainsi que 8 cas du helper de persistance. |
| Suite frontend globale | **4 490 / 4 492 cas réussis à la première exécution consolidée** (`vitest run --maxWorkers=4`). Deux reprises ciblées sont documentées ci-dessous ; aucune exclusion de test n'a été ajoutée. |
| Scénarios PostgreSQL | **20 / 20 réussis**, incluant branche nulle, alias historiques, droits, rejouement, rollback, préservation des frais et isolation de démonstration. Les trois migrations sont chargées deux fois dans une base jetable. |
| TypeScript | `pnpm run typecheck` : succès, code de sortie 0. |
| ESLint | `pnpm run lint` : succès, 0 erreur et 20 avertissements préexistants hors des fichiers modifiés. Le contrôle ciblé des sources modifiées ne relève aucun avertissement. |
| Build applicable | `pnpm run build` sur la version finale : succès en 48,76 s. Avertissement existant sur certains chunks supérieurs à 500 kB. Le pipeline `build:prod` a aussi réussi avant la dernière synchronisation, avec les limites SEO explicitées ci-dessous. |
| Fichiers générés et intégrité du diff | Index régénérés par `docs:application-index` ; `docs:application-index:check` et `git diff --check` réussis avant publication. Aucun fichier temporaire de build, log ou sitemap n'est livré. |
| Recette visuelle authentifiée | Non réalisée dans cet environnement ; conserver cette limite si aucune nouvelle recette n’a lieu. |

Les deux échecs du premier passage global ont été traités séparément. Le test de budget de l'index dépassait de 21 008 octets le plafond de 10 500 000 octets. Une revue du catalogue et de son format confirme une croissance utile des modules, tests, objets SQL et sections de documentation, incluant des changements marketing déjà intégrés sur `main`. Le plafond est porté à **10 750 000 octets**, soit environ 2 % de marge, sans changer le générateur ni retirer de contenu. Le fichier de tests de l'index a été réexécuté après régénération : **6 / 6 cas réussis**.

Le test `tok-connect-preview-sandbox.test.tsx`, extérieur au plan de salle, a échoué pendant le passage parallèle puis a **réussi seul, 1 / 1, en 221,94 ms**, sans modification de son code. Le journal du premier passage ne suffit pas à prouver la cause exacte ; une contention de ressources est une hypothèse. Ces reprises ne sont pas présentées comme une nouvelle exécution globale intégralement verte.

Les builds utilisent des valeurs Supabase publiques factices de CI. Le pipeline SEO de `build:prod` a terminé dans son mode de repli sans inventaire distant : cela ne vérifie pas les sitemaps de production. Ses sorties temporaires dans `public/` ont été retirées du diff.

Commandes de validation reproductibles, depuis la racine du dépôt avec les dépendances installées et les variables publiques de CI configurées :

```bash
pnpm exec vitest run src/test/floor-plan* src/test/service-shared.test.ts src/test/service-board.test.tsx src/test/studio-canvas.test.tsx src/test/table-context-drawer.test.tsx src/test/reservation-closure-dialog.test.tsx src/test/commercial-demo-restaurant-tools.test.ts
pnpm exec vitest run --maxWorkers=4
pnpm exec vitest run src/test/application-search-index.test.ts src/test/tok-connect-preview-sandbox.test.tsx --maxWorkers=1
pnpm run typecheck
pnpm run lint
pnpm run build
pnpm run docs:application-index
pnpm run docs:application-index:check
git diff --check
```

Le script PostgreSQL s’exécute avec `node scripts/test-floor-plan-workspace-postgres.mjs`. Il nécessite `@electric-sql/pglite` disponible localement, ou la variable `TOK_FLOORPLAN_PGLITE_MODULE` pointant vers son `dist/index.js`. La version utilisée est **0.5.10**. Il n’accepte aucune URL de base distante ; aucune dépendance PGlite de production n’est ajoutée par ce lot. Les 20 scénarios ont été exécutés avec le module local `/tmp/tok-mailing-dbtest/node_modules/@electric-sql/pglite/dist/index.js`.

Dans l’environnement de travail, pnpm peut aussi être invoqué par `npm exec --offline --cache /tmp/tok-floorplan-npm-cache --package=pnpm@10.28.1 -- pnpm …`. Cette méthode d’exécution n’est pas une modification de configuration de l’application.

## Livraison et retour arrière

Les fonctions attendues doivent être présentes avant que le nouveau frontend commence à les appeler. Ordre de livraison prévu, à exécuter dans une étape distincte et contrôlée :

1. `supabase/migrations/20261019090000_floor_plan_workspace_v3.sql` : sauvegarde atomique et contrôle de révision.
2. `supabase/migrations/20261019090100_floor_plan_seating_transition.sql` : installation physique dédiée.
3. `supabase/migrations/20261019090200_floor_plan_assignment_activity.sql` : statuts terminaux cohérents dans le writer d’affectation existant, avec une nouvelle migration.
4. Vérifier les fonctions et permissions attendues sur la cible, puis livrer le frontend testé.

Les trois migrations sont additives dans l’historique : aucune migration déjà appliquée n’est réécrite. La troisième remplace explicitement la définition du writer existant pour harmoniser son traitement des statuts. Elle conserve son interface et ne déclenche aucune reprise financière ou suppression de placements historiques.

En cas de régression du frontend, revenir à la version frontend antérieure. Les migrations peuvent rester en place puisque les anciens contrats restent disponibles ; la correction des statuts du writer reste intentionnelle. Une éventuelle correction SQL passe par une nouvelle migration relue, sans suppression automatique des fonctions ni annulation destructive des données. Un retour de version frontend n’annule pas les placements valablement enregistrés entre-temps.

Cette note ne vaut ni exécution de ces étapes, ni merge de la branche, ni déploiement.

## Fichiers du lot

Inventaire complet des **45 fichiers** modifiés ou créés. Les index générés sont régénérés par le script du dépôt, sans modification manuelle.

### Routes, pages et dialogue

- `src/App.tsx`
- `src/pages/dashboard/DashboardPlanSalle.tsx`
- `src/pages/dashboard/DashboardReservations.tsx`
- `src/components/dashboard/ReservationClosureDialog.tsx`

### Composants du plan

- `src/components/floor-plan/FloorPlanAIPanel.tsx`
- `src/components/floor-plan/ServiceBoard.tsx`
- `src/components/floor-plan/SimpleReservationQueue.tsx`
- `src/components/floor-plan/StudioCanvas.tsx`
- `src/components/floor-plan/StudioInspector.tsx`
- `src/components/floor-plan/StudioPalette.tsx`
- `src/components/floor-plan/TableContextDrawer.tsx`
- `src/components/floor-plan/ReservationServiceActions.tsx`
- `src/components/floor-plan/serviceShared.ts`

### Règles et persistance

- `src/lib/floorPlan.ts`
- `src/lib/floorPlanHealth.ts`
- `src/lib/floorPlanAiMerge.ts`
- `src/lib/floorPlanNavigation.ts`
- `src/lib/floorPlanWorkspacePersistence.ts`
- `src/lib/reservationMutations.ts`

### Tests et migrations

- `src/test/application-search-index.test.ts`
- `src/test/commercial-demo-restaurant-tools.test.ts`
- `src/test/flat-fee-on-arrival.test.ts`
- `src/test/reservation-fee-integrity.test.ts`
- `src/test/floor-plan-assignment-governance.test.ts`
- `src/test/floor-plan-automatic-import.test.ts`
- `src/test/floor-plan-page-layout.test.ts`
- `src/test/floor-plan.test.ts`
- `src/test/service-board.test.tsx`
- `src/test/service-shared.test.ts`
- `src/test/studio-canvas.test.tsx`
- `src/test/table-context-drawer.test.tsx`
- `src/test/floor-plan-ai-merge.test.ts`
- `src/test/floor-plan-navigation.test.tsx`
- `src/test/floor-plan-service-ux.test.tsx`
- `src/test/floor-plan-service-workspace.test.tsx`
- `src/test/floor-plan-workspace-persistence.test.ts`
- `src/test/reservation-closure-dialog.test.tsx`
- `scripts/test-floor-plan-workspace-postgres.mjs`
- `supabase/migrations/20261019090000_floor_plan_workspace_v3.sql`
- `supabase/migrations/20261019090100_floor_plan_seating_transition.sql`
- `supabase/migrations/20261019090200_floor_plan_assignment_activity.sql`

### Note de livraison

- `docs/audits/tok-floor-plan-service-ux-2026-10-19.md`

### Index applicatifs générés

- `docs/architecture/TOK_APPLICATION_REFERENCE.md`
- `docs/architecture/tok-application-search-index.json`
- `src/data/tok-user-guide-catalog.generated.ts`
