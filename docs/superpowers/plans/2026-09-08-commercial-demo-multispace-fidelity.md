# Commercial Demo Multi-Space Fidelity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rendre la vue multi-espace fidèle aux espaces TOK réels, restaurer les commandes/réservations avec Stripe Test dans le projet Démo isolé, afficher aussi l'espace Commercial et supprimer les quotas journaliers IA de présentation sans affaiblir les garde-fous serveur.

**Architecture:** Les quatre surfaces Client, Restaurateur, Commercial et Livreur restent de vraies instances de la SPA dans des iframes same-origin, liées à une session `commercial_demo_*` du projet Supabase Démo. Les commandes et réservations restent stockées exclusivement dans les tables Démo ; le paiement réutilise `commercial-demo-checkout` avec une vraie session Stripe Checkout en mode test, puis confirme via `commercial_demo_confirm_test_payment`. L'IA continue de passer par `commercial-demo-ai` et OpenAI côté serveur ; seuls les plafonds journaliers de présentation sont retirés, tandis que l'idempotence, la concurrence, le circuit breaker, le kill switch et le suivi de coûts restent actifs.

**Tech Stack:** React 18, Vite, TypeScript, TanStack Query, React Router, Supabase/PostgreSQL/RLS/Edge Functions, Stripe Checkout Test, Vitest, GitHub Actions.

**Spec:** Demande utilisateur du 7 septembre 2026 : tous les espaces de la vue multi-espace doivent reproduire les vrais espaces avec les mêmes fonctionnalités ; commandes, réservations et paiements sont des données Démo avec Stripe Test ; les fonctions IA doivent être fonctionnelles sans quota de présentation.

## Global Constraints

- Niveau de risque 3 : commandes, réservations, paiement, Supabase, Edge Functions et IA.
- Ne jamais écrire dans les tables transactionnelles de production depuis la Démo.
- Ne jamais utiliser une clé Stripe live pour la Démo ; toute session doit être `cs_test_*` et `livemode=false`.
- Les prix restent recalculés côté serveur à partir du menu Démo autoritaire.
- Le restaurant Démo doit rester `is_demo=true`, `status=demo`, `is_active=true` et sans Stripe Connect.
- L'IA Démo reste authentifiée, server-side et auditée ; « illimitée » signifie aucun quota journalier de présentation, pas suppression des protections de concurrence/circuit breaker.
- Ne modifier aucune migration historique déjà appliquée ; ajouter une migration forward-only.
- Ne jamais modifier `main` directement ; publier uniquement la branche dédiée et une PR non mergée.

---

### Task 1: Verrouiller les régressions multi-espace et paiement en TDD

**Files:**
- Modify: `src/test/commercial-multi-space-demo.test.ts`
- Modify: `src/test/commercial-demo-role-workspaces.test.ts`
- Modify: `src/test/commercial-demo-payment-simulator.test.ts`
- Modify: `src/test/commercial-demo-host-payment-isolation.test.ts`
- Modify: `src/test/commercial-demo-active-tools.test.ts`

**Interfaces:**
- Consumes: `CommercialDemoFrameSurface`, `commercial-demo-checkout`, `commercial_demo_confirm_test_payment`.
- Produces: contrats de régression exigeant quatre surfaces et Stripe Test réel.

- [ ] **Step 1: Écrire les attentes RED pour les quatre espaces**

Les tests doivent exiger `client`, `restaurant`, `commercial`, `courier`, une iframe par surface, la persistance des historiques et l'allowlist commerciale `/commercial` + `/commercial/comptabilite`.

- [ ] **Step 2: Écrire les attentes RED pour Stripe Test**

Les tests doivent exiger `createCommercialDemoCheckout`, `confirmCommercialDemoCheckout`, `cs_test_`, `checkout.stripe.com`, `stripe.checkout.sessions.create`, `livemode === false`, l'idempotency key et `commercial_demo_confirm_test_payment`, et refuser le simulateur `payment_provider: "none"` comme source principale.

- [ ] **Step 3: Vérifier RED**

Run attendu via CI GitHub ciblée/PR : les tests échouent sur l'état actuel parce que la surface Commercial est absente et que le paiement actuel est simulé sans Stripe.

### Task 2: Restaurer les quatre vraies surfaces dans la console

**Files:**
- Modify: `src/components/commercial/CommercialDemoBrowserGrid.tsx`
- Modify: `src/components/commercial/CommercialMultiSpaceDemo.tsx`

**Interfaces:**
- Consumes: `CommercialDemoFrameSurface`, `buildCommercialDemoFrameUrl`, `CommercialDemoFrameProvider`.
- Produces: grille à quatre surfaces avec contrôles navigateur indépendants.

- [ ] **Step 1: Réintégrer la surface Commercial**

Ajouter `commercial` dans `BROWSERS`, les runtimes et l'ordre visible ; conserver `/commercial` comme accueil et le chrome réel de l'espace commercial.

- [ ] **Step 2: Adapter les layouts**

Le mode Contrôle doit garder une fenêtre principale et trois secondaires ; la Mosaïque doit afficher quatre fenêtres sur les grands écrans, tout en conservant les variantes mobile/tablette et le plein écran existants.

- [ ] **Step 3: Mettre à jour la copie d'interface**

La console doit parler de quatre espaces et indiquer explicitement « Stripe Test uniquement ».

### Task 3: Restaurer le vrai Checkout Stripe Test isolé

**Files:**
- Modify: `src/lib/commercialDemoJourney.ts`
- Modify: `src/components/commercial/CommercialDemoActorWorkspace.tsx`
- Modify: `src/pages/Panier.tsx`
- Modify: `src/components/commercial/CommercialMultiSpaceDemo.tsx`
- Modify: `src/components/commercial/CommercialSingleSpaceDemo.tsx`
- Modify: `supabase/functions/commercial-demo-checkout/index.ts`

**Interfaces:**
- Produces: `createCommercialDemoCheckout`, `confirmCommercialDemoCheckout`, `openCommercialDemoCheckout`.
- Edge input create: `{action:"create", demo_restaurant_id, demo_session_id, return_url}`.
- Edge input confirm: `{action:"confirm", demo_restaurant_id, demo_session_id, stripe_session_id}`.
- Edge create output: `{checkout_url, stripe_session_id, mode:"test", demo_order_id, demo_session_id}`.
- Edge confirm output: `{paid, payment_status, mode:"test", stripe_session_id, demo_order_id, demo_session_id, snapshot}`.

- [ ] **Step 1: Restaurer les helpers frontend Stripe Test**

Valider `cs_test_*`, l'URL `https://checkout.stripe.com`, créer le checkout via l'Edge Function et confirmer le retour côté serveur.

- [ ] **Step 2: Restaurer le paiement du vrai panier Client**

Après `commercial_demo_create_order`, ouvrir Stripe Test au lieu de confirmer artificiellement le paiement. Ne pas effacer le panier avant confirmation.

- [ ] **Step 3: Restaurer le paiement du workspace client simplifié**

Le bouton doit afficher la carte Stripe Test `4242 4242 4242 4242` comme carte de démonstration et ouvrir la session Stripe Test.

- [ ] **Step 4: Restaurer le pont iframe -> orchestrateur**

La vue multi-espace et la vue mono-espace client doivent accepter le message uniquement de leur iframe client, vérifier origine/session/surface et rediriger uniquement vers `checkout.stripe.com`.

- [ ] **Step 5: Restaurer l'Edge Function Stripe Test**

Utiliser `getCommercialDemoStripeRuntime()`, exiger une clé test, calculer le montant autoritaire depuis la commande Démo, créer une Checkout Session idempotente, vérifier `livemode=false` et confirmer via `commercial_demo_confirm_test_payment`. Conserver `no_financial_ledger` et les contrôles `is_demo=true`, `status=demo`, `is_active=true`, Stripe Connect absent.

### Task 4: Rendre l'IA Démo sans quota journalier de présentation

**Files:**
- Create: `supabase/migrations/20260908013000_unlimit_commercial_demo_ai_presentation.sql`
- Modify: `src/test/commercial-demo-console-openai.test.ts`
- Modify if required by existing contract: `src/test/daily-dish-ai.test.ts`

**Interfaces:**
- Replaces implementation only: `public.commercial_demo_ai_claim_request(uuid,uuid,uuid,uuid,uuid,text,text,text,uuid)`.
- Preserves output states: `claimed`, `replay`, `mismatch`, `in_progress`, `failed`, `busy`, `circuit_open`, `disabled`.

- [ ] **Step 1: Écrire le test RED du quota**

Le dernier contrat doit exiger l'absence de branches journalières `budget_exhausted` dans la nouvelle fonction tout en exigeant le kill switch, l'idempotence, la concurrence et le circuit breaker.

- [ ] **Step 2: Ajouter la migration forward-only**

Recréer la fonction de claim sans plafonds 60/600 appels ni CHF 10/100 par jour. Conserver `provider_attempt_count`, `budget_reserved_chf` et `estimated_cost_chf` pour l'audit interne.

- [ ] **Step 3: Ajouter les assertions postflight**

La migration doit échouer si le kill switch, les locks, la limite de concurrence ou le circuit breaker disparaissent, ou si une branche `budget_exhausted` subsiste.

### Task 5: Vérification critique et publication

**Files:**
- All files changed above.

- [ ] **Step 1: Exécuter les tests ciblés**

Run: les tests commerciaux Démo, paiement, IA, panier/réservations et routes multi-espace.

- [ ] **Step 2: Exécuter les validations repository**

Run: `pnpm lint`, `pnpm typecheck`, `pnpm test`/shards CI pertinents, `pnpm build` ou `build:prod`, garde de collisions migrations et contrôles release imposés par CI.

- [ ] **Step 3: Vérifier Supabase en lecture seule**

Confirmer restaurant Démo actif et isolé, fonctions/RLS nécessaires, flags IA, absence de Stripe Connect et présence de `commercial_demo_confirm_test_payment`.

- [ ] **Step 4: Relire le diff**

Aucun secret, aucune clé live, aucune table production ajoutée au chemin de mutation, aucun fichier hors périmètre, UTF-8 intact.

- [ ] **Step 5: Créer le commit final et la PR**

Publier sur `codex/commercial-demo-multispace-fix-20260908`, ouvrir une PR vers `main`, contrôler les checks et laisser la PR non mergée.
