/**
 * Interpret one specific Stripe Connect platform-configuration blocker.
 *
 * Never expose raw Stripe exceptions to the restaurant dashboard: even a
 * legitimate Stripe error can contain an account identifier or implementation
 * detail. The frontend only receives a stable, narrowly classified code.
 */
export const STRIPE_CONNECT_PLATFORM_PROFILE_REQUIRED =
  "stripe_connect_platform_profile_required";

export function isStripeConnectPlatformProfileRequired(error: unknown): boolean {
  const message = error instanceof Error
    ? error.message
    : typeof error === "string" ? error
    : error && typeof error === "object" && "message" in error &&
        typeof error.message === "string"
      ? error.message
      : "";

  return /please review the responsibilities of managing losses(?: and collecting requirements)? for connected accounts/i.test(message)
    || /you must complete your platform profile to use connect/i.test(message);
}
