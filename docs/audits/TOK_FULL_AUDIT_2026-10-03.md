# TOK — audit transversal après fusion de la PR #690

Date : 3 octobre 2026. Révision auditée : `68852d10feab466430e0f70f5e5b6ebfee414a59`.

Ce document est la synthèse de traçabilité publique. Le rapport de travail détaillé, les preuves et la matrice de remédiation sont remis au propriétaire dans la conversation, sans publier ici de détails opératoires sur les permissions sensibles.

## Fusion et livraison

- PR #690 fusionnée par squash à 04:30:07 UTC, après vérification de la CI et de Changed Test Files sur la branche.
- Commit fusionné signé et vérifié par GitHub : `68852d10feab466430e0f70f5e5b6ebfee414a59`.
- CI après fusion : run `37096749714`, résultat **success**.
- Le lot fusionné a été validé par 2 610 tests applicatifs, 17 contrôles de sécurité, 31 tests du worker, typecheck, lint et build. Lint : zéro erreur, 17 avertissements préexistants.
- L’audit pnpm du lot passe de 54 GHSA distincts à un avis amont `braces` conservé, avec une atténuation locale testée. Production et worker : zéro vulnérabilité signalée par leurs audits respectifs. Voir `DEPENDABOT_2026-10-03.md` pour les limites.

**La mise en production de cette révision n’est pas confirmée.**

1. Le déploiement Vercel natif `dpl_BShcex1X2BovzSyj1yCEe1x4Gxys` échoue avec `BULK_REDIRECTS_UPLOAD_FAILED`. La cause détaillée de l’import n’est pas établie ; aucun retrait spéculatif des redirections SEO.
2. Le workflow Deploy Production `37096749620` réussit la construction du frontend Vercel avec ses paramètres de production, puis échoue à l’étape de migration Supabase. Le diagnostic CLI cite **30 versions distantes absentes du dossier local**. La publication frontend et les déploiements Edge suivants sont ignorés.

Ne pas confondre un build réussi, un commit fusionné et un déploiement effectivement servi au public.

## Effets du pipeline existant

Le pipeline déclenché automatiquement par cette fusion autorisée a exécuté, avant son échec de migration, des synchronisations de configuration et de secrets déjà prévues par le dépôt, ainsi que des réglages Auth de démonstration. Les valeurs sont restées masquées.

Le preflight a **activé et vérifié la protection contre les mots de passe compromis** : preuve Management API `password_hibp_enabled=true` à `2026-10-03T04:33:25.792Z`, job `111128596745`. Le contrôle Vault cron et l’acceptation du test contrôlé de l’expéditeur Resend ont également réussi. L’alerte initiale sur les mots de passe n’est donc plus classée ouverte dans le rapport final.

Les contrôles propres à l’audit sont en lecture seule en production. Aucune nouvelle migration, policy, commande cliente, impression ou transaction Stripe n’a été créée par les reproductions de l’audit.

## Couverture

| Surface | Vérification réalisée |
|---|---|
| Dépôt | 2 619 fichiers suivis ; 2 267 fichiers texte récupérés et contrôlés contre leurs empreintes |
| Analyse syntaxique | 1 406 fichiers JavaScript/TypeScript, 360 508 lignes, tests et scripts compris |
| Routes App.tsx | 131 déclarations, dont 119 chemins statiques ; aucun doublon de chemin dans App.tsx |
| Livraison HTTP | 125 URLs observées : 113 réponses 200, 12 réponses 404 dont une URL inconnue volontaire |
| Navigateur | 8 parcours anonymes, viewport 390 pixels, mutations bloquées |
| PostgreSQL | 320 tables publiques avec RLS activé ; 572 fonctions publiques SECURITY DEFINER |
| Migrations | 494 fichiers SQL versionnés ; 516 versions enregistrées dans la base |
| Edge Functions | 114 noms versionnés, tous présents parmi les 118 déployés |
| RPC frontend | Les 24 références directes extraites et vérifiées ont toutes une définition en production |
| Doublons exacts | 18 groupes : 10 miroirs de skills, 4 groupes de ressources/medias et 4 paires SQL |
| Reproductions | 6 comportements indésirables reproduits hors production sur le vrai code, frontières externes simulées |

L’inventaire automatisé ne signifie pas une lecture manuelle de chacune des 360 508 lignes. La correspondance des noms des fonctions ne prouve pas l’égalité de tous les bundles déployés.

## Synthèse des résultats

Le rapport distingue **17 constats et chantiers : 6 P1, 9 P2 et 2 P3**. Ce ne sont pas 17 vulnérabilités exploitables indépendantes : certains sont des blocages de livraison, des manques fonctionnels ou des diagnostics à qualifier.

Priorités : rétablir une livraison reproductible ; rapprocher les migrations sans falsifier l’historique ; vérifier et restreindre les permissions métier internes ; fiabiliser les transitions et erreurs de l’impression et des journaux ; imposer la gouvernance de main ; aligner les contrats de routes, médias et capacités marketing.

Onze routes React existantes répondent HTTP 404 en accès direct. Certaines correspondent à des fonctionnalités désactivées et doivent être qualifiées par leur contrat de publication. Les tests anonymes d’administration redirigent bien vers la connexion. Une réponse 401 de session marketing sans identité est attendue.

Les canaux externes de l’orchestrateur marketing global restent explicitement bloqués dans le code examiné, tandis que les chemins email et in_app sont implémentés. Ce constat ne doit pas être généralisé sans contrôle à tous les autres studios et intégrations de l’app.

Les quatre fonctions de diagnostic déployées en supplément ont été lues et renvoient toutes 410. Elles sont neutralisées, pas présentées comme quatre failles actives.

Les alertes natives de performance servent au tri des investigations. Les index signalés sans usage, les migrations historiques et les ressources natives ne doivent pas être supprimés automatiquement.

## Limites et points positifs

Toutes les tables publiques ont RLS activé ; les vues publiques inspectées sont en mode invocateur ; les stockages sensibles examinés sont privés. Les protections HTTP restent restrictives. Neuf références à des en-têtes de clés privées ont été qualifiées comme parsing/validation ou fixtures : aucun secret réel confirmé dans ce contrôle limité du snapshot texte.

Fenêtre de logs Edge : `2026-10-02T04:25:00Z` à `2026-10-03T04:25:00Z`. 21 103 réponses : 21 054 en 200, 11 en 204, 38 en 401, aucune 5xx dans cette source et cette fenêtre. Un statut 200 n’atteste pas à lui seul la cohérence métier.

Non réalisés : parcours connectés inter-comptes, transactions Stripe, restauration de sauvegarde, audit exhaustif de l’historique Git et des dépendances distantes de chaque Edge Function, tests physiques iOS/Android, dédoublonnage métier exhaustif de toutes les fiches. Aucune attestation de conformité ou d’absence totale de failles n’est fournie.

## Reproductibilité et retrait des outils temporaires

La collecte `37096871737` a utilisé un worktree Git isolé sur le SHA de référence avec un statut propre. Le contrôle de navigation `37097307382` a réussi. Les deux workflows temporaires créés sur la branche d’audit sont retirés dans le commit de publication de ce document : le diff final avec main ne contient que ce compte rendu.

Les preuves sont des inventaires et observations, pas des validations inventées. Le rapport détaillé accompagne une matrice CSV, les routes HTTP et déclarées, les doublons exacts, les versions distantes absentes, les résultats navigateur et un script de reproduction sans accès à la production.

La phase d’audit ne livre aucun nouveau correctif applicatif. Une PR documentaire distincte conserve cette trace ; elle n’est pas fusionnée automatiquement. Retour arrière de cette phase : revert du seul document, aucune donnée backend à restaurer.

## Exécutions de référence

- Fusion : PR #690, commit `68852d10feab466430e0f70f5e5b6ebfee414a59`.
- CI post-fusion : `37096749714`.
- Déploiement existant : `37096749620`.
- Collecte source : `37096871737`.
- Contrôle routes/navigateur : `37097307382`.
