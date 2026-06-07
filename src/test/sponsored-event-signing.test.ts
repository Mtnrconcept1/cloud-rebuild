import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

function read(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

describe("sponsored event signing", () => {
  it("supports HMAC verification for billable sponsored tracking events", () => {
    const edgeFunction = read("supabase/functions/track-sponsored-event/index.ts");
    const analytics = read("src/lib/analytics.ts");

    expect(edgeFunction).toContain("SPONSORED_EVENT_SIGNING_SECRET");
    expect(edgeFunction).toContain("verifySponsoredEventSignature");
    expect(edgeFunction).toContain("crypto.subtle.verify");
    expect(edgeFunction).toContain("signaturePayload");
    expect(edgeFunction).toContain("eventSignature");
    expect(edgeFunction).toContain("signedAt");
    expect(edgeFunction).toContain("signature_required");

    expect(analytics).toContain("eventSignature?: string | null");
    expect(analytics).toContain("signedAt?: string | null");
    expect(analytics).toContain("eventSignature: input.eventSignature || null");
    expect(analytics).toContain("signedAt: input.signedAt || null");
  });
});
