import { spawnSync } from "node:child_process";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

const root = process.cwd();
const retryScript = readFileSync(
  resolve(root, "scripts/supabase-ci-retry.sh"),
  "utf8",
);
const workspaces: string[] = [];

const fakePnpm = `#!/usr/bin/env bash
set -euo pipefail

printf '%s\\n' "$*" >> "$CALL_LOG"
arguments="$*"

case "\${SCENARIO:-success}" in
  success)
    exit 0
    ;;
  later-transient)
    if [[ "$arguments" == *"functions deploy beta "* ]]; then
      counter_file="$STATE_DIR/beta-attempts"
      count=0
      if [[ -f "$counter_file" ]]; then
        count="$(cat "$counter_file")"
      fi
      count=$((count + 1))
      printf '%s' "$count" > "$counter_file"
      if [[ "$count" -eq 1 ]]; then
        echo "error code: 502"
        exit 1
      fi
    fi
    exit 0
    ;;
  function-existing)
    if [[ "$arguments" == *"functions deploy alpha "* ]]; then
      echo '{"message":"deployment already exists"}'
      exit 1
    fi
    exit 0
    ;;
  generic-existing)
    echo '{"message":"deployment already exists"}'
    exit 1
    ;;
  *)
    echo "unknown fake scenario" >&2
    exit 91
    ;;
esac
`;

type Workspace = {
  root: string;
  callLog: string;
  stateDir: string;
  binDir: string;
};

function createWorkspace(functionNames: string[] = []): Workspace {
  const workspaceRoot = mkdtempSync(join(tmpdir(), "tok-supabase-retry-"));
  workspaces.push(workspaceRoot);

  const scriptsDir = join(workspaceRoot, "scripts");
  const functionsDir = join(workspaceRoot, "supabase", "functions");
  const binDir = join(workspaceRoot, "bin");
  const stateDir = join(workspaceRoot, "state");
  mkdirSync(scriptsDir, { recursive: true });
  mkdirSync(functionsDir, { recursive: true });
  mkdirSync(binDir, { recursive: true });
  mkdirSync(stateDir, { recursive: true });

  writeFileSync(join(scriptsDir, "supabase-ci-retry.sh"), retryScript, "utf8");
  writeFileSync(join(binDir, "pnpm"), fakePnpm, "utf8");
  chmodSync(join(binDir, "pnpm"), 0o755);

  for (const functionName of functionNames) {
    mkdirSync(join(functionsDir, functionName), { recursive: true });
  }

  return {
    root: workspaceRoot,
    callLog: join(workspaceRoot, "calls.log"),
    stateDir,
    binDir,
  };
}

function runRetry(
  workspace: Workspace,
  command: string,
  scenario = "success",
) {
  const result = spawnSync(
    "bash",
    ["-c", `source ./scripts/supabase-ci-retry.sh\n${command}`],
    {
      cwd: workspace.root,
      encoding: "utf8",
      env: {
        ...process.env,
        // These tests exercise retry/isolation behavior, not the production
        // stale-head gate. Do not inherit ambient GitHub Actions production
        // variables from the parent CI job into the temporary workspace.
        GITHUB_ACTIONS: "false",
        GITHUB_REF_NAME: "test",
        GITHUB_SHA: "test-sha",
        PATH: `${workspace.binDir}:${process.env.PATH || ""}`,
        CALL_LOG: workspace.callLog,
        STATE_DIR: workspace.stateDir,
        SCENARIO: scenario,
        SUPABASE_CLI_VERSION: "2.102.0",
        SUPABASE_CLI_RETRY_ATTEMPTS: "3",
        SUPABASE_CLI_RETRY_DELAY_SECONDS: "0",
      },
    },
  );

  return {
    status: result.status,
    output: `${result.stdout || ""}${result.stderr || ""}`,
    calls: existsSync(workspace.callLog)
      ? readFileSync(workspace.callLog, "utf8").trim().split("\n").filter(Boolean)
      : [],
  };
}

afterEach(() => {
  while (workspaces.length > 0) {
    const workspace = workspaces.pop();
    if (workspace) rmSync(workspace, { recursive: true, force: true });
  }
});

describe("Supabase Edge Function deployment retry", () => {
  it("deploys every function individually and excludes _shared", () => {
    const workspace = createWorkspace(["alpha", "beta", "_shared"]);
    const result = runRetry(
      workspace,
      "supabase_ci_retry functions deploy --project-ref test-project --use-api --jobs 4",
    );

    expect(result.status).toBe(0);
    expect(result.calls).toHaveLength(2);
    expect(result.calls.filter((call) => call.includes("functions deploy alpha"))).toHaveLength(1);
    expect(result.calls.filter((call) => call.includes("functions deploy beta"))).toHaveLength(1);
    expect(result.calls.some((call) => call.includes("_shared"))).toBe(false);
  });

  it("retries only the failing function without replaying prior successes", () => {
    const workspace = createWorkspace(["alpha", "beta", "gamma"]);
    const result = runRetry(
      workspace,
      "supabase_ci_retry functions deploy --project-ref test-project --use-api --jobs 4",
      "later-transient",
    );

    expect(result.status).toBe(0);
    expect(result.calls.filter((call) => call.includes("functions deploy alpha"))).toHaveLength(1);
    expect(result.calls.filter((call) => call.includes("functions deploy beta"))).toHaveLength(2);
    expect(result.calls.filter((call) => call.includes("functions deploy gamma"))).toHaveLength(1);
  });

  it("accepts the exact existing-deployment conflict only for an isolated function deploy", () => {
    const workspace = createWorkspace(["alpha"]);
    const functionResult = runRetry(
      workspace,
      "supabase_ci_retry functions deploy alpha --project-ref test-project --use-api",
      "function-existing",
    );

    expect(functionResult.status).toBe(0);
    expect(functionResult.calls).toHaveLength(1);
    expect(functionResult.output).toContain("isolated function deploy as an idempotent success");

    const genericWorkspace = createWorkspace();
    const genericResult = runRetry(
      genericWorkspace,
      "supabase_ci_retry link --project-ref test-project",
      "generic-existing",
    );

    expect(genericResult.status).not.toBe(0);
    expect(genericResult.calls).toHaveLength(1);
    expect(genericResult.output).not.toContain("idempotent success");
  });

  it("fails before invoking Supabase for invalid or missing function directories", () => {
    const invalidWorkspace = createWorkspace(["alpha"]);
    const invalidResult = runRetry(
      invalidWorkspace,
      "supabase_ci_retry functions deploy '../invalid' --project-ref test-project",
    );
    expect(invalidResult.status).not.toBe(0);
    expect(invalidResult.calls).toHaveLength(0);
    expect(invalidResult.output).toContain("Invalid Edge Function name");

    const missingWorkspace = createWorkspace(["alpha"]);
    const missingResult = runRetry(
      missingWorkspace,
      "supabase_ci_retry functions deploy missing --project-ref test-project",
    );
    expect(missingResult.status).not.toBe(0);
    expect(missingResult.calls).toHaveLength(0);
    expect(missingResult.output).toContain("does not exist locally");
  });
});
