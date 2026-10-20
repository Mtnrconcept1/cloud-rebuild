// PGlite is supplied by a verification runtime; no production dependency is added.
import ts from 'typescript';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
const { PGlite } = await import(process.env.TOK_PGLITE_MODULE || '@electric-sql/pglite');
const root = fileURLToPath(new URL('../../', import.meta.url)).replaceAll('\\', '/').replace(/\/$/, '');
const db = new PGlite();
await db.exec('CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;');
const migration = readFileSync(root + '/supabase/migrations/20261021093000_tok_inbound_forward_receipts.sql', 'utf8');
await db.exec(migration); await db.exec(migration);
await db.exec(readFileSync(root + '/supabase/tests/tok_inbound_forward_receipts.sql', 'utf8'));
// Minimal PostgREST adapter: execute the actual helper store's queries against PostgreSQL.
const client = { from(name) {
  assert.equal(name, 'tok_inbound_forward_receipts');
  let mode = 'select', fields = '*', patch = {}, single = false;
  const predicates = []; let writePromise;
  const query = {
    upsert(row) { const keys = Object.keys(row); return db.query(`INSERT INTO public.${name} (${keys.join(',')}) VALUES (${keys.map((_, i) => '$' + (i + 1)).join(',')}) ON CONFLICT DO NOTHING`, Object.values(row)).then(() => ({ error: null })); },
    select(value) { fields = value; return query; },
    update(value) { mode = 'update'; patch = value; return query; },
    eq(key, value) { predicates.push([key, '=', value]); return query; },
    neq(key, value) { predicates.push([key, '<>', value]); return query; },
    lte(key, value) { predicates.push([key, '<=', value]); return query; },
    in(key, value) { predicates.push([key, 'in', value]); return query; },
    single() { single = true; return query; },
    then(resolve, reject) {
      if (!writePromise) {
        const params = []; const param = value => { params.push(value); return '$' + params.length; };
        const assignments = Object.entries(patch).map(([key, value]) => `${key}=${param(value)}`);
        const where = predicates.map(([key, op, value]) => op === 'in' ? `${key} IN (${value.map(param).join(',')})` : `${key} ${op} ${param(value)}`).join(' AND ');
        const sql = mode === 'select' ? `SELECT ${fields} FROM public.${name} WHERE ${where}` : `UPDATE public.${name} SET ${assignments.join(',')} WHERE ${where} RETURNING ${fields}`;
        writePromise = db.query(sql, params).then(r => ({ data: single ? r.rows[0] : r.rows, error: null }));
      }
      return writePromise.then(resolve, reject);
    },
  };
  return query;
} };
const source = readFileSync(root + '/supabase/functions/_shared/resend-inbound-forward.ts', 'utf8');
const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const { createForwardStore } = await import('data:text/javascript;base64,' + Buffer.from(js).toString('base64'));
const store = createForwardStore(client);
const now = Date.now(); const id = '11111111-1111-4111-8111-111111111111';
const token1 = '33333333-3333-4333-8333-333333333333', token2 = '44444444-4444-4444-8444-444444444444';
const first = await Promise.all([store.claim(id, token1, now), store.claim(id, token2, now)]);
assert.deepEqual(first.slice().sort(), ['busy', 'claimed']);
const token = first[0] === 'claimed' ? token1 : token2;
await store.finish(id, token, '22222222-2222-4222-8222-222222222222');
assert.equal(await store.claim(id, token2, now + 48 * 60 * 60 * 1000), 'sent');
const old = '55555555-5555-4555-8555-555555555555';
assert.equal(await store.claim(old, token1, now), 'claimed');
await store.fail(old, token1, 'provider_request_failed', false);
assert.equal(await store.claim(old, token2, now + 24 * 60 * 60 * 1000), 'blocked');
const blocked = '66666666-6666-4666-8666-666666666666';
assert.equal(await store.claim(blocked, token1, now), 'claimed');
await store.fail(blocked, token1, 'forward_loop', true);
assert.equal(await store.claim(blocked, token2, now + 5 * 60 * 1000), 'blocked');
await db.exec('SET ROLE anon');
await assert.rejects(db.query('SELECT * FROM public.tok_inbound_forward_receipts'), /permission denied/);
await db.exec('RESET ROLE; SET ROLE authenticated');
await assert.rejects(db.query('SELECT * FROM public.tok_inbound_forward_receipts'), /permission denied/);
await db.exec('RESET ROLE; SET ROLE service_role');
assert.equal((await db.query('SELECT count(*)::int AS count FROM public.tok_inbound_forward_receipts')).rows[0].count, 3);
await db.close();
console.log('PASS: replay twice; SQL constraints, real-role denial, durable CAS, concurrent claim, completed duplicate after 48h, expired ambiguous retry, terminal blocked receipt.');
