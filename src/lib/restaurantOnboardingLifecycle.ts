export const RESTAURANT_ONBOARDING_SERVER_STATES = [
  "application_created",
  "email_confirmed",
  "configuration_allowed",
  "stripe_session_created",
  "payment_method_saved",
  "browser_return_received",
  "webhook_received",
  "recovery_required",
  "admin_approved",
] as const;

export type RestaurantOnboardingServerState =
  (typeof RESTAURANT_ONBOARDING_SERVER_STATES)[number];

export type RestaurantOnboardingAttemptView = {
  state: RestaurantOnboardingServerState;
  paymentAttemptState: string | null;
  webhookReceived: boolean;
  recoveryRequired: boolean;
};

export function resolveRestaurantOnboardingAttemptView(input: {
  paymentAttemptState?: string | null;
  stripeStatus?: string | null;
  setupIntentStatus?: string | null;
  webhookReceived?: boolean;
  adminApproved?: boolean;
  browserReturnReceived?: boolean;
}): RestaurantOnboardingAttemptView {
  const paymentAttemptState = input.paymentAttemptState?.toLowerCase() || null;
  const stripeStatus = input.stripeStatus?.toLowerCase() || null;
  const setupIntentStatus = input.setupIntentStatus?.toLowerCase() || null;
  const webhookReceived =
    input.webhookReceived === true || paymentAttemptState === "finalized";
  const recoveryRequired =
    ["failed", "expired", "cancelled", "canceled"].includes(
      paymentAttemptState || "",
    ) ||
    ["requires_payment_method", "requires_action", "canceled"].includes(
      setupIntentStatus || "",
    ) ||
    stripeStatus === "expired";

  let state: RestaurantOnboardingServerState = "application_created";
  if (input.adminApproved) state = "admin_approved";
  else if (recoveryRequired) state = "recovery_required";
  else if (webhookReceived) state = "webhook_received";
  else if (input.browserReturnReceived) state = "browser_return_received";
  else if (setupIntentStatus === "succeeded") state = "payment_method_saved";
  else if (
    paymentAttemptState === "session_bound" ||
    stripeStatus === "open" ||
    stripeStatus === "complete"
  ) {
    state = "stripe_session_created";
  }

  return { state, paymentAttemptState, webhookReceived, recoveryRequired };
}

export const RESTAURANT_ONBOARDING_STATE_LABELS: Record<
  RestaurantOnboardingServerState,
  string
> = {
  application_created: "Dossier créé",
  email_confirmed: "Email confirmé",
  configuration_allowed: "Configuration autorisée",
  stripe_session_created: "Session Stripe créée",
  payment_method_saved: "Carte enregistrée chez Stripe",
  browser_return_received:
    "Retour Stripe reçu, confirmation serveur en attente",
  webhook_received: "Carte confirmée par le webhook",
  recovery_required: "Reprise requise",
  admin_approved: "Restaurant approuvé",
};
