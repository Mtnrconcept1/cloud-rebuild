import { buildCorsHeaders, handleCorsPreflight } from "../_shared/cors.ts";

const RETIRED_ERROR = "signup_submission_endpoint_retired";

Deno.serve((req) => {
  const corsHeaders = buildCorsHeaders(req);
  const preflight = handleCorsPreflight(req, corsHeaders);
  if (preflight) return preflight;

  return new Response(
    JSON.stringify({
      error: RETIRED_ERROR,
      message: "Ce parcours d'inscription a été remplacé. Reprenez l'inscription depuis l'application.",
    }),
    {
      status: 410,
      headers: {
        ...corsHeaders,
        "Cache-Control": "no-store",
        "Content-Type": "application/json; charset=utf-8",
      },
    },
  );
});
