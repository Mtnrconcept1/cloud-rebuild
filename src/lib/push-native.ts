import { PushNotifications } from "@capacitor/push-notifications";
import { supabase } from "@/integrations/supabase/client";
import { getPlatform } from "@/lib/platform";
import { normalizeInternalNavigationTarget } from "@/lib/navigation";

let nativePushListenersInitialized = false;

type DeviceTokenMutation = {
  user_id: string;
  token: string;
  platform: string;
  enabled: boolean;
  last_seen?: string;
};

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

export async function registerNativePush(userId: string): Promise<{ ok: boolean; reason?: string }> {
  try {
    const permResult = await PushNotifications.requestPermissions();
    if (permResult.receive !== "granted") {
      return { ok: false, reason: "Permission refusee." };
    }

    await PushNotifications.register();

    return new Promise((resolve) => {
      PushNotifications.addListener("registration", async (token) => {
        const platform = getPlatform();

        const { error } = await supabase
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
          resolve({ ok: false, reason: error.message });
        } else {
          resolve({ ok: true });
        }
      });

      PushNotifications.addListener("registrationError", (error) => {
        resolve({ ok: false, reason: getErrorMessage(error, "Erreur d'enregistrement push.") });
      });
    });
  } catch (error: unknown) {
    return { ok: false, reason: getErrorMessage(error, "Push natif indisponible.") };
  }
}

export async function unregisterNativePush(userId: string): Promise<{ ok: boolean; reason?: string }> {
  const platform = getPlatform();
  const { error } = await supabase
    .from("device_tokens")
    .update({ enabled: false } satisfies Partial<DeviceTokenMutation>)
    .eq("user_id", userId)
    .eq("platform", platform);

  if (error) return { ok: false, reason: error.message };
  return { ok: true };
}

export function setupNativePushListeners(navigateFn: (url: string) => void) {
  if (nativePushListenersInitialized) return;
  nativePushListenersInitialized = true;

  PushNotifications.addListener("pushNotificationReceived", (notification) => {
    console.log("Push received in foreground:", notification);
  });

  PushNotifications.addListener("pushNotificationActionPerformed", (action) => {
    const data = action.notification.data;
    const url = normalizeInternalNavigationTarget(
      typeof data?.url === "string" ? data.url : null,
      "/notifications",
    );
    navigateFn(url);
  });
}
