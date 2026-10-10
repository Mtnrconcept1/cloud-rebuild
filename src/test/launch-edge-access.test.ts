import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { describe, expect, it, vi } from 'vitest';
const compiled=ts.transpileModule(readFileSync('supabase/functions/_shared/auth.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const module:Record<string,any>={};
runInNewContext(compiled,{exports:module,URL,console,require:()=>({createClient:()=>{throw new Error('No network');}})});
function actor(roles=['client'],enabled:unknown=true,error:unknown=null) {
 return {isAdmin:roles.includes('admin'),isServiceRole:false,roles,adminClient:{rpc:vi.fn().mockResolvedValue({data:{enabled},error})}};
}
describe('real Edge launch authorization',()=>{
 it('denies client even when countdown would have expired',async()=>{await expect(module.assertClientLaunchOpen(actor())).rejects.toMatchObject({status:403});});
 it('opens only with explicit false',async()=>{await expect(module.assertClientLaunchOpen(actor(['client'],false))).resolves.toBeUndefined();});
 it.each([undefined,null,'false',0])('fails closed on invalid flag %j',async enabled=>{await expect(module.assertClientLaunchOpen(actor(['client'],enabled??null))).rejects.toMatchObject({status:503});});
 it('fails closed on API error',async()=>{await expect(module.assertClientLaunchOpen(actor(['client'],false,{}))).rejects.toMatchObject({status:503});});
 it('preserves admin and service jobs',async()=>{await expect(module.assertClientLaunchOpen(actor(['admin']))).resolves.toBeUndefined();await expect(module.assertClientLaunchOpen({...actor(),isServiceRole:true})).resolves.toBeUndefined();});
 it('restaurant cannot invoke client business functions',async()=>{await expect(module.assertLaunchRequestAllowed(actor(['restaurateur']),new Request('https://example.test/functions/v1/ai-client-chat'))).rejects.toMatchObject({status:403});});
 it('restaurant can prepare media, client cannot spoof path suffix',async()=>{await expect(module.assertLaunchRequestAllowed(actor(['restaurateur']),new Request('https://example.test/functions/v1/menu-image-import'))).resolves.toBeUndefined();await expect(module.assertLaunchRequestAllowed(actor(),new Request('https://example.test/functions/v1/ai-client-chat/submit-signup-application'))).rejects.toMatchObject({status:403});});
 it('preserves signup and account deletion',async()=>{for(const endpoint of ['submit-signup-application','delete-account'])await expect(module.assertLaunchRequestAllowed(actor(),new Request('https://example.test/'+endpoint))).resolves.toBeUndefined();});
});
