import { pathToFileURL } from 'node:url';

const ORIGIN = 'https://www.thetok.ch';
const ISSUER = 'https://wwcrtyoueexyxkkikaos.supabase.co/auth/v1';
const VERSION = '2025-11-25';

/** Anonymous checks only: never accepts credentials or invokes a business write. */
export async function runTokConnectSmoke({ fetchImpl = fetch } = {}) {
  const checks = [];
  let sequence = 0;
  const request = async (url, rpc) => {
    const response = await fetchImpl(url, {
      method: rpc ? 'POST' : 'GET',
      redirect: 'error',
      headers: {
        accept: 'application/json, text/event-stream',
        ...(rpc ? { 'content-type': 'application/json', 'mcp-protocol-version': VERSION } : {}),
      },
      ...(rpc ? { body: JSON.stringify({ jsonrpc: '2.0', id: ++sequence, ...rpc }) } : {}),
      signal: AbortSignal.timeout(20_000),
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const body = await response.json();
    if (body.error) throw new Error(`JSON-RPC ${body.error.code}`);
    return body;
  };
  const rpc = (method, params = {}) => request(`${ORIGIN}/mcp`, { method, params });
  const check = async (name, action) => {
    try {
      await action();
      checks.push({ name, status: 'passed' });
    } catch (error) {
      // No response bodies, URLs with query strings, tokens or provider error text.
      checks.push({ name, status: 'failed', error: /^(HTTP \d{3}|JSON-RPC -?\d+)$/.test(error.message) ? error.message : 'contract_or_network_error' });
    }
  };
  const require = (condition) => { if (!condition) throw new Error('contract'); };

  await check('protected-resource-and-oidc', async () => {
    const resource = await request(`${ORIGIN}/.well-known/oauth-protected-resource`);
    require(resource.resource === `${ORIGIN}/mcp`);
    require(resource.authorization_servers?.length === 1 && resource.authorization_servers[0] === ISSUER);
    require(['openid', 'email', 'profile'].every((scope) => resource.scopes_supported?.includes(scope)));
    // Pin the issuer rather than following an arbitrary URL from discovery.
    const oidc = await request(`${ISSUER}/.well-known/openid-configuration`);
    require(oidc.issuer === ISSUER);
    require(oidc.authorization_endpoint === `${ISSUER}/oauth/authorize`);
    require(oidc.token_endpoint === `${ISSUER}/oauth/token`);
    require(oidc.registration_endpoint === `${ISSUER}/oauth/clients/register`);
    require(oidc.code_challenge_methods_supported?.includes('S256'));
  });
  await check('initialize', async () => {
    const { result } = await rpc('initialize', { protocolVersion: VERSION, capabilities: {}, clientInfo: { name: 'tok-connect-read-only-smoke', version: '1.0.0' } });
    require(result?.protocolVersion === VERSION && result?.capabilities?.tools);
  });
  let tools = [];
  await check('tool-catalogue', async () => {
    const { result } = await rpc('tools/list');
    tools = result?.tools || [];
    require(tools.length > 0 && new Set(tools.map((tool) => tool.name)).size === tools.length);
    require(['discover_restaurants', 'get_restaurant_details', 'open_application_sandbox', 'tok_list_capabilities'].every((name) => tools.some((tool) => tool.name === name)));
    require(tools.every((tool) => tool.inputSchema?.type === 'object' && typeof tool.annotations?.readOnlyHint === 'boolean'));
  });
  await check('widget-resource', async () => {
    const tool = tools.find((entry) => entry.name === 'discover_restaurants');
    const uri = tool?._meta?.ui?.resourceUri || tool?._meta?.['openai/outputTemplate'];
    require(typeof uri === 'string' && uri.startsWith('ui://'));
    const { result } = await rpc('resources/read', { uri });
    require(result?.contents?.some((item) => item.uri === uri && item.mimeType === 'text/html;profile=mcp-app' && item.text?.startsWith('<!doctype html>')));
  });
  await check('anonymous-account-access-refused', async () => {
    const { result } = await rpc('tools/call', { name: 'tok_list_capabilities', arguments: {} });
    require(result?.isError === true && result?._meta?.['mcp/www_authenticate']?.length > 0);
    require(!result?.structuredContent?.ok);
  });
  await check('sandbox-preview', async () => {
    const { result } = await rpc('tools/call', { name: 'open_application_sandbox', arguments: { request: 'Tester une réservation et une commande sans les confirmer', actor: 'client', risk_mode: 'safe_preview' } });
    const sandbox = result?.structuredContent?.sandbox;
    require(!result?.isError && sandbox?.risk_mode === 'safe_preview');
    require(sandbox?.modules?.length > 0 && sandbox.modules.every((module) => module.mutation_allowed === false));
  });
  return {
    endpoint: `${ORIGIN}/mcp`,
    scope: 'anonymous-read-and-preview-only',
    passed: checks.every((entry) => entry.status === 'passed'),
    checks,
    toolCount: tools.length,
    notValidated: ['ChatGPT OAuth consent and refresh', 'Authenticated widget interactions', 'Reservation or order persistence and idempotency', 'Stripe Test checkout and signed webhook reconciliation'],
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const report = await runTokConnectSmoke();
  console.log(JSON.stringify(report, null, 2));
  process.exitCode = report.passed ? 0 : 1;
}
