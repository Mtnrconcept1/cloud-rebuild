# Marketing campaign consistency implementation plan

> For agentic workers: execute with superpowers:executing-plans and test-driven-development.

**Goal:** Correct the inconsistencies reproduced by the 10 October recruitment campaign audit, without publishing or approving a campaign.
**Architecture:** Keep the existing React form → authenticated BFF → Edge AI proposal → session-bound draft RPC. Strengthen the pure plan contract and verify proposals again at the persistence boundary. Preserve all MFA, CSRF, role, consent and publication checks.
**Tech stack:** React, TypeScript, Vitest, existing Vercel BFF and Supabase Edge Functions; no new dependency.
**Spec:** User-approved correction scope in this conversation: future schedules, matching audiences, actionable conversion links, acquisition-specific channel guidance, explicit strategy and comparative-claims constraints, image/cost transparency.

## Global constraints

Risk level 3: AI generation, server persistence and public media. Worktree `marketing-consistency-20261010`, branch `fix/marketing-campaign-consistency-20261010`, base `702a9a19501af18b144dff7d1195eada04bacdb0`. No main change, merge, external publication, production data mutation, secret change, historical migration edit, or paid advertising. New outputs remain draft/pending. Backward-compatible optional form fields. UTF-8 throughout.

## Files and order

1. `src/test/marketing-ai-agent.test.ts` and campaign/BFF regression tests: reproduce past/out-of-window schedules, divergent audiences, invalid selectors, invalid/missing destination, altered channel selection and incorrect counts.
2. `supabase/functions/_shared/marketing-ai-plan.ts`: deterministic request and plan validation; canonical audiences and conversion URL handling; safe metadata for warnings/strategy.
3. `supabase/functions/_shared/marketing-ai.ts` and `supabase/functions/ai-marketing-agent/index.ts`: use validated request context, improve comparative/acquisition brief, keep generated images bounded and publish-compatible, expose missing media and cost limitations.
4. `server/marketingBff.ts`: validate before generation and before session-bound persistence; forward optional inputs and validated previews/warnings without weakening security.
5. `src/components/marketing/views/MarketingAgentView.tsx` and client error handling if needed: explicit destination and recruitment preset, valid dates, no default internal acquisition campaign, preview real generated copy and media, distinguish organic visibility from selected audience and text cost from total costs.
6. Relevant tests plus canonical generated documentation only when its verification requires refreshing it.

## Review focus / regression scenarios

- A plan can become stale while images are generated: validate with a fresh clock immediately before persistence.
- Model output is untrusted even under a strict JSON schema: validate selector keys, enum values, window ordering, all channels and exact item count.
- Per-item audiences must be identical to the campaign filter without silently broadening it.
- A conversion URL is a reviewed destination, not a model-invented or secret-bearing URL; use existing TOK public pages.
- Missing visuals, unknown audience reach, unapproved ad budget and image costs must never be displayed as verified readiness or as zero.

## Verification

- [ ] Baseline targeted tests.
- [ ] New regression tests fail on the original implementation.
- [ ] Implement and pass the regression tests.
- [ ] Marketing test suite, lint, typecheck, production build and canonical index check.
- [ ] Inspect diff, UTF-8, complete changed-file list and no secret/generated-file leaks.
- [ ] Clean commit, push dedicated branch, open PR and inspect checks; do not merge.

## Rollback

Revert the dedicated commit via a new PR. No database migration or production data change is planned. Existing drafts are not automatically approved, rescheduled or published; stale drafts must be reviewed explicitly before approval. A draft created by an older frontend remains subject to server validation.

## Implementation and validation record — 10 October 2026

The shared pure contract is implemented in `supabase/functions/_shared/marketing-campaign-validation.ts` so the form, Edge generator and authenticated persistence boundary agree. It adds no dependency and imports no privileged runtime into the frontend. Generated strategy metadata and the selected networks are validated; audiences are normalized without silently broadening them. The approved destination is kept in the actual outgoing CTA, not just preview metadata.

The Geneva preset selects Facebook/Instagram, the existing commission-comparison page, a consistent restaurant-prospect audience and a qualified comparison of table commission versus cover commission. It distinguishes the subscription from the commission. Generated copy, strategy, CTA, image and missing-image warnings are visible before approval. Internal acquisition is refused, organic reach is not confused with CRM matching contacts, and text cost is not described as the total image/advertising cost.

Image requests now ask for JPEG, have a bounded request timeout and a two-worker generation budget. JPEG signature/size checks precede upload. Missing visual briefs remain in drafts. The service/session/MFA/CSRF/consent/approval boundaries are unchanged. Existing production drafts have not been mutated or approved.

Validation evidence:
- Baseline: 39 existing contract/BFF tests passed before changes.
- Red regressions observed before each related fix: plan dates/audiences/links, BFF input checks, review UI, generation prompt/JPEG handling, strategy metadata and safe client feedback.
- Final focused run: 98 tests passed across 6 files.
- Application TypeScript check passed. Standalone BFF/API TypeScript check passed.
- `deno check supabase/functions/ai-marketing-agent/index.ts` passed with Deno 2.7.11.
- Lint passed: 0 errors, 16 warnings in unchanged components.
- `pnpm build:prod` passed using process-scoped public CI placeholders, without reading or changing production credentials. Inventory-dependent SEO stages correctly reported unavailable fixture inventory. The three sitemap source files touched by that fixture build were restored; no sitemap change belongs to this fix.
- Full initial test run: 2,854 passed / 7 failed, across 552 files. Failures were the application index, generated error-code map and Windows/WSL Bash path handling in two deployment test files.
- Both generated registries were refreshed using their existing scripts. The four previously failing files were rerun with Git Bash on PATH: 18 tests passed, no deployment script or test was weakened. The full 552-file suite was not rerun a second time locally; CI must validate the final commit as a whole.
- Canonical index and `git diff --check` passed after regeneration.

No real AI provider generation, campaign publication, paid advertising, production deployment, schema migration, credential rotation or RLS modification was performed. Provider calls in regression tests are mocked. The earlier live draft must be reviewed/regenerated explicitly after delivery; this code does not alter historical drafts behind an administrator's back.

Review ruling: generated `error-code-map.ts` and the two canonical application-reference files are necessary derived changes; omitting them fails the repository's deterministic checks. Rollback remains a revert of this dedicated code commit, not a mutation of historical campaign records.

## Complément de finalisation
La seconde reprise isolée confirme que le serveur est identique à la PR #736. Elle ajoute seulement la distinction entre portée publique inconnue et contacts individuels non estimés, ainsi que trois tests sur cette distinction, le maintien de l’étape éditoriale et une légende Instagram compacte. Le code a été vérifié dans le worktree isolé ; les commits de #736 sont conservés sans réécriture. Aucun merge vers main ni effet externe de campagne.
