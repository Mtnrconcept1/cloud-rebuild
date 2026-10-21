# Validation Telegram des contenus Marketing

Cette fonctionnalité soumet les textes et les visuels des campagnes et publications Marketing au bot administrateur TOK existant. La file est alimentée en base lors des créations et des modifications éditoriales : le portail, TOK Connect et la génération quotidienne suivent donc le même circuit. La fermeture du navigateur n’interrompt pas une demande enregistrée.

**La décision Telegram approuve une version du contenu. Les autorisations et la programmation natives de TOK restent nécessaires pour diffuser cette version.** Le callback ne programme, n’approuve nativement et ne publie rien lui-même. Si une publication possède déjà les autorisations natives et une programmation, une validation Telegram peut toutefois débloquer sa diffusion ultérieure par le worker habituel.

Ce document décrit le code de la branche. Il ne constitue ni une attestation de déploiement ni un compte rendu de recette en production.

## Parcours dans le Studio

1. Créer ou modifier la campagne et ses publications dans TOK Marketing, ou avec les opérations natives de TOK Connect. Les triggers SQL enregistrent la cible et sa révision. Une campagne attend l’assemblage de ses publications et les visuels nécessaires avant l’envoi.
2. Ouvrir la campagne ou le détail du calendrier. Le bloc **Validation Telegram** affiche l’état et la révision. **Actualiser le statut Telegram** relit l’état enregistré ; cette lecture ne déclenche aucun message.
3. Recevoir dans le chat administrateur tous les visuels, puis le dossier textuel complet. Il comprend les textes exacts, le canal, le compte de destination, l’audience, les critères de ciblage disponibles et les dates proposées à l’heure suisse. Les références et la révision permettent de retrouver le dossier dans TOK.
4. Après réception complète, le bot affiche **Valider le contenu**, **Refuser** et **Ouvrir dans TOK Marketing**. La décision porte sur l’instantané du dossier affiché.
5. Actualiser le statut dans TOK. Compléter séparément l’approbation native et la programmation si elles ne sont pas déjà faites. Modifier le texte, le visuel, la destination, le ciblage ou la date proposée invalide l’ancienne version et demande une nouvelle validation.

Le dossier contient les données éditoriales utiles à la décision. Les instructions de génération, les options techniques et les listes d’adresses ne sont pas imprimées dans Telegram. Une sélection explicite de destinataires est représentée par son nombre, sans coordonnées individuelles.

### Portée d’une décision

| Contenu | Cible de validation | Conséquence |
| --- | --- | --- |
| Campagne et publications rattachées | `targetType: "campaign"`, identifiant de la campagne | Un dossier et une décision pour la version de l’ensemble des publications non annulées. |
| Publication autonome, sans `campaign_id` | `targetType: "item"`, identifiant de la publication | Un dossier contenant cette seule publication. |
| Publication déplacée entre campagnes, ou devenue autonome | Ancienne et nouvelle portées réévaluées | Les versions concernées sont invalidées ; une ancienne décision ne suit pas silencieusement la publication. |
| Publication annulée dans une campagne | Portée campagne | L’annulation invalide le dossier ; la publication annulée est retirée du prochain instantané. |

Les anciens brouillons ne sont pas repris en masse au déploiement. Une modification substantielle ultérieure les fait entrer dans le circuit. Un contenu historique sans cible enregistrée conserve ses conditions natives de diffusion ; `not_requested` n’est pas une approbation Telegram.

**Pour TOK Connect, résoudre la portée avant de consulter ou relancer.** Une publication rattachée à une campagne doit utiliser l’identifiant de sa campagne avec `targetType: "campaign"`. Interroger l’identifiant de cette publication avec `targetType: "item"` peut retourner `not_requested` sur une cible inexistante ; cela ne décrit pas l’état de validation de sa campagne. Le calendrier du Studio effectue cette résolution.

## Versions, dossier complet et décision

Les tables privées `marketing_content_review_targets` et `marketing_content_reviews` conservent la cible courante, les révisions et les instantanés. RLS est activé et forcé ; les écritures passent par les fonctions SQL dédiées. Les changements de statut opérationnel, de lease ou de résultat du worker ne créent pas à eux seuls de nouvelle révision éditoriale.

Une invocation réclame au plus une cible avec verrouillage SQL. Le serveur construit le dossier entier avant le premier appel Telegram. Il transmet les images par `sendPhoto`, puis les textes par `sendMessage`, sans interprétation HTML ou Markdown. Les longs textes sont découpés sans troncature et sans couper une paire de caractères UTF-16, notamment les emoji.

Une réservation privée de transport de cinq minutes empêche deux workers de contenu d’envoyer simultanément dans le même chat, y compris si le cron suivant démarre avant la fin du premier. Une invalidation ou un accusé incertain conserve cette réservation jusqu’à son expiration. Un accusé final, un rejet certain du transport ou une décision valide la remplace par un délai de 1 100 ms en privé ou 3 100 ms en groupe, afin de maintenir l’espacement entre deux dossiers. Un autre chat peut avancer indépendamment. Cette réservation n’est pas une reprise automatique d’un dossier interrompu.

Chaque accusé de réception Telegram est enregistré. Le worker exige ensuite la persistance de `document_complete` avant d’envoyer le message portant les boutons. Un dossier partiel ne reçoit pas de bouton de validation. Le numéro de message, le chat, l’administrateur, la révision courante et la disponibilité du contenu sont contrôlés à la décision.

Le token aléatoire possède 18 octets et apparaît dans les callbacks `mcv:a:<token>` ou `mcv:r:<token>`. Seule son empreinte SHA-256 est stockée. La décision doit arriver dans les 24 heures suivant la création de la demande. Une décision déjà enregistrée ne devient pas automatiquement caduque au bout de 24 heures : c’est une modification du contenu qui exige une nouvelle version.

Si le dernier message avec boutons est arrivé mais que son accusé a été perdu, son callback peut encore être accepté lorsque la complétude du dossier était déjà persistée. Le SQL lie alors atomiquement le message au dossier. Cette récupération ne permet ni d’approuver un dossier partiel ni de rejouer une décision.

Les réponses de statut exposent les identifiants métier, la révision, les dates, le statut, la complétude, un nombre de messages et un éventuel code d’erreur sûr. Elles n’exposent ni l’instantané privé, ni le token, ni le chat, ni la liste des identifiants de messages.

### Texte de brouillon et exigences du diffuseur

Pour Instagram et Facebook, le texte structuré est composé par `composeMetaCaption`, comme dans le diffuseur Meta : titre, corps, appel à l’action et hashtags sans doublons ajoutés par la composition. Lorsqu’un ancien brouillon manuel ne possède que `message`, `text`, `summary` ou `caption`, le dossier affiche ce texte sans l’inventer et signale que le contenu Meta doit être complété dans TOK avant diffusion. L’ordre de lecture suit l’aperçu du Studio, avec `caption` comme dernier repli historique.

Cette lecture du brouillon ne modifie pas `buildMetaCaption` : un contenu Meta structuré vide, trop long ou autrement invalide reste refusé par les contrôles natifs. Compléter ce contenu produit une nouvelle révision et donc une nouvelle validation. Les autres contrôles existants du compte, des médias, des permissions fournisseur et de la programmation restent applicables.

## Statuts et relance

Le statut de la cible décrit la version courante ; celui d’une ancienne demande peut rester visible dans son historique.

| Statut | Sens et action |
| --- | --- |
| `queued` | Demande enregistrée pour traitement. Attendre le worker. |
| `waiting_items` | Assemblage incomplet ou publications manquantes. Compléter la campagne. |
| `waiting_visuals` | Visuels nécessaires indisponibles. Terminer leur préparation dans TOK. |
| `delivering` | Transmission en cours. Ne pas soumettre une deuxième demande. |
| `pending` | Dossier transmis, décision attendue dans Telegram. |
| `approved` | Contenu de la version courante approuvé. Les conditions natives de diffusion restent à satisfaire. |
| `rejected` | Contenu refusé. Le relire ou le modifier avant une nouvelle demande. |
| `expired` | Délai de décision dépassé. Demander une nouvelle validation. |
| `failed` | Envoi refusé de façon certaine, dossier invalide ou trop volumineux, ou arrêt contrôlé. Consulter le motif et corriger avant relance. Des messages partiels peuvent déjà être présents. |
| `delivery_unknown` | Réception incertaine : un message peut être arrivé. Vérifier Telegram et actualiser avant une relance explicite. |
| `stale` | Demande périmée par une modification ou par une nouvelle tentative. Utiliser la version courante. |
| `cancelled` | Cible annulée. Aucun renvoi de cette demande. |
| `not_requested` | Aucune cible de validation enregistrée pour cette portée. Vérifier notamment la portée campagne/publication. |

Le bouton **Relancer la validation Telegram** est proposé pour `failed`, `expired`, `rejected`, `delivery_unknown` et `stale`, avec une révision positive. La relance fournit obligatoirement `expectedRevision` et `expectedReviewId`, ce dernier pouvant être `null`. Le serveur refuse une attente devenue périmée. Une demande déjà en file ou en attente de préparation reste inchangée ; une demande `pending`, `approved`, `delivering` ou `cancelled` ne se relance pas.

Une relance autorisée remet la cible en file et invalide une éventuelle tentative ambiguë précédente avant qu’un nouveau token soit émis. Elle ne publie pas et n’envoie pas immédiatement. Le prochain worker transmettra à nouveau un dossier complet, sans reprendre un fragment du précédent.

Après une erreur ou un délai dépassé lors de la relance, relire le statut avant de réessayer : la mise en file peut avoir réussi. Un worker interrompu peut laisser `delivering`. Lors d’une consultation administrateur, un dossier sans progression persistée depuis plus de cinq minutes passe à `delivery_unknown`, ce qui permet une récupération explicite. **Aucun de ces cas ne provoque de renvoi automatique.**

## Préparation automatique et diffusion

Le job `tok-marketing-content-review` exécute `invoke_marketing_content_review_cron()` toutes les deux minutes (`*/2 * * * *`). Il ne sollicite le worker que si une cible préparatoire est due. La réévaluation d’une cible attendant ses publications ou ses visuels est différée de deux minutes.

Le cron et la réclamation SQL exigent le feature flag existant `admin-marketing-operations`. La préparation des dossiers est indépendante de la pause globale de diffusion Marketing : mettre la diffusion en pause ne suspend pas les messages privés de validation. Les contrôles natifs de pause continuent de s’appliquer aux workers de publication.

Le bot, le chat administrateur, l’utilisateur autorisé et le webhook existants sont réutilisés : `TELEGRAM_BOT_TOKEN`, `TELEGRAM_ADMIN_CHAT_ID`, `TELEGRAM_ADMIN_USER_ID` et `TELEGRAM_WEBHOOK_SECRET`. Un groupe exige l’utilisateur administrateur explicitement configuré. Le cron réutilise les références Vault `marketing_edge_url` et `internal_cron_secret`, ainsi que `pg_cron` et `pg_net`. Aucun nouveau secret, bot ou webhook n’est introduit. Si les extensions nécessaires sont absentes, la migration émet une notice et n’installe pas le job ; vérifier ce point au déploiement.

L’autorisation permanente d’une série quotidienne conserve sa configuration et la génération des brouillons. Elle ne suffit plus à approuver ni à programmer automatiquement les nouveaux contenus. Le traitement conserve `waiting_content_review` dans le suivi du run concerné. Après la décision Telegram, les actions natives d’approbation et de programmation restent requises.

La migration de diffusion applique la condition de contenu courant approuvé aux prises en charge des publications et livraisons. Elle la vérifie également avant le marqueur de publication Meta, la préparation d’un email et la création d’une notification intégrée. Le marqueur Meta refuse de consommer une ancienne validation dans la même modification SQL que le contenu. Une décision Telegram ne remplace aucun contrôle natif existant.

## Contrats HTTP, TOK Connect et SQL

Le BFF existant reçoit `POST /api/marketing/orchestrator` avec session Marketing active, CSRF, revalidation administrateur et quota. Les seules entrées métier sont les identifiants de cible et, pour la relance, les attentes de version. Aucun contenu libre, chat, token ou identifiant d’administrateur Telegram n’est accepté du client.

```json
{
  "action": "content_review_status",
  "targetType": "campaign",
  "targetId": "11111111-1111-4111-8111-111111111111"
}
```

```json
{
  "action": "content_review_retry",
  "targetType": "campaign",
  "targetId": "11111111-1111-4111-8111-111111111111",
  "expectedRevision": 3,
  "expectedReviewId": "22222222-2222-4222-8222-222222222222"
}
```

| Surface | Opération |
| --- | --- |
| TOK Connect, lecture | `tok_marketing_orchestrator_content_review_status` avec `args: {targetType, targetId}`. |
| TOK Connect, relance | `tok_marketing_orchestrator_content_review_retry` avec `args: {targetType, targetId, expectedRevision, expectedReviewId}`, `confirmed_by_user: true` et une `idempotency_key` stable pour cette intention. |
| BFF vers SQL | `service_execute_marketing_admin_operation`, puis `admin_get_marketing_content_review_status` ou `admin_retry_marketing_content_review`. |
| Worker interne | `POST /functions/v1/ops-incident-control`, corps exact `{"action":"content_review_process"}`, identité de service ou secret scheduler existant. Cette action n’est pas exposée au BFF ou à TOK Connect. |
| Transport et décision SQL | `claim_marketing_content_review`, `record_marketing_content_review_delivery`, `decide_marketing_content_review`. |
| Webhook Telegram | Callbacks `mcv:` dans le webhook existant, distincts des callbacks `igv:` des commentaires et de ceux des incidents. |

Le statut retourne `{target_type, target_id, revision, status, updated_at, review}`. `review` vaut `null` ou contient `{id, status, created_at, expires_at, decided_at, delivery_complete, message_count, last_error_code}`. Une cible absente retourne `revision: 0`, `status: "not_requested"` et `review: null`.

Les liens de suivi sont `/marketing?view=campaigns&campaignId=<UUID>` et `/marketing?view=calendar&itemId=<UUID>` sur `marketing.thetok.ch`.

## Limites du dossier et des médias

- Au maximum **32 publications** par instantané SQL, d’une taille maximale de **256 Kio**. Le dossier de transport ne dépasse pas **96 messages**, message de décision compris. Il échoue explicitement si ces limites sont dépassées ; aucun texte n’est supprimé pour le faire tenir.
- Budget de transmission **140 secondes** par invocation, avec un délai maximal de **15 secondes** pour une requête complète. Le cron réserve 180 secondes à son appel HTTP. Le worker vérifie avant le premier envoi que le nombre de messages et l’espacement minimal peuvent tenir dans son budget, puis revérifie avant chaque envoi.
- Espacement minimal de **1 100 ms** dans un chat privé et **3 100 ms** dans un groupe. Un dossier de 32 publications courtes peut tenir dans la borne privée ; un dossier très illustré de cette taille peut être refusé dans un groupe dès le contrôle préalable. Ces bornes ne garantissent pas la capacité globale du bot si d’autres circuits envoient simultanément.
- Images HTTPS uniquement, provenant de l’origine Supabase configurée, dans le bucket public `social-post-media`, sous **`marketing-ai/` ou `marketing-mailing/`**. Ces chemins sont choisis par les opérations serveur avec des uploads sans écrasement. Les préfixes UUID modifiables par les restaurateurs sont exclus, ainsi que les URL externes, signées, avec identifiants, paramètres ou fragments. Les extensions acceptées sont JPEG, PNG et WebP. Aucune vidéo ni pièce jointe arbitraire n’est traitée.
- Une URL permise ne garantit pas que Telegram acceptera les dimensions, le format effectif ou le poids du fichier. Un visuel refusé doit être remplacé par le parcours natif approprié ; ce circuit de validation n’ajoute pas d’import d’image Instagram. Un échec peut conserver les images déjà reçues dans Telegram sans donner accès à une décision.
- Aucune reprise automatique après un accusé ambigu ou un envoi partiel. Un rejet explicite Telegram et une incertitude de transport sont distingués. Un délai dépassé, une réponse ambiguë ou un accusé SQL perdu ne sont jamais interprétés comme une preuve de non-envoi.

Références officielles : [Telegram Bot API — sendPhoto](https://core.telegram.org/bots/api#sendphoto) décrit notamment la limite de 10 Mo, les contraintes de dimensions et la légende de 1 024 caractères ; [sendMessage](https://core.telegram.org/bots/api#sendmessage) limite le texte à 4 096 caractères. La [FAQ sur les quotas](https://core.telegram.org/bots/faq#my-bot-is-hitting-limits-how-do-i-avoid-this) recommande au plus un message par seconde dans un chat et fixe la limite des groupes à 20 messages par minute. Le dossier utilise des photos individuelles ; il ne dépend pas d’albums Telegram.

## Fichiers principaux

| Responsabilité | Sources |
| --- | --- |
| File, instantanés, révisions, décision, statut, relance et cron | `supabase/migrations/20261021020000_marketing_content_reviews.sql` |
| Conditions supplémentaires avant diffusion native | `supabase/migrations/20261021020001_marketing_content_review_publication_gate.sql` |
| Parseur et types publics sans dépendance, compatibles Node | `supabase/functions/_shared/marketing-content-review-request.ts` |
| Présentation du dossier et réexports du contrat pour Deno | `supabase/functions/_shared/marketing-content-review.ts` |
| Transport borné, ACK et décision | `supabase/functions/_shared/marketing-content-telegram.ts` |
| Worker et webhook du bot existant | `supabase/functions/ops-incident-control/index.ts` |
| Session et opérations BFF | `server/marketingBff.ts` |
| Catalogue des outils TOK Connect | `supabase/functions/_shared/tok-connect-marketing-operations.ts` |
| Client et interface | `src/marketing/contentReviewClient.ts`, `src/components/marketing/MarketingContentReview.tsx`, `src/components/marketing/views/MarketingCampaignsView.tsx`, `src/components/marketing/views/MarketingCalendarView.tsx` |
| Composition et validation Meta existantes | `supabase/functions/_shared/meta-publishing.ts`, `supabase/functions/_shared/meta-marketing-orchestrator.ts` |

## Vérifications locales et recette sans publication

Les tests avec transport et store contrôlés couvrent notamment l’intégralité des textes et images, les emoji, les préfixes de stockage, les accusés partiels ou perdus, le délai maximal, la complétude avant boutons, les callbacks invalides et l’absence de renvoi automatique. Les tests BFF, webhook, client et interface couvrent les frontières d’authentification et les états de relance.

```bash
corepack pnpm exec vitest run src/test/marketing-node-runtime.test.ts src/test/marketing-content-telegram.test.ts src/test/marketing-content-review-bff.test.ts src/test/marketing-content-review-webhook.test.ts src/test/marketing-content-review-client.test.ts src/test/marketing-content-review.test.tsx
node scripts/verification/test-marketing-content-reviews.mjs
node scripts/verification/test-marketing-content-review-publication.mjs
```

Les deux scripts SQL utilisent PGlite et une base jetable locale, avec les vrais corps des fonctions SQL et des services externes inertes. Si le module n’est pas résolu depuis le projet, fournir son chemin déjà installé, sans modifier les secrets ni une configuration de production :

```bash
TOK_PGLITE_MODULE=/chemin/vers/pglite/dist/index.js node scripts/verification/test-marketing-content-reviews.mjs
TOK_PGLITE_MODULE=/chemin/vers/pglite/dist/index.js node scripts/verification/test-marketing-content-review-publication.mjs
```

PGlite sérialise les requêtes de son client : ces tests ne prouvent pas l’absence de deadlock entre sessions PostgreSQL réelles. Ils ne valident pas non plus les permissions Telegram/Meta de production ni la réception de vrais messages.

Pour une recette autorisée, utiliser des brouillons **sans approbation native et sans programmation**, afin d’observer le circuit sans diffuser : création d’une campagne de plusieurs publications et d’un élément autonome, arrivée complète des visuels et textes, décision par l’administrateur configuré, relecture du statut et invalidation après une modification. Vérifier aussi le refus, l’expiration, un mauvais utilisateur, une tentative sur une ancienne révision, un préfixe média interdit, un arrêt d’envoi et une relance explicite. Contrôler que l’approbation Telegram seule n’a créé ni programmation ni autorisation native. Ne pas lancer d’action de publication pour cette recette.

## Mise en production et retour arrière

Risque **niveau 3** : décision administrateur, envoi externe privé, révisions et conditions de diffusion. Procéder par la livraison autorisée habituelle, avec les contrôles CI du dépôt.

1. Appliquer d’abord `20261021020000_marketing_content_reviews.sql`, puis `20261021020001_marketing_content_review_publication_gate.sql`. La seconde migration s’arrête si les fonctions natives ont dérivé et si les points d’insertion attendus ne sont plus présents ; réconcilier cette dérive, sans retirer le garde.
2. Livrer ensuite `ops-incident-control` avec ses modules partagés, puis le BFF et le catalogue TOK Connect compatibles. Déployer le frontend après disponibilité de ces opérations. Une branche ou une documentation seule n’active pas ce circuit.
3. Vérifier les privilèges privés, les fonctions de décision, le feature flag, l’installation du job et les références existantes nécessaires au transport, sans afficher leurs valeurs. Réaliser la recette de brouillons sans publication. La pause globale de diffusion ne remplace pas l’arrêt du cron de validation.

En cas d’incident, arrêter explicitement les nouvelles transmissions de ce job par un changement d’exploitation autorisé, puis livrer une **migration corrective vers l’avant**. Conserver les tables, instantanés, décisions et gardes de diffusion. Ne pas supprimer les tables et ne pas retirer l’exigence de validation pour rétablir artificiellement une publication. Ne pas réintroduire silencieusement l’approbation automatique des séries quotidiennes.

Un retour du frontend ou du worker à une version antérieure doit tenir compte du schéma et des boutons déjà émis. Préserver le traitement sécurisé des callbacks ou les rendre inactifs ; ne jamais transformer des demandes non confirmées en approbations. La reprise passe par la consultation de l’état et, si nécessaire, une relance explicite conservant l’historique.
