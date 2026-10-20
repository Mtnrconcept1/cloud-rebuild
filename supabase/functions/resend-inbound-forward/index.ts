import { createAdminClient } from '../_shared/auth.ts';
import { createForwardStore, forwardInboundEvent, ForwardError, verifyInboundSignature } from '../_shared/resend-inbound-forward.ts';

Deno.serve(async (req) => {
  const json = (body: object, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);
  const secret = Deno.env.get('RESEND_INBOUND_WEBHOOK_SECRET');
  const apiKey = Deno.env.get('RESEND_API_KEY');
  if (!secret || !apiKey) return json({ error: 'inbound_forward_not_configured' }, 503);
  try {
    // Resend webhooks contain metadata only; cap the stream before signature/JSON parsing.
    const reader = req.body?.getReader();
    if (!reader) return json({ error: 'empty_body' }, 400);
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (true) {
      const next = await reader.read();
      if (next.done) break;
      size += next.value.byteLength;
      if (size > 256_000) { await reader.cancel(); return json({ error: 'payload_too_large' }, 413); }
      chunks.push(next.value);
    }
    const body = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) { body.set(chunk, offset); offset += chunk.length; }
    const raw = new TextDecoder().decode(body);
    if (!await verifyInboundSignature(raw, req.headers, secret)) return json({ error: 'invalid_signature' }, 401);
    let event: unknown;
    try { event = JSON.parse(raw); } catch { return json({ error: 'invalid_json' }, 400); }
    const result = await forwardInboundEvent(event, { apiKey, store: createForwardStore(createAdminClient()) });
    return json({ ok: true, result });
  } catch (error) {
    const safe = error instanceof ForwardError ? error : new ForwardError('inbound_forward_failed', 503);
    console.error(JSON.stringify({ function: 'resend-inbound-forward', error_code: safe.code }));
    return json({ error: safe.code }, safe.status);
  }
});
