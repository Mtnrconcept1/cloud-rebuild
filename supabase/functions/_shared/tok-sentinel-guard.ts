import { HttpError, getEnv, type RequestActor } from "./auth.ts";

/**
 * Gate privileged user-initiated writes that run with the service-role client
 * and would otherwise bypass restrictive RLS. The accompanying SQL RLS guards
 * continue to cover direct PostgREST calls.
 *
 * Rollout is explicitly opt-in until migrations and out-of-band monitoring are
 * verified. Once enabled, an unavailable database MUST deny new operations.
 * Financial reconciliation/webhooks are deliberately not gated here.
 */
export async function assertSentinelAllowed(
  actor: RequestActor,
  operation: "payments" | "operations" | "administration",
  restaurantId?: string | null,
): Promise<void> {
  if (getEnv("TOK_SENTINEL_ENFORCEMENT_ENABLED") !== "true") return;
  const safeId = typeof restaurantId === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(restaurantId)
    ? restaurantId : null;
  const { data, error } = await actor.adminClient.rpc("tok_sentinel_write_allowed", {
    p_operation: operation,
    p_restaurant_id: safeId,
    p_user_id: actor.userId || null,
  });
  if (error || typeof data !== "boolean") {
    throw new HttpError(503, "SENTINEL_SECURITY_CHECK_UNAVAILABLE");
  }
  if (!data) {
    throw new HttpError(423, "SENTINEL_OPERATION_TEMPORARILY_LOCKED");
  }
}
