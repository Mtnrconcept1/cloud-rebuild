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
    expect(getNavigationTargetFromAppUrl("https://www.thetok.ch/profil?mode=edit", "/")).toBe("/profil?mode=edit");
  });

  it("keeps supported Tok domains internal", () => {
    expect(getNavigationTargetFromAppUrl("https://www.thetok.ch/courier/jobs", "/")).toBe("/courier/jobs");
    expect(getNavigationTargetFromAppUrl("https://app.thetok.ch/notifications", "/")).toBe("/notifications");
    expect(getNavigationTargetFromAppUrl("https://admin.thetok.ch/admin/audit", "/")).toBe("/admin/audit");
  });

  it("rejects https app links from untrusted domains", () => {
    expect(getNavigationTargetFromAppUrl("https://evil.example/profil?mode=edit", "/notifications")).toBe("/notifications");
  });
});
