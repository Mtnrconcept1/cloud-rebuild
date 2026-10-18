import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { nativeImageCreditFixtureSql, imageCreditMigrationSql } from './ai-image-credit-fixture.mjs';
import { exerciseImageCreditLedger, restaurantId, claimStatement, service } from './ai-image-credit-checks.mjs';

// This runner creates only synthetic fixtures in a fresh local CI database.
// No connection URL, credential file, remote host, or existing application DB.
if (process.env.TOK_AI_SECURITY_DISPOSABLE !== 'true') throw new Error('Set TOK_AI_SECURITY_DISPOSABLE=true for a disposable local PostgreSQL database');
if (!['127.0.0.1','localhost','::1'].includes(process.env.PGHOST || '')) throw new Error('PGHOST must be explicit loopback');
if (!/^\d{1,5}$/.test(process.env.PGPORT || '') || Number(process.env.PGPORT) > 65535) throw new Error('PGPORT must be explicit');
if (!/^(?:tok_ai_security_[a-z0-9_]+|tok_security_ai(?:_[a-z0-9_]+)?)$/.test(process.env.PGDATABASE || '')) throw new Error('PGDATABASE must be a dedicated tok_ai_security_ or tok_security_ai fixture database');
if (['PGSERVICE','PGSERVICEFILE','PGHOSTADDR','DATABASE_URL'].some(key => process.env[key])) throw new Error('Connection overrides are forbidden');
const args = ['-X','-qAt','-v','ON_ERROR_STOP=1'];
function sql(input) {
  return execFileSync('psql', args, { input, encoding: 'utf8', timeout: 55_000,
    maxBuffer: 4 * 1024 * 1024, stdio: ['pipe','pipe','pipe'] }).trim();
}
assert.equal(sql("SELECT to_regclass('public.restaurants') IS NULL AND to_regnamespace('private_finance') IS NULL;"), 't', 'Database must be fresh');
sql(nativeImageCreditFixtureSql());
sql(imageCreditMigrationSql());
sql(imageCreditMigrationSql());
for (const check of await exerciseImageCreditLedger(async input => sql(input))) console.log(`PASS ${check}`);

function contender(statement) {
  return new Promise((resolve, reject) => {
    const child = spawn('psql', args, { stdio: ['pipe','pipe','pipe'] });
    let output='', errors='';
    const timeout = setTimeout(() => { child.kill(); reject(new Error('Concurrent fixture timed out')); }, 55_000);
    child.stdout.on('data', chunk => { output += chunk; });
    child.stderr.on('data', chunk => { errors += chunk; });
    child.on('error', error => { clearTimeout(timeout); reject(error); });
    child.on('close', code => { clearTimeout(timeout); resolve({ code,output,errors }); });
    child.stdin.end(service(`${statement}; SELECT pg_sleep(0.15)`));
  });
}
const same = await Promise.all(Array.from({ length: 12 }, () => contender(claimStatement(restaurantId(5), 'fixture-concurrent-same'))));
assert.ok(same.every(result => result.code === 0), JSON.stringify(same));
const claimed = same.map(result => JSON.parse(result.output.trim().split('\n')[0]));
assert.equal(claimed.filter(result => result.claimed).length, 1);
assert.equal(claimed.filter(result => !result.claimed).length, 11);
assert.equal(sql(`SELECT count(*) FROM public.ai_usage_logs WHERE restaurant_id='${restaurantId(5)}';`), '1');
console.log('PASS 12 independent concurrent claims for one intention: one worker, one ledger reservation');

const distinct = await Promise.all(Array.from({ length: 12 }, (_, index) => contender(claimStatement(restaurantId(6), `fixture-concurrent-${index}`))));
assert.equal(distinct.filter(result => result.code === 0).length, 2, JSON.stringify(distinct));
assert.ok(distinct.filter(result => result.code !== 0).every(result => result.errors.includes('TOK credits exhausted')));
assert.equal(sql(`SELECT count(*) FROM public.ai_usage_logs WHERE restaurant_id='${restaurantId(6)}';`), '2');
assert.equal(sql(service(`SELECT public.tok_credit_balance_from_usage(public.get_restaurant_credit_usage('${restaurantId(6)}'))`)), '3');
console.log('PASS 12 independent intentions racing for 15 weekly credits: two funded calls, 3 credits remain');
console.log('PASS native AI credit integration completed without provider or production calls');
