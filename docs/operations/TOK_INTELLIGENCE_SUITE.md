# TOK Intelligence Suite — Campaign Studio, Customer Memory, Support & Resolution, Guardian

## Périmètre

Cette suite ajoute quatre capacités à TOK sans remplacer les moteurs métier existants :

1. **Campaign Studio** prépare des plans de campagne structurés, simulés et validables. La création effective reste déléguée à `campaign-portal`, qui conserve les crédits, budgets, ciblages et écritures `ad_campaigns`.
2. **Customer Memory** conserve uniquement des préférences visibles, révocables et consenties. Les inférences restent `pending` jusqu'à confirmation du client.
3. **Support & Resolution** analyse les incidents support et propose des actions idempotentes. Les remboursements et avoirs sont toujours marqués `manual_required`.
4. **Guardian** enrichit `ops_incidents` avec des évaluations et vérifications post-correction, sans résoudre, fusionner ou déployer automatiquement.

## Secret OpenAI

Les fonctions lisent uniquement :

```text
OPENAI_API_KEY
```

via le runtime Supabase. La clé ne doit jamais être placée dans une variable `VITE_*`, le bundle frontend, GitHub, un log ou une table.

Les modèles restent sélectionnés avec `selectTokAiModel(...)` dans `_shared/openai.ts`.

## Fonctions

- `ai-campaign-studio`
- `customer-memory`
- `ai-support-resolution`
- `ai-guardian`

Le gateway Supabase utilise `verify_jwt = false`, conformément aux autres fonctions TOK, mais chaque handler appelle `authenticateRequest()` et applique ses propres rôles, limites et audits.

## Garde-fous

### Campaign Studio

- aucune insertion directe dans `ad_campaigns` ;
- budget et plafonds normalisés côté serveur ;
- approbation explicite ;
- matérialisation par `campaign-portal` ;
- journal `campaign_studio_runs`.

### Customer Memory

- consentement `personalization` obligatoire pour écrire ou inférer ;
- aucune déduction de santé, allergie, handicap, religion, origine, politique, sexualité, difficulté financière, situation juridique ou support ;
- suggestions inactives avant confirmation ;
- export et suppression disponibles ;
- événements append-only.

### Support & Resolution

- administrateur authentifié obligatoire ;
- actions idempotentes ;
- clôture soumise à confirmation ;
- `request_refund` et `grant_credit` impossibles à exécuter par l'agent ;
- toutes les décisions sont auditées.

### Guardian

- administrateur authentifié obligatoire ;
- distinction entre panne actuelle et panne récupérée ;
- analyse fondée sur les événements et audits existants ;
- aucune écriture dans le dépôt, aucun merge, aucune migration et aucun déploiement ;
- aucune résolution automatique après vérification.

## Déploiement

Respecter le workflow du dépôt :

1. fusionner uniquement après CI verte ;
2. laisser `Deploy Production` appliquer la migration additive ;
3. déployer les quatre Edge Functions ;
4. vérifier la présence de `OPENAI_API_KEY` côté Supabase sans lire ni afficher sa valeur ;
5. exécuter les tests de fumée avec des comptes client, restaurateur et admin ;
6. vérifier les Advisors et les logs après déploiement.

## Retour arrière

Les quatre routes peuvent être coupées par feature flags :

- `dashboard-campaign-studio`
- `customer-memory`
- `admin-support-resolution`
- `admin-guardian`

Les tables sont additives. Un rollback applicatif consiste à désactiver les flags et les fonctions, tout en conservant les journaux pour l'audit. Aucune table historique TOK n'est modifiée ou supprimée par cette suite.
