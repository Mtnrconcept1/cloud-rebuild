import { createAdminClient } from "../_shared/auth.ts";
import { makeLogger } from "../_shared/logging.ts";
import { verifyUnsubscribeToken } from "../_shared/marketing-unsubscribe-token.ts";

/**
 * Public unsubscribe endpoint.
 *
 * Two callers, one behaviour:
 *   - POST with "List-Unsubscribe=One-Click" — the mail provider acting on the
 *     recipient's behalf (RFC 8058). Gmail and Yahoo require this of bulk
 *     senders and penalise its absence.
 *   - GET — a human following the link in the message body.
 *
 * Deliberately unauthenticated, so the token is the only credential. Every
 * response is identical whether or not the identifier exists: an endpoint that
 * answers differently for a valid one becomes an oracle for enumerating
 * deliveries.
 */

const CONFIRMATION_HTML = `<!doctype html>
<html lang="fr"><head><meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>Désabonnement confirmé</title></head>
<body style="margin:0;font-family:system-ui,-apple-system,Segoe UI,sans-serif;background:#f8fafc;color:#0f172a">
<div style="max-width:520px;margin:15vh auto;padding:32px;background:#fff;border-radius:16px;border:1px solid #e2e8f0">
<h1 style="margin:0 0 12px;font-size:20px">Désabonnement enregistré</h1>
<p style="margin:0;font-size:15px;line-height:1.6;color:#475569">
Vous ne recevrez plus de communication marketing de Tok. La demande est effective immédiatement
et les envois déjà planifiés vers votre adresse ont été annulés.</p>
</div></body></html>`;

function htmlResponse() {
  return new Response(CONFIRMATION_HTML, {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
      // The page is reached from a mail client; nothing here should be framed
      // or indexed.
      "X-Frame-Options": "DENY",
      "X-Robots-Tag": "noindex, nofollow",
      "Referrer-Policy": "no-referrer",
    },
  });
}

Deno.serve(async (req) => {
  const log = makeLogger("marketing-unsubscribe");

  if (req.method !== "GET" && req.method !== "POST") {
    return new Response("Method not allowed", { status: 405, headers: { Allow: "GET, POST" } });
  }

  try {
    const url = new URL(req.url);
    let token = url.searchParams.get("token")?.trim() || "";

    // Some providers post the token in the body rather than the query string.
    if (!token && req.method === "POST") {
      const body = await req.text().catch(() => "");
      token = new URLSearchParams(body).get("token")?.trim() || "";
    }

    const secret = Deno.env.get("MARKETING_WEBHOOK_SECRET")?.trim() || "";
    const deliveryId = await verifyUnsubscribeToken(token, secret);

    if (deliveryId) {
      const { error } = await createAdminClient().rpc("service_unsubscribe_marketing_delivery", {
        p_delivery_id: deliveryId,
        p_source: req.method === "POST" ? "one_click" : "lien e-mail",
      });
      if (error) log.error("unsubscribe_failed", { message: error.message });
    } else {
      log.error("unsubscribe_token_rejected", { method: req.method });
    }

    // RFC 8058 expects a 2xx with no body for the one-click POST. A human gets
    // the confirmation page. Both paths answer the same way regardless of
    // whether the token was valid.
    if (req.method === "POST") {
      return new Response(null, { status: 200, headers: { "Cache-Control": "no-store" } });
    }
    return htmlResponse();
  } catch (error) {
    log.error("unsubscribe_error", { message: error instanceof Error ? error.message : "unknown" });
    // Even a failure must not tell the caller anything useful.
    return req.method === "POST"
      ? new Response(null, { status: 200, headers: { "Cache-Control": "no-store" } })
      : htmlResponse();
  }
});
