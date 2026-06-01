# Tests de garde Supabase / RPC

## Objectif

Ces tests empêchent de repousser en production des migrations qui cassent les fonctions critiques Supabase. Ils ciblent surtout les erreurs déjà rencontrées sur le projet :

- utilisation de `ANY()` sur une colonne `jsonb`;
- agrégation `max(uuid)` invalide;
- suppression locale d'une migration déjà présente dans l'historique distant;
- RPC Actualités sponsorisées incomplètes;
- métriques gonflées par le restaurateur lui-même;
- tracking anonyme non compatible avec `/actualites` public.

## Fichiers principaux

```text
src/test/actualites-sponsored-sql.test.ts
src/test/supabase-critical-rpc-contracts.test.ts
supabase/tests/critical_rpc_smoke.sql
```

## Ce qui est vérifié

Les tests Vitest vérifient que les migrations :

- n'utilisent pas `ANY(target_pages)` sur `ad_campaigns.target_pages`, car cette colonne est un `jsonb`;
- n'utilisent pas `max(id)` sur des UUID;
- gardent le ranking sponsorisé pondéré par budget;
- gardent la rotation sponsorisée par fenêtre de 15 minutes;
- conservent les signatures de `get_social_feed_v2`, `record_social_feed_event`, `record_ad_campaign_event` et `record_actualites_sponsored_conversion`;
- conservent l'attribution de conversion commande/réservation;
- autorisent la lecture publique du fil Actualités;
- autorisent seulement les impressions/clics anonymes;
- bloquent les métriques gonflées par propriétaire/admin;
- verrouillent les grants des RPC sensibles sur les rôles attendus.

Le smoke SQL local crée des fixtures minimales dans une transaction annulée et appelle les RPC critiques :

- lecture du feed Actualités sponsorisé;
- tracking `record_social_feed_event`;
- métriques directes `record_ad_campaign_event`;
- conversion sponsorisée `record_actualites_sponsored_conversion`;
- vérification qu'un clic restaurateur est marqué interne et ne gonfle pas les métriques.

## Commande

```bash
pnpm run test -- src/test/actualites-sponsored-sql.test.ts src/test/supabase-critical-rpc-contracts.test.ts
```

Ou suite complète :

```bash
pnpm run test
```

Smoke SQL local après application des migrations :

```bash
supabase db reset --local
psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/critical_rpc_smoke.sql
```

Le fichier SQL encadre ses fixtures par `BEGIN` / `ROLLBACK`, donc il ne laisse pas de données de test si l'exécution se termine correctement.

## Règle de travail

Avant toute nouvelle migration liée à :

- Actualités;
- campagnes sponsorisées;
- Stripe;
- commandes;
- réservations;
- métriques;
- RLS;
- RPC Supabase;

il faut lancer les tests et vérifier que le build CI passe.

## CI

La workflow GitHub Actions `CI` lance `pnpm run test`; ces garde-fous échouent donc automatiquement si une migration retire un contrat critique ou casse les protections statiques. Le smoke SQL reste une vérification locale explicite pour appeler les RPC avec des fixtures minimales sans dépendre d'une base de production.
