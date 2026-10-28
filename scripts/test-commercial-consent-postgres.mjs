import { readFileSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import assert from 'node:assert/strict';
import { deflateSync } from 'node:zlib';

if (process.env.TOK_CONSENT_DISPOSABLE !== 'true' || !['127.0.0.1','localhost'].includes(process.env.PGHOST)) throw new Error('Disposable localhost PostgreSQL required; no hosted database allowed.');
const temp = mkdtempSync(join(tmpdir(),'tok-commercial-consent-'));
const base = readFileSync('supabase/migrations/20260801190000_marketing_operations_center.sql','utf8');
function block(start, end) {
 const at=base.indexOf(start); if(at<0)throw new Error('Missing baseline: '+start);
 const until=base.indexOf(end,at);if(until<0)throw new Error('Unterminated baseline: '+start);
 return base.slice(at,until+end.length);
}
const fn=name=>block(`CREATE OR REPLACE FUNCTION public.${name}(`,'$$;');
const table=name=>block(`CREATE TABLE IF NOT EXISTS public.${name} (`,'\n);');
// Real marketing tables and evidence/audit trigger functions are extracted unchanged
// from the existing migration; only unrelated app/Auth dependencies are fixture scaffolding.
const bootstrap=`
CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN; CREATE ROLE service_role NOLOGIN BYPASSRLS;
CREATE SCHEMA auth; CREATE SCHEMA extensions; CREATE EXTENSION pgcrypto WITH SCHEMA extensions;
-- pg_cron registration-only fixture: captures schedules but never executes jobs.
-- Database permissions, triggers and data below still run in real PostgreSQL 17.
CREATE SCHEMA cron;
CREATE TABLE cron.job(jobid bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,jobname text UNIQUE,schedule text,command text);
CREATE FUNCTION cron.schedule(p_name text,p_schedule text,p_command text) RETURNS bigint LANGUAGE sql AS $$
 INSERT INTO cron.job(jobname,schedule,command) VALUES(p_name,p_schedule,p_command)
 ON CONFLICT(jobname) DO UPDATE SET schedule=excluded.schedule,command=excluded.command RETURNING jobid;
$$;
GRANT USAGE ON SCHEMA public,auth TO anon,authenticated,service_role;
CREATE TYPE public.app_role AS ENUM('client','commercial','admin','restaurateur','courier');
CREATE TABLE auth.users(id uuid PRIMARY KEY);
CREATE TABLE public.user_roles(user_id uuid REFERENCES auth.users(id),role public.app_role);
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $$ SELECT jsonb_build_object('sub',auth.uid(),'aal',coalesce(nullif(current_setting('test.aal',true),''),'aal1'),'is_anonymous',false) $$;
CREATE FUNCTION public.has_role(u uuid,r public.app_role) RETURNS boolean LANGUAGE sql SECURITY DEFINER SET search_path='' AS $$ SELECT EXISTS(SELECT 1 FROM public.user_roles WHERE user_id=u AND role=r) $$;
CREATE FUNCTION public.tok_connect_oauth_request_allowed() RETURNS boolean LANGUAGE sql AS $$ SELECT coalesce(nullif(current_setting('test.connector_allowed',true),''),'true')='true' $$;
CREATE TABLE public.commercial_prospect_catalog(source_objectid bigint PRIMARY KEY,dataset_version date,created_at timestamptz DEFAULT now());
CREATE TABLE public.commercial_prospect_followups(source_objectid bigint PRIMARY KEY REFERENCES public.commercial_prospect_catalog,assigned_to uuid REFERENCES auth.users(id));
CREATE TABLE public.commercial_compensation_profiles(user_id uuid PRIMARY KEY REFERENCES auth.users(id),status text DEFAULT 'sprint');
CREATE TABLE public.commercial_demo_accounts(user_id uuid PRIMARY KEY REFERENCES auth.users(id),is_active boolean DEFAULT true);
CREATE TABLE public.notification_preferences(user_id uuid PRIMARY KEY REFERENCES auth.users(id),categories jsonb,channels jsonb);
CREATE TABLE public.audit_log(id uuid PRIMARY KEY,user_id uuid,action text,entity_type text,entity_id uuid,old_data jsonb,new_data jsonb,created_at timestamptz);
${fn('marketing_actor_user_id')}
${fn('marketing_normalize_swiss_phone')}
${table('marketing_contacts')}
${table('marketing_lawful_basis_evidence')}
CREATE UNIQUE INDEX marketing_contacts_email_unique ON public.marketing_contacts(email_normalized) WHERE email_normalized IS NOT NULL;
ALTER TABLE public.marketing_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marketing_lawful_basis_evidence ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.marketing_contacts,public.marketing_lawful_basis_evidence FROM PUBLIC,anon,authenticated;
${fn('marketing_capture_lawful_basis_evidence')}
${fn('marketing_touch_version')}
${fn('marketing_redact_audit_record')}
${fn('marketing_write_audit')}
CREATE TRIGGER marketing_contacts_lawful_basis_evidence AFTER INSERT OR UPDATE OF lawful_basis,consent_source,consent_at,opted_out_at,metadata ON public.marketing_contacts FOR EACH ROW EXECUTE FUNCTION public.marketing_capture_lawful_basis_evidence();
CREATE TRIGGER marketing_contacts_touch BEFORE UPDATE ON public.marketing_contacts FOR EACH ROW EXECUTE FUNCTION public.marketing_touch_version();
CREATE TRIGGER marketing_contacts_audit AFTER INSERT OR UPDATE OR DELETE ON public.marketing_contacts FOR EACH ROW EXECUTE FUNCTION public.marketing_write_audit();
`;
// A deterministic, real 600x160 RGBA PNG; synthetic ink only, never a real person's signature.
function fixtureSignature() {
 const width=600,height=160,raw=Buffer.alloc((width*4+1)*height);
 for(let y=35;y<130;y++)for(let x=20;x<310;x++)if(Math.abs(y-(80+40*Math.sin(x/35)))<2){const i=y*(width*4+1)+1+x*4;raw[i]=raw[i+1]=raw[i+2]=32;raw[i+3]=255;}
 function chunk(type,body){
  const data=Buffer.concat([Buffer.from(type),body]);let crc=0xffffffff;
  for(const byte of data){crc^=byte;for(let i=0;i<8;i++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);}
  const size=Buffer.alloc(4),sum=Buffer.alloc(4);size.writeUInt32BE(body.length);sum.writeUInt32BE((crc^0xffffffff)>>>0);
  return Buffer.concat([size,data,sum]);
 }
 const header=Buffer.alloc(13);header.writeUInt32BE(width);header.writeUInt32BE(height,4);header[8]=8;header[9]=6;
 return 'data:image/png;base64,'+Buffer.concat([Buffer.from('89504e470d0a1a0a','hex'),chunk('IHDR',header),chunk('IDAT',deflateSync(raw)),chunk('IEND',Buffer.alloc(0))]).toString('base64');
}
const psql=(sql)=>execFileSync('psql',['-X','-v','ON_ERROR_STOP=1','-At'],{input:sql,encoding:'utf8',stdio:['pipe','pipe','pipe']});
try {
 writeFileSync(join(temp,'bootstrap.sql'),bootstrap); console.log(psql(bootstrap));
 const historical=readFileSync('supabase/migrations/20261027161330_native_tok_contact_permissions.sql','utf8');
 console.log(psql(historical));
 const migration=readFileSync('supabase/migrations/20261027161000_commercial_signed_email_consent.sql','utf8');
 console.log(psql(migration)); console.log(psql(migration));
 console.log(psql(readFileSync('supabase/tests/commercial_email_consent.sql','utf8').replace('__SIGNATURE_FIXTURE__',fixtureSignature())));
 const execute=promisify(execFile);
 const prefix=`SET ROLE authenticated; SELECT set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',false);`;
 const call=`SELECT public.commercial_record_signed_email_consent_v2(1,'Test concurrency','concurrency@example.com','Test Person','Gérant', (SELECT signature_data FROM test_fixture.signature),true, public.commercial_get_email_consent_context(1)->>'document_hash','00000000-0000-4000-8000-000000000099')->>'receipt_id';`;
 const results=await Promise.all([1,2,3].map(()=>execute('psql',['-X','-v','ON_ERROR_STOP=1','-At','-c',prefix+call],{encoding:'utf8'})));
 const ids=results.map(r=>r.stdout.trim().split('\n').at(-1));assert.equal(new Set(ids).size,1);
 assert.equal(psql("SELECT count(*) FROM public.marketing_lawful_basis_evidence WHERE source_reference=(SELECT id::text FROM public.commercial_email_consent_receipts WHERE request_id='00000000-0000-4000-8000-000000000099');").trim(),'1');
 // Replaying the exact historical schema after the Cockpit schema must preserve
 // the shared legal-controller settings and every recorded commercial proof.
 const snapshotSql="SELECT jsonb_build_object('settings',(SELECT jsonb_agg(to_jsonb(s)) FROM public.tok_consent_settings s),'proofs',(SELECT jsonb_agg(to_jsonb(r) ORDER BY id) FROM public.commercial_email_consent_receipts r));";
 const beforeReplay=psql(snapshotSql).trim();
 console.log(psql(historical));
 assert.equal(psql(snapshotSql).trim(),beforeReplay);
 assert.equal(psql("SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname IN ('tok_contact_permissions','tok_consent_rate_limits','tok_consent_admin_audit','tok_consent_settings') AND c.relrowsecurity AND NOT has_table_privilege('anon',c.oid,'SELECT') AND NOT has_table_privilege('authenticated',c.oid,'SELECT');").trim(),'4');
 assert.equal(psql("SELECT count(*) FROM cron.job WHERE jobname='tok-consent-retention' AND schedule='19 3 * * *';").trim(),'1');
 console.log('PASS: restored historical schema coexists with Cockpit consent; controller/proofs preserved, private tables protected, one retention registration (cron execution not simulated).');
 console.log('PASS: real PostgreSQL17 assertions and three simultaneous same-request submissions; one receipt and one evidence event.');
 // New flow follows the legacy regression to prove upgrade compatibility.
 const doubleMigration='supabase/migrations/20261027221840_commercial_email_confirmation.sql';
 if (process.env.TOK_TEST_EMAIL_CONFIRMATION === 'true') {
   console.log(psql(`CREATE TABLE public.email_queue(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),to_email text NOT NULL,subject text NOT NULL,body_html text,body_text text,status text DEFAULT 'queued',sent_at timestamptz,error text,created_at timestamptz DEFAULT now(),metadata jsonb DEFAULT '{}',provider_message_id text);
     ALTER TABLE public.email_queue ENABLE ROW LEVEL SECURITY;
     CREATE TABLE public.marketing_deliveries(id uuid PRIMARY KEY,contact_id uuid,status text,last_error text,unsubscribed_at timestamptz,lease_token uuid,lease_expires_at timestamptz);`));
   const confirmation=readFileSync(doubleMigration,'utf8');
   console.log(psql(confirmation)); console.log(psql(confirmation));
   console.log(psql(readFileSync('supabase/tests/commercial_email_confirmation.sql','utf8')));
   const doubleCall=`SELECT public.commercial_record_signed_email_consent_v2(1,'Test concurrency','double-concurrency@example.com','Test Person','Gérant', (SELECT signature_data FROM test_fixture.signature),true, public.commercial_get_email_consent_context(1)->>'document_hash','00000000-0000-4000-8000-000000000299')->>'receipt_id';`;
   const attempts=await Promise.all([1,2,3].map(()=>execute('psql',['-X','-v','ON_ERROR_STOP=1','-At','-c',prefix+doubleCall],{encoding:'utf8'})));
   assert.equal(new Set(attempts.map(r=>r.stdout.trim().split('\n').at(-1))).size,1);
   assert.equal(psql("SELECT count(*) FROM public.email_queue WHERE to_email='double-concurrency@example.com';").trim(),'1');
   const queue=psql("SELECT queue_id FROM public.commercial_email_confirmations WHERE email='double-concurrency@example.com';").trim();
   console.log(psql(`SET ROLE service_role; SELECT public.commercial_claim_consent_email('${queue}',repeat('1',64),repeat('2',64));`));
   await Promise.all([1,2,3].map(()=>execute('psql',['-X','-v','ON_ERROR_STOP=1','-At','-c',"SET ROLE service_role; SELECT public.commercial_consent_public_action(repeat('1',64),'confirm');"],{encoding:'utf8'})));
   assert.equal(psql("SELECT count(*) FROM public.audit_log WHERE action='commercial_consent_mail_confirmed' AND entity_id=(SELECT receipt_id FROM public.commercial_email_confirmations WHERE email='double-concurrency@example.com');").trim(),'1');
   assert.equal(psql("SELECT public.marketing_contact_is_eligible(id,'email') FROM public.marketing_contacts WHERE email_normalized='double-concurrency@example.com';").trim(),'t');
   assert.equal(psql("SELECT count(*) FROM public.email_queue WHERE to_email='double-concurrency@example.com';").trim(),'2');
   assert.equal(psql("SELECT count(*) FROM public.commercial_email_acknowledgements a JOIN public.commercial_email_confirmations c ON c.receipt_id=a.receipt_id WHERE c.email='double-concurrency@example.com';").trim(),'1');
   const ackQueue=psql("SELECT a.queue_id FROM public.commercial_email_acknowledgements a JOIN public.commercial_email_confirmations c ON c.receipt_id=a.receipt_id WHERE c.email='double-concurrency@example.com';").trim();
   const claims=await Promise.all([1,2,3].map(()=>execute('psql',['-X','-v','ON_ERROR_STOP=1','-At','-c',`SET ROLE service_role; SELECT public.commercial_claim_consent_email('${ackQueue}',repeat('1',64),repeat('3',64));`],{encoding:'utf8'})));
   assert.equal(claims.filter(r=>r.stdout.includes('lease_token')).length,1);
   console.log('PASS: signed permission, three simultaneous approvals produce one final acknowledgement, three concurrent mail workers acquire one lease.');
 }

} catch(error) { if(error.stderr)console.error(String(error.stderr));throw error; }
