import { describe, expect, it } from "vitest";

import { isConfiguredSentryDsn, shouldDropMaskedOrExtensionEvent } from "@/lib/monitoring";

describe("monitoring", () => {
  it("rejects placeholder sentry DSNs", () => {
    expect(isConfiguredSentryDsn("https://REPLACE_PUBLIC_KEY@o0.ingest.sentry.io/0")).toBe(false);
  });

  it("accepts configured sentry DSNs", () => {
    expect(isConfiguredSentryDsn("https://publicKey@o0.ingest.sentry.io/123")).toBe(true);
  });

  it("drops Safari masked-url noise from injected scripts", () => {
    expect(
      shouldDropMaskedOrExtensionEvent({
        exception: {
          values: [
            {
              stacktrace: {
                frames: [
                  { filename: "webkit-masked-url://hidden/" },
                  { filename: "webkit-masked-url://hidden/" },
                ],
              },
            },
          ],
        },
      }),
    ).toBe(true);
  });

  it("keeps events that include application stack frames", () => {
    expect(
      shouldDropMaskedOrExtensionEvent({
        exception: {
          values: [
            {
              stacktrace: {
                frames: [
                  { filename: "webkit-masked-url://hidden/" },
                  { filename: "https://thetok.ch/assets/index.js" },
                ],
              },
            },
          ],
        },
      }),
    ).toBe(false);
  });
});
