import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import ts from "typescript";
import { afterEach, describe, expect, it, vi } from "vitest";
import * as contract from "../../supabase/functions/_shared/tok-connect-customer-commerce";

// Execute the real Edge handler with in-memory provider boundaries; no production writes.
const source=readFileSync("supabase/functions/tok-connect-app-bridge/index.ts","utf8")
  .replace(/import\s[\s\S]*?from\s["'][^"']+["'];/g,"");
const compiled=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.None}}).outputText;
class HttpError extends Error {constructor(public status:number,message:string){super(message)}}
const restaurant="12f4babe-9438-4fda-8892-20c26ea7f7bb";
const attempt="d9f6ad38-4ed7-42eb-8293-8ef38f4e6cdd";
const item="d6e50f04-5777-4d5a-906d-c77af199dd1e";
const input={mode:"customer_commerce",action:"checkout",restaurant_id:restaurant,journey:"takeaway",items:[{menu_item_id:item,quantity:1}],date:"2026-10-20",time:"19:00",confirmed_by_user:true,expected_total_cents:2400,payment_attempt_id:attempt,idempotency_key:"tok-cart:"+attempt};
function harness(options:{disabled?:boolean;timeout?:boolean;state?:string;routingBlocked?:boolean}={}){
 vi.useFakeTimers();vi.setSystemTime(new Date("2026-10-16T12:00:00Z"));
 const records=new Map<string,Record<string,unknown>>();const writes:string[]=[];
 const db={from:(table:string)=>{
  const filters:Record<string,unknown>={};let update:Record<string,unknown>|null=null;
  const key=()=>filters.user_id+":"+filters.idempotency_key;
  const query={select:()=>query,eq:(k:string,v:unknown)=>{filters[k]=v;return query},
   maybeSingle:async()=>({data:table==="restaurants"?{id:restaurant,name:"TOK",is_active:true,status:"active",tok_connect_mcp_enabled:!options.disabled}:records.get(key())||null,error:null}),
   insert:async(row:Record<string,unknown>)=>{const id=row.user_id+":"+row.idempotency_key;if(records.has(id))return {error:{code:"23505"}};records.set(id,{...row});return {error:null}},
   update:(row:Record<string,unknown>)=>{update=row;return query},
   then:(resolve:(value:unknown)=>unknown)=>{if(update)records.set(key(),{...records.get(key()),...update});return Promise.resolve(resolve({error:null}))},
  };return query;
 }};
 const fetch=vi.fn(async(url:string,init:RequestInit)=>{
  const name=url.split("/").at(-1)!;const body=JSON.parse(String(init.body));
  if(name==="validate-order"){if(!body.preview_only)writes.push("order");return Response.json({verified_total:24,order_id:"order-1"});}
  if(name==="create-checkout"){writes.push("stripe");if(options.timeout)throw new Error("Connection interrupted");return Response.json({url:"https://checkout.stripe.com/c/pay/test"});}
  if(name==="payment-attempt-status")return Response.json({state:options.state||"paid",payment_status:options.state==="indeterminate"?null:"paid"});
  throw new Error("Unexpected endpoint "+name);
 });
 const deps={HttpError,...contract,Deno:{env:{get:()=>"https://tok.test"},serve:()=>{}},fetch,
  requireUserRole:(actor:{roles:string[]},roles:string[])=>{if(!actor.roles.some(r=>roles.includes(r)))throw new HttpError(403,"forbidden")},
  sha256Base64Url:async(s:string)=>createHash("sha256").update(s).digest("hex"),
  isClientCheckoutRestaurantEligible:(r:unknown)=>Boolean(r),
  resolveMarketplaceRouting:async()=>{if(options.routingBlocked)throw new HttpError(503,"MARKETPLACE_CONNECT_ROUTING_NOT_READY");return {enabled:true,mode:"stripe_connect_destination"}},
  buildVerifiedOrderPricing:async()=>({total:24,subtotal:24,discountAmount:0,validatedItems:[{menuItemId:item,name:"Risotto",unitPrice:24,quantity:1}]}),
 };
 const invoke=new Function(...Object.keys(deps),compiled+";return invokeCustomerCommerce;")(...Object.values(deps));
 const actor={userId:"customer-1",roles:["client"],adminClient:db};
 const request=new Request("https://tok.test",{headers:{authorization:"Bearer test-customer"}});
 return {call:(body=input,customActor=actor)=>invoke(request,customActor,body),actor,records,writes,fetch};
}
afterEach(()=>vi.useRealTimers());
describe("TOK customer commerce server orchestration",()=>{
 it("rejects an unavailable Stripe Connect route before creating any provisional order, returning a safe retry status",async()=>{
  const h=harness({routingBlocked:true});const result=await h.call();
  expect(result).toMatchObject({statusCode:503,payload:{ok:false,retry_safe:true}});
  expect(result.payload.error).toMatchObject({code:"MARKETPLACE_CONNECT_ROUTING_NOT_READY"});
  expect(h.writes).toEqual([]);
  expect((await h.call()).payload).toMatchObject({ok:false,replayed:true,retry_safe:true});
  expect(h.writes).toEqual([]);
 });
 it("replays a successful checkout without creating a second order or Stripe session",async()=>{
  const h=harness();expect((await h.call()).payload.ok).toBe(true);
  expect((await h.call()).payload.replayed).toBe(true);
  expect(h.writes).toEqual(["order","stripe"]);
 });
 it("rejects a changed body with the same attempt key",async()=>{
  const h=harness();await h.call();
  await expect(h.call({...input,time:"20:00"})).rejects.toThrow("different_body");
  expect(h.writes).toEqual(["order","stripe"]);
 });
 it("refuses a disabled MCP restaurant before creating an order",async()=>{
  const h=harness({disabled:true});const result=await h.call();
  expect(result.payload).toMatchObject({ok:false,retry_safe:true});expect(h.writes).toEqual([]);
 });
 it("rejects repricing before any mutation and recovers this proof via status",async()=>{
  const h=harness();const result=await h.call({...input,expected_total_cents:100});
  expect(result.payload).toMatchObject({ok:false,retry_safe:true});expect(h.writes).toEqual([]);
  expect((await h.call({...input,action:"status"})).payload).toMatchObject({state:"rejected",retry_safe:true,paid:false});
 });
 it("keeps an interrupted provider write locked and never creates another session on retry",async()=>{
  const h=harness({timeout:true});expect((await h.call()).payload).toMatchObject({ok:false,retry_safe:false});
  expect((await h.call()).payload).toMatchObject({ok:false,replayed:true,retry_safe:false});
  expect(h.writes).toEqual(["order","stripe"]);
 });
 it("isolates idempotency records by authenticated owner",async()=>{
  const h=harness();await h.call();await h.call(input,{...h.actor,userId:"customer-2"});
  expect(h.records.size).toBe(2);expect(h.writes).toEqual(["order","stripe","order","stripe"]);
 });
 it("rejects absent consent and non-client roles without any mutation",async()=>{
  const h=harness();await expect(h.call({...input,confirmed_by_user:false})).rejects.toThrow("confirmation_required");
  await expect(h.call(input,{...h.actor,roles:["restaurateur"]})).rejects.toThrow("forbidden");
  expect(h.writes).toEqual([]);
 });
});
