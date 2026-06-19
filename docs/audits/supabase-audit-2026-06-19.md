# Audit Supabase TOK - 2026-06-19

Projet audite : `wwcrtyoueexyxkkikaos` (`Tok`)
Workspace local : `C:\Users\Pc\cloud-rebuild-recovered`
Mode : lecture seule, aucune migration appliquee, aucune Edge Function deployee, aucun secret modifie.

## Perimetre

Cet audit couvre :

- schema local `supabase/`, migrations, fonctions Edge, configuration Supabase et scripts de ciblage ;
- projet Supabase distant de production `wwcrtyoueexyxkkikaos` ;
- tables `public` et `storage`, RLS, policies, grants, fonctions SQL, vues, buckets, cron jobs ;
- Edge Functions locales et distantes ;
- logs Supabase des dernieres 24h : API, Postgres, Auth, Storage, Realtime et Edge Functions ;
- appels frontend/backend vers Supabase : `.from()`, `.rpc()`, `.functions.invoke()`.

References Supabase officielles consultees :

- Row Level Security : https://supabase.com/docs/guides/database/postgres/row-level-security
- Securing Edge Functions : https://supabase.com/docs/guides/functions/auth
- Function configuration : https://supabase.com/docs/guides/functions/function-configuration
- Database advisors : https://supabase.com/docs/guides/database/database-advisors
- Changelog Edge Functions nested rate limits : https://supabase.com/changelog/43644-edge-functions-rate-limits-on-recursive-nested-edge-functions-calls

## Synthese executive

La base de production est active, les migrations locales et distantes sont alignees en nombre, et toutes les tables applicatives exposees dans `public` ont RLS activee avec au moins une policy. Les controles critiques de base sont donc presents.

Les risques importants ne sont pas dans l'absence de RLS, mais dans la surface d'autorisation autour de RLS :

1. **P0 - Grants SQL trop larges sur `anon` et `authenticated`.** Les roles API ont des droits SQL globaux, dont `TRUNCATE` et `TRIGGER`, sur une grande partie des tables `public`. RLS protege les lignes pour `SELECT/INSERT/UPDATE/DELETE`, mais pas `TRUNCATE`. C'est le point de securite le plus urgent.
2. **P0 - Cron `stripe-sync-worker` casse en continu.** Le cron appelle `https://wwcrtyoueexyxkkikaos.supabase.co/functions/v1/stripe-worker` toutes les minutes. Les logs Edge montrent des `503` repetes, et `stripe-worker` n'existe pas dans `supabase/functions`.
3. **P1 - Fonctions distantes non versionnees dans le repo.** `stripe-worker` et `stripe-setup` existent cote Supabase distant mais pas localement. Leur bundle n'a pas pu etre recupere par l'outil Supabase. Le code effectif n'est donc pas auditable depuis le repo.
4. **P1 - Fonctions `SECURITY DEFINER` encore trop accessibles.** Toutes ont un `search_path` fixe, ce qui est bon, mais 42 fonctions `SECURITY DEFINER` restent executables par `anon`, 28 par `PUBLIC`, et 187 par `authenticated`.
5. **P1 - Policies et grants storage a durcir.** Le bucket `verification-documents` est prive mais n'a pas de limite de taille/type MIME explicite. Une policy `invoice-logos` contient une condition suspecte sur `storage.foldername(r.name)` au lieu du nom d'objet.
6. **P2 - Performance perfectible.** 81 foreign keys semblent sans index dedie, dont 27 sur tables non vides. Les priorites sont `notification_deliveries.notification_id` et `social_feed_events.promotion_id`.
7. **P2 - RLS/performance.** Plusieurs tables ont des policies permissives multiples et de nombreuses policies utilisent encore `auth.uid()` directement au lieu du pattern init-plan `(SELECT auth.uid())`.
8. **P2 - Edge AI et analytics.** `ai-image-enhance` a une execution observee a environ 66s. `track-analytics` et `rate_limit_consume` sont tres sollicites. Ces flux doivent rester limites, asynchrones et surveilles.
9. **P3 - Tables candidates au nettoyage.** 76 tables sont vides et sans reference directe `.from()` locale. Elles couvrent surtout des modules futurs ou partiellement branches ; ne pas les supprimer sans classification metier.

## Ce qui est sain

- Projet production `wwcrtyoueexyxkkikaos` actif en region `eu-central-2`, PostgreSQL `17.6.x`.
- 276 migrations locales et 276 migrations appliquees en production, derniere migration commune : `20260617110000_customer_crm_elite_mfa_gate`.
- Aucune table applicative `public` sans RLS detectee.
- Aucune table `public` avec RLS activee mais sans policy detectee.
- Aucune policy detectee avec `user_metadata` ou `raw_user_meta_data`.
- La zone sensible `social_post_comments` ne contient plus de policy auto-referentielle directe ; le risque historique de recursion RLS semble corrige.
- Toutes les RPC referencees statiquement par le code local existent en base distante.
- Toutes les fonctions `SECURITY DEFINER` auditees ont un `search_path` explicite.
- Les buckets sensibles sont au moins separes entre public/prive : `verification-documents` et `ai-generated-assets` sont prives.
- Les extensions installees sont majoritairement dans des schemas non publics : `extensions`, `vault`, `pgmq`, `pg_catalog`, `stripe`.

## Ciblage Supabase et migrations

### Constat

Le doctor production retourne :

- frontend env : `wwcrtyoueexyxkkikaos` ;
- GitHub Actions `SUPABASE_PROJECT_REF` : `wwcrtyoueexyxkkikaos` ;
- `supabase/config.toml project_id` : `rgzqxttqwmaylrzxlzob` ;
- `supabase/.temp/project-ref` : `rgzqxttqwmaylrzxlzob`.

Le script conclut `Result: OK`, mais avertit de lancer `supabase:target:prod` avant les commandes production.

### Risque

La configuration locale pointe encore vers un ancien projet (`rgzqxttqwmaylrzxlzob`, `deliveroom2`). Les scripts de production savent le detecter, mais un appel Supabase CLI manuel sans wrapper peut partir vers la mauvaise cible.

### Action recommandee

- Ne jamais pousser de migration avec `supabase db push` direct.
- Avant toute operation production : `pnpm run supabase:target:prod` puis `pnpm run supabase:doctor:prod`.
- Garder le garde-fou `scripts/assert-production-supabase-target.mjs` actif dans le workflow.

## Migrations

### Etat

- Migrations locales : 276.
- Migrations production : 276.
- Pas de derive de nombre ni de derniere version observee.

### Observations

L'historique contient plusieurs migrations de durcissement proches ou repetitives. Ce n'est pas une erreur, mais cela rend l'audit plus difficile :

- `security_rpc_grants_hardening` apparait plusieurs fois ;
- `security_linter_hardening_and_core_cron` apparait en variantes proches ;
- `reservation_billing_schema` et certains durcissements actualites/finance ont des doublons nominaux.

### Action recommandee

Ne pas reecrire l'historique. Pour les prochaines corrections, ajouter des migrations idempotentes, nommees par domaine et risque, par exemple :

- `revoke_overbroad_table_grants`;
- `harden_storage_verification_documents`;
- `disable_or_version_stripe_worker_cron`;
- `add_missing_hot_fk_indexes`.

## RLS, grants et policies

### RLS coverage

Toutes les tables `public` sont sous RLS et ont au moins une policy. C'est conforme a la doctrine Supabase pour les schemas exposes.

### Probleme majeur : grants trop larges

Synthese des grants detectes sur `public` :

| Role | Tables avec grants | SELECT | INSERT | UPDATE | DELETE | TRUNCATE | TRIGGER |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| `anon` | 178 | 178 | 167 | 167 | 167 | 178 | 178 |
| `authenticated` | 195 | 195 | 156 | 154 | 151 | 193 | 193 |

Tables sensibles concernees par ces grants larges : `profiles`, `user_roles`, `orders`, `order_items`, `payment_transactions`, `restaurant_invoices`, `stripe_webhook_events`, `audit_log`, `edge_function_audit_logs`, `email_queue`, `device_tokens`, `notifications`, `notification_deliveries`, `couriers`, `dispatch_jobs`, `tok_one_subscriptions`, `ai_usage_logs`, `ai_security_events`, `signup_applications`, `restaurant_payout_settings`, `user_wallets`, `wallet_transactions`, `user_payment_methods`, `support_tickets`, `support_messages`, `social_reports`.

RLS limite les lignes accessibles pour les commandes classiques, mais `TRUNCATE` n'est pas filtre par RLS. Meme si PostgREST ne donne pas un endpoint `TRUNCATE`, ces grants sont trop larges pour une base de production.

Action prioritaire :

- migrer vers un modele de grants minimaux ;
- retirer au minimum `TRUNCATE`, `TRIGGER`, `REFERENCES` de `anon` et `authenticated` sur toutes les tables exposees ;
- re-granter explicitement `SELECT/INSERT/UPDATE/DELETE` uniquement quand une policy et un besoin applicatif existent ;
- valider les flows client, restaurateur, admin, courier et Edge Functions apres revocation.

### Policies permissives multiples

Tables les plus visibles :

- `storage.objects` : 5 policies permissives en `INSERT`, 4 en `SELECT/DELETE`, 3 en `UPDATE`.
- `proof_of_delivery` : 4 policies permissives en `SELECT`.
- `orders`, `order_items`, `ad_campaigns`, `restaurants`, `support_tickets`, `support_messages`, `courier_documents` : plusieurs policies permissives par commande.

Ce n'est pas automatiquement une faille, mais Supabase Advisors le signale generalement comme dette de performance et de lisibilite. Fusionner les policies par role/commande reduira le cout RLS et les erreurs de logique.

### `auth.uid()` non init-plan

De nombreuses policies utilisent encore `auth.uid()` directement. Supabase recommande souvent le pattern `(SELECT auth.uid())` pour eviter une reevaluation par ligne dans certains plans. Les exemples observes touchent notamment :

- `ad_campaigns`, `ad_campaign_events`;
- `ai_*`;
- `anti_waste_offers`;
- `couriers`, `courier_documents`;
- `device_tokens`;
- `favorites`;
- `flash_sales`;
- `group_member_orders`;
- `impressions`;
- `orders`, `reservations`, `profiles` dans les historiques d'audit.

Action recommandee : traiter par lots, en commencant par les tables lues souvent ou avec volumes croissants.

### `has_role`

La fonction `has_role(uuid, app_role)` n'est plus executable par `anon`, ce qui est coherent avec l'audit du 2026-06-07. Les logs Postgres montrent toutefois deux erreurs `permission denied for function has_role`.

Interpretation probable : une requete anonyme a traverse une policy qui appelle `has_role()`. PostgreSQL essaie d'evaluer la policy et echoue avant que l'expression globale ne refuse proprement.

Action recommandee :

- identifier les policies accessibles a `anon` qui contiennent `has_role(auth.uid(), 'admin')` ;
- separer les policies publiques des policies admin ;
- remplacer les conditions publiques par une clause qui evite l'appel admin pour `anon`, ou restreindre la policy au role `authenticated` quand l'appel admin est necessaire.

### Vue finance admin

La vue `public.admin_platform_finance_monthly_snapshot` a `security_invoker=true`, ce qui est positif. En revanche, les grants indiquent `anon_select=true` et `authenticated_select=true`.

Action recommandee :

- retirer `SELECT` a `anon` sur cette vue ;
- conserver uniquement `authenticated` si la RLS/table sous-jacente impose bien `admin`, ou exposer via RPC admin auditee.

## Fonctions SQL

### Etat

- 251 fonctions `SECURITY DEFINER`.
- 0 fonction `SECURITY DEFINER` detectee sans `search_path` fixe.
- 42 fonctions `SECURITY DEFINER` executables par `anon`.
- 28 fonctions `SECURITY DEFINER` executables par `PUBLIC`.
- 187 fonctions `SECURITY DEFINER` executables par `authenticated`.

Fonctions non-trigger `SECURITY DEFINER` executables par `anon` ou `PUBLIC` a revoir en priorite :

- `rls_auto_enable`;
- `restaurant_archive_anti_waste_offer`;
- `restaurant_archive_flash_sale`;
- `restaurant_set_cuisines`;
- `restaurant_update_anti_waste_offer_status`;
- `restaurant_upsert_flash_sale`;
- `record_social_feed_event`;
- `track_google_booking_event`;
- `signup_restaurateur_onboarding_payment_ready`;
- `user_can_access_support_incident`;
- `resolve_google_booking_slug`;
- `get_match_group_public_feed`;
- `get_meal_formula_service_availability`;
- `get_restaurant_reservation_slot_availability`;
- `get_total_donated_meals`;
- `get_total_donated_points`;
- `search_restaurants_catalog`.

Certaines sont probablement publiques volontairement (`search_restaurants_catalog`, disponibilites publiques, stats agregees). Les mutations restaurant et helpers internes doivent etre revus et documentes.

## Storage

Buckets :

| Bucket | Public | Limite | MIME |
| --- | --- | ---: | --- |
| `images` | oui | 10 MB | jpeg/png/webp/gif |
| `invoice-logos` | oui | 10 MB | jpeg/png/webp/gif |
| `social-post-media` | oui | 25 MB | jpeg/png/webp/gif/mp4/webm/quicktime |
| `ai-generated-assets` | non | 10 MB | png/jpeg/webp |
| `verification-documents` | non | aucune limite explicite | aucun type explicite |

Risques :

- `verification-documents` contient potentiellement des pieces sensibles ; l'absence de limite explicite taille/MIME augmente le risque d'abus et de stockage non controle.
- `invoice-logos` contient une policy avec une condition suspecte : `storage.foldername(r.name)`. Cette condition semble verifier le nom du restaurant plutot que le chemin de l'objet. Une autre branche de la policy peut rendre le flux fonctionnel, mais ce fragment doit etre corrige ou supprime.
- `storage.objects` a beaucoup de policies permissives, ce qui complique l'audit.

Actions recommandees :

1. Ajouter des `allowed_mime_types` stricts et un `file_size_limit` a `verification-documents`.
2. Revoir les policies `invoice-logos`.
3. Consolider les policies storage par bucket et operation.
4. Tester upload/list/update/delete pour restaurateur, admin et utilisateur non proprietaire.

## Edge Functions

### Inventaire

Fonctions locales dans `supabase/functions` : 48.

Fonctions distantes en production : 50.

Fonctions distantes absentes du repo :

- `stripe-worker`;
- `stripe-setup`.

Les deux ont `verify_jwt=false`. L'outil Supabase n'a pas pu recuperer leur bundle. Elles doivent etre considerees non auditees tant que le code source n'est pas versionne.

### `verify_jwt=false`

Toutes les fonctions distantes ont `verify_jwt=false`. Cela correspond au `supabase/config.toml` local, ou le commentaire impose que chaque handler valide lui-meme l'auth, la signature webhook, le secret interne, le rate limit ou le captcha.

Le scan local montre que les 48 fonctions versionnees ont au moins un marqueur d'authentification, secret interne, signature Stripe, captcha ou controle de methode. C'est rassurant, mais ce n'est pas une preuve formelle fonction par fonction.

Action recommandee :

- conserver `verify_jwt=false` uniquement pour les fonctions qui ont une raison documentee ;
- ajouter une checklist dans chaque fonction : method, CORS, auth/signature, role, rate limit, audit log, validation payload ;
- pour les fonctions purement authentifiees, envisager `verify_jwt=true` si cela ne casse pas les clients existants.

### Cron `stripe-sync-worker`

Cron actif :

- nom : `stripe-sync-worker`;
- schedule : `*/1 * * * *`;
- commande : appel `net.http_post` vers `/functions/v1/stripe-worker`.

Logs Edge :

- `stripe-worker` repond `503` de facon repetee ;
- `deployment_id=null`, `function_id=null` dans les logs, ce qui confirme une fonction absente, invalide ou non resolue par la plateforme.

Impact :

- bruit de logs et cout inutile ;
- synchronisation Stripe potentiellement inactive ;
- si ce worker devait reconcilier des paiements ou abonnements, dette operationnelle critique.

Action P0 :

1. Decider si `stripe-worker` est encore requis.
2. Si oui, ajouter le code dans `supabase/functions/stripe-worker`, tester localement, deployer via workflow.
3. Si non, desactiver le cron par migration idempotente et documenter le remplacement.
4. Controler aussi `stripe-setup`, qui est distant mais non versionne.

### Fonctions AI

Plusieurs fonctions utilisent `OPENAI_API_KEY`. Le contexte projet indique que les cles OpenAI ont ete retirees du workflow production sauf necessite active.

Action recommandee :

- confirmer quelles fonctions AI sont actives en production ;
- verifier que l'absence de secret produit une reponse degradee propre, pas une 500 brute ;
- imposer quota/rate limit par utilisateur/restaurant/fonction ;
- surveiller `ai-image-enhance`, observee a environ 66s sur une execution.

### Logs Edge observes

- `track-analytics` : beaucoup de 200, execution souvent entre environ 400ms et 2s, un pic observe autour de 3,6s.
- `track-sponsored-event` : 200 autour de 500-850ms.
- `ai-image-enhance` : 200 mais execution autour de 66s.
- `stripe-worker` : 503 repetes.

## Cron et jobs SQL

Crons actifs :

| Nom | Schedule | Commande | Statut |
| --- | --- | --- | --- |
| `tok-close-due-match-groups` | chaque minute | `select public.close_due_match_groups();` | actif |
| `tok-sync-social-post-promotions` | toutes les 5 minutes | `select public.run_social_post_promotion_status_sync();` | actif |
| `stripe-sync-worker` | chaque minute | `net.http_post` vers `stripe-worker` | actif, en erreur 503 |
| `tok-birthday-notifications` | 07:15 quotidien | `select public.enqueue_birthday_notifications(current_date);` | actif |

Le cron `close_due_match_groups` est tres frequent mais son cout moyen observe reste bas. Le cron Stripe est le seul incident clair.

## Auth, API, Realtime, Storage logs

Auth :

- majoritairement `GET /user` en 200 ;
- un pic de `403 bad_jwt` / `invalid claim: missing sub claim` observe vers `2026-06-19T12:07:07Z`.

Interpretation : probablement sessions invalides, tokens obsoletes ou requetes clientes sans JWT valide. A surveiller si cela se repete en volume.

API :

- pas d'erreur applicative massive dans l'echantillon ;
- trafic important sur `rate_limit_consume`, `impressions`, `edge_function_audit_logs`.

Realtime :

- demarrages/arrets normaux selon presence d'utilisateurs connectes ;
- pas d'erreur structurelle observee.

Storage :

- operations 200 sur `images`, `ai-generated-assets`, transformations ;
- pas d'erreur storage majeure dans l'echantillon.

## Performance

### Tables les plus volumineuses observees

| Table | Lignes estimees | Taille |
| --- | ---: | ---: |
| `impressions` | ~69k | 15 MB |
| `event_store` | ~3.7k | 984 kB |
| `notification_deliveries` | ~3k | 576 kB |
| `notifications` | ~1.5k | 968 kB |
| `social_feed_events` | ~1.5k | 1.4 MB |
| `stripe_webhook_events` | ~1.2k | 504 kB |
| `ad_campaign_events` | ~925 | 1.5 MB |
| `rate_limit_buckets` | ~699 | 520 kB |

La base reste petite, mais les flux analytics/social/notifications grandissent deja.

### Top `pg_stat_statements`

Principaux consommateurs observes :

- Realtime/WAL : tres grand nombre d'appels, cout moyen autour de 8ms.
- `rate_limit_consume` : ~136k appels, cout moyen autour de 12ms.
- recherche catalogue : plusieurs milliers d'appels, cout moyen autour de 80-108ms.
- lectures `edge_function_audit_logs` et `audit_log`.
- `notifications` ordonnees par `created_at`.
- `close_due_match_groups` appele tres souvent.
- cron `stripe-sync-worker` appele souvent via `net.http_post`.

Priorites :

1. Optimiser `search_restaurants_catalog` avant croissance forte.
2. Garder `rate_limit_buckets` indexe et purgeable.
3. S'assurer que les vues/listes audit/log admin sont paginees.
4. Corriger `stripe-sync-worker` pour supprimer la charge inutile.

### Foreign keys sans index

81 FKs sans index dedie detectees, dont 27 sur tables non vides.

Priorites immediates :

- `notification_deliveries.notification_id` (~3.2k lignes) ;
- `social_feed_events.promotion_id` (~1.5k lignes) ;
- `marketplace_alert_state_history.admin_user_id` ;
- `marketplace_alert_states.handled_by` ;
- `menu_items.restaurant_id` ;
- `meal_formula_categories.formula_id` ;
- `meal_formulas.restaurant_id` ;
- `order_groups.restaurant_id` ;
- `social_post_promotions.created_by`.

Action recommandee : ajouter des index FK par migration idempotente, en commencant par les tables non vides et les domaines notifications/social/menu.

### Index inutilises

Plusieurs index ont `idx_scan = 0`, mais la base est jeune et les tailles sont faibles. Ne pas supprimer maintenant. Refaire le point apres 30 jours de trafic stable.

## Tables utiles, servies ou candidates au nettoyage

### Tables clairement actives

Tables avec volume, logs ou references directes :

- analytics/social : `impressions`, `clicks`, `event_store`, `social_feed_events`, `social_posts`, `social_post_media`, `social_post_comments`, `ad_campaign_events`;
- notifications : `notifications`, `notification_deliveries`, `notification_subscriptions`, `email_queue`;
- paiements/Stripe : `stripe_webhook_events`, `payment_transactions`, `orders`, `order_items`;
- restaurants/catalogue : `restaurants`, `menu_items`, `meal_formulas`, `meal_formula_categories`;
- operations : `courier_locations`, `dispatch_jobs`, `dispatch_attempts`;
- securite/admin : `audit_log`, `edge_function_audit_logs`, `rate_limit_buckets`, `feature_flags`.

### Tables vides sans reference `.from()` directe locale

Ces tables ne doivent pas etre supprimees automatiquement. Elles peuvent etre utilisees par RPC, triggers, Edge Functions, migrations futures ou modules en preparation. Elles doivent passer par une revue produit avant archivage.

Candidates par domaine :

- catalogue/menu avance : `allergens`, `categories`, `dish_allergens`, `dish_availability_windows`, `dish_images`, `dish_modifier_groups`, `dish_modifier_options`, `dish_tags`, `dish_variants`, `dishes`, `menu_categories`, `restaurant_deals`;
- panier/commande avance : `cart_items`, `cart_item_modifiers`, `carts`, `order_addresses`, `order_fees`, `order_issues`, `order_item_modifiers`, `order_notes`, `order_refunds`, `order_status_history`, `order_taxes`;
- comptabilite/payout : `commercial_commissions`, `compensations`, `credit_notes`, `invoices`, `payment_intents`, `payout_batches`, `payouts`, `platform_cost_entries`, `platform_revenue_entries`, `restaurant_payout_settings`, `user_payment_methods`;
- support/messaging : `conversations`, `messages`, `support_messages`, `support_tickets`, `incident_reports`;
- fidelite/wallet/referral : `gift_cards`, `loyalty_accounts`, `referral_codes`, `user_referrals`, `user_wallets`, `wallet_transactions`;
- operations livraison : `courier_documents`, `delivery_batches`, `delivery_routes`, `restaurant_delivery_rules`, `restaurant_service_areas`, `restaurant_staff`;
- admin/CRM/marketplace : `admin_marketplace_alert_events`, `admin_marketplace_alerts`, `admin_month_locks`, `admin_review_action_history`, `admin_user_account_states`, `restaurant_activation_metrics`, `restaurant_documents`, `restaurant_hours`, `restaurant_leads`, `restaurant_settings`, `review_reports`, `sales_representatives`;
- data/IA : `ai_usage_costs`, `feature_store`, `fraud_signals`, `inventory_items`, `inventory_movements`, `marketing_budget_periods`, `ml_predictions`, `recommendation_logs`, `restaurant_recommendations`, `user_analytics`, `user_devices`, `user_notification_settings`.

Action recommandee :

1. Marquer chaque table : `active`, `planned`, `legacy`, `archive_candidate`.
2. Pour `legacy/archive_candidate`, chercher aussi dans RPC SQL, triggers, Edge Functions et dashboards avant suppression.
3. Ne supprimer que par migration explicite, apres export/backup et validation produit.

## Logique metier liee a Supabase

### Paiement / commandes

Le socle existe : `create-checkout`, `complete-order-checkout`, `stripe-webhook`, `process-refund`, `reconcile-paid-order-checkouts`, tables Stripe et audit logs. Le point inquietant est le worker Stripe distant en erreur. Les flows paiement ne doivent pas dependre d'une fonction non versionnee.

Priorite : clarifier le role de `stripe-worker` dans la reconciliation paiement/abonnements avant toute livraison.

### Reservations / restaurants

Les RPC de disponibilite et reservation existent. Les policies proprietaire restaurant sont presentes. Risques principaux : policies multiples, grants trop larges et indexes FK manquants sur certains domaines operationnels.

### Social / actualites

La recursion RLS historique de `social_post_comments` semble corrigee. Le domaine social est en croissance (`social_feed_events`, promotions, commentaires). Priorite : index FK manquants et cout RLS.

### Notifications

Le module est actif (`notifications`, `notification_deliveries`, cron anniversaire, `notification-dispatch`, `send-email`, `send-push`). Priorite : index `notification_deliveries.notification_id`, retention/purge et pagination admin.

### Admin / audit

Les tables d'audit sont actives et consultees souvent. Priorite : reduire les grants SQL, verifier que les vues admin ne sont pas lisibles par `anon`, et garder toutes les mutations admin derriere RPC auditees.

### AI

Les fonctions AI sont nombreuses et peuvent etre couteuses. Priorite : quotas, degradation propre sans secret, audit des prompts/outputs sensibles, et surveillance des executions longues.

## Plan d'action recommande

### P0 - Avant prochain changement production Supabase

1. Corriger ou desactiver `stripe-sync-worker`.
2. Revoquer les grants dangereux `TRUNCATE`, `TRIGGER`, `REFERENCES` de `anon` et `authenticated`.
3. Relancer `pnpm run supabase:doctor:prod` juste avant toute commande production.
4. Recuperer ou supprimer les fonctions distantes non versionnees `stripe-worker` et `stripe-setup`.

### P1 - Durcissement securite

1. Classifier toutes les fonctions `SECURITY DEFINER` executables par `anon` ou `PUBLIC`.
2. Revoquer l'execution anonyme des mutations restaurant/support/admin.
3. Corriger les policies qui appellent `has_role()` dans des chemins anonymes.
4. Retirer `anon` de la vue finance admin.
5. Durcir `verification-documents` : taille, MIME, policies.

### P2 - Performance et maintenabilite

1. Ajouter les index FK prioritaires.
2. Optimiser `search_restaurants_catalog`.
3. Consolider les policies permissives multiples.
4. Refactoriser les policies chaudes vers `(SELECT auth.uid())`.
5. Ajouter une retention claire pour analytics, audit, event store et logs.

### P3 - Hygiene schema

1. Classifier les 76 tables vides sans reference directe.
2. Documenter les tables `planned` et les tables `legacy`.
3. Supprimer seulement apres validation produit, backup et migration dediee.

## Verification effectuee

Commandes et outils utilises :

- lecture des skills projet TOK et Supabase ;
- consultation de la documentation Supabase officielle ;
- `mcp__supabase.list_tables` sur `public` et `storage` ;
- `mcp__supabase.list_edge_functions` ;
- `mcp__supabase.get_edge_function` pour `stripe-worker` et `stripe-setup` ;
- `mcp__supabase.get_logs` pour `api`, `postgres`, `edge-function`, `auth`, `storage`, `realtime` ;
- `mcp__supabase.execute_sql` sur catalogues Postgres, grants, RLS, policies, buckets, cron, `pg_stat_statements`, indexes ;
- `pnpm run supabase:doctor:prod` ;
- scans locaux `rg` sur `supabase`, `src`, `scripts`, `docs`.

Tests non executes :

- `pnpm test` et `pnpm build` non relances pour ce rapport, car aucune modification applicative, migration ou fonction Edge n'a ete appliquee dans cette passe.

## Conclusion

La production Supabase n'est pas dans un etat casse global : RLS est activee, les migrations sont alignees, les RPC referencees existent, et les logs applicatifs hors `stripe-worker` ne montrent pas d'incident massif.

En revanche, la posture de securite doit etre durcie avant d'ajouter de nouvelles fonctionnalites Supabase. Les deux sujets a traiter en premier sont le worker Stripe distant en 503 permanent et les grants SQL trop larges sur `anon`/`authenticated`. Ensuite viennent le nettoyage des fonctions `SECURITY DEFINER`, le durcissement storage et les indexes FK prioritaires.
