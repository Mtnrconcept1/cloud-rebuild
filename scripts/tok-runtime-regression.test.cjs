// Offline observations of the immutable source. No network, real token, or database call.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require(process.env.TYPESCRIPT_PATH || 'typescript');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const { test } = require('node:test');

function load(file, injected, expose = []) {
  const text = fs.readFileSync(path.join(root,file),'utf8');
  const parsed = ts.createSourceFile(file,text,ts.ScriptTarget.Latest,true);
  const transformer = context => node => ts.visitNode(node,function visit(n){
    if(ts.isImportDeclaration(n) || ts.isExportDeclaration(n)) return undefined;
    if(n.modifiers) n=ts.factory.replaceModifiers(n,n.modifiers.filter(m=>m.kind!==ts.SyntaxKind.ExportKeyword));
    return ts.visitEachChild(n,visit,context);
  });
  const transformed=ts.transform(parsed,[transformer]);
  const source=ts.createPrinter().printFile(transformed.transformed[0]);transformed.dispose();
  const js=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.None}}).outputText;
  const context=vm.createContext({Response,Request,URL,Headers,Date,JSON,Math,crypto:require('node:crypto').webcrypto,...injected});
  vm.runInContext(js+'\n;globalThis.exposed={'+expose.join(',')+'};',context,{timeout:3000});
  return context.exposed;
}
const actor={isServiceRole:true,authMode:'service_role',roles:['service_role'],userId:null};
function setup({orderStatus='paid',advanceError=false,completeError=false,providerError=false,exists=false,ambiguous=false,auditError=true,paymentStatus='paid'}={}) {
 const calls=[];const logs=[];let handler;
 const order={id:'00000000-0000-4000-8000-000000000001',payment_status:paymentStatus,status:orderStatus,provider_reference:'OFFLINE_REF',print_quote_id:'quote',print_export_id:'export',shipping_address:{}};
 const job={id:'job',lease_token:'lease',print_order_id:order.id,job_type:'submit_order',attempt_count:1,max_attempts:5};
 function from(table){let selected='';const chain={select(v){selected=v;return chain;},eq(){return chain;},not(){return chain;},order(){return chain;},limit(){return chain;},in(){return chain;},update(){return chain;},insert(){return Promise.resolve({error:auditError?{code:'DB_TEST_ERROR',message:'PRIVATE_customer_secret'}:null});},then(resolve,reject){return Promise.resolve(result()).then(resolve,reject)},single(){return Promise.resolve(result());},maybeSingle(){return Promise.resolve(result());}};
 function result(){if(table==='print_orders'&&selected==='id, payment_attempt_id')return {data:[],error:null};return{data:{print_settings:{enabled:true,new_orders_enabled:true},print_orders:order,print_order_items:{print_order_id:order.id,options:[],quantity:1},print_quotes:{expires_at:new Date(Date.now()+3600000).toISOString(),selected_shipping_quote:'quote'},print_exports:{status:'approved',production_storage_path:'offline.pdf',md5:'0'.repeat(32)}}[table]??[],error:null}}return chain;}
 const client={from,async rpc(name,args){calls.push({name,args});if(name==='claim_print_fulfillment_jobs')return{data:[job],error:null};return{data:null,error:(name==='advance_print_order_state'&&advanceError)||(name==='complete_print_fulfillment_job'&&completeError)?{code:'DB_TEST_ERROR'}:null};},storage:{from(){return{async createSignedUrl(){return{data:{signedUrl:'https://example.invalid/offline.pdf'},error:null}}}}}};
 const auth=load('supabase/functions/_shared/auth.ts',{Deno:{env:{get(){return undefined}}},createClient(){throw Error('No SDK in offline harness')},console:{error(...a){logs.push(a.map(String));}}},['HttpError','writeAuditLog']);
 const request=load('supabase/functions/_shared/print/request.ts',{setTimeout},['CloudprinterError']);
 const provider={async getOrder(){calls.push({name:'getOrder'});return (exists || (ambiguous && calls.some(c=>c.name==='createOrder')))?{state:'submitted',items:[]}:null},async createOrder(){calls.push({name:'createOrder'});if(providerError)throw new request.CloudprinterError({code:'permanent_test_error',message:'offline',status:ambiguous?503:400,retryable:ambiguous,ambiguous});return{};}};
 const impl=load('supabase/functions/print-orchestrator/index.ts',{...auth,...request,Deno:{env:{get(){return undefined}},serve(fn){handler=fn}},assertProductionFlowAllowed:async()=>{},authenticateRequest:async()=>actor,createAdminClient:()=>client,requireRole:()=>{},buildCorsHeaders:()=>({}),handleCorsPreflight:()=>null,jsonResponse:(body,status,headers)=>new Response(JSON.stringify(body),{status,headers}),getPrintProvider:()=>provider},['processSubmitJob']);
 return{impl,client,job,calls,logs,auth,handler};
}

const request = () => new Request('https://example.invalid/', { method: 'POST', body: '{}' });
for (const route of ['existing', 'created', 'ambiguous']) {
 test(`SQL transition error on ${route} submission cannot complete the job`, async () => {
  const s=setup({advanceError:true,exists:route==='existing',providerError:route==='ambiguous',ambiguous:route==='ambiguous'});
  await assert.rejects(s.impl.processSubmitJob(s.client,actor,s.job));
  assert(!s.calls.some(c=>c.name==='complete_print_fulfillment_job'&&c.args.p_status==='completed'));
 });
}
for (const state of ['canceled','cancelled','refunded','refund_pending']) {
 test(`terminal ${state} order with stale paid flag cannot reach a provider`, async () => {
  const s=setup({orderStatus:state});
  const result=await s.impl.processSubmitJob(s.client,actor,s.job);
  assert.equal(result.status,'canceled');
  assert(!s.calls.some(c=>['createOrder','getOrder'].includes(c.name)));
 });
}
test('non-paid order never reaches a provider',async()=>{
 const s=setup({paymentStatus:'refunded'});await assert.rejects(s.impl.processSubmitJob(s.client,actor,s.job));
 assert(!s.calls.some(c=>c.name==='createOrder'));
});
test('permanent provider refusal fails instead of retrying',async()=>{
 const s=setup({providerError:true});const response=await s.handler(request());const body=await response.json();
 assert.equal(body.results[0].status,'failed');
});
test('failure to persist a failed/retrying job returns failure, not HTTP 200',async()=>{
 const s=setup({providerError:true,completeError:true});const response=await s.handler(request());
 assert.equal(response.status,503); assert.notEqual((await response.json()).ok,true);
});
test('successful new submission transitions before completing',async()=>{
 const s=setup();await s.impl.processSubmitJob(s.client,actor,s.job);
 const names=s.calls.map(c=>c.name);assert(names.indexOf('getOrder')<names.indexOf('createOrder'));
 assert(names.indexOf('advance_print_order_state')<names.indexOf('complete_print_fulfillment_job'));
 assert.equal(names.filter(n=>n==='createOrder').length,1);
});
test('ambiguous create is reconciled without a second provider submission',async()=>{
 const s=setup({providerError:true,ambiguous:true});const r=await s.impl.processSubmitJob(s.client,actor,s.job);
 assert.equal(r.status,'completed');assert.equal(s.calls.filter(c=>c.name==='createOrder').length,1);
 assert.equal(s.calls.filter(c=>c.name==='getOrder').length,2);
});
test('returned audit error emits a non-sensitive failure signal and stays nonblocking',async()=>{
 const s=setup();await s.auth.writeAuditLog({adminClient:s.client,functionName:'test_function',status:'success'});
 assert.equal(s.logs.length,1);assert(!JSON.stringify(s.logs).includes('PRIVATE_customer_secret'));
 assert(JSON.stringify(s.logs).includes('audit_write_failed'));
});
test('successful audit insertion emits no failure signal',async()=>{
 const s=setup({auditError:false});await s.auth.writeAuditLog({adminClient:s.client,functionName:'test_function',status:'success'});
 assert.equal(s.logs.length,0);
});
test('thrown audit exceptions do not log customer or credential values',async()=>{
 const s=setup();const client={from(){return {insert(){throw new Error('PRIVATE_customer_secret')}}}};
 await s.auth.writeAuditLog({adminClient:client,functionName:'test_function',status:'success'});
 assert.equal(s.logs.length,1);assert(!JSON.stringify(s.logs).includes('PRIVATE_customer_secret'));
});
for(const limit of ['invalid',{},true,[1],-1,0,51]) {
 test(`invalid job limit ${JSON.stringify(limit)} is rejected before claiming jobs`,async()=>{
 const s=setup();const response=await s.handler(new Request('https://example.invalid/',{method:'POST',body:JSON.stringify({limit})}));
 assert.equal(response.status,400);assert(!s.calls.some(c=>c.name==='claim_print_fulfillment_jobs'));
 });
}
for (const channel of ['instagram','facebook','linkedin','tiktok','youtube','telegram','google_business','website','push']) {
 test(`connected ${channel} credentials alone cannot advertise an undeployed adapter`,()=>{
  let capabilities={};
  const file='supabase/functions/_shared/marketing-capabilities.ts';
  if(fs.existsSync(path.join(root,file))) capabilities=load(file,{},['getMarketingAdapterBlocker']);
  const client=load('src/marketing/marketingClient.ts', {...capabilities}, ['normalizeIntegration','normalizeChannels']);
  const result=client.normalizeIntegration({id:'test',channel,status:'available',description:'connected'},[]);
  assert.equal(result.status,'blocked_configuration');assert(result.description.includes('adaptateur'));
  const channels=client.normalizeChannels([{id:channel,availability:'available'}],[]);
  assert.equal(channels[0].availability,'blocked_configuration');
 });
}

for (const incoming of [[], [{id: 'email', availability: 'available'}]]) {
 test(`fallback channels cannot reintroduce unavailable external adapters (${incoming.length} incoming)`, () => {
  const caps=load('supabase/functions/_shared/marketing-capabilities.ts',{},['getMarketingAdapterBlocker']);
  const client=load('src/marketing/marketingClient.ts',caps,['normalizeChannels']);
  const fallback=[{id:'instagram',label:'Instagram',availability:'available',reason:'Credentials connected',costModel:'free'}];
  const rows=client.normalizeChannels(incoming,fallback);
  assert.equal(rows.find(row=>row.id==='instagram').availability,'blocked_configuration');
 });
}
for (const channel of ['email', 'in_app', 'manual_call', 'tok_news']) {
 test(`implemented or manual ${channel} keeps its own credential/consent state`, () => {
  const caps=load('supabase/functions/_shared/marketing-capabilities.ts',{},['getMarketingAdapterBlocker']);
  const client=load('src/marketing/marketingClient.ts',caps,['normalizeIntegration']);
  for (const status of ['available','blocked_configuration']) {
   assert.equal(client.normalizeIntegration({id:'test',channel,status},[]).status,status);
  }
 });
}
