# TOK Application Skill File

This document is the canonical project-context skill for agents working on the TOK / TheTok application. It should be read before modifying the product, writing migrations, touching workflows, changing Supabase functions, or adding features. Its purpose is to make future work faster, safer, and more coherent.

## 1. Product identity

TOK is a Swiss restaurant, delivery, reservation, loyalty and restaurant-operations platform. The public brand is generally presented as TOK or TheTok, with the public domain `www.thetok.ch`. The admin interface is separated on `admin.thetok.ch`. The current production frontend target used in the deployment workflow is `https://cloud-rebuild-recovered.vercel.app/`.

The product is designed for the Swiss/French-speaking market, with Geneva as a strong anchor. The tone of the app should remain clear, premium, energetic, and restaurant-friendly. The commercial positioning is restaurateur-first: lower costs, more direct value for restaurants, smoother experience for customers, and operational tools for restaurants.

The product combines four major experiences:

1. Client app: discovery, search, restaurant detail pages, basket, checkout, order tracking, reservations, subscriptions, gifts/points, social feed, anti-waste, flash sales and profile.
2. Restaurant dashboard: restaurant profile, menu, reservations, orders, offers, flash sales, subscriptions/formulas, campaigns, recommendations, performance, reviews, invoices, photos, support, service management, social posts, news and floor plan.
3. Courier app: courier home, jobs, earnings and profile.
4. Admin back-office: platform supervision, restaurants, users, reviews, catalog, loyalty, drops, notifications, audit logs, platform configuration, launch packs, accounting, orders/reservations and news.

## 2. Technical stack

The frontend is a React/Vite/TypeScript application. It uses React Router, TanStack Query, Tailwind, Radix/shadcn-style components, Sonner/toasts, Framer Motion, Leaflet, Recharts, React Hook Form, Zod and related UI libraries. The backend is Supabase with PostgreSQL, RLS, migrations, Edge Functions, storage buckets and auth. Stripe is used for payments, checkout, subscriptions, webhooks and Stripe Connect flows. Capacitor is present for iOS/Android packaging, deep links and native push integrations. Firebase is present for messaging/push-related integration.

The package manager for CI/deploy is pnpm. The project declares `pnpm@10.28.1`. Use pnpm for workflow and CI commands. Do not reintroduce `npm ci` into GitHub Actions while the project is configured for pnpm. Node 22 is the intended runtime for CI/deploy.

Useful scripts:

- `pnpm run dev` or `pnpm dev`: local Vite development.
- `pnpm run build:dev`: development build.
- `pnpm run build:prod`: production build.
- `pnpm run test`: Vitest test suite.
- `pnpm run test:prod`: Vitest in production mode.
- `pnpm run lint`: full lint.
- `pnpm run lint:release`: release-critical lint.
- `pnpm run supabase:target:prod`: align local Supabase target to production.
- `pnpm run supabase:doctor:prod`: verify production Supabase targeting/configuration.
- `pnpm run supabase:db:push:prod`: push database migrations to production via project wrappers.

## 3. Repository map

Important directories:

- `src/pages`: top-level client, dashboard, courier and admin pages.
- `src/components`: reusable UI, app widgets, dashboards, cards, maps and dialogs.
- `src/lib`: application services, auth, feature flags, cart, platform helpers, integrations and realtime helpers.
- `src/hooks`: React hooks, Supabase query hooks, realtime hooks and business flows.
- `src/integrations/supabase`: Supabase client and generated/typed database interfaces.
- `supabase/migrations`: database schema, RLS policies, triggers, functions and seed/config migrations.
- `supabase/functions`: Deno Edge Functions for checkout, webhooks, dispatch, emails, analytics, campaigns, subscriptions, refunds, courier, restaurant advisor, floor plan AI and more.
- `scripts`: operational scripts for production env generation, Supabase target selection, DB push wrappers, readiness checks and mobile helpers.
- `.github/workflows`: CI and production deploy workflows.
- `docs`: project documentation, operational notes and agent/context docs.

## 4. Application shell and routing model

The app is mounted through `src/App.tsx`. It wraps the application with:

- `ErrorBoundary`
- `QueryClientProvider`
- `AuthProvider`
- `CartProvider`
- `TooltipProvider`
- `BrowserRouter`
- `Navbar`
- mobile logo intro
- native deep-link and push-notification hooks when running inside Capacitor

Routes are feature-gated through a `FeatureSwitch` component. Feature flags are loaded with `useFeatureFlagSnapshot()`. When a feature is disabled, the user is redirected to a fallback route. Protected pages use `ProtectedRoute` and dashboard pages use dashboard-specific routing/guards.

Important route groups:

Client/public routes:

- `/`: homepage.
- `/auth`: authentication.
- `/recherche`: search and restaurant discovery.
- `/restaurant/:id`: restaurant detail.
- `/anti-gaspi`: anti-waste offers.
- `/panier`: basket/cart.
- `/commandes`: client orders.
- `/commande/confirmation`: order confirmation.
- `/commande/:id`: order tracking.
- `/reservations`: client reservations.
- `/profil`: profile.
- `/notifications`: notifications.
- `/contact`, `/cgu`, privacy/legal/about/help pages.

Feature/marketing routes:

- `/creneaux-garantis`
- `/flex-prix-bas`
- `/match-groupes`
- `/multi-stop`
- `/multi-restaurant`
- `/chefs-table`
- `/zero-attente`
- `/garantie-qualite`
- `/budget-auto`
- `/abonnement`
- `/points-cadeau`
- `/ventes-flash`
- `/actualites`
- `/tok-one`

Restaurant dashboard routes include dashboard home, restaurant profile, menu, reservations, orders, offers, flash sales, formulas, campaigns, recommendations, performance, comparison, reviews, promotions, campaign overview, social networks, news, invoices, photos, support, service management, floor plan, advisor and pack management.

Courier routes include courier home, jobs, earnings and profile.

Admin routes include restaurants, users, reviews, catalog, loyalty, drops, notifications, audit logs, platform config, launch packs, accounting, orders/reservations and news.

## 5. Roles and permissions

Primary roles:

- `client`: end user/customer.
- `restaurateur`: restaurant operator/dashboard user.
- `courier`: delivery person.
- `admin`: platform administrator.

The auth layer stores user, session, loading state, active role, available roles, super-admin status and role-switching ability. When editing auth flows, preserve the ability to clear invalid local sessions. Broken Supabase refresh tokens must not keep `loading=true` forever. The provider should clean local state and call local sign-out where appropriate.

RLS is central. Never bypass RLS from frontend code. Edge Functions that require elevated privileges must use service-role clients on the server side only. Do not expose service keys to the browser.

## 6. Feature flags

Feature flags are used heavily. Do not hardcode a feature as always-on unless it is explicitly core infrastructure. Many pages and dashboard modules are gated by flags, including orders, anti-waste, flash sales, social news, reservations, subscriptions, Tok One, gift points, dashboard sections, courier modules and admin modules.

When adding a new feature:

1. Add/seed the flag in Supabase migrations if needed.
2. Read it through the existing feature flag service.
3. Gate the route or UI entry point.
4. Keep disabled behavior graceful.
5. Avoid shipping admin-only toggles that users can access directly without role checks.

## 7. Client app functionality

The client app should support:

- Restaurant discovery/search with categories, location context, filters and restaurant cards.
- Restaurant detail pages with menu, offers, restaurant information, reservation/order CTAs and media.
- Cart/basket logic with item selection, restaurant grouping, quantities, pricing, discounts and conflict handling.
- Checkout flow through Supabase Edge Functions and Stripe.
- Order confirmation and tracking with support for standard, restaurant-managed and grouped/subscription/multi-restaurant orders.
- Reservation flows including normal reservations, Zero Attente and Chefs Table style reservations.
- Anti-waste offers, flash sales and promotional offers.
- Subscription/Tok One flows.
- Gift/points/loyalty features.
- Profile, notification and account flows.
- Social feed and restaurant social posts: posts, media, likes/reactions, comments, replies, saves, shares, reposts, feedback and reporting where enabled.

Order tracking must tolerate different fulfillment models: platform dispatch, restaurant delivery, pickup, grouped subscription deliveries and missing realtime data. Tests around `SuiviCommande` should assert stable UI outputs, not fragile whitespace-split text.

## 8. Restaurant dashboard functionality

The restaurant dashboard is the operational center for restaurateurs. It includes:

- Dashboard overview/home.
- Restaurant information and profile editing.
- Menu management.
- Reservation management.
- Order management and order status updates.
- Offers and promotions.
- Flash sales.
- Formulas/subscriptions/packs.
- Campaign generation and campaign portal flows.
- Recommendations/advisor modules.
- Performance analytics and comparison views.
- Review management.
- Social/network publishing tools.
- News/actualities management.
- Invoices, inflow/outflow and invoice settings.
- Photo/media management.
- Support tools.
- Service shifts and operational configuration.
- Floor plan management with tables, seating, reservations and AI-assisted layout capabilities.

When working on dashboard modules, preserve restaurateur role checks and restaurant ownership checks. If a module loads restaurant-specific data, it must not trust client state alone; the backend/RLS must enforce ownership.

## 9. Courier functionality

Courier modules are separated under `src/pages/courier`. The courier experience includes:

- Courier home.
- Available/assigned jobs.
- Earnings.
- Courier profile.
- Dispatch and delivery tracking flows via Edge Functions and realtime updates.

Courier features should remain gated by courier role and feature flags. Avoid exposing restaurant/admin data to couriers unless explicitly required by the job assignment.

## 10. Admin functionality

The admin area is for platform control. Modules include:

- Platform home.
- Restaurant management.
- User management.
- Review/moderation tools.
- Catalog management.
- Loyalty management.
- Drops management.
- Notifications.
- Audit logs.
- Platform configuration and feature flags.
- Launch packs.
- Accounting/compta inflow/outflow.
- Orders and reservations supervision.
- Actualities/news management.

Admin pages must be protected by admin role and, when relevant, super-admin constraints. Never rely only on hidden UI for admin security.

## 11. Supabase and database principles

Supabase is the central backend. The app uses:

- PostgreSQL tables.
- RLS policies.
- SQL functions/RPCs.
- triggers for counters/status updates.
- realtime channels.
- storage buckets for media.
- Edge Functions for privileged workflows.

Important database domains include restaurants, menus, orders, reservations, profiles, roles, feature flags, social posts/media/likes/comments/reposts/shares/reports, invoices, campaigns, floor plans, courier/dispatch objects, subscriptions and loyalty.

When writing migrations:

- Make them idempotent when possible: `CREATE TABLE IF NOT EXISTS`, `ADD COLUMN IF NOT EXISTS`, `DROP POLICY IF EXISTS` before `CREATE POLICY`.
- Never edit old migrations that may already be applied in production unless explicitly doing a local-only cleanup. Add a new migration instead.
- Be careful with RLS policies that query the same table they are applied to. This can cause PostgreSQL error `42P17` infinite recursion. If parent/child validation is needed, prefer constraints, triggers with `SECURITY DEFINER`, or helper functions designed to avoid RLS recursion.
- Use ownership helper functions consistently where available, such as restaurant ownership and admin checks.
- After migrations, run the production doctor/target checks before pushing DB changes.

## 12. Social feed notes

Social features include posts, media, likes/reactions, comments, comment threads, comment reactions, restaurant follows, reposts, external shares, reports, saves, feedback, events and daily metrics.

Known sensitive area: `social_post_comments` RLS. A previous insert policy checked `parent_comment_id` by querying `social_post_comments` from inside the `social_post_comments` policy, causing infinite recursion. A later migration replaces that recursive insert policy. Do not reintroduce self-referential RLS queries on this table.

If the browser reports:

- `No API key found in request`: frontend environment variables are missing in the deployed build.
- `42P17 infinite recursion detected in policy for relation social_post_comments`: a recursive RLS policy exists in production and needs a migration.
- `500` from `/rest/v1/...`: inspect the JSON response in DevTools Network before guessing.

## 13. Edge Functions

Edge Functions are under `supabase/functions`. They use Deno, shared CORS utilities, shared auth helpers, shared feature flag helpers, pricing helpers and audit logging where appropriate.

Important function areas include:

- `create-checkout`: order checkout creation.
- `complete-order-checkout`: completion/finalization of checkout.
- `stripe-webhook`: Stripe webhook handling.
- `stripe-connect-onboard`: restaurant onboarding to Stripe Connect.
- `manage-tok-one-subscription`: Tok One subscription operations.
- `process-refund`: refund handling.
- `validate-order`: order validation.
- `dispatch-order` and `dispatch-timeout`: dispatch and delivery lifecycle.
- `restaurant-order-status`: restaurant status updates.
- `courier-portal`: courier-related operations.
- `send-email`, `send-push`, `notification-dispatch`: communications.
- `generate-invoices`: invoice generation.
- `generate-campaign`, `campaign-portal`, `track-sponsored-event`: campaign/sponsored content operations.
- `track-analytics`: analytics events.
- `floorplan-ai` and `restaurant-advisor`: AI-assisted restaurant operations.
- `scrape-restaurants` and `enrich-restaurants`: enrichment/scraping support.
- `delete-account`: account deletion.

When editing Edge Functions:

- Keep CORS consistent.
- Validate method and auth early.
- Never expose service-role secrets.
- Keep audit logs for privileged mutations.
- Handle Stripe webhook signature verification exactly; do not parse/alter the raw body before verification.
- Prefer shared helpers over duplicated logic.
- Keep response bodies explicit and typed.

## 14. Payments and subscriptions

Payments are Stripe-backed. The product supports classic checkout, subscriptions/Tok One, restaurant onboarding through Stripe Connect, webhooks, refunds and likely invoices/accounting.

Payment rules:

- All payment amount calculation must be server-side or server-verified.
- The frontend may display estimated totals but must not be the source of truth.
- Webhooks must be idempotent.
- Store Stripe identifiers carefully and avoid duplicate fulfillment.
- Never log full secrets or sensitive customer payment data.

## 15. Invoicing/accounting

Dashboard and admin accounting modules include invoices, inflows and outflows. Supabase functions and scripts can generate invoices. Preserve separation between restaurant-facing invoice views and admin/compta views. Accounting values should remain deterministic and auditable.

## 16. Floor plan and restaurant operations

The floor plan module supports restaurant layout planning, table positioning, seating capacity and service/reservation optimization. AI-assisted floor plan suggestions may be available through the `floorplan-ai` Edge Function. When editing it, keep geometry fields stable: table number, capacity, shape/kind, coordinates, dimensions, rotation and seat labels should remain compatible with existing UI.

## 17. Mobile/native behavior

The project includes Capacitor for iOS/Android. Native behaviors include deep links and push notification tap handling. When changing routing or auth redirects, preserve deep-link compatibility. When changing push payload URLs, keep them valid for both web and native navigation.

Relevant scripts include Capacitor sync/build scripts and Android/iOS verification helpers.

## 18. Deployment and CI

There are two key workflows:

- CI workflow: validates PR/push with pnpm install, audit, release-critical lint, tests and dev build.
- Deploy Production workflow: validates, aligns Supabase production target, checks Supabase doctor, pushes migrations, syncs function secrets, deploys Edge Functions and deploys frontend to Vercel when Vercel secrets exist.

Current production workflow assumptions:

- Node 22.
- pnpm 10.28.1.
- Supabase CLI 2.95.2 via `pnpm dlx`.
- Production Supabase project ref: `wwcrtyoueexyxkkikaos`.
- App base/public URL: `https://cloud-rebuild-recovered.vercel.app/`.
- Site URL: `https://www.thetok.ch`.
- Admin URL: `https://admin.thetok.ch`.
- DNS: the `thetok.ch` zone has been delegated from Hostinger to Vercel DNS with `ns1.vercel-dns.com` and `ns2.vercel-dns.com`. Manage public/admin records in Vercel DNS, not in Hostinger DNS.

Do not switch production workflows back to npm unless the whole repository is migrated back to npm and a valid full `package-lock.json` is committed. The current lock source is pnpm.

## 19. Secrets and environment variables

Frontend build variables usually start with `VITE_` and must exist in both GitHub Actions and Vercel when the app is built/deployed there.

Core frontend variables:

- `VITE_SUPABASE_PROJECT_ID`
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`
- `VITE_STRIPE_PUBLISHABLE_KEY`
- Firebase public config variables if push/auth integrations require them.

Server/Edge Function variables may include:

- `SUPABASE_ACCESS_TOKEN`
- `SUPABASE_DB_PASSWORD`
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `STRIPE_WEBHOOK_SIGNING_SECRET`
- `INTERNAL_CRON_SECRET`
- `RESEND_API_KEY`
- `EMAIL_FROM`
- `ALLOWED_ORIGINS`
- `FIREBASE_SERVICE_ACCOUNT`
- optional provider keys for features that are enabled.

OpenAI keys were intentionally removed from the production deploy workflow unless a currently deployed Edge Function requires them. If AI features are re-enabled in production, add only the specific secrets required and ensure functions fail gracefully when optional AI keys are absent.

## 20. Testing strategy

Tests use Vitest and Testing Library. Follow these rules:

- Prefer behavior-oriented assertions over brittle text exactness.
- Avoid assertions that depend on whitespace split by markup.
- Mock Supabase carefully and return the exact query-chain shape used by the component.
- For realtime hooks, mock them to deterministic static values unless testing realtime itself.
- For payment/auth tests, avoid live network calls.
- Use `pnpm run test` or `pnpm run test:prod` before pushing critical changes.

Recent fragile area: subscription/order tracking tests. The UI may display totals and scheduled labels split across nested elements. Use flexible matchers when needed.

## 21. Coding conventions

General rules for modifications:

- Provide complete modified files when asked for code, not small fragments.
- Keep TypeScript strict enough to avoid unsafe shape drift.
- Prefer existing components, hooks and shared helpers.
- Avoid large unrelated refactors while fixing production bugs.
- Keep route guards and feature flags intact.
- Keep frontend secrets public-only; never ship service-role secrets.
- Add migrations for DB changes rather than editing applied migrations.
- When changing RLS, reason through SELECT/INSERT/UPDATE/DELETE separately.
- For any function that mutates money/order state, preserve idempotency.
- For user-facing French copy, keep tone direct, polished and clear.
- Save all modified text files as UTF-8. Do not introduce ANSI/Windows-1252 encodings; verify French accents and visible copy to avoid mojibake before finishing.

## 22. Debugging checklist

Frontend Supabase errors:

1. Check DevTools Network response JSON.
2. If `No API key found`, the built frontend is missing `VITE_SUPABASE_PUBLISHABLE_KEY` or Supabase client env wiring.
3. If `42501`, inspect RLS policy/role.
4. If `42P17`, inspect recursive RLS policies.
5. If relation/column errors, compare production migrations with local schema.

GitHub Actions failures:

1. Check whether the run is on the latest commit, not an old rerun.
2. Use `Re-run failed jobs` only when the code/workflow did not change.
3. If workflow changed, trigger a fresh run from `main`.
4. pnpm cache hit means dependency cache is working.
5. `supabase:target:prod` must resolve production from `.env.production.local`.
6. `supabase:doctor:prod` failures usually mean missing env/secrets or wrong target.

Supabase deploy failures:

1. Confirm `SUPABASE_ACCESS_TOKEN` and `SUPABASE_DB_PASSWORD` are set in the `production` GitHub environment.
2. Confirm `SUPABASE_PROJECT_REF` matches production.
3. Confirm secrets required by functions are present.
4. Check migration SQL for non-idempotent operations, RLS recursion or missing dependencies.
5. Check whether a migration already partially applied.

Vercel/frontend failures:

1. Confirm Vercel project env vars match GitHub production vars.
2. Redeploy after changing Vercel env vars.
3. If browser requests Supabase without `apikey`, the deployed bundle lacks the Supabase publishable key.
4. If the frontend deploy job is skipped, Vercel secrets are missing in GitHub Actions.

## 23. Product principles

Preserve these product principles:

- Restaurant-first economics.
- Lower friction for customers.
- Clear visual hierarchy and mobile-first UX.
- Strong trust, transparency and auditability for payments/orders.
- Feature flags for staged rollout.
- Robust RLS and backend enforcement.
- French-first copy for the Swiss/Geneva market.
- Premium but playful TOK visual identity.

## 24. High-risk areas

Treat these areas as high risk:

- AuthProvider/session handling.
- Role switching and protected routes.
- Stripe checkout/webhooks/refunds/subscriptions.
- Supabase migrations and RLS.
- Social feed comments/reactions/policies.
- Production deploy workflow.
- Environment variable generation.
- Order dispatch and tracking.
- Invoice/accounting calculations.
- Mobile deep links/push notification routing.

Before modifying high-risk areas, inspect current code, tests, migrations and workflows. Prefer one focused commit per risk area.

## 25. Current known production configuration

- Brand/site: TOK / TheTok.
- Public site URL: `https://www.thetok.ch`.
- Admin site URL: `https://admin.thetok.ch`.
- Current app deployment URL: `https://cloud-rebuild-recovered.vercel.app/`.
- DNS delegation: Hostinger nameservers have been switched to Vercel DNS (`ns1.vercel-dns.com`, `ns2.vercel-dns.com`) so `thetok.ch`, `www.thetok.ch` and `admin.thetok.ch` records should be managed from Vercel.
- Supabase project ref: `wwcrtyoueexyxkkikaos`.
- Package manager: pnpm.
- Node in CI/deploy: 22.
- Supabase CLI in deploy workflow: 2.95.2.

Keep this file updated when product scope, routes, workflows, secrets or major modules change.
