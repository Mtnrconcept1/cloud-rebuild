import { webcrypto } from 'node:crypto';
import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { describe, expect, it, vi } from 'vitest';
import { forwardInboundEvent, inboundRecipientAllowed, verifyInboundSignature, type ForwardStore } from '../../supabase/functions/_shared/resend-inbound-forward';

vi.stubGlobal('crypto', webcrypto);
const ID = '11111111-1111-4111-8111-111111111111';
const SENT_ID = '22222222-2222-4222-8222-222222222222';
const NOW = Date.now();
const event = { type: 'email.received', data: { email_id: ID, to: ['contact@thetok.ch'] } };
const message = { id: ID, from: 'Alice <alice@example.com>', to: ['contact@thetok.ch'], subject: 'Demande', text: 'Bonjour', html: '<p>Bonjour</p>', headers: {} };
function store(): ForwardStore & { claimed: boolean; sent: boolean } {
  return { claimed: false, sent: false,
    async claim() { if (this.sent) return 'sent'; if (this.claimed) return 'busy'; this.claimed = true; return 'claimed'; },
    async finish() { this.sent = true; }, async fail() { this.claimed = false; },
  };
}
function provider(email = message, attachments: any[] = []) {
  return vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    const path = String(url);
    if (path.endsWith(`/receiving/${ID}?html_format=cid`)) return Response.json(email);
    if (path.includes('/attachments?')) return Response.json({ data: attachments, has_more: false });
    if (path.startsWith('https://attachments.resend.com/')) return new Response('file-content');
    if (init?.method === 'POST') return Response.json({ id: SENT_ID });
    throw new Error('Unexpected URL');
  });
}
describe('signed inbound forwarding', () => {
  it('authenticates exact bytes and rejects altered, old, future and missing signatures', async () => {
    const secretBytes = new TextEncoder().encode('a-test-signing-key-with-sufficient-length');
    const secret = `whsec_${Buffer.from(secretBytes).toString('base64')}`;
    const raw = JSON.stringify(event); const timestamp = String(Math.floor(NOW / 1000));
    const key = await crypto.subtle.importKey('raw', secretBytes, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    const signed = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`msg_test.${timestamp}.${raw}`));
    const headers = new Headers({ 'svix-id': 'msg_test', 'svix-timestamp': timestamp, 'svix-signature': `v1,${Buffer.from(signed).toString('base64')}` });
    expect(await verifyInboundSignature(raw, headers, secret, NOW)).toBe(true);
    expect(await verifyInboundSignature(raw + ' ', headers, secret, NOW)).toBe(false);
    expect(await verifyInboundSignature(raw, headers, secret, NOW + 301_000)).toBe(false);
    expect(await verifyInboundSignature(raw, headers, secret, NOW - 301_000)).toBe(false);
    expect(await verifyInboundSignature(raw, new Headers(), secret, NOW)).toBe(false);
  });
  it('accepts only known business aliases with an exact domain', () => {
    expect(inboundRecipientAllowed(['TOK <CONTACT@thetok.ch>'])).toBe(true);
    expect(inboundRecipientAllowed(['support@thetok.ch', 'privacy@thetok.ch'])).toBe(true);
    for (const alias of ['contact@thetok.ch.evil.test', 'contact@marketing.thetok.ch', 'dmarc@thetok.ch', 'unknown@thetok.ch', 'contact@thetok.ch\r\nBcc:x@y.ch']) expect(inboundRecipientAllowed([alias])).toBe(false);
  });
  it('preserves text, HTML, reply address and attachments with a fixed destination and stable idempotency key', async () => {
    const db = store();
    const fetchImpl = provider(message, [{ id: 'att', filename: 'menu.pdf', size: 12, download_url: 'https://attachments.resend.com/menu', content_type: 'application/pdf', content_id: 'menu' }]);
    expect(await forwardInboundEvent(event, { apiKey: 'test', store: db, fetchImpl })).toBe('forwarded');
    const sent = fetchImpl.mock.calls.find(([, init]) => init?.method === 'POST')!;
    const body = JSON.parse(String(sent[1]?.body));
    expect(body.to).toEqual(['rbarman@hotmail.ch']); expect(body.reply_to).toBe('alice@example.com');
    expect(body.text).toContain('Bonjour'); expect(body.html).toContain('<p>Bonjour</p>');
    expect(body.attachments[0]).toMatchObject({ filename: 'menu.pdf', content: Buffer.from('file-content').toString('base64'), content_id: 'menu' });
    expect(sent[1]?.headers).toHaveProperty('Idempotency-Key', `tok-inbound-forward/${ID}`);
    expect(body.headers['X-TOK-Forwarded']).toBe(ID); expect(db.sent).toBe(true);
  });
  it('sends once for concurrent events and never repeats a completed receipt', async () => {
    const db = store(); const fetchImpl = provider();
    const results = await Promise.allSettled([forwardInboundEvent(event, { apiKey: 'test', store: db, fetchImpl }), forwardInboundEvent(event, { apiKey: 'test', store: db, fetchImpl })]);
    expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1);
    expect(await forwardInboundEvent(event, { apiKey: 'test', store: db, fetchImpl })).toBe('duplicate');
    expect(fetchImpl.mock.calls.filter(([, init]) => init?.method === 'POST')).toHaveLength(1);
  });
  it('requests CID HTML and preserves inline image identifiers without embedding data URI copies', async () => {
    const fetchImpl = provider({ ...message, html: '<p><img src="cid:menu"></p>' }, [{ id: 'image', filename: 'menu.png', size: 12, download_url: 'https://attachments.resend.com/menu', content_id: 'menu', content_type: 'image/png' }]);
    await forwardInboundEvent(event, { apiKey: 'test', store: store(), fetchImpl });
    expect(String(fetchImpl.mock.calls[0][0])).toContain('?html_format=cid');
    const post = fetchImpl.mock.calls.find(([, init]) => init?.method === 'POST')!;
    const body = JSON.parse(String(post[1]?.body));
    expect(body.html).toContain('src="cid:menu"'); expect(body.attachments[0].content_id).toBe('menu');
  });
  it('retries an ambiguous provider failure with the same payload and idempotency key', async () => {
    const db = store(); const fetchImpl = provider(); let first = true;
    const original = fetchImpl.getMockImplementation()!;
    fetchImpl.mockImplementation(async (...args) => { if (args[1]?.method === 'POST' && first) { first = false; throw new Error('network timeout'); } return original(...args); });
    await expect(forwardInboundEvent(event, { apiKey: 'test', store: db, fetchImpl })).rejects.toMatchObject({ code: 'provider_request_failed' });
    expect(await forwardInboundEvent(event, { apiKey: 'test', store: db, fetchImpl })).toBe('forwarded');
    const posts = fetchImpl.mock.calls.filter(([, init]) => init?.method === 'POST');
    expect(posts[0][1]?.body).toBe(posts[1][1]?.body); expect(posts[0][1]?.headers).toEqual(posts[1][1]?.headers);
  });
  it('blocks loops and mismatched recipients while accepting a normal user test', async () => {
    const loop = provider({ ...message, headers: { 'X-TOK-Forwarded': ID } });
    expect(await forwardInboundEvent(event, { apiKey: 'test', store: store(), fetchImpl: loop })).toBe('ignored');
    expect(loop.mock.calls.filter(([, init]) => init?.method === 'POST')).toHaveLength(0);
    await expect(forwardInboundEvent(event, { apiKey: 'test', store: store(), fetchImpl: provider({ ...message, to: ['somebody@example.com'] }) })).rejects.toMatchObject({ code: 'received_email_mismatch' });
    expect(await forwardInboundEvent(event, { apiKey: 'test', store: store(), fetchImpl: provider({ ...message, from: 'rbarman@hotmail.ch' }) })).toBe('forwarded');
  });
  it('retries the rate-limited call in place, respects Retry-After and keeps the POST idempotent', async () => {
    const fetchImpl = provider(); const original = fetchImpl.getMockImplementation()!; let first = true;
    fetchImpl.mockImplementation(async (...args) => {
      if (args[1]?.method === 'POST' && first) { first = false; return new Response('{}', { status: 429, headers: { 'retry-after': '2' } }); }
      return original(...args);
    });
    const waitImpl = vi.fn(async () => {});
    expect(await forwardInboundEvent(event, { apiKey: 'test', store: store(), fetchImpl, waitImpl })).toBe('forwarded');
    expect(waitImpl.mock.calls[0][0]).toBe(2000);
    const posts = fetchImpl.mock.calls.filter(([, init]) => init?.method === 'POST');
    expect(posts).toHaveLength(2); expect(posts[0][1]?.body).toBe(posts[1][1]?.body); expect(posts[0][1]?.headers).toEqual(posts[1][1]?.headers);
    expect(fetchImpl.mock.calls.filter(([url]) => String(url).includes('?html_format=cid'))).toHaveLength(1);
    const longWait = vi.fn(async () => new Response('{}', { status: 429, headers: { 'retry-after': '60' } }));
    await expect(forwardInboundEvent(event, { apiKey: 'test', store: store(), fetchImpl: longWait, waitImpl })).rejects.toMatchObject({ code: 'provider_http_429' });
    expect(longWait).toHaveBeenCalledTimes(1); expect(waitImpl).toHaveBeenCalledTimes(1);
  });
  it('refuses unsafe file hosts, oversized files, old ambiguous operations and provider failures', async () => {
    await expect(forwardInboundEvent(event, { apiKey: 'test', store: store(), fetchImpl: provider(message, [{ id: '1', size: 1, download_url: 'http://127.0.0.1/file' }]) })).rejects.toMatchObject({ code: 'invalid_attachment_host', terminal: true });
    await expect(forwardInboundEvent(event, { apiKey: 'test', store: store(), fetchImpl: provider(message, [{ id: '1', size: 13 * 1024 * 1024 }]) })).rejects.toMatchObject({ code: 'attachment_size_limit', terminal: true });
    const blocked = store(); blocked.claim = async () => 'blocked'; const fetchImpl = provider();
    await expect(forwardInboundEvent(event, { apiKey: 'test', store: blocked, fetchImpl })).rejects.toMatchObject({ code: 'manual_reconciliation_required' }); expect(fetchImpl).not.toHaveBeenCalled();
    await expect(forwardInboundEvent(event, { apiKey: 'test', store: store(), fetchImpl: vi.fn(async () => new Response('private provider error', { status: 403 })) })).rejects.toMatchObject({ code: 'provider_http_403' });
  });
  it('ignores unrelated events and aliases before retrieving content', async () => {
    const fetchImpl = provider();
    expect(await forwardInboundEvent({ type: 'email.sent' }, { apiKey: 'test', store: store(), fetchImpl })).toBe('ignored');
    expect(await forwardInboundEvent({ ...event, data: { ...event.data, to: ['dmarc@thetok.ch'] } }, { apiKey: 'test', store: store(), fetchImpl })).toBe('ignored'); expect(fetchImpl).not.toHaveBeenCalled();
  });
  it('propagates the signing secret only to production server-side sync and never prints it', () => {
    const dir = mkdtempSync(join(tmpdir(), 'tok-inbound-'));
    try {
      const file = join(dir, 'functions.env');
      const output = execFileSync(process.execPath, [resolve('scripts/write-supabase-secrets-env.mjs'), `--out=${file}`], { env: { PATH: process.env.PATH, RESEND_INBOUND_WEBHOOK_SECRET: 'whsec_test-only-value' }, encoding: 'utf8' });
      expect(readFileSync(file, 'utf8')).toContain('RESEND_INBOUND_WEBHOOK_SECRET=whsec_test-only-value'); expect(output).not.toContain('whsec_test-only-value');
      expect(readFileSync(resolve('.github/workflows/deploy-production.yml'), 'utf8')).toContain('RESEND_INBOUND_WEBHOOK_SECRET: ${{ secrets.RESEND_INBOUND_WEBHOOK_SECRET }}');
      expect(readFileSync(resolve('scripts/write-commercial-demo-secrets-env.mjs'), 'utf8')).not.toContain('RESEND_INBOUND_WEBHOOK_SECRET');
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
});
