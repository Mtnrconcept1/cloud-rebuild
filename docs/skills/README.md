# TOK IDE Skills

Ce dossier contient les règles métier à fournir à Cursor, Codex, Antigravity ou tout autre IDE/agent qui génère du code pour TOK.

## Lecture obligatoire

Avant toute modification, lire :

1. `TOK_APPLICATION_SKILL.md` — contexte produit et technique global.
2. `TOK_GLOBAL_RULES.md` — règles permanentes de génération de code.
3. Le skill correspondant au domaine touché.
4. `TOK_TESTING_SKILL.md` si la modification touche une zone critique.
5. `TOK_RELEASE_GATEKEEPER.md` avant tout merge ou livraison.

## Skills disponibles

- `TOK_GLOBAL_RULES.md` : règles générales du projet.
- `TOK_PAYMENT_SKILL.md` : panier, commandes, Stripe, webhooks, remboursements, statuts paiement.
- `TOK_SUPABASE_RLS_SKILL.md` : Supabase, RLS, migrations, RPC, permissions, Storage.
- `TOK_SCALE_READINESS_SKILL.md` : performance, charge, pagination, cache, realtime, indexes.
- `TOK_RESTAURANT_OPS_SKILL.md` : opérations restaurant, horaires, capacité, pause commandes, stock.
- `TOK_NOTIFICATIONS_SKILL.md` : emails, SMS, push, notifications client/restaurateur/admin.
- `TOK_ADMIN_SUPPORT_SKILL.md` : admin TOK, support, litiges, commandes bloquées, remboursements.
- `TOK_SEO_SKILL.md` : pages publiques, indexation, sitemap, canonical, OpenGraph, données structurées.
- `TOK_MEDIA_AI_SKILL.md` : images, uploads, Storage, IA, quotas, coûts, thumbnails.
- `TOK_TESTING_SKILL.md` : tests obligatoires et parcours critiques.
- `TOK_RELEASE_GATEKEEPER.md` : checklist de blocage avant merge ou production.

## Instruction maître à donner à l’IDE

Avant de générer du code, lire les skills dans `docs/skills/`.

Priorités absolues : paiement fiable, commande fiable, Supabase sécurisé, RLS correcte, aucun secret exposé, aucune modification critique sans test, aucune requête non paginée sur table volumineuse, aucun webhook non idempotent, aucune migration destructive.

Quand une fonctionnalité est modifiée :

1. Identifier le domaine concerné : paiement, Supabase, restaurant, admin, SEO, média, IA, sécurité, performance.
2. Appliquer le skill correspondant.
3. Modifier le minimum de fichiers.
4. Ajouter ou mettre à jour les tests.
5. Expliquer les risques évités.
6. Donner la liste exacte des fichiers modifiés.

## Ordre de priorité

1. Fiabilité paiement/commande.
2. Sécurité Supabase/RLS/rôles.
3. Scalabilité et pagination.
4. Notifications restaurant/client/admin.
5. Admin support et traçabilité.
6. Opérations restaurant.
7. SEO public.
8. Images, médias et IA.
