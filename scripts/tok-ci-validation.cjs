'use strict';
const fs = require('node:fs');
const cp = require('node:child_process');
const crypto = require('node:crypto');
const os = require('node:os');
const path = require('node:path');
const TARGET = 'ff282f05550b719cc216a36ccb5c4f72a9500096';
const CONFIG_BLOB = '18a5c9fe5e381384eba970aa700b0ac856c289e9';
function isPassed(sourceVerified, gates) { return sourceVerified && gates.length > 0 && gates.every(g => g.code === 0); }
function gitBlobSha(bytes) { return crypto.createHash('sha1').update(Buffer.from('blob ' + bytes.length + '\0')).update(bytes).digest('hex'); }
function publicTestEnv(source) {
  const env = {};
  for (const key of ['PATH','HOME','TMPDIR','LANG','LC_ALL','TZ','PNPM_HOME','COREPACK_HOME','XDG_CACHE_HOME']) if (source[key]) env[key] = source[key];
  return Object.assign(env, { CI:'true', NO_COLOR:'1', VITE_SUPABASE_URL:'https://example.supabase.co', VITE_SUPABASE_PUBLISHABLE_KEY:'ci-public-placeholder', VITE_SUPABASE_ANON_KEY:'ci-public-placeholder' });
}
function sanitize(text) { return String(text).replace(/(?:sk_(?:live|test)_|whsec_|sb_secret_|ghp_|gho_|github_pat_)[A-Za-z0-9_-]+/g, '[REDACTED]').replace(/Bearer\s+[A-Za-z0-9_.-]{20,}/gi,'Bearer [REDACTED]'); }
// Actual gate exit codes are encoded for the deployment metadata when logs cannot be read.
// A READY validation deployment requires every command to have succeeded.
function resultExitCode(report) {
  const blockers = { EXACT_SOURCE_FETCH_FAILED: 21, ORIGINAL_CONFIGURATION_HASH_MISMATCH: 22, SOURCE_TREE_MISMATCH: 23 };
  if (report.blocker) return blockers[report.blocker] || 24;
  const expected = ['fetch-exact-source','exact-source-tree','pnpm-version','targeted-regressions','typecheck','lint','full-test-suite','application-build'];
  if (!report.sourceVerified || report.gates.length !== expected.length || !expected.every((label,i)=>report.gates[i].label === label)) return 25;
  if (report.gates[0].code !== 0 || report.gates[1].code !== 0) return 26;
  let mask = 0;
  report.gates.slice(2).forEach((gate,i)=>{ if (gate.code !== 0) mask |= 1 << i; });
  return mask ? 64 + mask : report.passed === true ? 0 : 27;
}
function prepareGitMetadata(cwd, env) {
  const options = { cwd, env, encoding:'utf8', timeout:20000, maxBuffer:1024*1024 };
  if (cp.spawnSync('git',['rev-parse','--git-dir'],options).status === 0) return false;
  const init = cp.spawnSync('git',['init','--initial-branch=ci/tok-682-build-validation'],options);
  if (init.status !== 0) throw new Error('SOURCE_GIT_INITIALIZATION_FAILED');
  return true;
}
async function main() {
  if (process.env.VERCEL_ENV !== 'preview' || !['ci/tok-682-vercel-validation-20260924','ci/tok-682-validation-signing-20260924'].includes(process.env.VERCEL_GIT_COMMIT_REF)) throw new Error('VALIDATION_PREVIEW_ONLY');
  const config = fs.readFileSync('vercel.json');
  const runnerPath = 'scripts/tok-ci-validation.cjs';
  const runnerBytes = fs.readFileSync(runnerPath);
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'tok-validation-'));
  const env = publicTestEnv(process.env);
  const report = {kind:'validation-report-only-not-an-application-release', targetSha:TARGET, runnerSha:process.env.VERCEL_GIT_COMMIT_SHA, startedAt:new Date().toISOString(), node:process.version, sourceVerified:false, gates:[], passed:false};
  const logs = [];
  function run(label, executable, args, timeout=300000) {
    const started = Date.now();
    const r = cp.spawnSync(executable,args,{env,encoding:'utf8',timeout,maxBuffer:32*1024*1024});
    const log = sanitize((r.stdout||'') + '\n' + (r.stderr||'') + (r.error ? '\n'+r.error.message : ''));
    const entry = {label, command:[executable,...args], code:r.status, signal:r.signal, durationMs:Date.now()-started, logSha256:crypto.createHash('sha256').update(log).digest('hex')};
    report.gates.push(entry); logs.push({label,log});
    console.log('TOK_GATE '+JSON.stringify(entry));
    return r;
  }
  try {
    const freshGit = prepareGitMetadata(process.cwd(), env);
    report.freshGitMetadata = freshGit;
    if (run('fetch-exact-source','git',['fetch','--no-tags','--depth=1','https://github.com/Mtnrconcept1/cloud-rebuild.git',TARGET],120000).status !== 0) throw new Error('EXACT_SOURCE_FETCH_FAILED');
    if (freshGit) {
      const reset = cp.spawnSync('git',['reset','--mixed',TARGET],{env,encoding:'utf8',timeout:30000,maxBuffer:1024*1024});
      if (reset.status !== 0) throw new Error('SOURCE_INDEX_INITIALIZATION_FAILED');
    }
    const original = cp.spawnSync('git',['show',TARGET+':vercel.json'],{env,timeout:10000,maxBuffer:1024*1024});
    if (original.status !== 0 || gitBlobSha(original.stdout) !== CONFIG_BLOB) throw new Error('ORIGINAL_CONFIGURATION_HASH_MISMATCH');
    fs.writeFileSync('vercel.json',original.stdout);
    // Remove only this temporary harness so lint/tests see the exact PR tree.
    fs.unlinkSync(runnerPath);
    if (run('exact-source-tree','git',['diff','--exit-code',TARGET,'--','.']).status !== 0) throw new Error('SOURCE_TREE_MISMATCH');
    report.sourceVerified = true;
    run('pnpm-version','pnpm',['--version']);
    run('targeted-regressions','node',['--test','scripts/tok-audit-reliability.test.mjs']);
    run('typecheck','pnpm',['typecheck']);
    run('lint','pnpm',['lint']);
    run('full-test-suite','pnpm',['test'],600000);
    run('application-build','pnpm',['build'],600000);
    // None of the commands above is a migration, deployment or provider operation.
    report.passed = isPassed(report.sourceVerified, report.gates);
  } catch (error) {
    report.blocker = sanitize(error.message); report.passed = false;
  } finally {
    fs.writeFileSync('vercel.json',config);
    fs.writeFileSync(runnerPath,runnerBytes);
    report.finishedAt = new Date().toISOString();
    const output = path.resolve('tok-validation-report');
    fs.mkdirSync(output,{recursive:true});
    fs.writeFileSync(path.join(output,'result.json'),JSON.stringify(report,null,2)+'\n');
    for (let i=0;i<logs.length;i++) fs.writeFileSync(path.join(output,String(i+1).padStart(2,'0')+'-'+logs[i].label+'.txt'),logs[i].log);
    const escape = s => String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
    fs.writeFileSync(path.join(output,'index.html'),'<!doctype html><html lang="fr"><meta charset="utf-8"><meta name="robots" content="noindex,nofollow"><title>TOK — rapport de validation uniquement</title><h1>'+ (report.passed ? 'Validations exécutées : réussies' : 'Validations : échec ou blocage')+'</h1><p>La publication de ce rapport ne signifie pas que les tests ont réussi. Aucun site applicatif ni changement de production n’est publié ici.</p><pre>'+escape(JSON.stringify(report,null,2))+'</pre></html>');
    fs.writeFileSync(path.join(tmp,'result.json'),JSON.stringify(report,null,2));
    console.log('TOK_VALIDATION passed='+report.passed+' target='+TARGET);
    process.exitCode = resultExitCode(report);
  }
}
module.exports = { isPassed, publicTestEnv, gitBlobSha, sanitize, resultExitCode, prepareGitMetadata, main };
if (require.main === module) main().catch(e=>{ console.error(sanitize(e.message)); process.exitCode=1; });
