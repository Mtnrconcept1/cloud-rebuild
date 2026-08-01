# TOK — incidents Telegram avec réparation Codex approuvée

## Objectif

Cette automatisation transforme les erreurs techniques confirmées en incidents exploitables :

1. le monitoring détecte une erreur actuelle ;
2. le contexte est nettoyé des secrets et données personnelles ;
3. l'IA produit un diagnostic et un plan de réparation ;
4. l'administrateur reçoit le plan dans Telegram ;
5. seul le bouton **Lancer Codex** autorise la création d'une branche de réparation ;
6. Codex travaille dans le dépôt réel, exécute les contrôles et ouvre une pull request ;
7. Aucune fusion, migration ou mise en production n'est automatique.

Le canal initial est Telegram. La file d'incidents, les décisions et le workflow GitHub sont indépendants du canal ; un adaptateur WhatsApp Business pourra donc être ajouté sans modifier le modèle de sécurité ni la chaîne Codex.

## Composants

- `public.ops_incidents` : état courant, plan approuvé, métadonnées de PR et déduplication.
- `public.ops_incident_events` : journal append-only des détections, décisions et exécutions.
- `ops-incident-control` : Edge Function signée pour le scan, l'ingestion, Telegram et les callbacks GitHub.
- `TOK Incident Monitor` : scan périodique des échecs Edge et ingestion des échecs CI/déploiement.
  Seuls les runs du dépôt courant, liés à `main` et déclenchés par un événement explicitement autorisé sont ingérés.
  Pour chaque workflow échoué ou expiré, le collecteur priorise les vrais échecs, lit au maximum quatre jobs et produit un extrait nettoyé sous un budget strict de 32 Kio.
- `TOK Codex Incident Repair` : exécution Codex après approbation et ouverture d'une PR testée.

## Modèles utilisés

Le plan Telegram et la réparation de code sont deux appels distincts :

- le diagnostic Supabase utilise le modèle mini pour un incident standard et le modèle stratégique configuré pour un incident GitHub, `high` ou `critical`; le modèle demandé, le modèle retourné et un éventuel code d'erreur sont conservés dans `repair_plan` ;
- la réparation réelle est fixée explicitement à `gpt-5.6-sol` avec l'effort `high`; l'action `openai/codex-action` est épinglée à une révision immuable et le modèle/effort sont confirmés dans chaque callback.

Les logs, traces et messages d'erreur restent des preuves non fiables : ils ne sont jamais traités comme des instructions.

## Garde-fous

- Les tables sont en RLS.
- Les administrateurs authentifiés peuvent uniquement lire les incidents.
- Les écritures sont réservées au `service_role` dans l'Edge Function.
- Les boutons Telegram utilisent un jeton aléatoire haché, à usage décisionnel, expirant après 24 heures.
- Le contexte Codex utilise un second jeton haché, expirant après 6 heures.
- Au moment de l'approbation, le contrôle vérifie et fige le SHA du dépôt à réparer. Le workflow récupère ce SHA dans le contexte authentifié puis checkout exactement cette révision.
- Les callbacks Telegram exigent le `secret_token` officiel du webhook, l'identifiant du chat et l'identifiant de l'administrateur.
- Les collecteurs génériques exigent un secret distinct.
- Les erreurs métier sans message technique ne sont pas transformées automatiquement en bugs.
- Un échec Edge instrumenté est actif uniquement si aucun succès plus récent n'existe pour la même fonction et la même action ; seule la signature de l'erreur non résolue la plus récente est regroupée.
- Le scanner Edge lit `public.edge_function_audit_logs`, pas l'API native des logs Supabase. Toute fonction critique doit donc appeler `writeAuditLog` ; `google-actions-center-sync` est instrumentée de cette manière.
- Les doublons actifs partagent le même incident et augmentent `occurrence_count`; l’empreinte ignore les compteurs et horodatages variables.
- Une approbation expirée, un diagnostic bloqué ou un workflow de réparation abandonné passe à `failed` ; une occurrence ultérieure peut alors créer un nouvel incident. Un résultat `no_changes` est regroupé pendant l'épisode actif puis réévaluable après 24 heures sans occurrence.
- Pour GitHub Actions, l'empreinte inclut le SHA du commit en échec : un nouveau commit peut être réanalysé tandis qu'un même run reste dédupliqué.
- Les sources externes peuvent transmettre `groupingKey` ou `fingerprint` pour stabiliser le regroupement sans imposer leur propre identifiant en base.
- Codex n’accède pas aux secrets GitHub du callback ou du push pendant son exécution.
- `actions/checkout` utilise `persist-credentials: false` avant Codex.
- Codex produit uniquement un patch éphémère; un deuxième runner neuf l’applique et exécute lint, typecheck, tests et `build:prod` avec des valeurs publiques factices, sans secret de publication.
- Un troisième runner neuf reconstruit exactement le patch validé et reçoit le jeton de publication uniquement pour le commit, le push et la PR.
- Les hooks Git sont désactivés et un `HOME` Git propre est utilisé pendant la publication.
- Les chemins de contrôle `.github/**`, `AGENTS.md`, `docs/skills/**`, `supabase/config.toml`, les deux fonctions d'automatisation, leurs migrations, leur test de préparation et ce runbook sont interdits aux réparations automatiques.
- Les migrations existantes sont immuables; seule une nouvelle migration non destructive peut être proposée.
- La branche générée suit `codex/incident-<8 caractères>-<run id>-<tentative>`.
- La branche `main` n'est jamais modifiée directement.
- La PR générée par un jeton utilisateur/GitHub App déclenche la CI habituelle ; le `GITHUB_TOKEN` du workflow n'est pas utilisé pour la créer.

## Secrets Supabase requis

Configurer les secrets suivants dans le projet TOK `wwcrtyoueexyxkkikaos` :

| Secret | Usage |
| --- | --- |
| `TELEGRAM_BOT_TOKEN` | Jeton remis par BotFather. |
| `TELEGRAM_ADMIN_CHAT_ID` | Chat privé ou groupe autorisé à recevoir les incidents. |
| `TELEGRAM_ADMIN_USER_ID` | Utilisateur autorisé à appuyer sur les boutons. Pour un chat privé, il correspond généralement au chat ID. Obligatoire pour un groupe. |
| `TELEGRAM_WEBHOOK_SECRET` | Secret aléatoire fourni à `setWebhook` et contrôlé dans l'en-tête Telegram. |
| `GITHUB_INCIDENT_TOKEN` | Jeton finement limité qui peut appeler `POST /repos/Mtnrconcept1/cloud-rebuild/dispatches`. Permission minimale : `Contents: write`. |
| `GITHUB_INCIDENT_REPOSITORY` | `Mtnrconcept1/cloud-rebuild`. |
| `OPS_INGEST_SECRET` | Authentifie un relais Sentry ou un autre collecteur externe. |
| `OPS_CONTROL_SECRET` | Authentifie le scan GitHub planifié. |
| `OPS_GITHUB_CALLBACK_SECRET` | Authentifie la récupération du contexte et les retours du workflow Codex. |
| `OPENAI_API_KEY` | Produit le plan d'incident dans Supabase. Sans cette clé, un plan déterministe de secours est utilisé. |

Générer les secrets de partage avec au moins 32 octets aléatoires :

```bash
openssl rand -hex 32
```

Ne jamais réutiliser la même valeur pour les trois secrets `OPS_*`.

### Détection sans secret provisionné

Tant que `OPS_CONTROL_SECRET` n'a pas été synchronisé vers l'environnement des
fonctions Edge, le scan interne (`ops-incident-native-scan`, déclenché par le
cron pg_cron toutes les 5 minutes) authentifie son appel vers
`ops-incident-control` avec la clé service-role auto-provisionnée du projet.
La détection et l'enregistrement des incidents restent donc opérationnels sans
aucune configuration ; seule la notification Telegram et le lancement Codex
attendent leurs secrets. Ce repli concerne uniquement le saut interne
projet-à-projet : les appels externes (workflows GitHub, collecteurs) exigent
toujours les secrets partagés dédiés.

### Vérification du provisionnement

La chaîne a déjà produit des approbations et des runs Codex ; l'échec historique
du premier run de `TOK Incident Secret Sync` ne décrit donc plus l'état courant.
Après toute rotation ou création d'environnement, vérifier néanmoins que
`production` contient `OPS_CONTROL_SECRET`, `OPS_INGEST_SECRET`,
`OPS_GITHUB_CALLBACK_SECRET`, `GITHUB_INCIDENT_TOKEN`, `TELEGRAM_BOT_TOKEN`,
`TELEGRAM_ADMIN_CHAT_ID`, `TELEGRAM_ADMIN_USER_ID` et
`TELEGRAM_WEBHOOK_SECRET`. Relancer alors `sync-incident-secrets.yml` : il
synchronise les secrets vers Supabase, enregistre le webhook Telegram signé et
exécute un scan initial. Ne jamais conclure à partir d'un ancien run ; contrôler
le dernier run et le statut de santé de `ops-incident-control`.

Exemple de configuration Supabase CLI, à lancer localement sans commiter les valeurs :

```bash
supabase secrets set \
  TELEGRAM_BOT_TOKEN="$TELEGRAM_BOT_TOKEN" \
  TELEGRAM_ADMIN_CHAT_ID="$TELEGRAM_ADMIN_CHAT_ID" \
  TELEGRAM_ADMIN_USER_ID="$TELEGRAM_ADMIN_USER_ID" \
  TELEGRAM_WEBHOOK_SECRET="$TELEGRAM_WEBHOOK_SECRET" \
  GITHUB_INCIDENT_TOKEN="$GITHUB_INCIDENT_TOKEN" \
  GITHUB_INCIDENT_REPOSITORY="Mtnrconcept1/cloud-rebuild" \
  OPS_INGEST_SECRET="$OPS_INGEST_SECRET" \
  OPS_CONTROL_SECRET="$OPS_CONTROL_SECRET" \
  OPS_GITHUB_CALLBACK_SECRET="$OPS_GITHUB_CALLBACK_SECRET" \
  --project-ref wwcrtyoueexyxkkikaos
```

## Secrets et variable GitHub requis

Dans `Mtnrconcept1/cloud-rebuild`, créer :

| Nom | Type | Valeur |
| --- | --- | --- |
| `OPENAI_API_KEY` | Secret Actions | Clé utilisée par `openai/codex-action`. |
| `TOK_INCIDENT_CONTROL_SECRET` | Secret Actions | Même valeur que `OPS_CONTROL_SECRET`. |
| `TOK_INCIDENT_GITHUB_SECRET` | Secret Actions | Même valeur que `OPS_GITHUB_CALLBACK_SECRET`. |
| `TOK_CODEX_GITHUB_TOKEN` | Secret Actions | Jeton distinct utilisé après Codex pour pousser la branche et créer la PR. Permissions : `Contents: write` et `Pull requests: write`. |
| `TOK_INCIDENT_CONTROL_URL` | Variable Actions recommandée | URL publique de `ops-incident-control`. |

`TOK_CODEX_GITHUB_TOKEN` ne doit pas être le jeton d’un compte sans accès en écriture au dépôt. Un jeton GitHub App est préférable à long terme. Ne pas lui accorder `Workflows: write`, `Actions: write`, `Administration` ou l’accès aux secrets : les modifications sous `.github/**` sont volontairement bloquées par le contrôleur de périmètre.

## Création et liaison du bot Telegram

1. Créer un bot avec `@BotFather` et conserver le token hors du dépôt.
2. Envoyer `/start` au bot depuis le compte administrateur.
3. Récupérer l'identifiant utilisateur/chat avec `getUpdates`, puis supprimer immédiatement la sortie de tout terminal partagé.
4. Générer `TELEGRAM_WEBHOOK_SECRET` avec `openssl rand -hex 32`.
5. Après déploiement de l'Edge Function, enregistrer le webhook :

```bash
curl --fail --silent --show-error \
  -X POST "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/setWebhook" \
  -H "Content-Type: application/json" \
  --data "$(jq -n \
    --arg url "${TOK_INCIDENT_CONTROL_URL}" \
    --arg secret "${TELEGRAM_WEBHOOK_SECRET}" \
    '{url: $url, secret_token: $secret, allowed_updates: ["callback_query"], drop_pending_updates: true}')"
```

Le webhook doit viser :

```text
https://wwcrtyoueexyxkkikaos.supabase.co/functions/v1/ops-incident-control
```

## Déploiement

Respecter le workflow du dépôt :

1. fusionner la PR uniquement après CI verte ;
2. laisser `Deploy Production` appliquer la migration ;
3. laisser le même workflow déployer `ops-incident-control`, `ops-incident-native-scan` et toute fonction nouvellement instrumentée telle que `google-actions-center-sync` ;
4. configurer les secrets Supabase et GitHub ;
5. enregistrer le webhook Telegram ;
6. déclencher manuellement `TOK Incident Monitor` pour le premier contrôle.

Aucune commande `supabase db push` ou `supabase functions deploy` ne doit être lancée directement depuis un poste si le workflow GitHub de production est disponible.

## Test de santé signé

```bash
curl --fail --silent --show-error \
  -H "x-ops-control-secret: ${OPS_CONTROL_SECRET}" \
  "${TOK_INCIDENT_CONTROL_URL}" | jq
```

Réponse attendue :

```json
{
  "ok": true,
  "service": "ops-incident-control",
  "telegramConfigured": true,
  "githubConfigured": true,
  "openAiConfigured": true
}
```

## Test d'incident manuel non destructif

Ce test crée un incident de démonstration et doit envoyer le plan dans Telegram :

```bash
jq -n '{
  action: "ingest",
  source: "manual",
  eventId: ("smoke-" + (now | tostring)),
  severity: "low",
  title: "Test contrôlé du pilote d incidents",
  summary: "Incident synthétique sans impact utilisateur.",
  errorType: "smoke_test",
  context: {
    environment: "production",
    synthetic: true,
    expected_result: "telegram_approval_message"
  }
}' > /tmp/tok-incident-smoke.json

curl --fail-with-body --silent --show-error \
  -X POST "${TOK_INCIDENT_CONTROL_URL}" \
  -H "Content-Type: application/json" \
  -H "x-ops-ingest-secret: ${OPS_INGEST_SECRET}" \
  --data-binary @/tmp/tok-incident-smoke.json | jq
```

Pour le premier essai, sélectionner **Refuser** afin de vérifier qu'aucune branche n'est créée. Refaire ensuite le test et sélectionner **Lancer Codex** uniquement après avoir configuré tous les secrets GitHub.

## Intégration Sentry

Le point d'entrée `action: ingest` accepte une source `sentry`, mais exige `x-ops-ingest-secret`. Utiliser un relais serveur minimal capable :

- de vérifier la signature du webhook Sentry ;
- de supprimer les données personnelles et pièces jointes ;
- d'ajouter `x-ops-ingest-secret` ;
- de transmettre uniquement le titre, le type d’erreur, la stack nettoyée, la release, la route, un identifiant d’événement et idéalement un `groupingKey` stable fourni par Sentry.

Ne pas placer `OPS_INGEST_SECRET` dans une URL ou dans la configuration frontend Sentry.

## États d'un incident

```text
detected
  -> analyzing
  -> awaiting_approval
       -> rejected
       -> approved
            -> repairing
                 -> pr_open
                 -> no_changes
                 -> failed
                 -> resolved
```

`resolved` doit être envoyé par un contrôle post-déploiement ou une décision admin après validation réelle. L'ouverture d'une PR ne marque jamais l'incident comme résolu.

`no_changes` signale une analyse aboutie sans correctif sûr à proposer : ce n'est pas un échec et le run GitHub reste vert. Les occurrences continues du même `fingerprint` incrémentent `occurrence_count` au lieu de relancer Codex toutes les cinq minutes. Après 24 heures sans nouvelle occurrence, le même problème peut toutefois ouvrir un nouvel épisode et bénéficier de nouvelles preuves. Pour GitHub Actions, le SHA du commit fait partie de l'empreinte afin qu'un échec sur un nouveau commit soit analysé immédiatement.

## Comportement en cas d'échec

- Telegram indisponible : l'incident retourne à `detected`, conserve son plan et sera retenté lors d'une occurrence suivante.
- OpenAI indisponible côté Supabase : un plan conservateur de secours est envoyé avec le code d'échec nettoyé et les chemins source déjà présents dans les preuves.
- GitHub dispatch indisponible : l'incident passe à `failed` et aucune branche n'est créée.
- Codex sans changement sûr : l’incident passe à `no_changes` ; aucune PR n’est ouverte, aucun échec n’est signalé et les occurrences suivantes sont regroupées sur cet incident.
- Modification d’un chemin protégé, d’une migration existante, d’un lien symbolique ou ajout de SQL destructif : le patch est rejeté avant validation.
- Lint, typecheck, tests ou build en échec : aucun commit ni push n’est effectué.
- Création de PR en échec : la branche peut exister, mais `main` et la production restent inchangés ; Telegram reçoit le lien du workflow en échec.

## Retour arrière

Avant fusion de la PR d'installation : fermer la PR et supprimer sa branche.

Après fusion mais avant activation : désactiver les deux workflows et ne pas configurer les secrets ; aucune collecte n'a lieu.

Après activation :

1. supprimer le webhook Telegram avec `deleteWebhook` ;
2. désactiver `TOK Incident Monitor` ;
3. révoquer `GITHUB_INCIDENT_TOKEN` et `TOK_CODEX_GITHUB_TOKEN` ;
4. supprimer ou faire expirer les secrets `OPS_*` ;
5. conserver les tables en lecture seule pour l'audit, ou les supprimer dans une migration dédiée après export.

Ne jamais supprimer les tables d'incidents dans la même migration qu'une correction métier urgente.
