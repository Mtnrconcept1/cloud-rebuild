import type { User } from "@supabase/supabase-js";
import { sanitizeEnvValue } from "@/lib/env";

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
let pendingUser: Pick<User, "id" | "email"> | null = null;
let sentryInitStarted = false;

async function loadSentry(): Promise<SentryModule | null> {
  if (!SENTRY_DSN) return null;

  if (!sentryModulePromise) {
    sentryModulePromise = import("@sentry/react")
      .then((module) => {
        if (!sentryInitStarted) {
          module.init({
            dsn: SENTRY_DSN,
            environment: SENTRY_ENVIRONMENT || undefined,
            release: SENTRY_RELEASE || undefined,
            sendDefaultPii: false,
            denyUrls: CLIENT_SIDE_DENY_URLS,
            beforeSend(event) {
              return shouldDropMaskedOrExtensionEvent(event) ? null : event;
            },
          });
          sentryInitStarted = true;
        }

        if (pendingUser) {
          module.setUser({
            id: pendingUser.id,
            email: pendingUser.email || undefined,
          });
        }

        return module;
      })
      .catch((error: unknown) => {
        console.error("Monitoring bootstrap failed", error);
        return null;
      });
  }

  return sentryModulePromise;
}

export function initMonitoring() {
  void loadSentry();
}

export function setMonitoringUser(user: Pick<User, "id" | "email"> | null) {
  pendingUser = user;

  void loadSentry().then((module) => {
    if (!module) return;

    module.setUser(user
      ? {
        id: user.id,
        email: user.email || undefined,
      }
      : null);
  });
}

export function captureException(error: unknown, context?: MonitoringContext) {
  void loadSentry().then((module) => {
    if (!module) return;

    module.withScope((scope) => {
      for (const [key, value] of Object.entries(context?.tags || {})) {
        scope.setTag(key, value);
      }

      for (const [key, value] of Object.entries(context?.extra || {})) {
        scope.setExtra(key, value);
      }

      module.captureException(error);
    });
  });
}
