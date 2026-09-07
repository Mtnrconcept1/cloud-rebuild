# TOK SEO & Performance Remediation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Aligner l’index SEO de TOK sur l’inventaire réellement utile, rétablir les pages restaurants de Genève, réduire les Core Web Vitals dégradés et supprimer les signaux SEO trompeurs identifiés dans l’audit du 7 septembre 2026.

**Architecture:** La correction reste additive et bornée. La base reçoit une migration de performance pour la recherche publique ; le build SEO termine par une passe d’inventaire qui noindexe/exclut du sitemap les fiches trop pauvres et garantit un maillage crawlable des fiches conservées ; le frontend réserve l’affichage des notes aux vrais avis et stabilise les médias ; Vercel met en cache uniquement les assets hachés. Aucun paiement, rôle ou flux de commande n’est modifié.

**Tech Stack:** PostgreSQL/Supabase, React 18, Vite 6, TypeScript, Node 22, pnpm 10.28.1, Vitest, Vercel.

**Spec:** audit utilisateur « TOK · thetok.ch — Audit SEO & performance · 7 septembre 2026 ».

## Global Constraints

- Ne jamais modifier `main` directement ; branche `codex/seo-performance-remediation-20260907` et PR uniquement.
- Nouvelle migration uniquement ; ne pas réécrire l’historique Supabase.
- Conserver RLS et les `SECURITY DEFINER` avec `search_path` explicite et grants minimaux.
- Ne pas introduire de lecture non paginée côté navigateur.
- Ne pas inventer d’avis, d’horaires, de téléphone d’établissement ou de disponibilité.
- Les fiches annuaire peuvent rester accessibles par URL mais doivent sortir de l’index si elles n’ont pas de preuve utile.
- Les assets Vite hachés peuvent recevoir `max-age=31536000, immutable`; pas les HTML/sitemaps.
- Préserver UTF-8 et les accents français.

---

### Task 1: Protéger les régressions SEO/performance par tests

**Files:**
- Create: `src/test/seo-performance-remediation.test.ts`

**Interfaces:**
- Consumes: scripts/configurations actuels du repo.
- Produces: gardes sur la migration de recherche, l’inventaire indexable, le cache Vercel, les polices et l’affichage de notes vides.

- [ ] **Step 1: Write the failing test**
  - Exiger une migration `20260907100000_optimize_public_restaurant_catalog.sql`.
  - Refuser `2147483647` dans la nouvelle définition de pagination.
  - Exiger un index d’expression sur `public.normalize_search_text(city)`.
  - Exiger `scripts/harden-seo-indexable-inventory.mjs` et son exécution en fin de `build:prod`.
  - Exiger une règle cache immutable `/assets/:path*`.
  - Refuser `@import ... fonts.googleapis.com` dans `src/index.css` et exiger les `preconnect` du `<head>`.
  - Exiger que la fiche restaurant n’affiche pas une note quand aucun avis réel n’est disponible.

- [ ] **Step 2: Run test to verify it fails**
  - Run: `pnpm vitest run src/test/seo-performance-remediation.test.ts`
  - Expected: FAIL parce que migration/script/cache/fonts ne sont pas encore corrigés.

- [ ] **Step 3: Commit**
  - Commit tests seuls afin d’observer RED dans la CI de la PR.

### Task 2: Corriger le timeout du catalogue public

**Files:**
- Create: `supabase/migrations/20260907100000_optimize_public_restaurant_catalog.sql`

**Interfaces:**
- Consumes: `normalize_search_text`, `restaurant_is_publicly_visible`, tables restaurants/cuisines/réservations/commandes/offres.
- Produces: même signature publique `search_restaurants_catalog_page(...)` avec pagination <= 54 et comptage exact, sans appel interne avec limite INT_MAX.

- [ ] **Step 1: Add expression/filter indexes**
  - Indexer `normalize_search_text(city)` pour les filtres de commune.
  - Conserver des index partiels compatibles avec les lignes actives/non-demo et les images publiables.

- [ ] **Step 2: Replace only the pagination wrapper**
  - Construire la page à partir d’un jeu candidat filtré, compter et paginer sans demander 2 147 483 647 lignes à la RPC interne.
  - Préserver tri explicite et ordre quotidien stable pour la pertinence sans requête.
  - Préserver `SECURITY DEFINER`, `SET search_path TO public`, REVOKE/GRANT actuels et `NOTIFY pgrst`.

- [ ] **Step 3: Verify**
  - CI migration guard + tests Supabase concernés.
  - Après déploiement uniquement : rejouer `p_city='Genève'` et confirmer réponse < timeout PostgREST.

### Task 3: Faire converger sitemap, noindex et maillage avec l’inventaire utile

**Files:**
- Create: `scripts/harden-seo-indexable-inventory.mjs`
- Modify: `package.json`
- Modify: `scripts/harden-seo-crawl.mjs`

**Interfaces:**
- Consumes: `restaurants` publiques via clé anon, `cityIdentity.mjs`, HTML prérendu, `sitemap-restaurants.xml`.
- Produces: fiches indexables limitées aux établissements ayant une image vérifiée ou un service/horaires réellement disponibles ; toutes les fiches conservées sont liées depuis leur page ville.

- [ ] **Step 1: Collect quality inventory**
  - Lire les restaurants actifs par pages de 500.
  - Indexable = identité de base complète + visibilité publique + preuve utile (`image_url` vérifiée, horaires renseignés, réservation ou livraison active).
  - Les fiches insuffisantes restent accessibles mais reçoivent `noindex,follow,noarchive` et sortent du sitemap.

- [ ] **Step 2: Reconcile city pages**
  - Injecter/remplacer une navigation HTML crawlable vers toutes les fiches indexables de la commune.
  - Mettre l’`ItemList` JSON-LD en cohérence avec les liens réellement présents et le nombre réel d’éléments.

- [ ] **Step 3: Rewrite crawler copy for humans**
  - Remplacer les phrases « éligibles à l’indexation / afin d’aider Google » par un argumentaire client : adresses vérifiées, réservation/commande selon disponibilité et exploration par commune/cuisine.

- [ ] **Step 4: Run as final SEO hardener**
  - Ajouter le script en dernier dans `build:prod` et `seo:prerender` afin qu’aucun hardener antérieur ne réintroduise une fiche exclue.

### Task 4: Supprimer les signaux restaurant trompeurs

**Files:**
- Modify: `src/lib/seo/restaurantEntity.mjs`
- Modify: `src/pages/RestaurantDetail.tsx`

**Interfaces:**
- Consumes: `review_count`, `rating`, `supports_reservation`, `is_directory_listing`, `updated_at`.
- Produces: données structurées et UI qui n’inventent ni note zéro, ni téléphone annuaire comme preuve locale, ni fraîcheur de build.

- [ ] **Step 1: Ratings**
  - Émettre/afficher une note seulement si `review_count > 0` et `rating > 0`.
  - Sinon afficher un état neutre « Pas encore d’avis » sans `0.0/10`.

- [ ] **Step 2: Directory NAP**
  - Pour les fiches annuaire non revendiquées, ne pas utiliser un téléphone non vérifié dans le JSON-LD/SEO.
  - N’émettre `acceptsReservations` que lorsque le service est explicitement vrai ; omettre la propriété lorsque l’état est inconnu/non proposé.

- [ ] **Step 3: Freshness**
  - Utiliser `updated_at` réel ; ne jamais substituer la date du build.

### Task 5: Réduire CLS, images et chemin critique

**Files:**
- Modify: `src/components/RestaurantCard.tsx`
- Modify: `src/pages/Index.tsx` uniquement si une dimension média d’accueil reste non réservée.
- Modify: `src/index.css`
- Modify: `index.html`
- Modify: `vercel.json`

**Interfaces:**
- Consumes: helper `optimizedImages.ts` existant.
- Produces: zones image dimensionnées, lazy-loading hors LCP, fontes découvertes depuis le head et assets hachés immuables.

- [ ] **Step 1: Stabilize image boxes**
  - Conserver des ratios explicites sur cartes/illustrations et renseigner `width`/`height` lorsque la source a une dimension stable.
  - Maintenir `alt` descriptif pour contenu, `alt=""` uniquement pour décoratif.

- [ ] **Step 2: Fonts**
  - Retirer l’`@import` bloquant de `src/index.css`.
  - Ajouter `preconnect` Google Fonts/GStatic et lien stylesheet non bloquant dans `index.html`.
  - Charger DM Sans et Playfair Display globalement ; Bubblegum Sans reste uniquement si la homepage le requiert réellement, sinon fallback local pour la bulle de catégorie.

- [ ] **Step 3: Asset caching**
  - Ajouter `/assets/:path*` avec `Cache-Control: public, max-age=31536000, immutable` dans `vercel.json`.

- [ ] **Step 4: Static heavy assets**
  - Préférer les variantes WebP déjà disponibles ou ajouter des variantes optimisées si les fichiers sources peuvent être traités sans perte visuelle.
  - Ne jamais masquer une source externe incorrecte par un hotlink non contrôlé.

### Task 6: Reviews, anglais et éléments hors code

**Files:**
- No database permission change unless a failing test proves it is needed.

**Interfaces:**
- Consumes: RLS `reviews_published_owner_admin_select` et données réelles.
- Produces: constat vérifié et tâches non falsifiées.

- [ ] **Step 1: Reviews**
  - Vérifier RLS/grants et nombre d’avis. Si SELECT public est déjà correct, ne pas élargir les droits ; le manque d’avis est un problème de contenu/acquisition, pas un 401 à corriger par suppression de sécurité.

- [ ] **Step 2: English/hreflang**
  - N’ajouter `hreflang` que si de vraies routes anglaises équivalentes existent. Si elles n’existent pas, ne pas créer de balises mensongères dans ce correctif.

- [ ] **Step 3: Search Console / firewall / authority / brand**
  - Vérifier ce qui est observable côté Vercel ; la Search Console, les backlinks/relations presse et le choix de marque restent des actions externes si aucun connecteur correspondant n’est disponible.

### Task 7: Validation et livraison

**Files:**
- All modified files above.

- [ ] **Step 1: CI validation**
  - `pnpm lint`
  - `pnpm typecheck`
  - tests ciblés puis suite affectée/production selon classifier CI
  - `pnpm run build:prod`
  - migration collision guard et validations Supabase déclenchées par CI

- [ ] **Step 2: Review diff**
  - Aucun secret, aucun paiement, aucune route privée, aucune migration destructive.

- [ ] **Step 3: PR**
  - Ouvrir une PR vers `main`, laisser les checks s’exécuter et ne pas fusionner.

## Rollback

- Revert des commits de la PR avant merge si une validation échoue.
- Après un éventuel déploiement futur, la migration n’efface aucune donnée : rollback applicatif par restauration de l’ancienne fonction via une migration corrective ; les index ajoutés peuvent rester sans impact fonctionnel.
- Les changements SEO/front/Vercel se revertent sans opération de données.
