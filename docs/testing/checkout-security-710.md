# Recette de sécurité checkout et menus — issue #710

## Périmètre

La migration `20261010194510_checkout_benefits_and_public_menu_security.sql` :

- supprime le plancher de remise fourni par le client, en conservant la signature RPC ;
- réserve les écritures d'historique promotionnel au RPC et au service interne ;
- ferme les deux anciennes policies publiques de menus et reprend les conditions de publication des restaurants du 25 septembre (disponibilité, activité, statut, démonstration, ville, source et images vérifiées) ;
- conserve les accès propriétaire et ajoute une lecture administrateur, toujours soumise aux restrictions des comptes de démonstration ;
- réserve `rate_limit_consume` à `service_role`.

Aucune donnée historique n'est réécrite. La fonction checkout est modifiée avec une substitution unique vérifiée de sa définition courante : les contrôles d'identité, verrous, écritures de fidélité et protections de démonstration déployés sont conservés. Une définition inattendue provoque l'annulation transactionnelle. Le paramètre `p_discount_applied` reste accepté pour compatibilité mais n'influence plus le calcul.

La migration distincte `20261010212500_reconcile_canonical_commercial_demo_inert_state.sql` réconcilie une contradiction historique démontrée par ce replay : le trigger de juillet réactive automatiquement toute démonstration, alors que le provisioning d'octobre exige une référence de production inerte. Elle retire uniquement cette activation automatique, conserve tous les contrôles d'identité, RLS et refus de transactions, puis interdit explicitement la réactivation du singleton canonique. Un canonique déjà dangereux provoque un refus transactionnel au lieu d'une réécriture silencieuse.

Cette migration concerne `supabase/migrations`, donc le projet de production. Le restaurant éditable actif du projet de démonstration séparé reste défini dans `supabase/demo-migrations` ; `provision-commercial-demo-project-session` recherche bien son restaurant actif avec le client `demo`, et non avec le client de production.

## Réconciliation de production en lecture seule

Au 10 octobre, le projet TOK `wwcrtyoueexyxkkikaos` contient 521 versions, dernière `20261009003407`, exactement les versions du main `c17b0eed` (aucun écart de version). Le trigger `enforce_commercial_demo_restaurant_active` est déjà absent du projet hébergé, mais présent après le replay des mêmes migrations : c'est une dérive d'objet réelle, que la nouvelle migration formalise. Sa fonction inutilisée demeure présente. Le canonique observé est `is_demo=true`, `is_active=false`, `status=demo`, sans compte Stripe.

Empreintes MD5 de `pg_get_functiondef` avant correction : checkout `7a89d2788a98c0f76c871d45e9ad5b39`, rate limit `e32a47336b1e5adec4ec74e654589b5a`, provisioning `23e22771d135013cc722ac4fa1ef0998`. Le plancher client dangereux, les policies promotionnelles `ALL`, les menus publics `true` et l'EXECUTE authenticated du rate limit sont confirmés. Ces observations sont horodatées, pas une autorisation ni une preuve de déploiement ; relire les objets et l'historique immédiatement avant application.

## État des preuves au 10 octobre 2026

Le candidat part de `702a9a19501af18b144dff7d1195eada04bacdb0`. L'instance locale préexistante inspectée en lecture seule possède 481 migrations, jusqu'à `20260909025200`. Il lui manque 40 migrations de ce main, notamment `20260925104552` (images) et `20261006010000` (démonstration inerte). Ce schéma ne constitue donc pas une preuve du schéma actuel.

Un conteneur isolé sans réseau, limité à 768 Mio et 1 CPU, a été créé pour la recette. La première restauration d'un export de schéma sans données s'est arrêtée sur `schema "auth" already exists`. Elle est incomplète ; aucune réussite de replay n'en est déduite. Docker a ensuite été mis en pause manuellement : cette pause est respectée. Le PostgreSQL 18 natif disponible ne possède pas les extensions Supabase nécessaires. Aucun export, secret ou donnée utilisateur n'est enregistré dans ce dépôt.

**Le statut de validation dépend du dernier run de la [PR #731](https://github.com/Mtnrconcept1/cloud-rebuild/pull/731), associé à son SHA exact.** Les tests locaux du garde de cible ne remplacent pas la preuve PostgreSQL. Le workflow dédié fournit l'alternative sur runner jetable ; un échec d'une migration historique doit être analysé et consigné, jamais ignoré pour obtenir un résultat vert.

Le run CI `38078321068` a ensuite validé le replay de tout le main et l'égalité exacte des versions. Un replay sur base vide avait révélé la précondition de données de `20260909133500` : 440 contacts TheFork attendus. Le scénario injecte donc 440 contacts **synthétiques**, sans email, téléphone ou site, à la frontière du 9 septembre. Aucune migration ni assertion historique n'est altérée. Cette preuve concerne le schéma main avec prérequis synthétiques, pas une base sans données initiales ni le projet hébergé. Le même run a vérifié une tentative TCP sortante réellement rejetée par le pare-feu. Les assertions métier se sont arrêtées sur les préconditions de modération des fixtures ; leur validation est suivie séparément.

## Exécution en CI, sans accès fournisseur

Après intégration de l'impression (#738), le lot est rebasé sur `f893d29c41c6f0ebf542693d72baa2255332d9dc` : 522 migrations de base, 524 avec les deux nouvelles migrations. Les SQL et assertions du lot restent identiques à la version validée par le [replay 38080486490](https://github.com/Mtnrconcept1/cloud-rebuild/actions/runs/38080486490) et la [CI 38080486756](https://github.com/Mtnrconcept1/cloud-rebuild/actions/runs/38080486756). Un nouveau replay part de cette base comprenant l'impression ; les résultats du dernier SHA de la PR restent nécessaires.

La migration impression `20261010203000` touche les objets `print_*`, distincts de checkout, promotions, menus et singleton de démonstration. La version checkout `20261010194510` lui est chronologiquement antérieure : si impression est déjà appliquée, `db push --include-all` est attendu pour installer cette version manquante, sans renommer ni réécrire l'historique. Le workflow de production utilise déjà cette option. Avant application, le dry-run doit annoncer seulement les deux versions manquantes autorisées (`20261010194510`, `20261010212500`) une fois impression déployée ; tout autre candidat nécessite réconciliation. La pause et les contrôles du fournisseur d'impression restent gérés dans son lot.

Le workflow `Checkout security PostgreSQL replay` se déclenche pour la PR de ce lot. Il peut aussi être lancé manuellement avec le SHA complet du main **avant** cette migration.

1. Extraire ce main dans un worktree temporaire et consigner les deux SHA.
2. Utiliser uniquement un projet local temporaire `tok-security-710-ci`, PostgreSQL 17, avec Supabase CLI 2.102.0, dans un réseau Docker dédié dont le pare-feu refuse les nouvelles connexions sortantes (les éventuels anciens cron/pg_net ne peuvent pas joindre de fournisseur). Les réponses à la connexion PostgreSQL de l'hôte restent autorisées.
3. Exécuter `supabase db start` avec les migrations jusqu'au 9 septembre, injecter `checkout_security_710_baseline_prerequisites.sql`, remettre le suffixe historique intact et appliquer `supabase migration up --local`. Le seed ordinaire est désactivé. Comparer exactement les versions appliquées aux fichiers de migration du main et vérifier que les fichiers historiques n'ont pas changé.
4. Créer uniquement les fixtures synthétiques `710…`, provoquer une dérive bénigne du RPC et vérifier le refus intégral (fonction, policies, grants, historique inchangés), restaurer le RPC initial, appliquer la migration checkout, la réappliquer et comparer définition de fonction, historique et toutes les policies de démonstration avant/après. Démontrer ensuite l'échec du provisioning avec le trigger historique, son rollback, puis sa réussite après la migration de réconciliation et après réapplication des deux opérations.
5. Exécuter les assertions sous les vrais rôles `anon`, `authenticated`, propriétaire, administrateur, démonstration et `service_role`.
6. Exécuter six sessions simultanées pour une même commande et deux sessions en concurrence pour la dernière utilisation d'une promotion. Une session coordinatrice verrouille la ligne ; le runner exige d'observer toutes les sessions concurrentes en attente de verrou dans `pg_stat_activity` avant de libérer la ligne.
7. Publier les journaux comme artefact CI et arrêter uniquement la stack jetable du runner.

La CLI utilise explicitement `--local`, aucune clé Supabase distante ni connexion Stripe n'est requise. Le mot de passe `postgres` du workflow appartient exclusivement à la base jetable du runner.

## Commandes locales

Contrôles sans base, sans dépendances npm supplémentaires :

```sh
node --check scripts/test-checkout-security-postgres.mjs
node --test scripts/test-checkout-security-runner.test.mjs
git diff --check
```

Sur une base **jetable** locale ayant déjà rejoué toutes les migrations du main pré-correctif :

```powershell
$env:TOK_SECURITY_710_DISPOSABLE = 'true'
$env:PGHOST = '127.0.0.1'
$env:PGPORT = '54322'
$env:PGUSER = 'postgres'
$env:PGPASSWORD = 'postgres'
$env:PGDATABASE = 'postgres'
node scripts/test-checkout-security-postgres.mjs
```

Une autre voie prend `TOK_SECURITY_710_CONTAINER=tok-security-710-<suffixe>` au lieu des paramètres PostgreSQL. Le runner impose alors un nom dédié et un conteneur sans réseau. Il ne crée, ne restaure et ne supprime aucune base implicitement. Les fixtures restent dans la base jetable à détruire ensuite ; ne jamais diriger ce test vers une base partagée, même locale.

## Critères de réussite

- Remises percentage/fixed/free_delivery calculées par la base malgré une valeur client démesurée ; paiement cash, sous-total nul et solde à payer nul couverts.
- Historique existant inchangé ; lecture de son propre historique conservée ; autre client masqué ; INSERT/UPDATE/DELETE directs refusés, y compris pour le compte applicatif administrateur.
- Propriétaire : accès à son menu non publié/non disponible et refus de modification d'un autre restaurant. Administrateur : lecture conservée.
- Public : uniquement les plats disponibles des restaurants publiables ; images manquantes/non vérifiées, nom non vérifié, inactivité, statut non actif, incohérence de ville et source exclue masqués.
- Compte démonstration : aucune visibilité sur les menus de production et aucune écriture ; création de commande de démonstration refusée même via le service interne.
- Rate limit inaccessible aux deux rôles clients et accessible au service interne.
- Rejeux simultanés : une utilisation, une transaction de fidélité, un seul débit de 20 points ; dernière utilisation de promotion : un seul gagnant.
- Migration réapplicable, aucune policy de démonstration altérée et seule la ligne de calcul ciblée change dans le RPC.

## Avant une application distante

La réconciliation en lecture seule ci-dessus doit être renouvelée au SHA effectivement déployé. Avant tout DDL, comparer `supabase_migrations.schema_migrations` avec les migrations Git et vérifier `pg_get_functiondef`, `pg_policies` et les privilèges des objets concernés. Toute migration distante absente de Git ou migration Git supposée appliquée mais manquante bloque l'application jusqu'à explication. Ne pas exécuter automatiquement `migration repair` pour effacer cet écart. Appliquer uniquement les deux nouvelles migrations de ce lot, dans leur ordre, avec le mécanisme qui enregistre leur version ; les autres migrations nouvelles du main doivent suivre leur propre gate et ordre de release.

Après replay vert et réconciliation, enregistrer la sauvegarde/restauration disponible et appliquer selon le processus de release du dépôt. En cas d'échec transactionnel, le patch se retire intégralement. Après application réussie, privilégier une migration corrective ; rouvrir l'écriture promotionnelle ou le RPC rate limit aux clients réintroduirait les failles et ne constitue pas un rollback acceptable par défaut.

Références : [tests CI Supabase](https://supabase.com/docs/guides/deployment/ci/testing), [historique et migrations Supabase](https://supabase.com/docs/guides/deployment/database-migrations).
