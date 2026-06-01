import { getSupabase } from "@/integrations/supabase/client";

type DispatchNotificationOptions = {
  push?: boolean;
  email?: boolean;
};

const NOTIFICATION_DISPATCH_BACKOFF_MS = 5 * 60 * 1000;

let notificationDispatchDisabledUntil = 0;
let notificationDispatchDisableReason = "";

async function getFunctionsErrorMessage(response: Response | undefined, fallback: string) {
  if (!response) return fallback;

  const contentType = response.headers.get("content-type") || "";
  try {
    if (contentType.includes("application/json")) {
      const payload = await response.clone().json();
      if (payload && typeof payload.error === "string" && payload.error.trim().length > 0) {
        return payload.error;
      }
    }

    const text = await response.clone().text();
    return text.trim() || fallback;
  } catch {
    return fallback;
  }
}

export async function dispatchQueuedNotifications(
  source: string,
  options: DispatchNotificationOptions = {},
) {
  if (notificationDispatchDisabledUntil > Date.now()) {
    return {
      ok: false,
      skipped: true,
      reason: notificationDispatchDisableReason,
    };
  }

  const { data, error, response } = await getSupabase().functions.invoke("notification-dispatch", {
    body: {
      source,
      push: options.push ?? true,
      email: options.email ?? true,
    },
  });

  if (error) {
    const message = await getFunctionsErrorMessage(response, error.message);
    const status = response?.status ?? null;

    if (status === null || status === 404 || status >= 500) {
      notificationDispatchDisabledUntil = Date.now() + NOTIFICATION_DISPATCH_BACKOFF_MS;
      notificationDispatchDisableReason = message;
      console.warn("[notifications] dispatch temporarily disabled:", message);
      return {
        ok: false,
        skipped: true,
        reason: message,
      };
    }

    throw new Error(message);
  }

  if (data?.error) {
    throw new Error(String(data.error));
  }

  if (Array.isArray(data?.channel_errors) && data.channel_errors.length > 0) {
    console.warn("[notifications] dispatch complèted with channel errors:", data.channel_errors);
  }

  return data;
}
