# Uber/TheFork Readiness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move Tok from a broad marketplace app toward an operable Uber/TheFork-grade platform with reliable payments, release gates, real-time operations, trust systems, and scalable marketplace workflows.

**Architecture:** Keep the current React/Vite/Capacitor + Supabase + Stripe architecture, but harden the authority boundaries around payments, dispatch, reservations, feature flags, and admin operations. Build in waves so each slice is testable and shippable without waiting for the entire marketplace vision.

**Tech Stack:** React 18, TypeScript, Vite, Vitest, Capacitor, Supabase Postgres/RLS/Edge Functions, Stripe Checkout/Webhooks/Connect, Firebase push, Sentry.

---

## Wave 0: Already Completed In This Pass

### Task 1: Align Campaign Pricing Authority

**Files:**
- Modified: `src/lib/campaignPricing.ts`
- Modified: `src/test/campaign-pricing.test.ts`
- Created: `supabase/migrations/20260525090000_align_campaign_default_pricing.sql`

- [x] **Step 1: Reproduce the failing monetization tests**

Run: `npm run test`

Observed: `src/test/campaign-pricing.test.ts` failed because frontend default pricing used the legacy 8 / 0.85 / 9 values while the Edge Function helper used conversion strategy defaults.

- [x] **Step 2: Align frontend default pricing with server authority**

Use `CAMPAIGN_STRATEGY_CONFIG.conversion.pricing` as `DEFAULT_CAMPAIGN_PRICING`.

- [x] **Step 3: Add migration for database default alignment**

Set new campaign DB defaults to conversion strategy: CPM 9.50 CHF, CPC 0.95 CHF, conversion 7.50 CHF.

- [x] **Step 4: Verify targeted tests**

Run: `npx vitest run src/test/campaign-pricing.test.ts`

Expected: PASS.

### Task 2: Add Production Release Readiness Gate

**Files:**
- Created: `scripts/release-readiness.mjs`
- Created: `src/test/release-readiness.test.ts`
- Modified: `package.json`
- Modified: `README.md`

- [x] **Step 1: Write release-readiness tests**

Tests cover missing mobile association files, Android signing config, and critical production payment secrets.

- [x] **Step 2: Implement readiness inspection**

The script checks:
- live Stripe publishable/secret/webhook keys
- iOS `public/.well-known/apple-app-site-association`
- Android `public/.well-known/assetlinks.json`
- Android release keystore config
- Firebase service account
- cron, email, app URL, and CORS production secrets

- [x] **Step 3: Add npm command**

Run: `npm run release:readiness`

Expected before full release: PASS. Current local state is expected to fail until live credentials and iOS association are configured.

---

## Wave 1: Payment Capture And Financial Integrity

### Task 3: Prove Stripe Webhook End-To-End Capture

**Files:**
- Modify: `supabase/functions/stripe-webhook/index.ts`
- Modify: `src/test/stripe-return.test.ts`
- Create: `docs/runbooks/stripe-payment-capture.md`

- [ ] **Step 1: Add a production payment capture runbook**

Document the exact Stripe dashboard endpoint:

```text
https://wwcrtyoueexyxkkikaos.supabase.co/functions/v1/stripe-webhook
```

Required events:

```text
checkout.session.completed
payment_intent.succeeded
payment_intent.payment_failed
charge.refunded
customer.subscription.updated
customer.subscription.deleted
```

- [ ] **Step 2: Add local verification command**

Add this command to the runbook:

```bash
npm run release:readiness
npm run supabase:doctor:prod
```

Expected: readiness passes and Supabase production target is aligned.

- [ ] **Step 3: Verify a live test payment manually**

After Stripe secrets are configured, create a real low-value checkout and confirm in DB:

```sql
select id, status, payment_status, metadata ->> 'stripe_payment_intent'
from public.orders
order by created_at desc
limit 5;
```

Expected: paid orders have `payment_status = 'captured'` and a Stripe payment intent.

### Task 4: Add Financial Drift Dashboard

**Files:**
- Create: `src/lib/financialHealth.ts`
- Create: `src/test/financial-health.test.ts`
- Modify: `src/pages/admin/AdminCompta.tsx`

- [ ] **Step 1: Write failing test for drift detection**

```ts
import { describe, expect, it } from "vitest";
import { summarizeFinancialHealth } from "@/lib/financialHealth";

describe("financial health", () => {
  it("flags confirmed orders that are not captured", () => {
    expect(summarizeFinancialHealth([
      { status: "confirmed", payment_status: "pending" },
      { status: "delivered", payment_status: "captured" },
    ])).toEqual({
      confirmedNotCaptured: 1,
      refundPending: 0,
      failedPayments: 0,
      healthy: false,
    });
  });
});
```

- [ ] **Step 2: Implement `summarizeFinancialHealth`**

```ts
type PaymentRow = {
  status?: string | null;
  payment_status?: string | null;
  refund_status?: string | null;
};

export function summarizeFinancialHealth(rows: PaymentRow[]) {
  const confirmedNotCaptured = rows.filter((row) =>
    ["confirmed", "preparing", "ready", "delivered"].includes(String(row.status || ""))
    && String(row.payment_status || "") !== "captured"
  ).length;
  const refundPending = rows.filter((row) => String(row.refund_status || "") === "pending").length;
  const failedPayments = rows.filter((row) => String(row.payment_status || "") === "failed").length;

  return {
    confirmedNotCaptured,
    refundPending,
    failedPayments,
    healthy: confirmedNotCaptured === 0 && refundPending === 0 && failedPayments === 0,
  };
}
```

- [ ] **Step 3: Show admin warning**

In `AdminCompta.tsx`, query recent orders/reservations and show a warning block when `healthy` is false.

---

## Wave 2: Mobile Store Release

### Task 5: Publish iOS Universal Links

**Files:**
- Create: `public/.well-known/apple-app-site-association`
- Modify: `docs/audits/mobile-release-readiness-2026-04-30.md`

- [ ] **Step 1: Get Apple Team ID**

Required value format:

```text
TEAMID.com.tok.app
```

- [ ] **Step 2: Create AASA file**

```json
{
  "applinks": {
    "apps": [],
    "details": [
      {
        "appIDs": ["TEAMID.com.tok.app"],
        "components": [{ "/": "/*" }]
      }
    ]
  }
}
```

- [ ] **Step 3: Verify**

Run: `npm run release:readiness`

Expected: iOS Universal Links error disappears.

### Task 6: Finalize Android Release Signing

**Files:**
- Create locally only: `android/keystore.properties`
- Keep committed: `android/keystore.properties.example`

- [ ] **Step 1: Generate or retrieve release keystore**

Use the production keystore and put the local config in:

```text
android/keystore.properties
```

- [ ] **Step 2: Verify release build**

Run:

```bash
npm run mobile:build:android:release
```

Expected: release APK/AAB build succeeds.

---

## Wave 3: Real-Time Marketplace Operations

### Task 7: Add Dispatch SLA Health

**Files:**
- Create: `src/lib/dispatchHealth.ts`
- Create: `src/test/dispatch-health.test.ts`
- Modify: `src/pages/admin/AdminOrdersReservations.tsx`

- [ ] **Step 1: Write failing SLA test**

```ts
import { describe, expect, it } from "vitest";
import { summarizeDispatchHealth } from "@/lib/dispatchHealth";

describe("dispatch health", () => {
  it("flags stale searching jobs", () => {
    expect(summarizeDispatchHealth([
      { status: "searching", created_at: "2026-05-25T10:00:00.000Z" },
    ], new Date("2026-05-25T10:12:00.000Z"))).toEqual({
      searchingOverTenMinutes: 1,
      activeWithoutCourier: 0,
      healthy: false,
    });
  });
});
```

- [ ] **Step 2: Implement `summarizeDispatchHealth`**

Flag jobs that are searching longer than 10 minutes or active without courier assignment.

- [ ] **Step 3: Surface in admin operations**

Add an admin warning panel showing stale dispatch jobs and direct links to affected orders.

### Task 8: Reservation Inventory Integrity

**Files:**
- Create: `src/lib/reservationInventoryHealth.ts`
- Create: `src/test/reservation-inventory-health.test.ts`
- Modify: `src/pages/dashboard/DashboardReservations.tsx`
- Modify: `supabase/migrations/<next>_reservation_inventory_guards.sql`

- [ ] **Step 1: Add tests for overbooking detection**

Detect duplicate confirmed reservations for the same restaurant, date, time, and table when table assignment is present.

- [ ] **Step 2: Add DB guard**

Add a partial unique index for confirmed table reservations after validating existing data.

- [ ] **Step 3: Add dashboard warning**

Show overbooking warnings to restaurateurs and admins.

---

## Wave 4: Trust, Safety, And Quality

### Task 9: Verified Review Enforcement

**Files:**
- Modify: `supabase/migrations/20260418120000_submit_verified_review_rpc.sql`
- Create: `src/test/reviews-verified-only.test.ts`
- Modify: `src/components/ReviewForm.tsx`

- [ ] **Step 1: Test verified review eligibility**

Only users with a delivered order or completed reservation can submit a review for that restaurant.

- [ ] **Step 2: Enforce in RPC**

Reject reviews without a qualifying order/reservation.

- [ ] **Step 3: Update UI copy**

Show the review form only when the user is eligible; otherwise show a concise eligibility message.

### Task 10: Restaurant Catalog Quality Gate

**Files:**
- Create: `src/lib/catalogQuality.ts`
- Create: `src/test/catalog-quality.test.ts`
- Modify: `src/pages/admin/AdminRestaurants.tsx`

- [ ] **Step 1: Test quality score**

Score restaurants by required fields: image, address, coordinates, opening hours, menu, active payment methods, cuisine categories.

- [ ] **Step 2: Implement score helper**

Return missing fields and a publishable boolean.

- [ ] **Step 3: Add admin quality column**

Admin can filter restaurants that are not production-ready.

---

## Wave 5: Growth And Marketplace Liquidity

### Task 11: City Liquidity Cockpit

**Files:**
- Create: `src/lib/marketplaceLiquidity.ts`
- Create: `src/test/marketplace-liquidity.test.ts`
- Modify: `src/pages/admin/AdminHome.tsx`

- [ ] **Step 1: Test city liquidity scoring**

Input counts for active restaurants, active couriers, open orders, no-courier jobs, and successful deliveries.

- [ ] **Step 2: Implement scoring**

Return red/yellow/green per city.

- [ ] **Step 3: Add admin cockpit card**

Show cities that cannot support reliable delivery yet.

### Task 12: Lifecycle CRM Foundations

**Files:**
- Create: `src/lib/lifecycleSegments.ts`
- Create: `src/test/lifecycle-segments.test.ts`
- Modify: `src/pages/admin/AdminNotifications.tsx`

- [ ] **Step 1: Test segments**

Segments: new user, first order missing, churn risk, loyal customer, Tok One candidate.

- [ ] **Step 2: Implement segment helper**

Return deterministic segment labels from order/reservation/subscription history.

- [ ] **Step 3: Add notification targeting**

Expose lifecycle segment filters in admin notifications.

---

## Required Verification After Each Wave

- [ ] Run targeted Vitest files for changed helpers.
- [ ] Run `npm run test`.
- [ ] Run `npm run build`.
- [ ] Run `npm run release:readiness` before release candidates.
- [ ] Run `npm run supabase:doctor:prod` before production migrations.
- [ ] For mobile releases, run `npm run mobile:build:android:release` and iOS release build on macOS.

## External Blockers

- Real Apple Team ID is required before publishing `apple-app-site-association`.
- Android release keystore must come from secure storage or CI secrets.
- Stripe live webhook endpoint and signing secret must be configured in Stripe Dashboard and Supabase Edge Function secrets.
- APNs and Firebase production credentials must be configured before store release.
- Marketplace liquidity requires real restaurant/courier onboarding; code can measure and route it, but cannot create supply alone.
