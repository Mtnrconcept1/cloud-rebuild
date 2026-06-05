# TOK Global Application Audit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Re-audit the TOK application locally across frontend, Supabase, payments, admin, courier, restaurant operations, release readiness, and browser smoke flows, then fix scoped issues when evidence supports the change.

**Architecture:** Treat the audit as layered verification: repository state, static/code scans, database/advisor checks, test/build gates, rendered browser checks, and issue/status publication. Database production remains read-only from Codex; deploy and migration application stay with GitHub Actions.

**Tech Stack:** React, Vite, TypeScript, Tailwind/shadcn, Supabase/Postgres/RLS/Edge Functions, Stripe, Capacitor, Firebase, pnpm, Vitest, Browser plugin.

---

### Task 1: Baseline Workspace And Existing Changes

**Files:**
- Read: `package.json`
- Read: `.github/workflows/*.yml`
- Read: `git status`

- [ ] **Step 1: Capture git state**

Run: `git status --short --branch`
Expected: current branch plus modified/untracked files, with no destructive reset.

- [ ] **Step 2: Capture scripts and package manager**

Run: `node -e "const p=require('./package.json'); console.log(p.packageManager); console.log(Object.keys(p.scripts||{}).sort().join('\n'))"`
Expected: `pnpm@10.28.1` and expected validation scripts.

- [ ] **Step 3: Identify pre-existing untracked artifacts**

Run: `git ls-files --others --exclude-standard`
Expected: untracked files listed without deletion unless directly required by the audit.

### Task 2: Static Security And Configuration Audit

**Files:**
- Read: `src/**/*.{ts,tsx}`
- Read: `supabase/functions/**/*.ts`
- Read: `vercel.json`
- Read: `index.html`

- [ ] **Step 1: Scan high-risk frontend sinks**

Run: `rg -n "dangerouslySetInnerHTML|innerHTML|outerHTML|insertAdjacentHTML|document\.write|eval\(|new Function|postMessage|addEventListener\\(['\\\"]message|window\.location|location\.(href|assign|replace)|javascript:" src index.html`
Expected: every hit reviewed for trusted source, safe allowlist, or documented risk.

- [ ] **Step 2: Scan secret exposure patterns**

Run: `rg -n "(service_role|SUPABASE_SERVICE_ROLE|STRIPE_SECRET|WEBHOOK_SECRET|PRIVATE_KEY|client_secret|sk_live|sk_test)" src public supabase/functions scripts .github`
Expected: no secret value in browser-delivered code; server-side references only.

- [ ] **Step 3: Scan CORS and domain coverage**

Run: `rg -n "admin\\.thetok\\.ch|www\\.thetok\\.ch|ALLOWED_ORIGINS|Access-Control-Allow-Origin" src supabase/functions scripts .github docs`
Expected: admin and public domains consistently handled.

### Task 3: Supabase, RLS, RPC, And Migrations

**Files:**
- Read: `supabase/migrations/*.sql`
- Read: `supabase/functions/**/index.ts`
- Read: `src/integrations/supabase/*`

- [ ] **Step 1: Verify local production targeting**

Run: `pnpm run supabase:doctor:prod`
Expected: production project ref `wwcrtyoueexyxkkikaos` and no target mismatch errors.

- [ ] **Step 2: Review Supabase security advisors**

Run: Supabase advisor query for project `wwcrtyoueexyxkkikaos`.
Expected: actionable warnings classified; production changes not applied directly.

- [ ] **Step 3: Review Supabase performance advisors**

Run: Supabase performance advisor query for project `wwcrtyoueexyxkkikaos`.
Expected: missing indexes and policy debt classified against local migrations/tests.

- [ ] **Step 4: Guard recursive RLS risks**

Run: `rg -n "social_post_comments|CREATE POLICY|SECURITY DEFINER|search_path" supabase/migrations`
Expected: no new self-referential comment policy introduced; security definer functions set `search_path`.

### Task 4: Payments, Orders, Refunds, And Accounting

**Files:**
- Read: `supabase/functions/create-checkout/index.ts`
- Read: `supabase/functions/stripe-webhook/index.ts`
- Read: `supabase/functions/complete-order-checkout/index.ts`
- Read: `supabase/functions/process-refund/index.ts`
- Read: `src/test/*checkout*`
- Read: `src/test/*stripe*`
- Read: `src/test/*payment*`

- [ ] **Step 1: Verify server-side pricing and checkout**

Run: `rg -n "total|amount|price|metadata|stripe" supabase/functions/create-checkout supabase/functions/complete-order-checkout`
Expected: authoritative totals calculated or validated server-side.

- [ ] **Step 2: Verify webhook idempotency**

Run: `rg -n "idempot|checkout_session|payment_intent|ON CONFLICT|upsert|signature|constructEvent|raw" supabase/functions/stripe-webhook src/test`
Expected: raw body signature verification and duplicate event/session protection.

- [ ] **Step 3: Verify admin reconciliation coverage**

Run: `rg -n "orphan|pending_payment|refund|payment_transactions|admin_get_marketplace_alerts" supabase/migrations src/pages src/components src/test`
Expected: abnormal payment states visible to admin/support.

### Task 5: Frontend Routes, Roles, Feature Flags, And Query Bounds

**Files:**
- Read: `src/App.tsx`
- Read: `src/components/ProtectedRoute.tsx`
- Read: `src/lib/roleAccess.ts`
- Read: `src/lib/featureCatalog.ts`
- Read: `src/pages/**/*.{ts,tsx}`

- [ ] **Step 1: Verify route protection**

Run: `pnpm vitest run src/test/route-wiring.test.ts src/test/role-route-wiring.test.ts src/test/admin-domain-routing.test.ts`
Expected: role-protected route contracts pass.

- [ ] **Step 2: Verify feature flag wiring**

Run: `pnpm vitest run src/test/feature-flags.test.ts src/test/pack-feature-gating.test.ts`
Expected: gated routes remain graceful when disabled.

- [ ] **Step 3: Verify large-list bounds**

Run: `pnpm vitest run src/test/public-offer-query-governance.test.ts src/test/frontend-10k-readiness.test.ts`
Expected: public menu/restaurant queries and global 10k guards pass.

### Task 6: Restaurant, Courier, Admin, Notifications, Mobile, SEO, Media

**Files:**
- Read: `src/pages/dashboard/**/*.{ts,tsx}`
- Read: `src/pages/admin/**/*.{ts,tsx}`
- Read: `src/pages/courier/**/*.{ts,tsx}`
- Read: `src/lib/notifications*`
- Read: `supabase/functions/send-push/index.ts`
- Read: `public/robots.txt`
- Read: `src/lib/seo*`

- [ ] **Step 1: Run focused governance tests**

Run: `pnpm vitest run src/test/admin-operations-center.test.ts src/test/admin-notifications-governance.test.ts src/test/notifications-sinistres-governance.test.ts src/test/seo-growth.test.ts src/test/restaurant-media-governance.test.ts src/test/courier.test.ts`
Expected: governance tests pass or reveal scoped defects.

- [ ] **Step 2: Review mobile/deep-link domains**

Run: `rg -n "admin\\.thetok\\.ch|thetok\\.ch|deep|link|Capacitor|notification" src capacitor.config.* public`
Expected: admin/public domains do not break native navigation.

### Task 7: Browser Smoke Verification

**Files:**
- Read: current local dev server output

- [ ] **Step 1: Find or start local dev server**

Run: inspect listening ports for Vite; if needed run `pnpm dev -- --host 127.0.0.1 --port 5173`.
Expected: local app reachable without killing unrelated processes.

- [ ] **Step 2: Verify public route**

Browser flow: `http://127.0.0.1:5173/` -> first meaningful screen renders -> no app console errors.
Expected: homepage visible with no framework overlay.

- [ ] **Step 3: Verify admin route local behavior**

Browser flow: `http://127.0.0.1:5173/admin` -> admin shell renders locally -> local host is not redirected to production admin domain.
Expected: admin page or protected/auth state visible, no blank shell.

- [ ] **Step 4: Verify representative public feature routes**

Browser flow: `/recherche`, `/anti-gaspi`, `/ventes-flash`, `/contact`.
Expected: first meaningful content visible, no framework overlay.

### Task 8: Full Verification Gates And Status Publication

**Files:**
- Read: GitHub issues through `gh`

- [ ] **Step 1: Run required gates**

Run: `pnpm run lint`
Run: `pnpm run test`
Run: `pnpm run build`
Run: `pnpm run build:prod`
Expected: all pass, or failures are investigated and fixed or documented as external blockers.

- [ ] **Step 2: Run release/readiness gates**

Run: `pnpm run lint:release`
Run: `pnpm run test:prod`
Run: `pnpm run check:frontend:10k`
Run: `pnpm run test:launch:10k`
Run: `pnpm run release:readiness`
Expected: pass where local config allows; environment-only blockers listed explicitly.

- [ ] **Step 3: Publish GitHub statuses**

Run: `gh issue list --repo mtnrconcept/cloud-rebuild --state open --limit 50`
Expected: every open issue relevant to audit receives factual status, no production deployment claim unless executed by workflow.

- [ ] **Step 4: Final verification summary**

Run: `git status --short --branch`
Expected: list all modified/untracked files, validations, residual risks, and production handoff items.
