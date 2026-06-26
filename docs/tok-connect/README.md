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
  - `tok-connect-oauth`: OAuth client-credentials scoped.
  - `tok-connect-api`: API REST versionnee `/v1`.
  - `tok-connect-mcp`: serveur MCP JSON-RPC HTTP.
  - `tok-connect-portal`: actions portail/admin/dashboard.
  - `tok-connect-webhook-dispatch`: livraison des webhooks sortants.
- Supabase Cron: job `tok-connect-webhook-dispatcher` chaque minute via `pg_cron` + `pg_net`.
- Feature flags: `tok-connect`, `tok-connect-api`, `tok-connect-mcp`, `tok-connect-webhooks`, `tok-connect-autopilot`, `admin-tok-connect`, `dashboard-tok-connect`.

Toutes les nouvelles tables TOK Connect ont RLS activee. Les mutations sensibles passent par Edge Functions avec client service-role cote serveur uniquement. Le navigateur ne doit jamais recevoir de secret service-role.

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

## OAuth et scopes

La v1 utilise OAuth 2.0 client-credentials:

1. Le partenaire recoit un `client_id` et un secret affiche une seule fois.
2. Le secret est stocke hashe, jamais en clair.
3. Le partenaire appelle `tok-connect-oauth`.
4. TOK renvoie un token opaque court.
5. `tok-connect-api` et `tok-connect-mcp` verifient token, client, partner, environnement, scopes, revocation et quotas.

Scopes v1:

- `restaurants:read`
- `availability:read`
- `reservations:create`
- `reservations:cancel`
- `credits:read`
- `campaigns:preview`
- `analytics:read`

Les scopes du token ne suffisent pas pour les restaurants: les grants `tok_connect_restaurant_grants` controlent quels restaurants sont autorises, quels scopes sont permis et quelles limites s'appliquent.

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
2. Le job `tok-connect-webhook-dispatcher` appelle `tok-connect-webhook-dispatch` chaque minute.
3. La fonction signe le payload, poste vers l'endpoint actif, stocke statut HTTP, reponse tronquee, signature, tentative et prochaine date de retry.
4. Les retries sont bornes et audites.

Prerequis production: le secret Vault `internal_cron_secret` doit exister. La migration ne stocke pas le secret; elle lit Vault et planifie le job seulement si le secret est present.

## MCP Server

`tok-connect-mcp` expose JSON-RPC HTTP:

- `initialize`
- `tools/list`
- `tools/call`
- `resources/list`
- `resources/read`
- `prompts/list`
- `prompts/get`

Tools v1 autorises:

- `search_restaurants`
- `get_real_time_availability`
- `prepare_reservation`
- `get_restaurant_performance`
- `estimate_campaign_credit_cost`
- `generate_campaign_preview`

La sandbox MCP renvoie des fixtures deterministes et ne declenche pas de mutation production. En production, les tools restent limites par scopes, grants restaurant et feature flags.

Reference actuelle: le code cible MCP `2025-06-18`. La specification publique stable la plus recente verifiee pendant l'audit est `2025-11-25`, donc il restera a planifier une mise a niveau de compatibilite MCP.

## Mise en place pour un client partenaire

1. Demander l'acces TOK Connect a TOK.
2. TOK cree ou approuve le partner dans l'admin.
3. TOK definit les scopes autorises, quotas et environnement.
4. Le partenaire ouvre `/tok-connect/developer`.
5. Le partenaire cree un client sandbox.
6. Le partenaire copie le secret affiche une seule fois dans son coffre de secrets.
7. Le partenaire obtient un token via `tok-connect-oauth`.
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

1. Verifier les feature flags:
   - `tok-connect`: actif.
   - `tok-connect-api`: actif.
   - `tok-connect-mcp`: actif seulement pour partenaires testes.
   - `tok-connect-webhooks`: actif.
   - `tok-connect-autopilot`: inactif en v1.
2. Appliquer les migrations via GitHub Actions, pas manuellement depuis Codex.
3. Deployer les Edge Functions via le workflow production.
4. Verifier `internal_cron_secret` dans Supabase Vault.
5. Verifier que `tok-connect-webhook-dispatcher` est present dans `cron.job`.
6. Creer ou approuver les partenaires dans `/admin/tok-connect`.
7. Definir quotas, scopes, environnement et restaurants autorises.
8. Demander aux restaurateurs de valider les grants dans `/dashboard/tok-connect`.
9. Surveiller les logs API, revocations, webhooks et deliveries.
10. Garder les secrets OAuth et webhook hors navigateur.

## Securite et garde-fous

- RLS activee sur toutes les tables TOK Connect.
- `anon` ne lit pas les tables privees TOK Connect.
- Les secrets OAuth clients sont hashes.
- Les tokens opaques sont courts et revocables.
- Les scopes sont verifies cote Edge.
- Les grants restaurants sont verifies cote Edge.
- Les endpoints webhook bloquent les URL locales/privees en production.
- Les reservations reelles exigent `Idempotency-Key`.
- Les webhooks sont signes et retries.
- Les actions sensibles sont auditees avec `writeAuditLog`.
- La sandbox ne mute pas la production.
- L'autopilot reste desactive en v1.

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
- Exporter l'OpenAPI en fichier telechargeable depuis le portail developpeur.
- Ajouter une verification production health dediee pour `tok-connect-webhook-dispatcher`.
- Mettre a niveau la compatibilite MCP vers la specification stable la plus recente apres validation client.
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
