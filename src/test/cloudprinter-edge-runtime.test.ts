import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();

function read(path: string) {
  return readFileSync(resolve(root, path), "utf8");
}

function renderSecrets(overrides: NodeJS.ProcessEnv) {
  const directory = mkdtempSync(resolve(tmpdir(), "tok-cloudprinter-secrets-"));
  const output = resolve(directory, "functions.env");
  const env: NodeJS.ProcessEnv = { ...process.env };
  delete env.CLOUDPRINTER_API_KEY;
  delete env.CLOUDPRINTER_WEBHOOK_API_KEY;
  delete env.CLOUDPRINTER_MODE;
  Object.assign(env, overrides);

  try {
    execFileSync(process.execPath, [
      resolve(root, "scripts/write-supabase-secrets-env.mjs"),
      `--out=${output}`,
    ], {
      cwd: root,
      env,
      stdio: "pipe",
    });
    return readFileSync(output, "utf8");
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

describe("Cloudprinter Edge runtime hardening", () => {
  it("forces Cloudprinter provider calls through an HTTP/1.1-only Deno client", () => {
    const provider = read("supabase/functions/_shared/print/cloudprinter.ts");

    expect(provider).toContain("Deno.createHttpClient");
    expect(provider).toContain("http1: true");
    expect(provider).toContain("http2: false");
    expect(provider).toContain("client: getCloudprinterHttpClient()");
  });

  it("preserves an existing provider mode during generic secret sync but stays fail-closed for partial provisioning", () => {
    const provider = read("supabase/functions/_shared/print/cloudprinter.ts");
    const dedicatedWorkflow = read(".github/workflows/sync-cloudprinter-secrets.yml");

    expect(renderSecrets({})).not.toContain("CLOUDPRINTER_MODE=");
    expect(renderSecrets({ CLOUDPRINTER_API_KEY: "provider-key" })).toContain("CLOUDPRINTER_MODE=disabled");
    expect(renderSecrets({
      CLOUDPRINTER_API_KEY: "provider-key",
      CLOUDPRINTER_MODE: "sandbox",
    })).toContain("CLOUDPRINTER_MODE=sandbox");

    expect(provider).toContain('Deno.env.get("CLOUDPRINTER_MODE") || "disabled"');
    expect(dedicatedWorkflow).toContain("CLOUDPRINTER_MODE=%s");
    expect(dedicatedWorkflow).toContain("MODE: ${{ inputs.mode }}");
  });
});
