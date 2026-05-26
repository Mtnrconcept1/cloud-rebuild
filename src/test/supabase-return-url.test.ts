import { describe, expect, it } from "vitest";

import { normalizeCheckoutReturnUrl } from "../../supabase/functions/_shared/return-url.ts";

describe("checkout return URL validation", () => {
  const env = (values: Record<string, string | undefined>) => (name: string) => values[name];

  it("allows configured HTTPS app hosts", () => {
    expect(normalizeCheckoutReturnUrl("https://app.tok.ch/commande/confirmation", {
      env: env({ APP_BASE_URL: "https://app.tok.ch" }),
    })).toBe("https://app.tok.ch/commande/confirmation");
  });

  it("rejects external hosts and non-HTTPS production return URLs", () => {
    expect(normalizeCheckoutReturnUrl("https://evil.example/checkout", {
      env: env({ APP_BASE_URL: "https://app.tok.ch" }),
    })).toBeNull();
    expect(normalizeCheckoutReturnUrl("http://tok.ch/commande", {
      env: env({ APP_BASE_URL: "https://tok.ch" }),
    })).toBeNull();
  });

  it("allows localhost only when explicitly enabled", () => {
    expect(normalizeCheckoutReturnUrl("http://localhost:8080/commande/confirmation", {
      env: env({ ALLOW_LOCAL_RETURN_URLS: "false" }),
    })).toBeNull();
    expect(normalizeCheckoutReturnUrl("http://localhost:8080/commande/confirmation", {
      env: env({ ALLOW_LOCAL_RETURN_URLS: "true" }),
    })).toBe("http://localhost:8080/commande/confirmation");
  });
});

