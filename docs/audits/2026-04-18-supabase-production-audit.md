# Supabase production audit — project `wwcrtyoueexyxkkikaos` (Tok)

Date : 2026-04-18

## TL;DR

| Domaine | État | Action |
|---|---|---|
| RLS | ✅ Activé sur toutes les tables critiques (16/16) | RAS |
| Sécurité fonctions | ✅ Corrigé (search_path pinné) | — |
| Buckets publics | ✅ Corrigé (listing restreint admin) | — |
| Stripe webhook | ⚠️ **Critique** : `payment_status` jamais promu à `captured` | Vérifier la config webhook côté Stripe |
| Index FK chauds | ✅ Ajoutés sur orders/reservations/order_items | — |
| FK dupliquée | ✅ Nettoyée (`reservations_restaurant_invoice_id_fkey`) | — |
| Perf advisors WARN | 781 hints (0 erreur) | Itérer sur `auth_rls_initplan` plus tard |
| Auth - leaked password protection | ⚠️ Désactivé | Activer dans Auth dashboard |

## 1. Schéma & migrations

96 migrations appliquées, en sync avec le repo. Une régularisation a été faite pour la facturation des réservations (pipeline 90% restaurant→TOK + 5.-/resa TOK→restaurant) :
- `20260417180419_reservation_billing_schema` — colonnes confirmation/annulation
- `20260417220651_separate_reservation_fee_invoices` — type `payout` vs `reservation_fees`
- `20260417225213_extend_payout_invoice_to_all_paid_reservations` — généralisation à toutes les features payées (Chef's Table, promo-formule, anti-gaspi…)
- `20260418032807_reservations_confirmed_at_trigger` — trigger BEFORE UPDATE qui stamp `confirmed_at` peu importe le code path
- `20260418033754_submit_verified_review_rpc` — RPC manquante pour le formulaire d'avis

## 2. Sécurité (advisor `security`)

| Lint | Avant | Après |
|---|---|---|
| `function_search_path_mutable` | 8 | 0 ✅ |
| `public_bucket_allows_listing` | 2 | 0 ✅ |
| `auth_leaked_password_protection` | Désactivé | À activer manuellement (Dashboard Auth → Password Protection) |

Migrations appliquées :
- `20260418113317_harden_function_search_path.sql`
- `20260418113419_restrict_public_bucket_listing.sql`

## 3. Données & cohérence métier

### 3.1 Bug critique : `payment_status` reste `pending`

9 commandes en DB, **toutes avec `payment_status='pending'`** alors que 6 ont `status='confirmed'` et un `session_id` Stripe (`cs_test_…`). Aucune n'a de `payment_intent` enregistré → le webhook Stripe ne pousse jamais l'event vers la fonction `stripe-webhook`.

**Causes possibles :**
1. `STRIPE_WEBHOOK_SECRET` non configuré dans les secrets de l'edge function
2. URL du webhook absente / incorrecte dans le dashboard Stripe (mode test)
3. Filtres d'événements Stripe trop restrictifs

**À faire :**
1. Stripe Dashboard → Developers → Webhooks → ajouter endpoint `https://wwcrtyoueexyxkkikaos.supabase.co/functions/v1/stripe-webhook`
2. Cocher au minimum `checkout.session.completed`, `payment_intent.succeeded`, `payment_intent.payment_failed`
3. Copier le `whsec_...` dans Supabase → Edge Functions → secrets : `STRIPE_WEBHOOK_SECRET`
4. Tester un paiement et vérifier qu'un order passe à `payment_status='captured'`

### 3.2 FK dupliquée sur `reservations`

`reservations_restaurant_invoice_id_fkey` (ancienne) faisait doublon avec `reservations_invoice_fk` (rebuild). Nettoyée.

## 4. Performance (advisor `performance`)

781 hints, **0 erreur**. Top contributeurs :

| Lint | Count | Action prise / reportée |
|---|---|---|
| `multiple_permissive_policies` | 463 | Reporté — chantier RLS dédié |
| `auth_rls_initplan` | 180 | Reporté — wrapper `(SELECT auth.x())` à appliquer en lot |
| `unindexed_foreign_keys` | 99 → ~88 | Hot path adressé (orders/reservations/order_items) |
| `unused_index` | 39 | À évaluer après 30j de charge production |

**Top tables à RLS lourd** (auth_rls_initplan) : `proof_of_delivery`, `orders`, `reservations`, `reviews`, `profiles`. Pour chacune, refactoriser les policies en `auth.uid() = user_id` → `(SELECT auth.uid()) = user_id`. Gain proportionnel au nombre de rows scannés.

**Indexes ajoutés** (`20260418113723_cleanup_dup_fk_and_index_hot_fks.sql`) :
- `idx_orders_restaurant_id`, `idx_orders_user_id`, `idx_orders_courier_id` (partial), `idx_orders_branch_id` (partial), `idx_orders_invoice_id` (partial)
- `idx_order_items_restaurant_id`, `idx_order_items_menu_item_id`, `idx_order_items_anti_waste_offer_id` (partial)
- `idx_reservations_restaurant_id`, `idx_reservations_user_id`

## 5. RLS coverage

✅ RLS activée sur les 16 tables critiques auditées : `orders, order_items, reservations, restaurants, restaurant_invoices, restaurant_invoice_settings, restaurant_promotions, reviews, profiles, user_roles, user_subscription_plans, menu_items, loyalty_transactions, promo_codes, promo_code_uses, delivery_tracking`.

## 6. Edge functions

23 fonctions ACTIVE. Versions à jour (rebuild 2026-04-17). Une fonction critique à surveiller :
- **`stripe-webhook` v6** : code OK, mais ne reçoit aucun event en pratique (cf. §3.1)

## 7. Recommandations prioritaires (court terme)

1. **CRITIQUE** : configurer le webhook Stripe (cf. §3.1) — sans ça, aucune commande n'a son `payment_status` mis à jour
2. Activer la protection des mots de passe compromis (Auth → Password Protection)
3. Refacto des RLS policies pour `auth_rls_initplan` (gain perf x2-x10 sur les tables les plus lues)
4. Évaluer la suppression des `unused_index` après 30 jours d'observation
5. Diagnostiquer `restaurant-order-status` 400 — vraisemblablement le trigger `tg_guard_locked_order_status` qui rejette une transition sur une commande verrouillée (anti-gaspi/flash-sale paid)

## 8. Récapitulatif de l'état "production-ready"

- 🟢 **Schéma & migrations** : sync, cohérent, idempotent
- 🟢 **RLS** : couvre toutes les tables sensibles
- 🟢 **Sécurité fonctions** : search_path pinné, buckets publics restreints
- 🟡 **Stripe** : code prêt, **infra à configurer** (webhook)
- 🟡 **Perf** : pas bloquant à court terme, optimisable
- 🟢 **Auth** : OTP correct, MFA dispo, manque protection mots de passe compromis (1 toggle)
