import { readFileSync } from "node:fs";

import { describe, expect, it, vi } from "vitest";

import {
  createGuardedFetch,
  isBlockedIpAddress,
  isSafeRemoteUrl,
} from "../../scripts/lib/safe-public-fetch.mjs";

const workflow = readFileSync(
  ".github/workflows/restaurant-image-truth-backfill.yml",
  "utf8",
);
const hook = readFileSync(
  "scripts/restaurant-image-safe-fetch-hook.mjs",
  "utf8",
);

describe("restaurant image safe fetch", () => {
  it("blocks local, private, metadata and documentation ranges", () => {
    for (const address of [
      "127.0.0.1",
      "10.1.2.3",
      "169.254.169.254",
      "172.16.0.1",
      "192.168.0.1",
      "192.0.2.10",
      "198.51.100.10",
      "203.0.113.10",
      "::1",
      "fc00::1",
      "fe80::1",
    ]) {
      expect(isBlockedIpAddress(address)).toBe(true);
    }

    expect(isBlockedIpAddress("93.184.216.34")).toBe(false);
    expect(isSafeRemoteUrl("https://example.com/photo.webp")).toBe(true);
    expect(isSafeRemoteUrl("https://user:secret@example.com/photo.webp")).toBe(false);
  });

  it("rejects a public URL that redirects to a private target before the second request", async () => {
    const fetchImpl = vi.fn(async () =>
      new Response(null, {
        status: 302,
        headers: { location: "http://127.0.0.1/internal" },
      })
    );
    const dnsLookup = vi.fn(async () => [
      { address: "93.184.216.34", family: 4 },
    ]);
    const guardedFetch = createGuardedFetch({ fetchImpl, dnsLookup });

    await expect(
      guardedFetch("https://example.com/restaurant.jpg"),
    ).rejects.toThrow(/unsafe_public_url|private_network_url/);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("strips credentials across origins and follows only a bounded public GET redirect", async () => {
    const seen: Array<Request> = [];
    const fetchImpl = vi.fn(async (request: Request) => {
      seen.push(request);
      if (seen.length === 1) {
        return new Response(null, {
          status: 302,
          headers: { location: "https://cdn.example.org/photo.webp" },
        });
      }
      return new Response("image", {
        status: 200,
        headers: { "content-type": "image/webp" },
      });
    });
    const dnsLookup = vi.fn(async () => [
      { address: "93.184.216.34", family: 4 },
    ]);
    const guardedFetch = createGuardedFetch({ fetchImpl, dnsLookup });

    const response = await guardedFetch("https://restaurant.example/photo", {
      headers: {
        Authorization: "Bearer must-not-cross-origin",
        Cookie: "session=must-not-cross-origin",
        Accept: "image/webp",
      },
    });

    expect(response.status).toBe(200);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(seen[1].headers.get("authorization")).toBeNull();
    expect(seen[1].headers.get("cookie")).toBeNull();
    expect(seen[1].headers.get("accept")).toBe("image/webp");
  });

  it("installs the guard before the production worker starts", () => {
    expect(hook).toContain("createGuardedFetch");
    expect(hook).toContain("globalThis.fetch");
    expect(workflow).toContain("restaurant-image-safe-fetch-hook.mjs");
    expect(workflow).toMatch(/NODE_OPTIONS:[^\n]*--import/);
  });
});
