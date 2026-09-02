import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const scriptPath = resolve(process.cwd(), "scripts/supabase-ci-retry.sh");
const script = readFileSync(scriptPath, "utf8");

describe("Supabase production deploy stale-head guard", () => {
  it("keeps the retry wrapper valid Bash", () => {
    expect(() => execFileSync("bash", ["-n", scriptPath], { stdio: "pipe" })).not.toThrow();
  });

  it("fails closed when a main production workflow is no longer the branch head", () => {
    expect(script).toContain("supabase_ci_assert_current_production_head()");
    expect(script).toContain('[[ "${GITHUB_ACTIONS:-}" != "true" ]]');
    expect(script).toContain('main|master) ;;');
    expect(script).toContain('git ls-remote --heads origin "refs/heads/${GITHUB_REF_NAME}"');
    expect(script).toContain('[[ "$remote_sha" != "$GITHUB_SHA" ]]');
    expect(script).toContain("Refusing Supabase production deploy from stale commit");

    const guardCall = script.indexOf("supabase_ci_assert_current_production_head || return $?");
    const genericCommand = script.indexOf('supabase_ci_retry_command "generic" "$@"');
    expect(guardCall).toBeGreaterThan(-1);
    expect(genericCommand).toBeGreaterThan(guardCall);
  });

  it("does not weaken migration-history errors into retryable successes", () => {
    expect(script).not.toContain("migration repair");
    expect(script).not.toContain("Remote migration versions not found");
    expect(script).not.toContain("--status reverted");
  });
});
