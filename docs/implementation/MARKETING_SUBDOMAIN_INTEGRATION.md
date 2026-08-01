# Intégration de `marketing.thetok.ch`

Ce document décrit l’intégration réellement livrée dans `Mtnrconcept1/cloud-rebuild` et l’ordre de mise en production. Il ne suppose ni adaptateur fournisseur ni moteur d’automatisations personnalisées.

## Contrat livré

- URL canonique : `https://marketing.thetok.ch/marketing`.
- La racine de ce host redirige vers `/marketing` sans changer d’origin.
- La route `/marketing` utilise `MarketingProtectedRoute` et une session BFF opaque ; le `AuthProvider`/SSO public n’est jamais monté sur cette surface.
- Le login exige mot de passe admin puis MFA TOTP. Le backend réapplique rôle, session, CSRF, feature flag, RLS et privilèges RPC ; le host seul n’accorde aucun accès.
- Le workspace n’affiche pas le chrome public, le panier, les intégrations natives client ni les outils commerciaux.
- `MarketingHostBoundary` est monté immédiatement sous `BrowserRouter`, avant `AuthProvider`. Il bloque le rendu pendant une transition et retire `code`, `state` et les fragments de jetons avant toute navigation inter-origines.
- Les callbacks PKCE restent canoniques sur `https://www.thetok.ch/auth` et `https://www.thetok.ch/auth/callback`.
- Le host marketing reçoit `X-Robots-Tag: noindex`, `Cache-Control: private, no-store`, `Referrer-Policy: no-referrer`, CSP et `X-Frame-Options`.
- Le scheduler calendrier est la seule automatisation exécutable. La pause globale vaut `true` au départ.
- `in_app` est le seul canal d’envoi automatique livré. Les appels, e-mails individuels et visites sont des tâches humaines. `tok_news` et les publications publiques sont manuels.
- Les règles personnalisées restent en `paused` et leur passage à `active` est refusé tant qu’aucun moteur n’existe.
- Les canaux externes restent `disconnected` ou `blocked_configuration`. L’orchestrateur les bloque même si une ligne est marquée `connected` sans `adapter_deployed`.

## Cartographie du code

| Zone | Fichiers principaux | Responsabilité |
|---|---|---|
| Domaine | `src/lib/marketingDomains.ts`, `MarketingHostBoundary.tsx` | Canonicalisation du host et assainissement des paramètres d’authentification |
| Route | `src/App.tsx`, `MarketingSessionProvider.tsx`, `MarketingProtectedRoute.tsx`, `MarketingLogin.tsx` | Isolation avant `AuthProvider`, login/MFA et garde fail-closed |
| Interface | `src/pages/marketing/MarketingWorkspace.tsx`, `src/components/marketing/views/*` | Vue d’ensemble, campagnes, calendrier, audiences, automatisations, journal, résultats et intégrations |
| Client backend | `src/marketing/marketingBffClient.ts`, `marketingClient.ts`, `useMarketingOperations.ts` | Transport same-origin borné, CSRF, RPC admin et appel de l’orchestrateur |
| BFF | `server/marketingBff.ts`, `api/marketing/**` | Login admin, TOTP, cookies `__Host-*`, rate-limit, session quatre heures et dispatcher service-role |
| Schéma | `supabase/migrations/20260801190000_marketing_operations_center.sql` | Huit tables métier, trois tables auth/session, RLS, preuves légales immuables, consentement, approvals, scheduler, journal et métriques |
| Exécution | `supabase/functions/marketing-orchestrator/index.ts` | Claims bornés, matérialisation, envoi in-app et blocage fail-closed des adaptateurs absents |
| Webhook | `supabase/functions/marketing-provider-webhook/index.ts` | HMAC générique, fraîcheur, anti-rejeu via l’unicité des événements et mise à jour monotone des statuts |
| Hébergement | `vercel.json`, `supabase/functions/_shared/cors.ts`, `supabase/config.toml` | Redirection, en-têtes privés, origin CORS exact et auth personnalisée des Edge Functions |

La migration marketing reste unique. Ne pas créer une migration corrective parallèle pendant la revue de cette livraison ; modifier la migration avant sa première application, ou créer une migration de suivi explicite seulement après qu’elle a été appliquée dans un environnement partagé.

## Frontière d’authentification

L’ordre d’exécution est volontaire :

1. `BrowserRouter` détermine le host et le chemin.
2. `MarketingHostBoundary` assainit ou redirige avant que la session soit lue.
3. `ApplicationBoundary` bifurque vers `MarketingApplication` **avant** le `AuthProvider` public.
4. `MarketingSessionProvider` interroge le BFF same-origin. Un anonyme reçoit uniquement un cookie CSRF host-only.
5. Le BFF authentifie le mot de passe côté serveur, relit `user_roles`, impose un TOTP et conserve les jetons Supabase chiffrés en Vault pendant dix minutes au maximum.
6. Après vérification `aal2`, il invalide la session Supabase locale et émet une session opaque `HttpOnly`, host-only, valable quatre heures.
7. `MarketingProtectedRoute` ne rend le workspace qu’avec cette session. Chaque mutation exige en plus un double-submit CSRF, un `Origin` exact et Fetch Metadata same-origin.
8. Le dispatcher PostgreSQL revalide session, rôle admin et feature flag dans la transaction, puis accepte exactement les 24 RPC prévues. Les workers restent `service_role`/cron et l’orchestrateur rejette tout JWT utilisateur.

Les tables marketing et leurs RPC admin n’accordent aucun droit à `authenticated`. Une session Supabase générique, même admin, ne suffit donc pas à traverser cette frontière.

## Contrat backend opérationnel

Le backend prend actuellement en charge :

- brouillons et approbation explicite des campagnes ;
- brouillons, approbation, programmation, annulation et clôture manuelle des éléments calendrier ;
- filtres d’audience autorisés et non vides, estimation totale et éligible par canal ;
- synchronisation bornée et reprenable du catalogue de prospects (500 par lot avec watermark) et des consentements clients (250 par lot avec curseur chiffré lié à l’administrateur), sans renvoyer de PII brute ni de `user_id` source ;
- recherche et pagination serveur des contacts et livraisons avec total exact, sans recherche sur e-mail, téléphone ou cible brute ;
- preuve append-only et audit résumé pour tout octroi, changement, réaffirmation, révocation ou opposition de base légale ;
- matérialisation idempotente des livraisons, limites de fréquence et quotidiennes, heures suisses, leases et retries bornés ;
- envoi `in_app` par le pipeline de notifications existant ;
- tâches `manual_call` et `manual_email`, avec révélation ponctuelle motivée, résultat et note obligatoires ; `manual_visit` reste bloqué sans adresse structurée ;
- journal de transitions, cibles masquées, agrégats et événements fournisseur ;
- suppression et annulation des attentes après désinscription ou plainte ;
- pause globale et feature flag comme deux contrôles distincts.

Il ne prend pas en charge :

- le `dry-run` ;
- un circuit breaker automatique ;
- le choix de canal par ML ou l’optimisation automatique des campagnes ;
- l’exécution des automatisations personnalisées ;
- l’envoi email/push/social ou la publication site ;
- la signature native de chaque fournisseur. Le webhook HMAC livré est un contrat interne générique, à placer derrière un adaptateur fournisseur.

## Secrets : runbook exact

| Nom logique | Emplacement | Valeur/usage |
|---|---|---|
| `marketing_bff_encryption_secret` | Supabase Vault SQL | Secret aléatoire d’au moins 32 octets, utilisé pour chiffrer les jetons du challenge MFA pending |
| `marketing_edge_url` | Supabase Vault SQL | `https://<project-ref>.supabase.co/functions/v1/marketing-orchestrator`, pour le projet du même environnement |
| `internal_cron_secret` | Supabase Vault SQL | Secret aléatoire utilisé par le wrapper `pg_cron` |
| `INTERNAL_CRON_SECRET` | Supabase Edge Function Secrets | Copie optionnelle de `internal_cron_secret`; le fallback service-role peut vérifier directement Vault |
| `MARKETING_WEBHOOK_SECRET` | Supabase Edge Function Secrets | Secret HMAC distinct, lu par `marketing-provider-webhook` |
| `SUPABASE_SERVICE_ROLE_KEY` | Vercel runtime | Secret exclusivement serveur du BFF, jamais préfixé `VITE_` |
| `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY` | Vercel runtime | Projet Auth/PostgREST de production |

Procédure :

1. Créer `marketing_bff_encryption_secret` et `marketing_edge_url` dans Vault, puis confirmer la présence de `internal_cron_secret` sans lire leurs valeurs.
2. Définir éventuellement `INTERNAL_CRON_SECRET` avec la même valeur cron. Ne créer `MARKETING_WEBHOOK_SECRET` qu’avec un adaptateur fournisseur réel.
3. Déployer `marketing-orchestrator` et `marketing-provider-webhook`.
4. Appliquer la migration après la présence des entrées Vault. Son bloc idempotent crée `tok-marketing-orchestrator` toutes les minutes, avec une commande qui appelle seulement `public.invoke_marketing_orchestrator_cron()` ; aucune URL ni valeur secrète n’est stockée dans la commande cron.
5. Si la migration a déjà été appliquée sans les secrets, créer les secrets puis rejouer uniquement le bloc idempotent `$marketing_scheduler$` dans une release revue.
6. Vérifier `public.marketing_scheduler_ready() = true`, le job actif, le feature flag actif et la pause globale toujours active.

Le wrapper refuse une URL qui n’est pas exactement un endpoint HTTPS Supabase `marketing-orchestrator`. Il lit Vault à chaque invocation et ne poste rien si le flag est coupé ou si la pause globale est active.

Le webhook calcule HMAC-SHA256 sur `<timestamp>.<corps-brut>`, attend les en-têtes `x-marketing-timestamp` et `x-marketing-signature`, rejette un timestamp distant de plus de cinq minutes et s’appuie sur l’identifiant fournisseur unique pour l’anti-rejeu. Ne pas exposer ce endpoint avant configuration de `MARKETING_WEBHOOK_SECRET` et d’un adaptateur qui normalise les événements du fournisseur.

## Vercel et DNS

Le sous-domaine sert le **même projet Vercel** que l’application. Le workflow officiel :

1. déploie l’output précompilé avec les trois variables Supabase runtime du BFF ;
2. vérifie les identifiants exacts de l’équipe et du projet de production ;
3. lit d’abord l’état de `marketing.thetok.ch`, puis l’ajoute seulement s’il est absent, sans `--force` ni réaffectation ;
4. attend la propriété vérifiée et une configuration DNS/TLS non erronée ;
5. vérifie `/marketing` (`200`, `noindex`, `no-store`) et `/api/marketing/session` sans cookie (`401`, `no-store`) ;
6. bloque le gate de production si un contrôle échoue.

Il ne faut ajouter aucune redirect URL marketing à Supabase Auth : le BFF ne passe pas par OAuth/PKCE. L’origin reste exactement `https://marketing.thetok.ch`, sans wildcard.

Contrôles réseau :

```bash
curl -I https://marketing.thetok.ch/
curl -I https://marketing.thetok.ch/marketing
```

Attendus : redirection temporaire same-origin de `/` vers `/marketing`, puis `200` SPA avec `X-Robots-Tag`, `Cache-Control: private, no-store`, `Referrer-Policy: no-referrer`, CSP et protection de frame.

## Ordre de déploiement

1. Préparer les trois entrées Vault requises, sans divulguer leurs valeurs.
2. Fusionner uniquement après CI verte et revue des droits BFF/RPC.
3. Laisser le workflow appliquer la migration puis déployer les deux Edge Functions.
4. Vérifier le job scheduler et la pause globale.
5. Laisser le workflow déployer le frontend/BFF, rattacher le domaine et exécuter ses smokes.
6. Effectuer la recette anonyme, mauvais mot de passe, non-admin, enrôlement TOTP, challenge TOTP, logout et session expirée.
7. Tester une seule audience interne consentie en `in_app`, puis une tâche et une publication manuelles.
8. Lever la pause avec un motif seulement après validation et surveiller le journal.

## Tests obligatoires

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
  src/test/feature-flags.test.ts
pnpm lint
pnpm run build:prod
```

Recette après déploiement :

1. Un anonyme et un utilisateur non-admin sont refusés ; un admin ne l’atteint qu’après TOTP. Le logout révoque le SID et un bearer Supabase générique reste insuffisant.
2. `code`, `state`, `access_token` et `refresh_token` ne traversent jamais l’origin marketing.
3. Le flag coupé et la pause globale bloquent chacun l’exécution.
4. La levée de pause échoue si le scheduler n’est pas prêt.
5. Une audience vide, un opt-out et un contact sans base légale ne produisent aucune livraison.
6. Une campagne et chaque élément exigent leur propre approbation.
7. L’in-app interne passe ; les actions humaines exigent une note ; les canaux externes restent bloqués.
8. Le webhook rejette signature invalide, timestamp expiré et replay.

Il n’existe aucun `dry-run`. Une recette d’envoi doit utiliser une audience interne consentie, explicitement identifiée et limitée.
