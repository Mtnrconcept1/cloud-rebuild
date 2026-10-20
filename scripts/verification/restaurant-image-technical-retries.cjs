// Disposable PostgreSQL integration proof. Set TOK_PGLITE_MODULE to a scratch
// installation of @electric-sql/pglite, then run this file with Node.
const { PGlite } = require(process.env.TOK_PGLITE_MODULE || '@electric-sql/pglite');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const assert = require('node:assert/strict');
(async () => {
  const db = new PGlite();
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
    CREATE SCHEMA auth; CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql AS $$SELECT nullif(current_setting('role',true),'none')::text$$;
    CREATE TABLE restaurants(id uuid PRIMARY KEY, name text,address text,city text,directory_source text,directory_source_reference text,directory_public_name_source_url text,is_active boolean DEFAULT true,is_directory_listing boolean DEFAULT true,directory_public_name_verified boolean DEFAULT true,image_url text);
    CREATE TABLE marketing_contacts(source_objectid bigint,branch text);
    CREATE TABLE restaurant_image_truth_reviews(id uuid PRIMARY KEY,restaurant_id uuid,candidate_url text DEFAULT 'https://official.ch/photo.jpg',source_url text DEFAULT 'https://official.ch/',status text,decision_reason text,attempts integer DEFAULT 0,next_attempt_at timestamptz DEFAULT now(),lease_token uuid,lease_expires_at timestamptz,evidence jsonb DEFAULT '{}',created_at timestamptz DEFAULT now(),updated_at timestamptz DEFAULT now(),image_sha256 text,mime_type text,size_bytes bigint,image_kind text,confidence numeric,reviewed_by_model text,reviewed_at timestamptz);
    INSERT INTO restaurants(id,name,directory_source_reference) SELECT ('00000000-0000-0000-0000-'||lpad(n::text,12,'0'))::uuid,'Restaurant '||n,n::text FROM generate_series(1,13)n;
    INSERT INTO restaurant_image_truth_reviews(id,restaurant_id,status,decision_reason)
      SELECT ('10000000-0000-0000-0000-'||lpad(n::text,12,'0'))::uuid,('00000000-0000-0000-0000-'||lpad((1+(n-1)%10)::text,12,'0'))::uuid,'rejected','openai_http_400' FROM generate_series(1,36)n;
    INSERT INTO restaurant_image_truth_reviews(id,restaurant_id,status,decision_reason)
      SELECT ('20000000-0000-0000-0000-'||lpad(n::text,12,'0'))::uuid,'00000000-0000-0000-0000-000000000011'::uuid,
        CASE n WHEN 1 THEN 'manual_review' WHEN 2 THEN 'rejected' WHEN 3 THEN 'processing' ELSE 'queued' END,
        CASE n WHEN 2 THEN 'verified_hash_already_used_by_other_restaurant' ELSE 'openai_http_400' END FROM generate_series(1,4)n;
    INSERT INTO marketing_contacts VALUES(12,'Restaurant référencé sur TheFork');
    INSERT INTO restaurant_image_truth_reviews(id,restaurant_id,status) VALUES('30000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000012','queued');
    UPDATE restaurants SET image_url='manual.jpg' WHERE directory_source_reference='13';
    INSERT INTO restaurant_image_truth_reviews(id,restaurant_id,status,decision_reason) VALUES('40000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000013','rejected','openai_http_400');`);
  await db.exec(readFileSync(resolve(__dirname, '../../supabase/migrations/20260904173100_restaurant_image_truth_guards.sql'), 'utf8'));
  const migration = readFileSync(resolve(__dirname, '../../supabase/migrations/20261020223521_retry_technical_restaurant_photo_reviews.sql'), 'utf8');
  await db.exec(migration);
  assert.equal((await db.query("SELECT count(*)::int AS n FROM restaurant_image_truth_reviews WHERE evidence->>'technical_retry_batch'='tok_openai_400_20261021'")).rows[0].n, 0, 'original terminal trigger must block ordinary requeue');
  await db.exec(readFileSync(resolve(__dirname, '../../supabase/migrations/20261020223830_controlled_retry_restaurant_photo_transport_errors.sql'), 'utf8'));
  let denied = false;
  try { await db.query('SELECT service_retry_restaurant_photo_transport_errors()'); } catch { denied = true; }
  assert(denied, 'owner call without service role must be denied');
  await db.exec('SET ROLE service_role');
  assert.equal((await db.query('SELECT service_retry_restaurant_photo_transport_errors() AS n')).rows[0].n, 35);
  assert.equal((await db.query('SELECT service_retry_restaurant_photo_transport_errors() AS n')).rows[0].n, 0);
  await db.exec('RESET ROLE');
  const marked = (await db.query("SELECT count(*)::int AS n,count(distinct restaurant_id)::int AS restaurants FROM restaurant_image_truth_reviews WHERE evidence->>'technical_retry_batch'='tok_openai_400_20261021'")).rows[0];
  assert.deepEqual(marked, { n: 35, restaurants: 10 });
  await db.exec(migration);
  assert.equal((await db.query("SELECT count(*)::int AS n FROM restaurant_image_truth_reviews WHERE evidence->>'technical_retry_batch'='tok_openai_400_20261021'")).rows[0].n, 35);
  await db.exec('SET ROLE service_role');
  const first = (await db.query('SELECT * FROM service_claim_thefork_image_truth_reviews(25)')).rows;
  const second = (await db.query('SELECT * FROM service_claim_thefork_image_truth_reviews(25)')).rows;
  assert.equal(first.length + second.length, 36);
  assert(first.concat(second).some(row => row.restaurant_id.endsWith('012')));
  assert(!first.concat(second).some(row => row.restaurant_id.endsWith('011') || row.restaurant_id.endsWith('013')));
  await db.exec('RESET ROLE');
  await db.exec(`UPDATE restaurant_image_truth_reviews SET status='rejected',decision_reason='new_business_rejection',evidence='{}' WHERE id='10000000-0000-0000-0000-000000000001';`);
  assert.equal((await db.query("SELECT evidence->>'technical_retry_batch' AS batch FROM restaurant_image_truth_reviews WHERE id='10000000-0000-0000-0000-000000000001'")).rows[0].batch, 'tok_openai_400_20261021');
  await db.exec('SET ROLE service_role');
  assert.equal((await db.query('SELECT service_retry_restaurant_photo_transport_errors() AS n')).rows[0].n, 0, 'settlement must not erase the lifetime batch cap');
  await db.exec('RESET ROLE');
  for (const role of ['anon', 'authenticated']) {
    await db.exec('SET ROLE ' + role);
    let deniedRole = false;
    try { await db.query('SELECT service_retry_restaurant_photo_transport_errors()'); } catch { deniedRole = true; }
    assert(deniedRole, role + ' must not invoke retry RPC');
    await db.exec('RESET ROLE');
  }
  const retryAcl = (await db.query("SELECT has_function_privilege('anon','service_retry_restaurant_photo_transport_errors()','execute') anon,has_function_privilege('authenticated','service_retry_restaurant_photo_transport_errors()','execute') authenticated,has_function_privilege('service_role','service_retry_restaurant_photo_transport_errors()','execute') service")).rows[0];
  assert.deepEqual(retryAcl, { anon: false, authenticated: false, service: true });
  const acl = (await db.query("SELECT has_function_privilege('anon','service_claim_thefork_image_truth_reviews(integer)','execute') anon,has_function_privilege('authenticated','service_claim_thefork_image_truth_reviews(integer)','execute') authenticated,has_function_privilege('service_role','service_claim_thefork_image_truth_reviews(integer)','execute') service")).rows[0];
  assert.deepEqual(acl, { anon: false, authenticated: false, service: true });
  console.log('PostgreSQL passed: exact 35/10 batch, replay bound, existing TheFork processing, manual/hash/leased/imaged/global queue preservation, internal ACL.');
  await db.close();
})();
