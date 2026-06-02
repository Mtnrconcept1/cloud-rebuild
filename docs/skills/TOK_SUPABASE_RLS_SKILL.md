# TOK Supabase RLS Skill

À utiliser pour toute modification liée à Supabase, PostgreSQL, migrations, RLS, RPC, fonctions SQL, Edge Functions, Storage, rôles ou permissions.

## Objectif

Garantir que les données TOK restent protégées, performantes et correctement séparées entre clients, restaurateurs, livreurs, admins et service interne.

## Règles obligatoires

1. Toute table publique sensible doit avoir RLS activée.
2. Ne jamais exposer une clé `service_role` côté navigateur.
3. Ne jamais donner à `anon` un accès aux données privées.
4. Les policies doivent être simples, lisibles et testables.
5. Éviter les policies récursives ou auto-référentielles.
6. Les fonctions `SECURITY DEFINER` doivent définir explicitement `search_path`.
7. Limiter strictement `EXECUTE` sur les fonctions sensibles.
8. Ajouter des indexes sur les colonnes utilisées dans `WHERE`, `JOIN`, `ORDER BY` et les filtres dashboard.
9. Toute requête front sur table volumineuse doit être paginée.
10. Les buckets Storage doivent avoir des règles d’accès strictes.
11. Les migrations doivent être idempotentes quand c’est possible.
12. Ne jamais modifier une migration historique déjà appliquée ; créer une nouvelle migration.

## Points de vigilance TOK

- `orders`, `reservations`, `payment_transactions`, `restaurants`, `profiles`, `roles`, `social_post_comments`, `restaurant_members`, `admin_audit_logs`.
- Les RLS sur les commentaires ne doivent pas interroger récursivement la même table.
- Les dashboards restaurateurs doivent être protégés par ownership réel côté DB ou fonction serveur, pas uniquement par l’UI.
- Les admins doivent passer par des contrôles de rôle explicites.

## Avant de finaliser

- Vérifier RLS activée sur les tables sensibles.
- Vérifier `GRANT` et `REVOKE`.
- Vérifier que `anon` n’a pas d’accès dangereux.
- Vérifier les indexes nécessaires.
- Vérifier les fonctions `SECURITY DEFINER`.
- Ajouter un test ou un guard test si la zone est critique.
