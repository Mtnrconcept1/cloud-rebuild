# Repo Mapping

Build the map before judging the code.

## What to identify first

- Runtime surfaces: web app, native wrappers, admin app, courier app, dashboards, edge functions, cron-like jobs, webhooks.
- Core entrypoints: app root, router, auth provider, data client, feature flag loader, native init, service worker.
- Data authority: database tables, views, RPC functions, migrations, storage buckets, RLS policies, privileged server functions.
- External dependencies: payments, notifications, maps, email, scraping, analytics, search, file upload.

## Evidence sources

- `package.json`, native manifests, build config, Vite config, Capacitor config
- app entrypoints and route files
- auth/session code and permission checks
- database migrations and generated types
- edge functions and shared server helpers
- tests that reveal intended behavior

## Review method

1. Name the major user roles and system actors.
2. List the highest-risk workflows per role.
3. Follow each workflow through UI, client logic, network boundary, server or SQL logic, and side effects.
4. Note where authority actually lives.
5. Flag mismatches between UI restrictions and server-side enforcement.

## Common missing pieces

- no single source of truth for permissions
- feature flags enforced only in UI
- frontend performing sensitive business decisions
- migrations added quickly without cleanup or invariant tests
- edge functions missing idempotency or request authentication
- dashboards with wide data access patterns but weak scoping
- native notification or deep-link flows without route validation
