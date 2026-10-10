from pathlib import Path
import json
import subprocess

paths = ['supabase/functions/courier-portal/index.ts', 'supabase/functions/dispatch-order/index.ts']
before = {path: Path(path).read_text(encoding='utf-8') for path in paths}
portal = before[paths[0]]
old = 'const rawShifts = Array.isArray(payload?.shifts) ? payload.shifts : [];'
assert portal.count(old) == 1
portal = portal.replace(old, 'const rawShifts: unknown[] = Array.isArray(payload?.shifts) ? payload.shifts : [];')
dispatch = before[paths[1]]
old = 'supabaseAdmin: ReturnType<typeof createClient>'
assert dispatch.count(old) == 2
dispatch = dispatch.replace(old, 'supabaseAdmin: ReturnType<typeof createAdminClient>')
old = '  const routeSteps = orderedPickups.map((pickup, index) => ({'
new = '''  type DispatchRouteStep = {
    id: string;
    type: "pickup" | "dropoff";
    label: string;
    address: string;
    latitude: number | null;
    longitude: number | null;
    restaurant_name?: string;
    order_id?: string | null;
    order_number?: string | null;
    step_index: number;
  };
  const routeSteps: DispatchRouteStep[] = orderedPickups.map((pickup, index) => ({'''
assert dispatch.count(old) == 1
dispatch = dispatch.replace(old, new)
after = dict(zip(paths, [portal, dispatch]))
# Type-only fixes must produce exactly the same JavaScript, not only pass tests.
check = '''import ts from 'typescript';
import assert from 'node:assert/strict';
let input='';for await(const chunk of process.stdin)input+=chunk;
const {before,after}=JSON.parse(input);
const options={module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022,removeComments:true};
for(const name of Object.keys(before)){
 const emit=source=>ts.transpileModule(source,{compilerOptions:options}).outputText;
 assert.equal(emit(after[name]),emit(before[name]),name+' changed runtime JavaScript');
 console.log('IDENTICAL_RUNTIME: '+name);
}
'''
subprocess.run(['node', '--input-type=module', '-e', check], input=json.dumps({'before': before, 'after': after}), text=True, check=True)
for path, content in after.items():
    Path(path).write_text(content, encoding='utf-8', newline='\n')
print('Fixed all observed Deno type errors without changing emitted JavaScript.')
