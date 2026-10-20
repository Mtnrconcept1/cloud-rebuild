// Resend receiving contract: https://resend.com/docs/dashboard/receiving/forward-emails
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ALIASES = new Set(['contact@thetok.ch', 'partenariat@thetok.ch', 'r.barman@thetok.ch', 'support@thetok.ch', 'privacy@thetok.ch']);
const DESTINATION = 'rbarman@hotmail.ch';
const MAX_ATTACHMENTS = 20;
const MAX_FILES = 12 * 1024 * 1024;
const MAX_JSON = 2 * 1024 * 1024;
const LEASE_MS = 120_000;
const RETRY_WINDOW_MS = 23 * 60 * 60 * 1000;
type RecordValue = Record<string, any>;
const record = (value: unknown): RecordValue => value && typeof value === 'object' && !Array.isArray(value) ? value as RecordValue : {};

export class ForwardError extends Error {
  constructor(readonly code: string, readonly status = 502, readonly terminal = false) { super(code); }
}

async function bytes(response: Response, limit: number): Promise<Uint8Array> {
  if (!response.ok) throw new ForwardError(`provider_http_${response.status}`);
  if (Number(response.headers.get('content-length') || 0) > limit) throw new ForwardError('content_too_large', 422, true);
  const reader = response.body?.getReader();
  if (!reader) throw new ForwardError('empty_provider_response');
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const next = await reader.read();
      if (next.done) break;
      size += next.value.byteLength;
      if (size > limit) throw new ForwardError('content_too_large', 422, true);
      chunks.push(next.value);
    }
  } finally { await reader.cancel().catch(() => {}); }
  const output = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { output.set(chunk, offset); offset += chunk.length; }
  return output;
}

export async function verifyInboundSignature(raw: string, headers: Headers, secret: string, now = Date.now()) {
  const id = headers.get('svix-id') || '';
  const timestamp = headers.get('svix-timestamp') || '';
  const signatures = headers.get('svix-signature') || '';
  if (!id || id.length > 200 || !/^\d{10}$/.test(timestamp) || signatures.length > 2048
    || Math.abs(now / 1000 - Number(timestamp)) > 300 || !secret.startsWith('whsec_')) return false;
  try {
    const key = await crypto.subtle.importKey('raw', Uint8Array.from(atob(secret.slice(6)), c => c.charCodeAt(0)), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']);
    const content = new TextEncoder().encode(`${id}.${timestamp}.${raw}`);
    for (const signature of signatures.split(' ')) {
      const [version, encoded] = signature.split(',');
      if (version === 'v1' && encoded && await crypto.subtle.verify('HMAC', key, Uint8Array.from(atob(encoded), c => c.charCodeAt(0)), content)) return true;
    }
  } catch { return false; }
  return false;
}

function address(value: unknown): string {
  if (typeof value !== 'string' || /[\r\n]/.test(value) || value.length > 320) return '';
  const match = value.match(/<([^<>]+)>$/);
  const email = (match?.[1] || value).trim().toLowerCase();
  return /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9.-]+\.[a-z]{2,}$/i.test(email) ? email : '';
}

export function inboundRecipientAllowed(value: unknown): boolean {
  return Array.isArray(value) && value.some(item => ALIASES.has(address(item)));
}

function base64(content: Uint8Array) {
  let binary = '';
  for (let i = 0; i < content.length; i += 8192) binary += String.fromCharCode(...content.subarray(i, i + 8192));
  return btoa(binary);
}

function attachmentUrl(value: unknown) {
  if (typeof value !== 'string') throw new ForwardError('invalid_attachment_url', 422, true);
  const url = new URL(value);
  // URLs come only from the authenticated Resend attachment API, never webhook content.
  if (url.protocol !== 'https:' || url.username || url.password || url.port
    || !(url.hostname === 'cdn.resend.app' || /(^|\.)resend\.com$/.test(url.hostname) || /\.amazonaws\.com$/.test(url.hostname))) {
    throw new ForwardError('invalid_attachment_host', 422, true);
  }
  return url.href;
}

export interface ForwardStore {
  claim(id: string, token: string, now: number): Promise<'claimed' | 'sent' | 'busy' | 'blocked'>;
  finish(id: string, token: string, providerId: string): Promise<void>;
  fail(id: string, token: string, code: string, terminal: boolean): Promise<void>;
}

/** Compare-and-set lease plus a stable receipt survives concurrent and late webhook retries. */
export function createForwardStore(client: any): ForwardStore {
  const table = () => client.from('tok_inbound_forward_receipts');
  return {
    async claim(id, token, now) {
      const iso = new Date(now).toISOString();
      const { error: insertError } = await table().upsert({ received_id: id, first_attempt_at: iso, lease_until: iso }, { onConflict: 'received_id', ignoreDuplicates: true });
      if (insertError) throw new ForwardError('receipt_insert_failed', 503);
      const { data: row, error } = await table().select('status,first_attempt_at,lease_until,lease_token').eq('received_id', id).single();
      if (error || !row) throw new ForwardError('receipt_read_failed', 503);
      if (row.status === 'sent') return 'sent';
      if (row.status === 'blocked') return 'blocked';
      // The provider retains idempotency keys for 24 hours. Never resend ambiguous old operations.
      if (now - Date.parse(row.first_attempt_at) >= RETRY_WINDOW_MS) {
        const { error: blockError } = await table().update({ status: 'blocked', last_error_code: 'manual_reconciliation_required', updated_at: iso })
          .eq('received_id', id).eq('lease_token', row.lease_token).neq('status', 'sent').lte('lease_until', iso);
        if (blockError) throw new ForwardError('receipt_block_failed', 503);
        return 'blocked';
      }
      const { data, error: claimError } = await table().update({ status: 'sending', lease_token: token, lease_until: new Date(now + LEASE_MS).toISOString(), updated_at: iso })
        .eq('received_id', id).eq('lease_token', row.lease_token).in('status', ['pending', 'sending']).lte('lease_until', iso).select('received_id');
      if (claimError) throw new ForwardError('receipt_claim_failed', 503);
      return data?.length === 1 ? 'claimed' : 'busy';
    },
    async finish(id, token, providerId) {
      const { data, error } = await table().update({ status: 'sent', provider_message_id: providerId, last_error_code: null, updated_at: new Date().toISOString() })
        .eq('received_id', id).eq('lease_token', token).eq('status', 'sending').select('received_id');
      if (error || data?.length !== 1) throw new ForwardError('receipt_finish_failed', 503);
    },
    async fail(id, token, code, terminal) {
      const { error } = await table().update({ status: terminal ? 'blocked' : 'pending', last_error_code: code, lease_until: new Date().toISOString(), updated_at: new Date().toISOString() })
        .eq('received_id', id).eq('lease_token', token).eq('status', 'sending');
      if (error) throw new ForwardError('receipt_fail_failed', 503);
    },
  };
}

export async function forwardInboundEvent(eventValue: unknown, input: { apiKey: string; store: ForwardStore; fetchImpl?: typeof fetch; now?: number }) {
  const event = record(eventValue);
  if (event.type !== 'email.received') return 'ignored';
  const data = record(event.data);
  if (!UUID.test(data.email_id || '')) throw new ForwardError('invalid_received_id', 400);
  if (!inboundRecipientAllowed(data.to)) return 'ignored';
  const id = data.email_id as string;
  const token = crypto.randomUUID();
  const claim = await input.store.claim(id, token, input.now ?? Date.now());
  if (claim === 'sent') return 'duplicate';
  if (claim !== 'claimed') throw new ForwardError(claim === 'blocked' ? 'manual_reconciliation_required' : 'receipt_busy', 503);
  const request = input.fetchImpl || fetch;
  const signal = AbortSignal.timeout(45_000);
  const api = async (path: string, init: RequestInit = {}) => {
    const response = await request(`https://api.resend.com${path}`, { ...init, signal, redirect: 'error', headers: { Authorization: `Bearer ${input.apiKey}`, 'Content-Type': 'application/json', ...init.headers } });
    try { return record(JSON.parse(new TextDecoder().decode(await bytes(response, MAX_JSON)))); }
    catch (error) { if (error instanceof ForwardError) throw error; throw new ForwardError('invalid_provider_json'); }
  };
  try {
    const email = await api(`/emails/receiving/${id}?html_format=cid`);
    if (email.id !== id || !inboundRecipientAllowed(email.to)) throw new ForwardError('received_email_mismatch', 422, true);
    const headers = Object.fromEntries(Object.entries(record(email.headers)).map(([key, value]) => [key.toLowerCase(), value]));
    // Do not reject mail merely sent by the destination: this is also the user's normal test/reply path.
    if (headers['x-tok-forwarded'] || String(headers['x-loop'] || '').toLowerCase() === DESTINATION) {
      await input.store.fail(id, token, 'forward_loop', true);
      return 'ignored';
    }
    const sender = address(email.from);
    if (!sender) throw new ForwardError('invalid_original_sender', 422, true);
    const attachmentList = await api(`/emails/receiving/${id}/attachments?limit=${MAX_ATTACHMENTS}`);
    if (!Array.isArray(attachmentList.data) || attachmentList.has_more || attachmentList.data.length > MAX_ATTACHMENTS) throw new ForwardError('attachment_count_limit', 422, true);
    const attachments: RecordValue[] = [];
    let totalBytes = 0;
    for (const rawAttachment of [...attachmentList.data].sort((a, b) => String(a.id).localeCompare(String(b.id)))) {
      const attachment = record(rawAttachment);
      if (!Number.isSafeInteger(attachment.size) || attachment.size < 0 || attachment.size > MAX_FILES - totalBytes) throw new ForwardError('attachment_size_limit', 422, true);
      const response = await request(attachmentUrl(attachment.download_url), { signal, redirect: 'error' });
      const content = await bytes(response, MAX_FILES - totalBytes);
      totalBytes += content.byteLength;
      attachments.push({ filename: String(attachment.filename || 'piece-jointe').replace(/[\r\n\\/]/g, '_').slice(0, 200), content: base64(content),
        content_type: typeof attachment.content_type === 'string' ? attachment.content_type : undefined,
        content_id: typeof attachment.content_id === 'string' ? attachment.content_id : undefined });
    }
    const prefix = `Message reçu par TOK\nDe : ${sender}\nÀ : ${(email.to as unknown[]).map(address).filter(Boolean).join(', ')}\n\n`;
    const htmlHeader = prefix.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
    const result = await api('/emails', { method: 'POST', headers: { 'Idempotency-Key': `tok-inbound-forward/${id}` }, body: JSON.stringify({
      from: 'TOK <noreply@thetok.ch>', to: [DESTINATION], reply_to: sender,
      subject: `Fwd: ${String(email.subject || '(sans objet)').replace(/[\r\n]/g, ' ').slice(0, 900)}`,
      text: prefix + String(email.text || 'Le message original est disponible dans la version HTML.'),
      html: typeof email.html === 'string' && email.html ? `<pre>${htmlHeader}</pre>${email.html}` : undefined,
      attachments,
      headers: { 'X-TOK-Forwarded': id, 'X-Loop': DESTINATION, 'Auto-Submitted': 'auto-forwarded' },
    }) });
    if (!UUID.test(result.id || '')) throw new ForwardError('missing_provider_message_id');
    await input.store.finish(id, token, result.id);
    return 'forwarded';
  } catch (error) {
    const safe = error instanceof ForwardError ? error : new ForwardError('provider_request_failed');
    await input.store.fail(id, token, safe.code, safe.terminal);
    throw safe;
  }
}
