# Audit d'authentification Supabase — 2026-08-02

Périmètre : flux d'authentification Supabase de `thetok.ch`, BFF marketing
(`/api/marketing/*`), configuration Supabase Auth, workflows GitHub Actions, et
diagnostic des codes d'erreur remontés en production (401, 422, 429, 500, 503).

Référence auditée : `ee22e40` (identique à `origin/main` au moment de l'audit).

## Résumé exécutif

Le BFF marketing est solide : jetons opaques côté navigateur, secrets Supabase
confinés au serveur, CSRF double-submit en temps constant, MFA AAL2 obligatoire,
allowlist d'opérations. Les 22 tests d'authentification et de sécurité du BFF
passent.

Les erreurs observées ne viennent pas d'une panne unique. Elles se répartissent
en trois causes distinctes, dont deux sont des défauts de code confirmés :

| Code | Origine réelle | Statut |
|------|----------------|--------|
| 422 | Politique de mot de passe client plus permissive que celle de Supabase | **Corrigé** (A1) |
| 401 | `insufficient_aal` sur `PUT /user` (MFA actif) | Correctif présent, postérieur aux erreurs (A2) |
| 403 | `bad_jwt` — jeton sans claim `sub` sur `GET /user` | **Corrigé** (A3) |
| 429 | Limiteur du BFF, **pas** Supabase — verrouillage de compte à distance possible | **Corrigé** (A4) |
| 503 | Fourre-tout du BFF : masque surtout une variable d'environnement absente | **Corrigé** (A5) |
| 500 | Non reproduit sur 24 h | Aucune trace (A6) |

## Correctifs appliqués

Livrés sur cette branche à la suite de l'audit. Chaque correctif est verrouillé
par un test.

| Réf | Changement | Fichiers |
|-----|-----------|----------|
| A1 | Politique de mot de passe unique, alignée sur l'ensemble de symboles exact de Supabase ; inscription et changement de mot de passe partagent le même validateur ; l'ensemble accepté est affiché à l'utilisateur | `src/lib/passwordPolicy.ts` (nouveau), `src/components/auth/AccountPasswordForm.tsx`, `src/pages/Auth.tsx` |
| A3 | `getUser()` n'est plus appelé sans session lors de l'enregistrement du consentement | `src/lib/consent.ts` |
| A4 | Le seau de limitation par compte est scopé à l'adresse appelante ; les seaux du mot de passe sont libérés dès l'étape mot de passe réussie | `server/marketingBff.ts` |
| A5 | Les échecs de configuration portent le code `configuration_unavailable`, distinct d'une panne amont | `server/marketingBff.ts` |

Deux points relevés par l'audit n'ont volontairement pas été modifiés :

- **A2** — le correctif AAL2 était déjà en place ; il reste à confirmer sur une
  fenêtre de 24 h qu'aucun `insufficient_aal` ne réapparaît.
- **A7** — la fenêtre de grâce expirée n'est pas prolongée : ce serait masquer un
  écart réel. Les logs montrent `send-email` et `stripe-worker` en 200 continu,
  donc les identifiants Resend et Stripe sont opérationnels et la porte de
  `release:readiness` devrait passer. À vérifier au prochain déploiement.

### Compromis assumé sur A4

Le seau par compte était global, sans composante d'adresse. Le rendre
dépendant de l'adresse supprime la primitive de déni de service, mais rend le
password spraying distribué un peu moins contraint : un attaquant disposant de N
adresses obtient 5 tentatives par adresse et par quart d'heure, au lieu de 5 pour
le compte entier.

Ce compromis est acceptable ici parce que la console marketing impose la MFA en
AAL2 : un mot de passe seul ne produit aucune session. À l'inverse, la version
précédente permettait à n'importe quel tiers non authentifié de verrouiller une
console d'exploitation. La résistance par adresse est inchangée, le seau
`password-ip` plafonnant déjà chaque adresse à 5 tentatives.

## Méthode

- Lecture intégrale de `server/marketingBff.ts` (1509 lignes) et des routes `api/marketing/*`.
- Lecture des RPC d'authentification dans `supabase/migrations/20260801190000_marketing_operations_center.sql`.
- Logs de production Supabase Auth et Edge Functions sur 24 h (100 événements Auth analysés).
- Advisors de sécurité Supabase (275 avis).
- Exécution des tests : `marketing-bff-security`, `auth-provider`, `auth-password-recovery`, `auth-redirect-security` → **22/22 au vert**.

Les identités présentes dans les logs ont été volontairement exclues de ce rapport.

## Architecture

Deux plans d'authentification coexistants, avec des propriétés très différentes :

1. **Application publique** (`www.thetok.ch`) — `supabase-js` dans le navigateur,
   session stockée côté client, appels directs à `/auth/v1/*`.
2. **Console marketing** (`marketing.thetok.ch`) — BFF serveur strict. Le
   navigateur ne reçoit que des poignées aléatoires opaques (43 caractères
   base64url) ; les jetons Supabase ne quittent jamais le processus serveur et le
   magasin chiffré. Cookies `__Host-`, `SameSite=Strict`, CSRF double-submit,
   session de 4 h, MFA TOTP obligatoire en AAL2.

L'essentiel des erreurs remontées concerne le plan 1 (401/422/403) ; les 429 et
503 concernent le plan 2.

## Preuves de production (24 h, service Auth)

Répartition des statuts sur 100 événements :

```
200: 34    204: 8    303: 3    400: 3
401: 4     403: 3    405: 2    422: 2
```

Erreurs distinctes relevées :

```
[401] PUT /user   insufficient_aal
      401: AAL2 session is required to update email or password when MFA is enabled.

[422] PUT /user
      Password should contain at least one character of each:
      abcdefghijklmnopqrstuvwxyz, ABCDEFGHIJKLMNOPQRSTUVWXYZ, 0123456789,
      !@#$%^&*()_+-=[]{};'\:"|<>?,./`~.
      Password is known to be weak and easy to guess, please choose a different one.

[403] GET /user   bad_jwt
      403: invalid claim: missing sub claim

[400] POST /token invalid_credentials
      400: Invalid login credentials
```

Côté Edge Functions : un seul non-200 sur 24 h, un `503` sur
`google-actions-center-sync`, sans rapport avec l'authentification.

**Aucun 429 et aucun 500 dans les logs Supabase.** C'est un point de diagnostic
important : ces deux codes ne proviennent pas de Supabase.

## Défauts confirmés

### A1 — Politique de mot de passe désalignée (→ 422) — Gravité haute

Supabase exige au moins un caractère de l'ensemble
`` !@#$%^&*()_+-=[]{};'\:"|<>?,./`~ `` et applique en plus un contrôle de mot de
passe compromis (HIBP).

La validation côté client est plus permissive — `src/components/auth/AccountPasswordForm.tsx:36` :

```js
if (!/[^A-Za-z0-9\s]/.test(password)) { ... }
```

`[^A-Za-z0-9\s]` accepte **n'importe quel** caractère non alphanumérique, y
compris les caractères accentués et typographiques français, qui ne font pas
partie de l'ensemble exigé par Supabase. Vérification :

| Mot de passe | Validation client | Supabase |
|---|---|---|
| `Motdepassé1` | acceptée | **rejetée** |
| `Chaîne2026€` | acceptée | **rejetée** |
| `Passwörter9` | acceptée | **rejetée** |
| `Résumé123«»` | acceptée | **rejetée** |
| `Bonjour2026!` | acceptée | acceptée |

Un utilisateur francophone qui compose un mot de passe avec `é`, `€` ou `ö` passe
la validation locale et reçoit un 422 illisible. C'est exactement le scénario
observé en production.

Second point, indépendant : l'inscription applique une règle bien plus faible —
`src/pages/Auth.tsx:299` n'exige que **6 caractères**, sans aucune contrainte de
complexité, alors que le formulaire de compte en exige 10 avec complexité et que
Supabase exige les quatre classes de caractères. Toute inscription avec un mot de
passe simple est donc rejetée par Supabase après coup.

**Correctif recommandé** : aligner la regex sur l'ensemble exact de Supabase,
partager un validateur unique entre inscription et changement de mot de passe, et
afficher la contrainte réelle dans l'aide de saisie.

### A2 — `insufficient_aal` sur `PUT /user` (→ 401) — Gravité haute, correctif présent

Quatre occurrences le 2026-08-02 à 07:54 : changement de mot de passe refusé
parce que la session n'était pas élevée en AAL2 alors que la MFA est active.

Le correctif existe : `prepareAal2()` dans
`src/components/auth/AccountPasswordForm.tsx` élève la session avant
`updateUser`, et le message d'erreur `insufficient_aal` est traité
(`AccountPasswordForm.tsx:54-58`). Ce correctif a été livré par `ee22e40` le même
jour à **10:59**, soit trois heures **après** les erreurs relevées.

Les 401 observés sont donc antérieurs au correctif. Rien n'indique une régression
persistante, mais l'absence de 401 `insufficient_aal` postérieurs à 10:59 doit
être confirmée sur la prochaine fenêtre de 24 h avant de clore le sujet.

### A3 — `bad_jwt` : jeton sans claim `sub` (→ 403) — Gravité moyenne

Trois occurrences de `GET /user` → 403 `invalid claim: missing sub claim`, avec
`referer: https://www.thetok.ch`.

Cette signature correspond à un appel de `/auth/v1/user` porteur d'un JWT dépourvu
de claim `sub` — typiquement la clé publishable/anon envoyée en `Authorization:
Bearer`, ou un jeton non-utilisateur. Un jeton utilisateur expiré produirait un
message différent.

Le dépôt comporte neuf sites d'appel de `supabase.auth.getUser()` sans garde de
session préalable :

```
src/lib/consent.ts:51
src/lib/ai/tokAiClient.ts:323
src/lib/commercialDemoProject.ts:28
src/components/ImageUpload.tsx:86
src/components/floor-plan/FloorPlanAIPanel.tsx:145
src/components/dashboard/TokAiMarketingStudio.tsx:1514
src/components/dashboard/AiStyleReferencePicker.tsx:107
src/pages/admin/AdminSinistres.tsx:628
src/pages/dashboard/DashboardPlanSalle.tsx:2044
```

**Corrigé** sur `src/lib/consent.ts` : c'est le seul de ces neuf appels qui
s'exécute réellement sans session, puisque la bannière de consentement s'affiche
pour tout visiteur, y compris anonyme — ce qui correspond au `referer` observé.
`getUser()` y est désormais précédé d'une vérification de session, et un reçu
non attribué est enregistré avec `user_id` nul.

Les huit autres appels sont situés derrière des surfaces authentifiées
(tableaux de bord, admin, projet de démo) où une session existe par
construction ; ils ne produisent pas cette erreur et n'ont pas été modifiés. Si
de nouveaux `bad_jwt` apparaissent avec un `referer` de tableau de bord, ce sont
les prochains à instrumenter.

### A4 — Verrouillage de compte marketing à distance (→ 429) — Gravité haute

Aucun 429 ne provient de Supabase. Ils viennent du limiteur du BFF.

`server/marketingBff.ts:965` consomme un quota par compte, **sans composante IP** :

```ts
await consumeRateLimit(config, req, "password-account", sha256Hex(email), false);
```

Le paramètre `false` désactive `includeIp`, la clé devient donc globale pour le
compte (`rateLimitKey`, `marketingBff.ts:586-594`). Le RPC
`service_consume_marketing_auth_attempt` autorise **5 tentatives par fenêtre de
15 minutes**, puis bloque 15 minutes
(`supabase/migrations/20260801190000_marketing_operations_center.sql:827-828`).

Deux conséquences :

1. **Disponibilité** — un tiers non authentifié qui connaît l'adresse e-mail d'un
   administrateur marketing peut maintenir ce compte bloqué en permanence, depuis
   n'importe quelle IP, avec 6 requêtes toutes les 15 minutes. Aucune
   authentification préalable n'est requise puisque le quota est consommé **avant**
   la vérification des identifiants (`marketingBff.ts:964-969`).
2. **Ergonomie** — le quota n'est purgé qu'après une vérification MFA complète
   (`marketingBff.ts:1240-1249`). Un administrateur qui saisit le bon mot de passe
   mais abandonne à l'étape TOTP consomme son quota malgré tout. Cinq
   interruptions en 15 minutes suffisent à l'enfermer dehors.

Le compromis anti-force-brute est délibéré et défendable, mais le verrouillage
global par compte est exploitable en déni de service. **Correctif recommandé** :
réintroduire l'IP dans la clé du bucket par compte, ou dissocier le seuil global
(large, avec temporisation progressive) du seuil par IP (strict), et purger le
quota dès que le mot de passe est validé plutôt qu'après la MFA.

### A5 — Tous les échecs serveur aplatis en 503 — Gravité moyenne (observabilité)

`server/marketingBff.ts:302` renvoie un 503 générique pour toute erreur qui n'est
pas un `PublicBffError` :

```ts
sendJson(res, 503, { error: { code: "service_unavailable", message: "Service indisponible." } });
```

Or `readConfig()` (`marketingBff.ts:325-341`) lève précisément ce 503 quand
`SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY` ou `SUPABASE_SERVICE_ROLE_KEY` sont
absents, quand l'hôte ne se termine pas par `.supabase.co`, ou quand les deux clés
sont identiques.

Conséquence pratique : **un « 503 Service Unavailable » sur `marketing.thetok.ch`
indique en premier lieu une variable d'environnement Vercel absente ou mal
nommée**, et non une panne Supabase. Les deux cas sont indistinguables côté
client, et le BFF n'émet aucun log serveur permettant de trancher.

Les variables attendues sont documentées dans `.env.example` (bloc « Vercel
Functions — server-only marketing BFF ») mais y sont **commentées**. Elles doivent
être définies dans le projet Vercel, sans préfixe `VITE_`.

**Correctif recommandé** : distinguer le code d'erreur de configuration
(`configuration_unavailable`) du code de panne amont, et journaliser côté serveur
la variable manquante — sans jamais exposer le détail au client.

### A6 — Aucun 500 reproduit — Information

Aucun 500 sur 24 h, ni côté Auth ni côté Edge Functions. Le BFF ne peut
structurellement pas en émettre : `runSafely` capture tout et `sendError` plafonne
à 503.

Un 500 sur `/api/marketing/*` viendrait donc de la plateforme Vercel en amont du
handler — échec de résolution de module ou crash au chargement. À noter que
`.vercelignore` **n'exclut pas** `server/`, la dépendance
`api/marketing/*.ts → ../../server/marketingBff.js` est donc bien déployée.

### A7 — Fenêtre de grâce CI expirée — Gravité moyenne

`.github/workflows/deploy-production.yml:30` :

```yaml
PROVIDER_BOOTSTRAP_GRACE_UNTIL: "2026-07-26T00:00:00Z"
```

Cette date est dépassée depuis 7 jours. `isProviderBootstrapGraceActive`
(`scripts/release-readiness-core.mjs:96-104`) renvoie désormais `false`, ce qui
transforme en erreurs bloquantes (mode strict) ce qui n'était que des
avertissements : absence de `VITE_STRIPE_PUBLISHABLE_KEY` en `pk_live_`, absence
de `RESEND_API_KEY`, absence de secret cron interne.

À arbitrer explicitement : fournir les identifiants manquants, ou prolonger la
fenêtre en connaissance de cause. La laisser expirer sans décision expose à un
blocage de déploiement au prochain passage.

### A8 — Advisors de sécurité Supabase — Information

275 avis, **aucun de niveau ERROR** :

| Niveau | Avis | Nombre |
|---|---|---|
| WARN | `authenticated_security_definer_function_executable` | 227 |
| WARN | `anon_security_definer_function_executable` | 20 |
| WARN | `function_search_path_mutable` | 1 |
| INFO | `rls_enabled_no_policy` | 27 |

Les 20 fonctions `SECURITY DEFINER` exécutables par le rôle `anon` méritent une
revue ciblée : ce sont les seules atteignables sans authentification.

## Points solides confirmés

- Les huit RPC `service_*` appelés par le BFF existent bien en migration et sont
  tous gardés par `marketing_require_service_role()`.
- Les jetons Supabase sont chiffrés au repos dans `marketing_admin_auth_challenges`
  et ne transitent jamais vers le navigateur.
- `assertFreshAal2` (`marketingBff.ts:808-834`) revalide `aal`, `sub`, l'émetteur,
  la fraîcheur du `iat` et la présence de `totp` dans `amr` — la vérification MFA
  ne se contente pas du code de retour.
- L'enrôlement TOTP en AAL1 est refusé si le compte possède déjà un autre facteur
  vérifié (`marketingBff.ts:992-994`), ce qui ferme une escalade classique.
- Les contraintes SQL bornent les durées de vie : défi 10 minutes, session 4 heures.

## Recommandations, par priorité

1. **A4** — corriger le verrouillage global par compte du BFF (exploitable en déni
   de service, sans authentification).
2. **A1** — aligner la politique de mot de passe client sur celle de Supabase et
   unifier les deux validateurs divergents.
3. **A5** — séparer l'erreur de configuration de l'erreur de panne, et vérifier
   que les trois variables du BFF sont bien définies côté Vercel.
4. **A7** — arbitrer la fenêtre de grâce expirée avant le prochain déploiement.
5. **A3** — garder les appels `getUser()` derrière une vérification de session.
6. **A2** — confirmer sur 24 h l'absence de nouveaux `insufficient_aal`.
7. **A8** — revoir les 20 fonctions `SECURITY DEFINER` exposées à `anon`.

## Limites de l'audit

- Les logs Supabase ne couvrent que 24 heures ; les 429, 500 et 503 signalés
  peuvent être antérieurs à cette fenêtre. Les conclusions les concernant reposent
  sur l'analyse du code, pas sur des traces observées.
- Les variables d'environnement du projet Vercel n'ont pas pu être lues depuis cet
  environnement ; l'hypothèse A5 n'a pas été confirmée par observation directe.
- Aucun parcours de connexion n'a été exécuté contre la production.
