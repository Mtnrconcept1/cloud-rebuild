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

Le modèle ne reçoit plus l’historique brut complet. Il charge d’abord les 80 messages les plus récents, les remet dans l’ordre chronologique, puis sélectionne :

- premiers messages utiles ;
- derniers messages ;
- messages contenant des signaux paiement, commande, réservation, fraude, urgence ou juridique ;
- digest déterministe des messages omis ;
- maximum 28 messages sélectionnés.

La sélection réserve explicitement une place au début du dossier et aux réponses les plus récentes avant de compléter avec les messages à fort signal. Une longue série de messages importants ne peut donc plus évincer la plainte initiale nécessaire à la compréhension du cas.

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

## Stabilité opérationnelle du cache

Les compteurs de récurrence, horodatages, identifiants de requête et compteurs de tokens sont exclus du hash technique afin qu’une même panne ne soit pas refacturée à chaque occurrence. Le hash change toutefois lorsque la signature d’erreur ou les preuves techniques changent.

Guardian vérifie séparément la gravité et le niveau de risque avant de réutiliser une évaluation. Une évaluation canonique devenue obsolète est reconstruite sans token ; une ancienne analyse approfondie n’est réutilisée que si sa gravité et son risque correspondent encore à l’incident actuel.

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
