# Admin TheFork-only filter plan

Goal: add an admin control that can restrict public TOK restaurant display to verified TheFork restaurants without changing restaurant operational or transaction state.

Architecture: reuse the existing audited feature flag system with safe-positive semantics: `public-restaurants-all-sources = true` preserves the normal catalogue, while the visible `The fork` button disables that flag to enter TheFork-only mode. Materialize verified TheFork membership in an indexed mapping table so public discovery does not perform source-name matching on every request. Filter public restaurant SELECT policies and the paginated catalogue RPC only; do not modify the transactional `restaurant_is_publicly_visible` helper.

Files:
- `src/test/admin-thefork-only-filter.test.ts`: focused contract test.
- `supabase/migrations/20260915200000_admin_thefork_only_catalog_filter.sql`: safe-positive feature flag seed, 440-source TheFork mapping, public RLS source gate and paginated catalogue gate.
- `src/components/admin/AdminTheForkVisibilityControl.tsx`: audited `The fork` button and state feedback.
- `src/components/admin/AdminMobileNavigation.tsx`: renders the control only on `/admin/restaurants`.

Order:
1. Define the contract test before the implementation.
2. Add indexed server-side TheFork membership and public display filtering.
3. Add the admin button using the existing audited feature-flag RPC.
4. Verify production mapping read-only, inspect diffs, run available CI/build checks, and document infrastructure blockers accurately.
5. Keep the PR open for review; do not merge.

Risks addressed:
- The public catalogue has a tight timeout budget, so membership is index-backed.
- Production has 436 direct source-linked rows but all 440 verified sources resolve; the mapping includes consolidated rows as well.
- The filter must not alter `restaurants.is_active`, `restaurants.status`, payment eligibility or server transaction guards.
- The feature flag uses positive semantics so the existing “activate all flags” admin action restores the full catalogue instead of accidentally enabling a restrictive mode.
- Public restaurant policies are permissive/ORed, so every broad production SELECT policy receives the same source gate while admin, owner and mapped-demo policies retain their intended access.

Rollback:
- Immediate operational rollback: set `public-restaurants-all-sources` back to `true`; normal public visibility returns without rewriting restaurant data.
- Code rollback: revert the feature commit and restore the prior public policies/catalogue RPC in a follow-up migration if required.
