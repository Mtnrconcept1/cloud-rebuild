import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const config = JSON.parse(readFileSync(new URL('../vercel.json', import.meta.url)));
const missingRoutes=['/abonnement','/coming-soon','/creneaux-garantis','/flex-prix-bas','/garantie-qualite','/match-groupes','/multi-restaurant','/multi-stop','/parametres/securite','/tok-connect/mcp-widget','/tok-pulse'];
test('Hobby delivery does not depend on the paid bulk redirects product',()=>assert.equal(config.bulkRedirectsPath,undefined));
for (const route of missingRoutes) test(`direct route ${route} has an exact SPA delivery rule`,()=>assert(config.rewrites.some(r=>r.source===route&&r.destination==='/index.html')));
test('unknown URLs are not rewritten into a false HTTP 200',()=>assert(!config.rewrites.some(r=>['/(.*)','/:path*'].includes(r.source)&&r.destination==='/index.html')));
test('same-origin camera works after SPA navigation while microphone remains disabled',()=>{
 const value=config.headers.find(r=>r.source==='/(.*)').headers.find(h=>h.key==='Permissions-Policy').value;
 assert(value.includes('camera=(self)'));assert(value.includes('microphone=()'));
});
test('migration provenance check runs before any production configuration mutation',()=>{
 const workflow=readFileSync(new URL('../.github/workflows/deploy-production.yml',import.meta.url),'utf8');
 assert(workflow.includes('migration_preflight:'));
 assert.match(workflow,/preflight:\n\s+needs: \[validation, migration_preflight\]/);
 assert.match(workflow,/configure_project_domains:\n\s+needs: \[validation, migration_preflight\]/);
 assert(workflow.includes('--dry-run'));
});
test('new migrations cannot clone SQL content under another timestamp',async()=>{
 const { findContentDuplicates }=await import('./ci-migration-content-guard.mjs');
 assert.equal(findContentDuplicates([{path:'a.sql',sql:'select 1;'}, {path:'b.sql',sql:'select 1;'}],[]).length,1);
 assert.equal(findContentDuplicates([{path:'a.sql',sql:'select 1;'}, {path:'b.sql',sql:'select 2;'}],[]).length,0);
});
test('first deployment can inspect every demo migration without a baseline',async()=>{
 const {readDemoMigrationDiff}=await import('./apply-commercial-demo-migrations.mjs');
 const head='a'.repeat(40);const calls=[];
 const diff=readDemoMigrationDiff({baseSha:'',headSha:head,checkOnly:true,runGit:args=>{calls.push(args);return 'supabase/demo-migrations/20261001000000_first.sql\n';}});
 assert.equal(diff,'A\tsupabase/demo-migrations/20261001000000_first.sql');
 assert.equal(calls[0][0],'ls-tree');
 assert.throws(()=>readDemoMigrationDiff({baseSha:'',headSha:head,checkOnly:false,runGit:()=>''}),/base and head/);
});
test('invalid demo revision is rejected even during read-only preflight',async()=>{
 const {readDemoMigrationDiff}=await import('./apply-commercial-demo-migrations.mjs');
 assert.throws(()=>readDemoMigrationDiff({baseSha:'',headSha:'HEAD',checkOnly:true,runGit:()=>''}),/base and head/);
});

test('private route responses cannot be cached or indexed', () => {
 for (const route of ['/parametres/:path*','/tok-connect/mcp-widget']) {
  const headers=config.headers.find(row=>row.source===route)?.headers||[];
  assert(headers.some(h=>h.key==='X-Robots-Tag'&&h.value.includes('noindex')));
  assert(headers.some(h=>h.key==='Cache-Control'&&h.value.includes('no-store')));
 }
});
test('an added duplicate cannot hide behind a reviewed historical pair', async () => {
 const {createHash}=await import('node:crypto');
 const {findContentDuplicates}=await import('./ci-migration-content-guard.mjs');
 const pair=[{path:'a.sql',sql:'select 1;'}, {path:'b.sql',sql:'select 1;'}];
 const baseline=[{sha256:createHash('sha256').update('select 1;').digest('hex'),paths:['a.sql','b.sql']}];
 assert.equal(findContentDuplicates(pair,baseline).length,0);
 assert.equal(findContentDuplicates([...pair,{path:'c.sql',sql:'select 1;'}],baseline).length,1);
});
