# Security Best Practices Audit Report

Date: 2026-05-26
Repository: `C:\Users\Pc\cloud-rebuild-recovered`

## Executive Summary

This audit found one critical issue, two high-severity issues, six medium-severity issues, and several low-severity hardening items. The most urgent problem is a production-exposed `SECURITY DEFINER` payout invoice RPC that live database metadata shows is executable by `anon` and `authenticated` roles without an in-function authorization guard. That can let external callers mutate financial invoice state for arbitrary restaurants.

Positive findings: all 151 production `public` tables currently have RLS enabled, there are no production `public` views, checked edge functions mostly use the shared JWT/role helper, Stripe webhook signature verification is present, and committed `.env`/signing-secret hygiene is mostly correct.

## Scope And Evidence

Checked areas:

- React/Vite frontend XSS, navigation, storage, service worker, headers, and client-exposed configuration.
- Supabase Edge Functions auth, CORS, privileged clients, public tracking endpoints, Stripe/OpenAI/Firebase integrations.
- Production Supabase metadata via `supabase db query` and `supabase db advisors`.
- RLS/storage policies from production metadata and migrations.
- Mobile session storage and deep-link/notification navigation behavior.
- CI/deploy workflows, release readiness, `.gitignore`, tracked env/native config files.
- Dependency advisories via `npm audit --omit=dev --json` and `npm audit --json`.

Fresh command evidence:

- `npm audit --omit=dev --json`: 14 production vulnerabilities: 6 high, 8 moderate.
- `npm audit --json`: 33 total vulnerabilities: 13 high, 20 moderate.
- `npm run release:readiness`: failed against local production env because required production/mobile/edge secrets and app-link artifacts were not locally available.
- `supabase db advisors --type security`: 2 warning findings for mutable function search paths.
- Live production metadata query: 151 public tables, 0 with RLS disabled; 0 public views; 107 public `SECURITY DEFINER` functions; storage buckets and policies checked.
- `git ls-files .env .env.production .env.example android/app/google-services.json ios/debug.xcconfig android/keystore.properties android/keystore.properties.example`: `.env` and `.env.production` are not tracked; `.env.example`, `android/app/google-services.json`, `android/keystore.properties.example`, and `ios/debug.xcconfig` are tracked.

## Critical Findings

### CRIT-01: Publicly executable payout invoice RPC can mutate financial state

Location:

- `supabase/migrations/20260420120000_security_and_invoice_hardening.sql:35`
- `supabase/migrations/20260420120000_security_and_invoice_hardening.sql:57`
- `supabase/migrations/20260420120000_security_and_invoice_hardening.sql:97`
- `supabase/migrations/20260420120000_security_and_invoice_hardening.sql:123`
- `supabase/migrations/20260418113000_add_unambiguous_payout_invoice_rpc.sql:8`
- `supabase/migrations/20260418113000_add_unambiguous_payout_invoice_rpc.sql:20`
- `supabase/functions/generate-invoices/index.ts:39`
- `supabase/functions/generate-invoices/index.ts:63`

Evidence:

- `generate_restaurant_payout_invoice(p_restaurant_id uuid, p_month text)` is `SECURITY DEFINER` and performs no `auth.uid()`, role, admin, or restaurant ownership check before reading orders/reservations, inserting into `restaurant_invoices`, and updating `orders`/`reservations`.
- Live production metadata shows this function has `anon_execute=true` and `authenticated_execute=true`.
- `generate_restaurant_payout_invoice_rpc(p_restaurant_id uuid, p_month text)` wraps it directly and grants execute to `authenticated`.
- The Edge Function performs role and restaurant-access checks before calling the RPC, but the SQL functions themselves are exposed through PostgREST/RPC and can bypass those Edge checks.

Impact:

An unauthenticated or authenticated external caller with the Supabase anon key and a restaurant UUID can trigger payout invoice creation and mark paid orders/reservations as invoiced for restaurants they do not own, corrupting financial records.

Fix:

- Immediately `REVOKE EXECUTE` on both `generate_restaurant_payout_invoice(uuid, text)` and `generate_restaurant_payout_invoice_rpc(uuid, text)` from `PUBLIC`, `anon`, and `authenticated`.
- Grant only to `service_role`, or move the privileged function to a private schema not exposed by PostgREST.
- If direct authenticated RPC use is required, add in-function checks for `auth.uid()`, `auth.role()`, `public.auth_is_admin()`, and restaurant ownership before any reads/writes.
- Add a regression test that asserts anon and unrelated authenticated callers cannot execute the payout RPC.

Mitigation:

- Keep all payout generation behind `supabase/functions/generate-invoices/index.ts`, which already validates role at line 42 and restaurant access at lines 63-65.
- Audit existing `restaurant_invoices`, `orders.restaurant_invoice_id`, and `reservations.restaurant_invoice_id` for unexpected recent writes.

False positive notes:

- This is based on live production function privilege metadata, not only migration history.

## High Findings

### HIGH-01: Stored DOM XSS in Leaflet restaurant map popup

Location:

- `src/components/NearbyRestaurantsMap.tsx:107`
- `src/components/NearbyRestaurantsMap.tsx:110`
- `src/components/NearbyRestaurantsMap.tsx:116`
- `src/components/NearbyRestaurantsMap.tsx:132`
- `src/pages/Index.tsx:150`
- `src/pages/Index.tsx:152`
- `src/pages/dashboard/DashboardRestaurant.tsx:193`
- `src/pages/dashboard/DashboardRestaurant.tsx:202`

Evidence:

- `NearbyRestaurantsMap` builds a raw HTML template with `r.image_url`, `r.name`, and `r.cuisine_type` embedded directly into attributes and text nodes, then passes the string to `Leaflet.bindPopup`.
- The homepage fetches these fields from active `restaurants`.
- The restaurant dashboard saves owner-controlled restaurant form data back to `restaurants`.

Impact:

A restaurant owner, compromised owner account, or malicious seeded/imported restaurant row can inject HTML/attribute payloads into a public map popup. Because web sessions use localStorage on the web, XSS can lead to account/session compromise.

Fix:

- Replace raw popup HTML strings with safely created DOM nodes and `textContent`, or render a React component into a detached element.
- Validate and sanitize `image_url` to allow only `https:` and same-origin/public asset paths.
- Add tests for names/cuisine/image URLs containing quotes, tags, and event-handler payloads.

Mitigation:

- Add a strict CSP with no `unsafe-inline` and consider Trusted Types to reduce impact while the sink is removed.

### HIGH-02: Public sponsored-event endpoint can forge billable campaign metrics

Location:

- `supabase/functions/track-sponsored-event/index.ts:65`
- `supabase/functions/track-sponsored-event/index.ts:97`
- `supabase/functions/track-sponsored-event/index.ts:115`
- `supabase/functions/track-sponsored-event/index.ts:125`
- `supabase/functions/track-sponsored-event/index.ts:193`
- `supabase/functions/track-sponsored-event/index.ts:215`

Evidence:

- `maybeResolveUserId` treats Authorization as optional and returns `null` when absent.
- The handler accepts public POST payloads, only requires campaign ID and a caller-provided `viewerId`, creates an admin client, then records the event through `record_ad_campaign_event`.
- The dedupe key includes caller-controlled fields such as `viewerId`, `source`, `page`, and optional `eventId`.

Impact:

An external caller can forge impressions, clicks, or conversions for active campaigns, corrupting analytics and potentially consuming ad budgets or triggering incorrect billing.

Fix:

- Require a signed event token generated server-side for sponsored placements, or require an authenticated session for billable events.
- For conversions, tie the event to a server-verified order/reservation/checkout ID and user.
- Apply `rate_limit_consume` by IP, campaign, viewer, and event type before any billable write.
- Keep `record_ad_campaign_event` service-role only.

Mitigation:

- Monitor `ad_campaign_events` for abnormal viewer/IP/event-rate patterns and pause billing on suspect campaigns until server-side event authenticity exists.

## Medium Findings

### MED-01: Public storage buckets allow broad authenticated uploads and invoice-logo deletion

Location:

- `supabase/migrations/20260309020210_e9cb423e-4bce-474e-b664-6e7f10cd51d1.sql:57`
- `supabase/migrations/20260309020210_e9cb423e-4bce-474e-b664-6e7f10cd51d1.sql:61`
- `supabase/migrations/20260308210913_25c0e614-6971-4ff7-8bd9-fefe6d3027a7.sql:41`
- `supabase/migrations/20260308210913_25c0e614-6971-4ff7-8bd9-fefe6d3027a7.sql:43`
- `supabase/migrations/20260308210913_25c0e614-6971-4ff7-8bd9-fefe6d3027a7.sql:51`
- `supabase/migrations/20260418113419_restrict_public_bucket_listing.sql:11`
- `src/components/ImageUpload.tsx:23`
- `src/components/ImageUpload.tsx:24`
- `src/components/ImageUpload.tsx:25`

Evidence:

- Live metadata confirms `images` and `invoice-logos` are public buckets with no `file_size_limit` and no `allowed_mime_types`.
- `images` still allows any authenticated role to upload to the bucket.
- `invoice-logos` allows any authenticated role to upload and delete in that bucket.
- The later listing restriction removed public listing, but did not tighten insert/delete ownership.
- `ImageUpload` uploads root-level random filenames, which do not match the folder-based ownership checks used for update/delete in `images`.

Impact:

Any authenticated account can abuse public storage for arbitrary public hosting, storage/cost exhaustion, or deletion of invoice logos. Lack of MIME/size controls increases the chance of active content or oversized files being served from trusted domains.

Fix:

- Add bucket-level MIME allowlists and size limits.
- Require object paths to start with an owner or restaurant ID folder.
- Tighten `invoice-logos` insert/delete policies to restaurant ownership or admin only.
- Update `ImageUpload` to write under `auth.uid()` or restaurant ID folders with cryptographically random filenames.

### MED-02: Checkout return URL is not allowlisted

Location:

- `supabase/functions/create-checkout/index.ts:37`
- `supabase/functions/create-checkout/index.ts:41`
- `supabase/functions/create-checkout/index.ts:46`
- `supabase/functions/create-checkout/index.ts:564`
- `supabase/functions/create-checkout/index.ts:572`
- `supabase/functions/create-checkout/index.ts:573`

Evidence:

- The function authenticates the request but accepts `return_url` from JSON and only checks presence.
- The raw value is concatenated into Stripe `success_url` and `cancel_url`.
- `stripe-connect-onboard` already has a return-host allowlist pattern; this checkout function does not.

Impact:

Authenticated attackers can create Stripe Checkout sessions that redirect customers to attacker-controlled sites after success/cancel. This is useful for phishing and confusing payment-state flows.

Fix:

- Add a shared `validateReturnUrl` helper that enforces `https:` and exact allowed production hosts, with localhost only in development.
- Prefer server-side fixed route mapping by `checkout_kind` instead of accepting arbitrary URLs.

### MED-03: Missing production security headers in visible deployment config

Location:

- `vercel.json:1`
- `vercel.json:2`
- `vercel.json:8`
- `index.html:3`
- `index.html:47`
- `index.html:50`

Evidence:

- `vercel.json` contains rewrites only; no `headers` block is visible.
- `index.html` has no CSP meta fallback.
- Repository search did not find app-delivered `Content-Security-Policy`, `X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`, or `Permissions-Policy`.

Impact:

XSS findings have a larger blast radius, authenticated pages can be framed unless blocked elsewhere, MIME sniffing/referrer leakage defenses are not visible, and browser policy is dependent on external infrastructure not represented in the repo.

Fix:

- Configure Vercel headers for CSP, `X-Content-Type-Options: nosniff`, `Referrer-Policy`, `Permissions-Policy`, and `frame-ancestors`/`X-Frame-Options`.
- Tune CSP to current assets: Supabase, Stripe, Firebase, Sentry, OpenAI/Lovable endpoints, maps/images, and self-hosted/static assets.

False positive notes:

- Headers may be set outside this repository. Verify runtime response headers for production domains.

### MED-04: Public analytics endpoint permits unauthenticated service-role writes

Location:

- `supabase/functions/track-analytics/index.ts:85`
- `supabase/functions/track-analytics/index.ts:87`
- `supabase/functions/track-analytics/index.ts:106`
- `supabase/functions/track-analytics/index.ts:129`
- `supabase/functions/track-analytics/index.ts:155`
- `supabase/functions/track-analytics/index.ts:181`

Evidence:

- The endpoint accepts public POSTs, creates an admin client, optionally resolves a user, and writes to `event_store`, `search_logs`, `impressions`, and `clicks`.
- No `rate_limit_consume` or caller authenticity check is applied.

Impact:

Attackers can spam analytics tables, inflate metrics, increase storage costs, and poison downstream recommendations or reporting.

Fix:

- Add rate limits per IP/session/entity/event.
- Require signed telemetry tokens for sensitive event types.
- Restrict free-form `event` entity types and names to allowlisted values.
- Consider inserting as anon/authenticated through RLS for non-privileged telemetry instead of service-role writes.

### MED-05: Reservation fee computation RPC leaks cross-restaurant financial totals to any authenticated user

Location:

- `supabase/migrations/20260422170000_split_reservation_fee_invoice_link.sql:51`
- `supabase/migrations/20260422170000_split_reservation_fee_invoice_link.sql:65`
- `supabase/migrations/20260422170000_split_reservation_fee_invoice_link.sql:68`
- `supabase/migrations/20260422170000_split_reservation_fee_invoice_link.sql:76`
- `supabase/migrations/20260422170000_split_reservation_fee_invoice_link.sql:78`

Evidence:

- `compute_restaurant_reservation_fees` is `SECURITY DEFINER`, reads `public.reservations`, and returns counts/fee totals for any supplied restaurant and date range.
- It revokes `PUBLIC`/`anon` but grants execute to `authenticated`.
- No in-function restaurant ownership or admin check is present.

Impact:

Any logged-in user can query fee-sensitive reservation totals for restaurants they do not own.

Fix:

- Restrict execute to `service_role`, or add an in-function check for admin or restaurant ownership.
- Add an RPC test for unrelated authenticated users.

### MED-06: Production dependency advisories are unresolved

Location:

- `package.json:84`
- `package.json:95`
- `package.json:96`
- `package.json:102`
- `package.json:136`
- `package.json:142`

Evidence:

- `npm audit --omit=dev --json` reports 14 production vulnerabilities: 6 high, 8 moderate.
- Direct production packages involved include `firebase` high severity, plus moderate `@supabase/supabase-js`, `openai`, and `express`.
- Full audit reports 33 total vulnerabilities, including dev-chain issues through `vite` and `puppeteer`.
- `express` appears in dependencies but no Express server source import was found in the application source.

Impact:

Known vulnerable transitive packages remain in the production dependency graph. Some may be low exploitability in this app, but Firebase/protobuf and websocket stacks should be updated or removed if unused.

Fix:

- Remove unused `express` if no server uses it.
- Upgrade Firebase/OpenAI/Supabase/Vite/Puppeteer chains once compatible fixed versions are available.
- Add dependency audit triage to CI with documented exceptions for unreachable dev-only findings.

## Low Findings And Hardening Items

### LOW-01: Web auth sessions are stored in localStorage

Location:

- `src/integrations/supabase/authStorage.ts:21`
- `src/integrations/supabase/authStorage.ts:23`
- `src/integrations/supabase/authStorage.ts:26`
- `src/integrations/supabase/authStorage.ts:33`
- `src/integrations/supabase/authStorage.ts:47`
- `src/integrations/supabase/authStorage.ts:65`

Evidence:

- Web storage uses `localStorage` for Supabase sessions.
- Native storage uses secure storage and migrates legacy localStorage into secure storage, which is good.

Impact:

Any XSS can read persisted web sessions. This raises the impact of the map popup XSS.

Fix:

- Remove XSS sinks first.
- Consider a BFF/cookie session model for the web app if the threat model requires stronger token protection.
- Deploy CSP/Trusted Types.

### LOW-02: Service worker imports remote Firebase scripts at runtime

Location:

- `public/firebase-messaging-sw.js:3`
- `public/firebase-messaging-sw.js:58`
- `public/firebase-messaging-sw.js:59`
- `public/firebase-messaging-sw.js:75`
- `src/lib/push.ts:102`
- `src/lib/push.ts:107`

Evidence:

- The service worker runs `importScripts` from `www.gstatic.com` at runtime.
- Service workers execute with powerful origin-scoped capabilities.

Impact:

Runtime third-party script compromise or supply-chain error in the service worker path has high origin impact. The notification target URL normalization is good, but script provenance is still a hardening gap.

Fix:

- Bundle/self-host Firebase service worker dependencies where feasible.
- Constrain `worker-src`/`script-src` via CSP once headers are added.
- Validate the `INIT_FIREBASE` message shape and source client defensively.

### LOW-03: Dashboard social URLs are stored and rendered without URL scheme validation

Location:

- `src/pages/dashboard/DashboardReseauxSociaux.tsx:110`
- `src/pages/dashboard/DashboardReseauxSociaux.tsx:113`
- `src/pages/dashboard/DashboardReseauxSociaux.tsx:120`
- `src/pages/dashboard/DashboardReseauxSociaux.tsx:255`
- `src/pages/dashboard/DashboardReseauxSociaux.tsx:307`

Evidence:

- Social links are saved from text inputs into restaurant `opening_hours` JSON.
- `SocialLink` renders the value directly as an anchor `href`.

Impact:

Current use appears dashboard-scoped, but arbitrary schemes can create self-XSS/phishing and become higher impact if reused on public restaurant pages.

Fix:

- Normalize social URLs to `https:` only, enforce expected hostnames for Instagram/Facebook/TikTok, and reject `javascript:`/`data:`/non-http schemes.

### LOW-04: Supabase advisor reports two function search-path warnings

Location:

- `supabase/migrations/20260426000000_refund_columns_and_lock_lift.sql:61`
- `supabase/migrations/20260426000000_refund_columns_and_lock_lift.sql:69`
- `supabase/migrations/20260426000000_refund_columns_and_lock_lift.sql:92`
- `supabase/migrations/20260426000000_refund_columns_and_lock_lift.sql:99`

Evidence:

- `supabase db advisors --type security` reports mutable search path for:
  - `public.is_special_paid_reservation_locked`
  - `public.is_special_paid_order_locked`
- The latest migration recreates both functions without `SET search_path = public`.

Impact:

This is a standard hardening issue. These functions call other public functions and are used in status/refund guards, so deterministic function resolution is preferable.

Fix:

- Add `SET search_path = public` to both function definitions, or `ALTER FUNCTION ... SET search_path = public`.

### LOW-05: Print dialog uses `document.write` and `outerHTML`

Location:

- `src/components/invoices/TokPayableInvoiceDialog.tsx:110`
- `src/components/invoices/TokPayableInvoiceDialog.tsx:113`
- `src/components/invoices/TokPayableInvoiceDialog.tsx:219`

Evidence:

- The print helper opens a new window and writes an HTML document containing `printDocumentRef.current.outerHTML`.
- The title is escaped before insertion, and the content appears React-rendered, so this is lower risk than the map popup.

Impact:

If untrusted invoice content ever reaches this path as raw HTML or unsafe attributes, the print window becomes another DOM XSS sink.

Fix:

- Prefer constructing the print document with DOM APIs or rendering a sanitized React print component rather than `document.write`.

### LOW-06: Local production readiness is incomplete

Location:

- `scripts/release-readiness.mjs:24`
- `scripts/release-readiness.mjs:34`
- `scripts/release-readiness.mjs:61`

Evidence:

- `npm run release:readiness` failed locally because live Stripe/Firebase/email/cron/app URL secrets, mobile app-link files, and Android release keystore config are not present in the local production env.

Impact:

This may be expected if secrets are only in CI/Vercel/Supabase, but a release can be built from an incomplete local environment unless CI enforces this check.

Fix:

- Ensure CI runs `npm run release:readiness` with production-secret presence checks before release.
- Add the app-link artifacts before mobile release.

## Verified Strengths

- Production metadata reports RLS enabled on all 151 public tables.
- Production metadata reports zero public views, avoiding the Supabase view/RLS bypass class.
- Public `SECURITY DEFINER` functions all have `search_path` set, based on live metadata; the two advisor warnings are non-security-definer helper functions recreated later without search path.
- Shared Edge auth helper validates JWTs via `auth.getUser`, supports scheduler secrets only when explicitly allowed, and writes audit logs.
- Edge CORS helper only reflects allowed origins and does not send `Access-Control-Allow-Origin` for disallowed origins.
- Stripe webhook signature verification is implemented.
- `create-checkout` uses server-authoritative order pricing for order flows.
- Native auth storage uses secure storage with `whenUnlockedThisDeviceOnly` and migrates legacy localStorage.
- Deep-link/notification navigation normalizes targets to same-origin/internal paths.
- `.env` and `.env.production` are ignored and not tracked; Android signing artifacts are ignored.

## Recommended Fix Order

1. Revoke or guard `generate_restaurant_payout_invoice` and `generate_restaurant_payout_invoice_rpc`, then audit financial rows for unexpected invoice linkage.
2. Remove the Leaflet popup HTML string sink and add CSP/security headers.
3. Protect sponsored-event and analytics endpoints with authentication/signed telemetry/rate limits.
4. Tighten storage bucket policies, MIME/size limits, and client upload paths.
5. Add checkout return URL allowlisting.
6. Guard `compute_restaurant_reservation_fees`.
7. Triage dependency upgrades/removals.
8. Apply lower-severity hardening: function search paths, service worker script provenance, social URL validation, print sink cleanup.

