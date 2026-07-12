import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const indexSource = readFileSync(new URL("./index.js", import.meta.url), "utf8");
const composeSource = readFileSync(new URL("./docker-compose.yml", import.meta.url), "utf8");

test("waits for Supabase and Ollama before claiming jobs", () => {
  const loop = indexSource.indexOf("while (!state.shuttingDown)");
  const probe = indexSource.indexOf("await probeDependencies(supabase, config, state)", loop);
  const readinessGuard = indexSource.indexOf("if (!state.supabaseReady || !state.ollamaReady)", loop);
  const claim = indexSource.indexOf("const jobs = await claimJobs", loop);

  assert.ok(loop > 0);
  assert.ok(probe > loop);
  assert.ok(readinessGuard > probe);
  assert.ok(claim > readinessGuard);
  assert.match(indexSource, /state\.ollamaReady = false/);
});

test("binds native health checks through validated configuration", () => {
  assert.match(indexSource, /server\.listen\(config\.healthPort, config\.healthHost\)/);
  assert.doesNotMatch(indexSource, /server\.listen\(config\.healthPort, "0\.0\.0\.0"\)/);
});

test("keeps Docker health access explicit inside the container", () => {
  assert.match(composeSource, /HEALTH_HOST: "0\.0\.0\.0"/);
  assert.match(composeSource, /127\.0\.0\.1:\$\{WORKER_HEALTH_PORT:-8080\}:8080/);
});
