# Actualités : identité de facturation

## Périmètre et ordre de validation

Niveau 3 : facturation et fonctions privilégiées PostgreSQL. L'audit en lecture seule a identifié que les champs analytiques `source` / `page` participent à la déduplication payante ; l'identité anonyme utilise aussi le User-Agent du client.

Le premier commit ajoute uniquement la reproduction réelle sur la base main, sans correction métier. Les campagnes, utilisateurs, abonnements et moyens de paiement sont synthétiques. Le workflow reprend le replay intégral isolé déjà utilisé pour les lots checkout et impression : PostgreSQL 17, aucun secret fournisseur, réseau sortant refusé avant le premier démarrage, preuve de refus TCP et comparaison exacte des versions de migrations.

Le runner refuse les hôtes distants, les chaînes de connexion, les services libpq implicites et l'absence de consentement explicite à une base jetable. Il appelle la véritable RPC sous `SET LOCAL ROLE anon` puis `authenticated`, sans désactiver les triggers ou la RLS.

## Plan du correctif après preuve rouge

1. Confirmer les dépenses après variations de page, source, User-Agent et nouvel appel.
2. Ajouter une migration distincte qui change uniquement l'identité de facturation. Conserver métadonnées analytiques, plafonds, conversions et historique.
3. Vérifier transport idempotent, concurrence, isolation des comptes, trafic interne exclu et budgets.
4. Examiner séparément les grants des helpers privés Actualités. Préserver la fonction booléenne appelée par la politique RLS authentifiée et vérifier propriétaire/admin/service.
5. Régénérer les index, effectuer les contrôles ciblés et la CI complète avant revue.

La base locale Windows n'est pas démarrée par ce lot. Les preuves de replay appartiennent à la base jetable CI, pas à la production. Aucune mutation Supabase hébergée n'est autorisée par ces tests.

## Reprise

Les migrations historiques restent intactes. Tout correctif doit échouer en cas de dérive inattendue avant modification. Une éventuelle reprise nécessite une migration compensatrice revue ; remettre les clés de facturation vulnérables n'est pas un rollback automatique acceptable. Aucun remboursement ni recalcul historique n'entre dans ce lot.
