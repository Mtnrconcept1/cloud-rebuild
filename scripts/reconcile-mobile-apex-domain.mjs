import { readFile, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const PROJECT = 'prj_v4X2Bhefbcf12CVIanrvS62q9Vy6';
const TEAM = 'team_FvFPXdOD5Vw9DAQS5grAuJAv';
const APEX = 'thetok.ch';
const WWW = 'www.thetok.ch';
const AASA = '/.well-known/apple-app-site-association';

export async function reconcileMobileApex({ token, expectedSha, action = 'inspect', config, fetchImpl = fetch }) {
  if (!['inspect', 'apply', 'rollback'].includes(action)) throw new Error('Unsupported domain action');
  if (!token || !/^[a-f0-9]{40}$/.test(expectedSha || '')) throw new Error('Token and exact deployment SHA required');
  const api = async (route, method = 'GET', body) => {
    const response = await fetchImpl(`https://api.vercel.com${route}?teamId=${TEAM}`, {
      method, redirect: 'error', signal: AbortSignal.timeout(30000),
      headers: { Authorization: `Bearer ${token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    if (!response.ok) throw new Error(`Vercel ${method} failed (HTTP ${response.status})`);
    return response.json();
  };
  const domainPath = `/v9/projects/${PROJECT}/domains/${APEX}`;
  const validateDomain = (domain) => {
    if (domain.name !== APEX || domain.projectId !== PROJECT || domain.verified !== true || domain.gitBranch || domain.customEnvironmentId) {
      throw new Error('Unexpected production domain target');
    }
    if (domain.redirect && (domain.redirect !== WWW || domain.redirectStatusCode !== 308)) throw new Error('Unexpected domain redirect');
  };
  const before = await api(domainPath);
  validateDomain(before);
  const recheckDomain = async () => {
    const current = await api(domainPath);
    validateDomain(current);
    if (current.redirect !== before.redirect || current.redirectStatusCode !== before.redirectStatusCode || current.updatedAt !== before.updatedAt) throw new Error('Domain changed during verification');
  };
  const verifyLiveDeployment = async () => {
    const alias = await api(`/v4/aliases/${WWW}`);
    if (alias.alias !== WWW || alias.projectId !== PROJECT || !/^dpl_[a-zA-Z0-9]+$/.test(alias.deploymentId || '')) throw new Error('Unexpected live alias');
    const deployment = await api(`/v13/deployments/${alias.deploymentId}`);
    if (deployment.projectId !== PROJECT || deployment.readyState !== 'READY' || deployment.target !== 'production' || deployment.meta?.githubCommitSha !== expectedSha) throw new Error('Expected commit is not the live READY production deployment');
    return alias.deploymentId;
  };
  const result = { action, expectedSha, project: PROJECT, domain: APEX, before: { redirect: before.redirect ?? null, status: before.redirectStatusCode ?? null }, changed: false };
  if (action === 'inspect') return result;
  if (action === 'apply') {
    // This exact reviewed redirect preserves canonical URLs, except the two native association files.
    const source = '/:path((?!\\.well-known/(?:apple-app-site-association|assetlinks\\.json)$).*)';
    const rule = config?.redirects?.find((item) => item.source === source && item.destination === `https://${WWW}/:path` && item.permanent === true && item.has?.length === 1 && item.has[0].type === 'host' && item.has[0].value === APEX);
    const header = config?.headers?.find((item) => item.source === AASA)?.headers?.find((item) => item.key.toLowerCase() === 'content-type');
    if (!rule || header?.value !== 'application/json; charset=utf-8') throw new Error('Required repository routing fix absent');
    const deploymentId = await verifyLiveDeployment();
    const response = await fetchImpl(`https://${WWW}${AASA}`, { redirect: 'manual', signal: AbortSignal.timeout(15000) });
    if (response.status !== 200 || !/^application\/json(?:;|$)/i.test(response.headers.get('content-type') || '')) throw new Error('Association JSON hosting is not live');
    const association = await response.json();
    if (!association.applinks?.details?.some((item) => item.appIDs?.includes('73HG6QD4AJ.ch.thetok.app'))) throw new Error('Unexpected iOS association');
    if (before.redirect) {
      // Recheck after network verification to avoid overwriting a concurrent operator change.
      await recheckDomain();
      if (await verifyLiveDeployment() !== deploymentId) throw new Error('Live deployment changed during verification');
      await api(domainPath, 'PATCH', { redirect: null });
      result.changed = true;
    }
  } else if (!before.redirect) {
    await recheckDomain();
    await api(domainPath, 'PATCH', { redirect: WWW, redirectStatusCode: 308 });
    result.changed = true;
  }
  const after = await api(domainPath);
  validateDomain(after);
  if (action === 'apply' ? !!after.redirect : after.redirect !== WWW || after.redirectStatusCode !== 308) throw new Error('Domain update not confirmed; inspect before retry');
  result.after = { redirect: after.redirect ?? null, status: after.redirectStatusCode ?? null };
  return result;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const result = await reconcileMobileApex({ token: process.env.VERCEL_TOKEN, expectedSha: process.env.EXPECTED_PRODUCTION_SHA, action: process.env.MOBILE_DOMAIN_ACTION || 'inspect', config: JSON.parse(await readFile('vercel.json', 'utf8')) });
    await writeFile('mobile-domain-result.json', `${JSON.stringify({ checkedAt: new Date().toISOString(), ...result }, null, 2)}\n`);
    console.log(JSON.stringify(result));
  } catch (error) {
    // Never print response bodies, request objects, credentials or authentication headers.
    console.error(error instanceof Error ? error.message : 'Domain reconciliation failed');
    process.exitCode = 1;
  }
}
