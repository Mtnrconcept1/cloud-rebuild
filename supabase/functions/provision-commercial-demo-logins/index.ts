import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const headers = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Content-Type": "application/json",
};

// Permanent tombstone for the retired public demo-login provisioner. Keeping
// this function in source prevents a future deployment sync from resurrecting
// the historical endpoint and its predictable credentials.
Deno.serve((req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers });

  return new Response(
    JSON.stringify({
      error: "Legacy commercial demo provisioning is disabled.",
      code: "LEGACY_DEMO_PROVISIONING_DISABLED",
    }),
    { status: 410, headers },
  );
});
