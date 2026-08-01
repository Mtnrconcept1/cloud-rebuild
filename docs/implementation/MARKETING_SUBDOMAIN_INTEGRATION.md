# Intégration de `marketing.thetok.ch`

Ce document décrit l’intégration réellement livrée dans `Mtnrconcept1/cloud-rebuild` et l’ordre de mise en production. Il ne suppose ni adaptateur fournisseur ni moteur d’automatisations personnalisées.

## Contrat livré

- URL canonique : `https://marketing.thetok.ch/marketing`.
- La racine de ce host redirige vers `/marketing` sans changer d’origin.
- La route `/marketing` utilise `<ProtectedRoute requiredRole="admin">` et le flag `admin-marketing-operations`.
- Le backend réapplique les gardes admin, RLS et privilèges RPC ; le host seul n’accorde aucun accès.
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
| Route | `src/App.tsx`, `src/lib/featureCatalog.ts` | Isolation des providers/chromes, garde admin et kill-switch |
| Interface | `src/pages/marketing/MarketingWorkspace.tsx`, `src/components/marketing/views/*` | Vue d’ensemble, campagnes, calendrier, audiences, automatisations, journal, résultats et intégrations |
| Client backend | `src/marketing/marketingClient.ts`, `useMarketingOperations.ts` | RPC admin, lecture fail-closed et appel de l’orchestrateur |
| Schéma | `supabase/migrations/20260801190000_marketing_operations_center.sql` | Sept tables marketing, RLS, consentement, approvals, scheduler, journal et métriques |
| Exécution | `supabase/functions/marketing-orchestrator/index.ts` | Claims bornés, matérialisation, envoi in-app et blocage fail-closed des adaptateurs absents |
| Webhook | `supabase/functions/marketing-provider-webhook/index.ts` | HMAC générique, fraîcheur, anti-rejeu via l’unicité des événements et mise à jour monotone des statuts |
| Hébergement | `vercel.json`, `supabase/functions/_shared/cors.ts`, `supabase/config.toml` | Redirection, en-têtes privés, origin CORS exact et auth personnalisée des Edge Functions |

La migration marketing reste unique. Ne pas créer une migration corrective parallèle pendant la revue de cette livraison ; modifier la migration avant sa première application, ou créer une migration de suivi explicite seulement après qu’elle a été appliquée dans un environnement partagé.

## Frontière d’authentification

L’ordre d’exécution est volontaire :

1. `BrowserRouter` détermine le host et le chemin.
2. `MarketingHostBoundary` assainit ou redirige avant que la session soit lue.
3. `AuthProvider` restaure la session uniquement sur le host accepté.
4. `ProtectedRoute` exige `admin`.
5. Le feature flag autorise la surface.
6. Chaque RPC sensible vérifie à nouveau l’admin ; les RPC worker/provider sont réservés à `service_role`.

Cette séquence évite une initialisation sur le mauvais host, mais elle ne corrige pas le stockage de session existant : les cookies Supabase sont encore lisibles par JavaScript et partagés avec `.thetok.ch`. Avant production, remplacer ce partage par un échange serveur puis un cookie `Secure`, `HttpOnly`, host-only sur `marketing.thetok.ch`, ou par une session marketing dédiée ayant les mêmes propriétés. Sans ce changement, une XSS sur un domaine frère peut voler le bearer admin malgré les gardes de route et RLS.

## Contrat backend opérationnel

Le backend prend actuellement en charge :

- brouillons et approbation explicite des campagnes ;
- brouillons, approbation, programmation, annulation et clôture manuelle des éléments calendrier ;
- filtres d’audience autorisés et non vides, estimation totale et éligible par canal ;
- synchronisation du catalogue de prospects et des consentements clients sans renvoyer de PII brute ;
- matérialisation idempotente des livraisons, limites de fréquence et quotidiennes, heures suisses, leases et retries bornés ;
- envoi `in_app` par le pipeline de notifications existant ;
- tâches `manual_call`, `manual_email` et `manual_visit`, avec résultat et note obligatoires ;
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
| `marketing_edge_url` | Supabase Vault SQL | `https://<project-ref>.supabase.co/functions/v1/marketing-orchestrator`, pour le projet du même environnement |
| `internal_cron_secret` | Supabase Vault SQL | Secret aléatoire utilisé par le wrapper `pg_cron` |
| `INTERNAL_CRON_SECRET` | Supabase Edge Function Secrets | Copie exacte de `internal_cron_secret`, lue par l’authentification de l’orchestrateur |
| `MARKETING_WEBHOOK_SECRET` | Supabase Edge Function Secrets | Secret HMAC distinct, lu par `marketing-provider-webhook` |

Procédure :

1. Tourner d’abord tout secret historique qui aurait été inclus en clair dans `cron.job.command`.
2. Générer deux valeurs fortes distinctes : une pour cron, une pour le webhook.
3. Créer ou mettre à jour `internal_cron_secret` et `marketing_edge_url` dans Vault. Utiliser une opération d’administration qui n’inscrit pas les valeurs dans Git, une migration ou un log partagé.
4. Définir `INTERNAL_CRON_SECRET` avec la même valeur cron et `MARKETING_WEBHOOK_SECRET` avec la valeur webhook dans les secrets des Edge Functions.
5. Déployer `marketing-orchestrator` et `marketing-provider-webhook`.
6. Appliquer la migration seulement après la présence des entrées Vault. Son bloc idempotent crée `tok-marketing-orchestrator` toutes les minutes, avec une commande qui appelle seulement `public.invoke_marketing_orchestrator_cron()` ; aucune URL ni valeur secrète n’est stockée dans la commande cron.
7. Si la migration a déjà été appliquée sans les secrets, créer les secrets puis rejouer uniquement le bloc idempotent `$marketing_scheduler$` dans une release revue.
8. Vérifier `public.marketing_scheduler_ready() = true`, le job actif et la pause globale toujours active. Ce signal contrôle le job et les entrées Vault, mais ne peut pas vérifier que `INTERNAL_CRON_SECRET` contient effectivement la même valeur : tester séparément l’authentification de l’Edge Function sans divulguer le secret.

Le wrapper refuse une URL qui n’est pas exactement un endpoint HTTPS Supabase `marketing-orchestrator`. Il lit Vault à chaque invocation et ne poste rien si le flag est coupé ou si la pause globale est active.

Le webhook calcule HMAC-SHA256 sur `<timestamp>.<corps-brut>`, attend les en-têtes `x-marketing-timestamp` et `x-marketing-signature`, rejette un timestamp distant de plus de cinq minutes et s’appuie sur l’identifiant fournisseur unique pour l’anti-rejeu. Ne pas exposer ce endpoint avant configuration de `MARKETING_WEBHOOK_SECRET` et d’un adaptateur qui normalise les événements du fournisseur.

## Vercel et DNS

Le code suppose que le sous-domaine sert le **même projet Vercel** que l’application, pas une seconde application :

1. Déployer la branche fusionnée par le workflow GitHub Actions officiel.
2. Dans le projet Vercel de production TheTOK, ajouter le domaine `marketing.thetok.ch`.
3. Chez le gestionnaire DNS, créer l’enregistrement que Vercel affiche pour ce domaine. La cible peut dépendre de la configuration du compte ; ne pas la coder en dur dans ce guide.
4. Attendre la validation Vercel et le certificat TLS.
5. Ne pas ajouter de rewrite host spécifique : le rewrite SPA existant sert `index.html`. La redirection host-aware de `/` vers `/marketing` suffit.
6. Ne pas ajouter `marketing.thetok.ch/auth` ni `marketing.thetok.ch/auth/callback` aux redirect URLs Supabase. Le callback reste sur `www` jusqu’à la mise en place de l’échange de session host-only.
7. Conserver l’origin CORS exacte `https://marketing.thetok.ch` ; aucune wildcard.

Contrôles réseau :

```bash
curl -I https://marketing.thetok.ch/
curl -I https://marketing.thetok.ch/marketing
```

Attendus : redirection temporaire same-origin de `/` vers `/marketing`, puis `200` SPA avec `X-Robots-Tag`, `Cache-Control: private, no-store`, `Referrer-Policy: no-referrer`, CSP et protection de frame.

## Ordre de déploiement

1. Faire tourner les secrets historiques exposés et préparer Vault/Edge Secrets.
2. Fusionner après CI verte.
3. Déployer les deux Edge Functions.
4. Appliquer la migration et vérifier le job scheduler.
5. Déployer le frontend.
6. Relier le domaine Vercel et le DNS, sans lever la pause globale.
7. Terminer le durcissement de session host-only.
8. Effectuer la recette anonyme/non-admin/admin et la recette de consentement.
9. Tester une seule audience interne consentie en `in_app`, puis une tâche et une publication manuelles.
10. Lever la pause avec un motif seulement après validation et surveiller le journal.

## Tests obligatoires

```bash
pnpm vitest run \
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

1. Un anonyme et un utilisateur non-admin sont refusés ; un admin atteint le workspace.
2. `code`, `state`, `access_token` et `refresh_token` ne traversent jamais l’origin marketing.
3. Le flag coupé et la pause globale bloquent chacun l’exécution.
4. La levée de pause échoue si le scheduler n’est pas prêt.
5. Une audience vide, un opt-out et un contact sans base légale ne produisent aucune livraison.
6. Une campagne et chaque élément exigent leur propre approbation.
7. L’in-app interne passe ; les actions humaines exigent une note ; les canaux externes restent bloqués.
8. Le webhook rejette signature invalide, timestamp expiré et replay.

Il n’existe aucun `dry-run`. Une recette d’envoi doit utiliser une audience interne consentie, explicitement identifiée et limitée.
