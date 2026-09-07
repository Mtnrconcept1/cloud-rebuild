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
  it("uses the Node HTTPS compatibility layer for Cloudprinter instead of the failing Edge fetch client", () => {
    const provider = read("supabase/functions/_shared/print/cloudprinter.ts");

    expect(provider).toContain('from "node:https"');
    expect(provider).toContain("httpsRequest(");
    expect(provider).toContain('minVersion: "TLSv1.2"');
    expect(provider).toContain('maxVersion: "TLSv1.2"');
    expect(provider).toContain("request.setTimeout(REQUEST_TIMEOUT_MS");
    expect(provider).not.toContain("Deno.createHttpClient");
    expect(provider).not.toContain("client: getCloudprinterHttpClient()");
  });

  it("keeps Cloudprinter transport failures diagnosable without leaking request payloads or API keys", () => {
    const provider = read("supabase/functions/_shared/print/cloudprinter.ts");

    expect(provider).toContain("cloudprinterNetworkErrorCode");
    expect(provider).toContain("transportCode");
    expect(provider).not.toContain("JSON.stringify(payload), error");
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
