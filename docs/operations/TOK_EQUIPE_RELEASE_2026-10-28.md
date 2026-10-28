# TOK Équipe — dossier de livraison du 28 octobre 2026

## 1. État de la livraison

Ce dossier décrit le lot préparé sur la branche `feat/tok-equipe-swisstime-20261028`, initialement issue de `7d34670974e81a1ea13090296ec3c14e1e311f98`. Avant le commit de livraison, la base a été actualisée sur `main` à `070aecdfb2a8cca59191d329034c380117abf1ab` (PR Cloudprinter #999). La PR #1004 intègre également `837705c65cedfbfb3406fe9542e4afdf66020938` (inscription restaurateur et CSP, PR #1002) ; les trois conflits d’index générés ont été résolus par régénération après intégration des sources. Le dossier distingue le code vérifié localement, les vérifications de publication et les éléments déjà actifs en production.

**Le nouveau code applicatif, la migration d’intégrité et l’Edge Function `tok-workforce-assistant` ne sont pas encore déployés à la date de rédaction.** Les tests locaux ne constituent pas une preuve de déploiement. Les références exactes du commit, de la PR et des exécutions GitHub figurent dans le compte rendu de livraison et dans la PR de la branche ; les preuves locales et la liste complète des fichiers sont consignées ci-dessous.

| Élément | État constaté |
|---|---|
| Branche d’implémentation | Implémentation terminée sur la branche dédiée ; contrôles de publication dans la PR. |
| Migration `20261028044351_tok_workforce_integrity_and_workflows.sql` | Présente dans la branche ; non appliquée en production dans ce lot. |
| Edge Function `tok-workforce-assistant` | Présente dans la branche ; non déployée dans ce lot. |
| Frontend des nouveaux parcours Équipe | Présent dans la branche ; non déployé dans ce lot. |
| Entrées `equipe.thetok.ch` et `équipe.thetok.ch` | **Actives et vérifiées** ; redirections publiées séparément. |
| Navigation publique vers le portail protégé | Vérifiée dans un navigateur réel : passage vers l’authentification avec continuation conservée. |
| Navigation authentifiée dans la nouvelle UI | **Non vérifiée dans le navigateur cloud** : ce navigateur ne rejoint pas le serveur local. Les tests de composants ne remplacent pas cette vérification. |

### Référence fonctionnelle et méthode

- Source auditée : [mtnrconcept/swiss-time-tracker au commit `7cab98100ae189b7eec1234a7cbc6b49db2f95b7`](https://github.com/mtnrconcept/swiss-time-tracker/tree/7cab98100ae189b7eec1234a7cbc6b49db2f95b7).
- Skill personnelle installée : [implement-tok-equipe](https://chatgpt.com/skills?skill_id=6ae17cf3a9548191a129996ebf58834b).
- Inventaire des treize familles fonctionnelles, écrans, droits, relations et écarts assumés : [matrice SwissTime → TOK](../architecture/TOK_EQUIPE_FUNCTIONAL_PARITY.md).
- Règles de livraison : [AGENTS.md](../../AGENTS.md) et [TOK Release Gatekeeper](../skills/TOK_RELEASE_GATEKEEPER.md).

**Risque retenu : niveau 3.** Le lot touche des données RH privées, les rôles par restaurant, RLS, des fonctions SQL privilégiées, des transitions concurrentes, des signatures, des exports et une Edge Function avec crédits IA. Une vérification des boutons ou du seul rendu ne suffit pas à démontrer l’isolation et l’intégrité.

## 2. Périmètre du lot

Le détail fonctionnel fait autorité dans la [matrice de couverture](../architecture/TOK_EQUIPE_FUNCTIONAL_PARITY.md). Le périmètre de cette livraison comprend :

- collaborateurs, contrat, invitations et rattachement à un compte TOK ;
- planning partagé, services, déplacements, conflits, absences et calendrier des fériés ;
- badgeuse serveur, relevés, corrections structurées, validation individuelle ou groupée et preuve liée à une version ;
- demandes avec effet métier pour les congés et corrections, commentaire de décision et historique personnel ;
- reprise d’un service ou échange réciproque avec accord du collègue et décision du responsable ;
- espace personnel avec vue d’ensemble, planning, heures, compteurs, demandes et échanges ;
- rapports mensuels et hebdomadaires, CSV complet, PDF individuel et global avec signatures ;
- analyse de six mois, heures et coûts individuels, indicateur opérationnel de charge et de repos ;
- paramètres et assistant de planning dans le contexte du restaurant ;
- continuation d’authentification et entrées de sous-domaines vers le site canonique.

Les écrans réutilisent les comptes et les restaurants TOK. Un rôle local de responsable ne confère pas les droits d’administration de la plateforme. L’acceptation d’une demande « Planning » ou « Autre » reste une décision commentée ; elle ne crée pas automatiquement des services. L’assistant fournit une réponse et n’applique pas un planning automatiquement.

### Liste des fichiers et références de publication

La branche et ses contrôles fournissent la référence versionnée de la livraison :

| Référence | Valeur |
|---|---|
| Branche | [`feat/tok-equipe-swisstime-20261028`](https://github.com/Mtnrconcept1/cloud-rebuild/tree/feat/tok-equipe-swisstime-20261028) |
| Comparaison avec main | [Diff de livraison](https://github.com/Mtnrconcept1/cloud-rebuild/compare/main...feat/tok-equipe-swisstime-20261028) |
| PR et CI | [PR #1004](https://github.com/Mtnrconcept1/cloud-rebuild/pull/1004) ; vérifier le SHA de tête dans l’onglet Checks. |
| Liste complète des fichiers | Section 11, extraite du staging de livraison. |
| Déploiement Supabase / Edge | Non réalisé dans ce lot. |
| Déploiement frontend | Non réalisé dans ce lot. |

## 3. Entrées de domaine déjà publiées

Le manifeste [tok-equipe-entry-routes.json](../architecture/tok-equipe-entry-routes.json) conserve les métadonnées de la publication du 28 octobre 2026 :

| Métadonnée | Valeur |
|---|---|
| Version publiée | `788308b6-0969-47e9-81f1-9b2ff38e56f0` |
| Version précédente | `250b0e5b-2fbe-4d51-9fce-8bb184ce91ce` |
| Domaine ASCII | `equipe.thetok.ch` |
| Domaine accentué, forme DNS | `xn--quipe-9ra.thetok.ch` |

Comportement actif vérifié :

| Entrée | Résultat |
|---|---|
| Racine de chacun des deux sous-domaines | HTTP **307** vers `https://www.thetok.ch/equipe/mon-espace`. |
| `/equipe/mon-espace` sur chacun des sous-domaines | HTTP **307** vers le même chemin sur `www.thetok.ch`. |
| Autre chemin `/<chemin>` | HTTP **307** vers `https://www.thetok.ch/<chemin>`, selon la règle publiée. |
| Paramètre `restaurant` d’un lien | Conservé dans la redirection et la continuation vers le portail après authentification. |
| `https://www.thetok.ch/` | Toujours **200** ; la racine du site canonique n’est pas redirigée vers Équipe. |

La navigation publique a atteint l’authentification avec la continuation attendue. Elle ne prouve ni le fonctionnement d’une session employé/manager dans le nouveau frontend, ni le déploiement de ses migrations. La publication de ces redirections est indépendante du lot applicatif restant à livrer.

## 4. Cible Supabase et conditions de déploiement

La cible de production déclarée et vérifiée en lecture seule est **`wwcrtyoueexyxkkikaos`**. Le fichier [supabase/config.toml](../../supabase/config.toml), le [workflow de production](../../.github/workflows/deploy-production.yml) et la cible de production attendue sont cohérents.

`corepack pnpm run supabase:doctor:all` a échoué dans ce worktree, qui ne possède pas les fichiers `.env` attendus ni le lien CLI Supabase local. Cet échec ne constitue pas une validation de connectivité ou d’état du schéma distant. Il doit rester visible dans le bilan ; le contrôle de cible et le doctor du pipeline devront réussir dans leur environnement autorisé.

**Aucun secret ni fichier d’environnement n’a été créé, modifié ou recopié pour contourner cette limite.** Ce dossier ne fournit aucune URL de connexion à une base de production et n’invite pas à lancer les fixtures SQL sur celle-ci.

## 5. Ordre de livraison

La livraison suit le pipeline existant [deploy-production.yml](../../.github/workflows/deploy-production.yml), avec ses validations et contrôles de cible. Les déploiements Git automatiques Vercel restent désactivés ; le frontend est publié par la sortie préconstruite du workflow, avec `vercel deploy --prebuilt --prod`.

L’ordre nécessaire est : **migration → Edge Function → frontend**. La compilation frontend peut être préparée en parallèle, mais sa publication attend la réussite du déploiement Supabase requis.

### Étape 1 — Valider et appliquer la migration

1. Fixer le SHA à livrer et compléter les résultats de CI pour ce SHA.
2. Faire réussir les contrôles de cible et de préflight du pipeline sur `wwcrtyoueexyxkkikaos`.
3. Appliquer la nouvelle migration [20261028044351_tok_workforce_integrity_and_workflows.sql](../../supabase/migrations/20261028044351_tok_workforce_integrity_and_workflows.sql) après les migrations historiques déjà présentes.
4. Contrôler la présence des nouvelles colonnes, tables, politiques et RPC avant de publier leurs consommateurs.

La migration apporte notamment les versions des relevés, les preuves de signature, les transitions de demandes/échanges, les contraintes d’intégrité et le calendrier des fériés. Ne pas réécrire les migrations historiques ni ajouter de retour arrière qui supprimerait les preuves.

### Étape 2 — Déployer l’Edge Function

Déployer [tok-workforce-assistant](../../supabase/functions/tok-workforce-assistant/index.ts) avec ses dépendances partagées et la configuration du lot, par la sélection des fonctions impactées du pipeline.

Vérifier que la fonction publiée utilise l’authentification, l’autorisation de planifier pour le restaurant, l’activation du module, les limites de requêtes, RLS et le mécanisme de crédits IA existants. Les changements dans les fichiers partagés peuvent sélectionner d’autres fonctions dans le plan de déploiement : contrôler cette liste dans la CI, sans la réduire arbitrairement au nom du nouvel assistant.

Le contexte de l’assistant est borné. Une indisponibilité, un contexte trop volumineux ou un crédit insuffisant doit produire une erreur visible, pas un résultat présenté comme complet. La réponse de l’assistant ne doit pas être confondue avec une modification appliquée au planning.

### Étape 3 — Publier le frontend

Publier la sortie du build du SHA validé par le job frontend du même pipeline. Cette version dépend des nouvelles RPC et colonnes ; elle ne doit pas être publiée avant la migration et l’Edge Function.

Après publication, vérifier les parcours ciblés avec des comptes de test autorisés : accès employé et manager, choix du restaurant, correction et congé approuvés, signature, échange effectif, compteurs et export. Vérifier aussi les états de refus d’accès, d’erreur et de données absentes. Les contrôles doivent préserver les données réelles et les autorisations de la session.

## 6. Retour arrière non destructif

Le retour arrière vise d’abord à arrêter un parcours défaillant, en conservant les données et les preuves déjà créées.

| Surface | Mesure de repli | Données à conserver |
|---|---|---|
| Frontend | Republier le dernier artefact connu compatible, ou désactiver temporairement le module pour les établissements concernés par le mécanisme d’administration existant. | Relevés, demandes, affectations, signatures et historique. |
| Assistant | Retirer temporairement son accès dans l’interface ou rétablir une version compatible de la fonction, selon le périmètre autorisé. | Historique d’audit et écritures de crédits déjà confirmées. |
| Migration / règles d’intégrité | Conserver les objets et la protection ; corriger par une nouvelle migration revue. | Versions, snapshot, empreinte, références des demandes, état des échanges et fériés. |
| Redirections de domaine | Seulement si la régression concerne ces entrées, rétablir la version de routage précédente consignée dans le manifeste. | Configuration du site canonique et autres routes. |

Un ancien frontend peut utiliser des écritures directes désormais interdites par le serveur. **Le retour au frontend précédent ne garantit donc pas la compatibilité des anciens formulaires de signature ou de décision.** Préférer la désactivation temporaire du module à une réouverture des privilèges ou à la suppression des verrous.

Ne pas supprimer les colonnes de preuve, les signatures, les absences créées depuis une demande ou les traces d’échange. Ne pas restaurer des données anciennes par-dessus des décisions plus récentes sans procédure distincte explicitement autorisée. Toute opération de production et toute fusion suivent les autorisations déjà accordées dans la session et les contrôles du dépôt.

## 7. Hypothèses du moteur et limites fonctionnelles

Le moteur partagé est [tokWorkforceReporting.ts](../../src/lib/tokWorkforceReporting.ts). Les vues personnelles, les rapports et l’analyse utilisent la même base ; le calcul de validation des heures consomme également `workforceEntryTimeSlices`.

| Sujet | Règle appliquée / limite |
|---|---|
| Fuseau | `Europe/Zurich`, avec ventilation à minuit et aux limites de période. |
| Précision | Calculs sans arrondi intermédiaire des heures ; arrondi seulement pour l’affichage ou le format d’export. |
| Badgeuse | Horodatage serveur exact utilisé si les horaires et la pause du relevé correspondent à la session ; une correction manuelle ne doit pas être écrasée par la session d’origine. |
| Changement d’heure | Une heure locale manuelle ambiguë ou inexistante est signalée ; les exports sont bloqués tant qu’elle n’est pas régularisée. Une session serveur correspondante permet de désambiguïser l’instant. |
| Pauses | Répartition proportionnelle entre les plages réellement travaillées, faute d’intervalles détaillés exploités dans les rapports. |
| Nuit et dimanche | Nuit de 23 h à 6 h ; dimanche limité aux minutes réellement situées ce jour. |
| Contrat | Heures hebdomadaires réparties du lundi au vendredi, bornées par début et fin de contrat. Base indicative pour les personnes dont les jours travaillés varient. |
| Fériés | Calendrier configuré pour le restaurant ; pas de génération automatique d’un calendrier légal cantonal. |
| Crédit d’absence | Vacances, maladie et fériés crédités ; autres absences non créditées automatiquement ; crédit plafonné à une journée contractuelle par date. |
| Absence non imputable | Une absence ne contenant aucun jour ouvré imputable hors fériés est signalée et bloque l’export. Le responsable doit vérifier ses dates et son décompte. |
| Vacances | Droit proratisé selon les jours calendaires du contrat dans l’année ; jours décomptés répartis entre les jours ouvrés de l’absence ; ventilation entre années. |
| Pris / réservé | Congés approuvés passés : pris ; futurs : réservés. Une demande en attente ne consomme pas le solde. |
| Solde d’heures | Comparaison au contrat jusqu’à la date d’arrêté, sans déficit généré par les jours futurs. Solde provisoire tant que les relevés ne sont pas validés. |
| Coûts | Tarif individuel actuel, sans historique salarial, charges, majorations ni retenues. Une valeur manquante rend le coût partiel. |
| Charge et repos | Indicateur opérationnel expliqué : 40 % planning/contrat, 40 % repos, 20 % réalisé/attendu. Pas de diagnostic de santé ni de certification de conformité. |
| Volume | Requêtes paginées avec plafond explicite et erreur si dépassé ; détection d’un changement du nombre de lignes ou d’identifiants répétés entre pages ; aucune troncature silencieuse. Le filtre collaborateur permet d’affiner les rapports et l’analyse de six mois. |

### Attestations et signatures historiques

Les nouvelles signatures sont liées à la version du relevé et à une copie de son contenu avec empreinte. Les anciennes signatures ne possèdent pas rétrospectivement cette preuve : aucun snapshot ni hash ne leur est inventé.

Une signature historique n’est reconnue dans les rapports que si le relevé est encore dans sa version initiale et si son `updated_at`, valide et disponible, ne dépasse pas `signed_at`. Une signature liée à une autre version, ou dont l’absence de modification ne peut pas être vérifiée, ne doit pas compter comme validation actuelle. Les signatures historiques reconnues sont libellées séparément dans les détails et les exports.

Les images intégrées aux PDF sont des **signatures visuelles**. Elles ne constituent pas une signature électronique qualifiée. Un rapport ou une signature illisible ne doit pas être exporté comme une preuve complète.

## 8. Vérifications réellement effectuées sur le lot calculs / rapports / personnel

Les résultats ci-dessous ont été exécutés localement sur la branche de travail. Ils ne préjugent pas du résultat final de la suite globale ou de la CI après toutes les modifications réunies.

| Commande / contrôle | Résultat observé |
|---|---|
| Vitest sur les quatre fichiers listés ci-dessous | **4 fichiers réussis, 31 tests réussis** : 16 calculs, 7 espace personnel, 5 UI rapports/analytics, 3 PDF. |
| ESLint ciblé sur les neuf fichiers TS/TSX listés ci-dessous | **Réussi**, code de sortie 0. |
| `corepack pnpm run typecheck` | **Réussi**, code de sortie 0, sur l’état de branche vérifié à la fin du lot. |
| Génération du PDF synthétique global | **Réussie**, 5 pages A4 paysage, 43 203 octets, police embarquée et images de signatures. |
| Contrôle visuel du PDF | **Cinq pages inspectées** après correction typographique : accents, signatures, détail, notes, totaux et pagination lisibles. |

Commande ciblée reproductible depuis la racine du dépôt :

```bash
corepack pnpm exec vitest run \
  src/test/tokWorkforceReporting.test.ts \
  src/test/tokWorkforcePersonalOverview.test.tsx \
  src/test/tokWorkforceReportsUi.test.tsx \
  src/test/tokWorkforcePdf.test.ts
```

```bash
corepack pnpm exec eslint \
  src/lib/tokWorkforceReporting.ts \
  src/lib/tokWorkforcePdf.ts \
  src/components/workforce/WorkforceReports.tsx \
  src/components/workforce/WorkforceAnalytics.tsx \
  src/components/workforce/WorkforcePersonal.tsx \
  src/test/tokWorkforceReporting.test.ts \
  src/test/tokWorkforcePdf.test.ts \
  src/test/tokWorkforcePersonalOverview.test.tsx \
  src/test/tokWorkforceReportsUi.test.tsx

corepack pnpm run typecheck
```

La preuve visuelle de travail est `/tmp/tok-workforce-report-sample.pdf`, avec les rendus `/tmp/tok-workforce-report-final-1.png` à `-5.png`. Ces fichiers temporaires ne sont pas des données de production et ne sont pas versionnés. Pour régénérer le PDF synthétique :

```bash
TOK_PDF_SAMPLE_PATH=/tmp/tok-workforce-report-sample.pdf \
  corepack pnpm exec vitest run src/test/tokWorkforcePdf.test.ts
```

Les tests couvrent notamment le passage de minuit, les changements d’heure, une correction d’une seconde, les contrats hors année, les crédits, les congés entre années, la version des signatures, l’isolation restaurant, les filtres et les erreurs d’export. Ils ne remplacent pas les essais SQL de concurrence ou une navigation authentifiée sur la version déployée.

## 9. Reproduction des deux smokes PostgreSQL

Le workflow [TOK Workforce PostgreSQL Integration](../../.github/workflows/tok-workforce-postgres.yml) exécute deux commandes. La première [tok_workforce_postgres_smoke.sql](../../src/test/sql/tok_workforce_postgres_smoke.sql) prépare les fixtures, rejoue les migrations historiques utiles et inclut déjà `tok_workforce_launch_smoke.sql` puis [tok_workforce_integrity_smoke.sql](../../src/test/sql/tok_workforce_integrity_smoke.sql). La seconde [tok_workforce_concurrency_smoke.sql](../../src/test/sql/tok_workforce_concurrency_smoke.sql) vérifie de véritables sessions concurrentes avec `dblink`.

### Prérequis

Utiliser **PostgreSQL 17 jetable**, avec `psql`, les droits nécessaires à la création des rôles de test et l’extension `dblink` disponible. Le serveur doit autoriser sa connexion locale par socket pour l’utilisateur des tests, comme le conteneur PostgreSQL du workflow. La suite de concurrence ne fonctionne pas sur un moteur limité à une seule session, tel que PGlite.

Lancer depuis la racine du dépôt, sur une base **neuve** réservée à ces fixtures. Le script crée un schéma `auth` simplifié et des fonctions d’autorisation de test : **ne jamais le lancer sur la production ou sur une base applicative à conserver**.

Exemple avec un PostgreSQL de test local, authentifié par la configuration locale prévue à cet effet :

```bash
set -eu
TOK_EQUIPE_TEST_DB=tok_equipe_release_20261028

createdb --host=127.0.0.1 --port=5432 --username=postgres "$TOK_EQUIPE_TEST_DB"

psql -X --host=127.0.0.1 --port=5432 --username=postgres \
  --dbname="$TOK_EQUIPE_TEST_DB" -v ON_ERROR_STOP=1 \
  -f src/test/sql/tok_workforce_postgres_smoke.sql

psql -X --host=127.0.0.1 --port=5432 --username=postgres \
  --dbname="$TOK_EQUIPE_TEST_DB" -v ON_ERROR_STOP=1 \
  -f src/test/sql/tok_workforce_concurrency_smoke.sql
```

Ces commandes ne nécessitent aucun secret Supabase de production. Si la base de cet exemple existe déjà, choisir une nouvelle base de test vierge avant de recommencer. Ne pas relancer `tok_workforce_integrity_smoke.sql` séparément après la première commande : il applique lui-même la nouvelle migration, qui a déjà été rejouée par inclusion. Ne pas ajouter `--single-transaction` à la suite de concurrence : elle utilise volontairement plusieurs transactions et une seconde session.

Les deux smokes ont été exécutés sur PostgreSQL 17.10 natif dans une base jetable, avec succès. Le smoke historique et d’intégrité a également passé sur PostgreSQL 18.6 via PGlite. La suite de concurrence utilise réellement plusieurs connexions PostgreSQL 17 avec dblink ; elle ne simule pas les verrous dans JavaScript. Le serveur temporaire a été arrêté après les vérifications.

## 10. Vérifications de livraison

La suite complète locale ci-dessous a été exécutée sur la base `070aecdf`. Après intégration de `837705c6`, **7 fichiers et 121 tests ont réussi** sur les parcours d’authentification, continuation, portail employé, gestion, routage et index. Les checks GitHub portent sur le SHA final de la PR.

Le [premier passage GitHub complet](https://github.com/Mtnrconcept1/cloud-rebuild/actions/runs/40639263815), sur `d6093d9e`, a validé **les quatre lots de tests : 5 519 tests réussis et 2 ignorés**, ainsi que les workflows PostgreSQL/concurrence, tests modifiés, sécurité TOK Connect et confirmation de consentement. Son contrôle qualité a ensuite signalé la dépendance de production préexistante `zod@3.25.76` au titre de [GHSA-mrhx-c7xc-m3w5](https://github.com/advisories/GHSA-mrhx-c7xc-m3w5).

Le correctif de livraison met cette seule dépendance racine à la [version officielle 4.6.7](https://github.com/colinhacks/zod/releases/tag/v4.6.7), avec son lockfile. Aucun import ou schéma Zod n’a été trouvé dans les 1 889 fichiers source/configuration inspectés ; OpenAI 6.39.1 accepte ce peer v4. Le resolver de formulaires inutilisé et la chaîne Puppeteer/Chromium-BiDi de développement restent hors de cette correction. Un futur usage du resolver avec Zod 4 devra utiliser une version compatible. Aucun advisory n’est ignoré et le gate existant `pnpm audit --prod --audit-level high` est conservé.

Après ce correctif, **l’audit de production signale zéro vulnérabilité sur 397 dépendances**, le typecheck réussit et le build de production réussit en **52,41 secondes**. La CI est relancée sur le nouveau commit de la PR ; les résultats définitifs restent attachés à son SHA de tête.

| Contrôle | Résultat local / portée | Commande ou preuve |
|---|---|---|
| Suite applicative complète | 759 fichiers réussis, 1 fichier avec un échec d’index, 1 fichier ignoré ; **5 508 tests réussis, 1 échec d’index, 2 tests ignorés**. Le seul échec compare un index généré avant le dernier ajustement de typage Deno. | `corepack pnpm exec vitest run --maxWorkers=4` ; 421,49 s. |
| Recontrôle de l’index et du serveur | **4 fichiers, 38 tests réussis**, dont les 6 tests de l’index. Le seul échec de la suite complète est fermé après régénération. | `application-search-index.test.ts`, `tokWorkforceAssistant.test.ts`, `admin-audit-log-narrative.test.ts`, `incident-evidence-depth.test.ts`. L’index est de nouveau généré et contrôlé après cette mise à jour documentaire. |
| Requêtes paginées | 6 tests réussis, dont déplacement concurrent d’une ligne provoquant un doublon détecté. | `tokWorkforcePersonalQueries.test.tsx`. |
| Derniers contrats UI | 32 tests réussis dans les 5 fichiers dédiés aux heures, échanges, demandes et absences. | Correctifs de consentement historique, preuve historique, suppression, commentaire et jours ouvrés. |
| Calculs, espace personnel, rapports et PDF | 31 tests réussis dans 4 fichiers ; PDF synthétique de 5 pages contrôlé visuellement. | Détail en section 8. |
| Assistant et catalogues | 32 tests réussis lors du contrôle dédié, puis parcours inclus dans la suite complète. | Droits, RLS, périodes et bords nocturnes, contexte minimal, crédits, journaux et erreurs. |
| PostgreSQL 18.6 / PGlite | Smoke historique, nouvelle migration et intégrité réussis. | `ALL SQL ASSERTIONS PASSED: 20 chunks`. |
| PostgreSQL 17.10 natif | Même smoke réussi, puis concurrence réelle réussie. | `ALL NATIVE SQL ASSERTIONS PASSED: 20 chunks` et `TOK WORKFORCE CONCURRENCY POSTGRES SMOKE PASSED`. |
| Lint global | Réussi : 0 erreur ; 23 avertissements préexistants hors fichiers de ce lot. | `corepack pnpm lint`. |
| TypeScript frontend final | Réussi, code de sortie 0. | `corepack pnpm run typecheck`. |
| Build frontend de production | Réussi après le correctif Zod, 5 164 modules transformés, 52,41 s. Avertissement existant sur certains bundles volumineux. | `corepack pnpm build`, configuration publique Supabase injectée uniquement au processus. |
| Audit des dépendances de production | Réussi après mise à jour de la dépendance racine Zod : 0 vulnérabilité, 397 dépendances. | `corepack pnpm audit --prod --audit-level high --json` ; critère du gate inchangé. |
| Typage réel Edge | Réussi avec Deno officiel 2.9.6, checksum vérifié ; lock et cache temporaires. | Commande ci-dessous. |
| Cohérence du diff | Contrôle UTF-8, liens documentaires et espaces du diff. | `git diff --cached --check` et index déterministe. |
| `supabase:doctor:all` dans le worktree | Échec expliqué : absence des fichiers d’environnement et du lien CLI locaux. Aucune opération de production exécutée. | Préflight et doctor du pipeline à conserver avant déploiement. |
| Navigation publique | Deux domaines HTTPS vérifiés, 307 et paramètre restaurant conservé ; site canonique en 200. Portail protégé rejoint l’authentification avec la continuation attendue. | Version de routage dans le manifeste ; vérification HTTP et navigateur réel. |
| Navigation authentifiée de la nouvelle UI | Non exécutée dans le navigateur cloud, qui ne rejoint pas localhost. Tests de composants et intégrations routeur exécutés localement. | Vérifier les parcours après publication dans un environnement accessible avec comptes de test autorisés. |
| CI de la PR | Exécutée par GitHub après publication de la branche ; consulter les checks associés au SHA exact de la PR. | La CI reste la référence pour l’autorisation de fusion. |
| Migration / Edge / frontend en production | Non déployés par cette préparation. | Ordre de livraison décrit en section 5. |

Commande Deno utilisée, sans modifier `deno.lock` du dépôt :

```bash
env DENO_NO_PACKAGE_JSON=1 DENO_NO_UPDATE_CHECK=1 \
  DENO_DIR=/tmp/tok-equipe-deno-cache \
  /tmp/tok-equipe-deno-2.9.6/deno check \
  --no-config --node-modules-dir=none \
  --lock=/tmp/tok-equipe-edge-check.lock \
  supabase/functions/tok-workforce-assistant/index.ts
```

Les premières tentatives de suite globale dans le sandbox n’autorisaient pas certains sous-processus Git ou serveurs HTTP locaux. Elles ont été remplacées par l’exécution complète autorisée ci-dessus ; aucun test n’a été désactivé pour masquer ces restrictions. Aucun appel IA facturable ni email réel n’a été envoyé pendant les tests.

## 11. Liste complète des fichiers du lot

Cette liste porte sur le diff du lot Équipe par rapport à la base `837705c65cedfbfb3406fe9542e4afdf66020938`. Les fichiers Cloudprinter, Auth et CSP intégrés depuis main sont hors de ce diff. `A` signifie ajouté ; `M`, modifié.

| État | Fichier |
|---|---|
| M | `.github/workflows/tok-workforce-postgres.yml` |
| M | `docs/architecture/TOK_APPLICATION_REFERENCE.md` |
| A | `docs/architecture/TOK_EQUIPE_FUNCTIONAL_PARITY.md` |
| M | `docs/architecture/tok-application-search-index.json` |
| A | `docs/architecture/tok-equipe-entry-routes.json` |
| A | `docs/operations/TOK_EQUIPE_RELEASE_2026-10-28.md` |
| M | `package.json` |
| M | `pnpm-lock.yaml` |
| A | `public/fonts/barlow/Barlow-Bold.ttf` |
| A | `public/fonts/barlow/Barlow-Regular.ttf` |
| A | `public/fonts/barlow/OFL.txt` |
| M | `src/components/workforce/WorkforceAbsences.tsx` |
| M | `src/components/workforce/WorkforceAnalytics.tsx` |
| A | `src/components/workforce/WorkforceAssistant.tsx` |
| M | `src/components/workforce/WorkforceEmployees.tsx` |
| M | `src/components/workforce/WorkforceExchanges.tsx` |
| M | `src/components/workforce/WorkforcePersonal.tsx` |
| M | `src/components/workforce/WorkforcePersonalExchanges.tsx` |
| M | `src/components/workforce/WorkforcePlanning.tsx` |
| M | `src/components/workforce/WorkforceReports.tsx` |
| A | `src/components/workforce/WorkforceRequestForm.tsx` |
| M | `src/components/workforce/WorkforceRequests.tsx` |
| A | `src/components/workforce/WorkforceSettingsPanel.tsx` |
| A | `src/components/workforce/WorkforceShiftDialog.tsx` |
| M | `src/components/workforce/WorkforceTime.tsx` |
| M | `src/components/workforce/WorkforceWeekGrid.css` |
| M | `src/components/workforce/WorkforceWeekGrid.tsx` |
| A | `src/components/workforce/workforcePlanningChecks.ts` |
| M | `src/data/tok-user-guide-catalog.generated.ts` |
| M | `src/hooks/useTokWorkforce.ts` |
| M | `src/lib/admin/auditLogNarrative.ts` |
| M | `src/lib/tokWorkforce.ts` |
| A | `src/lib/tokWorkforcePdf.ts` |
| A | `src/lib/tokWorkforceReporting.ts` |
| M | `src/lib/workforceContinuation.ts` |
| M | `src/pages/dashboard/DashboardWorkforce.tsx` |
| M | `src/pages/workforce/MyWorkforce.tsx` |
| M | `src/pages/workforce/MyWorkforceManager.tsx` |
| A | `src/test/MyWorkforceManager.test.tsx` |
| A | `src/test/fixtures/workforce-synthetic-signature.png` |
| A | `src/test/sql/tok_workforce_concurrency_smoke.sql` |
| A | `src/test/sql/tok_workforce_integrity_smoke.sql` |
| M | `src/test/sql/tok_workforce_postgres_smoke.sql` |
| A | `src/test/tokWorkforceAbsencesUi.test.tsx` |
| A | `src/test/tokWorkforceAssistant.test.ts` |
| A | `src/test/tokWorkforceExchangeReviewUi.test.tsx` |
| M | `src/test/tokWorkforceInvitationsUi.test.tsx` |
| A | `src/test/tokWorkforcePdf.test.ts` |
| A | `src/test/tokWorkforcePersonalExchangesUi.test.tsx` |
| M | `src/test/tokWorkforcePersonalOverview.test.tsx` |
| M | `src/test/tokWorkforcePersonalQueries.test.tsx` |
| A | `src/test/tokWorkforceReporting.test.ts` |
| A | `src/test/tokWorkforceReportsUi.test.tsx` |
| A | `src/test/tokWorkforceRequestsUi.test.tsx` |
| A | `src/test/tokWorkforceSettingsAssistantUi.test.tsx` |
| A | `src/test/tokWorkforceShiftEditor.test.tsx` |
| A | `src/test/tokWorkforceTimeValidation.test.tsx` |
| M | `src/test/workforce-auth-continuation.test.ts` |
| M | `src/test/workforce-week-grid.test.tsx` |
| M | `supabase/config.toml` |
| M | `supabase/functions/_shared/auth.ts` |
| M | `supabase/functions/_shared/error-code-map.ts` |
| A | `supabase/functions/_shared/workforce-assistant-context.ts` |
| A | `supabase/functions/tok-workforce-assistant/index.ts` |
| A | `supabase/migrations/20261028044351_tok_workforce_integrity_and_workflows.sql` |
