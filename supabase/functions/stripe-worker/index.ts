import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import Stripe from "npm:stripe@18.5.0";

import {
  HttpError,
  authenticateRequest,
  jsonResponse,
  writeAuditLog,
} from "../_shared/auth.ts";
import { makeLogger } from "../_shared/logging.ts";
import { getStripeRuntimeForCheckoutKind } from "../_shared/stripe-client.ts";
import { getEffectiveFeatureFlagSet } from "../_shared/feature-flags.ts";
import {
  FAIR_GROWTH_ANNUAL_MONTHS_CHARGED,
  getRestaurantSubscriptionStripeInterval,
  isFairGrowthAnnualBillingEnabled,
  parseRestaurantSubscriptionBillingPeriod,
} from "../_shared/restaurant-subscription-billing.ts";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, stripe-signature, x-internal-cron-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type ActivationJob = {
  job_id: string;
  restaurant_id: string;
  signup_application_id?: string | null;
  plan_id: string;
  plan_slug: string;
  plan_name?: string | null;
  amount_chf: number | string;
  billing_period?: string | null;
  currency?: string | null;
  stripe_customer_id: string;
  stripe_payment_method_id: string;
  stripe_setup_intent_id?: string | null;
  stripe_mode: "live" | "test";
  attempt_count?: number | null;
  // `subscription_id` is the local restaurant_ai_subscriptions UUID returned
  // by the claim RPC. It must never be sent to Stripe.
  subscription_id?: string | null;
  stripe_subscription_id?: string | null;
  stripe_invoice_id?: string | null;
  activation_mode?: "create_subscription" | "retry_payment" | null;
  internal_invoice_id?: string | null;
};

function resolveWebhookUrl() {
  const supabaseUrl = Deno.env.get("SUPABASE_URL")?.trim() || "https://wwcrtyoueexyxkkikaos.supabase.co";
  return `${supabaseUrl.replace(/\/+$/, "")}/functions/v1/stripe-webhook`;
}

async function forwardSignedStripeWebhook(req: Request) {
  const forwardedHeaders = new Headers(req.headers);
  forwardedHeaders.delete("host");
  forwardedHeaders.set("x-tok-forwarded-from", "stripe-worker");

  const response = await fetch(resolveWebhookUrl(), {
    method: "POST",
    headers: forwardedHeaders,
    body: req.body,
  });

  const responseHeaders = new Headers(response.headers);
  responseHeaders.set("x-tok-stripe-worker-proxy", "1");

  return new Response(response.body, {
    status: response.status,
    headers: responseHeaders,
  });
}

function clampJobLimit(value: unknown) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 10;
  return Math.min(25, Math.max(1, Math.trunc(parsed)));
}

function getExpandableStripeId(value: unknown) {
  if (typeof value === "string") return value;
  if (value && typeof value === "object" && typeof (value as { id?: unknown }).id === "string") {
    return (value as { id: string }).id;
  }
  return null;
}

function finiteUnixTimestamp(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function resolveSubscriptionPeriod(subscription: Stripe.Subscription) {
  const starts = (subscription.items?.data || [])
    .map((item) => finiteUnixTimestamp((item as { current_period_start?: unknown }).current_period_start))
    .filter((value): value is number => value !== null);
  const ends = (subscription.items?.data || [])
    .map((item) => finiteUnixTimestamp((item as { current_period_end?: unknown }).current_period_end))
    .filter((value): value is number => value !== null);
  const start = finiteUnixTimestamp((subscription as { current_period_start?: unknown }).current_period_start)
    || (starts.length > 0 ? Math.min(...starts) : null);
  const end = finiteUnixTimestamp((subscription as { current_period_end?: unknown }).current_period_end)
    || (ends.length > 0 ? Math.max(...ends) : null);

  return {
    currentPeriodStart: start ? new Date(start * 1000).toISOString() : null,
    currentPeriodEnd: end ? new Date(end * 1000).toISOString() : null,
  };
}

function stripeErrorCode(error: unknown) {
  if (error instanceof Stripe.errors.StripeError) {
    return String(error.code || error.type || error.constructor.name || "stripe_error");
  }
  if (error instanceof Error) return error.name || "activation_error";
  return "activation_error";
}

function isRetryableActivationError(error: unknown) {
  if (!(error instanceof Stripe.errors.StripeError)) return true;
  return (
    error instanceof Stripe.errors.StripeAPIError
    || error instanceof Stripe.errors.StripeConnectionError
    || error instanceof Stripe.errors.StripeRateLimitError
    || error instanceof Stripe.errors.StripeIdempotencyError
  );
}

function retryDelaySeconds(attemptCount: unknown) {
  const attempt = Math.max(1, Math.trunc(Number(attemptCount) || 1));
  return Math.min(3600, 30 * (2 ** Math.min(6, attempt - 1)));
}

async function findExistingActivationSubscription(input: {
  stripe: Stripe;
  job: ActivationJob;
}) {
  const { stripe, job } = input;
  if (job.stripe_subscription_id) {
    return await stripe.subscriptions.retrieve(job.stripe_subscription_id);
  }

  // Stripe only retains idempotency keys for a bounded time. The durable job
  // id in Subscription metadata prevents a duplicate even if a DB outage lasts
  // beyond that window.
  const subscriptions = await stripe.subscriptions.list({
    customer: job.stripe_customer_id,
    status: "all",
    limit: 100,
  });
  const matches = subscriptions.data.filter((subscription) =>
    subscription.metadata?.activation_job_id === job.job_id
  );
  return matches.find((subscription) =>
    !["canceled", "incomplete_expired"].includes(subscription.status)
  ) || matches[0] || null;
}

async function activateRestaurantSubscription(input: {
  job: ActivationJob;
  adminClient: Awaited<ReturnType<typeof authenticateRequest>>["adminClient"];
}) {
  const { job, adminClient } = input;
  const runtime = getStripeRuntimeForCheckoutKind("restaurant-onboarding");
  if (runtime.mode !== job.stripe_mode) {
    throw new HttpError(
      503,
      `Stripe ${job.stripe_mode} indisponible pour l'activation restaurateur`,
    );
  }

  const amountCents = Math.round(Number(job.amount_chf) * 100);
  const currency = String(job.currency || "CHF").trim().toLowerCase();
  const billingPeriod = parseRestaurantSubscriptionBillingPeriod(job.billing_period);
  if (!job.job_id || !job.restaurant_id || !job.plan_id || !job.plan_slug) {
    throw new HttpError(422, "Activation restaurateur incomplète");
  }
  if (!job.stripe_customer_id || !job.stripe_payment_method_id) {
    throw new HttpError(422, "Moyen de paiement restaurateur manquant");
  }
  if (!Number.isSafeInteger(amountCents) || amountCents <= 0) {
    throw new HttpError(422, "Montant d'abonnement restaurateur invalide");
  }
  if (currency !== "chf") {
    throw new HttpError(422, "Devise d'abonnement restaurateur invalide");
  }
  if (!billingPeriod) {
    throw new HttpError(422, "Période d'abonnement restaurateur invalide");
  }

  const metadata: Record<string, string> = {
    checkout_kind: "restaurant-onboarding",
    onboarding_server_state: "configuration_allowed",
    activation_job_id: job.job_id,
    local_subscription_id: String(job.subscription_id || ""),
    restaurant_id: job.restaurant_id,
    signup_application_id: String(job.signup_application_id || ""),
    restaurant_subscription_plan_id: job.plan_id,
    restaurant_subscription_plan_slug: job.plan_slug,
    billing_period: billingPeriod,
    annual_months_charged: billingPeriod === "yearly"
      ? String(FAIR_GROWTH_ANNUAL_MONTHS_CHARGED)
      : "1",
    service_months: billingPeriod === "yearly" ? "12" : "1",
    entitlement_reset_period: "monthly",
    internal_invoice_id: String(job.internal_invoice_id || ""),
  };
  const idempotencySuffix = job.job_id.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 120);
  const paymentAttemptSuffix = String(
    job.stripe_setup_intent_id || job.stripe_payment_method_id,
  )
    .replace(/[^a-zA-Z0-9_-]/g, "")
    .slice(0, 80);

  let subscription = await findExistingActivationSubscription({
    stripe: runtime.stripe,
    job,
  });
  const foundExistingSubscription = Boolean(subscription);
  if (!subscription && billingPeriod === "yearly") {
    const activeFlags = await getEffectiveFeatureFlagSet(adminClient);
    if (!isFairGrowthAnnualBillingEnabled(activeFlags)) {
      throw new HttpError(503, "La facturation annuelle Fair Growth n'est pas activee");
    }
  }
  let stripePriceId = getExpandableStripeId(subscription?.items?.data?.[0]?.price);

  if (subscription && ["canceled", "incomplete_expired"].includes(subscription.status)) {
    subscription = null;
    stripePriceId = null;
  }

  if (
    !subscription
    && !foundExistingSubscription
    && job.activation_mode === "retry_payment"
  ) {
    throw new HttpError(409, "Subscription Stripe à représenter introuvable");
  }

  if (subscription) {
    const stripeInterval = subscription.items?.data?.[0]?.price?.recurring?.interval;
    if (
      subscription.metadata?.restaurant_id !== job.restaurant_id
      || subscription.metadata?.restaurant_subscription_plan_id !== job.plan_id
      || (subscription.metadata?.billing_period
        && subscription.metadata.billing_period !== billingPeriod)
      || stripeInterval !== getRestaurantSubscriptionStripeInterval(billingPeriod)
    ) {
      throw new HttpError(409, "Subscription Stripe d'activation incohérente");
    }

    if (["incomplete", "past_due", "unpaid"].includes(subscription.status)) {
      subscription = await runtime.stripe.subscriptions.update(
        subscription.id,
        {
          default_payment_method: job.stripe_payment_method_id,
          payment_settings: {
            save_default_payment_method: "on_subscription",
          },
          metadata,
        },
        {
          idempotencyKey:
            `tok-restaurant-activation-update-pm:${idempotencySuffix}:${paymentAttemptSuffix}`,
        },
      );

      const stripeInvoiceId = job.stripe_invoice_id
        || getExpandableStripeId(subscription.latest_invoice);
      if (!stripeInvoiceId) {
        throw new Error("activation_retry_invoice_missing");
      }

      const invoice = await runtime.stripe.invoices.retrieve(stripeInvoiceId);
      if (invoice.status !== "paid") {
        const retriedInvoice = await runtime.stripe.invoices.pay(
          stripeInvoiceId,
          {
            payment_method: job.stripe_payment_method_id,
            off_session: true,
          },
          {
            idempotencyKey:
              `tok-restaurant-activation-pay:${idempotencySuffix}:${paymentAttemptSuffix}`,
          },
        );
        if (retriedInvoice.status !== "paid") {
          throw new HttpError(402, "Le règlement de la facture requiert une nouvelle action client");
        }
      }

      subscription = await runtime.stripe.subscriptions.retrieve(
        subscription.id,
        { expand: ["latest_invoice"] },
      );
    }
  } else {
    const price = await runtime.stripe.prices.create(
      {
        currency,
        unit_amount: amountCents,
        recurring: { interval: getRestaurantSubscriptionStripeInterval(billingPeriod) },
        product_data: {
          name: `Abonnement restaurateur TOK - ${job.plan_name || job.plan_slug}`,
          metadata: {
            restaurant_subscription_plan_id: job.plan_id,
            restaurant_subscription_plan_slug: job.plan_slug,
            billing_period: billingPeriod,
          },
        },
        metadata: {
          activation_job_id: job.job_id,
          restaurant_subscription_plan_id: job.plan_id,
          billing_period: billingPeriod,
        },
      },
      { idempotencyKey: `tok-restaurant-activation-price:${idempotencySuffix}` },
    );
    stripePriceId = price.id;

    subscription = await runtime.stripe.subscriptions.create(
      {
        customer: job.stripe_customer_id,
        items: [{ price: price.id }],
        default_payment_method: job.stripe_payment_method_id,
        collection_method: "charge_automatically",
        payment_behavior: "default_incomplete",
        payment_settings: {
          save_default_payment_method: "on_subscription",
        },
        off_session: true,
        metadata,
        expand: ["latest_invoice"],
      },
      {
        idempotencyKey:
          `tok-restaurant-activation-subscription:${idempotencySuffix}:${paymentAttemptSuffix}`,
      },
    );
  }

  if (!stripePriceId) {
    throw new Error("activation_subscription_price_missing");
  }

  const period = resolveSubscriptionPeriod(subscription);
  const { error: completeError } = await adminClient.rpc(
    "complete_restaurant_subscription_activation_job",
    {
      p_job_id: job.job_id,
      p_stripe_subscription_id: subscription.id,
      p_stripe_customer_id: job.stripe_customer_id,
      p_stripe_price_id: stripePriceId,
      p_stripe_mode: runtime.mode,
      p_subscription_status: subscription.status,
      p_current_period_start: period.currentPeriodStart,
      p_current_period_end: period.currentPeriodEnd,
      p_metadata: {
        stripe_latest_invoice_id: getExpandableStripeId(subscription.latest_invoice),
        activation_job_id: job.job_id,
        billing_period: billingPeriod,
        entitlement_reset_period: "monthly",
      },
    },
  );

  if (completeError) {
    throw new Error(`activation_complete_rpc_failed:${completeError.message}`);
  }

  return {
    jobId: job.job_id,
    subscriptionId: subscription.id,
    subscriptionStatus: subscription.status,
    billingPeriod,
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "method_not_allowed" }, 405, CORS_HEADERS);
  }

  // Keep backwards compatibility for Stripe endpoints already configured to
  // call stripe-worker. Signature verification remains exclusively in the
  // canonical stripe-webhook function.
  if (req.headers.has("stripe-signature")) {
    return await forwardSignedStripeWebhook(req);
  }

  const log = makeLogger("stripe-worker");
  let actor: Awaited<ReturnType<typeof authenticateRequest>> | null = null;

  try {
    actor = await authenticateRequest(req, {
      allowServiceRole: true,
      allowSchedulerSecret: true,
    });
    if (!actor.isServiceRole) {
      throw new HttpError(403, "Accès réservé au scheduler");
    }

    let payload: Record<string, unknown> = {};
    try {
      payload = await req.json();
    } catch {
      payload = {};
    }
    const action = String(payload.action || "process-subscription-activations");
    if (action !== "process-subscription-activations") {
      throw new HttpError(400, "Action stripe-worker inconnue");
    }
    const limit = clampJobLimit(payload.limit);

    const { data: claimedJobs, error: claimError } = await actor.adminClient.rpc(
      "claim_restaurant_subscription_activation_jobs",
      {
        p_limit: limit,
        p_lease_seconds: 300,
      },
    );
    if (claimError) {
      throw new Error(`activation_claim_rpc_failed:${claimError.message}`);
    }

    const jobs = (Array.isArray(claimedJobs) ? claimedJobs : []) as ActivationJob[];
    const results: Array<Record<string, unknown>> = [];

    for (const job of jobs) {
      try {
        const activated = await activateRestaurantSubscription({
          job,
          adminClient: actor.adminClient,
        });
        results.push({ ...activated, ok: true });
        log.info("restaurant_subscription_activation_submitted", activated);
      } catch (error) {
        const retryable = error instanceof HttpError
          ? error.status >= 500
          : isRetryableActivationError(error);
        const message = error instanceof Error ? error.message : "activation_error";
        const { error: failError } = await actor.adminClient.rpc(
          "fail_restaurant_subscription_activation_job",
          {
            p_job_id: job.job_id,
            p_error_code: stripeErrorCode(error),
            p_error_message: message.slice(0, 1000),
            p_retryable: retryable,
            p_retry_after_seconds: retryDelaySeconds(job.attempt_count),
            p_metadata: {
              stripe_mode: job.stripe_mode,
              restaurant_id: job.restaurant_id,
            },
          },
        );

        if (failError) {
          throw new Error(`activation_fail_rpc_failed:${failError.message}`);
        }

        results.push({
          jobId: job.job_id,
          ok: false,
          retryable,
          errorCode: stripeErrorCode(error),
        });
        log.error("restaurant_subscription_activation_failed", {
          jobId: job.job_id,
          retryable,
          message,
        });
      }
    }

    await writeAuditLog({
      adminClient: actor.adminClient,
      actor,
      request: req,
      functionName: "stripe-worker",
      action: "process_restaurant_subscription_activations",
      status: "success",
      targetEntityType: "restaurant_subscription_activation_jobs",
      metadata: {
        source: String(payload.source || "scheduler"),
        claimed: jobs.length,
        succeeded: results.filter((result) => result.ok === true).length,
        failed: results.filter((result) => result.ok === false).length,
      },
    });

    return jsonResponse({
      ok: true,
      claimed: jobs.length,
      results,
    }, 200, CORS_HEADERS);
  } catch (error) {
    const status = error instanceof HttpError ? error.status : 500;
    log.error("stripe_worker_failed", {
      status,
      message: error instanceof Error ? error.message : "unknown",
    });

    if (actor) {
      await writeAuditLog({
        adminClient: actor.adminClient,
        actor,
        request: req,
        functionName: "stripe-worker",
        action: "process_restaurant_subscription_activations",
        status: "failure",
        errorMessage: error instanceof Error ? error.message : "unknown",
      });
    }

    return jsonResponse({
      error: error instanceof Error ? error.message : "stripe_worker_failed",
    }, status, CORS_HEADERS);
  }
});
