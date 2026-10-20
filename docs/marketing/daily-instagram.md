# TOK — Série Instagram quotidienne

## Périmètre et état de livraison

Cette fonctionnalité prépare **un post Instagram par jour**, avec un visuel individuel et sa légende, sans date de fin. Le mode initial reste **Brouillon à valider** ; un administrateur peut autoriser explicitement la **Publication automatique** de cette seule série. Elle concerne la communication de TOK auprès des restaurateurs ; elle ne remplace pas les références propres aux studios des restaurants.

Le générateur crée toujours un résultat en brouillon. En mode automatique, un déclencheur SQL vérifie le mandat enregistré, le compte Instagram exact, les neuf contrôles qualité et un créneau futur avant de programmer ce seul résultat. Le moteur de diffusion existant publie ensuite l’élément approuvé. Tout résultat bloqué reste en brouillon et apparaît dans le suivi ; les anciennes campagnes et les anciens brouillons ne sont pas réapprouvés.

Ce document décrit le code de la fonctionnalité. **Il ne constitue pas une preuve de déploiement ou d’activation en production.** La livraison passe par une branche dédiée, une PR et les contrôles de validation avant une mise en service autorisée. La migration initialise la série **en pause**.

## Où la configurer

Ouvrir `https://marketing.thetok.ch/marketing?view=automations`, puis la carte **Instagram · un post par jour**, placée en tête des automatisations. L’onglet **Agent** contient aussi le lien **Configurer la série quotidienne**.

Les réglages sont réservés à une session administrateur marketing avec MFA :

1. Consulter l’état du service et de la planification. L’activation reste désactivée tant que ces prérequis ne sont pas prêts.
2. Choisir **Heure de génération**. La valeur initiale est **10:00**, fuseau **Europe/Zurich**, avec changement d’heure automatique.
3. Choisir **Mode de publication**. Pour **Publication automatique**, définir une heure de publication au moins trente minutes après la génération et cocher l’autorisation quotidienne du compte Instagram connecté. Le mandat est lié à l’administrateur et à l’identifiant Instagram exact ; un changement de compte bloque les nouveaux envois. Cliquer sur **Activer la série**. Après une première activation, le bouton devient **Reprendre la série** lorsque celle-ci est en pause.
4. Pour changer les réglages, utiliser **Enregistrer l’heure** en mode brouillon ou **Enregistrer la série** en mode automatique. La version reçue du serveur protège contre l’écrasement des réglages d’un autre administrateur. En cas de conflit, cliquer sur **Recharger les réglages**, puis revoir la modification.
5. Utiliser **Mettre en pause** pour arrêter les prochaines prises en charge. Ce bouton reste utilisable lorsque le moteur global est indisponible. Une génération déjà en cours peut encore terminer et enregistrer son brouillon.
6. Dans **Dernières productions**, **Voir le post** ouvre le bon élément du calendrier avec son identifiant, sa campagne et sa date. Consulter l’état du post dans le calendrier. En mode brouillon, relire la campagne et le post avant leur approbation et leur planification.

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
| Profil de marque | `tok-v3-creme-orange-20261020` |
| Identifiant de la référence principale | `instagram-profile` |
| Fichier public | `public/marketing/brand/tok-v3/instagram-profile.jpeg` |
| Chemin servi | `/marketing/brand/tok-v3/instagram-profile.jpeg` |
| SHA-256 | `c1f8d594e560a4f5e2924cb13956771db6a5a8d086983c42632f6cad51ddc012` |
| Références secondaires | `culinary`, `studio-chef` |

| Référence secondaire | SHA-256 |
|---|---|
| `public/marketing/brand/tok-v3/culinary.jpeg` | `7f122ff79592763b564daed1572696c4eb568fcd5f829188874ea60f79ec6aa0` |
| `public/marketing/brand/tok-v3/studio-chef.jpeg` | `4fa83ddd1b5955af59dd05791fbfc8b6dc480a3e95354c53432069aec19aa5ca` |

La planche Instagram validée est compressée en JPEG sans recadrage ni ajout graphique. Elle contient neuf exemples de style, pas neuf images à reproduire dans un résultat. Les deux visuels fournis — cuisine et Studio marketing — sont conservés octet pour octet. Les trois références sont jointes à chaque requête image ; la première fait autorité pour la composition, les deux suivantes précisent les photos, les arches et le chef. Le corps d’email, les boutons, prix et promotions du visuel Studio ne sont jamais recopiés. Une référence absente, modifiée ou trop volumineuse bloque la génération : aucun repli sans références.

Les invariants sont un logo TOK en haut à gauche avec sa bulle « Miamz! », une palette orange vermillon/crème ivoire/noir/blanc cassé, des titres très gras en casse phrase et un message unique. Les arches arrondies, filets fins et soulignements au pinceau remplacent les accents jaunes. Les photos culinaires et de carte utilisent une zone ivoire supérieure courbe ; les scènes de service et de salle conservent leur photographie chaleureuse. Le pied discret `thetok.ch` est autorisé. Tous les textes, la bulle et le logo restent dans la marge de production de 12 % ; le seuil minimal de relecture de 6 % est conservé. Les petits emblèmes de la tenue du chef ne sont pas des logos principaux supplémentaires. Le chef apparaît seulement dans deux familles sur neuf. Les textes, logos et éléments artistiques sont produits nativement dans l’image. Aucun ajout en HTML, CSS, SVG, Canvas, Python ou collage n’est autorisé. Les seules transformations techniques admises après génération sont le redimensionnement proportionnel, la compression et le renommage ; la série stocke actuellement le JPEG natif contrôlé.

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

Le catalogue comporte **112 titres**, soit huit par sujet, deux légendes par sujet et cinq ambiances culinaires. Les titres ont quatre à neuf mots. Chaque légende comprend l’accroche du visuel, un bénéfice concret vérifiable, un appel vers `thetok.ch` et cinq hashtags : `#TOK`, `#RestaurateursGeneve`, `#Geneve`, `#RestaurantGeneve` et le thème du jour. Aucun compte tiers n’est mentionné : la série présente des fonctionnalités TOK, sans restaurant ni partenaire réel identifié. Un futur post présentant un établissement doit vérifier son identité et son compte avant toute mention ; il passe par la validation manuelle existante. Aucun prix, pourcentage, témoignage, résultat garanti ou chiffre commercial n’est généré.

Les 14 sujets et neuf familles donnent 126 associations avant de répéter un couple. La rotation continue ensuite avec d’autres titres et ambiances. L’historique transmis par la base porte sur les 30 dernières productions réussies ; le helper compare les titres sans tenir compte des différences de casse, accents ou ponctuation. Si toutes les variantes d’un sujet figurent dans l’historique fourni, il choisit la moins récente et expose `titleReused = true`. Il ne promet pas une infinité d’accroches uniques.

## Publication quotidienne autorisée

Le créneau éditorial retenu pour TOK est **16:00 Europe/Zurich**, avec une préparation à **15:00**. Ce choix est un point de départ, pas une promesse de performance : Meta proposait notamment 16 h le 21 octobre et 17 h le 22 octobre 2026, tandis que les principales villes et pays de l’audience existante étaient surtout internationaux. Mesurer ensuite les interactions et visites issues de Genève avant de réviser le créneau.

Le mode automatique est désactivé par défaut. Son enregistrement exige la session administrateur marketing, MFA/CSRF, une version courante, le consentement explicite `authorize_auto_publication`, un moteur de diffusion disponible et exactement une intégration Instagram connectée. Le serveur mémorise son identifiant `ig_user_id` ; le navigateur ne peut pas en fournir un autre.

Les profils explicitement admis sont `tok-v3-creme-orange-20261020` et `tok-v2-instagram-20261019` pour conserver la possibilité de retour arrière. Toute version inconnue reste en brouillon. La migration additive `20261020144007_marketing_daily_creme_orange_profile.sql` aligne ce contrôle SQL avec la nouvelle DA sans modifier les autorisations ni les anciens travaux.

Seuls les travaux créés **après** ce mandat peuvent être programmés. La finalisation vérifie l’administrateur encore autorisé, la série active, l’absence de pause globale, le même compte Instagram, les neuf critères visuels, le format, la version de marque, trois à cinq hashtags pertinents comprenant TOK et Genève, et l’absence de mention tierce non vérifiée. Le créneau doit rester au moins deux minutes dans le futur. La contrainte quotidienne et la finalisation idempotente empêchent un second post du même travail.

Une erreur de compte, qualité, autorisation, configuration ou créneau conserve le contenu en brouillon avec `daily_publication_blocked`. Aucune image de remplacement n’est achetée pour cet échec de programmation. Le calendrier et l’historique distinguent préparation, programmation et publication réelle. Les traces d’approbation indiquent `daily-series-standing-authorization` : elles ne prétendent pas qu’un humain a relu chaque résultat.

Mettre la série en pause empêche les prochaines productions et la programmation d’une génération encore en cours. Les posts déjà programmés restent dans le calendrier et doivent y être annulés individuellement si nécessaire. Pour revenir au circuit manuel, enregistrer **Brouillon à valider**. Aucun paramètre global d’autonomie, aucune permission Meta, aucun secret et aucun autre canal ne sont modifiés.

## Fichier natif et contrôle avant enregistrement

Le format quotidien est fixé à **1024 × 1280 px**, ratio 4:5, JPEG, avec une taille maximale de 8 000 000 octets. La requête utilise le générateur natif `gpt-image-2`, l’API d’édition conditionnée par les références et `n = 1`.

Le chemin d’objet est déterministe :

```text
social-post-media/marketing-ai/tok-instagram/YYYY-MM-DD-<runUUID>.jpg
```

L’URL publique doit provenir du même projet Supabase que celui déclaré pour l’orchestrateur. L’upload utilise `upsert: false`. Avant une nouvelle génération, le système cherche cet objet exact. S’il existe, il relit ses octets et les fait contrôler à nouveau ; il n’achète pas une nouvelle image pour une simple incertitude sur l’accusé de réception de la base. Une erreur Storage autre qu’une absence explicite bloque la tentative.

Le budget par traitement visuel est de 120 secondes par défaut : génération au plus 90 secondes, contrôle visuel au plus 30 secondes, sous le verrou SQL de 300 secondes. Ces plafonds ne garantissent pas qu’un fournisseur réponde à temps.

Après vérification de l’en-tête JPEG et des dimensions, le contrôle envoie **les pixels du résultat et les trois références** à l’API Responses du modèle de relecture configuré. Il exige une réponse JSON stricte et neuf validations :

| Critère | Relecture attendue |
|---|---|
| `single_visual` | Une seule publication ; aucune grille, mosaïque ou interface de capture |
| `brand_identity` | Identité épurée conforme à la référence principale |
| `logo_intact` | Un seul logo TOK principal avec sa bulle Miamz!, fidèle, en haut à gauche et non coupé ; emblèmes sur la tenue autorisés |
| `title_exact` | Titre demandé, sans ajout ni correction silencieuse ; logo, Miamz! et thetok.ch exclus de la transcription du titre |
| `text_legible` | Texte lisible et aucun mot corrompu |
| `safe_margins` | Marge suffisante, texte et logo entièrement visibles |
| `family_match` | Composition conforme à la famille du jour |
| `chef_correct` | Présence ou absence correcte, personnage fidèle si demandé |
| `no_extra_claims` | Aucun prix, chiffre, promesse, logo tiers ou texte inventé ; seuls TOK, sa bulle Miamz! et thetok.ch sont autorisés hors titre |

La transcription du titre visible est aussi comparée au titre attendu. Les retours à la ligne et apostrophes typographiques sont normalisés ; la casse, les mots, les accents et les autres signes restent contrôlés. Un critère faux, absent ou incertain rejette l’image avant son upload. Une nouvelle tentative produit une nouvelle image native lorsque aucun objet validé n’existe.

**Limite : ce contrôle visuel est probabiliste.** Il ne garantit ni une identité pixel par pixel, ni une détection parfaite de chaque faute graphique. Les dimensions, le nombre d’images et les comparaisons de texte sont des contrôles techniques ; l’appréciation du logo, du style et de la lisibilité dépend aussi du modèle. En mode brouillon, le résultat doit encore être relu et approuvé dans le calendrier. Le mode automatique repose sur les contrôles probabilistes décrits et sur le mandat explicite de l’administrateur ; il ne prétend pas à une relecture humaine quotidienne.

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
- Trois références v3 publiquement accessibles avec leurs SHA attendus, dont le profil sur `https://www.thetok.ch/marketing/brand/tok-v3/instagram-profile.jpeg`.

Ordre de livraison après relecture de la PR et autorisation d’une mise en service :

1. Déployer le frontend et **les trois références publiques v3**, puis vérifier les trois hashes réellement servis avant de déployer le moteur IA. La présence du fichier dans une branche seule ne suffit pas : le chargeur des références utilise le domaine public ci-dessus.
2. Déployer l’Edge Function `marketing-orchestrator` avec ses helpers quotidiens et le contrôle visuel, en conservant le comportement des actions existantes.
3. Appliquer la nouvelle migration `20261019200548_marketing_daily_instagram.sql` sur la cible contrôlée. Le singleton reste `paused`. Le cron dédié est ajouté seulement si les extensions nécessaires existent ; il n’active pas la série.
4. Contrôler dans le panneau les indicateurs `runtime_enabled` et `scheduler_ready`, la référence de style et l’heure locale. Corriger les prérequis manquants par le processus d’administration habituel.
5. Activer la série depuis le panneau administrateur, vérifier la première production et ouvrir son élément avec **Voir le post**. Ne pas déclarer la série active tant que cet état n’est pas confirmé par le serveur.

L’ordre ci-dessus est un runbook de mise en service, pas une preuve que ces opérations ont été effectuées. Pour le mode automatique, appliquer aussi `20261020135701_marketing_daily_publication.sql`, déployer le nouvel éditorial et le panneau avant toute activation.

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

Pour arrêter la série, utiliser **Mettre en pause**. Conserver les brouillons, objets et traces pour le diagnostic. Pour revenir à la DA précédente, restaurer le profil v2 et la version précédente du moteur, en conservant les fichiers v2 existants. Ne pas modifier les images ou brouillons déjà produits ; conserver leur version de profil. Un retour arrière applicatif doit garder le cron inoffensif grâce à cet état en pause ; ne pas supprimer les tables, réécrire une migration historique ou effacer les travaux pour masquer un échec.

Les traces utiles sont les travaux quotidiens, le journal de l’orchestrateur, les exécutions du cron dédié et les événements d’audit `marketing_daily_claim` / `marketing_daily_complete`. Les journaux applicatifs ne doivent pas contenir les secrets, les preuves de session ou les jetons de verrou.

## Fichiers et vérifications

| Responsabilité | Fichiers |
|---|---|
| Référence et prompt de marque | `public/marketing/brand/tok-v3/instagram-profile.jpeg`, `supabase/functions/_shared/marketing-brand.ts` |
| Rotation des messages | `supabase/functions/_shared/marketing-daily-editorial.ts` |
| Prise en charge et action serveur | `supabase/functions/_shared/marketing-daily-generation.ts`, `supabase/functions/marketing-orchestrator/index.ts` |
| Génération native et récupération | `supabase/functions/_shared/marketing-visual.ts`, `supabase/functions/_shared/marketing-daily-visual.ts` |
| Inspection des pixels et du texte | `supabase/functions/_shared/marketing-visual-quality.ts` |
| SQL, accès et cron | `supabase/migrations/20261019200548_marketing_daily_instagram.sql` |
| Accès BFF | `server/marketingBff.ts`, `src/marketing/marketingBffClient.ts` |
| Panneau et client quotidien | `src/components/marketing/MarketingDailySeries.tsx`, `src/marketing/dailySeriesClient.ts`, `src/marketing/useMarketingDailySeries.ts` |
| Navigation et présentation | `src/components/marketing/views/MarketingAutomationsView.tsx`, `src/components/marketing/views/MarketingAgentView.tsx`, `src/components/marketing/MarketingBrandReferences.tsx`, `src/pages/marketing/MarketingWorkspace.tsx` |
| Tests SQL | `scripts/marketing-daily-sql-fixture.mjs`, `supabase/tests/marketing_daily_instagram.sql`, `supabase/tests/marketing_daily_publication.sql` |

Tests de la référence et de l’éditorial :

```sh
corepack pnpm exec vitest run src/test/marketing-daily-editorial.test.ts src/test/marketing-brand-references.test.ts src/test/marketing-brand-gallery.test.tsx src/test/marketing-ai-agent.test.ts
```

Ils couvrent notamment le hash de chaque référence et son envoi natif, l’unicité des 126 couples sujet/famille, deux familles avec chef sur neuf, les dates invalides et changements d’heure, les titres courts, et une simulation de 730 jours sans reprise d’un titre dans les 90 posts précédents. Cette simulation n’augmente pas la taille de l’historique transmis par la base, qui reste 30 productions.

Tests du traitement quotidien et du panneau :

```sh
corepack pnpm exec vitest run src/test/marketing-daily-generation.test.ts src/test/marketing-daily-visual.test.ts src/test/marketing-daily-series-bff.test.ts src/test/marketing-daily-series-frontend.test.tsx
```

Le scénario SQL isolé utilise `scripts/marketing-daily-sql-fixture.mjs` et `supabase/tests/marketing_daily_instagram.sql`. La version courante a exécuté 226 instructions et sept groupes de tests avec succès sur PostgreSQL 17.5 via PGlite 0.3.15, avec double application idempotente des migrations quotidiennes, de publication et du profil crème/orange. Les assertions couvrent le profil v3 autorisé, le maintien du profil v2 pour retour arrière et le refus d’une version inconnue. Une version antérieure du scénario a également été exécutée sur PostgreSQL 18.6 via PGlite 0.5.10. Cette vérification couvre les droits, MFA/CSRF, contraintes d’unicité, dates été/hiver, reprise, retour arrière transactionnel et limites d’essais. Elle ne rejoue pas toutes les migrations Supabase et ne remplace pas un test de concurrence entre deux connexions. `pg_cron` et `pg_net` y sont simulés, sans appel HTTP sortant.

Exécuter ensuite lint, typecheck et build applicables au périmètre avant commit et ouverture de PR. Un test avec fournisseurs simulés prouve la gestion des réponses et des erreurs, pas la qualité artistique d’une image réellement produite. La première génération complète et sa revue doivent être constatées séparément lors de la mise en service autorisée.
