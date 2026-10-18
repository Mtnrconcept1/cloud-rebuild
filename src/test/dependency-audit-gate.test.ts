import { mkdtempSync, writeFileSync, chmodSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { afterEach, describe, expect, it } from "vitest";

const directories: string[] = [];
afterEach(() => { for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true }); });

function run(response: string, status: number) {
  const directory = mkdtempSync(join(tmpdir(), "tok-audit-fixture-"));
  directories.push(directory);
  const executable = join(directory, "pnpm");
  writeFileSync(executable, `#!/usr/bin/env bash\nprintf '%s\\n' '${response}'\nexit ${status}\n`);
  chmodSync(executable, 0o700);
  return spawnSync("bash", [resolve("scripts/ci-pnpm-audit.sh")], {
    encoding: "utf8", timeout: 10_000,
    env: { ...process.env, PATH: `${directory}:${process.env.PATH}`, PNPM_AUDIT_MAX_ATTEMPTS: "2", PNPM_AUDIT_RETRY_DELAY_SECONDS: "0" },
  });
}

describe("dependency security gate", () => {
  it("allows a completed clean audit", () => expect(run("No vulnerabilities found", 0).status).toBe(0));
  it("fails when the registry never returns a readable result", () => {
    const result = run("Unexpected token while decoding gzip: invalid JSON", 1);
    expect(result.status).toBe(1);
    expect(result.stdout).toContain("Dependency audit unavailable");
    expect(result.stdout).toContain("attempt 2/2");
  });
  it("preserves a vulnerability failure without transport retries", () => {
    const result = run("high severity vulnerability found", 2);
    expect(result.status).toBe(2);
    expect(result.stdout).not.toContain("attempt 2/2");
  });
});
