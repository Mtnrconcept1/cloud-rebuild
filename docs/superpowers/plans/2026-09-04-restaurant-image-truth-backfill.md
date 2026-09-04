# Restaurant Image Truth and Catalog Backfill Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Verify every public directory image against the real restaurant identity, quarantine incorrect or ambiguous images, and continuously increase the number of publishable restaurants with verified names and verified images.

**Architecture:** Add an additive Supabase queue and evidence ledger for image candidates. A bounded GitHub Actions worker fetches candidates safely, classifies them with structured visual evidence, publishes only high-confidence matches, and sends rejected or ambiguous candidates back through the existing enrichment pipeline without deleting original media. Existing restaurant cards remain unchanged because only accepted candidates are written to `restaurants.image_url`.

**Tech Stack:** PostgreSQL/Supabase RLS and RPCs, Node.js 22, OpenAI Responses API image input, GitHub Actions, Vitest.

**Spec:** User request of 2026-09-04: every restaurant image must genuinely depict the corresponding restaurant, and the public catalog must continue growing beyond the current image-backed subset.

## Global Constraints

- Never write directly to `main`; use a dedicated branch and pull request.
- Existing Supabase migrations are immutable; add new migrations only.
- Never delete original Storage objects automatically.
- Never publish a candidate when exact restaurant identity is not sufficiently evidenced.
- Bound image downloads, model calls, retries, concurrency, and per-run spend.
- Preserve current transaction, payment, reservation, and restaurant ownership behavior.

---

### Task 1: Add the image-truth ledger and queues

**Files:**
- Create: `supabase/migrations/20260904173000_restaurant_image_truth_pipeline.sql`
- Test: `src/test/restaurant-image-truth-pipeline.test.ts`

- [ ] Create RLS-protected review and discovery queues.
- [ ] Add additive verification metadata to `restaurants`.
- [ ] Seed reviews for every current active directory image and discovery jobs for verified restaurants without an image.
- [ ] Add leased claim/settle RPCs restricted to `service_role`.
- [ ] Add a trigger that quarantines every future directory image candidate until it is verified.
- [ ] Prove the migration contains no destructive media or restaurant deletion.

### Task 2: Implement the bounded worker

**Files:**
- Create: `scripts/restaurant-image-truth-worker.mjs`
- Test: `src/test/restaurant-image-truth-pipeline.test.ts`

- [ ] Reject local/private URLs and oversized/non-image responses before model use.
- [ ] Extract official-page candidates from JSON-LD, OpenGraph, Twitter cards, and meaningful image tags.
- [ ] Use a strict structured-output visual classifier with restaurant name, address, city, source page, and candidate URL.
- [ ] Accept only high-confidence exact matches; hide and requeue rejected or ambiguous candidates.
- [ ] Keep retries and concurrency bounded and make settlement idempotent.

### Task 3: Orchestrate continuous catalog growth

**Files:**
- Create: `.github/workflows/restaurant-image-truth-backfill.yml`
- Test: `src/test/restaurant-image-truth-pipeline.test.ts`

- [ ] Run scheduled bounded verification and discovery rounds.
- [ ] Continue invoking the existing commercial-name and directory-image enrichment workers.
- [ ] Support a manual dry run and controlled batch size.
- [ ] Produce a non-sensitive summary artifact with visible, verified, rejected, pending, and missing-image counts.

### Task 4: Validate and release

- [ ] Run targeted tests first.
- [ ] Run lint, typecheck, full tests, and production build.
- [ ] Open a pull request and wait for all required checks.
- [ ] Merge only after every required check passes.
- [ ] Run the production backfill in bounded rounds and inspect the resulting statistics and failures.
- [ ] Confirm that no rejected or ambiguous candidate remains publicly assigned and that the publishable count increases without relaxing name or image quality gates.
