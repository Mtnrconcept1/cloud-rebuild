import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, stripe-signature",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function resolveWebhookUrl() {
  const supabaseUrl = Deno.env.get("SUPABASE_URL")?.trim() || "https://wwcrtyoueexyxkkikaos.supabase.co";
  return `${supabaseUrl.replace(/\/+$/, "")}/functions/v1/stripe-webhook`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "method_not_allowed" }), {
      status: 405,
      headers: {
        ...CORS_HEADERS,
        "Content-Type": "application/json",
      },
    });
  }

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
});
