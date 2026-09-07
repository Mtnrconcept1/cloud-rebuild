import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();

function read(path: string) {
  return readFileSync(resolve(root, path), "utf8");
}

describe("Cloudprinter Edge runtime hardening", () => {
  it("forces Cloudprinter provider calls through an HTTP/1.1-only Deno client", () => {
    const provider = read("supabase/functions/_shared/print/cloudprinter.ts");

    expect(provider).toContain("Deno.createHttpClient");
    expect(provider).toContain("http1: true");
    expect(provider).toContain("http2: false");
    expect(provider).toContain("client: getCloudprinterHttpClient()");
  });

  it("does not reset an explicitly provisioned Cloudprinter mode during generic secret sync", () => {
    const provider = read("supabase/functions/_shared/print/cloudprinter.ts");
    const writer = read("scripts/write-supabase-secrets-env.mjs");
    const dedicatedWorkflow = read(".github/workflows/sync-cloudprinter-secrets.yml");

    expect(provider).toContain('Deno.env.get("CLOUDPRINTER_MODE") || "disabled"');
    expect(writer).toContain('"CLOUDPRINTER_MODE"');
    expect(writer).not.toContain('ensureDefault(entries, "CLOUDPRINTER_MODE", "disabled")');
    expect(dedicatedWorkflow).toContain("CLOUDPRINTER_MODE=%s");
    expect(dedicatedWorkflow).toContain("MODE: ${{ inputs.mode }}");
  });
});
