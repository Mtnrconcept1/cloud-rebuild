import { PushNotifications } from "@capacitor/push-notifications";
import type { PushNotificationSchema } from "@capacitor/push-notifications";
import type { PluginListenerHandle } from "@capacitor/core";
import { toast } from "sonner";
import { getSupabase } from "@/integrations/supabase/client";
import { getPlatform } from "@/lib/platform";
import { normalizeInternalNavigationTarget } from "@/lib/navigation";

const PUSH_REGISTRATION_TIMEOUT_MS = 15000;
const NATIVE_PUSH_TOKEN_STORAGE_KEY = "tok-native-push-token";

let nativePushListenerHandles: Array<Promise<PluginListenerHandle>> = [];

type DeviceTokenMutation = {
  user_id: string;
  token: string;
  platform: string;
  enabled: boolean;
  last_seen?: string;
};

function getErrorMessage(error: unknown, fallback: string) {
  if (typeof error === "object" && error !== null && "error" in error) {
    const message = (error as { error?: unknown }).error;
    if (typeof message === "string" && message) return message;
  }

  return error instanceof Error ? error.message : fallback;
}

function rememberNativePushToken(token: string) {
  try {
    localStorage.setItem(NATIVE_PUSH_TOKEN_STORAGE_KEY, token);
  } catch {
    // Token cleanup is best effort when storage is blocked.
  }
}

function readNativePushToken() {
  try {
    const storedToken = localStorage.getItem(NATIVE_PUSH_TOKEN_STORAGE_KEY);
    return storedToken && storedToken.trim() ? storedToken.trim() : null;
  } catch {
    return null;
  }
}

function clearRememberedNativePushToken() {
  try {
    localStorage.removeItem(NATIVE_PUSH_TOKEN_STORAGE_KEY);
  } catch {
    // Token cleanup is best effort when storage is blocked.
  }
}

function cleanupListenerHandles(handles: Array<Promise<PluginListenerHandle>>) {
  for (const handlePromise of handles) {
    void handlePromise
      .then((handle) => handle.remove())
      .catch((error) => {
        console.warn("Unable to remove native push listener", error);
      });
  }
}

function getNotificationTarget(notification: PushNotificationSchema, fallback = "/notifications") {
  const data = notification.data && typeof notification.data === "object" ? notification.data : {};
  const rawUrl =
    typeof data.url === "string"
      ? data.url
      : typeof data.deepLink === "string"
        ? data.deepLink
        : typeof notification.link === "string"
          ? notification.link
          : null;

  return normalizeInternalNavigationTarget(rawUrl, fallback);
}

function showForegroundPushToast(
  notification: PushNotificationSchema,
  navigateFn: (url: string) => void,
) {
  const title = notification.title || "Nouvelle notification Tok";
  const description = notification.body || notification.subtitle || undefined;
  const target = getNotificationTarget(notification);

  toast.info(title, {
    description,
    action: {
      label: "Ouvrir",
      onClick: () => navigateFn(target),
    },
  });
}

export async function registerNativePush(userId: string): Promise<{ ok: boolean; reason?: string }> {
  try {
    const permResult = await PushNotifications.requestPermissions();
    if (permResult.receive !== "granted") {
      return { ok: false, reason: "Permission refusee." };
    }

    return new Promise((resolve) => {
      let settled = false;
      let timeoutId: ReturnType<typeof setTimeout> | null = null;

      const finish = (result: { ok: boolean; reason?: string }) => {
        if (settled) return;
        settled = true;
        if (timeoutId) clearTimeout(timeoutId);
        cleanupListenerHandles([registrationHandle, registrationErrorHandle]);
        resolve(result);
      };

      const registrationHandle = PushNotifications.addListener("registration", async (token) => {
        const platform = getPlatform();

        const { error } = await getSupabase()
          .from("device_tokens")
          .upsert(
            {
              user_id: userId,
              token: token.value,
              platform,
              enabled: true,
              last_seen: new Date().toISOString(),
            } satisfies DeviceTokenMutation,
            { onConflict: "user_id,token" }
          );

        if (error) {
          finish({ ok: false, reason: error.message });
        } else {
          rememberNativePushToken(token.value);
          finish({ ok: true });
        }
      });

      const registrationErrorHandle = PushNotifications.addListener("registrationError", (error) => {
        finish({ ok: false, reason: getErrorMessage(error, "Erreur d'enregistrement push.") });
      });

      timeoutId = setTimeout(() => {
        finish({ ok: false, reason: "Délai d'enregistrement push dépassé." });
      }, PUSH_REGISTRATION_TIMEOUT_MS);

      void PushNotifications.register().catch((error) => {
        finish({ ok: false, reason: getErrorMessage(error, "Erreur d'enregistrement push.") });
      });
    });
  } catch (error: unknown) {
    return { ok: false, reason: getErrorMessage(error, "Push natif indisponible.") };
  }
}

export async function isCurrentNativePushEnabled(userId: string) {
  const storedToken = readNativePushToken();
  if (!storedToken) return false;

  const { count, error } = await getSupabase()
    .from("device_tokens")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("platform", getPlatform())
    .eq("token", storedToken)
    .eq("enabled", true);

  if (error) throw new Error(error.message);
  return Number(count || 0) > 0;
}

export async function unregisterNativePush(userId: string): Promise<{ ok: boolean; reason?: string }> {
  const storedToken = readNativePushToken();

  await PushNotifications.unregister().catch((error) => {
    console.warn("Unable to unregister native push token", error);
  });

  const platform = getPlatform();
  let query = getSupabase()
    .from("device_tokens")
    .update({ enabled: false } satisfies Partial<DeviceTokenMutation>)
    .eq("user_id", userId)
    .eq("platform", platform);

  if (storedToken) {
    query = query.eq("token", storedToken);
  }

  const { error } = await query;
  clearRememberedNativePushToken();

  if (error) return { ok: false, reason: error.message };
  return { ok: true };
}

export function setupNativePushListeners(navigateFn: (url: string) => void) {
  cleanupNativePushListeners();

  const handles = [
    PushNotifications.addListener("pushNotificationReceived", (notification) => {
      showForegroundPushToast(notification, navigateFn);
    }),
    PushNotifications.addListener("pushNotificationActionPerformed", (action) => {
      navigateFn(getNotificationTarget(action.notification));
    }),
  ];

  nativePushListenerHandles = handles;

  return () => {
    if (nativePushListenerHandles === handles) cleanupNativePushListeners();
  };
}

export function cleanupNativePushListeners() {
  const handles = nativePushListenerHandles;
  nativePushListenerHandles = [];
  cleanupListenerHandles(handles);
}
