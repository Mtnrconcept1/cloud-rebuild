import { describe, expect, it } from "vitest";

import {
  normalizeExternalHttpsUrl,
  normalizePublicImageUrl,
  normalizeSocialUrl,
  normalizeTrustedCheckoutRedirectUrl,
  openExternalHttpsUrl,
  redirectToTrustedCheckoutUrl,
} from "@/lib/securityUrls";

describe("security URL helpers", () => {
  it("keeps safe public image URLs and rejects script-bearing schemes", () => {
    expect(normalizePublicImageUrl("/images/restaurant.jpg")).toBe("/images/restaurant.jpg");
    expect(normalizePublicImageUrl("https://cdn.example.com/photo.webp")).toBe("https://cdn.example.com/photo.webp");
    expect(normalizePublicImageUrl("javascript:alert(1)", "/fallback.jpg")).toBe("/fallback.jpg");
    expect(normalizePublicImageUrl("data:image/svg+xml,<svg onload=alert(1)>", "/fallback.jpg")).toBe("/fallback.jpg");
  });

  it("normalizes external links to https and enforces host allowlists", () => {
    expect(normalizeExternalHttpsUrl("thetok.ch/contact")).toBe("https://thetok.ch/contact");
    expect(normalizeExternalHttpsUrl("http://thetok.ch/contact")).toBeNull();
    expect(normalizeExternalHttpsUrl("javascript:alert(1)")).toBeNull();
    expect(normalizeExternalHttpsUrl("https://evil.example/phish", ["thetok.ch"])).toBeNull();
  });

  it("keeps social profile links on their expected hosts", () => {
    expect(normalizeSocialUrl("instagram.com/tok", "instagram")).toBe("https://instagram.com/tok");
    expect(normalizeSocialUrl("https://www.facebook.com/tok", "facebook")).toBe("https://www.facebook.com/tok");
    expect(normalizeSocialUrl("https://evil.example/tok", "tiktok")).toBeNull();
  });

  it("allows only trusted checkout, billing, connect, or same-origin redirects", () => {
    const origin = "https://www.thetok.ch";

    expect(normalizeTrustedCheckoutRedirectUrl("https://checkout.stripe.com/c/pay/cs_test", { origin }))
      .toBe("https://checkout.stripe.com/c/pay/cs_test");
    expect(normalizeTrustedCheckoutRedirectUrl("https://billing.stripe.com/p/session/test", { origin }))
      .toBe("https://billing.stripe.com/p/session/test");
    expect(normalizeTrustedCheckoutRedirectUrl("https://connect.stripe.com/setup/e/acct", { origin }))
      .toBe("https://connect.stripe.com/setup/e/acct");
    expect(normalizeTrustedCheckoutRedirectUrl("/commande/confirmation", { origin }))
      .toBe("https://www.thetok.ch/commande/confirmation");
    expect(normalizeTrustedCheckoutRedirectUrl("https://evil.example/checkout", { origin })).toBeNull();
    expect(normalizeTrustedCheckoutRedirectUrl("javascript:alert(1)", { origin })).toBeNull();
  });

  it("redirects through an injectable assign function after checkout URL validation", () => {
    const assigned: string[] = [];

    expect(redirectToTrustedCheckoutUrl("https://checkout.stripe.com/c/pay/cs_test", {
      origin: "https://www.thetok.ch",
      assign: (url) => assigned.push(url),
    })).toBe("https://checkout.stripe.com/c/pay/cs_test");
    expect(assigned).toEqual(["https://checkout.stripe.com/c/pay/cs_test"]);

    expect(() => redirectToTrustedCheckoutUrl("https://evil.example/checkout", {
      origin: "https://www.thetok.ch",
      assign: (url) => assigned.push(url),
    })).toThrow("URL de paiement non fiable");
  });

  it("opens only normalized HTTPS external URLs", () => {
    const opened: string[] = [];
    const open = (url: string) => {
      opened.push(url);
      return null;
    };

    expect(openExternalHttpsUrl("thetok.ch/invoice.pdf", { open }))
      .toBe("https://thetok.ch/invoice.pdf");
    expect(openExternalHttpsUrl("http://thetok.ch/invoice.pdf", { open })).toBeNull();
    expect(openExternalHttpsUrl("javascript:alert(1)", { open })).toBeNull();
    expect(openExternalHttpsUrl("https://evil.example/invoice.pdf", {
      allowedHosts: ["thetok.ch"],
      open,
    })).toBeNull();
    expect(opened).toEqual(["https://thetok.ch/invoice.pdf"]);
  });
});
