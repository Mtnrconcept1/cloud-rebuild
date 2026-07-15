import type { UserRole } from "@/lib/auth-context";

export type CommercialDemoActorSurface = "client" | "restaurant" | "courier";
export type CommercialDemoFrameSurface = CommercialDemoActorSurface | "commercial";

export type CommercialDemoFrameConfig = {
  surface: CommercialDemoFrameSurface;
  sessionId: string;
  basename: string;
};

export type CommercialDemoFrameStateMessage = {
  type: "commercial-demo:frame-state";
  sessionId: string;
  surface: CommercialDemoFrameSurface;
  path: string;
  search: string;
  historyIndex: number;
  navigationType: "POP" | "PUSH" | "REPLACE";
  unreadCount: number;
  realtimeStatus: "connecting" | "connected" | "reconnecting" | "offline";
};

export type CommercialDemoFrameEscapeMessage = {
  type: "commercial-demo:escape";
  sessionId: string;
  surface: CommercialDemoFrameSurface;
};

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const FRAME_PATH_PATTERN = /^\/commercial\/demo-live\/frame\/(client|restaurant|courier|commercial)\/([^/]+)(?=\/|$)/i;

const FRAME_ROLE: Record<CommercialDemoFrameSurface, UserRole> = {
  client: "client",
  restaurant: "restaurateur",
  courier: "courier",
  commercial: "commercial",
};

const NOTIFICATION_PATH: Record<CommercialDemoFrameSurface, string> = {
  client: "/notifications",
  restaurant: "/dashboard/notifications",
  courier: "/courier/notifications",
  commercial: "/commercial",
};

export function parseCommercialDemoFramePath(pathname: string): CommercialDemoFrameConfig | null {
  const match = String(pathname || "").match(FRAME_PATH_PATTERN);
  if (!match) return null;

  const surface = match[1].toLowerCase() as CommercialDemoFrameSurface;
  const sessionId = match[2];
  if (!UUID_PATTERN.test(sessionId)) return null;

  return {
    surface,
    sessionId,
    basename: `/commercial/demo-live/frame/${surface}/${sessionId}`,
  };
}

export function getCommercialDemoFrameConfig() {
  if (typeof window === "undefined") return null;
  return parseCommercialDemoFramePath(window.location.pathname);
}

export function isCommercialDemoFrameWindow() {
  return getCommercialDemoFrameConfig() !== null;
}

export function getCommercialDemoFrameRole(surface: CommercialDemoFrameSurface) {
  return FRAME_ROLE[surface];
}

export function getCommercialDemoNotificationPath(surface: CommercialDemoFrameSurface) {
  return NOTIFICATION_PATH[surface];
}

export function buildCommercialDemoFrameUrl(
  surface: CommercialDemoFrameSurface,
  sessionId: string,
  targetPath?: string,
) {
  if (!UUID_PATTERN.test(sessionId)) throw new Error("Invalid commercial demo session identifier");
  const home = surface === "client"
    ? "/mon-espace"
    : surface === "restaurant"
      ? "/dashboard"
      : surface === "courier"
        ? "/courier"
        : "/commercial";
  const normalizedTarget = String(targetPath || home).startsWith("/") ? String(targetPath || home) : `/${targetPath || home}`;
  return `/commercial/demo-live/frame/${surface}/${sessionId}${normalizedTarget}`;
}

export function isCommercialDemoFrameMessage(value: unknown): value is {
  type: "commercial-demo:open-checkout";
  sessionId: string;
  checkoutUrl: string;
} {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return record.type === "commercial-demo:open-checkout"
    && typeof record.sessionId === "string"
    && UUID_PATTERN.test(record.sessionId)
    && typeof record.checkoutUrl === "string";
}

export function isCommercialDemoFrameStateMessage(value: unknown): value is CommercialDemoFrameStateMessage {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  const surface = record.surface;
  const path = record.path;
  const search = record.search;
  const historyIndex = record.historyIndex;
  const navigationType = record.navigationType;
  const unreadCount = record.unreadCount;
  const realtimeStatus = record.realtimeStatus;

  return record.type === "commercial-demo:frame-state"
    && typeof record.sessionId === "string"
    && UUID_PATTERN.test(record.sessionId)
    && (surface === "client" || surface === "restaurant" || surface === "courier" || surface === "commercial")
    && typeof path === "string"
    && path.startsWith("/")
    && !path.startsWith("//")
    && typeof search === "string"
    && (search === "" || search.startsWith("?"))
    && typeof historyIndex === "number"
    && Number.isInteger(historyIndex)
    && historyIndex >= 0
    && (navigationType === "POP" || navigationType === "PUSH" || navigationType === "REPLACE")
    && typeof unreadCount === "number"
    && Number.isInteger(unreadCount)
    && unreadCount >= 0
    && (
      realtimeStatus === "connecting"
      || realtimeStatus === "connected"
      || realtimeStatus === "reconnecting"
      || realtimeStatus === "offline"
    );
}

export function isCommercialDemoFrameEscapeMessage(value: unknown): value is CommercialDemoFrameEscapeMessage {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return record.type === "commercial-demo:escape"
    && typeof record.sessionId === "string"
    && UUID_PATTERN.test(record.sessionId)
    && (
      record.surface === "client"
      || record.surface === "restaurant"
      || record.surface === "courier"
      || record.surface === "commercial"
    );
}
