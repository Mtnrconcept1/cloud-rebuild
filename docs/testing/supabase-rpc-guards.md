# Tests de garde Supabase / RPC

## Objectif

Ces tests empêchent de repousser en production des migrations qui cassent les fonctions critiques Supabase. Ils ciblent surtout les erreurs déjà rencontrées sur le projet :

- utilisation de `ANY()` sur une colonne `jsonb`;
- agrégation `max(uuid)` invalide;
- suppression locale d'une migration déjà présente dans l'historique distant;
- RPC Actualités sponsorisées incomplètes;
- métriques gonflées par le restaurateur lui-même;
- tracking anonyme non compatible avec `/actualites` public.

## Fichier principal

```text
src/test/actualites-sponsored-sql.test.ts
```

## Ce qui est vérifié

Le test vérifie que les migrations :

- n'utilisent pas `ANY(target_pages)` sur `ad_campaigns.target_pages`, car cette colonne est un `jsonb`;
- n'utilisent pas `max(id)` sur des UUID;
- gardent le ranking sponsorisé pondéré par budget;
- gardent la rotation sponsorisée par fenêtre de 15 minutes;
- conservent l'attribution de conversion commande/réservation;
- autorisent la lecture publique du fil Actualités;
- autorisent seulement les impressions/clics anonymes;
- bloquent les métriques gonflées par propriétaire/admin.

## Commande

```bash
pnpm run test -- src/test/actualites-sponsored-sql.test.ts
```

Ou suite complète :

```bash
pnpm run test
```

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

## Limite actuelle

Ces tests sont des tests statiques de migration. Ils empêchent les erreurs de forme les plus fréquentes, mais ils ne remplacent pas encore des tests d'intégration sur une base Supabase temporaire.

Étape suivante recommandée : créer un job CI optionnel qui lance une base Supabase locale, applique toutes les migrations et exécute des appels RPC réels avec des fixtures minimales.
