from pathlib import Path
import base64
import hashlib
import json
import os
import subprocess
import sys
import urllib.request

MIGRATION = Path('supabase/migrations/20261010223000_courier_dispatch_atomic.sql')
ALLOWED = {
    '.github/workflows/courier-atomic-postgres.yml',
    'docs/architecture/TOK_APPLICATION_REFERENCE.md',
    'docs/architecture/tok-application-search-index.json',
    'docs/testing/courier-dispatch-atomic.md',
    'scripts/test-courier-atomic-postgres.mjs',
    'src/test/courier-atomic-edge.test.ts',
    'src/test/dispatch-client-fallback.test.ts',
    'supabase/functions/courier-portal/index.ts',
    'supabase/functions/dispatch-order/index.ts',
    'supabase/functions/dispatch-timeout/index.ts',
    'supabase/functions/restaurant-order-status/index.ts',
    str(MIGRATION),
    'supabase/tests/courier_atomic_fixture.sql',
}

def replace_once(text, old, new):
    if text.count(old) != 1:
        raise RuntimeError('Source precondition failed: ' + old[:100])
    return text.replace(old, new)

def write(path, text):
    Path(path).write_text(text, encoding='utf-8', newline='\n')

EDGE_TEST = r'''import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { describe, expect, it, vi } from "vitest";

const compiled = ts.transpileModule(readFileSync("supabase/functions/courier-portal/index.ts", "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;

function harness(result: Record<string, unknown> | null, databaseError: Record<string, unknown> | null = null) {
  let handler: (request: Request) => Promise<Response>;
  class HttpError extends Error {
    constructor(public status: number, message: string) { super(message); }
  }
  const rpc = vi.fn().mockResolvedValue({ data: result, error: databaseError });
  const builder = {
    select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue({ data: { id: "courier-from-session", user_id: "signed-user", status: "approved" }, error: null }),
  };
  const client = { rpc, from: vi.fn((table: string) => {
    if (table !== "couriers") throw new Error(`Unexpected nontransactional write/read: ${table}`);
    return builder;
  }) };
  const actor = { userId: "signed-user", roles: ["courier"], adminClient: client };
  const authenticateRequest = vi.fn().mockResolvedValue(actor);
  const triggerNotificationDispatch = vi.fn().mockResolvedValue({ failedChannels: [] });
  const triggerDispatchOrder = vi.fn().mockResolvedValue({ ok: true });
  const enqueueNotification = vi.fn(() => { throw new Error("Acceptance must enqueue in SQL"); });
  const writeAuditLog = vi.fn().mockResolvedValue(undefined);
  const imports: Record<string, unknown> = {
    "../_shared/auth.ts": {
      HttpError, authenticateRequest, createAdminClient: () => client, writeAuditLog,
      requireRole: (current: typeof actor, roles: string[]) => {
        if (!current.roles.some(role => roles.includes(role))) throw new HttpError(403, "Forbidden");
      },
      jsonResponse: (data: unknown, status: number) => new Response(JSON.stringify(data), { status }),
    },
    "../_shared/delivery-dispatch.ts": { triggerDispatchOrder },
    "../_shared/notifications.ts": { triggerNotificationDispatch, enqueueNotification },
    "../_shared/cors.ts": { buildCorsHeaders: () => ({}), handleCorsPreflight: () => null },
    "../_shared/logging.ts": { makeLogger: () => ({ error: vi.fn() }) },
  };
  runInNewContext(compiled, {
    exports: {}, Response, Request, URL, console,
    Deno: { serve: (callback: typeof handler) => { handler = callback; } },
    require: (name: string) => { if (!(name in imports)) throw new Error(`Unexpected import ${name}`); return imports[name]; },
  });
  return {
    rpc, actor, authenticateRequest, HttpError, triggerNotificationDispatch, triggerDispatchOrder, enqueueNotification, writeAuditLog,
    call: (payload: Record<string, unknown> = {}) => handler(new Request("https://example.test/courier-portal", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "respond_attempt", attempt_id: "attempt-from-request", decision: "accept", ...payload }),
    })),
  };
}

const accepted = { status: "accepted", changed: true, order_id: "order-from-database", dispatch_job: { id: "job-from-database" }, redispatch: false };

describe("courier acceptance Edge boundary", () => {
  it("forwards the authenticated actor to one transaction and keeps notifications in SQL", async () => {
    const h = harness(accepted);
    const response = await h.call({ p_actor_user_id: "forged-user", courier_id: "forged-courier" });
    expect(response.status).toBe(200);
    expect(h.authenticateRequest).toHaveBeenCalledWith(expect.any(Request), { allowServiceRole: false });
    expect(h.rpc).toHaveBeenCalledExactlyOnceWith("respond_courier_dispatch_attempt", {
      p_attempt_id: "attempt-from-request", p_actor_user_id: "signed-user", p_decision: "accept",
    });
    expect(h.enqueueNotification).not.toHaveBeenCalled();
    expect(h.triggerNotificationDispatch).toHaveBeenCalledOnce();
    expect(h.triggerDispatchOrder).not.toHaveBeenCalled();
  });
  it.each(["attempt_already_processed", "attempt_expired", "courier_already_busy"])("preserves a transaction conflict: %s", async error => {
    const h = harness({ error, http_status: 409 });
    expect((await h.call()).status).toBe(409);
    expect(h.triggerNotificationDispatch).not.toHaveBeenCalled();
    expect(h.triggerDispatchOrder).not.toHaveBeenCalled();
  });
  it("does not reveal a foreign attempt", async () => {
    const h = harness({ error: "attempt_not_found", http_status: 404 });
    expect((await h.call()).status).toBe(404);
    expect(h.triggerNotificationDispatch).not.toHaveBeenCalled();
  });
  it("rejects unauthenticated and wrong-role callers before the transaction", async () => {
    const h = harness(accepted);
    h.authenticateRequest.mockRejectedValueOnce(new h.HttpError(401, "Unauthorized"));
    expect((await h.call()).status).toBe(401);
    h.actor.roles = ["restaurateur"];
    expect((await h.call()).status).toBe(403);
    expect(h.rpc).not.toHaveBeenCalled();
  });
  it.each([{ attempt_id: "" }, { decision: "cancel" }])("rejects invalid response input", async payload => {
    const h = harness(accepted);
    expect((await h.call(payload)).status).toBe(400);
    expect(h.rpc).not.toHaveBeenCalled();
  });
  it("keeps a successful acceptance when waking delivery workers fails", async () => {
    const h = harness(accepted);
    h.triggerNotificationDispatch.mockRejectedValueOnce(new Error("worker unavailable"));
    expect((await h.call()).status).toBe(200);
    expect(h.rpc).toHaveBeenCalledOnce();
    expect(h.enqueueNotification).not.toHaveBeenCalled();
  });
  it("allows a repeated accepted result without adding notifications", async () => {
    const h = harness({ ...accepted, changed: false });
    expect((await h.call()).status).toBe(200);
    expect(h.enqueueNotification).not.toHaveBeenCalled();
    expect(h.writeAuditLog).toHaveBeenCalledWith(expect.objectContaining({ metadata: expect.objectContaining({ changed: false }) }));
  });
  it("redispatches a decline only when the database requests it", async () => {
    const h = harness({ ...accepted, status: "declined", redispatch: true });
    expect((await h.call({ decision: "decline" })).status).toBe(200);
    expect(h.triggerDispatchOrder).toHaveBeenCalledWith({ dispatchJobId: "job-from-database", orderId: "order-from-database", round: 1 });
    expect(h.triggerNotificationDispatch).not.toHaveBeenCalled();
  });
  it("reports a failed transaction without leaking database details or firing side effects", async () => {
    const h = harness(null, { code: "XX000", message: "private database detail" });
    const response = await h.call();
    expect(response.status).toBe(500);
    expect(await response.text()).not.toContain("private database detail");
    expect(h.triggerNotificationDispatch).not.toHaveBeenCalled();
    expect(h.triggerDispatchOrder).not.toHaveBeenCalled();
  });
});
'''
HELPER = '''// Commit a privileged mutation after the RPC read, while its row lock waits.
// Catch only the deliberate sleep cancellation; locks were acquired outside it.
async function mutateWhileRpcWaits(attemptId, mutation, expression) {
  const mutator = session(`BEGIN; SET LOCAL application_name='courier_atomic_mutator';
    SELECT 1 FROM public.dispatch_attempts WHERE id='${attemptId}' FOR UPDATE;
    DO $$ BEGIN PERFORM pg_sleep(30); EXCEPTION WHEN query_canceled THEN NULL; END $$;
    ${mutation}; COMMIT;`);
  await waitFor("SELECT count(*) FROM pg_stat_activity WHERE application_name='courier_atomic_mutator' AND wait_event='PgSleep';", 1);
  const contender = session(`SET application_name='courier_atomic_revalidation'; ${service(`SELECT to_jsonb(${expression})`)}`);
  await waitFor("SELECT count(*) FROM pg_stat_activity WHERE application_name='courier_atomic_revalidation' AND wait_event_type='Lock';", 1);
  assert.equal(sql("SELECT pg_cancel_backend(pid) FROM pg_stat_activity WHERE application_name='courier_atomic_mutator' AND wait_event='PgSleep';"), 't');
  const mutationResult = await mutator;
  assert.equal(mutationResult.code, 0, mutationResult.errors);
  const result = await contender;
  assert.equal(result.code, 0, result.errors);
  return JSON.parse(result.output.trim());
}
'''
EXTRA = '''
// Guard the second read, not just the first snapshot of the offer.
const job9 = ensure(9); const attempt9 = offers(job9.id, [freeCourier])[0];
const deletedResponse = await mutateWhileRpcWaits(attempt9.id,
  `DELETE FROM public.dispatch_attempts WHERE id='${attempt9.id}'`, respond(attempt9.id, freeCourier));
assert.equal(deletedResponse.http_status, 404);
assert.equal(sql(`SELECT courier_id IS NULL AND status='searching' FROM public.dispatch_jobs WHERE id='${job9.id}';`), 't');
assert.equal(sql(`SELECT courier_id IS NULL FROM public.orders WHERE id='${order(9)}';`), 't');
assert.equal(sql(`SELECT count(*) FROM public.delivery_tracking WHERE order_id='${order(9)}';`), '0');
console.log('PASS deleted offer while acceptance waits cannot assign the order');

const job10 = ensure(10); const attempt10 = offers(job10.id, [freeCourier])[0];
sql(`UPDATE public.dispatch_attempts SET offered_at=now()-interval '2 hours' WHERE id='${attempt10.id}';`);
const courierRates = () => sql('SELECT jsonb_agg(jsonb_build_array(id,acceptance_rate) ORDER BY id) FROM public.couriers;');
const ratesBeforeDeletion = courierRates();
const deletedExpiry = await mutateWhileRpcWaits(attempt10.id,
  `DELETE FROM public.dispatch_attempts WHERE id='${attempt10.id}'`, `public.expire_courier_dispatch_attempt('${attempt10.id}')`);
assert.equal(deletedExpiry, false);
assert.equal(courierRates(), ratesBeforeDeletion);
console.log('PASS deleted offer while expiry waits is not counted or penalized');

const job11 = ensure(11); const attempt11 = offers(job11.id, [freeCourier])[0];
const reassignedResponse = await mutateWhileRpcWaits(attempt11.id,
  `UPDATE public.dispatch_attempts SET courier_id='${courier(winnerNo)}' WHERE id='${attempt11.id}'`, respond(attempt11.id, freeCourier));
assert.equal(reassignedResponse.http_status, 404);
assert.equal(sql(`SELECT courier_id IS NULL AND status='searching' FROM public.dispatch_jobs WHERE id='${job11.id}';`), 't');
assert.equal(sql(`SELECT status FROM public.dispatch_attempts WHERE id='${attempt11.id}';`), 'pending');
console.log('PASS reassigned offer while acceptance waits rejects the former actor');

const job12 = ensure(12); const attempt12 = offers(job12.id, [freeCourier])[0];
sql(`UPDATE public.dispatch_attempts SET offered_at=now()-interval '2 hours' WHERE id='${attempt12.id}';`);
const ratesBeforeReassignment = courierRates();
const reassignedExpiry = await mutateWhileRpcWaits(attempt12.id,
  `UPDATE public.dispatch_attempts SET courier_id='${courier(winnerNo)}' WHERE id='${attempt12.id}'`, `public.expire_courier_dispatch_attempt('${attempt12.id}')`);
assert.equal(reassignedExpiry, false, 'Stale expiry must not penalize a newly assigned courier whose row was not locked');
assert.equal(courierRates(), ratesBeforeReassignment);
assert.equal(sql(`SELECT status FROM public.dispatch_attempts WHERE id='${attempt12.id}';`), 'pending');
console.log('PASS reassigned offer while expiry waits leaves both couriers unpenalized');
'''

def apply():
    s = MIGRATION.read_text(encoding='utf-8')
    s = replace_once(s, "  SELECT * INTO v_courier FROM public.couriers WHERE id=v_attempt.courier_id FOR NO KEY UPDATE;", "  IF NOT FOUND THEN RETURN jsonb_build_object('error','attempt_not_found','http_status',404); END IF;\n  SELECT * INTO v_courier FROM public.couriers WHERE id=v_attempt.courier_id FOR NO KEY UPDATE;")
    old = "  SELECT * INTO v_attempt FROM public.dispatch_attempts WHERE id=p_attempt_id FOR UPDATE;\n  v_now := clock_timestamp(); -- Evaluate expiry AFTER waiting for contenders."
    s = replace_once(s, old, "  SELECT * INTO v_attempt FROM public.dispatch_attempts WHERE id=p_attempt_id FOR UPDATE;\n  IF NOT FOUND OR v_attempt.dispatch_job_id IS DISTINCT FROM v_job.id\n    OR v_attempt.courier_id IS DISTINCT FROM v_courier.id THEN\n    RETURN jsonb_build_object('error','attempt_not_found','http_status',404);\n  END IF;\n  v_now := clock_timestamp(); -- Evaluate expiry AFTER waiting for contenders.")
    s = replace_once(s, "  PERFORM 1 FROM public.couriers WHERE id=v_attempt.courier_id FOR NO KEY UPDATE;", "  IF NOT FOUND THEN RETURN false; END IF;\n  PERFORM 1 FROM public.couriers WHERE id=v_attempt.courier_id FOR NO KEY UPDATE;")
    s = replace_once(s, "  SELECT * INTO v_attempt FROM public.dispatch_attempts WHERE id=p_attempt_id FOR UPDATE;\n  v_now := clock_timestamp();", "  SELECT * INTO v_attempt FROM public.dispatch_attempts WHERE id=p_attempt_id FOR UPDATE;\n  IF NOT FOUND OR v_attempt.dispatch_job_id IS DISTINCT FROM v_job.id THEN RETURN false; END IF;\n  v_now := clock_timestamp();")
    write(MIGRATION, s)
    test = Path('src/test/courier-atomic-edge.test.ts')
    if test.exists():
        raise RuntimeError('Refusing to overwrite a concurrently added test')
    write(test, EDGE_TEST)
    runner = Path('scripts/test-courier-atomic-postgres.mjs')
    s = runner.read_text(encoding='utf-8')
    marker = "assert.ok(Number(sql('SHOW server_version_num;')) >= 170000);"
    s = replace_once(s, marker, HELPER + marker)
    marker = "console.log('PASS courier atomic PostgreSQL protocol');"
    s = replace_once(s, marker, EXTRA + marker)
    write(runner, s)
    doc = Path('docs/testing/courier-dispatch-atomic.md')
    s = doc.read_text(encoding='utf-8')
    old = '- Expiration concurrente et tardive, délai serveur, refus/rejeu, absence de régression après acceptation.'
    s = replace_once(s, old, old + '\n- Suppression ou réaffectation privilégiée d’une offre pendant l’attente du verrou : aucune affectation partielle ni pénalité sur le nouveau coursier.\n- Frontière Edge : acteur issu de la session, erreurs 401/403/404/409/500, refus des entrées invalides, reprise et réveil des workers sans nouvelle notification.')
    write(doc, s)
    print('Recovered observed local guards and Edge tests; added four PostgreSQL regression scenarios.')

def fix():
    s = MIGRATION.read_text(encoding='utf-8')
    marker = 'CREATE OR REPLACE FUNCTION public.expire_courier_dispatch_attempt(p_attempt_id uuid)'
    if s.count(marker) != 1:
        raise RuntimeError('Expiry function boundary changed')
    prefix, expiry = s.split(marker)
    expiry = replace_once(expiry, '  v_job public.dispatch_jobs%ROWTYPE;\n  v_now timestamptz;', '  v_job public.dispatch_jobs%ROWTYPE;\n  v_courier_id uuid;\n  v_now timestamptz;')
    expiry = replace_once(expiry, '  IF NOT FOUND THEN RETURN false; END IF;\n  SELECT * INTO v_job', '  IF NOT FOUND THEN RETURN false; END IF;\n  v_courier_id := v_attempt.courier_id;\n  SELECT * INTO v_job')
    expiry = replace_once(expiry, '  PERFORM 1 FROM public.couriers WHERE id=v_attempt.courier_id FOR NO KEY UPDATE;', '  PERFORM 1 FROM public.couriers WHERE id=v_courier_id FOR NO KEY UPDATE;\n  IF NOT FOUND THEN RETURN false; END IF;')
    expiry = replace_once(expiry, '  IF NOT FOUND OR v_attempt.dispatch_job_id IS DISTINCT FROM v_job.id THEN RETURN false; END IF;', '  IF NOT FOUND OR v_attempt.dispatch_job_id IS DISTINCT FROM v_job.id\n    OR v_attempt.courier_id IS DISTINCT FROM v_courier_id THEN RETURN false; END IF;')
    write(MIGRATION, prefix + marker + expiry)
    print('Expiry now revalidates the same courier whose row was locked.')

def publish():
    repo = 'Mtnrconcept1/cloud-rebuild'
    if os.environ['GITHUB_REPOSITORY'] != repo or os.environ['GITHUB_REF'] != 'refs/heads/codex/tok-courier-atomic-20261010':
        raise RuntimeError('Unexpected repository or branch')
    base = os.environ['BASE_SHA']
    def git(*args):
        return subprocess.check_output(['git', *args])
    files = git('diff', '--cached', '--name-only', base).decode().splitlines()
    if set(files) != ALLOWED:
        raise RuntimeError('Unexpected final scope: ' + repr(set(files).symmetric_difference(ALLOWED)))
    def post(endpoint, payload):
        request = urllib.request.Request('https://api.github.com/repos/' + repo + endpoint,
            data=json.dumps(payload).encode(), method='POST', headers={
                'Authorization': 'Bearer ' + os.environ['GH_TOKEN'],
                'Accept': 'application/vnd.github+json', 'Content-Type': 'application/json',
                'X-GitHub-Api-Version': '2022-11-28'})
        with urllib.request.urlopen(request, timeout=60) as response:
            return json.load(response)
    entries = []
    for path in files:
        content = git('show', ':' + path)
        content.decode('utf-8', errors='strict')
        expected = hashlib.sha1(b'blob ' + str(len(content)).encode() + b'\0' + content).hexdigest()
        blob = post('/git/blobs', {'content': base64.b64encode(content).decode(), 'encoding': 'base64'})
        if blob['sha'] != expected:
            raise RuntimeError('Blob mismatch: ' + path)
        mode = git('ls-files', '--stage', '--', path).decode().split()[0]
        entries.append({'path': path, 'mode': mode, 'type': 'blob', 'sha': expected})
    expected_tree = git('write-tree').decode().strip()
    tree = post('/git/trees', {'base_tree': git('rev-parse', base + '^{tree}').decode().strip(), 'tree': entries})
    if tree['sha'] != expected_tree:
        raise RuntimeError('Published tree differs from tested index')
    result = {'tree_sha': expected_tree, 'initial_head': os.environ['GITHUB_SHA'], 'base_sha': base, 'files': files}
    evidence = Path(os.environ['RUNNER_TEMP']) / 'courier-recovery-evidence'
    write(evidence / 'result.json', json.dumps(result, indent=2) + '\n')
    (evidence / 'complete-change.patch').write_bytes(git('diff', '--cached', '--binary', base))
    print('RECOVERY_VERIFIED=' + json.dumps(result))
    # No commit, ref update, merge or deployment is performed here.

if __name__ == '__main__':
    {'apply': apply, 'fix': fix, 'publish': publish}[sys.argv[1]]()
