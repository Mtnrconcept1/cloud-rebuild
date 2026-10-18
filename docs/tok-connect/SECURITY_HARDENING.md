# TOK Connect — sécurisation et mise en service

Ce document accompagne la correction des constats TOK-01 à TOK-09 de l’audit du
18 octobre 2026. Il décrit le contrat cible et sa recette. La présence des fichiers
dans Git ne prouve ni leur déploiement ni la révocation des anciennes connexions.

## Corrections et preuves attendues

| Constat | Correction | Vérification |
|---|---|---|
| TOK-01 : délégation trop large | Broker à jetons opaques ; grant utilisateur/client/permissions/restaurants ; opérations nommées ; permis serveur ; garde natif Edge, PostgREST, Storage et Realtime | Tests broker et délégation ; fixture OAuth PostgreSQL ; recette d’un client à droits restreints |
| TOK-02 : destinations webhook | Validation des URL et de toutes les adresses DNS ; connexion à l’IP validée ; certificat TLS vérifié pour le nom original ; redirections refusées ; lecture bornée | Tests du transport ; vrai handshake TLS Deno ; fixtures sans accès au réseau interne |
| TOK-03 : dispatcher et doublons | Identité service/scheduler obligatoire ; claim atomique limité à cinq livraisons ; bail de 60 secondes ; finalisation liée au claim ; cinq tentatives au maximum | Refus avant lecture de queue ; huit connexions PostgreSQL ; expiration, reprise, ancien accusé et dernière tentative |
| TOK-04 : coût IA avant débit | Réservation dans le registre financier natif avant appel fournisseur ; intention persistée ; finalisation ou libération idempotente ; réconciliation des résultats incertains | Vrais déclencheurs financiers ; douze demandes concurrentes ; crédits hebdomadaires, cadeaux et droits internes ; pannes simulées du fournisseur et du stockage |
| TOK-05 : message widget | Canal de prévisualisation supprimé du HTML de production ; aperçu lié à la fenêtre parent, son origine et un identifiant de canal | Exécution du HTML réel en DOM isolé ; messages de mauvaise origine, fenêtre et canal refusés |
| TOK-06 : audit incomplet | Identité, route et scopes conservés lors des refus ; erreur SQL d’audit signalée ; échec commercial conservé en HTTP et lors d’un rejeu | Tests des handlers réels et de l’écriture d’audit |
| TOK-07 : ancien code OAuth | Flux interactif historique retiré ; `GET` renvoie 410, seul `client_credentials` demeure | Tests du refus des anciens échanges et du flux B2B Basic |
| TOK-08 : révocation | Liste des grants effectifs ; révocation TOK puis révocation Supabase ; succès partiel explicite | Tests interface/API et invalidation d’un permis encore vivant |
| TOK-09 : Autopilot | Grant restaurant `autopilot:plan` exigé sur création et lecture | Refus avant toute lecture métier sur les deux chemins |
| Robustesse | Réponses fournisseur et mémoire bornées ; audit des dépendances indisponible bloquant | Tests des flux et du script CI |

## Contrat OAuth public

| Élément | Valeur |
|---|---|
| Resource server | `https://www.thetok.ch/mcp` |
| Issuer | `https://www.thetok.ch/oauth` |
| Métadonnées RFC 8414 | `https://www.thetok.ch/.well-known/oauth-authorization-server/oauth` |
| Alias de découverte | `https://www.thetok.ch/oauth/.well-known/oauth-authorization-server` |
| Autorisation | `https://www.thetok.ch/oauth/authorize` |
| Token | `https://www.thetok.ch/oauth/token` |
| Enregistrement | `https://www.thetok.ch/oauth/register` |
| Scope externe | `tok` |
| Client externe | Public, méthode d’authentification `none` |
| Code | URI exacte enregistrée, PKCE `S256`, état client obligatoire |

Le broker crée chez Supabase un client confidentiel et conserve son secret côté
serveur. Le client externe ne reçoit ni ce secret ni les jetons natifs Supabase.
Les access tokens opaques TOK expirent en cinq minutes au maximum. Les secrets
natifs sont chiffrés en AES-256-GCM avec un IV aléatoire, une version d’enveloppe et
une donnée associée propre au client ou à la session. Les jetons opaques sont
stockés sous forme de hash.

La rotation du refresh token utilise un claim atomique et un historique des
hashes consommés lié à la session et au client. Un rejeu révoque la famille,
y compris si une rotation est en cours. Un autre client ne peut pas utiliser
ce mécanisme pour révoquer une famille qui ne lui appartient pas. **Les clients
doivent sérialiser leurs renouvellements.** La session de refresh expire 90 jours après sa création ; une rotation ne prolonge pas cette échéance, indépendamment du renouvellement éventuel du grant. Un résultat fournisseur incertain ne
permet pas de réutiliser son ancien refresh token.

Le scope `tok` désigne l’accès au broker. Les vingt permissions métier distinctes
sont sélectionnées au consentement ; seules les lectures publiques sont
précochées. Les grants sont liés à l’utilisateur et au client, versionnés,
révocables et expirent après 90 jours. Les restaurants sélectionnés sont vérifiés
au moment du consentement puis à l’exécution, avec les contrôles métier natifs.

### Frontières natives

Les JWT d’applications OAuth possèdent un `client_id`. Les sessions TOK natives
sans ce champ conservent leur contrôle d’accès habituel. Un JWT OAuth brut ne
permet plus d’utiliser les modes génériques `edge`, `rpc` et `data` du bridge.
Le MCP résout seulement ses jetons opaques et le flux partenaire B2B existant.

Pour une opération nommée autorisée, le serveur peut transmettre l’identité native
avec un permis de 120 secondes lié au hash du jeton, à l’utilisateur, au client,
à la session, à la révision du grant, à la méthode et au chemin. Les permis Edge
sont aussi liés au hash du corps de requête. Les permis PostgREST sont liés à la
méthode et au chemin ; ils ne sont pas annoncés comme des autorisations à usage
unique ou comme une signature du corps. Ils restent secrets côté serveur et
n’annulent pas les règles RLS existantes.

La migration ajoute une politique restrictive aux tables RLS de `public`, à
`storage.objects` et à `realtime.messages`. Le hook PostgREST compose le garde
OAuth avec `public.enforce_launch_gate`. Il conserve les autres contrôles de
lancement. Un hook préalable inconnu bloque la migration pour éviter d’en
supprimer silencieusement le comportement. Le réglage est posé pour le rôle
`authenticator` dans la base courante, y compris lorsqu’un ancien réglage existe
déjà à cette portée.

Les tables RLS ajoutées à l’avenir devront aussi adopter le garde OAuth lorsque
nécessaire. La migration présente ne crée pas de déclencheur DDL global.

### Anciennes connexions

Fermer le DCR public **natif Supabase**, tout en conservant le fournisseur OAuth
nécessaire au broker. Utiliser le DCR du broker pour les nouveaux clients. Révoquer
les autorisations et sessions des anciens clients via les API Auth supportées, puis désactiver ou retirer leurs enregistrements clients natifs. Vérifier qu’un code déjà approuvé ne peut plus produire de nouveau jeton. Ne pas supprimer manuellement les tables internes d’Auth.

La révocation des sessions doit être complétée par la prise en compte de la durée
de vie restante des anciens JWT déjà émis. Confirmer sur l’API Auth effective leur
refus ou attendre leur expiration maximale avant d’affirmer que cette exposition
est fermée. Le garde RLS protège les accès de données concernés ; il ne remplace
pas le retrait de ces anciens jetons auprès d’Auth.

La page de consentement n’accorde des droits qu’aux clients enregistrés par le
broker. Un consentement automatique natif renvoyant seulement un `redirect_url`
ne permet pas d’identifier sûrement le client : la page bloque cette continuation
et demande une révocation puis une reconnexion. Elle ne transmet pas le code.

## Préflight avant changement de production

1. Identifier le commit exact à livrer et vérifier les jobs de cette révision :
   tests unitaires/comportementaux, lint, types, build, PostgreSQL 17 et Deno.
2. Vérifier les colonnes d’`auth.oauth_authorizations` utilisées par le contrôle
   S256 : `client_id`, `redirect_uri`, `code_challenge`,
   `code_challenge_method`, `authorization_code`, `status`, `expires_at` et
   `response_type`. La vérification serveur échoue si ce contrat est absent.
3. Inventorier `pgrst.db_pre_request` dans `pg_db_role_setting`, en conservant
   `setdatabase` et le rôle. Le garde connu est `public.enforce_launch_gate`.
4. Préparer `TOK_CONNECT_BROKER_ENCRYPTION_KEY` dans le gestionnaire de secrets
   serveur, sans encore l’injecter dans l’environnement actif du broker : 32 octets aléatoires encodés en 64 caractères hexadécimaux. Aucun
   fallback sur une clé Supabase n’existe. Ne jamais mettre la valeur dans Git,
   le frontend, la PR ou les journaux.
5. Vérifier les valeurs serveur `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` et
   `SUPABASE_ANON_KEY`, la Site URL `https://www.thetok.ch` et le chemin
   `/oauth/consent`. Ces contrôles ne nécessitent pas de publier leurs valeurs.
6. Préparer la fermeture du DCR natif, la révocation des anciens clients et la
   reconnexion. Vérifier la callback exacte fournie par chaque hôte, sans wildcard.
7. Vérifier l’identité scheduler existante, le secret Vault `internal_cron_secret`
   et le job `tok-connect-webhook-dispatcher`. Ne pas substituer un JWT utilisateur.

## Ordre de livraison

Passer par le pipeline de production du dépôt, après les validations et la revue
du commit. Les changements de base, Edge et frontend forment une même livraison.

Le broker ne possède pas de flag d’ouverture supplémentaire. **Garder
`TOK_CONNECT_BROKER_ENCRYPTION_KEY` absente de son environnement actif jusqu’à la
fin du retrait des anciens clients.** Les routes d’inscription, d’autorisation et
de token renvoient alors 503, y compris via l’URL Edge directe ; la découverte
peut rester disponible. Une restriction de la seule route Vercel ne ferme pas
cette entrée directe.

1. Appliquer les migrations dans leur ordre :
   - `20261018140000_tok_connect_webhook_dispatch_security.sql` ;
   - `20261018141000_ai_image_credit_reservations.sql` ;
   - `20261018142000_tok_connect_oauth_delegation.sql`.
2. Déployer les fonctions impactées et leurs imports partagés, notamment le
   broker, les quatre serveurs/gateways MCP, le bridge applicatif, le bridge
   commercial, l’OAuth B2B, le dispatcher, `ai-image-enhance` et les deux trackers.
   Le helper d’authentification partagé protège également ses autres appelants ;
   ils doivent être rebundlés par le pipeline.
3. Déployer ensemble le frontend de consentement/révocation, les rewrites Vercel,
   les métadonnées statiques et le manifeste du plugin. Les routes du broker
   précèdent le fallback SPA et imposent `no-store`.
4. Achever la transition des anciens clients et vérifier l’invalidité de leurs
   codes et jetons. Injecter ensuite la clé préparée dans l’environnement du
   broker pour ouvrir ses routes. Reconnecter par le nouvel issuer, puis rafraîchir
   le catalogue d’outils dans l’hôte.
5. Exécuter la recette ci-dessous et conserver les résultats observés avec le
   commit et les versions déployées. Une ancienne CI ou un ancien smoke ne vaut
   pas validation de cette révision.

## Recette reproductible

Le workflow `.github/workflows/tok-connect-security.yml` crée trois bases
PostgreSQL 17 jetables. Il ne requiert aucun secret applicatif et ne contacte aucun
fournisseur payant. Les runners refusent les hôtes distants et les bases qui ne
portent pas le nom ou le préfixe de test prévu.

| Test | Entrée |
|---|---|
| OAuth : grants, rôles natifs, API de données, permis et révocation | `scripts/security/tok-connect-oauth-isolation.sql` |
| Webhooks : contrats réels, claims et huit connexions indépendantes | `scripts/security/test-webhook-dispatch-postgres.mjs` |
| IA : déclencheurs financiers réels et deux vagues de douze connexions | `scripts/security/test-ai-image-credit-postgres.mjs` |
| Connexion native TLS avec certificat local jetable | `scripts/security/run-webhook-deno-runtime.mjs` |

Le test Deno s’exécute sur les versions 2.1.4 et 2.9.6. Il vérifie une connexion
valide, le refus d’un mauvais nom de domaine et le refus d’une autorité inconnue.
Les clés de certificats synthétiques sont créées dans un dossier temporaire puis
supprimées. Aucune option de contournement TLS n’est employée.

Une exécution PGlite locale peut vérifier le DDL, les politiques et les transitions
sur données synthétiques. Elle ne valide pas la concurrence de plusieurs
connexions PostgreSQL ni le runtime du déploiement Supabase ; les jobs dédiés
restent nécessaires.

### Recette après déploiement

- Vérifier les métadonnées publiques, le challenge OAuth et les règles de cache
  avec le smoke public. Celui-ci n’enregistre pas de client et ne valide pas le
  consentement, le refresh ou une transaction payante.
- Avec un compte de recette contrôlé, autoriser une application en lecture seule
  et un restaurant précis. Vérifier le refus d’une écriture, d’un autre restaurant,
  du bridge générique et d’un JWT natif présenté directement au MCP.
- Vérifier une lecture native du même compte et son parcours normal. Le nouveau
  garde ne doit pas bloquer une session sans `client_id`.
- Renouveler une fois le jeton opaque, puis rejouer l’ancien refresh dans un
  scénario isolé. Les accès descendants doivent être invalidés ; reconnecter
  ensuite le client de recette.
- Révoquer depuis la sécurité du compte, vérifier la disparition des permissions
  effectives et le refus d’un permis encore non expiré. Si la révocation Supabase
  échoue, l’interface doit indiquer que TOK est révoqué et qu’Auth reste à terminer.
- Refuser un utilisateur ordinaire sur le dispatcher avant toute lecture de queue.
  Vérifier un envoi uniquement vers un récepteur public contrôlé et autorisé.
- Vérifier le widget réel dans l’hôte ; la prévisualisation dédiée ne doit pas
  pouvoir remplacer les résultats du widget de production.
- Pour l’image, effectuer d’abord les scénarios de panne/concurrence avec les
  fournisseurs synthétiques. Une génération réelle consomme des crédits et
  relève d’une recette explicitement autorisée.

## Exploitation des crédits et webhooks

L’image utilise une réservation dans `ai_usage_logs`, identifiée par
`image_credit_reservation` et `metadata.billing_phase='reserved'`. L’interface
affiche **« Crédits réservés pour une image »**. Une réservation n’est pas une
preuve de livraison. La finalisation met à jour la même ligne et enregistre la
réponse durable ; la libération restitue une seule fois les allocations exactes,
y compris les cadeaux avec leur expiration d’origine.

Conserver la même clé d’idempotence pour la même intention, y compris après une
perte de réponse ou un rechargement. `image_operation_pending` signifie que le
résultat reste à rapprocher ; il ne faut pas créer une nouvelle clé pour relancer.
`image_generation_failed` n’est émis qu’après libération confirmée. Les états
`indeterminate` et `cleanup_pending` exigent une réconciliation avec les traces
du fournisseur et du stockage. Voir le [runbook des réservations IA](../security/ai-image-credit-reservations.md).

Les webhooks restent livrés au moins une fois. Le destinataire doit dédupliquer
`X-TOK-Delivery`. Un échec d’enregistrement de l’accusé après un HTTP réussi ne
déclenche pas de nouvel envoi immédiat. La reprise attend l’expiration du bail.
Avec Deno 2.1.4, un TCP connect encore sans handle ne peut pas être annulé au
niveau système ; le délai logique interdit toute écriture et ferme un handle
qui arriverait ensuite. Dès qu’un handle existe, l’annulation le ferme.

Surveiller les refus authentifiés, les erreurs d’insertion d’audit assainies,
les échecs de finalisation IA et les livraisons épuisant leurs tentatives.
Ne pas journaliser de tokens, secrets clients, prompts complets ni corps de
réponse fournisseur. Cette livraison produit les signaux ; elle ne prouve pas
qu’une alerte d’exploitation a été configurée ou reçue.

## Retour arrière et rotation de clé

Conserver les registres de crédits, les lignes d’idempotence, les grants et leurs
révocations. Ne pas retirer le garde OAuth pour restaurer les anciennes connexions.
En cas d’incident broker, fermer temporairement la connexion externe et livrer
un correctif compatible avec le nouveau modèle. Ne pas réexposer de JWT natifs.

La clé de chiffrement n’a pas de fallback. Sa perte rend les secrets chiffrés
inutilisables et exige une reconnexion. Pour la faire tourner, prévoir un arrêt
coordonné, la révocation des sessions, la recréation des clients et la reconnexion,
ou une migration de chiffrement dédiée et revue. Ne pas remplacer simplement la
variable en supposant que les anciennes sessions continueront à fonctionner.

## Références primaires

- [Supabase : sécurité des jetons OAuth](https://supabase.com/docs/guides/auth/oauth-server/token-security)
- [Supabase : serveur OAuth](https://supabase.com/docs/guides/auth/oauth-server/getting-started)
- [RFC 8414 : métadonnées de l’Authorization Server](https://www.rfc-editor.org/rfc/rfc8414)
- [RFC 9700, §4.14 : protection des refresh tokens](https://www.rfc-editor.org/rfc/rfc9700#section-4.14)
- [Deno : connexion TLS](https://docs.deno.com/api/deno/~/Deno.startTls)
- [OWASP : prévention SSRF](https://cheatsheetseries.owasp.org/cheatsheets/Server_Side_Request_Forgery_Prevention_Cheat_Sheet.html)
