# TOK Connect

TOK Connect est le socle d'integration de TOK pour ouvrir la plateforme a des partenaires externes sans perdre le controle produit, securite et restaurateur. L'objectif n'est pas seulement de publier une API: TOK Connect transforme TOK en reseau exploitable par des hotels, conciergeries, guides locaux, CRM, assistants IA et partenaires commerce, avec reservations reelles, webhooks signes, portail developpeur et MCP prudent.

## Plus-value pour TOK

TOK Connect cree un nouveau canal de croissance. Un partenaire peut chercher des restaurants TOK, lire les menus, verifier les disponibilites et creer une reservation confirmee sans que TOK doive reconstruire une interface specifique pour chaque partenaire. TOK gagne donc de la distribution sans disperser le produit.

La valeur principale est double:

- Pour les restaurants: plus de reservations directes, des partenaires controles par restaurant, des limites de convives et de volume, et une possibilite de couper l'acces.
- Pour TOK: une base B2B monnayable avec abonnements, quotas, commissions par reservation, integrations enterprise et futurs agents IA, tout en gardant les mutations sensibles cote Edge Functions.

Le point important: la v1 reste prudente. Les lectures, previews et reservations confirmees sont reelles. Les campagnes, offres, MIAMZ, Zero Attente et actions autonomes restent en preview ou validation humaine. Le flag `tok-connect-autopilot` reste desactive.

## Socle technique

Le socle actuel repose sur:

- Frontend React/Vite: pages publiques `/tok-connect`, portail developpeur `/tok-connect/developer`, admin `/admin/tok-connect`, dashboard restaurant `/dashboard/tok-connect`.
- Supabase Postgres: tables partenaires, clients OAuth, grants restaurant, tokens, idempotence, logs API, endpoints webhook, deliveries webhook et runs agents.
- Supabase Edge Functions:
  - `tok-connect-oauth`: flux `client_credentials` historique reserve aux integrations serveur-a-serveur B2B.
  - `tok-connect-api`: API REST versionnee `/v1`.
  - `tok-connect-mcp`: serveur MCP JSON-RPC expose a ChatGPT uniquement derriere l'endpoint canonique `https://www.thetok.ch/mcp`.
  - `tok-connect-portal`: actions portail/admin/dashboard.
  - `tok-connect-webhook-dispatch`: livraison des webhooks sortants.
- Supabase Auth: serveur OAuth 2.1 natif pour l'identite ChatGPT, PKCE, consentement et rotation des refresh tokens.
- Feature flags: `tok-connect`, `tok-connect-api`, `tok-connect-mcp`, `tok-connect-webhooks`, `tok-connect-autopilot`, `admin-tok-connect`, `dashboard-tok-connect`.

Toutes les nouvelles tables TOK Connect ont RLS activee. Les mutations sensibles passent par Edge Functions avec client service-role cote serveur uniquement. Le navigateur ne doit jamais recevoir de secret service-role.

## Autopilot controle

TOK Connect dispose maintenant d'un Autopilot avance, mais borne. Il sait preparer un plan exploitable par un partenaire, un assistant IA ou un operateur TOK, sans publier ni depenser automatiquement.

- Endpoint REST: `POST /v1/autopilot/plan`.
- Tool MCP: `build_autopilot_plan`.
- Scope requis: `autopilot:plan`, avec `analytics:read` et `campaigns:preview`.
- Flag requis: `tok-connect-autopilot`.
- Stockage: chaque plan cree une ligne `tok_connect_agent_runs` en `mode='autopilot_bounded'` et `status='pending_approval'`.
- Politique d'execution: `execution_policy.autonomous_mutation_allowed=false`.
- Validation humaine: un admin TOK ou un restaurateur autorise peut approuver/rejeter via `tok-connect-portal` avec `approve-agent-run` ou `reject-agent-run`.

Ce que l'Autopilot fait:

1. Lit les contraintes et signaux autorises.
2. Prepare un plan multi-etapes.
3. Estime le budget et les actions possibles.
4. Journalise le run.
5. Attend une approbation humaine.

Ce qu'il ne fait pas encore:

- Publier une campagne.
- Creer une offre autonome.
- Depenser des credits.
- Modifier MIAMZ, Zero Attente ou les reservations sans confirmation explicite.

## API REST v1

Toutes les reponses REST suivent l'enveloppe:

```json
{
  "ok": true,
  "data": {},
  "error": null,
  "request_id": "tok_req_...",
  "next_cursor": null
}
```

En cas d'erreur:

```json
{
  "ok": false,
  "data": null,
  "error": {
    "code": "missing_scope",
    "message": "missing_scope"
  },
  "request_id": "tok_req_...",
  "next_cursor": null
}
```

Endpoints disponibles:

- `GET /v1/restaurants`: liste paginee de restaurants actifs.
- `GET /v1/restaurants/{id}`: fiche restaurant.
- `GET /v1/restaurants/{id}/menu`: menu public.
- `GET /v1/restaurants/{id}/availability`: disponibilites temps reel.
- `POST /v1/reservations/preview`: preparation sans mutation.
- `POST /v1/reservations`: creation reelle, confirmee, auditee et idempotente.
- `POST /v1/reservations/{id}/cancel/preview`: preview d'annulation.
- `POST /v1/reservations/{id}/cancel`: annulation reelle confirmee par l'utilisateur final, idempotente, auditee et limitee aux reservations creees par le meme partenaire TOK Connect.
- `GET /v1/credits/balance`: solde TOK Credits via `get_restaurant_credit_usage`; `restaurant_id` peut cibler un restaurant precis, sinon TOK agrege les grants actifs du partenaire dans une limite de 50 restaurants.
- `POST /v1/campaigns/preview`: preview de campagne sans diffusion.

`POST /v1/reservations` impose `Idempotency-Key`. Si la meme cle est rejouee avec le meme corps, TOK renvoie la reponse initiale. Si la meme cle est rejouee avec un corps different, TOK renvoie `idempotency_key_reused_with_different_body`.

## Authentification ChatGPT et partenaires B2B

TOK Connect distingue deux flux. Ils ne doivent pas etre melanges:

- ChatGPT utilise le serveur OAuth 2.1 natif de Supabase Auth. Il fournit PKCE, decouverte OAuth/OIDC, Dynamic Client Registration (DCR), consentement utilisateur et refresh tokens avec rotation.
- Les integrations serveur-a-serveur existantes peuvent encore utiliser `tok-connect-oauth` en `client_credentials`. Ce flux est legacy B2B et ne doit plus etre configure comme authentification du connecteur ChatGPT.

### ChatGPT: OAuth 2.1 natif Supabase

Le resource server MCP public est:

```txt
https://www.thetok.ch/mcp
```

L'Authorization Server est:

```txt
https://wwcrtyoueexyxkkikaos.supabase.co/auth/v1
```

Supabase Auth expose seulement les scopes OIDC standards (`openid`, `email`, `profile`, `phone`). Les permissions metier TOK (`restaurants:read`, `availability:read`, etc.) ne sont donc pas des scopes OAuth natifs. Elles restent determinees cote serveur a partir de l'utilisateur Supabase, du `client_id`, des roles TOK et des grants restaurant, puis appliquees par les controles Edge/RLS.

Activation et validation production:

1. Dans Supabase Dashboard, ouvrir **Authentication > OAuth Server** et activer OAuth 2.1.
2. Dans **Authentication > URL Configuration**, verifier que la Site URL de production est `https://www.thetok.ch`.
3. Configurer l'Authorization Path sur `/oauth/consent`.
4. Fournir la page `https://www.thetok.ch/oauth/consent`. Elle doit conserver `authorization_id` pendant le login, afficher le client, le redirect URI et les scopes, puis appeler `getAuthorizationDetails`, `approveAuthorization` ou `denyAuthorization`.
5. Activer DCR seulement avec consentement obligatoire, surveillance des clients enregistres et validation stricte des redirect URIs. L'alternative est de pre-enregistrer un client public ChatGPT.
6. Dans ChatGPT, creer le connecteur avec l'URL MCP canonique ci-dessus. Ne pas utiliser directement une URL `functions.supabase.co` ni `tok-connect-full-app-mcp`.
7. Si le client est pre-enregistre, copier exactement l'URL de callback affichee par ChatGPT dans le client Supabase. Ne pas la deviner, ne pas utiliser de wildcard et verifier protocole, domaine, chemin et port.
8. Verifier la decouverte avant la connexion:
   - `https://www.thetok.ch/.well-known/oauth-protected-resource`
   - `https://wwcrtyoueexyxkkikaos.supabase.co/.well-known/oauth-authorization-server/auth/v1`
   - `https://wwcrtyoueexyxkkikaos.supabase.co/auth/v1/.well-known/openid-configuration`
9. Tester le parcours complet: connexion TOK, ecran de consentement, retour callback ChatGPT, appel MCP authentifie, expiration du token puis refresh sans nouvelle connexion.

La configuration n'est pas prete pour ChatGPT tant que l'endpoint de consentement, la callback exacte et le refresh n'ont pas ete verifies de bout en bout.

References Supabase:

- [Authentification MCP avec Supabase Auth](https://supabase.com/docs/guides/auth/oauth-server/mcp-authentication)
- [Mise en route du serveur OAuth 2.1](https://supabase.com/docs/guides/auth/oauth-server/getting-started)
- [Flux OAuth, PKCE et refresh tokens](https://supabase.com/docs/guides/auth/oauth-server/oauth-flows)

### Legacy B2B: `client_credentials`

Le flux historique reste disponible pour les partenaires REST sans utilisateur final:

1. Le partenaire recoit un `client_id` et un secret affiche une seule fois.
2. Le secret est stocke hashe, jamais en clair.
3. Le backend partenaire appelle `tok-connect-oauth` avec `grant_type=client_credentials`.
4. TOK renvoie un token opaque court.
5. `tok-connect-api` verifie token, client, partenaire, environnement, scopes, revocation et quotas.

Scopes metier B2B:

- `restaurants:read`
- `availability:read`
- `reservations:create`
- `reservations:cancel`
- `credits:read`
- `campaigns:preview`
- `analytics:read`

Les scopes du token B2B ne suffisent pas pour les restaurants: les grants `tok_connect_restaurant_grants` controlent quels restaurants sont autorises, quels scopes sont permis et quelles limites s'appliquent.

## Webhooks sortants

Webhooks v1:

- `reservation.created`
- `reservation.cancelled`
- `webhook.test`
- `campaign.previewed`

Headers envoyes:

- `X-TOK-Event`
- `X-TOK-Delivery`
- `X-TOK-Timestamp`
- `X-TOK-Signature`

La signature est HMAC v1 sur le payload horodate. Le partenaire doit verifier l'horodatage, la signature et l'idempotence par `X-TOK-Delivery`.

La livraison est asynchrone:

1. Une action TOK Connect cree une ligne dans `tok_connect_webhook_deliveries`.
2. Un scheduler explicitement configure appelle `tok-connect-webhook-dispatch` a l'intervalle approuve.
3. La fonction signe le payload, poste vers l'endpoint actif, stocke statut HTTP, reponse tronquee, signature, tentative et prochaine date de retry.
4. Les retries sont bornes et audites.

Prerequis production: le secret Vault `internal_cron_secret` doit exister et le job `tok-connect-webhook-dispatcher` doit etre present et actif dans `cron.job`. La migration MCP ChatGPT v2 ne cree volontairement aucun cron: le secret, l'intervalle et le runbook de retry doivent etre approuves puis verifies separement.

## MCP Server

L'unique endpoint a enregistrer dans ChatGPT est:

```txt
https://www.thetok.ch/mcp
```

La route publique fournit le resource server MCP, la decouverte OAuth protegee et le proxy vers `tok-connect-mcp`. L'URL directe de l'Edge Function est une implementation interne et ne constitue pas un contrat client.

`tok-connect-mcp` expose JSON-RPC sur Streamable HTTP:

- `initialize`
- `tools/list`
- `tools/call`
- `resources/list`
- `resources/read`
- `prompts/list`
- `prompts/get`

Tools v1 autorises:

- `discover_restaurants`
- `get_restaurant_details`
- `search_restaurants`
- `get_real_time_availability`
- `prepare_reservation`
- `get_restaurant_performance`
- `estimate_campaign_credit_cost`
- `generate_campaign_preview`
- `build_autopilot_plan`

### Module visuel de decouverte

`discover_restaurants` est l'outil a appeler des qu'une personne demande des restaurants. Il accepte la demande brute
dans `request` et comprend seul les quantites par cuisine, la ville, la date et le nombre de convives: "3 pizzerias et
2 restaurants de sushi a Geneve" produit exactement trois pizzerias et deux sushis, classes par note. Le modele peut
forcer la repartition avec `selections: [{ cuisine, count }]` et borner le total avec `limit`.

Le classement combine une note bayesienne (une note parfaite sur deux avis ne passe pas devant un 4,7 sur 400 avis),
le volume d'avis, l'affinite avec la cuisine demandee et les signaux TOK (coup de coeur, reservation disponible,
photo). Une categorie sans adresse active est signalee dans `notes` et completee par les meilleures tables voisines
plutot que de rendre une liste courte sans explication.

Les deux outils declarent `openai/outputTemplate` vers la ressource MCP Apps
`ui://tok-connect/restaurant-discovery-v1.html` (`text/html;profile=mcp-app`). ChatGPT ouvre donc un vrai module TOK:
cartes classees, filtres par cuisine, puis fiche complete au clic (presentation, note et avis, adresse, horaires,
plats phares, creneaux, reservation). La fiche est chargee par le module lui-meme via `window.openai.callTool`
(`get_restaurant_details`, marque `openai/widgetAccessible`), sans nouvel aller-retour par le modele.

`search` (contrat connecteur ChatGPT) passe par le meme moteur: il renvoie `results` pour le modele et la selection
complete pour le module. L'apercu local du module est servi sur `/tok-connect/mcp-widget`.

La sandbox MCP renvoie des fixtures deterministes et ne declenche pas de mutation production. Les outils qui lisent des donnees privees ou creent un run exigent OAuth; ils restent limites par identite, roles, grants restaurant et feature flags.

Reference protocolaire: MCP `2025-11-25`, derniere specification stable. Le serveur negocie aussi les versions de compatibilite declarees `2025-06-18` et `2025-03-26`; il ne doit jamais renvoyer silencieusement une version hardcodee independante de `initialize`.

Le transport accepte une requete JSON-RPC par `POST`, renvoie `202` sans corps pour une notification acceptee et peut renvoyer `405` sur `GET` lorsqu'aucun flux SSE serveur n'est propose. Les clients envoient `MCP-Protocol-Version` apres initialisation. Reference: [MCP 2025-11-25](https://modelcontextprotocol.io/specification/2025-11-25).

## Mise en place pour un client partenaire B2B legacy

1. Demander l'acces TOK Connect a TOK.
2. TOK cree ou approuve le partner dans l'admin.
3. TOK definit les scopes autorises, quotas et environnement.
4. Le partenaire ouvre `/tok-connect/developer`.
5. Le partenaire cree un client sandbox.
6. Le partenaire copie le secret affiche une seule fois dans son coffre de secrets.
7. Le backend partenaire obtient un token via `tok-connect-oauth`; ce token n'est pas utilise par ChatGPT.
8. Le partenaire teste `GET /v1/restaurants` et `GET /v1/restaurants/{id}/availability`.
9. Le partenaire configure un webhook HTTPS public.
10. Le partenaire lance `webhook.test`.
11. Le partenaire passe a `POST /v1/reservations/preview`.
12. Le partenaire appelle `POST /v1/reservations` uniquement apres confirmation explicite utilisateur avec `Idempotency-Key`.
13. Le partenaire verifie les webhooks et gere les retries de son cote.
14. Pour la production, TOK bascule le client hors sandbox et autorise des restaurants precis.

Exemple simplifie:

```bash
curl -X POST "https://www.thetok.ch/functions/v1/tok-connect-oauth" \
  -H "Content-Type: application/json" \
  -d '{"grant_type":"client_credentials","client_id":"tokc_...","client_secret":"...","scope":"restaurants:read availability:read"}'
```

```bash
curl "https://www.thetok.ch/functions/v1/tok-connect-api/v1/restaurants?limit=25" \
  -H "Authorization: Bearer tokc_at_..."
```

## Mise en place pour TOK

1. Activer Supabase Auth OAuth 2.1, configurer `/oauth/consent` et valider la callback ChatGPT comme decrit plus haut.
2. Verifier les feature flags:
   - `tok-connect`: actif.
   - `tok-connect-api`: actif.
   - `tok-connect-mcp`: actif seulement pour partenaires testes.
   - `tok-connect-webhooks`: actif.
   - `tok-connect-autopilot`: desactive par defaut; a activer seulement pour la planification bornee.
3. Appliquer les migrations via GitHub Actions, pas manuellement depuis Codex.
4. Deployer les Edge Functions et les routes publiques `/mcp` et `/.well-known/oauth-protected-resource` via le workflow production.
5. Verifier `internal_cron_secret` dans Supabase Vault.
6. Verifier que `tok-connect-webhook-dispatcher` est present et actif dans `cron.job`; ne pas supposer que la migration MCP le cree.
7. Creer ou approuver les partenaires dans `/admin/tok-connect`.
8. Definir quotas, scopes, environnement et restaurants autorises.
9. Demander aux restaurateurs de valider les grants dans `/dashboard/tok-connect`.
10. Surveiller les logs API, revocations, webhooks et deliveries.
11. Garder les secrets OAuth et webhook hors navigateur.

## Securite et garde-fous

- RLS activee sur toutes les tables TOK Connect.
- `anon` ne lit pas les tables privees TOK Connect.
- Les secrets OAuth clients sont hashes.
- Les tokens opaques sont courts et revocables.
- ChatGPT utilise OAuth 2.1 natif avec PKCE, consentement utilisateur et refresh token; il n'utilise pas le secret B2B legacy.
- Les scopes sont verifies cote Edge.
- Les grants restaurants sont verifies cote Edge.
- Les endpoints webhook bloquent les URL locales/privees en production.
- Les reservations reelles exigent `Idempotency-Key`.
- Les webhooks sont signes et retries.
- Les actions sensibles sont auditees avec `writeAuditLog`.
- La sandbox ne mute pas la production.
- L'autopilot reste borne: planification et approbation humaine, pas d'execution autonome.
- Un index unique empeche deux runs MCP de partager la meme combinaison restaurant, outil, acteur et cle d'idempotence.

## Observabilite

Les donnees d'exploitation sont stockees dans:

- `tok_connect_api_requests`: requetes API, statut, route, scopes, latence, erreur.
- `tok_connect_idempotency_keys`: idempotence de reservation.
- `tok_connect_webhook_deliveries`: statut, retries, reponse et signature.
- `tok_connect_agent_runs`: previews et runs MCP/agents.
- `edge_function_audit_logs`: audit des actions sensibles.

Les consoles existantes:

- `/tok-connect/developer`: clients, webhooks, OpenAPI, MCP, logs.
- `/admin/tok-connect`: supervision partenaires et clients.
- `/dashboard/tok-connect`: consentements restaurants.

## Ce qui reste a mettre en place

- Chiffrer ou externaliser les secrets de signature webhook au lieu de garder `signing_secret` en clair dans la table applicative.
- Finaliser les regles metier autour de l'annulation reelle: delais commerciaux, remboursements, notifications client et communication restaurateur.
- Enrichir l'admin commercial: recherche, filtres avances, billing tier, export logs et vues detaillees par partenaire/client/restaurant.
- Enrichir le dashboard restaurateur: demande de nouveaux grants, edition deleguee des limites, expiration et details partenaires.
- Ajouter une verification production health dediee pour `tok-connect-webhook-dispatcher`.
- Valider la compatibilite MCP `2025-11-25` contre ChatGPT en production et suivre le changelog avant toute nouvelle version.
- Ajouter des tests navigateur authentifies sur `/tok-connect/developer`, `/admin/tok-connect` et `/dashboard/tok-connect`.
- Definir les offres commerciales finales: free sandbox, partner, booking partner, commerce preview, enterprise MCP.

## Commandes de validation

Avant livraison:

```bash
corepack pnpm run lint
corepack pnpm run test
corepack pnpm run build
```

Avant production:

```bash
corepack pnpm run test:prod
corepack pnpm run build:prod
corepack pnpm run supabase:target:prod
corepack pnpm run supabase:doctor:prod
```

La production reste pilotee par GitHub Actions. Ne pas pousser directement des secrets, ne pas modifier les variables d'environnement depuis Codex et ne pas appliquer de migration production a la main.

## Gateway ChatGPT v3

L'URL publique reste **uniquement** `https://www.thetok.ch/mcp`. Vercel la route maintenant vers `tok-connect-chatgpt`, une gateway qui agrège côté serveur :

- le MCP transactionnel historique `tok-connect-mcp` ;
- le catalogue de parcours interne `tok-connect-full-app-mcp` ;
- les outils standard `search` / `fetch` ;
- les lectures restaurant, menu et TOK Credits ;
- la prévisualisation d'annulation ;
- la création et l'annulation réelles de réservations lorsque l'utilisateur final a explicitement confirmé et qu'une clé d'idempotence est fournie.

Les paiements, remboursements, publications, débits de crédits et mutations administrateur ne deviennent pas autonomes. ChatGPT peut les découvrir, les expliquer, les simuler et préparer un paquet de confirmation, puis TOK conserve l'exécution dans son flux protégé.

Le widget MCP est servi en `text/html;profile=mcp-app` et la gateway remplace la ressource historique qui contenait un marqueur de conflit CSS résiduel.
