import type { User } from "@supabase/supabase-js";
import type { Breadcrumb, ErrorEvent } from "@sentry/react";
import { sanitizeEnvValue } from "@/lib/env";
import { CONSENT_EVENT, CONSENT_STORAGE_KEY, hasConsent } from "@/lib/consent";

type MonitoringContext = {
  extra?: Record<string, unknown>;
  tags?: Record<string, string>;
};

type SentryFrame = {
  filename?: string | null;
};

type SentryExceptionValue = {
  stacktrace?: {
    frames?: SentryFrame[];
  } | null;
};

type SentryEventLike = {
  exception?: {
    values?: SentryExceptionValue[];
  } | null;
};

const MASKED_OR_EXTENSION_URL_PATTERN = /^(?:webkit-masked-url|safari-extension|chrome-extension|moz-extension):/i;

const CLIENT_SIDE_DENY_URLS = [
  /^webkit-masked-url:/i,
  /^safari-extension:/i,
  /^chrome-extension:/i,
  /^moz-extension:/i,
];

function getEventFrameFilenames(event: SentryEventLike) {
  return (event.exception?.values || [])
    .flatMap((value) => value.stacktrace?.frames || [])
    .map((frame) => frame.filename)
    .filter((filename): filename is string => typeof filename === "string" && filename.length > 0);
}

export function shouldDropMaskedOrExtensionEvent(event: SentryEventLike) {
  const filenames = getEventFrameFilenames(event);

  return filenames.length > 0 && filenames.every((filename) => MASKED_OR_EXTENSION_URL_PATTERN.test(filename));
}

const RAW_SENTRY_DSN = sanitizeEnvValue(import.meta.env.VITE_SENTRY_DSN);
const SENTRY_ENVIRONMENT = sanitizeEnvValue(import.meta.env.VITE_SENTRY_ENVIRONMENT || import.meta.env.MODE);
const SENTRY_RELEASE = sanitizeEnvValue(import.meta.env.VITE_APP_RELEASE);

function isPlaceholderValue(value: string) {
  return /REPLACE(?:_WITH)?(?:_[A-Z0-9]+)*/i.test(value);
}

export function isConfiguredSentryDsn(value: string) {
  if (!value || isPlaceholderValue(value)) return false;

  try {
    const parsed = new URL(value);
    return (
      /https?:/.test(parsed.protocol) &&
      Boolean(parsed.host) &&
      Boolean(parsed.username) &&
      !isPlaceholderValue(parsed.username)
    );
  } catch {
    return false;
  }
}

const SENTRY_DSN = isConfiguredSentryDsn(RAW_SENTRY_DSN) ? RAW_SENTRY_DSN : "";

type SentryModule = typeof import("@sentry/react");

let sentryModulePromise: Promise<SentryModule | null> | null = null;
let sentryModule: SentryModule | null = null;
let sentryClient: ReturnType<SentryModule["init"]> | undefined;
let analyticsAllowed = false;
let generation = 0;
let sessionUserId: string | null = null;
let removeListeners: (() => void) | undefined;

function redactText(value: string) {
  return value
    // Query/fragment often carry OAuth, password-reset and checkout secrets.
    .replace(/https?:\/\/[^\s<>"']+/gi, (url) => redactUrl(url))
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, "[email]")
    .replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, "[id]")
    .replace(/\bBearer\s+[^\s,;"']+/gi, "Bearer [redacted]")
    .replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g, "[token]")
    .replace(/\b(authorization|access[_-]?token|refresh[_-]?token|token|api[_-]?key|password|secret|cookie|code)["']?\s*[:=]\s*["']?[^\s,;"'&]+/gi, "$1=[redacted]")
    .slice(0, 4000);
}

function redactUrl(value: string) {
  try {
    const url = new URL(value, "https://monitoring.invalid");
    // Retain the source file/route, never URL credentials, query or fragment.
    const pathname = decodeURIComponent(url.pathname)
      .replace(/[^/\s]+@[^/\s]+/g, "[email]")
      .replace(/[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}/gi, "[id]")
      .replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g, "[token]");
    const origin = url.origin === "https://monitoring.invalid" ? ""
      : url.origin === "null" ? `${url.protocol}//${url.host}` : url.origin;
    return (origin + pathname).slice(0, 2000);
  } catch {
    return "[invalid URL]";
  }
}

function sanitizeBreadcrumb(breadcrumb: Breadcrumb): Breadcrumb | null {
  // Console arguments, DOM text and arbitrary custom data may contain forms,
  // account objects or tokens. Only retain bounded network/navigation metadata.
  if (!["navigation", "fetch", "xhr"].includes(breadcrumb.category || "")) return null;
  const data: Record<string, string | number> = {};
  for (const key of ["url", "from", "to"] as const) {
    if (typeof breadcrumb.data?.[key] === "string") data[key] = redactUrl(breadcrumb.data[key]);
  }
  if (typeof breadcrumb.data?.method === "string" && /^(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)$/i.test(breadcrumb.data.method)) {
    data.method = breadcrumb.data.method;
  }
  if (typeof breadcrumb.data?.status_code === "number") data.status_code = breadcrumb.data.status_code;
  return { category: breadcrumb.category, type: breadcrumb.type, level: breadcrumb.level, timestamp: breadcrumb.timestamp, data };
}

function sanitizeEvent(event: ErrorEvent): ErrorEvent {
  // Allowlist diagnostic fields instead of forwarding arbitrary request bodies,
  // headers, user/context objects, serialized errors, tags or attachments.
  return {
    type: event.type,
    event_id: event.event_id,
    timestamp: event.timestamp,
    level: event.level,
    platform: event.platform,
    environment: SENTRY_ENVIRONMENT || undefined,
    release: SENTRY_RELEASE || undefined,
    message: event.message ? redactText(event.message) : undefined,
    exception: event.exception ? { values: event.exception.values?.map((value) => ({
      type: value.type ? redactText(value.type) : undefined,
      value: value.value ? redactText(value.value) : undefined,
      mechanism: value.mechanism ? { type: redactText(value.mechanism.type), handled: value.mechanism.handled } : undefined,
      stacktrace: value.stacktrace ? { frames: value.stacktrace.frames?.map((frame) => ({
        filename: frame.filename ? redactUrl(frame.filename) : undefined,
        abs_path: frame.abs_path ? redactUrl(frame.abs_path) : undefined,
        function: frame.function ? redactText(frame.function) : undefined,
        lineno: frame.lineno,
        colno: frame.colno,
        in_app: frame.in_app,
      })) } : undefined,
    })) } : undefined,
    request: event.request?.url ? { url: redactUrl(event.request.url) } : undefined,
    debug_meta: event.debug_meta ? { images: event.debug_meta.images?.flatMap((image) =>
      image.type === "sourcemap" ? [{ type: "sourcemap" as const, code_file: redactUrl(image.code_file), debug_id: image.debug_id }] : []) } : undefined,
    breadcrumbs: event.breadcrumbs?.map(sanitizeBreadcrumb).filter((value): value is Breadcrumb => value !== null),
    tags: typeof event.tags?.boundary === "string" ? { boundary: redactText(event.tags.boundary) } : undefined,
    extra: typeof event.extra?.componentStack === "string" ? { componentStack: redactText(event.extra.componentStack) } : undefined,
  };
}

function isAllowed() {
  return Boolean(SENTRY_DSN) && analyticsAllowed && hasConsent("analytics");
}

function clearContext() {
  if (!sentryModule) return;
  sentryModule.setUser(null);
  sentryModule.getCurrentScope().clear();
  sentryModule.getIsolationScope().clear();
}

function invalidateClient() {
  generation++;
  if (sentryClient) sentryClient.getOptions().enabled = false;
  sentryClient = undefined;
  clearContext();
}

async function loadSentry(): Promise<SentryModule | null> {
  if (!isAllowed()) return null;
  const startedGeneration = generation;

  if (!sentryModulePromise) {
    sentryModulePromise = import("@sentry/react")
      .catch(() => {
        // Do not log import failures with arbitrary payloads or retry in a loop.
        console.error("Monitoring bootstrap failed");
        return null;
      });
  }
  const module = await sentryModulePromise;
  if (!module || !isAllowed() || startedGeneration !== generation) return null;
  sentryModule = module;
  if (!sentryClient) {
    clearContext();
    const canSend = () => startedGeneration === generation && isAllowed();
    sentryClient = module.init({
      dsn: SENTRY_DSN,
      environment: SENTRY_ENVIRONMENT || undefined,
      release: SENTRY_RELEASE || undefined,
      sendDefaultPii: false,
      sendClientReports: false,
      enableLogs: false,
      denyUrls: CLIENT_SIDE_DENY_URLS,
      // BrowserSession sends envelopes outside beforeSend. HttpContext includes
      // URL/referrer headers; ConversationId adds unnecessary correlation.
      integrations: (defaults) => defaults.filter(({ name }) => !["BrowserSession", "HttpContext", "ConversationId"].includes(name)),
      beforeSend(event, hint) {
        if (!canSend() || shouldDropMaskedOrExtensionEvent(event)) return null;
        hint.attachments = [];
        return sanitizeEvent(event);
      },
      beforeSendTransaction: () => null,
      beforeBreadcrumb: (breadcrumb) => canSend() ? sanitizeBreadcrumb(breadcrumb) : null,
      transport(options) {
        const transport = module.makeFetchTransport(options);
        return {
          send: (envelope) => canSend() ? transport.send(envelope) : Promise.resolve({}),
          flush: (timeout) => transport.flush(timeout),
        };
      },
    });
  }
  return module;
}

export function initMonitoring() {
  if (!removeListeners && typeof window !== "undefined") {
    const sync = () => {
      const next = hasConsent("analytics");
      if (analyticsAllowed !== next) {
        analyticsAllowed = next;
        invalidateClient();
      }
      if (isAllowed()) void loadSentry();
    };
    const onStorage = (event: StorageEvent) => {
      if (event.key === CONSENT_STORAGE_KEY || event.key === null) sync();
    };
    window.addEventListener(CONSENT_EVENT, sync);
    window.addEventListener("storage", onStorage);
    removeListeners = () => {
      window.removeEventListener(CONSENT_EVENT, sync);
      window.removeEventListener("storage", onStorage);
      removeListeners = undefined;
      analyticsAllowed = false;
      invalidateClient();
    };
    sync();
  }
  void loadSentry();
  return removeListeners;
}

export function setMonitoringUser(user: Pick<User, "id" | "email"> | null) {
  // Identity is only compared locally to discard stale errors/breadcrumbs when
  // accounts change. Neither the identifier nor email is passed to the SDK.
  const nextId = user?.id ?? null;
  if (sessionUserId !== nextId) {
    sessionUserId = nextId;
    invalidateClient();
  }
  initMonitoring();
}

export function captureException(error: unknown, context?: MonitoringContext) {
  initMonitoring();
  if (!isAllowed()) return;
  const capturedGeneration = generation;
  void loadSentry().then((module) => {
    if (!module || !isAllowed() || capturedGeneration !== generation) return;

    module.withScope((scope) => {
      if (typeof context?.tags?.boundary === "string") {
        scope.setTag("boundary", redactText(context.tags.boundary));
      }
      if (typeof context?.extra?.componentStack === "string") {
        scope.setExtra("componentStack", redactText(context.extra.componentStack));
      }

      module.captureException(error);
    });
  });
}
