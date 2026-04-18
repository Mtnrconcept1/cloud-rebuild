import { describe, expect, it } from "vitest";

import { isConfiguredSentryDsn } from "@/lib/monitoring";

describe("monitoring", () => {
  it("rejects placeholder sentry DSNs", () => {
    expect(isConfiguredSentryDsn("https://REPLACE_PUBLIC_KEY@o0.ingest.sentry.io/0")).toBe(false);
  });

  it("accepts configured sentry DSNs", () => {
    expect(isConfiguredSentryDsn("https://publicKey@o0.ingest.sentry.io/123")).toBe(true);
  });
});
