import { describe, expect, it } from "vitest";

import {
  getNavigationTargetFromAppUrl,
  normalizeInternalNavigationTarget,
} from "@/lib/navigation";

describe("normalizeInternalNavigationTarget", () => {
  it("keeps relative in-app paths", () => {
    expect(normalizeInternalNavigationTarget("/notifications?tab=orders")).toBe("/notifications?tab=orders");
  });

  it("rejects external absolute URLs", () => {
    expect(normalizeInternalNavigationTarget("https://evil.example/phish", "/notifications")).toBe("/notifications");
  });

  it("normalizes bare relative paths", () => {
    expect(normalizeInternalNavigationTarget("courier/jobs", "/")).toBe("/courier/jobs");
  });
});

describe("getNavigationTargetFromAppUrl", () => {
  it("reconstructs custom scheme routes using host and path", () => {
    expect(getNavigationTargetFromAppUrl("tok://commande/123?tab=details", "/")).toBe("/commande/123?tab=details");
  });

  it("keeps same-origin https routes internal", () => {
    expect(getNavigationTargetFromAppUrl("https://example.com/profil?mode=edit", "/")).toBe("/profil?mode=edit");
  });

  it("handles iOS Universal Link from tok.ch", () => {
    expect(getNavigationTargetFromAppUrl("https://tok.ch/commande/123?tab=details", "/")).toBe("/commande/123?tab=details");
  });

  it("handles iOS Universal Link from www.tok.ch", () => {
    expect(getNavigationTargetFromAppUrl("https://www.tok.ch/dashboard/commandes", "/")).toBe("/dashboard/commandes");
  });

  it("handles Android App Link from tok.ch with hash", () => {
    expect(getNavigationTargetFromAppUrl("https://tok.ch/restaurant/abc#menu", "/")).toBe("/restaurant/abc#menu");
  });

  it("handles tok:// scheme with no query params", () => {
    expect(getNavigationTargetFromAppUrl("tok://notifications", "/")).toBe("/notifications");
  });

  it("returns fallback on malformed URL", () => {
    expect(getNavigationTargetFromAppUrl("not a url", "/fallback")).toBe("/fallback");
  });
});
