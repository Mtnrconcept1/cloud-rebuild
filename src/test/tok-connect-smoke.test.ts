import { describe, expect, it } from 'vitest';
import { runTokConnectSmoke } from '../../scripts/tok-connect-smoke.mjs';

const issuer = 'https://wwcrtyoueexyxkkikaos.supabase.co/auth/v1';
const uri = 'ui://tok-connect/test.html';
const marketingReads = ['tok_list_restaurant_marketing_references', 'tok_list_restaurant_marketing_assets'];
const marketingMutations = ['tok_generate_restaurant_marketing_visual', 'tok_generate_restaurant_campaign_draft', 'tok_generate_restaurant_dish_photo', 'tok_attach_restaurant_dish_photo'];
const marketingNames = [...marketingReads, ...marketingMutations];

type Schema = {
  type: string;
  required?: string[];
  properties?: Record<string, Schema>;
  items?: Schema;
  additionalProperties?: boolean;
  [key: string]: unknown;
};
type ToolFixture = {
  name: string;
  inputSchema: Schema;
  annotations: { readOnlyHint: boolean };
  _meta?: { ui?: { resourceUri?: string; visibility?: string[] }; 'openai/visibility'?: string };
};

function marketingTools(): ToolFixture[] {
  return marketingNames.map((name) => {
    const write = marketingMutations.includes(name);
    const visual = name === 'tok_generate_restaurant_marketing_visual';
    return {
      name,
      inputSchema: {
        type: 'object',
        required: ['restaurant_id', ...(write ? ['confirmed_by_user', 'idempotency_key'] : []), ...(visual ? ['reference_media_ids'] : [])],
        properties: {
          restaurant_id: { type: 'string', format: 'uuid' },
          ...(write ? {
            confirmed_by_user: { type: 'boolean', const: true },
            idempotency_key: { type: 'string', minLength: 8, maxLength: 120, pattern: '^[A-Za-z0-9:_-]+$' },
          } : {}),
          ...(visual ? { reference_media_ids: { type: 'array', minItems: 1, maxItems: 4, uniqueItems: true, items: { type: 'string', format: 'uuid' } } } : {}),
        },
        additionalProperties: false,
      },
      annotations: { readOnlyHint: !write },
      ...(write ? { _meta: { ui: { resourceUri: uri, visibility: ['model', 'app'] } } } : {}),
    };
  });
}

function fixture(options: {
  wrongIssuer?: boolean; leakedAccount?: boolean; unsafeSandbox?: boolean; rpcError?: boolean;
  genericMutation?: boolean; modelMutation?: boolean; privateWidget?: boolean;
  catalogueFailure?: 'network' | 'invalid';
  changeMarketingTools?: (tools: ToolFixture[]) => ToolFixture[];
} = {}) {
  const calls: Array<{ url: string; body: Record<string, unknown> | null; init: RequestInit }> = [];
  const studioTools = options.changeMarketingTools?.(marketingTools()) ?? marketingTools();
  const fetchImpl = async (url: string, init: RequestInit) => {
    const body = init.body ? JSON.parse(String(init.body)) : null;
    calls.push({ url, body, init });
    if (body?.method === 'tools/list' && options.catalogueFailure === 'network') throw new Error('secret-provider-response');
    if (body?.method === 'tools/list' && options.catalogueFailure === 'invalid') return Response.json({ result: { tools: {} } });
    let payload: unknown;
    if (url.endsWith('oauth-protected-resource')) payload = { resource: 'https://www.thetok.ch/mcp', authorization_servers: [options.wrongIssuer ? 'https://untrusted.example' : issuer], scopes_supported: ['openid', 'email', 'profile'] };
    else if (url.endsWith('openid-configuration')) payload = { issuer, authorization_endpoint: `${issuer}/oauth/authorize`, token_endpoint: `${issuer}/oauth/token`, registration_endpoint: `${issuer}/oauth/clients/register`, code_challenge_methods_supported: ['S256'] };
    else if (body.method === 'initialize') payload = { result: { protocolVersion: '2025-11-25', capabilities: { tools: {} } } };
    else if (body.method === 'tools/list') payload = options.rpcError ? { error: { code: -32603, message: 'secret-provider-response' } } : { result: { tools: [
      ...['discover_restaurants', 'get_restaurant_details', 'open_application_sandbox', 'tok_list_capabilities'].map((name) => ({ name, inputSchema: { type: 'object' }, annotations: { readOnlyHint: true }, _meta: { ui: { resourceUri: uri } } })),
      ...['tok_book_table', 'tok_cancel_my_reservation', 'tok_checkout_customer_cart', 'tok_cancel_cart_payment_attempt', ...(options.genericMutation ? ['tok_invoke_rpc'] : [])].map((name) => ({ name, inputSchema: { type: 'object', required: ['confirmed_by_user', 'idempotency_key'] }, annotations: { readOnlyHint: false }, _meta: { ui: { ...(options.privateWidget ? { resourceUri: uri } : {}), visibility: options.modelMutation ? ['app'] : ['model', 'app'] }, ...(options.privateWidget ? { 'openai/visibility': 'private' } : {}) } })),
      ...studioTools,
    ] } };
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
    expect(report.checks).toHaveLength(7);
    expect(report.marketing).toEqual({ serverMissingTools: [], serverCatalogue: { status: 'loaded' }, installedCatalogue: { status: 'not_verified', reason: 'installed_tool_names_not_supplied' } });
    expect(report.notValidated).toContain('Marketing tools loaded by the ChatGPT host (installedToolNames not supplied)');
    expect(report.notValidated).toContain('Paid marketing generation, credit debit and stored image output');
    expect(calls.every(({ init }) => {
      const headers = new Headers(init.headers);
      return init.redirect === 'error' && !headers.has('authorization') && !headers.has('apikey') && !headers.has('cookie');
    })).toBe(true);
    expect(calls.filter(({ body }) => body?.method === 'tools/call').map(({ body }) => (body?.params as { name: string }).name)).toEqual(['tok_list_capabilities', 'open_application_sandbox']);
    expect(calls.some(({ url }) => /register$|token$|authorize$/.test(url))).toBe(false);
  });
  it('refuse un serveur OAuth substitué sans contacter son URL', async () => {
    const { calls, fetchImpl } = fixture({ wrongIssuer: true });
    const report = await runTokConnectSmoke({ fetchImpl });
    expect(report.passed).toBe(false);
    expect(calls.some(({ url }) => url.includes('untrusted'))).toBe(false);
  });
  it.each([{ leakedAccount: true }, { unsafeSandbox: true }, { rpcError: true }, { genericMutation: true }, { modelMutation: true }, { privateWidget: true }])('échoue sur une régression critique %j et ne reproduit pas les réponses privées', async (options) => {
    const report = await runTokConnectSmoke({ fetchImpl: fixture(options).fetchImpl });
    expect(report.passed).toBe(false);
    expect(JSON.stringify(report)).not.toContain('secret-provider-response');
  });
  it.each([{ catalogueFailure: 'network' }, { catalogueFailure: 'invalid' }, { rpcError: true }] as const)('ne déclare aucun outil absent lorsque tools/list n’a pas pu être chargé : %j', async (options) => {
    const report = await runTokConnectSmoke({ fetchImpl: fixture(options).fetchImpl });
    expect(report.passed).toBe(false);
    expect(report.toolCount).toBe(0);
    expect(report.marketing.serverMissingTools).toBeNull();
    expect(report.marketing.serverCatalogue).toEqual({ status: 'not_verified', reason: 'tools_list_not_loaded' });
    expect(report.checks).toContainEqual(expect.objectContaining({ name: 'tool-catalogue', status: 'failed' }));
    expect(JSON.stringify(report)).not.toContain('secret-provider-response');
  });
  it('déclare les six outils absents quand un catalogue effectivement chargé ne contient aucun outil Studio', async () => {
    const report = await runTokConnectSmoke({ fetchImpl: fixture({ changeMarketingTools: () => [] }).fetchImpl });
    expect(report.passed).toBe(false);
    expect(report.toolCount).toBeGreaterThan(0);
    expect(report.marketing.serverCatalogue).toEqual({ status: 'loaded' });
    expect(report.marketing.serverMissingTools).toEqual(marketingNames);
    expect(report.checks).toContainEqual({ name: 'marketing-tool-catalogue', status: 'failed', error: 'contract_or_network_error' });
  });
  it.each(marketingNames)('détecte l’outil Studio absent du serveur : %s', async (name) => {
    const report = await runTokConnectSmoke({ fetchImpl: fixture({ changeMarketingTools: (tools) => tools.filter((tool) => tool.name !== name) }).fetchImpl });
    expect(report.passed).toBe(false);
    expect(report.marketing.serverCatalogue).toEqual({ status: 'loaded' });
    expect(report.marketing.serverMissingTools).toEqual([name]);
    expect(report.checks).toContainEqual({ name: 'marketing-tool-catalogue', status: 'failed', error: 'contract_or_network_error' });
  });
  it('distingue un serveur complet des six outils absents du catalogue réellement chargé', async () => {
    const { calls, fetchImpl } = fixture();
    const report = await runTokConnectSmoke({ fetchImpl, installedToolNames: ['discover_restaurants', 'tok_book_table'] });
    expect(report.passed).toBe(false);
    expect(report.marketing.serverMissingTools).toEqual([]);
    expect(report.marketing.installedCatalogue).toEqual({ status: 'failed', missingTools: marketingNames });
    expect(report.checks).toContainEqual({ name: 'marketing-tool-catalogue', status: 'passed' });
    expect(report.checks).toContainEqual({ name: 'host-marketing-tool-catalogue', status: 'failed', error: 'contract_or_network_error' });
    expect(calls.filter(({ body }) => body?.method === 'tools/call').map(({ body }) => (body?.params as { name: string }).name)).toEqual(['tok_list_capabilities', 'open_application_sandbox']);
  });
  it('confirme uniquement les noms effectivement fournis par le catalogue hôte', async () => {
    const report = await runTokConnectSmoke({ fetchImpl: fixture().fetchImpl, installedToolNames: [...marketingNames, 'discover_restaurants'] });
    expect(report.passed).toBe(true);
    expect(report.marketing.installedCatalogue).toEqual({ status: 'passed', missingTools: [] });
    expect(report.checks).toContainEqual({ name: 'host-marketing-tool-catalogue', status: 'passed' });
    expect(report.notValidated.some((reason: string) => reason.includes('installedToolNames not supplied'))).toBe(false);
    expect(report.notValidated).toContain('Paid marketing generation, credit debit and stored image output');
  });
  it('traite un catalogue hôte vide comme six outils manquants, sans l’inférer depuis le serveur', async () => {
    const report = await runTokConnectSmoke({ fetchImpl: fixture().fetchImpl, installedToolNames: [] });
    expect(report.passed).toBe(false);
    expect(report.marketing.installedCatalogue).toEqual({ status: 'failed', missingTools: marketingNames });
  });
  it.each(marketingNames)('refuse la visibilité privée de %s, même sans widget', async (name) => {
    const report = await runTokConnectSmoke({ fetchImpl: fixture({ changeMarketingTools: (tools) => tools.map((tool) => tool.name === name ? { ...tool, _meta: { 'openai/visibility': 'private' } } : tool) }).fetchImpl });
    expect(report.passed).toBe(false);
    expect(report.checks).toContainEqual({ name: 'marketing-tool-catalogue', status: 'failed', error: 'contract_or_network_error' });
  });
  it.each([['app'], ['model']])('refuse un outil Studio dont la visibilité est limitée à %j', async (audience) => {
    const report = await runTokConnectSmoke({ fetchImpl: fixture({ changeMarketingTools: (tools) => tools.map((tool) => tool.name === marketingMutations[0] ? { ...tool, _meta: { ui: { visibility: [audience] } } } : tool) }).fetchImpl });
    expect(report.passed).toBe(false);
    expect(report.checks).toContainEqual({ name: 'marketing-tool-catalogue', status: 'failed', error: 'contract_or_network_error' });
  });
  it.each(marketingNames)('détecte une annotation lecture/écriture incorrecte pour %s', async (name) => {
    const report = await runTokConnectSmoke({ fetchImpl: fixture({ changeMarketingTools: (tools) => tools.map((tool) => tool.name === name ? { ...tool, annotations: { readOnlyHint: !tool.annotations.readOnlyHint } } : tool) }).fetchImpl });
    expect(report.passed).toBe(false);
    expect(report.checks).toContainEqual({ name: 'marketing-tool-catalogue', status: 'failed', error: 'contract_or_network_error' });
  });
  it.each(['confirmed_by_user', 'idempotency_key'])('refuse une mutation Studio sans %s obligatoire', async (field) => {
    const report = await runTokConnectSmoke({ fetchImpl: fixture({ changeMarketingTools: (tools) => tools.map((tool) => tool.name === marketingMutations[0] ? { ...tool, inputSchema: { ...tool.inputSchema, required: tool.inputSchema.required?.filter((name) => name !== field) } } : tool) }).fetchImpl });
    expect(report.passed).toBe(false);
    expect(report.checks).toContainEqual({ name: 'marketing-tool-catalogue', status: 'failed', error: 'contract_or_network_error' });
  });
  it('refuse une confirmation pouvant être fausse malgré un champ obligatoire', async () => {
    const report = await runTokConnectSmoke({ fetchImpl: fixture({ changeMarketingTools: (tools) => tools.map((tool) => tool.name === marketingMutations[0] ? { ...tool, inputSchema: { ...tool.inputSchema, properties: { ...tool.inputSchema.properties, confirmed_by_user: { type: 'boolean' } } } } : tool) }).fetchImpl });
    expect(report.passed).toBe(false);
    expect(report.checks).toContainEqual({ name: 'marketing-tool-catalogue', status: 'failed', error: 'contract_or_network_error' });
  });
  it('refuse un visuel dont les références sont facultatives', async () => {
    const report = await runTokConnectSmoke({ fetchImpl: fixture({ changeMarketingTools: (tools) => tools.map((tool) => tool.name === marketingMutations[0] ? { ...tool, inputSchema: { ...tool.inputSchema, required: tool.inputSchema.required?.filter((name) => name !== 'reference_media_ids') } } : tool) }).fetchImpl });
    expect(report.passed).toBe(false);
    expect(report.checks).toContainEqual({ name: 'marketing-tool-catalogue', status: 'failed', error: 'contract_or_network_error' });
  });
  it.each([
    undefined,
    { type: 'array', minItems: 0, maxItems: 4, uniqueItems: true, items: { type: 'string', format: 'uuid' } },
    { type: 'array', minItems: 1, maxItems: 5, uniqueItems: true, items: { type: 'string', format: 'uuid' } },
    { type: 'array', minItems: 1, maxItems: 4, uniqueItems: false, items: { type: 'string', format: 'uuid' } },
    { type: 'array', minItems: 1, maxItems: 4, uniqueItems: true, items: { type: 'string' } },
  ])('refuse des références sans le contrat de 1 à 4 UUID uniques : %j', async (references) => {
    const report = await runTokConnectSmoke({ fetchImpl: fixture({ changeMarketingTools: (tools) => tools.map((tool) => {
      if (tool.name !== marketingMutations[0]) return tool;
      const properties = { ...tool.inputSchema.properties };
      delete properties.reference_media_ids;
      if (references) properties.reference_media_ids = references;
      return { ...tool, inputSchema: { ...tool.inputSchema, properties } };
    }) }).fetchImpl });
    expect(report.passed).toBe(false);
    expect(report.checks).toContainEqual({ name: 'marketing-tool-catalogue', status: 'failed', error: 'contract_or_network_error' });
  });
});
