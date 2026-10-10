import assert from 'node:assert/strict';
import { test } from 'node:test';
import { reconcileMobileApex } from './reconcile-mobile-apex-domain.mjs';

const SHA = 'a'.repeat(40);
const PROJECT = 'prj_v4X2Bhefbcf12CVIanrvS62q9Vy6';
const config = {
  redirects: [{ source: '/:path((?!\\.well-known/(?:apple-app-site-association|assetlinks\\.json)$).*)', destination: 'https://www.thetok.ch/:path', permanent: true, has: [{ type: 'host', value: 'thetok.ch' }] }],
  headers: [{ source: '/.well-known/apple-app-site-association', headers: [{ key: 'Content-Type', value: 'application/json; charset=utf-8' }] }],
};

function fixture(overrides = {}) {
  let domain = { name: 'thetok.ch', projectId: PROJECT, verified: true, redirect: 'www.thetok.ch', redirectStatusCode: 308, updatedAt: 1, ...overrides.domain };
  let reads = 0;
  let aliasReads = 0;
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url, ...options });
    if (url.startsWith('https://api.vercel.com/')) {
      assert.equal(options.headers.Authorization, 'Bearer synthetic-token');
      assert.equal(options.redirect, 'error');
      if (overrides.denied) return new Response('sensitive-provider-response', { status: 403 });
      if (url.includes('/domains/thetok.ch')) {
        if (options.method === 'PATCH') {
          assert.deepEqual(Object.keys(JSON.parse(options.body)).sort(), JSON.parse(options.body).redirect ? ['redirect', 'redirectStatusCode'] : ['redirect']);
          if (!overrides.ignorePatch) domain = { ...domain, ...JSON.parse(options.body), updatedAt: 2 };
        } else if (++reads === 2 && overrides.concurrentChange) domain.updatedAt = 9;
        return Response.json(domain);
      }
      if (url.includes('/v4/aliases/')) return Response.json({ alias: 'www.thetok.ch', projectId: PROJECT, deploymentId: ++aliasReads > 1 && overrides.concurrentDeployment ? 'dpl_changed123' : 'dpl_test123', ...overrides.alias });
      if (url.includes('/v13/deployments/')) return Response.json({ projectId: PROJECT, target: 'production', readyState: 'READY', meta: { githubCommitSha: SHA }, ...overrides.deployment });
      throw new Error('Unexpected API request');
    }
    assert.equal(url, 'https://www.thetok.ch/.well-known/apple-app-site-association');
    assert.equal(options.redirect, 'manual');
    assert.equal(options.headers, undefined, 'provider credential never sent to public hosting');
    return new Response(JSON.stringify(overrides.association || { applinks: { details: [{ appIDs: ['73HG6QD4AJ.ch.thetok.app'] }] } }), { status: overrides.status || 200, headers: { 'content-type': overrides.contentType || 'application/json; charset=utf-8' } });
  };
  return { calls, run: (action = 'apply', extra = {}) => reconcileMobileApex({ token: 'synthetic-token', expectedSha: SHA, action, config, fetchImpl, ...extra }), writes: () => calls.filter((call) => call.method === 'PATCH') };
}

test('inspection performs no mutation and emits no credential', async () => {
  const f = fixture();
  const result = await f.run('inspect');
  assert.equal(result.changed, false);
  assert.equal(f.calls.length, 1);
  assert.equal(JSON.stringify(result).includes('synthetic-token'), false);
});

test('applies only the redirect removal after production and public hosting verification', async () => {
  const f = fixture();
  const result = await f.run();
  assert.equal(result.changed, true);
  assert.equal(result.after.redirect, null);
  assert.deepEqual(f.writes().map((call) => JSON.parse(call.body)), [{ redirect: null }]);
});

for (const [name, overrides] of [
  ['another project', { domain: { projectId: 'prj_other' } }],
  ['unverified domain', { domain: { verified: false } }],
  ['preview domain', { domain: { gitBranch: 'preview' } }],
  ['another redirect', { domain: { redirect: 'elsewhere.invalid' } }],
  ['nonpermanent redirect', { domain: { redirectStatusCode: 307 } }],
  ['foreign live alias', { alias: { projectId: 'prj_other' } }],
  ['old production commit', { deployment: { meta: { githubCommitSha: 'b'.repeat(40) } } }],
  ['failed deployment', { deployment: { readyState: 'ERROR' } }],
  ['preview deployment', { deployment: { target: 'preview' } }],
  ['public redirect', { status: 308 }],
  ['wrong MIME type', { contentType: 'application/octet-stream' }],
  ['wrong native identity', { association: { applinks: { details: [{ appIDs: ['wrong.id'] }] } } }],
  ['concurrent operator change', { concurrentChange: true }],
  ['concurrent deployment', { concurrentDeployment: true }],
]) {
  test(`refuses ${name} without mutation`, async () => {
    const f = fixture(overrides);
    await assert.rejects(f.run());
    assert.equal(f.writes().length, 0);
  });
}

test('refuses missing repository rules and missing authorization before mutation', async () => {
  for (const extra of [{ config: {} }, { token: '' }, { expectedSha: 'main' }, { action: 'delete' }]) {
    const f = fixture();
    await assert.rejects(f.run('apply', extra));
    assert.equal(f.writes().length, 0);
  }
});

test('fails if the provider does not confirm the requested change', async () => {
  const f = fixture({ ignorePatch: true });
  await assert.rejects(f.run(), /not confirmed/);
  assert.equal(f.writes().length, 1);
});

test('an already applied exception is validated and leaves the provider untouched', async () => {
  const f = fixture({ domain: { redirect: null } });
  assert.equal((await f.run()).changed, false);
  assert.equal(f.writes().length, 0);
});

test('rollback restores only the prior global redirect without depending on healthy hosting', async () => {
  const f = fixture({ domain: { redirect: null }, deployment: { readyState: 'ERROR' }, status: 500 });
  const result = await f.run('rollback');
  assert.equal(result.after.redirect, 'www.thetok.ch');
  assert.deepEqual(f.writes().map((call) => JSON.parse(call.body)), [{ redirect: 'www.thetok.ch', redirectStatusCode: 308 }]);
  assert.equal(f.calls.some((call) => call.url.includes('/v13/deployments/')), false);
});

test('provider errors never include its response body in diagnostics', async () => {
  const f = fixture({ denied: true });
  await assert.rejects(f.run(), (error) => error.message === 'Vercel GET failed (HTTP 403)');
});

test('rollback does not overwrite a concurrent operator change', async () => {
  const f = fixture({ domain: { redirect: null }, concurrentChange: true });
  await assert.rejects(f.run('rollback'), /changed during verification/);
  assert.equal(f.writes().length, 0);
});
