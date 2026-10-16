import { describe, expect, it } from 'vitest';
import { runTokConnectSmoke } from '../../scripts/tok-connect-smoke.mjs';

const issuer = 'https://wwcrtyoueexyxkkikaos.supabase.co/auth/v1';
const uri = 'ui://tok-connect/test.html';

function fixture(options: { wrongIssuer?: boolean; leakedAccount?: boolean; unsafeSandbox?: boolean; rpcError?: boolean } = {}) {
  const calls: Array<{ url: string; body: Record<string, unknown> | null; init: RequestInit }> = [];
  const fetchImpl = async (url: string, init: RequestInit) => {
    const body = init.body ? JSON.parse(String(init.body)) : null;
    calls.push({ url, body, init });
    let payload: unknown;
    if (url.endsWith('oauth-protected-resource')) payload = { resource: 'https://www.thetok.ch/mcp', authorization_servers: [options.wrongIssuer ? 'https://untrusted.example' : issuer], scopes_supported: ['openid', 'email', 'profile'] };
    else if (url.endsWith('openid-configuration')) payload = { issuer, authorization_endpoint: `${issuer}/oauth/authorize`, token_endpoint: `${issuer}/oauth/token`, registration_endpoint: `${issuer}/oauth/clients/register`, code_challenge_methods_supported: ['S256'] };
    else if (body.method === 'initialize') payload = { result: { protocolVersion: '2025-11-25', capabilities: { tools: {} } } };
    else if (body.method === 'tools/list') payload = options.rpcError ? { error: { code: -32603, message: 'secret-provider-response' } } : { result: { tools: ['discover_restaurants', 'get_restaurant_details', 'open_application_sandbox', 'tok_list_capabilities'].map((name) => ({ name, inputSchema: { type: 'object' }, annotations: { readOnlyHint: true }, _meta: { ui: { resourceUri: uri } } })) } };
    else if (body.method === 'resources/read') payload = { result: { contents: [{ uri, mimeType: 'text/html;profile=mcp-app', text: '<!doctype html><title>TOK</title>' }] } };
    else if (body.params.name === 'tok_list_capabilities') payload = { result: options.leakedAccount ? { structuredContent: { ok: true } } : { isError: true, _meta: { 'mcp/www_authenticate': ['Bearer'] } } };
    else payload = { result: { structuredContent: { sandbox: { risk_mode: 'safe_preview', modules: [{ mutation_allowed: options.unsafeSandbox === true }] } } } };
    return new Response(JSON.stringify(payload), { status: 200, headers: { 'content-type': 'application/json' } });
  };
  return { calls, fetchImpl };
}

describe('diagnostic TOK Connect sans écritures', () => {
  it('valide les contrats sans credentials, enregistrement OAuth ni outil transactionnel', async () => {
    const { calls, fetchImpl } = fixture();
    const report = await runTokConnectSmoke({ fetchImpl });
    expect(report.passed).toBe(true);
    expect(report.checks).toHaveLength(6);
    expect(report.notValidated).toHaveLength(4);
    expect(calls.every(({ init }) => init.redirect === 'error' && !('authorization' in (init.headers || {})))).toBe(true);
    expect(calls.filter(({ body }) => body?.method === 'tools/call').map(({ body }) => (body?.params as { name: string }).name)).toEqual(['tok_list_capabilities', 'open_application_sandbox']);
    expect(calls.some(({ url }) => /register$|token$|authorize$/.test(url))).toBe(false);
  });
  it('refuse un serveur OAuth substitué sans contacter son URL', async () => {
    const { calls, fetchImpl } = fixture({ wrongIssuer: true });
    const report = await runTokConnectSmoke({ fetchImpl });
    expect(report.passed).toBe(false);
    expect(calls.some(({ url }) => url.includes('untrusted'))).toBe(false);
  });
  it.each([{ leakedAccount: true }, { unsafeSandbox: true }, { rpcError: true }])('échoue sur une régression critique %j et ne reproduit pas les réponses privées', async (options) => {
    const report = await runTokConnectSmoke({ fetchImpl: fixture(options).fetchImpl });
    expect(report.passed).toBe(false);
    expect(JSON.stringify(report)).not.toContain('secret-provider-response');
  });
});
