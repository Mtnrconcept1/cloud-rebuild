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
 *
 * Optional Supabase secrets can override maxRequests without redeploying code:
 *   TOK_RATE_LIMIT_AI_IMAGE_ENHANCE_USER_MAX_REQUESTS=50
 *   TOK_RATE_LIMIT_AI_IMAGE_ENHANCE_RESTAURANT_MAX_REQUESTS=100
 *   TOK_RATE_LIMIT_AI_IMAGE_ENHANCE_GLOBAL_MAX_REQUESTS=300
 *   TOK_RATE_LIMIT_AI_IMAGE_ENHANCE_MAX_REQUESTS=50
 *   TOK_RATE_LIMIT_DEFAULT_MAX_REQUESTS=30
 */

import type { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { HttpError } from "./auth.ts";

export type RateLimitOptions = {
  maxRequests: number;
  windowSeconds: number;
};

function normalizeEnvToken(value: string) {
  return value.toUpperCase().replace(/[^A-Z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

function readPositiveIntEnv(name: string): number | null {
  const raw = Deno.env.get(name)?.trim();
  if (!raw) return null;
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) return null;
  return Math.floor(value);
}

function resolveMaxRequests(functionName: string, subject: string, fallback: number) {
  const functionToken = normalizeEnvToken(functionName);
  const scopeToken = normalizeEnvToken(subject.split(":")[0] || "bucket");

  const overrideKeys = [
    `TOK_RATE_LIMIT_${functionToken}_${scopeToken}_MAX_REQUESTS`,
    `TOK_RATE_LIMIT_${functionToken}_MAX_REQUESTS`,
    "TOK_RATE_LIMIT_DEFAULT_MAX_REQUESTS",
  ];

  for (const key of overrideKeys) {
    const value = readPositiveIntEnv(key);
    if (value !== null) return value;
  }

  return fallback;
}

export function createRateLimiter(
  adminClient: ReturnType<typeof createClient>,
  functionName: string,
) {
  return {
    /**
     * Consume one token from the bucket. Throws HttpError(429) if exhausted.
     */
    async consume(subject: string, opts: RateLimitOptions): Promise<void> {
      const maxRequests = resolveMaxRequests(functionName, subject, opts.maxRequests);

      const { data, error } = await adminClient.rpc("rate_limit_consume", {
        p_function_name: functionName,
        p_subject: subject,
        p_max_requests: maxRequests,
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
          `rate_limited: ${maxRequests}/${opts.windowSeconds}s on ${subject}`,
        );
      }
    },
  };
}
