# TOK audit remediation — finalisation plan

> For agentic workers: execute inline with the test-driven and verification gates.

**Goal:** publish the outstanding audit fixes on a dedicated branch, without undoing the production recovery or changing main directly.
**Architecture:** preserve the existing React/Vite, shared Edge handlers, PostgreSQL RLS and deployment pipeline. Use targeted patches, a new hardening migration, and actual PostgreSQL permission tests.
**Tech stack:** Node 22, pnpm 10.28.1, React 18, Vite 6, TypeScript, Supabase/PostgreSQL 17, Vercel.
**Spec:** the owner-requested 3 October full audit and its interrupted remediation, based here on main `b78debfda01f1e2eb9fd90c3b26563a94b3f0048`.

## Constraints and verified baseline

- Risk level 3: permissions, money-related records, fulfillment, shared authentication helper and delivery configuration.
- GitHub, Supabase Tok, Vercel production and Stripe Tok access checked. No live payments or customer-data changes in validation.
- Source and pending candidate recovered with provenance from workflow 37156236869. The original candidate patch SHA-256 is `639ffd8f05a1763024cc0e2b860710e737f06efb91983d0d8b5c9e34e03d4966`.
- A real isolated local worktree is used. Main is not edited. The read-only source repository is only an object store.
- Main already incorporates PRs 700/702–708: preserve marketing changes, the 30 recovered migration sources, seven removed aliases, the working redirect middleware and canonical application index.
- The live database still grants authenticated limiter execution and client promo-history mutations. These findings are not presumed fixed merely because deployment now succeeds.
- Do not delete historic SQL, customer rows, media or indexes based on diagnostics alone. Do not modify secrets or bypass verified-commit checks.
- No merge or production rollout of this new branch is performed in this phase.

## Review focus

- A SQL transition or retry-persistence failure must not result in a completed print job.
- A canceled/refunded order, even with a stale paid flag, must not reach the supplier; ambiguous submissions must reconcile without duplicate creation.
- Promo history must remain usable for cash/zero-balance checkout through the ownership-checked RPC, but not writable through client table calls.
- Camera permission must work after SPA navigation, remain same-origin and user-mediated, and preserve manual fallback and stream cleanup.
- All previously missing declared routes need precise delivery without a blanket rewrite hiding unknown URLs or indexing private pages.

## Planned steps and file families

1. Reproduce pending handler/marketing failures on current main using `scripts/tok-runtime-regression.test.cjs`; recover the existing camera/metadata tests. Baseline: 29 tests, 25 failures, 4 passes.
2. Patch `supabase/functions/print-orchestrator/index.ts` and `_shared/auth.ts`; keep public contracts, idempotency, role checks and nonblocking audit behavior. Add negative/runtime cases to the existing harness and Vitest wrapper.
3. Complete the existing hardening migration candidate and its `scripts/fixtures/tok-audit-schema.sql`, `supabase/tests/tok-audit-runtime-hardening.sql` and `.github/workflows/tok-runtime-security.yml`. Test real PostgreSQL DML denials, ownership, server-only limiter, discount calculation, idempotent retries and repeated migration application. The fixture is not a production backup.
4. Patch `vercel.json`, `src/hooks/useSeoMeta.ts`, `scripts/prerender-seo.mjs` and `src/components/courier/DeliveryProofPanel.tsx`. Keep the middleware-based redirect strategy and all current CSP/domain settings. Add routing and camera lifecycle checks.
5. Share a dependency-free marketing adapter capability table between `_shared/marketing-capabilities.ts`, the orchestrator and `src/marketing/marketingClient.ts`; never label connected credentials as a implemented publishing adapter. Preserve newer lease and unsubscribe changes. Update only affected contracts in existing tests.
6. Add exact-content duplicate migration guard and reviewed current baseline; integrate it in `_validation.yml`. Add an early read-only migration dry-run gate in `deploy-production.yml` before configuration/secret mutation. Preserve the current source/history reconciliation rather than reinstating obsolete alias handling. Support read-only demo preflight in the existing demo migration script.
7. Regenerate the canonical architecture index and reference from the final source. Full tests, lint, typecheck, build, worker checks and audits use an isolated runner. Build-generated public sitemaps are restored from the pinned source, not committed as fake CI data.
8. Review complete diff and exact file hashes; create a clean commit and PR on the dedicated finalisation branch. Remove all temporary transfer/validation workflows from the final deliverable. Supply full modified files and validation evidence to the owner.

## Risks and rollback

The shared audit helper affects multiple Edge bundles; review and deploy through the existing pipeline only after the branch is accepted. Test fixture coverage does not certify every deployed bundle or external provider. Pipeline preflight checks history/SQL applicability, not complete migration semantics. Roll back source through a revert PR; capture pre-migration ACLs and use a reviewed forward migration for database rollback. Do not reopen client promo writes or limiter execution as a generic workaround. External social adapters, main administration protections, and measured database tuning remain explicitly distinct from tested code remediation.

## Decisions made during final review

- The former redirect and migration-alias patch is intentionally not restored: PRs 703/706/707 already fixed those areas differently and are serving a READY production deployment.
- Camera permission is limited to the same origin in the application document. A route-only permission header would remain disabled after SPA navigation from the homepage. Browser consent, courier route authorization, manual alternatives and microphone denial are retained.
- Unavailable menu items stay visible to the actual restaurant owner and to an administrator, while anonymous users only see available items within the existing restrictive restaurant/demo boundary.
- The new history gate uses the standard CLI dry-run over the now-reconciled source. This checks history and pending migration selection; the isolated SQL tests provide the separate semantic/permission checks.
- The original migration candidate timestamp is preserved: it was prepared in the interrupted remediation and remains absent from main and production. The pipeline uses --include-all, and the migration is independent of the later marketing foundation migration.
- External social adapters are not invented or activated. The misleading availability signal is corrected, while real provider integration remains explicitly blocked.
