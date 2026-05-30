import { describe, expect, it } from "vitest";

import {
  normalizeExternalHttpsUrl,
  normalizePublicImageUrl,
  normalizeSocialUrl,
} from "@/lib/securityUrls";

describe("security URL helpers", () => {
  it("keeps safe public image URLs and rejects script-bearing schemes", () => {
    expect(normalizePublicImageUrl("/images/restaurant.jpg")).toBe("/images/restaurant.jpg");
    expect(normalizePublicImageUrl("https://cdn.example.com/photo.webp")).toBe("https://cdn.example.com/photo.webp");
    expect(normalizePublicImageUrl("javascript:alert(1)", "/fallback.jpg")).toBe("/fallback.jpg");
    expect(normalizePublicImageUrl("data:image/svg+xml,<svg onload=alert(1)>", "/fallback.jpg")).toBe("/fallback.jpg");
  });

  it("normalizes external links to https and enforces host allowlists", () => {
    expect(normalizeExternalHttpsUrl("tok.ch/contact")).toBe("https://tok.ch/contact");
    expect(normalizeExternalHttpsUrl("http://tok.ch/contact")).toBeNull();
    expect(normalizeExternalHttpsUrl("javascript:alert(1)")).toBeNull();
    expect(normalizeExternalHttpsUrl("https://evil.example/phish", ["tok.ch"])).toBeNull();
  });

  it("keeps social profile links on their expected hosts", () => {
    expect(normalizeSocialUrl("instagram.com/tok", "instagram")).toBe("https://instagram.com/tok");
    expect(normalizeSocialUrl("https://www.facebook.com/tok", "facebook")).toBe("https://www.facebook.com/tok");
    expect(normalizeSocialUrl("https://evil.example/tok", "tiktok")).toBeNull();
  });
});

