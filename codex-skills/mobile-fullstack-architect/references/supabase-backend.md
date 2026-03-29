# Supabase Backend Review

Use this for Supabase-backed systems with SQL migrations, RLS, and edge functions.

## Review the authority model

- Determine which operations are allowed directly from the client with anon or authenticated keys.
- Map which business actions rely on RLS, RPC functions, or edge functions.
- Verify that privileged operations happen in trusted server contexts, not only in the browser.

## Database and migration checks

- Read migrations in chronological order around the relevant feature, not just the latest file.
- Verify indexes, constraints, foreign keys, uniqueness, and invariant-preserving checks for high-value flows.
- Look for duplicate or corrective migrations that suggest churn or unstable data contracts.
- Check whether security fixes were layered on after broad grants or permissive policies.

## RLS checks

- Prefer deny-by-default posture.
- Verify `USING` and `WITH CHECK` both match the intended actor.
- Check whether service-role edge functions are narrowly scoped and validate caller identity before acting.
- Inspect for public tables or functions that expose cross-tenant or admin data.

## Edge function checks

- Verify request authentication, role checks, and input validation.
- Check idempotency for payments, dispatch, notifications, and webhooks.
- Ensure secret use stays server-side.
- Review error handling and whether failures can leave partially-applied side effects.

## Common failure patterns

- client creates trusted records directly
- RPC assumes caller honesty about ownership or price
- edge functions trust headers without verifying JWTs
- webhook handlers are replayable
- corrective migrations hide earlier authorization mistakes instead of simplifying policy design
