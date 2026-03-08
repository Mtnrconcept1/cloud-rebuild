import { supabase } from "@/integrations/supabase/client";

async function loadFirebase() {
  try {
    // Use variable to prevent Vite from statically analyzing the import
    const appModule = "firebase/app";
    const msgModule = "firebase/messaging";
    const { initializeApp, getApps } = await (Function('m', 'return import(m)')(appModule));
    const { getMessaging, getToken, isSupported } = await (Function('m', 'return import(m)')(msgModule));
    return { initializeApp, getApps, getMessaging, getToken, isSupported };
  } catch {
    return null;
  }
}

export async function enableWebPush(userId: string) {
  if (!("Notification" in window)) {
    return { ok: false, reason: "Notifications non supportées sur ce navigateur." };
  }

  try {
    const firebase = await loadFirebase();
    if (!firebase) {
      return { ok: false, reason: "Firebase non disponible." };
    }

    const { initializeApp, getApps, getMessaging, getToken, isSupported } = firebase;

    const supported = await isSupported();
    if (!supported) {
      return { ok: false, reason: "Le push web n'est pas supporté ici." };
    }

    const permission = await Notification.requestPermission();
    if (permission !== "granted") {
      return { ok: false, reason: "Permission refusée." };
    }

    const firebaseConfig = {
      apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
      projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
      messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
      appId: import.meta.env.VITE_FIREBASE_APP_ID,
    };

    const app = getApps().length > 0 ? getApps()[0] : initializeApp(firebaseConfig);

    const registration = await navigator.serviceWorker.register("/firebase-messaging-sw.js");
    const readyRegistration = await navigator.serviceWorker.ready;
    const activeWorker = readyRegistration.active || registration.active;

    if (activeWorker) {
      activeWorker.postMessage({ type: "INIT_FIREBASE", config: firebaseConfig });
    }

    const messaging = getMessaging(app);
    const token = await getToken(messaging, {
      vapidKey: import.meta.env.VITE_FCM_VAPID_KEY,
      serviceWorkerRegistration: readyRegistration,
    });

    if (!token) {
      return { ok: false, reason: "Token push introuvable." };
    }

    const { error } = await supabase
      .from("device_tokens")
      .upsert({
        user_id: userId,
        token,
        platform: "web",
        enabled: true,
        last_seen: new Date().toISOString(),
      } as any, { onConflict: "user_id,token" });

    if (error) {
      return { ok: false, reason: error.message };
    }

    return { ok: true };
  } catch (e: any) {
    return { ok: false, reason: e?.message || "Firebase non disponible." };
  }
}

export async function disableWebPush(userId: string) {
  const { error } = await supabase
    .from("device_tokens")
    .update({ enabled: false } as any)
    .eq("user_id", userId);

  if (error) {
    return { ok: false, reason: error.message };
  }

  return { ok: true };
}
