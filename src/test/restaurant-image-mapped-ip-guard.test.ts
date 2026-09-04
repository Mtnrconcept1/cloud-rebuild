import { describe, expect, it } from "vitest";

import {
  isBlockedIpAddress,
  isSafeRemoteUrl,
} from "../../scripts/lib/safe-public-fetch.mjs";

describe("restaurant image IPv4-mapped IPv6 guard", () => {
  it("blocks every IPv4-mapped IPv6 spelling before a network request", () => {
    for (const address of [
      "::ffff:7f00:1",
      "::ffff:127.0.0.1",
      "::ffff:c0a8:101",
      "::ffff:192.168.1.1",
    ]) {
      expect(isBlockedIpAddress(address)).toBe(true);
      expect(isSafeRemoteUrl(`http://[${address}]/restaurant.jpg`)).toBe(false);
    }
  });
});
