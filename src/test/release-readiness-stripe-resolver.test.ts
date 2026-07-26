import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it, vi } from "vitest";

import {
  discoverLiveKeyFromProductionBundle,
  isLiveStripePublishableKey,
  resolveLiveStripePublishableKey,
} from "../../scripts/resolve-live-stripe-publishable-key.mjs";

const LIVE_KEY = "pk_live_ABCDEFGHIJKLMNOPQRSTUVWXYZ123456";
const TEST_KEY = "pk_test_ABCDEFGHIJKLMNOPQRSTUVWXYZ123456";

function response(body: string, url: string, status = 200) {
  return new Response(body, {
    status,
    headers: { "Content-Type": url.endsWith(".js") ? "application/javascript" : "text/html" },
  });
}

describe("production Stripe publishable key resolver", () => {
  it("accepts only live Stripe publishable keys", () => {
    expect(isLiveStripePublishableKey(LIVE_KEY)).toBe(true);
    expect(isLiveStripePublishableKey(TEST_KEY)).toBe(false);
    expect(isLiveStripePublishableKey("sk_live_secret")) .toBe(false);
  });

  it("prefers a valid configured live key without network access", async () => {
    const fetchImpl = vi.fn();

    const resolved = await resolveLiveStripePublishableKey({
      explicitCandidates: [TEST_KEY, LIVE_KEY],
      fetchImpl,
      persistToGitHubEnv: false,
    });

    expect(resolved).toEqual({ value: LIVE_KEY, source: "environment" });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("recovers the live key from same-origin production assets", async () => {
    const fetchImpl = vi.fn(async (input: URL | RequestInfo) => {
      const url = String(input);
      if (url === "https://www.thetok.ch/") {
        return response(
          '<html><head><script type="module" src="/assets/index.js"></script></head></html>',
          url,
        );
      }
      if (url === "https://www.thetok.ch/assets/index.js") {
        return response('import("/assets/checkout.js");', url);
      }
      if (url === "https://www.thetok.ch/assets/checkout.js") {
        return response(`const stripeKey = "${LIVE_KEY}";`, url);
      }
      return response("not found", url, 404);
    });

    const resolved = await resolveLiveStripePublishableKey({
      explicitCandidates: [TEST_KEY],
      appBaseUrl: "https://www.thetok.ch",
      fetchImpl,
      persistToGitHubEnv: false,
    });

    expect(resolved).toEqual({ value: LIVE_KEY, source: "production_bundle" });
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });

  it("does not follow JavaScript assets hosted on another origin", async () => {
    const fetchImpl = vi.fn(async (input: URL | RequestInfo) => {
      const url = String(input);
      if (url === "https://www.thetok.ch/") {
        return response(
          '<script src="https://attacker.example/assets/index.js"></script>',
          url,
        );
      }
      return response(`const stripeKey = "${LIVE_KEY}";`, url);
    });

    const resolved = await discoverLiveKeyFromProductionBundle({
      baseUrl: "https://www.thetok.ch",
      fetchImpl,
    });

    expect(resolved).toBeNull();
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("persists a recovered key for following GitHub Actions steps without printing it as data", async () => {
    const root = mkdtempSync(join(tmpdir(), "tok-stripe-resolver-"));
    const githubEnv = join(root, "github-env");
    writeFileSync(join(root, ".env.production"), `VITE_STRIPE_PUBLISHABLE_KEY=${LIVE_KEY}\n`);
    writeFileSync(githubEnv, "");

    const resolved = await resolveLiveStripePublishableKey({
      root,
      explicitCandidates: [TEST_KEY],
      githubEnvPath: githubEnv,
      allowRemote: false,
    });

    expect(resolved.source).toBe(".env.production");
    expect(readFileSync(githubEnv, "utf8")).toBe(`VITE_STRIPE_PUBLISHABLE_KEY=${LIVE_KEY}\n`);
  });
});
