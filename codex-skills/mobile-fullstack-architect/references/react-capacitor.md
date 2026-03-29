# React + Capacitor Review

Use this for React/Vite apps packaged with Capacitor.

## Frontend review points

- Check whether routing, auth guards, and feature gates are only cosmetic or backed by server authorization.
- Verify state ownership: query cache, local component state, local storage, and context providers should have clear boundaries.
- Inspect forms and mutations for validation symmetry: client validation is useful, but privileged checks must also exist server-side.
- Review error boundaries, loading states, retries, and stale-cache behavior on weak mobile networks.
- Identify oversized route entrypoints, eager imports, and global providers that force expensive startup work.

## Mobile/native review points

- Confirm native-only initialization is guarded correctly and does not break web.
- Inspect deep-link handling for route validation and privilege escalation risk.
- Review push setup, token registration, notification click handling, and background assumptions.
- Check storage of session tokens or user identifiers in browser storage versus native-secure storage.
- Review app start flow for races between auth restore, native plugin init, deep links, and route rendering.

## Common failure patterns

- routing checks without backend enforcement
- native listeners registered multiple times
- deep links navigating to sensitive screens before auth state settles
- feature flags flickering from disabled to enabled during bootstrap
- local cart or order state diverging from server-authoritative pricing
- service worker or Firebase setup behaving differently between web and native
