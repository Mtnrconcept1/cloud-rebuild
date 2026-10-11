# Référence exhaustive et index de recherche de l’application TOK

> Document généré depuis les sources du dépôt. Ne pas modifier manuellement : exécuter `pnpm docs:application-index`.

## Utiliser l’index

- Recherche libre : `pnpm docs:search -- marketing campagne`
- Filtrer un type : `pnpm docs:search -- --type=frontend-route admin`
- Filtrer une surface : `pnpm docs:search -- --surface=restaurant factures`
- Sortie exploitable : `pnpm docs:search -- --json --limit=50 supabase`
- Index machine : [tok-application-search-index.json](./tok-application-search-index.json)
- Vérification anti-obsolescence : `pnpm docs:application-index:check`

## Périmètre et preuve de fraîcheur

- Dépôt : `Mtnrconcept1/cloud-rebuild`
- Version du schéma : `2`
- Empreinte SHA-256 des sources indexées : `60d597aacc22fe3c1398631b24e9705a16c209efdbf9162725d2153a625fde2d`
- Périmètre : État versionné local du dépôt; inventaire statique sans lecture des valeurs de secrets ni interrogation de la production.
- Les noms de variables d’environnement sont indexés, jamais leurs valeurs.
- Les comportements dépendant des données, fournisseurs et secrets de production exigent une vérification d’exécution séparée.
- État Supabase observé : [photographie distante du 3 octobre 2026](./TOK_RUNTIME_EVIDENCE_2026-10-03.md).

### Volumétrie

| Famille | Total |
| --- | --- |
| apiRoutes | 9 |
| cronJobs | 33 |
| databaseContract | 228 |
| databaseObjects | 2736 |
| documents ���q�^