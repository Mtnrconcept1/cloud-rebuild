import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const setup = readFileSync(new URL("./setup-windows.ps1", import.meta.url), "utf8");
const runner = readFileSync(new URL("./run-windows-worker.ps1", import.meta.url), "utf8");
const parameterBlock = setup.slice(setup.indexOf("param("), setup.indexOf("\n)\n") + 3);

test("configure le projet TOK et les deux modèles Ollama attendus", () => {
  assert.match(setup, /https:\/\/wwcrtyoueexyxkkikaos\.supabase\.co/);
  assert.match(setup, /qwen2\.5vl:3b/);
  assert.match(setup, /all-minilm/);
  assert.match(setup, /Assert-MinimumVersion "Node\.js"/);
  assert.match(setup, /Assert-MinimumVersion "Ollama"/);
});

test("ne reçoit ni ne journalise la Secret key en argument", () => {
  assert.match(setup, /Read-Host[\s\S]+-AsSecureString/);
  assert.doesNotMatch(parameterBlock, /ServiceRoleKey/i);
  assert.doesNotMatch(setup, /OPENAI_API_KEY/);
  assert.doesNotMatch(setup, /(?:sb_secret_|eyJ)[A-Za-z0-9_-]{20,}/);
  assert.doesNotMatch(setup, /Write-(?:Host|Output|Verbose).*serviceRoleKey/i);
  assert.match(setup, /return \$json\.role -eq "service_role"/);
});

test("protège le fichier secret et évite l'exécution de chaînes arbitraires", () => {
  assert.match(setup, /SetAccessRuleProtection\(\$true, \$false\)/);
  assert.match(setup, /Set-Acl -LiteralPath \$Path/);
  assert.match(setup, /S-1-5-18/);
  assert.match(setup, /Move-Item -LiteralPath \$temporaryEnvironmentFile/);
  assert.doesNotMatch(setup, /Invoke-Expression|\biex\b/i);
  assert.doesNotMatch(runner, /Invoke-Expression|\biex\b/i);
});

test("installe les dépendances de manière reproductible et valide les services", () => {
  assert.match(setup, /ci --omit=dev --ignore-scripts/);
  assert.match(setup, /check\.mjs/);
  assert.match(setup, /api\/tags/);
  assert.match(setup, /pull \$VisionModel/);
  assert.match(setup, /pull \$EmbeddingModel/);
  assert.match(setup, /run syntax/);
  assert.match(setup, /Source test/);
});

test("installe un démarrage automatique limité au compte courant", () => {
  assert.match(setup, /New-ScheduledTaskTrigger -AtLogOn -User \$identity\.Name/);
  assert.match(setup, /LogonType = "Interactive"/);
  assert.match(setup, /RunLevel = "Limited"/);
  assert.match(setup, /-Foreground/);
  assert.match(setup, /RestartCount = 20/);
  assert.match(setup, /MultipleInstances = "IgnoreNew"/);
  assert.match(setup, /Start-ScheduledTask -TaskName \$TaskName/);
});

test("le lanceur empêche les doublons et attend la disponibilité réelle", () => {
  assert.match(runner, /\/healthz/);
  assert.match(runner, /\/readyz/);
  assert.match(runner, /Le worker TOK est déjà actif/);
  assert.match(runner, /existingReady\.ready -and \$existingReady\.supabase -and \$existingReady\.ollama/);
  assert.match(runner, /Test-TokHealth \$ready\) -and \$ready\.ready -and \$ready\.supabase -and \$ready\.ollama/);
  assert.match(setup, /Test-TokHealth \$ready\) -and \$ready\.ready -and \$ready\.supabase -and \$ready\.ollama/);
  assert.match(setup, /if \(-not \$workerReady\)/);
  assert.match(runner, /Start-Process/);
  assert.match(runner, /Stop-Process -Id \$process\.Id/);
  assert.match(runner, /Test-OllamaModels/);
  assert.ok(runner.indexOf("Test-OllamaModels $ollamaUrl") < runner.indexOf("$EntryPoint 1>>"));
  assert.ok(runner.indexOf("check.mjs") < runner.indexOf("$EntryPoint 1>>"));
});

test("les journaux restent locaux et sont bornés", () => {
  assert.match(runner, /\$env:LOCALAPPDATA "TOK\\image-ai-worker"/);
  assert.match(runner, /10MB/);
  assert.doesNotMatch(runner, /SUPABASE_SERVICE_ROLE_KEY/);
});

test("limite la santé Windows à localhost sur un port dédié", () => {
  assert.match(setup, /HEALTH_HOST=127\.0\.0\.1/);
  assert.match(setup, /HEALTH_PORT=18080/);
  assert.doesNotMatch(setup, /HEALTH_HOST=0\.0\.0\.0/);
});
