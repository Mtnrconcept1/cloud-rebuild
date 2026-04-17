/**
 * Token-bucket rate limiting for edge functions, backed by a Postgres table.
 *
 * Buckets are keyed by (function_name, subject). Subject can be a user id, an
 * IP address, a restaurant id, or the literal string "global".
 *
 * Callers should guard expensive external work (OpenAI, scraping, …) with
 * multiple buckets:
 *
 *   const rl = createRateLimiter(actor.adminClient, "floorplan-ai");
 *   await rl.consume(`user:${actor.userId}`, {
 *     maxRequests: 20,
 *     windowSeconds: 3600,   // 20 req / hour per user
 *   });
 *   await rl.consume("global", {
 *     maxRequests: 200,
 *     windowSeconds: 60,     // 200 req / minute global cap
 *   });
 */

import type { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { HttpError } from "./auth.ts";

export type RateLimitOptions = {
  maxRequests: number;
  windowSeconds: number;
};

export function createRateLimiter(
  adminClient: ReturnType<typeof createClient>,
  functionName: string,
) {
  return {
    /**
     * Consume one token from the bucket. Throws HttpError(429) if exhausted.
     */
    async consume(subject: string, opts: RateLimitOptions): Promise<void> {
      const { data, error } = await adminClient.rpc("rate_limit_consume", {
        p_function_name: functionName,
        p_subject: subject,
        p_max_requests: opts.maxRequests,
        p_window_seconds: opts.windowSeconds,
      });

      if (error) {
        // Fail-open would be dangerous for cost-sensitive endpoints — fail-closed.
        throw new HttpError(503, "rate_limiter_unavailable");
      }

      // RPC returns a boolean: true = allowed, false = over limit.
      if (data === false) {
        throw new HttpError(
          429,
          `rate_limited: ${opts.maxRequests}/${opts.windowSeconds}s on ${subject}`,
        );
      }
    },
  };
}
