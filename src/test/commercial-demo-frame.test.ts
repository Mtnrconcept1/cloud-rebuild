import { describe, expect, it } from "vitest";

import {
  buildCommercialDemoFrameUrl,
  getCommercialDemoFrameRole,
  parseCommercialDemoFramePath,
} from "../lib/commercialDemoFrame";

const sessionId = "123e4567-e89b-42d3-a456-426614174000";

describe("commercial demo browser frames", () => {
  it.each([
    ["client", "client"],
    ["restaurant", "restaurateur"],
    ["courier", "courier"],
  ] as const)("parses the %s basename and exposes only its virtual role", (surface, role) => {
    const path = `/commercial/demo-live/frame/${surface}/${sessionId}/commandes`;
    expect(parseCommercialDemoFramePath(path)).toEqual({
      surface,
      sessionId,
      basename: `/commercial/demo-live/frame/${surface}/${sessionId}`,
    });
    expect(getCommercialDemoFrameRole(surface)).toBe(role);
  });

  it("rejects malformed or unknown frame paths", () => {
    expect(parseCommercialDemoFramePath("/commercial/demo-live/frame/courier/not-a-uuid/courier")).toBeNull();
    expect(parseCommercialDemoFramePath(`/commercial/demo-live/frame/admin/${sessionId}/admin`)).toBeNull();
  });

  it("builds same-origin URLs that preserve the real dashboard route after the basename", () => {
    expect(buildCommercialDemoFrameUrl("client", sessionId, "/commandes"))
      .toBe(`/commercial/demo-live/frame/client/${sessionId}/commandes`);
    expect(buildCommercialDemoFrameUrl("restaurant", sessionId, "/dashboard/commandes"))
      .toBe(`/commercial/demo-live/frame/restaurant/${sessionId}/dashboard/commandes`);
    expect(buildCommercialDemoFrameUrl("courier", sessionId, "/courier/jobs"))
      .toBe(`/commercial/demo-live/frame/courier/${sessionId}/courier/jobs`);
  });
});
