import { PushNotifications } from "@capacitor/push-notifications";
import { supabase } from "@/integrations/supabase/client";
import { getPlatform } from "@/lib/platform";

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
            } as any,
            { onConflict: "user_id,token" }
          );

        if (error) {
          resolve({ ok: false, reason: error.message });
        } else {
          resolve({ ok: true });
        }
      });

      PushNotifications.addListener("registrationError", (error) => {
        resolve({ ok: false, reason: error.error || "Erreur d'enregistrement push." });
      });
    });
  } catch (e: any) {
    return { ok: false, reason: e?.message || "Push natif indisponible." };
  }
}

export async function unregisterNativePush(userId: string): Promise<{ ok: boolean; reason?: string }> {
  const platform = getPlatform();
  const { error } = await supabase
    .from("device_tokens")
    .update({ enabled: false } as any)
    .eq("user_id", userId)
    .eq("platform", platform);

  if (error) return { ok: false, reason: error.message };
  return { ok: true };
}

export function setupNativePushListeners(navigateFn: (url: string) => void) {
  PushNotifications.addListener("pushNotificationReceived", (notification) => {
    console.log("Push received in foreground:", notification);
  });

  PushNotifications.addListener("pushNotificationActionPerformed", (action) => {
    const data = action.notification.data;
    const url = data?.url || "/notifications";
    navigateFn(url);
  });
}
