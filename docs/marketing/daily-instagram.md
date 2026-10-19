# TOK — Série Instagram quotidienne

## Périmètre et état de livraison

Cette fonctionnalité prépare **un brouillon Instagram par jour**, avec un visuel individuel et sa légende, sans date de fin. Elle concerne la communication de TOK auprès des restaurateurs ; elle ne remplace pas les références propres aux studios des restaurants.

La génération quotidienne n’approuve et ne publie aucun post. Chaque résultat retenu rejoint le calendrier avec `status = draft` et `approval_status = pending`. La campagne associée reste également en brouillon. La publication suit ensuite le parcours de validation existant, avec une intégration Instagram opérationnelle et une date de diffusion valide.

Ce document décrit le code de la fonctionnalité. **Il ne constitue pas une preuve de déploiement ou d’activation en production.** La livraison demandée passe par une branche dédiée et une PR à relire ; aucun merge dans `main` n’est autorisé par cette tâche. La migration initialise la série **en pause**.

## Où la configurer

Ouvrir `https://marketing.thetok.ch/marketing?view=automations`, puis la carte **Instagram · un post par jour**, placée en tête des automatisations. L’onglet **Agent** contient aussi le lien **Configurer la série quotidienne**.

Les réglages sont réservés à une session administrateur marketing avec MFA :

1. Consulter l’état du service et de la planification. L’activation reste désactivée tant que ces prérequis ne sont pas prêts.
2. Choisir **Heure de génération**. La valeur initiale est **10:00**, fuseau **Europe/Zurich**, avec changement d’heure automatique.
3. Cliquer sur **Activer la série**. Après une première activation, le bouton devient **Reprendre la série** lorsque celle-ci est en pause.
4. Pour changer l’heure, utiliser **Enregistrer l’heure**. La version reçue du serveur protège contre l’écrasement des réglages d’un autre administrateur. En cas de conflit, cliquer sur **Recharger les réglages**, puis revoir la modification.
5. Utiliser **Mettre en pause** pour arrêter les prochaines prises en charge. Ce bouton reste utilisable lorsque le moteur global est indisponible. Une génération déjà en cours peut encore terminer et enregistrer son brouillon.
6. Dans **Dernières productions**, **Voir le post** ouvre le bon élément du calendrier avec son identifiant, sa campagne et sa date. Relire la campagne et le post avant leur approbation et leur planification.

Le panneau affiche les 30 dernières productions, les tentatives, la prochaine reprise éventuelle, le nombre de brouillons créés et les erreurs résumées. Il s’actualise toutes les 60 secondes lorsqu’il est visible. Il n’expose pas de bouton pour réinitialiser un jour ayant épuisé ses tentatives.

## Cadence et reprise après incident

Le cron dédié `tok-marketing-daily-generator` s’exécute toutes les cinq minutes, 24 h/24 :

```text
*/5 * * * *
SELECT public.invoke_marketing_daily_generator_cron();
```

Chaque passage vérifie si une production est due. Il ne génère pas une image à chaque passage. La date et l’heure de référence sont celles de `Europe/Zurich`, indépendamment du fuseau du serveur.

Une production peut être prise en charge lorsque la série est active, que l’administrateur propriétaire est toujours autorisé, que le moteur global est disponible et que l’heure locale choisie est atteinte. Le démarrage réel intervient au prochain passage disponible du cron, auquel s’ajoute le temps de génération et de contrôle.

La contrainte unique `(series_id, local_date)` garantit un seul travail quotidien. Le verrou de traitement dure 300 secondes par défaut ; la RPC borne les valeurs admises entre 180 et 900 secondes. Le jeton de verrou empêche une réponse ancienne de finaliser un travail repris par un autre passage.

| État du travail | Signification | Suite |
|---|---|---|
| `running` | Génération, contrôle ou finalisation en cours | Attendre le résultat ou l’expiration du verrou |
| `retrying` | Échec récupérable avant le troisième essai | Reprise après 5 minutes, puis après 10 minutes, au prochain passage du cron |
| `succeeded` | Fichier contrôlé et brouillon créés | Aucun nouveau travail pour cette date |
| `failed` | Tentatives épuisées, autorisation perdue ou ancien créneau expiré | La série peut continuer le lendemain si ses prérequis sont réunis |

Il y a au maximum **trois essais par jour**. Une reprise conserve l’administrateur d’origine et l’historique éditorial figé lors de la première prise en charge. Les journées manquées ne sont pas rattrapées en rafale : après une pause ou une panne, le système considère le jour local courant. Un jour en échec ne bloque pas tous les jours suivants.

Changer l’heure ou mettre en pause puis reprendre ne remet pas le compteur d’essais à zéro et ne recrée pas un post déjà réussi. Après révocation de l’administrateur propriétaire, un administrateur autorisé peut utiliser **Renouveler l’autorisation** ; un travail dont l’acteur d’origine a perdu ses droits n’est pas réattribué silencieusement.

## Direction artistique et contenus

### Référence maîtresse

| Élément | Valeur |
|---|---|
| Profil de marque | `tok-v2-instagram-20261019` |
| Identifiant de la référence principale | `instagram-profile` |
| Fichier public | `public/marketing/brand/tok-v2/instagram-profile.jpeg` |
| Chemin servi | `/marketing/brand/tok-v2/instagram-profile.jpeg` |
| SHA-256 | `c31c13820ed5432a0583e7fd361f2f34c28221249001b7bb88dd37454142ae83` |
| Références secondaires | `geneva`, `loyalty`, `flash`, `pricing` |

La capture fournie est conservée **octet pour octet**. Elle contient neuf exemples de style, pas neuf images à reproduire dans un résultat. Les cinq références sont jointes à chaque requête image ; la première fait autorité pour la composition. Les anciennes affiches précisent l’identité du chef et du logo, sans imposer leurs promotions ou leur densité graphique. Une référence absente, modifiée ou trop volumineuse bloque la génération : il n’y a pas de repli vers une image sans références.

Les invariants sont un logo TOK en haut à gauche, une palette orange/crème/noir/blanc cassé, des titres très gras en casse phrase, un message unique, des marges de 6 à 8 % et des photographies chaleureuses lorsque la famille le demande. Le chef apparaît seulement dans deux familles sur neuf. Les textes, logos et éléments artistiques sont produits nativement dans l’image. Aucun ajout en HTML, CSS, SVG, Canvas, Python ou collage n’est autorisé. Les seules transformations techniques admises après génération sont le redimensionnement proportionnel, la compression et le renommage ; la série stocke actuellement le JPEG natif contrôlé.

### Rotation

La fonction pure `buildDailyMarketingBrief(localDate, recentTitles)` utilise une date stricte `YYYY-MM-DD`. Son origine de rotation est le 19 octobre 2026, mais elle n’impose aucune date de fin. Une date et un historique identiques produisent le même brief. Le jour fixe le sujet et la famille visuelle, même lorsqu’un titre récent doit être remplacé.

| 14 sujets | Identifiant |
|---|---|
| Organisation des réservations | `reservations` |
| Mise en valeur de la cuisine | `cuisine` |
| Présentation de la carte | `menu` |
| Plan de salle | `floor-plan` |
| Zéro Attente | `zero-wait` |
| Photos du restaurant | `photos` |
| Studio marketing | `marketing-studio` |
| Ventes flash | `flash-sales` |
| Fiche restaurant | `restaurant-profile` |
| Anti-gaspi | `anti-waste` |
| Suivi des commandes | `orders` |
| Actualités du restaurant | `restaurant-news` |
| Qualité de l’accueil | `hospitality` |
| Identité TOK | `tok-identity` |

| Cycle de neuf familles | Chef |
|---|---|
| `orange-white` — orange, titre blanc | Non |
| `food-photo` — photographie culinaire | Non |
| `cream-detail` — crème et détail de table | Non |
| `human-service` — service en situation | Non |
| `chef-dark` — chef sur fond noir | Oui |
| `cream-menu` — crème, plat et photo sur téléphone | Non |
| `orange-black` — orange, titre noir | Non |
| `chef-cream` — chef sur fond crème | Oui |
| `restaurant-photo` — ambiance de salle | Non |

Le catalogue comporte **112 titres**, soit huit par sujet, deux légendes par sujet et cinq ambiances culinaires. Les titres ont quatre à neuf mots. Chaque légende comprend un appel discret vers `thetok.ch` et trois hashtags. Aucun prix, pourcentage, témoignage, résultat garanti ou chiffre commercial n’est généré.

Les 14 sujets et neuf familles donnent 126 associations avant de répéter un couple. La rotation continue ensuite avec d’autres titres et ambiances. L’historique transmis par la base porte sur les 30 dernières productions réussies ; le helper compare les titres sans tenir compte des différences de casse, accents ou ponctuation. Si toutes les variantes d’un sujet figurent dans l’historique fourni, il choisit la moins récente et expose `titleReused = true`. Il ne promet pas une infinité d’accroches uniques.

## Fichier natif et contrôle avant enregistrement

Le format quotidien est fixé à **1024 × 1280 px**, ratio 4:5, JPEG, avec une taille maximale de 8 000 000 octets. La requête utilise le générateur natif `gpt-image-2`, l’API d’édition conditionnée par les références et `n = 1`.

Le chemin d’objet est déterministe :

```text
social-post-media/marketing-ai/tok-instagram/YYYY-MM-DD-<runUUID>.jpg
```

L’URL publique doit provenir du même projet Supabase que celui déclaré pour l’orchestrateur. L’upload utilise `upsert: false`. Avant une nouvelle génération, le système cherche cet objet exact. S’il existe, il relit ses octets et les fait contrôler à nouveau ; il n’achète pas une nouvelle image pour une simple incertitude sur l’accusé de réception de la base. Une erreur Storage autre qu’une absence explicite bloque la tentative.

Le budget par traitement visuel est de 120 secondes par défaut : génération au plus 90 secondes, contrôle visuel au plus 30 secondes, sous le verrou SQL de 300 secondes. Ces plafonds ne garantissent pas qu’un fournisseur réponde à temps.

Après vérification de l’en-tête JPEG et des dimensions, le contrôle envoie **les pixels du résultat et les cinq références** à l’API Responses du modèle de relecture configuré. Il exige une réponse JSON stricte et neuf validations :

| Critère | Relecture attendue |
|---|---|
| `single_visual` | Une seule publication ; aucune grille, mosaïque ou interface de capture |
| `brand_identity` | Identité épurée conforme à la référence principale |
| `logo_intact` | Un seul logo TOK principal, fidèle, en haut à gauche et non coupé |
| `title_exact` | Titre demandé, sans ajout ni correction silencieuse |
| `text_legible` | Texte lisible et aucun mot corrompu |
| `safe_margins` | Marge suffisante, texte et logo entièrement visibles |
| `family_match` | Composition conforme à la famille du jour |
| `chef_correct` | Présence ou absence correcte, personnage fidèle si demandé |
| `no_extra_claims` | Aucun prix, chiffre, promesse, autre logo ou texte inventé |

La transcription du titre visible est aussi comparée au titre attendu. Les retours à la ligne et apostrophes typographiques sont normalisés ; la casse, les mots, les accents et les autres signes restent contrôlés. Un critère faux, absent ou incertain rejette l’image avant son upload. Une nouvelle tentative produit une nouvelle image native lorsque aucun objet validé n’existe.

**Limite : ce contrôle visuel est probabiliste.** Il ne garantit ni une identité pixel par pixel, ni une détection parfaite de chaque faute graphique. Les dimensions, le nombre d’images et les comparaisons de texte sont des contrôles techniques ; l’appréciation du logo, du style et de la lisibilité dépend aussi du modèle. Le brouillon doit donc encore être relu et approuvé dans le calendrier.

### Critères de relecture humaine issus de la référence

Lors de l’approbation, vérifier que le post reste compréhensible seul et à taille de téléphone. Un gros titre court, le logo et un sujet principal doivent suffire. Refuser une image qui reproduit plusieurs cases de la capture, transforme le logo, multiplie les messages, force le chef dans une famille photographique, ajoute une offre ou remplace une ambiance chaleureuse par un visuel surchargé. Les aplats typographiques doivent rester simples ; les plats doivent paraître réalistes ; le chef doit garder son visage, ses lunettes, sa moustache, sa toque et son foulard.

## Contrats d’accès

Le navigateur utilise `POST /api/marketing/rpc`, sa session marketing et le contrôle CSRF existant (`x-tok-marketing-csrf`). Il n’accède pas directement aux tables et ne reçoit pas de jeton de verrou.

| Opération BFF | Arguments |
|---|---|
| `admin_get_marketing_daily_series` | `{}` |
| `admin_upsert_marketing_daily_series` | `{ "p_payload": { "status": "active" ou "paused", "local_time": "HH:MM", "expected_version": version reçue } }` |

Le wrapper serveur `service_marketing_daily_operation(p_sid_hash, p_csrf_hash, p_operation, p_args)` vérifie session, CSRF, MFA, rôle administrateur et liste des opérations autorisées. La réponse contient `series`, `recent_runs`, `runtime_enabled` et `scheduler_ready`. L’interface envoie toujours `expected_version` ; un conflit doit être rechargé, pas ignoré.

Les tables `marketing_daily_series` et `marketing_daily_runs` ont RLS activée et forcée, avec accès direct révoqué aux rôles applicatifs. Les écritures passent par les RPC dédiées avec leurs contrôles internes :

- `claim_marketing_daily_run(p_lease_seconds)` : prend un travail dû ou retourne `null`.
- `complete_marketing_daily_run(p_run_id, p_lease_token, p_content, p_error)` : finalise le résultat contrôlé ou enregistre un échec ; les deux créations en brouillon sont atomiques.
- `marketing_daily_is_due()` : vérifie si une prise en charge est nécessaire.
- `marketing_daily_scheduler_ready()` : vérifie la présence du cron exact et des prérequis Vault.
- `invoke_marketing_daily_generator_cron()` : envoie `{"action":"generate_daily"}` à l’orchestrateur via le secret cron interne.

Ces RPC de service ne sont pas des actions à appeler depuis le navigateur. La finalisation conserve le jeton d’une réussite uniquement pour qu’une répétition du même accusé de réception retourne les mêmes identifiants, sans créer de doublon.

## Prérequis et ordre de mise en service

Les éléments existants sont réutilisés. Aucun secret ni configuration de production n’est créé ou remplacé par la migration :

- Session marketing administrateur, MFA et autorisation propriétaire valides.
- `marketing_runtime_enabled()` vrai : feature flag `admin-marketing-operations` actif et pause globale `global_runtime.conditions.global_pause` levée.
- `pg_cron`, `pg_net`, et l’API `net.http_post` disponibles.
- Entrées Vault existantes `marketing_edge_url` et `internal_cron_secret`. L’URL doit viser l’orchestrateur du projet Supabase attendu ; la clé cron doit correspondre au secret serveur et comporter au moins 32 caractères. Ne pas afficher leur valeur dans les diagnostics.
- `OPENAI_API_KEY` et `SUPABASE_URL` dans l’environnement serveur existant, et Storage public `social-post-media` conforme au projet cible. Aucune clé n’est transmise au navigateur.
- Modèle de relecture fourni par `selectTokAiModel("image_premium")` : `OPENAI_MODEL_IMAGE_PREMIUM`, sinon le modèle stratégique existant (`OPENAI_MODEL_TOK_STRATEGIC`, avec son défaut défini dans `_shared/openai.ts`). Il doit accepter les images et le JSON structuré de l’API Responses. Une chaîne de modèle non vide ne prouve pas que l’accès fournisseur est opérationnel.
- Référence v2 publiquement accessible avec le SHA attendu sur `https://www.thetok.ch/marketing/brand/tok-v2/instagram-profile.jpeg`.

Ordre de livraison après relecture de la PR et autorisation d’une mise en service :

1. Déployer le frontend et **la référence publique v2**, puis vérifier les octets réellement servis. La présence du fichier dans une branche seule ne suffit pas : le chargeur des références utilise le domaine public ci-dessus.
2. Déployer l’Edge Function `marketing-orchestrator` avec ses helpers quotidiens et le contrôle visuel, en conservant le comportement des actions existantes.
3. Appliquer la nouvelle migration `20261019200548_marketing_daily_instagram.sql` sur la cible contrôlée. Le singleton reste `paused`. Le cron dédié est ajouté seulement si les extensions nécessaires existent ; il n’active pas la série.
4. Contrôler dans le panneau les indicateurs `runtime_enabled` et `scheduler_ready`, la référence de style et l’heure locale. Corriger les prérequis manquants par le processus d’administration habituel.
5. Activer la série depuis le panneau administrateur, vérifier la première production et ouvrir son brouillon avec **Voir le post**. Ne pas déclarer la série active tant que cet état n’est pas confirmé par le serveur.

La PR de cette tâche doit rester ouverte sans merge dans `main`. L’ordre ci-dessus est un runbook de mise en service ultérieure, pas une affirmation que ces opérations ont été effectuées.

## Diagnostic et arrêt

| Symptôme ou code | Vérification et action |
|---|---|
| Activation indisponible | Consulter les indicateurs du moteur et de la planification ; vérifier les prérequis sans afficher les secrets |
| `marketing_daily_runtime_unavailable` | Pause globale ou feature flag du marketing ; vérifier la configuration existante |
| `marketing_daily_scheduler_unavailable` | Cron exact, extensions et entrées Vault attendues |
| `daily_owner_not_authorized` | Faire renouveler l’autorisation de la série par un administrateur |
| `running` prolongé | Attendre l’expiration du verrou et vérifier le passage cron suivant ; ne pas lancer une seconde image manuellement |
| `retrying` | Lire `next_attempt_at` ; les reprises sont automatiques tant que la série reste active |
| `daily_retry_exhausted` | Trois essais épuisés ; inspecter la cause avant le jour suivant, sans remettre le compteur à zéro |
| `daily_slot_expired` | Ancien jour abandonné lors d’une reprise ; aucun rattrapage automatique |
| `marketing_daily_quality_*` | Image refusée par un critère de relecture ; consulter le code, ne pas remplacer le fichier par un montage |
| `marketing_daily_review_*` | Modèle de relecture, réponse, délai ou schéma à vérifier |
| `marketing_daily_image_*` | Générateur, JPEG, dimensions ou nombre d’images à vérifier |
| `marketing_daily_key_missing` | Accès serveur au fournisseur manquant ; aucun secret ne doit être saisi dans le panneau utilisateur |
| `marketing_daily_storage_*` | Origine, droits, disponibilité ou upload Storage ; conserver les objets existants pour la reprise déterministe |
| Conflit de version / HTTP 409 | Recharger les réglages puis revoir l’heure et l’état avant d’enregistrer |

Pour arrêter la série, utiliser **Mettre en pause**. Conserver les brouillons, objets et traces pour le diagnostic. Un retour arrière applicatif doit garder le cron inoffensif grâce à cet état en pause ; ne pas supprimer les tables, réécrire une migration historique ou effacer les travaux pour masquer un échec.

Les traces utiles sont les travaux quotidiens, le journal de l’orchestrateur, les exécutions du cron dédié et les événements d’audit `marketing_daily_claim` / `marketing_daily_complete`. Les journaux applicatifs ne doivent pas contenir les secrets, les preuves de session ou les jetons de verrou.

## Fichiers et vérifications

| Responsabilité | Fichiers |
|---|---|
| Référence et prompt de marque | `public/marketing/brand/tok-v2/instagram-profile.jpeg`, `supabase/functions/_shared/marketing-brand.ts` |
| Rotation des messages | `supabase/functions/_shared/marketing-daily-editorial.ts` |
| Prise en charge et action serveur | `supabase/functions/_shared/marketing-daily-generation.ts`, `supabase/functions/marketing-orchestrator/index.ts` |
| Génération native et récupération | `supabase/functions/_shared/marketing-visual.ts`, `supabase/functions/_shared/marketing-daily-visual.ts` |
| Inspection des pixels et du texte | `supabase/functions/_shared/marketing-visual-quality.ts` |
| SQL, accès et cron | `supabase/migrations/20261019200548_marketing_daily_instagram.sql` |
| Accès BFF | `server/marketingBff.ts`, `src/marketing/marketingBffClient.ts` |
| Panneau et client quotidien | `src/components/marketing/MarketingDailySeries.tsx`, `src/marketing/dailySeriesClient.ts`, `src/marketing/useMarketingDailySeries.ts` |
| Navigation et présentation | `src/components/marketing/views/MarketingAutomationsView.tsx`, `src/components/marketing/views/MarketingAgentView.tsx`, `src/components/marketing/MarketingBrandReferences.tsx`, `src/pages/marketing/MarketingWorkspace.tsx` |
| Tests SQL | `scripts/marketing-daily-sql-fixture.mjs`, `supabase/tests/marketing_daily_instagram.sql` |

Tests de la référence et de l’éditorial :

```sh
corepack pnpm exec vitest run src/test/marketing-daily-editorial.test.ts src/test/marketing-brand-references.test.ts src/test/marketing-brand-gallery.test.tsx src/test/marketing-ai-agent.test.ts
```

Ils couvrent notamment le hash de chaque référence et son envoi natif, l’unicité des 126 couples sujet/famille, deux familles avec chef sur neuf, les dates invalides et changements d’heure, les titres courts, et une simulation de 730 jours sans reprise d’un titre dans les 90 posts précédents. Cette simulation n’augmente pas la taille de l’historique transmis par la base, qui reste 30 productions.

Tests du traitement quotidien et du panneau :

```sh
corepack pnpm exec vitest run src/test/marketing-daily-generation.test.ts src/test/marketing-daily-visual.test.ts src/test/marketing-daily-series-bff.test.ts src/test/marketing-daily-series-frontend.test.tsx
```

Le scénario SQL isolé utilise `scripts/marketing-daily-sql-fixture.mjs` et `supabase/tests/marketing_daily_instagram.sql`. La version finale a exécuté 157 instructions et six groupes de tests avec succès sur PostgreSQL 17.5 via PGlite 0.3.15, avec double application idempotente de la migration. Une version antérieure du scénario a également été exécutée sur PostgreSQL 18.6 via PGlite 0.5.10. Cette vérification couvre les droits, MFA/CSRF, contraintes d’unicité, dates été/hiver, reprise, retour arrière transactionnel et limites d’essais. Elle ne rejoue pas toutes les migrations Supabase et ne remplace pas un test de concurrence entre deux connexions. `pg_cron` et `pg_net` y sont simulés, sans appel HTTP sortant.

Exécuter ensuite lint, typecheck et build applicables au périmètre avant commit et ouverture de PR. Un test avec fournisseurs simulés prouve la gestion des réponses et des erreurs, pas la qualité artistique d’une image réellement produite. La première génération complète et sa revue doivent être constatées séparément lors de la mise en service autorisée.
