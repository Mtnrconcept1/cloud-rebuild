# Audit complet codebase TOK - 2026-06-19

## Perimetre

Audit local du depot `C:\Users\Pc\cloud-rebuild-recovered` realise sans acces direct a la base de production, sans modification de secrets, sans push Supabase et sans preview Vercel.

Sources inspectees :

- Application React/Vite/TypeScript : routes, hooks, pages, composants, stockage local, integration Supabase.
- Supabase : migrations, fonctions Edge, RLS, usage service role, webhooks Stripe.
- Configuration : `package.json`, `vite.config.ts`, `vercel.json`, workflows et scripts via recherche statique.
- Tests et garde-fous locaux.

Limites importantes :

- L'utilite definitive des tables ne peut pas etre prouvee par lecture statique seule. Certaines tables peuvent etre utilisees uniquement par triggers SQL, RPC, fonctions SECURITY DEFINER, jobs planifies, analytics ou donnees historiques.
- Aucune requete directe n'a ete lancee sur la base de production. Les recommandations concernant les tables doivent etre confirmees avec `pg_stat_user_tables`, dependances FK/RPC, volumes, derniere ecriture et logs Supabase.
- La validation visuelle authentifiee de l'admin Operations Center n'a pas ete faite.

## Synthese executive

L'architecture principale est globalement coherente : les routes admin, restaurateur, coursier et client sensibles sont protegees, les fonctions de paiement recalculent les montants cote serveur, Stripe webhook verifie le corps brut et l'idempotence est presente, les variables publiques Supabase sont controlees au build, et les garde-fous de securite XSS connus sont testes.

Il reste cependant plusieurs dettes a traiter avant de pouvoir dire que le produit ne depend plus d'anciens systemes :

1. Des dependances ancien fournisseur IA restent actives ou referencees, y compris en runtime Edge Function.
2. La marque/fonctionnalite `Miamz` reste fortement presente dans les routes, SEO, localStorage, checkout et contrats de metadonnees.
3. 66 tables du typage Supabase ne sont pas referencees directement par le runtime applicatif scanne. Elles ne doivent pas etre supprimees sans audit de production, mais elles forment une vraie dette de schema.
4. Des requetes larges ou sans limite explicite restent candidates a durcir pour le passage a l'echelle.
5. Le test suite local echoue actuellement sur un test campagne sponsorisee, dans un fichier deja modifie dans le worktree.

## Etat des verifications locales

| Commande | Resultat | Notes |
| --- | --- | --- |
| `pnpm lint` | OK | Lint complet passe. |
| `pnpm test` | KO | 1 echec : `src/test/campaign-creative.test.ts` attend encore `getBannerSeparatorClass` et la logique de placement bannieres dans `src/components/campaigns/SponsoredRestaurantTemplateCard.tsx`. |
| `pnpm build` | OK | Build production Vite passe. Warning : chunk `assets/index-*.js` > 500 kB. |
| `pnpm audit --prod` | OK | Aucune vulnerabilite connue remontee. |

Etat worktree au moment de l'audit : des changements non commit sont deja presents hors rapport, notamment `src/components/campaigns/SponsoredRestaurantTemplateCard.tsx`, `src/components/dashboard/TokAiMarketingStudio.tsx`, `supabase/functions/ai-image-enhance/index.ts`, plusieurs fichiers `outputs/`, images `public/` et script temporaire `tmp/generate_tok_business_plan_docx.py`. Ils n'ont pas ete revert.

## Constats critiques et eleves

### 1. References ancien fournisseur IA encore presentes

Gravite : elevee si la sortie de ancien fournisseur IA est un objectif produit, moyenne sinon.

Constats :

- `README.md:1`, `README.md:5`, `README.md:121`, `README.md:179` restent le README generique ancien fournisseur IA.
- `package.json:151` conserve `ancien-fournisseur-ia-tagger`.
- `vite.config.ts:4` importe `componentTagger` depuis `ancien-fournisseur-ia-tagger`. Usage limite au developpement, donc pas bloquant production.
- `vercel.json:16` autorise encore `https://*.ancien-fournisseur-iaproject.com` dans le CSP `connect-src`.
- `supabase/functions/generate-campaign/index.ts:225-234` utilisait une ancienne cle IA et appelait un gateway tiers.
- `supabase/functions/restaurant-advisor/index.ts:123-124` acceptait cette ancienne cle IA comme alternative, et `index.ts:331-336` appelait ce gateway tiers si OpenAI n'etait pas utilise.

Impact :

- Le produit n'est pas encore independant de l'ancien systeme ancien fournisseur IA.
- Le CSP autorise un domaine externe non necessaire si ancien fournisseur IA n'est plus un fournisseur actif.
- Les fonctions IA peuvent echouer ou bifurquer vers un fournisseur non documente dans les secrets actuels.

Action recommandee :

- Decider explicitement si ancien fournisseur IA reste fournisseur IA.
- Si non : migrer `generate-campaign` et `restaurant-advisor` vers le fournisseur cible, supprimer l'ancienne cle IA, nettoyer `vercel.json`, README, le package de taggage obsolete et `vite.config.ts`.
- Si oui : documenter ancien fournisseur IA comme fournisseur actif, ajouter garde-fous d'erreur explicites et secrets attendus.

### 2. Dette `Miamz` encore structurelle

Gravite : elevee si `Miamz` est un ancien systeme a retirer, faible/moyenne si c'est une marque produit conservee.

Constats principaux :

- Route publique : `src/App.tsx:62` et `src/App.tsx:406` chargent `/miamz-solidaires`.
- SEO/prerender : `scripts/prerender-seo.mjs:121-126`, `253`, `325-356`, `381-501`, `851-900`, `1139`.
- Stockage local : `src/lib/auth.tsx:17` utilise `miamz-active-role`; `src/lib/cart.tsx:58-103` utilise `miamz-order-mode`, `miamz-cart`, `miamz-cart-metadata`.
- Checkout : `supabase/functions/create-checkout/index.ts:148-151`, `773`, `792-862`, `933-1063`, `1109-1113`.

Impact :

- La dette n'est pas seulement cosmétique. Elle touche les contrats de checkout, les drops VIP, les avantages fidelite et la persistance navigateur.
- Un renommage direct casserait les sessions locales et potentiellement des metadonnees Stripe/webhook deja emises.

Action recommandee :

- Clarifier le statut produit : `Miamz` doit-il rester le nom des points solidaires ou etre migre vers `TOK Points`/autre ?
- Si migration : prevoir compatibilite ascendante, migration localStorage, alias de metadonnees Stripe, migration SQL non destructive et tests de non-regression checkout.

### 3. Tables sans reference runtime directe

Gravite : elevee comme dette schema, mais aucune suppression ne doit etre faite sans audit DB.

Le typage Supabase expose 138 tables publiques. Le scan statique du runtime applicatif a trouve 72 tables referencees directement et 66 tables sans reference directe dans `src`, `supabase/functions` et `scripts` hors tests/types/migrations.

Tables a auditer en base avant toute decision :

`allergens`, `cart_item_modifiers`, `cart_items`, `carts`, `categories`, `compensations`, `conversations`, `courier_documents`, `credit_notes`, `delivery_batches`, `delivery_routes`, `dish_allergens`, `dish_availability_windows`, `dish_images`, `dish_modifier_groups`, `dish_modifier_options`, `dish_tags`, `dish_variants`, `dishes`, `feature_store`, `fraud_signals`, `gift_cards`, `incident_reports`, `inventory_items`, `inventory_movements`, `invoices`, `loyalty_accounts`, `menu_categories`, `messages`, `ml_predictions`, `order_addresses`, `order_events`, `order_fees`, `order_issues`, `order_item_modifiers`, `order_notes`, `order_refunds`, `order_status_history`, `order_taxes`, `payment_intents`, `payout_batches`, `payouts`, `rate_limit_buckets`, `recommendation_logs`, `referral_codes`, `reservation_status_history`, `restaurant_daily_kpis`, `restaurant_delivery_rules`, `restaurant_documents`, `restaurant_hours`, `restaurant_payout_settings`, `restaurant_recommendations`, `restaurant_service_areas`, `restaurant_settings`, `restaurant_staff`, `review_replies`, `signup_application_documents`, `support_messages`, `support_tickets`, `user_addresses`, `user_analytics`, `user_devices`, `user_notification_settings`, `user_payment_methods`, `user_referrals`, `wallet_transactions`.

Interpretation :

- Certaines tables semblent etre des vestiges d'un modele e-commerce plus detaille (`dishes`, `dish_*`, `carts`, `cart_items`) alors que le runtime actuel utilise surtout `menu_items`, `orders`, `order_items`.
- D'autres peuvent etre des fondations non encore connectees, ou utilisees par RPC/triggers uniquement (`order_status_history`, `reservation_status_history`, `restaurant_daily_kpis`, `rate_limit_buckets`, `payment_intents`).

Action recommandee :

- Executer un audit production dedie : row count, derniere insertion/update, taille table/index, dependances FK, dependances de fonctions, policies, triggers, logs Edge/API.
- Classer chaque table en `active`, `foundation`, `historical`, `candidate_archive`, `candidate_drop`.
- N'envisager `DROP TABLE` qu'apres migration d'archivage, sauvegarde et validation RLS/RPC.

### 4. Test suite non verte

Gravite : elevee pour release.

`pnpm test` echoue sur `src/test/campaign-creative.test.ts:125`. Le test attend des garde-fous textuels dans `src/components/campaigns/SponsoredRestaurantTemplateCard.tsx`, notamment `getBannerSeparatorClass` et la logique de placement de banniere. Le fichier source est deja modifie dans le worktree.

Action recommandee :

- Reconciler le composant et le test : soit restaurer l'intention de garde-fou, soit mettre a jour le test si la nouvelle implementation est volontaire et equivalente.
- Ne pas publier tant que `pnpm test` n'est pas vert.

## Securite

### Points solides

- Le client Supabase front est cree avec variables publiques uniquement : `src/integrations/supabase/client.ts` et `src/lib/publicEnv.ts`.
- Le build production echoue si les variables publiques Supabase critiques manquent via `vite.config.ts`.
- Les routes sensibles sont protegees dans `src/App.tsx` :
  - Client : `/commandes`, `/commande/:id`, `/reservations`, `/profil`, `/notifications`, `/points-cadeau`.
  - Dashboard restaurateur : routes `/dashboard/*` via `DashboardRoute`, sauf alias de redirection.
  - Courier : `/courier/*` via `ProtectedRoute requiredRole="courier"`.
  - Admin : `/admin/*` via `AdminProtectedRoute` ou `AdminDashboardRoute`.
- Les fonctions Edge utilisent `SUPABASE_SERVICE_ROLE_KEY` cote serveur uniquement. Aucun service role front n'a ete trouve.
- Stripe webhook lit le corps brut avec `req.text()` (`supabase/functions/stripe-webhook/index.ts:497`) et verifie via `constructEventAsync` (`index.ts:536`).
- Idempotence webhook presente via `stripe_webhook_events` (`supabase/functions/stripe-webhook/index.ts:74`).
- Les sinks HTML/CSS identifies sont encadres :
  - `dangerouslySetInnerHTML` dans `src/components/ui/chart.tsx:72` passe par `buildChartStyleCss` et sanitization CSS.
  - Impression facture via `outerHTML` dans `TokPayableInvoiceDialog` passe par `safePrintWindow`, qui bloque scripts, handlers et URLs `javascript:`.
  - Tests dedies : `src/test/print-and-chart-sinks.test.ts`.
- Headers de securite presents dans `vercel.json` : CSP, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`, `X-Frame-Options`, `frame-ancestors 'none'`, `object-src 'none'`.

### Points a durcir

- CSP : retirer `https://*.ancien-fournisseur-iaproject.com` si ancien fournisseur IA n'est plus actif.
- CSP : `style-src 'unsafe-inline'` reste present. C'est frequent avec Tailwind/shadcn, mais a garder dans le registre des risques.
- Sessions web : Supabase auth utilise localStorage sur web (`src/integrations/supabase/authStorage.ts:23-29`). C'est standard SPA, mais l'impact XSS inclut le vol de session. Continuer a prioriser CSP, sanitization et absence de HTML non controle.
- `postMessage` sortant vers service worker Firebase dans `src/lib/push.ts:145`. Aucun handler entrant problematique n'a ete detecte dans le scan, mais garder le payload minimal.

## Supabase, RLS et migrations

### Points solides

- Le risque historique `social_post_comments` est corrige localement :
  - Migration recursive initiale : `supabase/migrations/20260522075454_social_reactions_and_comment_threads.sql:125-138`.
  - Migration corrective : `supabase/migrations/20260531035500_fix_social_post_comments_recursive_policy.sql:5-7`.
- Le nouveau trigger de mentions/reponses lit le parent dans une fonction SQL (`supabase/migrations/20260616123000_social_comment_reply_mentions.sql:36`), pas dans une policy RLS. Cela doit rester surveille, mais ce n'est pas le meme pattern de recursion RLS.

### Points a verifier en production

- Le scan des migrations a detecte des definitions historiques `SECURITY DEFINER` sans `SET search_path` proche. Plusieurs peuvent avoir ete remplacees par migrations ulterieures. Il faut verifier l'etat courant de `pg_proc`, pas editer les anciennes migrations.
- Ajouter une requete d'audit DB current-state pour :
  - fonctions SECURITY DEFINER sans `search_path` securise,
  - policies qui requetent leur propre table,
  - tables sans RLS alors qu'elles exposent donnees utilisateur/restaurant,
  - policies admin/restaurateur/courier coherentes par role.

## Routes et logique metier

### Conforme

- Le shell applicatif suit le modele attendu : ErrorBoundary, QueryClientProvider, AuthProvider, CartProvider, BrowserRouter, Navbar, deep-link/push native.
- Les routes principales client, dashboard, courier et admin correspondent au scope produit.
- Les pages sensibles sont combinees avec roles et feature flags.
- Les routes paiement/commande sont feature-gatees et les montants sont recalcules cote serveur via `supabase/functions/_shared/order-pricing.ts` et `create-checkout`.

### Ecarts ou points a clarifier

- `/miamz-solidaires` est public et non feature-gate (`src/App.tsx:406`). A confirmer selon strategie produit.
- Les alias dashboard suivants redirigent sans wrapper `DashboardRoute` : `src/App.tsx:416`, `420`, `431`. Ils ne servent pas de donnees, donc le risque est faible, mais une protection uniforme serait plus propre.
- La route `/actualites` est feature-gatee mais pas dans `ClientSurfaceRoute` (`src/App.tsx:409`). A confirmer si l'absence du wrapper est volontaire.

## Performance et passage a l'echelle

### Points solides

- Les tests de gouvernance performance/query limits existent et passent dans la suite jusqu'au blocage campagne.
- Plusieurs modules admin et publics utilisent deja limites, pagination ou ranges.
- Le build est decoupe en chunks, avec vendors separes.

### Risques detectes

Requetes candidates a borner, paginer ou documenter :

- `src/components/home/SearchAndCategories.tsx` : `cuisines.select("*").order("name")` sans limite. Table probablement petite, mais a borner.
- `src/hooks/useLaunchPack.ts` : `launch_packs.select("*").eq("is_active", true).order("position")` sans limite.
- `src/hooks/useAdminLaunchPacks.ts` : `restaurant_launch_packs.select("*, launch_packs (*)...")` sans limite.
- `src/hooks/useTokOne.ts` : plans/benefits sans limite explicite.
- `src/pages/admin/AdminNotifications.tsx` : `notification_campaigns.select("*").order(...)` sans limite.
- `src/pages/admin/AdminUtilisateurs.tsx` : `signup_applications` et `couriers` sans limite.
- `src/pages/admin/DropsManagement.tsx` : `chef_table_drops.select("*, restaurants(name)")` sans limite.
- `src/pages/BudgetAuto.tsx` : `menu_items.select("*, restaurants(...))` public sans limite.
- `src/pages/dashboard/DashboardPromotions.tsx` : promotions par restaurants sans limite.
- `src/pages/dashboard/DashboardPlanSalle.tsx` : plusieurs `select("*")` bornes par contexte, mais a capped par defense.

Build :

- `pnpm build` passe mais Vite signale un chunk principal > 500 kB. Priorite : continuer la lazy-load des pages lourdes, analyser `DashboardPlanSalle`, charts, observability, UI vendor.

## Paiements et abonnements

Points positifs :

- Calculs de montants centralises/serveur : `supabase/functions/_shared/order-pricing.ts`.
- `create-checkout` stocke un `authoritative_total` et cree les line items Stripe cote serveur.
- Webhook Stripe : corps brut, verification signature, idempotence via table dediee.
- Tests de garde-fou paiement presents et passes dans la suite executee avant l'echec global.

Risques residuels :

- Les metadonnees `miamz_*` sont contractuelles et doivent rester compatibles si rebranding.
- Toute evolution checkout/webhook/refund doit conserver idempotence et recalcul serveur.

## Notifications, support, operations

Constats :

- Les modules admin notifications, operations center, sinistres, audit, support et dashboard sont presents et route-proteges.
- Les fonctions `send-push`, `send-email`, `notification-dispatch`, `dispatch-order`, `dispatch-timeout` utilisent service role cote serveur.
- Les preferences utilisateur existent dans le schema (`user_notification_settings`) mais ne sont pas referencees directement par le runtime scanne. A verifier cote RPC/triggers/jobs avant de conclure a une table inutile.

Action recommandee :

- Auditer les flux de consentement/desabonnement notifications en production.
- Verifier que tous les envois respectent role, audience, opt-out et audit logs.

## Recommandations priorisees

1. Corriger l'echec `pnpm test` sur `campaign-creative.test.ts` avant toute release.
2. Decider et traiter la dependance ancien fournisseur IA : retirer completement ou documenter comme fournisseur actif.
3. Clarifier le statut `Miamz` : conserver comme marque produit ou lancer une migration controlee.
4. Lancer un audit Supabase production des 66 tables sans reference directe avant toute suppression.
5. Ajouter limites/pagination aux requetes candidates, en priorite pages publiques et admin volumineuses.
6. Ajouter une migration ou un script d'audit current-state pour `SECURITY DEFINER search_path`, RLS recursive et tables sensibles sans RLS.
7. Uniformiser les quelques alias de route dashboard avec wrappers de protection, ou documenter explicitement qu'ils ne sont que des redirections.
8. Nettoyer README et documentation pour remplacer ancien fournisseur IA par TOK/TheTok, si ancien fournisseur IA n'est plus le systeme de travail officiel.

## Conclusion

Le codebase est fonctionnellement avance et contient deja des garde-fous serieux sur les zones critiques : routes protegees, RLS, paiements serveur, webhook Stripe, CSP, tests de securite HTML/CSS et checks CI. Il n'est pas encore possible d'affirmer qu'il ne reste aucune reference a d'anciens systemes : ancien fournisseur IA et Miamz sont encore presents, avec ancien fournisseur IA en dependance runtime Edge Function et Miamz en contrat metier.

La base contient aussi une dette de schema significative : 66 tables typpees ne sont pas servies directement par le runtime scanne. Ce constat justifie un audit DB de production, pas une suppression immediate.

Statut release local : non publiable tant que `pnpm test` reste rouge.
