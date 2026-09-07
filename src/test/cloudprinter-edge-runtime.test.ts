import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import {
  CloudprinterError,
  type CloudprinterTransport,
  type CloudprinterTransportResponse,
  cloudprinterNetworkErrorCode,
  cloudprinterRequestBody,
  parseCloudprinterBody,
  requestCloudprinter,
  safeProviderMessage,
} from "../../supabase/functions/_shared/print/request.ts";

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

const noSleep = async () => undefined;

function stubTransport(script: Array<CloudprinterTransportResponse | Error>) {
  const calls: Array<{ path: string; body: string }> = [];
  const transport: CloudprinterTransport = async (path, body) => {
    calls.push({ path, body });
    const next = script[Math.min(calls.length - 1, script.length - 1)];
    if (next instanceof Error) throw next;
    return next;
  };
  return { transport, calls };
}

function run(
  script: Array<CloudprinterTransportResponse | Error>,
  options: Parameters<typeof requestCloudprinter>[0]["options"],
  path = "/products",
) {
  const { transport, calls } = stubTransport(script);
  const promise = requestCloudprinter({
    transport,
    path,
    body: '{"apikey":"secret-provider-key","reference":"tok"}',
    options,
    sleep: noSleep,
  });
  return { promise, calls };
}

describe("Cloudprinter request engine", () => {
  it("returns the parsed provider body and forwards the pre-signed request unchanged", async () => {
    const { promise, calls } = run([{ status: 200, text: '[{"reference":"tok_flyer"}]' }], { expected: [200] });

    await expect(promise).resolves.toEqual([{ reference: "tok_flyer" }]);
    expect(calls).toHaveLength(1);
    expect(calls[0].path).toBe("/products");
    expect(calls[0].body).toBe('{"apikey":"secret-provider-key","reference":"tok"}');
  });

  it("maps the documented empty-result statuses to null instead of an error", async () => {
    const { promise } = run([{ status: 204, text: "" }], { expected: [200], notFound: [204, 410] });

    await expect(promise).resolves.toBeNull();
  });

  it("retries a safe read after a provider 5xx and returns the recovered body", async () => {
    const { promise, calls } = run([
      { status: 503, text: '{"message":"temporarily unavailable"}' },
      { status: 200, text: "[]" },
    ], { expected: [200], safeRetry: true });

    await expect(promise).resolves.toEqual([]);
    expect(calls).toHaveLength(2);
  });

  it("gives up after the safe-retry budget and reports a retryable provider failure", async () => {
    const { promise, calls } = run([{ status: 500, text: '{"message":"boom"}' }], { expected: [200], safeRetry: true });

    const error = await promise.catch((failure: unknown) => failure);
    expect(error).toBeInstanceOf(CloudprinterError);
    expect((error as CloudprinterError).code).toBe("cloudprinter_http_500");
    expect((error as CloudprinterError).retryable).toBe(true);
    expect(calls).toHaveLength(3);
  });

  it("surfaces an authentication refusal as a non-retryable provider answer, not as an outage", async () => {
    const { promise, calls } = run([{ status: 401, text: '{"error":"Invalid apikey"}' }], {
      expected: [200],
      safeRetry: true,
    });

    const error = await promise.catch((failure: unknown) => failure) as CloudprinterError;
    expect(error).toBeInstanceOf(CloudprinterError);
    expect(error.code).toBe("cloudprinter_http_401");
    expect(error.status).toBe(401);
    expect(error.retryable).toBe(false);
    expect(error.message).toBe("Invalid apikey");
    expect(calls).toHaveLength(1);
  });

  it("never retries an order submission and marks its failure ambiguous for reconciliation", async () => {
    const { promise, calls } = run([{ status: 500, text: "" }], {
      expected: [200, 201],
      safeRetry: false,
      ambiguousOnFailure: true,
    }, "/orders/add");

    const error = await promise.catch((failure: unknown) => failure) as CloudprinterError;
    expect(error.ambiguous).toBe(true);
    expect(calls).toHaveLength(1);
  });

  it("keeps a network failure diagnosable by code without leaking the signed payload", async () => {
    const { promise } = run([Object.assign(new Error("getaddrinfo ENOTFOUND"), { code: "ENOTFOUND" })], {
      expected: [200],
    });

    const error = await promise.catch((failure: unknown) => failure) as CloudprinterError;
    expect(error.code).toBe("cloudprinter_unreachable");
    expect(error.transportCode).toBe("enotfound");
    expect(error.message).toBe("Cloudprinter unavailable");
    expect(error.message).not.toContain("apikey");
    expect(error.message).not.toContain("secret-provider-key");
  });

  it("separates a timeout from an unreachable endpoint", async () => {
    const { promise } = run([Object.assign(new Error("aborted"), { name: "AbortError" })], {
      expected: [200],
      ambiguousOnFailure: true,
    }, "/orders/add");

    const error = await promise.catch((failure: unknown) => failure) as CloudprinterError;
    expect(error.code).toBe("cloudprinter_timeout");
    expect(error.transportCode).toBe("aborterror");
    expect(error.ambiguous).toBe(true);
  });

  it("normalises provider bodies and network codes defensively", () => {
    expect(parseCloudprinterBody(204, "")).toBeNull();
    expect(parseCloudprinterBody(200, "<html>maintenance</html>")).toEqual({ raw_text: "<html>maintenance</html>" });
    expect(safeProviderMessage(500, { message: "line one\nline two" })).toBe("line one line two");
    expect(safeProviderMessage(500, null)).toBe("Cloudprinter HTTP 500");
    expect(cloudprinterNetworkErrorCode({ code: "ECONNRESET" })).toBe("econnreset");
    expect(cloudprinterNetworkErrorCode("nope")).toBe("unknown");
    expect(cloudprinterRequestBody({ reference: "tok" }, "key")).toBe('{"apikey":"key","reference":"tok"}');
  });
});

describe("Cloudprinter Edge runtime hardening", () => {
  it("resolves provider credentials before the retry loop so a configuration fault is never reported as an outage", () => {
    const provider = read("supabase/functions/_shared/print/cloudprinter.ts");
    const engine = read("supabase/functions/_shared/print/request.ts");

    const resolvesCredentials = provider.indexOf("cloudprinterRequestBody(payload, getCloudprinterApiKey())");
    const entersRetryLoop = provider.indexOf("requestCloudprinter({");
    expect(resolvesCredentials).toBeGreaterThan(-1);
    expect(entersRetryLoop).toBeGreaterThan(resolvesCredentials);

    // CLOUDPRINTER_NOT_CONFIGURED / CLOUDPRINTER_DISABLED are raised by the
    // caller and can no longer be caught, retried and rewritten by the engine.
    expect(engine).not.toContain("getCloudprinterApiKey");
    expect(engine).not.toContain("Deno.env");
    expect(engine).not.toContain('from "../auth.ts"');
    expect(provider).toContain('throw new HttpError(503, "CLOUDPRINTER_NOT_CONFIGURED")');
    expect(provider).toContain('throw new HttpError(503, "CLOUDPRINTER_DISABLED")');
  });

  it("drives Cloudprinter through runtime APIs the Supabase Edge runtime actually exposes", () => {
    const provider = read("supabase/functions/_shared/print/cloudprinter.ts");

    expect(provider).toContain("await fetch(`${CLOUDPRINTER_API_BASE}${path}`");
    expect(provider).toContain("signal: controller.signal");
    // Unstable Deno HTTP client factories are unavailable on Supabase Edge and
    // threw inside the guarded block, masking the real failure.
    expect(provider).not.toContain("createHttpClient");
    expect(provider).not.toContain("Deno.HttpClient");
  });

  it("reports an actionable provider reason from the catalogue sync instead of a generic internal error", () => {
    const catalog = read("supabase/functions/print-catalog/index.ts");

    expect(catalog).toContain("providerDiagnostics");
    expect(catalog).toContain("CLOUDPRINTER_[A-Z_]+");
    expect(catalog).toContain("provider_error: diagnostics");
    expect(catalog).toContain("status >= 500 && !diagnostics");
  });

  it("synchronises the provider catalogue in bounded batches", () => {
    const catalog = read("supabase/functions/print-catalog/index.ts");

    expect(catalog).toContain("CATALOG_BATCH_SIZE");
    expect(catalog).toContain("chunk(references, CATALOG_BATCH_SIZE)");
    expect(catalog).toContain("chunk(upsertRows, CATALOG_BATCH_SIZE)");
    expect(catalog).toContain('.upsert(batch, { onConflict: "provider,provider_reference" })');
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
