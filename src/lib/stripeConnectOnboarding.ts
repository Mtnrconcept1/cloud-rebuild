/**
 * The platform owner (not an individual restaurant or customer) completes
 * Stripe Connect's negative-balance liability profile in Stripe Dashboard.
 * Keep the link static and trusted; never use a URL returned in an API error.
 */
export const TOK_STRIPE_CONNECT_PLATFORM_PROFILE_URL =
  "https://dashboard.stripe.com/settings/connect/platform-profile";

export type StripeConnectOnboardingIssue = "platform_profile_required" | null;

export function getStripeConnectOnboardingIssue(body: unknown): StripeConnectOnboardingIssue {
  if (!body || typeof body !== "object" || Array.isArray(body)) return null;
  const payload = body as Record<string, unknown>;
  if (payload.code === "STRIPE_CONNECT_PLATFORM_PROFILE_REQUIRED"
    || payload.error === "stripe_connect_platform_profile_required") {
    return "platform_profile_required";
  }

  // Transitional compatibility with an older Edge deployment. Do not show
  // the raw Stripe exception or trust its embedded dashboard URL.
  if (typeof payload.error === "string"
    && (/please review the responsibilities of managing losses(?: and collecting requirements)? for connected accounts/i.test(payload.error)
      || /you must complete your platform profile to use connect/i.test(payload.error))) {
    return "platform_profile_required";
  }

  return null;
}
