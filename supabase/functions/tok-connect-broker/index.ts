import { createAdminClient } from "../_shared/auth.ts";
import { createRateLimiter } from "../_shared/rate-limit.ts";
import { handleTokConnectBroker } from "../_shared/tok-connect-broker.ts";

Deno.serve(async (req) => {
  try {
    const admin = createAdminClient(), limiter = createRateLimiter(admin, "tok-connect-broker");
    return await handleTokConnectBroker(req, { admin, env: (name) => Deno.env.get(name), consume: (subject, maxRequests, windowSeconds) => limiter.consume(subject, { maxRequests, windowSeconds }) });
  } catch {
    return new Response(JSON.stringify({ error: "temporarily_unavailable" }), { status: 503, headers: { "content-type": "application/json", "cache-control": "no-store", "access-control-allow-origin": "*" } });
  }
});
