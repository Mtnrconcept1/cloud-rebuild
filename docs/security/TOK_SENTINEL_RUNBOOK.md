# TOK Sentinel — Runbook d'incident et déploiement (v1)
Date : 29 octobre 2026 — niveau de risque 3 (authentification, RLS, paiements).

## Objectif et limites

Sentinel est un **plan de contrôle de sécurité distinct de l'interface TOK** : analyse déterministe des échecs d'Edge Functions, preuves horodatées et référencées, dossier de réparation, notification Telegram à l'admin authentifié, approbation/refus et levée MFA AAL2. L'interface est prévue pour `https://sentinel.thetok.ch`, comme projet Vercel distinct. **Le domaine n'est pas publié** tant que Cloudflare/DNS est défaillant.

**Il ne s'agit pas d'un SOC indépendant ni d'une garantie d'absence d'intrusion.** La sonde actuelle ne couvre que les échecs audités par les Edge Functions : elle ne détecte pas à elle seule un secret volé, des lectures SQL directes, un compte Stripe compromis ou une attaque silencieuse. La conservation du journal Sentinel dans le même projet Supabase ne remplace pas un dépôt immuable hors bande.

## Matrice de déclenchement

| Type / niveau | Source | Déclenchement | Opération autorisée |
|---|---|---|---|
| Échecs d'accès sur >=2 fonctions, >=8 fois/10 min | Journaux Edge | Proposition haute | Validation Telegram, confinement administration |
| >=12 échecs de fonctions financières/10 min | Journaux Edge | Proposition haute | Validation Telegram, confinement nouveaux paiements |
| >=30 échecs sur >=3 comptes et >=3 fonctions | Journaux Edge | Proposition haute | Validation Telegram, confinement administration |
| Contournement RLS confirmé | Capteurs indépendants | **Critique confirmé** uniquement | Confinement global envisageable |
| Compromission de privilèges confirmée | Capteurs indépendants | **Critique confirmé** uniquement | Confinement global envisageable |
| Destruction de données confirmée | Capteurs indépendants | **Critique confirmé** uniquement | Confinement global envisageable |

Les trois premières règles n'affirment pas une intrusion et **ne peuvent jamais déclencher seules un arrêt total**. Pour l'arrêt automatique critique, `tok-sentinel-rules.ts` exige deux preuves fraîches (<3 min) provenant de capteurs distincts, dont un moniteur indépendant, ET les indicateurs d'armement et de capacité d'isolation. **L'intégration de ces témoins hors bande et le mécanisme d'arrêt global complet ne sont pas activés dans cette livraison.** Une règle heuristique ou un modèle IA ne peut jamais les remplacer.

## Gouvernance / décisions

- Le bot Telegram existant est réutilisé via `ops-incident-control` et le webhook secret existant. **Ne pas enregistrer un deuxième webhook Telegram.**
- Les boutons `snt:a:<jeton>` et `snt:r:<jeton>` portent un jeton aléatoire à usage unique (24 octets), vérifié sous SHA-256 côté SQL, lié au chat et à l'identifiant du message et expirant après 24 heures. L'identité Telegram (utilisateur et chat) est validée avant transmission serveur à serveur avec service_role. Rejeu, mauvais chat/message, jeton expiré : rejet.
- Seul le serveur peut inscrire un confinement dans les tables. Les scopes, catégories et cibles viennent du rapport enregistré, pas du callback. Les confinements globaux sont interdits en base pour les événements non critiques.
- La levée exige un JWT **administrateur humain**, assurance multifacteur **AAL2**, origine exacte `sentinel.thetok.ch` ou `admin.thetok.ch`, et saisie textuelle `LIBERER <incident_uuid>`; aucune levée automatique.
- Le fait qu'un bot Telegram soit autorisé ne garantit pas une indépendance de sécurité équivalente à une passkey matérielle : les cas globaux doivent en outre être revus manuellement avant armement.

## Défenses réelles et déploiement prudent

**PostgreSQL** : la migration introduit un journal d'incidents, les confinements, le suivi des décisions et des restrictions RLS additionnelles sur commandes, réservations, paiements, rôles, établissements et succursales. Les politiques existantes de propriété de lignes restent applicables. Quand la table des confinements est vide, ces restrictions n'enlèvent pas les autorisations normales.

**Edge Functions** : les nouveaux paiements `create-checkout`, les réservations **réellement nouvelles** `create-reservation` (après récupération idempotente) et l'ouverture Stripe Connect ont un garde de confinement. Le commutateur **`TOK_SENTINEL_ENFORCEMENT_ENABLED=true`** est volontairement absent par défaut : tant qu'il est désactivé, **la validation Telegram de mise en quarantaine est refusée (`409`) et le bouton d'approbation n'est pas présenté**; l'analyse et les rapports demeurent consultables. Ce commutateur doit être armé **uniquement après** migrations, tests d'intégration et vérification de tous les points de contrôle. Quand activé, le garde échoue fermé si la base n'est pas joignable. Les webhooks Stripe, rapprochements des paiements déjà encaissés, rejouements de réservations et finalisations d'opérations déjà payées ne sont pas interrompus par ce garde.

**Portée incomplète** : toutes les autres Edge Functions service_role, les accès directs à la base, les autres projets de l'organisation et le filtrage réseau ne sont pas encore protégés par les gardes applicatifs. **Un bouton de confinement global ne suffit donc pas à mettre toute TOK hors ligne ni à empêcher toute exfiltration.** Il faudra élargir les points de contrôle après tests, puis configurer WAF/accès réseau avec Cloudflare rétabli.

**Scans** : la tâche existante `ops-incident-native-scan` exécute la nouvelle corrélation en plus du scanner historique. Un échec du scanner Sentinel est journalisé séparément et ne doit pas casser le scanner existant. La sonde limite sa fenêtre à 10 minutes et ses lectures à 500 échecs récents; le résultat indique les données potentiellement tronquées.

**Preuves** : conserver uniquement des UUID d'événements, nombres, empreintes SHA-256 de corrélation, noms de fonctions filtrés, horodatages et plans; ne pas envoyer d'IP, e-mail, secret, nom de client ou contenu métier dans Telegram. Les événements originaux restent dans `edge_function_audit_logs`. Les nouvelles tables de preuves sont **sans droit SELECT direct** pour `anon` et `authenticated` : consultation uniquement depuis l'Edge Function contrôlant admin + MFA AAL2. Le journal `tok_sentinel_events` est append-only (UPDATE/DELETE interdits, même avec `service_role`) ; il ne remplace toutefois pas un archivage WORM chiffré hors du projet.

## Installation par étapes — ne pas effectuer directement sur production

1. Revoir cette PR, les migrations et les avertissements RLS. Le diagnostic Supabase du 29.10.2026 mentionne **41 exécutables SECURITY DEFINER accessibles à anon** et **293 à authenticated** : ce sont des points d'audit, pas des exploits prouvés. Contrôler leurs `GRANT`, permissions et `search_path` individuellement.
2. Environnement de staging séparé : appliquer la migration, vérifier le bon fonctionnement des flux **commande, paiement, webhook, réservation et comptabilité** avec les trois scopes. Tester faux positif, jeton expiré, replay, mauvais chat, fail-closed du garde, AAL2, rollback et maintien de la réconciliation Stripe.
3. Déployer `ops-sentinel-control` en Edge Function avec `verify_jwt=false` **uniquement** car chaque action valide explicitement le JWT ou l'identité serveur. Redéployer ensuite `ops-incident-control` (router de callbacks) et `ops-incident-native-scan` (sonde). Aucune clé service_role côté navigateur.
4. Le projet Vercel distinct **`tok-sentinel-console`** (ID `prj_MlhTjRL0Vi6wEeP71kTm1F5YZCYH`) a été créé et relié au dépôt, avec Root Directory `sentinel-console`, `pnpm run build`, sortie `dist`, Node 22 et variables publiques `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` configurées. Aucun `SUPABASE_SERVICE_ROLE_KEY` n'est nécessaire côté console. Son domaine de projet vérifié est `https://tok-sentinel-console.vercel.app` ; il offre un accès de secours après déploiement réussi, avec la même authentification admin+AAL2 que le domaine final. Contrôler le build, la CSP et `noindex` après publication.
5. Conserver le webhook Telegram existant, configurer en secret côté Supabase `TELEGRAM_BOT_TOKEN`, `TELEGRAM_ADMIN_CHAT_ID`, `TELEGRAM_ADMIN_USER_ID` (indispensable en groupe) et `TELEGRAM_WEBHOOK_SECRET`. Vérifier le message, le bouton refus, l'approbation, la lecture du rapport, puis la levée AAL2 avec comptes d'essai.
6. Attendre le rétablissement Cloudflare/DNS pour **lier `sentinel.thetok.ch` au projet Vercel dédié**. Interdire l'exposition publique de l'interface tant que la MFA n'a pas été testée.
7. Activer `TOK_SENTINEL_ENFORCEMENT_ENABLED=true` côté **Edge Functions uniquement** après migration, tests et validation du plan de reprise. Garder l'arrêt global automatique désarmé jusqu'aux deux vrais témoins hors bande et à la couverture complète des entrées réseau, y compris les sous-domaines d'API.
8. Faire des exercices trimestriels en staging (tentatives d'accès inter-restaurant, abuse financial simulé, perte de DB, indisponibilité Telegram), réévaluer les seuils selon les volumes réels et faire relire les scénarios critiques.

## Plan de réaction et de réparation

**0–15 minutes :** assurer la continuité de la collecte, identifier les preuves et le périmètre réel, isoler ciblé si validé, préserver les journaux, capturer l'état des paiements et conserver une chronologie. En cas d'attaque active prouvée, privilégier la sécurité à la disponibilité, sans interrompre silencieusement les transactions déjà payées.

**15–60 minutes :** analyser la cause (identité, token, RLS, API, déploiement, vulnérabilité, dépendance), comparer plusieurs sources indépendantes, révoquer les sessions/identifiants compromis, séparer les ressources touchées et auditer les changements de rôles.

**Dans la journée :** construire un correctif en branche dédiée et PR, écrire des tests reproduisant la faille, vérifier la non-régression multi-tenant, établir l'exposition éventuelle des données et solliciter l'analyse juridique des obligations de notification (LPD suisse / RGPD selon le cas).

**Rétablissement :** approbation AAL2 après vérification de l'intégrité, tests réservations/Stripe et autorisations; lever progressivement le confinement, suivre les erreurs, réconcilier les paiements et conserver les preuves. Si la console est compromise, l'équipe de sécurité doit utiliser une procédure de secours **hors projet** avec clés matérielles et identités séparées.

## Rollback

L'option `TOK_SENTINEL_ENFORCEMENT_ENABLED=false` désarme **uniquement les gardes Edge facultatifs**; elle ne désactive pas les politiques RLS. Si un confinement est actif, utiliser d'abord la levée authentifiée depuis la console AAL2, puis vérifier les journaux. Les migrations historiques ne doivent jamais être effacées; si un retrait de policy est nécessaire, créer une migration corrective revue séparément. Aucune donnée métier n'est supprimée par Sentinel.

## Étapes manquantes connues

- Domaines et WAF Cloudflare : bloqués par le connecteur/délégation DNS.
- Aucun arrêt global automatique opérationnel sans témoin indépendant et périmètre d'isolation éprouvé.
- Notifications hors Telegram, stockage WORM hors Supabase, rotation automatique des secrets, protection des autres Edge service_role et scans dynamiques en staging : à compléter.
- Le lancement de scans offensifs sur la production et les changements de privilèges réels sont exclus sans fenêtre d'intervention, autorisations et plan de retour arrière.
