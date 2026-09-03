import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const headers = {
  "Access-Control-Allow-Origin": "https://www.thetok.ch",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Cache-Control": "no-store",
  "Content-Type": "application/json; charset=utf-8",
  "X-Content-Type-Options": "nosniff",
};

// Permanent tombstone for the retired privileged Stripe bootstrap endpoint.
// Keeping the slug under source control prevents a deployment sync from
// resurrecting the historical implementation, which could create Stripe
// products and prices with production credentials.
Deno.serve((request: Request) => {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers });
  }

  return new Response(
    JSON.stringify({
      ok: false,
      error: "Stripe bootstrap is permanently disabled.",
      code: "STRIPE_SETUP_RETIRED",
    }),
    { status: 410, headers },
  );
});
