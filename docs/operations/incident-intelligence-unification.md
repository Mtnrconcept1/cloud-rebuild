# TOK — intelligence d’incident unifiée

## Objectif

Cette architecture évite que Telegram/Codex, Guardian et Support & Resolution paient plusieurs analyses IA pour le même problème.

Les responsabilités restent séparées :

- **Support & Resolution** traite les dossiers client/restaurateur et les actions métier réversibles.
- **ops-incident-control** est la source canonique du diagnostic technique, de la déduplication, de l’approbation Telegram et du lancement Codex.
- **Guardian** réutilise le diagnostic canonique et n’effectue une analyse approfondie que lorsque les preuves ont changé, que la confiance est insuffisante ou qu’un risque sensible le justifie.
- **Codex** reste le seul composant autorisé à préparer un patch de code, sur branche isolée, après approbation humaine.

## Routage déterministe avant OpenAI

Chaque incident est classé sans appel IA :

- `code`
- `configuration`
- `data`
- `third_party`
- `transient`
- `expected_business_rule`
- `unknown`

Codex n’est autorisé que pour `code`. Une configuration manquante, une panne fournisseur, un rejet métier attendu ou une incohérence de données ne déclenche donc pas automatiquement un modèle de réparation de code.

## Cache par preuve

Le contexte nettoyé et borné reçoit un hash SHA-256 `evidence_hash`.

Lorsque le hash n’a pas changé :

1. `ops-incident-control` réutilise son plan existant ;
2. Guardian réutilise ce plan au lieu de rappeler OpenAI ;
3. les occurrences sont regroupées sur l’incident existant ;
4. aucune nouvelle analyse n’est facturée.

Une nouvelle preuve, une nouvelle version déployée ou un nouveau code d’erreur change le hash et autorise une nouvelle analyse.

## Connexion du support au technique

L’action `escalate_technical_incident` est proposée uniquement lorsqu’un dossier support contient un signal technique crédible.

Après validation admin :

1. Support & Resolution construit une preuve technique minimale ;
2. le contenu des conversations, l’e-mail, le téléphone et les données médicales ne sont pas transmis ;
3. `ops-incident-control` crée ou retrouve l’incident technique canonique ;
4. `support_ops_incident_links` relie le dossier support à l’incident ;
5. Telegram et Codex suivent ensuite le workflow technique existant.

Plusieurs dossiers support peuvent ainsi pointer vers le même bug sans créer plusieurs réparations.

## Réduction du contexte Support & Resolution

Le modèle ne reçoit plus l’historique brut complet :

- premiers messages utiles ;
- derniers messages ;
- messages contenant des signaux paiement, commande, réservation, fraude, urgence ou juridique ;
- digest déterministe des messages omis ;
- maximum 28 messages sélectionnés.

Un `context_hash` permet de réutiliser une analyse existante lorsque le dossier n’a pas changé.

## Budgets IA

- Triage technique : modèle économique, sortie maximale de 900 tokens, verbosité faible.
- Support courant : modèle économique, sortie maximale de 1 400 tokens, raisonnement faible.
- Support complexe : modèle équilibré, raisonnement moyen.
- Guardian approfondi : modèle équilibré, sortie maximale de 1 600 tokens ; raisonnement élevé uniquement pour un incident sensible ou critique.
- Codex : modèle et effort définis par le workflow de réparation, conservés derrière l’approbation Telegram et les contrôles de CI.

## Mesure

Les journaux IA doivent conserver :

- `evidence_hash` ou `context_hash` ;
- classification et version d’analyse ;
- modèle demandé et retourné ;
- tokens d’entrée, cache, raisonnement et sortie ;
- coût estimé ;
- résultat : cache, diagnostic, no-change, PR ou échec.

Les indicateurs de pilotage prioritaires sont le coût par incident approuvé, par PR ouverte et par correctif vérifié.

## Sécurité

- aucune donnée personnelle brute dans l’incident technique ;
- RLS sur la table de liaison support/ops ;
- lecture réservée aux administrateurs ;
- écriture réservée au `service_role` ;
- aucune fusion, migration ou production automatique ;
- remboursements et avoirs toujours traités par les workflows humains existants.

## Retour arrière

La migration est additive. Le rollback applicatif consiste à :

1. désactiver l’action d’escalade support ;
2. revenir aux appels Guardian précédents ;
3. conserver les hashes, liens et journaux pour l’audit ;
4. ne supprimer aucune donnée historique.
