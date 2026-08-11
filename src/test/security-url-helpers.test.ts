import { describe, expect, it } from "vitest";

import {
  canonicalizeKnownPublicImageUrl,
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

  it("canonicalizes legacy public image aliases before rendering", () => {
    expect(canonicalizeKnownPublicImageUrl("/images/milshake vanille.jpeg")).toBe("/images/milkshake-vanille.jpeg");
    expect(canonicalizeKnownPublicImageUrl("/images/moshi%20glac%C3%A9s.jpg")).toBe("/images/mochi-glaces.jpg");
    expect(normalizePublicImageUrl("/images/salade du marché.jpg")).toBe("/images/salade-du-marche.jpg");
    expect(normalizePublicImageUrl("https://www.thetok.ch/images/r%C3%B6sti%20bernois.jpg"))
      .toBe("https://www.thetok.ch/images/rosti-bernois.jpg");
    expect(normalizePublicImageUrl("https://cdn.example.com/images/milshake%20vanille.jpeg"))
      .toBe("https://cdn.example.com/images/milshake%20vanille.jpeg");
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

  it("accepts only same-host returns inside the native Capacitor scheme", () => {
    const origin = "capacitor://localhost";

    expect(normalizeTrustedCheckoutRedirectUrl("/tok-one?status=success", { origin }))
      .toBe("capacitor://localhost/tok-one?status=success");
    expect(normalizeTrustedCheckoutRedirectUrl("capacitor://localhost/tok-one", { origin }))
      .toBe("capacitor://localhost/tok-one");
    expect(normalizeTrustedCheckoutRedirectUrl("capacitor://evil.example/tok-one", { origin }))
      .toBeNull();
    expect(normalizeTrustedCheckoutRedirectUrl("tok://localhost/tok-one", { origin }))
      .toBeNull();
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
