import { pathToFileURL } from 'node:url';
import mutationPolicy from './contracts/tok-connect-public-mutations.json' with { type: 'json' };

const ORIGIN = 'https://www.thetok.ch';
const ISSUER = `${ORIGIN}/oauth`;
const VERSION = '2025-11-25';
const CLIENT_MUTATIONS = ['tok_book_table', 'tok_cancel_my_reservation', 'tok_checkout_customer_cart', 'tok_cancel_cart_payment_attempt'];
const REVIEWED_MUTATIONS = mutationPolicy.mutation_names;
const MARKETING_READS = ['tok_list_restaurant_marketing_references', 'tok_list_restaurant_marketing_assets'];
const MARKETING_MUTATIONS = ['tok_generate_restaurant_marketing_visual', 'tok_generate_restaurant_campaign_draft', 'tok_generate_restaurant_dish_photo', 'tok_attach_restaurant_dish_photo'];
const MARKETING_TOOLS = [...MARKETING_READS, ...MARKETING_MUTATIONS];

/**
 * Anonymous checks only: never accepts credentials or invokes a business write.
 * installedToolNames, when supplied, must be canonical MCP names actually
 * observed in the host's installed catalogue, not copied from tools/list.
 */
export async function runTokConnectSmoke({ fetchImpl = fetch, installedToolNames } = {}) {
  const checks = [];
  const marketing = {
    serverMissingTools: null,
    serverCatalogue: { status: 'not_verified', reason: 'tools_list_not_loaded' },
    installedCatalogue: { status: 'not_verified', reason: 'installed_tool_names_not_supplied' },
  };
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

  await check('protected-resource-and-oauth', async () => {
    const resource = await request(`${ORIGIN}/.well-known/oauth-protected-resource`);
    require(resource.resource === `${ORIGIN}/mcp`);
    require(resource.authorization_servers?.length === 1 && resource.authorization_servers[0] === ISSUER);
    require(JSON.stringify(resource.scopes_supported) === JSON.stringify(['tok']));
    // Pin the issuer rather than following an arbitrary URL from discovery.
    const oauth = await request(`${ORIGIN}/.well-known/oauth-authorization-server/oauth`);
    require(oauth.issuer === ISSUER);
    require(oauth.authorization_endpoint === `${ISSUER}/authorize`);
    require(oauth.token_endpoint === `${ISSUER}/token`);
    require(oauth.registration_endpoint === `${ISSUER}/register`);
    require(oauth.code_challenge_methods_supported?.includes('S256'));
  });
  await check('initialize', async () => {
    const { result } = await rpc('initialize', { protocolVersion: VERSION, capabilities: {}, clientInfo: { name: 'tok-connect-read-only-smoke', version: '1.0.0' } });
    require(result?.protocolVersion === VERSION && result?.capabilities?.tools);
  });
  let tools = [];
  await check('tool-catalogue', async () => {
    const { result } = await rpc('tools/list');
    require(Array.isArray(result?.tools) && result.tools.every((tool) => tool && typeof tool.name === 'string'));
    tools = result.tools;
    marketing.serverCatalogue = { status: 'loaded' };
    require(tools.length > 0 && new Set(tools.map((tool) => tool.name)).size === tools.length);
    require(['discover_restaurants', 'get_restaurant_details', 'open_application_sandbox', 'tok_list_capabilities'].every((name) => tools.some((tool) => tool.name === name)));
    require(tools.every((tool) => tool.inputSchema?.type === 'object' && typeof tool.annotations?.readOnlyHint === 'boolean'));
    require(CLIENT_MUTATIONS.every((name) => tools.some((tool) => tool.name === name)));
    require(tools.every((tool) => tool._meta?.['openai/visibility'] !== 'private' || (
      !tool._meta?.ui?.resourceUri && !tool._meta?.['openai/outputTemplate']
    )));
    require(tools.every((tool) => tool.annotations.readOnlyHint === true || (
      REVIEWED_MUTATIONS.includes(tool.name)
      && tool.inputSchema.required?.includes('confirmed_by_user')
      && tool.inputSchema.required?.includes('idempotency_key')
    )));
    require(CLIENT_MUTATIONS.every((name) => {
      const tool = tools.find((entry) => entry.name === name);
      return tool?._meta?.ui?.visibility?.includes('model')
        && tool._meta.ui.visibility.includes('app')
        && tool._meta?.['openai/visibility'] !== 'private';
    }));
  });
  await check('marketing-tool-catalogue', async () => {
    // An unavailable or malformed response does not prove that tools are absent.
    require(marketing.serverCatalogue.status === 'loaded');
    marketing.serverMissingTools = MARKETING_TOOLS.filter((name) => !tools.some((tool) => tool.name === name));
    require(marketing.serverMissingTools.length === 0);
    require(MARKETING_TOOLS.every((name) => {
      const tool = tools.find((entry) => entry.name === name);
      // MCP Apps defaults omitted visibility to both audiences. Explicitly
      // private or app-only tools cannot support a model-led Studio journey.
      const visibility = tool._meta?.ui?.visibility ?? ['model', 'app'];
      return tool._meta?.['openai/visibility'] !== 'private'
        && Array.isArray(visibility) && visibility.includes('model') && visibility.includes('app')
        && tool.inputSchema?.type === 'object'
        && tool.inputSchema.additionalProperties === false
        && tool.inputSchema.required?.includes('restaurant_id')
        && tool.inputSchema.properties?.restaurant_id?.type === 'string'
        && tool.inputSchema.properties.restaurant_id.format === 'uuid';
    }));
    require(MARKETING_READS.every((name) => tools.find((tool) => tool.name === name).annotations?.readOnlyHint === true));
    require(MARKETING_MUTATIONS.every((name) => {
      const tool = tools.find((entry) => entry.name === name);
      const schema = tool.inputSchema;
      return tool.annotations?.readOnlyHint === false
        && schema.required?.includes('confirmed_by_user') && schema.required.includes('idempotency_key')
        && schema.properties?.confirmed_by_user?.type === 'boolean' && schema.properties.confirmed_by_user.const === true
        && schema.properties?.idempotency_key?.type === 'string'
        && schema.properties.idempotency_key.minLength === 8 && schema.properties.idempotency_key.maxLength === 120
        && schema.properties.idempotency_key.pattern === '^[A-Za-z0-9:_-]+$';
    }));
    const visual = tools.find((tool) => tool.name === 'tok_generate_restaurant_marketing_visual');
    const references = visual.inputSchema.properties.reference_media_ids;
    require(visual.inputSchema.required.includes('reference_media_ids')
      && references?.type === 'array' && references.minItems === 1 && references.maxItems === 4
      && references.uniqueItems === true && references.items?.type === 'string' && references.items.format === 'uuid');
  });
  if (installedToolNames !== undefined) {
    await check('host-marketing-tool-catalogue', async () => {
      marketing.installedCatalogue = { status: 'failed', reason: 'installed_tool_names_invalid' };
      require(Array.isArray(installedToolNames) && installedToolNames.every((name) => typeof name === 'string'));
      const missingTools = MARKETING_TOOLS.filter((name) => !installedToolNames.includes(name));
      marketing.installedCatalogue = { status: missingTools.length ? 'failed' : 'passed', missingTools };
      require(missingTools.length === 0);
    });
  }
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
    marketing,
    notValidated: [
      'ChatGPT OAuth consent and refresh', 'Authenticated widget interactions',
      'Reservation or order persistence and idempotency', 'Stripe Test checkout and signed webhook reconciliation',
      ...(installedToolNames === undefined ? ['Marketing tools loaded by the ChatGPT host (installedToolNames not supplied)'] : []),
      'Paid marketing generation, credit debit and stored image output',
    ],
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const report = await runTokConnectSmoke();
  console.log(JSON.stringify(report, null, 2));
  process.exitCode = report.passed ? 0 : 1;
}
