# TOK route and navigation audit — 2026-10-09

## Scope and release status

Repository: Mtnrconcept1/cloud-rebuild. Audited main commit: `6104db5ef0d7a5de84e7a13448be48cf65e9dbc1`.
Production alias and deployment were verified through Vercel: `www.thetok.ch`, `dpl_GhAU5wSrNfz32UnY1iCnYWhTcL5Q`, same source commit.
Work was performed in the dedicated worktree/branch `fix/tok-route-navigation-audit-20261009`.
These changes have NOT been merged or deployed to production. No database, RLS, authentication, secrets, payment, DNS or account writes were performed.

## Findings and changes

131 React route declarations were inventoried: 119 fixed paths, 10 parameterized patterns and 2 wildcard declarations.
129 direct production GET probes cover all 119 fixed paths and one example of each parameterized pattern: 116 returned HTTP 200, 13 returned HTTP 404.
The order UUID probe is deliberately a nonexistent identifier and validates only shell serving, not access to an actual order. Dynamic examples do not exhaust every record or parameter.
416 literal internal navigation references were checked with React Router matching; none points outside the declared route registry. Computed links are not included in that count.

The missing server routes are now covered by narrow Vercel rewrites, without a blanket SPA fallback. Existing prerendered restaurateur SEO pages remain outside the new rewrite. Unknown URLs/assets/API routes retain their existing handling.
The widget rewrite overlaps the delivery part of open PR #676, but does not claim to address that PR's CSP/widget execution work. Review alongside #710 for Vercel configuration conflicts.

Dashboard selection previously recovered empty/stale stored restaurant IDs in an effect, after the access gate rendered. Behavioral regression tests reproduced redirects from `/dashboard/reservations` to `/dashboard` during initial hydration. Selection is now derived synchronously from the authorized restaurant list before access checks. Storage failures no longer crash this provider. Demo snapshots remain authoritative and out-of-scope restaurant IDs are rejected.
No account receives additional restaurant or role access.

## Verification

- RED: all 13 serving regressions failed against the original configuration. Three dashboard behavior cases failed: asynchronous selection, stale selection and unavailable storage.
- GREEN: 63 focused tests across 9 files passed after the fixes, including 24 new regression cases.
- Typecheck passed. Focused lint passed. Full lint exited 0 with 16 existing warnings.
- Full production build (`pnpm build:prod`) passed, including the SEO generation/hardening pipeline, using verified public Supabase configuration. Generated public sitemap changes were discarded; no generated catalog content is included in this patch.
- Full test command (`pnpm test --maxWorkers=2`) ran all 551 files: 544 passed, 7 failed; 2,827 individual tests passed, 6 failed, with two collection failures. Missing iOS/Android sparse-checkout files accounted for five failing native suites; those tracked directories were subsequently retrieved.
- The existing demo-isolation assertion required retaining its explicit early-return guard; the guard was preserved and its suite passed on retry.
- Retry of the seven failed suites plus the two new suites: 8 files passed, 1 failed; 47 tests passed, 1 failed. The only remaining failure is `application-search-index.test.ts`, deterministic generated-index freshness. It also fails with both modified application/configuration files restored to the audited main versions in this same environment. The generated application reference/search index has not been regenerated in this scoped patch. The whole repository is therefore NOT claimed green.
- Real anonymous Chromium checks: 8 routes at widths 1440 and 390 pixels (16 checks). All returned HTTP 200 and rendered nonempty content without captured uncaught JavaScript exceptions or horizontal overflow. Routes: `/`, `/recherche`, `/a-propos`, `/contact`, `/auth`, `/dashboard/reservations`, `/admin`, `/marketing/login`. Protected routes redirected to authentication, preserving their destination; marketing used its canonical host.
- Vercel reported no runtime-error clusters in the requested one-hour window. This is not proof that every client-side error or API scenario is absent.

## Authenticated coverage and limitations

The requested account's status, role assignments, profile, ownership and MFA metadata were inspected read-only. Its identifiers and authentication material are intentionally omitted from this public report.
The browser audit did not have the account's authenticated session. No session tokens were extracted, no magic links were generated, and no MFA or ownership checks were bypassed. Authenticated cross-role/dashboard transitions remain to be verified with that actual session. Provider navigation behavior is covered by fixture-based tests, not an end-to-end impersonation of the account.
The sampled viewport checks do not certify every visual transition, network condition, dashboard action, tablet size or device. A preview/live retest of the 13 former 404s is still required after deployment; unit tests are not presented as live HTTP results of this unpublished branch.

## Rollback and next release gate

Revert this commit to restore the prior behavior. No migration/data rollback is needed.
Before release: regenerate and verify the application search index/reference, obtain green CI, deploy an approved preview, retest serving and the authenticated account, then review for merge. Do not merge automatically.

## Final verification and concurrent repository update

The final targeted run passed 69 tests in 10 files. Focused lint, typecheck and `git diff --check` passed again after the explicit demo guard was restored.
A final fetch found that main had advanced to `702a9a19501af18b144dff7d1195eada04bacdb0` through PR #727 (home/navbar and generated documentation changes). The patch remains based on the audited `6104db5` snapshot and does not overwrite those later files. The baseline index failure described above concerns that audited snapshot, not an assertion about the newer main. Regenerate the index after integration.

## Confirmed production HTTP 404 paths before this patch

- `/coming-soon`
- `/parametres/securite`
- `/creneaux-garantis`
- `/flex-prix-bas`
- `/match-groupes`
- `/multi-restaurant`
- `/multi-stop`
- `/garantie-qualite`
- `/abonnement`
- `/tok-pulse`
- `/tok-connect/mcp-widget`
- `/restaurant/cc47c8c6-752f-406c-8c2f-ed04ebd0ca20`
- `/restaurateurs/lausanne`
