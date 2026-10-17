type Json = Record<string, unknown>;
export class TokOneQuoteError extends Error {
  readonly status = 409;
}
function object(value: unknown): Json { return value && typeof value === "object" && !Array.isArray(value) ? value as Json : {}; }
function fail(): never { throw new TokOneQuoteError("tok_one_recurring_price_not_verifiable"); }
export function assertTokOneSubscriptionSelection(actualId: string, expectedId: unknown) {
  if (expectedId !== undefined && (typeof expectedId !== "string" || expectedId !== actualId)) {
    throw new TokOneQuoteError("tok_one_subscription_changed");
  }
}
export function buildTokOneRecurringQuote(input: { subscriptionId: string; stripeMode: "live" | "test"; userId: string; stripeSubscription: unknown; now?: Date }) {
  const subscription = object(input.stripeSubscription);
  if (subscription.livemode !== (input.stripeMode === "live") || !["active", "trialing"].includes(String(subscription.status))) fail();
  const metadata = object(subscription.metadata);
  if (metadata.user_id && metadata.user_id !== input.userId) fail();
  const items = object(subscription.items);
  if (!Array.isArray(items.data) || items.data.length !== 1 || items.has_more === true) fail();
  const item = object(items.data[0]), price = object(item.price), recurring = object(price.recurring);
  const hasEntries = (value: unknown) => Array.isArray(value) ? value.length > 0 : value != null;
  // Only a fixed, licensed CHF price without discounts/taxes/scheduled changes
  // is an exact recap. Complex billing needs a dedicated invoice preview.
  if (price.currency !== "chf" || price.livemode !== subscription.livemode || price.billing_scheme !== "per_unit"
    || recurring.usage_type !== "licensed" || !["month", "year"].includes(String(recurring.interval))
    || !Number.isSafeInteger(price.unit_amount) || Number(price.unit_amount) < 0
    || !Number.isSafeInteger(item.quantity) || Number(item.quantity) !== 1
    || !Number.isSafeInteger(recurring.interval_count) || Number(recurring.interval_count) < 1
    || price.transform_quantity || subscription.schedule || subscription.pending_update
    || subscription.pending_invoice_item_interval || subscription.discount || hasEntries(subscription.discounts)
    || hasEntries(item.discounts) || hasEntries(subscription.default_tax_rates) || hasEntries(item.tax_rates)
    || object(subscription.automatic_tax).enabled === true) fail();
  const end = item.current_period_end || subscription.current_period_end;
  if (typeof end !== "number" || !Number.isFinite(end) || end <= 0) fail();
  return { subscription_id: input.subscriptionId, stripe_mode: input.stripeMode,
    recurring_amount_cents: Number(price.unit_amount), currency: "CHF", interval: String(recurring.interval),
    interval_count: Number(recurring.interval_count), current_period_end: new Date(end * 1000).toISOString(),
    cancel_at_period_end: subscription.cancel_at_period_end === true, checked_at: (input.now || new Date()).toISOString(),
    requires_confirmation: true, mutation_executed: false };
}
export function assertTokOneRecurringQuoteAccepted(quote: ReturnType<typeof buildTokOneRecurringQuote>, body: Json) {
  if (body.confirmed_by_user !== true) throw new TokOneQuoteError("tok_one_resume_explicit_confirmation_required");
  if (body.subscription_id !== quote.subscription_id || body.expected_recurring_amount_cents !== quote.recurring_amount_cents
    || body.expected_currency !== quote.currency || body.expected_interval !== quote.interval
    || body.expected_interval_count !== quote.interval_count) throw new TokOneQuoteError("tok_one_recurring_price_changed_requote");
}

export function buildTokOnePlanQuote(plan: Json, now = new Date()) {
  const price = Number(plan.price_monthly), cents = Math.round(price * 100);
  if (plan.status !== "active" || !Number.isFinite(price) || price <= 0 || !Number.isSafeInteger(cents)
    || Math.abs(price * 100 - cents) > 0.000001) fail();
  return { plan_id: plan.id, plan_name: plan.name, recurring_amount_cents: cents, currency: "CHF", interval: "month", interval_count: 1,
    trial_days: 14, automatic_renewal: true, cancellation_notice_days: 3, checked_at: now.toISOString(), mutation_executed: false };
}
export function assertTokOnePlanPriceAccepted(plan: Json, metadata: Json) {
  // Optional for existing TOK callers; MCP always includes this whole recap.
  if (metadata.expected_recurring_amount_cents === undefined && metadata.expected_plan_id === undefined) return;
  const quote = buildTokOnePlanQuote(plan);
  if (metadata.expected_plan_id !== quote.plan_id || metadata.expected_recurring_amount_cents !== quote.recurring_amount_cents
    || metadata.expected_currency !== "CHF" || metadata.expected_interval !== "month" || metadata.expected_interval_count !== 1) {
    throw new TokOneQuoteError("tok_one_plan_price_changed_requote");
  }
}
