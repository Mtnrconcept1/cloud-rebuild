# Centre d’opérations marketing TheTOK

Le centre d’opérations marketing est une surface d’administration isolée du chrome client, accessible à l’URL canonique `https://marketing.thetok.ch/marketing`. Il n’utilise ni la session SSO JavaScript ni le `AuthProvider` de l’application publique. Une passerelle serveur same-origin exige un compte `admin`, un MFA TOTP récent et une session opaque de quatre heures stockée dans un cookie `Secure`, `HttpOnly`, `SameSite=Strict` et host-only. Le feature flag `admin-marketing-operations`, la pause globale et les droits PostgreSQL sont contrôlés côté serveur ; le nom d’hôte seul n’est jamais une autorisation.

## État fonctionnel exact

| Bloc | Opérationnel maintenant | Après API | Prérequis prod |
|---|---|---|---|
| Accès | Workspace dédié, login admin, MFA TOTP, session BFF opaque host-only, feature flag serveur, redirection du host vers `/marketing`, en-têtes `noindex`/`no-store`, absence du menu et du panier client | Aucun connecteur requis | Domaine Vercel, DNS/TLS et enrôlement TOTP du premier administrateur |
| Campagnes | Création en brouillon, estimation serveur de l’audience, approbation de la campagne, création et approbation séparée des éléments calendrier, annulation | Créatifs ou variantes produits par un service externe, si un tel service est ajouté plus tard | Migration appliquée, contacts synchronisés et pause globale conservée pendant la recette |
| Calendrier | Grille mensuelle et agenda filtré, horaires `Europe/Zurich`, programmation, statut, note de publication manuelle et journalisation | Publication directe sur les réseaux ou le site après adaptateur dédié | Scheduler prêt pour les canaux exécutables ; opérateur désigné pour les publications manuelles |
| Audiences | Synchronisation bornée et reprenable du catalogue et des consentements, recherche/pagination serveur, qualification manuelle d’un restaurant avec e-mail/téléphone, base légale et preuve datée immuable, opposition immédiate, filtres autorisés, comptage total/éligible par canal, cibles masquées | Enrichissement externe autorisé et traçable, après intégration dédiée | Vérifier provenance, base légale, consentement, oppositions et qualité des données avant tout envoi |
| Exécution | Notifications `in_app` consenties ; matérialisation de tâches `manual_call` et `manual_email` ; révélation ponctuelle motivée puis clôture humaine avec note ; cron calendrier | Email, push, visites et réseaux sociaux uniquement après données/adaptateur réellement disponibles et testés | Vault, Edge Functions, `pg_cron`, `pg_net`, pause globale, approbations, limites et test interne |
| Journal et résultats | Statuts des éléments et livraisons, destinataire masqué, canal, fournisseur, tentatives, dates, erreurs, événements et agrégats envoyés/livrés/cliqués/convertis | Accusés réels et conversions fournisseur après webhooks/adaptateurs | Définir les identifiants de conversion et valider la qualité des événements ; les KPI actuels ne constituent pas une attribution marketing complète |
| Automatisations | Le planificateur calendrier est la seule automatisation exécutable. Une règle personnalisée peut être décrite et enregistrée en pause | Moteur de règles à concevoir puis brancher ; aucun moteur n’est fourni par cette livraison | Revue métier, juridique et technique avant toute future activation |
| Prospection & backlinks | Cibles allowlistées, opportunités contextualisées, brouillons relus, résultats et preuves de liens enregistrés | Adaptateur officiel/API et publication assistée uniquement après revue dédiée | Contrôle robots/conditions, pertinence, quotas, base légale si contact, preuve publique et approbation humaine |

## Ce que l’outil ne fait pas

Cette livraison n’implémente pas :

- de modèle ML, de scoring prédictif ou d’optimisation automatique des canaux ;
- de `dry-run` de campagne ;
- de circuit breaker automatique ni de mise en pause fondée sur un seuil d’erreurs ;
- de moteur d’automatisations personnalisées ;
- de génération automatique de contenu ;
- d’adaptateur Resend, Firebase, Meta, TikTok, LinkedIn, YouTube, Telegram, Google Business ou site web ;
- d’achat média, de canal payant ou de promesse de coût fournisseur nul ;
- d’envoi automatisé de prospection froide ;
- de publication aveugle sur des forums, annuaires ou réseaux ;
- d’achat de liens, de schémas de liens ou de promesse de backlink.

La vue **Prospection & backlinks** est volontairement assistée : l’administrateur ajoute une cible publique, confirme robots.txt et les conditions, documente une opportunité pertinente, prépare un brouillon puis l’approuve avec un motif. L’application ne fait aucun scraping derrière authentification, aucun appel arbitraire vers une URL et aucune publication tant qu’un adaptateur officiel n’est pas configuré. Les backlinks sont enregistrés comme résultats observés ; les attributs rel="sponsored", nofollow ou ugc restent disponibles pour les contributions concernées.

La recommandation affichée dans le wizard de campagne est **déterministe et sans ML** : elle part du type d’audience et ne retient que les canaux dont l’état backend est `available` ou `manual`. L’opérateur garde la décision finale. Même si une ligne d’intégration externe était marquée `connected` prématurément, l’orchestrateur bloque le canal tant que son adaptateur n’est pas déployé.

## Canaux réellement disponibles

| Canal | État initial | Traitement actuel |
|---|---|---|
| `in_app` | `connected` | Envoi automatique possible vers un utilisateur éligible via le pipeline de notifications TheTOK |
| `manual_call`, `manual_email` | `manual` | Création d’une tâche par contact ; la cible brute n’est retournée qu’après motif, revalidation serveur et audit, puis la personne clôt la tâche avec une note obligatoire |
| `manual_visit` | `blocked_configuration` | Aucune tâche ni révélation : une adresse structurée et vérifiée doit d’abord être ajoutée au modèle de données |
| `tok_news` | `manual` | Publication éditoriale effectuée hors de l’orchestrateur, puis marquée publiée ou en échec dans le calendrier |
| Email Resend, push Firebase | `blocked_configuration` | Aucun envoi ; adaptateur, configuration fournisseur et retours réels absents |
| Instagram, Facebook, TikTok, LinkedIn, YouTube, Telegram, Google Business, site | `disconnected` | Aucun appel API et aucun départ. La clôture manuelle ne devient possible qu’après passage explicite de l’intégration à `manual` côté backend |

Les canaux publics ne créent aucune livraison individuelle. Les canaux directs vérifient la base légale, le consentement ou la relation existante selon le canal, les préférences utilisateur et les suppressions avant matérialisation.

## Parcours opérateur

1. **Synchroniser les sources** depuis l’écran Audiences. Le traitement avance par lots (500 prospects au plus, 250 consentements au plus côté serveur), conserve ses curseurs et peut être relancé pour reprendre. Le curseur consentement est chiffré et lié à l’administrateur : aucun `user_id` source n’est renvoyé au navigateur. Une action navigateur s’arrête après vingt lots par source. Le retour ne contient que des compteurs et des jetons de reprise opaques, jamais les coordonnées brutes.
2. **Qualifier un restaurant** en saisissant au moins un e-mail ou téléphone, sa ville/canton, une base légale positive, la source de preuve, sa date et une justification. Un intérêt légitime sans téléphone est refusé ; un contact opposé ne peut pas être réactivé par ce flux.
3. **Créer une campagne** avec une audience effective, un message, une date et un ou plusieurs canaux disponibles ou manuels. Un filtre vide est refusé.
4. **Contrôler l’estimation** serveur. Un canal individuel sans contact éligible ne peut pas produire son brouillon ; un canal public peut avoir une audience individuelle égale à zéro.
5. **Approuver la campagne** avec une justification, puis approuver et programmer chaque élément calendrier séparément.
6. **Exécuter** par le cron ou le bouton de traitement des éléments dus, uniquement après levée explicite de la pause globale. Pour une tâche d’appel/e-mail, indiquer un motif : le serveur revalide la pause, la plage 08:00–20:00 en Suisse, la révision approuvée, la base légale et l’opposition avant de retourner ponctuellement la cible dans une réponse `no-store`. La valeur n’entre jamais dans le snapshot ni dans l’audit.
7. **Suivre** les statuts, erreurs et résultats dans Journal et Résultats. Une nouvelle tentative n’est possible que si le parent reste approuvé, le contact reste éligible et la limite de tentatives n’est pas atteinte.
8. **Traiter la prospection assistée** depuis Prospection & backlinks : autoriser une cible après contrôles, saisir une opportunité publique, soumettre un brouillon, l’approuver, puis consigner manuellement la publication et la preuve du backlink. Aucune étape ne déclenche un post externe.

## Garde-fous présents

- `global_pause = true` au déploiement initial ; sa levée exige un motif et un scheduler confirmé prêt.
- Double validation : campagne puis élément calendrier.
- Feature flag agissant comme kill-switch supplémentaire.
- Ciblage vide ou clé de filtre inconnue refusés côté base.
- Consentement, préférences, opposition et base légale vérifiés côté base, pas seulement dans l’interface.
- Fenêtre individuelle en heure suisse, avec claims arrêtés avant 20 h ; les canaux publics restent manuels dans l’implémentation actuelle.
- Plafond journalier par défaut de 500 livraisons et pression de contact par défaut de 72 heures.
- Leases, idempotence, verrouillage `SKIP LOCKED`, nombre maximal de tentatives et backoff pour les échecs rejouables.
- Aucun accès marketing direct accordé à `authenticated` : les opérations interactives (24 opérations du centre et 7 opérations de prospection assistée) passent par des dispatchers `service_role` à liste blanche, qui revalident la session opaque, le CSRF, le rôle admin et le feature flag dans la même transaction. Les fonctions worker/provider restent séparées, RLS est activée et les mutations sont auditées avec l’identité de l’administrateur BFF.
- Cibles masquées et fingerprints non réversibles dans les vues admin ; seule la révélation ponctuelle d’une tâche `manual_call`/`manual_email` peut retourner une coordonnée brute, sans cache, après contrôles et audit du motif. Aucun secret fournisseur dans le navigateur.
- Recherche et pagination des contacts/livraisons exécutées côté serveur avec total exact ; les champs de recherche n’incluent jamais e-mail, téléphone ni cible brute.
- Chaque octroi, changement, réaffirmation, révocation ou opposition de base légale crée une preuve typée dans `marketing_lawful_basis_evidence`. Cette table est append-only, sans droit direct navigateur/service-role, et son audit ne reprend ni note ni source potentiellement sensibles.
- Les désinscriptions et plaintes reçues par événement fournisseur suppriment le contact et annulent ses livraisons encore en attente.

Ces garde-fous ne constituent pas un circuit breaker : la détection d’un incident et l’activation de la pause restent des actions opérateur.

## Runbook Vault et secrets Edge

Générer des secrets aléatoires longs dans un gestionnaire approuvé. Ne jamais les placer dans une migration, une variable `VITE_*`, un ticket, un log ou une commande conservée dans l’historique shell.

| Nom | Stockage | Consommateur | Exigence |
|---|---|---|---|
| `marketing_bff_encryption_secret` | Supabase Vault SQL | RPC de session marketing | Secret aléatoire d’au moins 32 octets ; chiffre les access/refresh tokens du challenge MFA pendant dix minutes au maximum |
| `marketing_edge_url` | Supabase Vault SQL | `invoke_marketing_orchestrator_cron()` | URL exacte `https://<project-ref>.supabase.co/functions/v1/marketing-orchestrator` du même environnement |
| `internal_cron_secret` | Supabase Vault SQL | Wrapper `pg_cron` et vérificateur service-role | Secret aléatoire déjà utilisé par l’infrastructure cron ; jamais copié dans `cron.job.command` |
| `INTERNAL_CRON_SECRET` | Supabase Edge Function Secrets | Authentification rapide de `marketing-orchestrator` | Optionnel si le vérificateur service-role Vault est disponible ; si défini, même valeur que `internal_cron_secret`, jamais exposée au frontend |
| `MARKETING_WEBHOOK_SECRET` | Supabase Edge Function Secrets | HMAC de `marketing-provider-webhook` | Requis avant d’exposer ou tester le webhook ; valeur dédiée, différente du secret cron |
| `SUPABASE_SERVICE_ROLE_KEY` | Vercel runtime uniquement | BFF `/api/marketing/*` | Secret serveur existant ; interdit dans les variables `VITE_*` et dans le bundle navigateur |
| `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY` | Vercel runtime | BFF Auth/PostgREST | URL du projet de production et clé publique correspondante |

Ordre recommandé :

1. Créer `marketing_bff_encryption_secret` et `marketing_edge_url` dans Vault, puis vérifier que `internal_cron_secret` existe déjà sans jamais afficher leur valeur.
2. Définir éventuellement la même valeur sous `INTERNAL_CRON_SECRET` dans les secrets Edge. Le fallback service-role compare aussi le secret présenté à Vault sans le faire sortir de PostgreSQL.
3. Ne définir `MARKETING_WEBHOOK_SECRET` qu’au moment de brancher un adaptateur fournisseur réel ; le webhook échoue fermé tant qu’il manque.
4. Déployer les Edge Functions, puis appliquer la migration. Le bloc scheduler n’installe le job que si `pg_cron`, `pg_net`, Vault, l’URL et le secret cron sont prêts.
5. Si la migration a été appliquée avant les entrées Vault, rejouer uniquement le bloc idempotent d’installation du scheduler dans une release revue ; ne jamais créer une commande cron contenant une URL ou un secret littéral.
6. Vérifier `public.marketing_scheduler_ready() = true`, le job actif `tok-marketing-orchestrator` et la pause globale toujours active.

Le webhook générique attend `x-marketing-timestamp`, `x-marketing-signature` et une signature HMAC-SHA256 de `timestamp.body`, avec une tolérance de cinq minutes. Il ne remplace pas les adaptateurs ni les signatures officielles propres à chaque fournisseur.

## Sous-domaine Vercel et DNS

Le workflow de production rattache `marketing.thetok.ch` au projet Vercel TheTOK exact après le déploiement, sans option de réaffectation forcée. Il vérifie l’équipe, le projet, la propriété du domaine, la configuration DNS/TLS, la réponse `200` de l’interface, `noindex`, `no-store` et le refus `401` de l’API sans session. Toute divergence bloque le gate de déploiement.

Les callbacks PKCE publics restent sur `www.thetok.ch`, mais le centre marketing ne les consomme pas : son login email/mot de passe et son TOTP sont traités côté BFF. Les routes `/api/marketing/*` refusent tout autre host et toute mutation dont `Origin`/Fetch Metadata ne prouvent pas le same-origin.

Commandes de contrôle après propagation :

```bash
curl -I https://marketing.thetok.ch/
curl -I https://marketing.thetok.ch/marketing
```

## Session privilégiée implémentée

1. `GET /api/marketing/session` émet uniquement un jeton CSRF host-only lorsque le navigateur est anonyme.
2. `POST /api/marketing/login` authentifie côté serveur, relit le rôle `admin` dans `user_roles` et exige un facteur TOTP. Les réponses restent génériques et les essais sont limités par IP et par compte.
3. Pendant le challenge MFA, les jetons Supabase sont chiffrés en base avec `marketing_bff_encryption_secret`, indexés par le hash d’un cookie pending opaque et supprimés au plus tard après dix minutes.
4. Après un TOTP `aal2` frais, le BFF invalide sa session Supabase locale et crée une session marketing opaque de quatre heures. Le navigateur reçoit `__Host-tok_marketing_sid` en `HttpOnly` et un jeton CSRF séparé ; aucun access token, refresh token, factor ID, challenge ID ou clé service-role n’est exposé.
5. Chaque lecture ou mutation revalide le hash de session, le CSRF pour les mutations, le rôle admin et le feature flag. Le logout révoque la session en base avant d’effacer les cookies.
6. Les RPC interactives du centre et les 7 opérations d’outreach sont les seules opérations acceptées par leurs dispatchers dédiés. Un bearer admin Supabase générique ne possède aucun droit direct sur les tables/RPC marketing et l’Edge orchestrateur refuse explicitement les JWT utilisateur.

Le stockage SSO historique des autres surfaces TheTOK n’est donc jamais monté ni consulté par l’application marketing ; le vol d’un bearer générique sur un domaine frère ne suffit pas à appeler ce backend privilégié.

## Tests et recette

Tests ciblés à exécuter :

```bash
pnpm vitest run \
  src/test/marketing-bff-client.test.ts \
  src/test/marketing-bff-security.test.ts \
  src/test/marketing-domain-isolation.test.ts \
  src/test/marketing-subdomain-integration.test.ts \
  src/test/marketing-sql-governance.test.ts \
  src/test/marketing-consent-dispatch.test.ts \
  src/test/marketing-orchestrator-schema.test.ts \
  src/test/marketing-edge-security.test.ts \
  src/test/marketing-operations-frontend.test.ts \
  src/test/marketing-zurich-time.test.ts \
  src/test/supabase-cors.test.ts \
  src/test/vercel-rewrites.test.ts \
  src/test/feature-flags.test.ts \
  src/test/marketing-outreach-schema.test.ts
pnpm lint
pnpm run build:prod
```

Recette de staging minimale :

1. Vérifier redirection, en-têtes, CORS exact et nettoyage de `code`, `state` et fragments de jetons.
2. Vérifier le refus d’un anonyme et d’un non-admin, l’enrôlement TOTP d’un admin, le challenge suivant, l’expiration à quatre heures et la révocation au logout.
3. Vérifier que le flag coupé et la pause globale empêchent tout nouveau traitement.
4. Vérifier qu’un ciblage vide, un contact sans base légale et un contact opposé ne produisent aucune livraison.
5. Approuver une campagne interne et un élément `in_app` à très faible volume, puis confirmer la livraison dans le pipeline TheTOK.
6. Qualifier un restaurant avec chaque base légale autorisée, vérifier les refus sans preuve/coordonnée et l’impossibilité de réactiver une opposition ; révéler puis clôturer une tâche humaine avec note ; créer et clôturer une publication manuelle avec note.
7. Confirmer que tous les canaux externes restent bloqués et qu’aucun appel fournisseur ne part.
8. Tester le webhook avec signature valide, signature invalide, timestamp expiré et identifiant d’événement dupliqué.

Il n’existe pas de mode `dry-run` : utiliser exclusivement une audience interne consentie et un volume minimal pendant la recette.

## Incident et arrêt

Activer immédiatement la pause globale en cas de doublon suspect, consentement ambigu, secret exposé ou erreur répétée. La pause empêche les **nouveaux claims** ; une opération déjà réclamée peut terminer, il faut donc contrôler le journal après l’arrêt. Le feature flag peut ensuite être coupé si la surface entière doit être neutralisée.

En cas de secret exposé, tourner la valeur Vault concernée et, si elle existe, sa copie Edge, révoquer les sessions marketing actives, redéployer la fonction concernée et vérifier qu’aucune commande `pg_cron` ne contient de secret. La reprise se fait manuellement, à faible volume, après vérification des éléments parents et des contacts éligibles.
