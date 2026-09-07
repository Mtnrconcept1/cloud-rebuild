# TheTok Print + Cloudprinter Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a complete white-label print-commerce workflow to TheTok Marketing Studio so a restaurateur can turn an approved marketing visual into a provider-compliant print file, pay TheTok in CHF, submit the paid order to Cloudprinter Core API, and track production, delivery, cancellation and reprint from TheTok.

**Architecture:** Introduce a dedicated `print` domain behind a provider-neutral interface. Supabase/Postgres is the durable source of truth for catalog snapshots, print documents/exports, quotes, orders, fulfillment jobs and provider events; Edge Functions own all privileged actions and Cloudprinter/Stripe secrets. Reuse the existing `payment_attempts` + Stripe webhook machinery and keep Cloudprinter submission asynchronous through an idempotent outbox worker so a successful payment can never be lost when the provider is unavailable.

**Tech Stack:** React 18 + Vite + TypeScript + TanStack Query + Tailwind/shadcn, Supabase Postgres/RLS/Storage/Edge Functions (Deno), Stripe Checkout + existing payment-attempt framework, Cloudprinter Core API + CloudSignal webhooks, Vitest, GitHub Actions.

**Spec:** This plan implements the product/technical specification agreed in the 2026-09-07 TheTok Cloudprinter integration discussion.

## Global Constraints

- Risk level: 3 / critical.
- Never modify `main` directly; implementation is on `feat/thetok-print-cloudprinter-20260907`.
- No Cloudprinter or service-role secret may reach React/browser bundles.
- No provider order may be submitted before Stripe confirms payment.
- Frontend totals, provider SKUs, quote amounts and ownership are never trusted; server revalidates them.
- Every provider create-order path is idempotent and reconciles ambiguous timeouts before retrying.
- Every sensitive public table has RLS; service-only cost/provider payload tables are not readable by restaurateurs.
- Demo/commercial identities must be blocked from real provider side effects.
- New SQL is additive/idempotent where possible; never edit historical migrations.
- Existing Marketing Studio generation must keep working when print is disabled or Cloudprinter is unavailable.
- Keep Cloudprinter behind a provider interface so a second provider can be added without changing Marketing Studio.
- Switzerland/CHF is the initial customer-facing market; provider billing currency is stored separately.
- Use Cloudprinter sandbox until merchant credentials and reseller/white-label terms are confirmed.

---

### Task 1: Lock contracts with failing tests

**Files:**
- Create: `src/test/marketing-print-contract.test.ts`
- Create: `supabase/functions/_shared/print/print-domain.test.ts`

**Interfaces:**
- Produces contract expectations for SQL schema, Edge endpoints, provider abstraction, server-side pricing, payment gating, idempotency, webhook authentication, demo blocking, UI entry points and secret deployment.

- [ ] Write tests that fail on main because print tables/functions/components do not exist.
- [ ] Assert production order submission can only occur after a finalized `payment_attempt` of kind `marketing_print_order`.
- [ ] Assert Cloudprinter key/webhook key are read only in server code.
- [ ] Assert `TokAiMarketingStudio` delegates printing to a focused print component instead of embedding provider logic.
- [ ] Run targeted Vitest tests and capture the expected RED result.
- [ ] Commit the failing contracts before production implementation.

### Task 2: Database, RLS, Storage and durable state machine

**Files:**
- Create: `supabase/migrations/20260907023000_marketing_print_foundation.sql`
- Modify generated types only if the repository convention requires it after migration generation.

**Interfaces:**
- Produces tables: `print_products`, `print_provider_products`, `print_documents`, `print_exports`, `print_quotes`, `print_orders`, `print_order_items`, `print_order_events`, `print_provider_events`, `print_fulfillment_jobs`, plus private bucket `print-production-files`.
- Produces RPCs for atomic quote acceptance, proof approval, paid-order finalization, fulfillment leasing/completion and provider-event recording.

- [ ] Add enums/check constraints for explicit lifecycle states.
- [ ] Add foreign keys to restaurant/user/payment attempt where appropriate.
- [ ] Enable RLS on all user-facing print tables.
- [ ] Add owner/admin SELECT policies; keep wholesale costs/provider raw payloads service-only.
- [ ] Add indexes for restaurant/timeline/status/provider-reference/next-attempt queries.
- [ ] Add private Storage bucket and ownership policies for proof/preview assets; production PDF access stays server-mediated.
- [ ] Add immutable snapshots for provider spec, price and approved production-file hashes.
- [ ] Add unique constraints for provider order references and provider event deduplication.
- [ ] Add admin/platform kill switch settings without depending on PR #640 feature-catalog files.
- [ ] Run SQL/RLS contract tests.

### Task 3: Provider-neutral print core and Cloudprinter client

**Files:**
- Create: `supabase/functions/_shared/print/types.ts`
- Create: `supabase/functions/_shared/print/provider.ts`
- Create: `supabase/functions/_shared/print/cloudprinter.ts`
- Create: `supabase/functions/_shared/print/pricing.ts`
- Create: `supabase/functions/_shared/print/security.ts`

**Interfaces:**
- `PrintProvider.getProducts/getProduct/getPrice/getQuote/createOrder/getOrder/cancelOrder/reorder`.
- `CloudprinterProvider` maps CloudCore REST responses into provider-neutral types.
- Server-side retail pricing returns provider cost/billing currency/customer CHF total/margin snapshot.

- [ ] Write/extend failing unit tests for payload validation and price invariants.
- [ ] Implement explicit request timeouts and bounded retries for safe read calls.
- [ ] Never blindly retry ambiguous `orders/add`; first reconcile by TheTok reference.
- [ ] Reject non-HTTPS production-file URLs.
- [ ] Generate/verify MD5 for Cloudprinter compatibility and store SHA-256 for TheTok integrity.
- [ ] Normalize Cloudprinter errors into retryable/permanent classes without leaking provider secrets.

### Task 4: Catalog synchronization and print-safe product model

**Files:**
- Create: `supabase/functions/print-catalog/index.ts`
- Create: `src/lib/print/types.ts`
- Create: `src/lib/print/client.ts`

**Interfaces:**
- Authenticated restaurant read endpoint returns only TheTok-enabled products/variants and non-sensitive specs.
- Admin/scheduler sync action refreshes Cloudprinter mappings/spec snapshots.

- [ ] Map provider specs including trim dimensions, bleed, safe margin, sides, orientation, quantity min/step and printing technology.
- [ ] Seed/activate the initial Swiss MVP: A6/A5/A4 flyers, A3 poster and business card when provider mappings exist.
- [ ] Fail closed when provider mappings are unavailable instead of inventing SKU/options.
- [ ] Cache/snapshot catalog data in Postgres; do not call Cloudprinter from every render.

### Task 5: Structured Marketing Document, format adaptation and preflight

**Files:**
- Create: `src/lib/print/document.ts`
- Create: `src/lib/print/preflight.ts`
- Create: `src/components/dashboard/marketing-print/PrintComposerDialog.tsx`
- Create: `src/components/dashboard/marketing-print/PrintProof.tsx`
- Modify: `src/components/dashboard/TokAiMarketingStudio.tsx`

**Interfaces:**
- `MarketingPrintDocument` keeps background/visual, logo, text, price/date/address/CTA/QR and layout tokens separate.
- `runPrintPreflight(document, productSpec)` returns blocking errors + warnings.

- [ ] Add print CTA after a successful Marketing Studio visual.
- [ ] Adapt composition to physical trim/bleed/safe zones instead of stretching a social image.
- [ ] Keep factual text and QR generated by TheTok rather than rasterized AI text.
- [ ] Display bleed/cut/safe guides only in proof UI, never in final artwork.
- [ ] Block checkout on incorrect size, unsafe critical text, missing pages, invalid QR or insufficient effective image resolution.
- [ ] Keep digital-only Marketing Studio behavior unchanged.

### Task 6: Server PDF export and proof approval

**Files:**
- Create: `supabase/functions/print-export/index.ts`
- Create: `supabase/functions/_shared/print/pdf.ts`

**Interfaces:**
- Server receives an owned structured print document + product spec, produces immutable proof/production export metadata, and persists MD5/SHA-256.

- [ ] Generate a provider-ready PDF with exact physical dimensions and explicit TrimBox/BleedBox/CropBox.
- [ ] Embed/vectorize deterministic text and QR content; preserve raster artwork at sufficient effective resolution.
- [ ] Apply color policy from the product/print-technology snapshot rather than forcing CMYK universally.
- [ ] Persist export version, preflight result and file hashes.
- [ ] Require explicit proof approval before quote checkout.

### Task 7: Quote, margin and Stripe Checkout

**Files:**
- Create: `supabase/functions/print-quote/index.ts`
- Create: `supabase/functions/print-checkout/index.ts`
- Modify: `supabase/functions/stripe-webhook/index.ts`
- Reuse: `supabase/functions/_shared/payment-attempts.ts`
- Create: `src/lib/print/checkout.ts`

**Interfaces:**
- Quote endpoint recalculates provider price server-side and stores wholesale/customer snapshots + expiry.
- Checkout creates an existing-framework `payment_attempt` with kind `marketing_print_order` and Stripe-hosted Checkout in CHF.

- [ ] Customer never supplies authoritative total.
- [ ] Requote when provider quote is stale/expired.
- [ ] Store provider currency/exchange-rate snapshot separately from CHF retail price.
- [ ] Attach `print_order_id` + payment-attempt metadata to Stripe Checkout.
- [ ] Extend Stripe webhook idempotently: paid print attempt -> `print_order=paid` + one fulfillment job.
- [ ] Payment success with fulfillment failure remains visible/recoverable, never lost.
- [ ] Payment cancellation/expiration never creates provider fulfillment.

### Task 8: Fulfillment outbox and Cloudprinter submission

**Files:**
- Create: `supabase/functions/print-orchestrator/index.ts`

**Interfaces:**
- Claims due fulfillment jobs with lease token, submits paid orders, reconciles uncertain submissions, updates durable lifecycle and retries with bounded backoff.

- [ ] Enforce `assertProductionFlowAllowed` and restaurant ownership before interactive enqueue.
- [ ] Generate immutable `TOKP_<uuid>` provider reference.
- [ ] Create short-lived signed production URL only from the server.
- [ ] On timeout/5xx after create, query order info by reference before retrying create.
- [ ] Persist provider IDs, normalized state and operational errors.
- [ ] Respect kill switch for new submissions while still reconciling existing orders.

### Task 9: CloudSignal webhook and reconciliation

**Files:**
- Create: `supabase/functions/cloudprinter-webhook/index.ts`
- Create: `supabase/functions/print-reconcile/index.ts`

**Interfaces:**
- Webhook authenticates the dedicated CloudSignal secret/key, deduplicates events and advances a monotonic TheTok state machine.
- Reconcile repairs missing/out-of-order signals using Core API order info.

- [ ] Enforce payload size/method/auth checks before parsing side effects.
- [ ] Record provider event before applying business transition.
- [ ] Map validated/produce/produced/packed/shipped/delivery/error/canceled signals.
- [ ] Store carrier/tracking URL without exposing wholesale/provider internals.
- [ ] Reconciliation queries only stale/non-terminal orders and is paginated/bounded.

### Task 10: Restaurant tracking, notifications and reorder/cancel UX

**Files:**
- Create: `src/components/dashboard/marketing-print/PrintOrdersPanel.tsx`
- Create: `src/components/dashboard/marketing-print/PrintOrderDetails.tsx`
- Create: `supabase/functions/print-order-action/index.ts`
- Modify the existing Marketing Studio host page only where needed to expose the panel.

**Interfaces:**
- Restaurant sees own print orders, proof, retail amount, lifecycle timeline, delivery/tracking and supported actions.

- [ ] Add paginated "Mes impressions" UI.
- [ ] Add cancel-request action with provider result; never promise guaranteed cancellation.
- [ ] Add reprint issue intake with reason/evidence metadata.
- [ ] Emit in-app/push/email notifications only for meaningful milestones/errors, reusing existing notification infrastructure without coupling to PR #640 internals.

### Task 11: Admin Print operations and SAV

**Files:**
- Create: `src/pages/admin/AdminPrintOrders.tsx`
- Create: `supabase/functions/print-admin/index.ts`
- Modify admin routing/navigation only as required by existing conventions.

**Interfaces:**
- Admin can inspect orders/incidents, provider costs, margins, event history, reconcile, request cancel/reprint and operate kill switch.

- [ ] Protect every mutation by explicit admin role and audit log.
- [ ] Redact secrets and customer PII from provider payload logs.
- [ ] Add filters for restaurant/status/date/provider/reference and pagination.
- [ ] Add manual reconciliation and retry actions with idempotent server semantics.

### Task 12: Secrets, deployment wiring and sandbox/live guard

**Files:**
- Modify: `scripts/write-supabase-secrets-env.mjs`
- Modify: `.github/workflows/deploy-production.yml`
- Modify: `supabase/config.toml`
- Update existing secret-scope/contract tests.

**Interfaces:**
- Server-only variables: `CLOUDPRINTER_API_KEY`, `CLOUDPRINTER_WEBSIGNAL_KEY` (exact provider naming confirmed in implementation), `CLOUDPRINTER_MODE=sandbox|live`, optional API base URL only when allowlisted.

- [ ] Add secrets to the existing Supabase function-secret sync path.
- [ ] Default fail-closed to sandbox unless live mode and key are explicitly provisioned.
- [ ] Never add VITE-prefixed provider secrets.
- [ ] Configure webhook function without JWT only because it performs its own provider authentication; authenticated restaurant/admin functions require user JWT/custom auth helper.

### Task 13: Full verification and PR

**Files:**
- Update tests/docs only as required by validation results.

- [ ] Run targeted print contracts.
- [ ] Run payment-critical tests.
- [ ] Run Supabase/RLS/storage guard tests.
- [ ] Run `pnpm lint`.
- [ ] Run `pnpm typecheck`.
- [ ] Run `pnpm test` / production test shards via CI.
- [ ] Run production build via CI.
- [ ] Run Supabase doctor/target and advisor checks applicable to the new migration.
- [ ] Validate Cloudprinter sandbox scenarios when credentials exist; otherwise keep live fulfillment disabled and document the external credential blocker.
- [ ] Review complete diff for secrets, unrelated files and UTF-8/mojibake.
- [ ] Open PR against `main`; do not merge.

## Rollback Strategy

- UI: disable the print entry point/kill switch; existing Marketing Studio remains functional.
- Provider: stop new fulfillment while continuing read-only reconciliation/tracking for already submitted orders.
- Payment: no new Checkout sessions when print is disabled; already paid orders remain durable and support-visible.
- Database: schema is additive; rollback application code without dropping historical print/order/audit data.
- Cloudprinter: sandbox/live mode is explicit; live credential removal prevents new provider submissions.
