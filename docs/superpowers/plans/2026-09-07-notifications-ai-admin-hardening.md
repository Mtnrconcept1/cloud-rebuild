# TOK notifications, AI and admin hardening plan

**Risk level:** 3 — critical (Supabase queueing/cron, Edge Functions, AI cost/security, admin feature flags).

**Base:** `main` at `445f0943fe93cd59ef3e9058552567ab0129da41`.

## Verified findings

- No Supabase cron invokes `dispatch_due_notification_campaigns`; scheduled campaigns depend on an admin action.
- `send-push` and notification e-mail delivery select queued rows without an atomic lease/claim and terminally mark transient failures; `notification_deliveries.attempts` stays at 0 in production.
- Production currently has no enabled device token. Push activation exists for clients (`/profil`) and couriers, but not for restaurant/admin workspaces. RLS already permits every authenticated user to manage their own tokens.
- `queue_notification_deliveries` lets a stored category preference suppress `transactional`; TOK help copy already documents that important transactional notifications may remain required.
- `_shared/ai-security.ts` is not wired into the common OpenAI request path.
- Five major restaurant/admin AI consumers call `check_restaurant_ai_quota`, but the quota RPC does not check `feature_flags`, so their UI flags are not server kill switches.
- Four runtime flags used by `App.tsx` are missing from the frontend feature catalogue: `customer-memory`, `dashboard-campaign-studio`, `admin-support-resolution`, `admin-guardian`.
- Feature-flag fetch failure immediately returns an all-disabled fallback without bounded retry, warning, or last-known-good fallback.
- The three reported admin pages are routable and present in the floating admin navigation, so they are not inaccessible. They are absent from the main desktop tool cards; improve discoverability rather than treating this as an authorization bug.
- Current OpenAI catalogue uses `gpt-5.6-luna`, `gpt-5.6-terra`, `gpt-5.6-sol`; TOK defaults still reference older `gpt-5.4-mini`/`gpt-5.5` identifiers. Environment overrides must remain authoritative.
- Vercel production shows no runtime errors in the last 7 days. The team is on Hobby; frequent notification scheduling should reuse Supabase `pg_cron`, not add a Vercel cron.

## Decisions resolved conservatively

1. **Scheduler:** add a Supabase database cron for due campaign dispatch; reuse existing `pg_cron` infrastructure.
2. **Transactional category:** cannot be disabled at the server category gate; channel preferences remain respected.
3. **AI models:** default economy to `gpt-5.6-luna`, strategic/default to `gpt-5.6-terra`; retain all environment overrides.
4. **AI spend:** do not invent a new CHF budget. Enforce existing restaurant quotas/credits and make feature flags real server kill switches. Existing rate limits remain the platform brake.

## Lot 0 — invariant tests (RED first)

Create `src/test/notifications-ai-admin-hardening.test.ts` asserting:
- notification delivery claim/lease/retry schema and worker wiring;
- due-campaign cron and atomic campaign claim;
- transactional category lock;
- role-agnostic push settings surface;
- common AI security enforcement and current model defaults;
- `check_restaurant_ai_quota` feature-flag enforcement;
- the four missing feature catalogue entries;
- bounded feature-flag retry + last-known-good fallback + warning;
- desktop admin cards for Resolution IA, Guardian and TOK Connect.

Expected result before implementation: failing tests.

## Lot 1 — notification reliability

Add a new migration only (no historical edits):
- delivery columns `next_attempt_at`, `max_attempts`, `lease_token`, `lease_expires_at`;
- `claim_notification_deliveries(...)` with `FOR UPDATE SKIP LOCKED` and lease token;
- `settle_notification_delivery(...)` with bounded exponential retry and terminal failure after max attempts;
- harden scheduled campaign dispatch with an atomic claim/status transition;
- schedule `tok-dispatch-due-notification-campaigns` every minute with `pg_cron`;
- keep unique `(notification_id, channel)` idempotence;
- make `transactional` bypass only the category opt-out gate.

Update `send-push` and notification-delivery section of `send-email` to claim then settle by lease token. Keep legacy `email_queue` behavior out of scope.

## Lot 2 — push activation

Add a shared `PushNotificationSettings` component that:
- reads the current user's enabled token state;
- activates/deactivates via `push-unified`;
- is safe on web and native;
- is exposed from role-agnostic `/parametres/securite` so client, restaurateur, courier, commercial and admin accounts have a common activation surface.

Do not auto-request OS permission on login.

## Lot 3 — AI server governance

- Wire `ai-security.ts` into `createOpenAIResponse`: inspect user-role inputs, reject high-confidence injection/tool-abuse attempts, prepend the TOK security system instruction to normal requests.
- Add regression tests for benign and blocked inputs.
- Update current model defaults while preserving env overrides.
- New migration changes `check_restaurant_ai_quota` so disabled feature flags return `allowed=false, reason=feature_disabled` before any provider call.
- Verify functions outside that RPC that already have explicit server guards; add a shared explicit guard only where a costly current production function has neither quota nor guard.

## Lot 4 — admin/runtime feature flags

- Add the four missing feature definitions and route metadata.
- Add bounded fetch retry with short backoff.
- On exhausted transient failure, reuse a valid last-known-good cache even if its TTL elapsed; if no prior good snapshot exists, keep the current fail-closed all-disabled fallback.
- Log a warning without secrets/row contents.
- Add the three intelligence tools to `AdminHome` main cards; keep existing route/role/flag gates unchanged.

## Verification / rollback

Required before completion:
- changed tests;
- full production-mode Vitest suite;
- lint;
- typecheck;
- production build;
- generated error-code map refreshed if `HttpError` sites change;
- migration syntax/contract verification and Supabase security/performance advisors;
- Vercel preview/build/runtime verification when a preview exists;
- GitHub CodeQL/checks.

No production migration, Edge deployment, Vercel production deployment, or merge is performed directly from this branch. Rollback is PR revert; schema changes are additive and worker code remains compatible with terminal `failed/skipped/sent` states.