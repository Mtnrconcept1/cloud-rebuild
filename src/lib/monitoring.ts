import type { User } from "@supabase/supabase-js";
import { sanitizeEnvValue } from "@/lib/env";

type MonitoringContext = {
  extra?: Record<string, unknown>;
  tags?: Record<string, string>;
};

const SENTRY_DSN = sanitizeEnvValue(import.meta.env.VITE_SENTRY_DSN);
const SENTRY_ENVIRONMENT = sanitizeEnvValue(import.meta.env.VITE_SENTRY_ENVIRONMENT || import.meta.env.MODE);
const SENTRY_RELEASE = sanitizeEnvValue(import.meta.env.VITE_APP_RELEASE);

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
