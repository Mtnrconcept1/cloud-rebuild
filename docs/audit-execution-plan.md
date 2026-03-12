# Audit Execution Plan

## Implemented In This Lot

- Lock down privileged edge functions with authenticated access checks.
- Require authenticated ownership for AI campaign generation.
- Make checkout creation server-authoritative for campaign payments.
- Recompute order totals server-side in `validate-order`.
- Add shared server pricing logic for formulas, promotions, loyalty discount caps and flex discount caps.
- Stop reusing a single order idempotency key across multi-restaurant orders.
- Make Stripe webhook reconcile multiple orders tied to the same checkout session.
- Revoke public execution on legacy sponsored metric RPCs.
- Move sponsored campaign metrics to a server-controlled append-only event flow.
- Harden `create_order_with_items` so direct RPC callers cannot undercharge orders.
- Deploy the updated Supabase edge functions and apply the SQL migration remotely.
- Move restaurant search filtering and ranking to a SQL RPC instead of client fan-out.
- Replace heuristic campaign audience estimation with a real database calculation.
- Add persistent audit logs for privileged edge function executions.
- Expose privileged edge audit logs in the admin back-office.
- Add signed scheduler auth for background workers.
- Add contextual discovery rails on the home page for lunch, dinner, offers and user history.

## Phase 1 - Platform Integrity

### Goal

Remove the payment, pricing and privileged execution risks that can break trust in production.

### Remaining Work

- Add stronger replay protection for scheduler-triggered jobs where external callers may retry aggressively.

### Exit Criteria

- No privileged edge function is callable anonymously.
- No order or campaign amount is taken from browser payload as source of truth.
- Stripe webhook processing is idempotent and can safely replay.

## Phase 2 - Search And Discovery

### Goal

Make discovery materially better than a lexical restaurant list.

### Work

- Rank by intent, ETA, reliability, service mode and personal history.
- Extend contextual rails with ETA, reliability and event-aware moments.
- Add richer cuisine and dish intent matching with weighted synonyms.
- Add recommendation explanations in UI.

### Exit Criteria

- Search payload size scales with page size, not full catalog size.
- Ranking quality is explainable and measurable.

## Phase 3 - Fulfillment And Reservation Orchestration

### Goal

Turn feature pages into real operating capabilities.

### Work

- Build real orchestration for `MultiStop`.
- Build real orchestration for `MultiRestaurant`.
- Add SLA engine for `CreneauxGarantis`.
- Add stock reservation windows for flash sales, anti-waste and formulas.
- Add payment and dispatch state machines shared by delivery, takeaway and reservation flows.

### Exit Criteria

- Every premium flow has backend state, not just cart metadata.
- Failure handling exists for stock, payment, courier and SLA breaches.

## Phase 4 - Merchant CRM And Ads

### Goal

Make the restaurateur tooling more credible than generic boost ads.

### Work

- Add cohort reporting, LTV and reactivation reporting.
- Add budget pacing, spend guardrails and attribution windows.
- Add A/B testing for creatives and offers.
- Add service-aware targeting for lunch, dinner and zero-wait reservations.

### Exit Criteria

- Campaign audience and conversion numbers can be defended financially.
- Restaurant dashboards show real paid ROI, not just raw counters.

## Phase 5 - Differentiating Customer Experience

### Goal

Win on the hybrid experience Uber does not own natively.

### Work

- Launch unified membership across delivery, takeaway, reservation and zero-wait.
- Add split payment and shared group journeys.
- Add business lunch and recurring meal plans.
- Add compensation wallet automation for delays and quality failures.
- Add unified pre-order for table reservation with offers, formulas and timed arrival.

### Exit Criteria

- The best customer journey is reservation plus pre-order plus zero-wait plus loyalty.
- Cross-journey retention is visible in analytics.
