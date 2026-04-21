# Compta campagnes pub et Tok One - Implementation Plan

> For agentic workers: execute this plan task by task with isolated ownership and validation after each slice.

**Goal:** Show paid advertising campaign flows in admin accounting and restaurateur accounting as separate financial blocks, and show Tok One subscription revenue on the admin home page, without changing the existing marketplace commission `10% / 90%` logic.

**Architecture:** Extend the existing accounting data hooks with dedicated queries for campaign payments, keep these totals outside `summary.inflow.bySource`, and add a dedicated Tok One subscription summary query for the admin home. Then wire the new values into the three target screens with explicit wording that separates marketplace commissions from other platform revenues.

**Tech Stack:** React 18, TypeScript, TanStack Query, Supabase tables (`ad_campaigns`, `tok_one_subscriptions`, `user_subscription_plans`), Vite, Vitest, ESLint.

---

## File Structure

**Modified files:**
- `src/pages/admin/adminComptaShared.ts` - add paid campaign totals for admin accounting
- `src/pages/admin/AdminCompta.tsx` - display `Autres encaissements TOK` block for campaigns
- `src/pages/dashboard/dashboardFacturesShared.ts` - add restaurateur paid campaign totals
- `src/pages/dashboard/DashboardFactures.tsx` - display `Depenses marketing` summary
- `src/pages/dashboard/DashboardFacturesInflow.tsx` - display campaign marketing expense detail
- `src/pages/admin/AdminHome.tsx` - add Tok One revenue summary card

**Optional test files if needed after implementation:**
- `src/test/admin-compta-campaigns.test.ts`
- `src/test/dashboard-factures-campaigns.test.ts`

---

### Task 1: Extend admin accounting data with campaign payments

**Files:**
- `src/pages/admin/adminComptaShared.ts`

- [ ] **Step 1: Add campaign query scoped like existing admin filters**

Query `ad_campaigns` with:
- current restaurant filter
- current month filter using `created_at`
- `payment_status = "paid"`

Select at minimum:
- `id`
- `restaurant_id`
- `created_at`
- `payment_status`
- `paid_amount`
- `total_budget`
- `title`
- joined restaurant name when useful

- [ ] **Step 2: Centralize campaign amount fallback**

For each paid campaign:
- amount = `paid_amount`
- fallback to `total_budget` when `paid_amount` is missing, `null`, or `0`

Expose:
- `paidCampaignsTotal`
- `paidCampaignsCount`

Do not add these amounts into:
- `commissionBases`
- `summary.inflow.totalCommissions`
- `summary.inflow.bySource`

- [ ] **Step 3: Validate**

Run:

```bash
npx eslint src/pages/admin/adminComptaShared.ts
```

Expected:
- ESLint PASS

---

### Task 2: Surface campaign payments in admin accounting UI

**Files:**
- `src/pages/admin/AdminCompta.tsx`

- [ ] **Step 1: Add separate accounting block**

Add a block below the existing commission source breakdown:
- title: `Autres encaissements TOK`
- card or row: `Campagnes publicitaires`

Display:
- total paid campaign revenue for current filter
- paid campaigns count
- wording clarifying `hors commissions marketplace`

- [ ] **Step 2: Preserve existing commission wording**

Do not change the meaning of:
- `Paiements clients passes par TOK`
- `Commissions TOK 10%`
- `Origine des 10% TOK`

Campaigns must remain visually separate.

- [ ] **Step 3: Validate**

Run:

```bash
npx eslint src/pages/admin/AdminCompta.tsx
```

Expected:
- ESLint PASS

---

### Task 3: Extend restaurateur accounting data with marketing campaign spend

**Files:**
- `src/pages/dashboard/dashboardFacturesShared.ts`

- [ ] **Step 1: Add restaurant-scoped paid campaign query**

Query `ad_campaigns` for the selected restaurant with:
- `payment_status = "paid"`

Select:
- `id`
- `created_at`
- `payment_status`
- `paid_amount`
- `total_budget`
- `title`

- [ ] **Step 2: Expose restaurateur marketing totals**

Compute and expose:
- `paidCampaignsTotal`
- `paidCampaignsCount`

This data must remain fully separate from:
- `commissionBases`
- `uninvoicedCommissionBases`
- `uninvoicedRestaurantShareBySource`
- `summary.inflow.bySource`

- [ ] **Step 3: Validate**

Run:

```bash
npx eslint src/pages/dashboard/dashboardFacturesShared.ts
```

Expected:
- ESLint PASS

---

### Task 4: Surface campaign marketing spend in restaurateur accounting UI

**Files:**
- `src/pages/dashboard/DashboardFactures.tsx`
- `src/pages/dashboard/DashboardFacturesInflow.tsx`

- [ ] **Step 1: Add marketing summary on accounting home**

On `DashboardFactures.tsx`, add a dedicated block:
- title: `Depenses marketing`
- row/card: `Campagnes publicitaires`
- show total amount and paid campaign count if available

Wording must clearly indicate:
- this is a paid expense by the restaurateur
- this is not part of the `90%` restaurant share

- [ ] **Step 2: Add detailed marketing block on inflow page**

On `DashboardFacturesInflow.tsx`, add a distinct block for:
- `Campagnes publicitaires`
- total paid amount
- paid campaign count

Keep it outside:
- `Origine des entrees restaurant`
- `Encours par source`
- invoice tables

- [ ] **Step 3: Validate**

Run:

```bash
npx eslint src/pages/dashboard/DashboardFactures.tsx src/pages/dashboard/DashboardFacturesInflow.tsx
```

Expected:
- ESLint PASS

---

### Task 5: Add Tok One revenue summary to admin home

**Files:**
- `src/pages/admin/AdminHome.tsx`

- [ ] **Step 1: Add Tok One subscription query**

Query active Tok One subscriptions by joining:
- `tok_one_subscriptions`
- `user_subscription_plans`

Include at minimum:
- `status`
- `plan_id`
- `billing_period` if present
- plan prices:
  - `price_monthly`
  - `price_yearly`

Use entitled statuses only:
- `active`
- `trialing`

- [ ] **Step 2: Compute display amount with explicit fallback**

Amount logic:
- use `price_yearly` when `billing_period = "yearly"`
- otherwise use `price_monthly`
- if `billing_period` is absent or unreliable, default to monthly and keep wording as estimated revenue

Expose in UI:
- `Abonnements Tok One`
- estimated active revenue
- active subscription count

- [ ] **Step 3: Place card without breaking current dashboard layout**

Add one extra summary card in the top metrics grid or a nearby admin summary section.
Keep the home readable on mobile and desktop.

- [ ] **Step 4: Validate**

Run:

```bash
npx eslint src/pages/admin/AdminHome.tsx
```

Expected:
- ESLint PASS

---

### Task 6: Full validation and regression check

**Files:**
- all modified files

- [ ] **Step 1: Run targeted lint**

```bash
npx eslint src/pages/admin/adminComptaShared.ts src/pages/admin/AdminCompta.tsx src/pages/dashboard/dashboardFacturesShared.ts src/pages/dashboard/DashboardFactures.tsx src/pages/dashboard/DashboardFacturesInflow.tsx src/pages/admin/AdminHome.tsx
```

Expected:
- ESLint PASS

- [ ] **Step 2: Run focused tests if environment permits**

If tests are added:

```bash
npx vitest run <test-files>
```

Expected:
- PASS, or document `spawn EPERM` if Vitest remains blocked in this environment

- [ ] **Step 3: Run production build**

```bash
npm run build
```

Expected:
- production build PASS

- [ ] **Step 4: Manual regression checklist**

Confirm by inspection:
- admin compta still separates `10% TOK` source cards from campaigns
- restaurateur compta shows campaign spend as marketing expense only
- admin home shows Tok One card without crowding the layout
- no campaign or Tok One amount appears inside commission source totals

---

## Risks to watch during implementation

- Campaign filtering by `created_at` month may differ from business expectation if users expect activation month rather than payment creation month. Do not change this in this iteration; follow the spec.
- Tok One `billing_period` may be inconsistent. Use the documented monthly fallback instead of guessing.
- Existing accounting hooks are already dense; keep additions narrowly scoped and avoid refactoring unrelated logic.
