import { describe, expect, it } from "vitest";

import {
  buildCommercialDemoFrameUrl,
  getCommercialDemoFrameRole,
  isCommercialDemoFrameEscapeMessage,
  isCommercialDemoFrameNavigateMessage,
  isCommercialDemoFrameStateMessage,
  parseCommercialDemoFramePath,
} from "../lib/commercialDemoFrame";

const sessionId = "123e4567-e89b-42d3-a456-426614174000";

describe("commercial demo browser frames", () => {
  it.each([
    ["client", "client"],
    ["restaurant", "restaurateur"],
    ["courier", "courier"],
    ["commercial", "commercial"],
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
    expect(buildCommercialDemoFrameUrl("commercial", sessionId, "/commercial/comptabilite"))
      .toBe(`/commercial/demo-live/frame/commercial/${sessionId}/commercial/comptabilite`);
  });

  it("accepts only strictly shaped same-origin frame state payloads", () => {
    const message = {
      type: "commercial-demo:frame-state",
      sessionId,
      surface: "client",
      path: "/commandes",
      search: "?demo=1",
      historyIndex: 2,
      navigationType: "PUSH",
      unreadCount: 3,
      realtimeStatus: "connected",
    };
    expect(isCommercialDemoFrameStateMessage(message)).toBe(true);
    expect(isCommercialDemoFrameStateMessage({ ...message, surface: "admin" })).toBe(false);
    expect(isCommercialDemoFrameStateMessage({ ...message, path: "https://evil.test" })).toBe(false);
    expect(isCommercialDemoFrameStateMessage({ ...message, unreadCount: -1 })).toBe(false);
    expect(isCommercialDemoFrameStateMessage({ ...message, navigationType: "FORWARD" })).toBe(false);
    expect(isCommercialDemoFrameStateMessage({ ...message, realtimeStatus: "unknown" })).toBe(false);
  });

  it("accepts only a strictly shaped fullscreen escape relay", () => {
    const message = {
      type: "commercial-demo:escape",
      sessionId,
      surface: "commercial",
    };
    expect(isCommercialDemoFrameEscapeMessage(message)).toBe(true);
    expect(isCommercialDemoFrameEscapeMessage({ ...message, surface: "admin" })).toBe(false);
    expect(isCommercialDemoFrameEscapeMessage({ ...message, sessionId: "invalid" })).toBe(false);
  });

  it("accepts only same-session relative frame navigation commands", () => {
    const message = {
      type: "commercial-demo:navigate",
      sessionId,
      surface: "client",
      path: "/mon-espace",
    };
    expect(isCommercialDemoFrameNavigateMessage(message)).toBe(true);
    expect(isCommercialDemoFrameNavigateMessage({ ...message, path: "https://evil.test" })).toBe(false);
    expect(isCommercialDemoFrameNavigateMessage({ ...message, path: "//evil.test" })).toBe(false);
  });
});
