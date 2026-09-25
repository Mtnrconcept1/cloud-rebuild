# TOK — Correctifs de sécurité et de fiabilité du 24 septembre 2026

## Périmètre et état de livraison

Dépôt : `Mtnrconcept1/cloud-rebuild`. Base relue : `b49f87add06449cf0cc73fedcdcfbb2de2b09534`.
Branche dédiée : `fix/tok-audit-security-reliability-20260924`.
Risque : niveau 3, car permissions SQL, Storage, journalisation et traitement des commandes sont concernés.

Les trois migrations SQL de sécurité ont été appliquées au projet Supabase TOK `wwcrtyoueexyxkkikaos` le 24 septembre 2026, après la demande explicite d'application. Les correctifs Edge restent uniquement dans la branche : aucun déploiement de fonction, aucune impression, aucun paiement et aucun merge vers main n'ont été effectués. Ce lot ne constitue pas une certification complète de l'application.

Le checkout local n'a pas pu être obtenu : la résolution DNS de github.com échoue. Le travail utilise le connecteur GitHub et une copie locale isolée des seuls fichiers nécessaires, pas un worktree Git. Avant modification, les deux fichiers serveur ont été vérifiés par leur hash Git blob :

- `_shared/auth.ts` : `0399009525af78ac345f0f68652cea2de8ccce67` ;
- `print-orchestrator/index.ts` : `02112dead8fc9f69e5ae44c6b10c3d046cf216f8`.

## Correctifs

### 1. Exécution des six RPC internes d'impression

La migration `20260924044424_restrict_internal_print_rpc_execution.sql` retire explicitement EXECUTE à PUBLIC, anon et authenticated sur six signatures exactes, et préserve service_role. Elle ne modifie pas les corps des fonctions, les RPC publics ni les privilèges par défaut. Une postcondition intégrée annule la migration si les droits effectifs ne correspondent pas au résultat attendu.

La relecture de production a confirmé les droits indésirables avant correction. La finalisation conserve ses vérifications existantes de paiement finalisé, montant, devise et propriétaire. Aucun scénario de paiement gratuit n'est présenté comme démontré.

### 2. Chemins Storage des logos

La migration `20260924044438_qualify_invoice_logo_storage_paths.sql` qualifie le chemin externe `storage.objects.name` dans les trois policies INSERT/SELECT/DELETE d'invoice-logos. Elle conserve l'accès au dossier utilisateur, l'accès propriétaire et l'accès administrateur. Le nom modifiable du restaurant ne doit plus intervenir dans l'autorisation d'accès à un objet.

Aucun objet, bucket ou fichier n'est supprimé ; limites MIME/taille et visibilité du bucket sont inchangées.

### 3. Lecture publique des restaurants

La migration `20260924044449_align_restaurant_public_read_policies.sql` aligne les deux chemins permissifs trop larges sur les critères de publication déjà présents dans restaurants_public_select. Elle ne transforme pas ces policies en RESTRICTIVE, afin de ne pas interdire les brouillons au propriétaire ou à l'administration. L'exception de restaurant de démonstration associé est conservée.

### 4. Traitement et reprise de l'impression

Dans print-orchestrator :

- les trois transitions SQL vérifient leur champ error avant de déclarer la tâche terminée ;
- une reprise commence toujours par retrouver la référence immuable chez le fournisseur ;
- les commandes canceled/refunded ne sont pas soumises, même avec un indicateur paid obsolète ;
- une erreur fournisseur permanente n'est plus traitée comme temporaire ;
- une impossibilité d'enregistrer la clôture/reprise de la tâche remonte en HTTP 500 ;
- la taille du lot est un entier de 1 à 50, validé avant la prise de tâches.

Aucune modification du checkout, des signatures de webhook, des clés, des prix ou des requêtes envoyées au fournisseur.

### 5. Erreurs de journalisation

writeAuditLog détecte désormais aussi les erreurs renvoyées dans le résultat SQL, et pas seulement les promesses rejetées. Le repli console ne contient que le nom de fonction, l'action et un code borné. Il ne journalise plus l'objet d'erreur complet. Le contrat reste non bloquant pour éviter qu'un incident de journalisation provoque la répétition d'une opération financière déjà réussie.

## Tests et preuves

Le fichier scripts/tok-audit-reliability.test.mjs utilise node:test et le compilateur TypeScript déjà déclaré par le dépôt. Il exécute les vrais fichiers serveur dans un contexte isolé, avec les frontières Supabase/Cloudprinter simulées ; il ne contacte aucun fournisseur ni compte de production.

Commande :

```sh
node --test scripts/tok-audit-reliability.test.mjs
```

Avant correction : 31 tests, 9 réussites, 22 échecs (19 échecs de comportement et 3 contrats de migration absents).
Après correction : 31 tests, 31 réussites, zéro échec, zéro test ignoré.

La reprise après acceptation fournisseur et erreur SQL est testée avec une seule création fournisseur sur deux passages. Les trois branches de réconciliation, erreurs permanentes/temporaires, fin des tentatives, commandes non payées/terminales, méthode/authentification, limites et erreurs d'audit sont couvertes.

Le point d'entrée src/test/tok-audit-reliability.test.ts branche cette suite sur Vitest. Son lancement via Vitest reste à valider dans l'environnement complet ; l'exécution native a été effectuée. Les trois tests SQL sont des contrats statiques : ils ne remplacent pas l'exécution de migrations ni les scénarios inter-comptes sur PostgreSQL.

Contrôles non exécutés : pnpm lint, pnpm typecheck, pnpm test intégral, pnpm build, tests PostgreSQL isolés/inter-comptes, navigateur/mobile, paiements réels et déploiement Edge/frontend. Le checkout/dépendances et PostgreSQL ne sont pas disponibles localement. L'application SQL et les lectures des catalogues PostgreSQL de production sont désormais effectuées et détaillées ci-dessous. Aucune validation non exécutée n'est déclarée réussie. La relecture du diff a été effectuée sans reviewer indépendant.

## Application Supabase et contrôle du 24 septembre 2026

Application explicite demandée par l'utilisateur. Le connecteur `apply_migration` a confirmé les trois opérations. Supabase a attribué les versions suivantes, qui deviennent les noms canoniques des fichiers dans cette branche :

| Version préparée | Version enregistrée | Migration |
|---|---|---|
| 20260924040000 | 20260924044424 | restrict_internal_print_rpc_execution |
| 20260924040100 | 20260924044438 | qualify_invoice_logo_storage_paths |
| 20260924040200 | 20260924044449 | align_restaurant_public_read_policies |

Les corps SQL sont identiques octet pour octet aux fichiers préparés et aux instructions enregistrées dans `supabase_migrations.schema_migrations`. Seuls les noms de fichiers, les références de test et ce rapport sont alignés. Aucune ancienne ligne de l'historique distant n'est réécrite ; aucun second exemplaire de ces migrations n'est conservé avec l'ancien horodatage.

Contrôles en production :

- six RPC présentes ; EXECUTE refusé à anon/authenticated et conservé pour service_role sur chacune ;
- hash des six définitions de fonctions identique avant/après : aucun contrôle métier de paiement n'a été changé ;
- les trois policies invoice-logos déparsées font référence à `objects.name` dans la sous-requête, jamais à `r.name` ;
- les deux policies publiques modifiées imposent activité, statut active et absence de démonstration, avec l'exception de démonstration associée conservée ;
- empreinte des autres policies restaurants identique avant/après : `0b237970d32381a95725b03cab20d944` ;
- RLS activée sur restaurants, print_orders, print_fulfillment_jobs et storage.objects ;
- RPC de recherche Genève : 295 résultats, page de 54 et next_offset 54, avant comme après ;
- 440 fiches répondent aux critères de publication ; il s'agit d'un comptage sous le rôle d'administration, pas d'un test HTTP anonyme ;
- au contrôle de 04:48:22 UTC, quatre passages print-orchestrator réussis après la dernière migration ; six commandes d'impression et zéro tâche de fulfillment aux comptages avant/après. Une file vide ne prouve pas un parcours fournisseur complet.

La tentative de test en transaction READ ONLY avec SET LOCAL ROLE anon a été bloquée par le garde de l'outil avant exécution. Aucun contournement n'a été tenté. Les tests inter-comptes, upload/suppression Storage et parcours fournisseur ne sont pas déclarés validés.

Validation locale des références : 31 tests réussis au départ ; après renommage, les trois contrats SQL détectent les anciens chemins manquants ; après alignement, 31 réussites, zéro échec. Node 22.16.0 et TypeScript 5.8.3, frontières externes simulées, neuf fichiers de départ vérifiés par SHA Git. Aucun code serveur n'est modifié dans ce commit d'alignement.

## Validations complémentaires et futures mises en production

1. Exécuter les tests concernés et la validation complète sur le SHA exact de la branche, dans un checkout propre.
2. Utiliser une base PostgreSQL jetable isolée des services de production. Ne pas créer aveuglément une preview susceptible de rejouer des crons historiques vers production (issue #627).
3. Dans cette base isolée, appliquer les trois migrations dans l'ordre et vérifier leur idempotence. Elles sont déjà enregistrées sur TOK Production ; ne pas les rejouer sous les anciens numéros.
4. Lancer scripts/tok-audit-security-postcheck.sql. Les six RPC doivent exister, être interdites à anon/authenticated et autorisées au service. Vérifier les définitions déparsées des policies et le maintien de RLS.
5. Avec deux restaurateurs de test distincts, vérifier upload/lecture/suppression des logos dans son dossier et refus inter-comptes ; vérifier également le dossier utilisateur et l'accès administrateur. Modifier le nom commercial ne doit pas changer les droits.
6. Vérifier visiteur anonyme, utilisateur non propriétaire, propriétaire de brouillon, administrateur et compte de démonstration : seules les fiches publiées sont publiques, les exceptions légitimes restent disponibles.
7. Effectuer les scénarios fournisseur/paiement uniquement dans un sandbox correctement identifié. Contrôler absence de double soumission et état durable après reprise.
8. Planifier le déploiement seulement après ces preuves. Le helper auth.ts étant partagé, identifier les fonctions impactées et utiliser le pipeline de déploiement habituel plutôt qu'un déploiement global improvisé.

## Retour arrière

Avant toute application distante, conserver les ACL et définitions de policies ainsi que les versions Edge. Les migrations sont transactionnelles et ne détruisent pas de données. En cas de problème d'accès, corriger le chemin serveur autorisé plutôt que réouvrir l'exécution anonyme des RPC. Une correction de policy doit être additive et préserver la fermeture des accès inter-comptes. Les fichiers serveur peuvent revenir au commit de base après analyse de l'incident ; ne pas supprimer les tests de régression.

## Travaux non dupliqués et blocages vérifiés

- PR #676 / issue #667 : widget MCP, routage et CSP déjà traités dans une branche distincte ; pas de reprise concurrente ni merge.
- PR #671 et #673 / issue #672 : runners et CI ; les descriptions ne prouvent pas une nouvelle exécution réussie.
- PR #679 : accueil desktop ; pas de réécriture de cette branche.
- Issue #629 : protection de main, encore non active au contrôle.
- Vercel : le déploiement dpl_C5MA2uXPybLt736NSnjHo96BUWWb est ERROR avec BULK_REDIRECTS_UPLOAD_FAILED. L'outil get_deployment_build_logs est annoncé mais répond Tool not found ; la cause détaillée de l'upload de redirections n'est pas établie. Aucune suppression spéculative des redirections SEO.
- Stripe : le connecteur ne présente que Globalparty en live ; son rattachement au compte TOK n'a pas été établi. Aucun accès ni mutation de ce compte n'a été effectué au titre de TOK.
- Supabase : projet Tok wwcrtyoueexyxkkikaos confirmé ACTIVE_HEALTHY ; aucun changement de secrets, tarifs, rétention, cron ou facture.
- Catalogue/images, OAuth, parcours de réservation, métriques navigateur, contrats juridiques et restauration de sauvegardes restent des chantiers séparés à valider.

## Liste complète des fichiers de ce lot

1. supabase/functions/_shared/auth.ts
2. supabase/functions/print-orchestrator/index.ts
3. supabase/migrations/20260924044424_restrict_internal_print_rpc_execution.sql
4. supabase/migrations/20260924044438_qualify_invoice_logo_storage_paths.sql
5. supabase/migrations/20260924044449_align_restaurant_public_read_policies.sql
6. scripts/tok-audit-reliability.test.mjs
7. scripts/tok-audit-security-postcheck.sql
8. src/test/tok-audit-reliability.test.ts
9. docs/audits/TOK_REMEDIATION_2026-09-24.md
