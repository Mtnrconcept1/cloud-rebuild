import { describe, expect, it } from "vitest";

import { normalizeCheckoutReturnUrl } from "../../supabase/functions/_shared/return-url.ts";

describe("checkout return URL validation", () => {
  const env = (values: Record<string, string | undefined>) => (name: string) => values[name];

  it("allows configured HTTPS app hosts", () => {
    expect(normalizeCheckoutReturnUrl("https://app.thetok.ch/commande/confirmation", {
      env: env({ APP_BASE_URL: "https://app.thetok.ch" }),
    })).toBe("https://app.thetok.ch/commande/confirmation");
  });

  it("rejects external hosts and non-HTTPS production return URLs", () => {
    expect(normalizeCheckoutReturnUrl("https://evil.example/checkout", {
      env: env({ APP_BASE_URL: "https://app.thetok.ch" }),
    })).toBeNull();
    expect(normalizeCheckoutReturnUrl("http://www.thetok.ch/commande", {
      env: env({ APP_BASE_URL: "https://www.thetok.ch" }),
    })).toBeNull();
  });

  it("rejects arbitrary Vercel projects unless the exact host is configured", () => {
    expect(normalizeCheckoutReturnUrl("https://attacker-preview.vercel.app/checkout", {
      env: env({ APP_BASE_URL: "https://app.thetok.ch" }),
    })).toBeNull();
    expect(normalizeCheckoutReturnUrl("https://cloud-rebuild-preview.vercel.app/checkout", {
      env: env({ CHECKOUT_RETURN_HOSTS: "cloud-rebuild-preview.vercel.app" }),
    })).toBe("https://cloud-rebuild-preview.vercel.app/checkout");
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
