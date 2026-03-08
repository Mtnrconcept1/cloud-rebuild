// Firebase push notifications - lazy loaded to avoid hard dependency
let firebaseApp: any;
let firebaseMessaging: any;

async function loadFirebase() {
  try {
    const { initializeApp, getApps } = await import("firebase/app");
    const { getMessaging, getToken: gt, isSupported: is } = await import("firebase/messaging");
    if (getApps().length === 0) {
      firebaseApp = initializeApp({
        apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
        projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
        messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
        appId: import.meta.env.VITE_FIREBASE_APP_ID,
      });
    } else {
      firebaseApp = getApps()[0];
    }
    return { getMessaging, getToken: gt, isSupported: is };
  } catch {
    return null;
  }
}
import { supabase } from "@/integrations/supabase/client";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

function getFirebaseApp() {
  if (getApps().length > 0) return getApps()[0];
  return initializeApp(firebaseConfig);
}

export async function enableWebPush(userId: string) {
  if (!("Notification" in window)) {
    return { ok: false, reason: "Notifications non supportées sur ce navigateur." };
  }

  const supported = await isSupported();
  if (!supported) {
    return { ok: false, reason: "Le push web n'est pas supporté ici." };
  }

  const permission = await Notification.requestPermission();
  if (permission !== "granted") {
    return { ok: false, reason: "Permission refusée." };
  }

  const registration = await navigator.serviceWorker.register("/firebase-messaging-sw.js");
  const readyRegistration = await navigator.serviceWorker.ready;
  const activeWorker = readyRegistration.active || registration.active;

  if (activeWorker) {
    activeWorker.postMessage({ type: "INIT_FIREBASE", config: firebaseConfig });
  }

  const messaging = getMessaging(getFirebaseApp());
  const token = await getToken(messaging, {
    vapidKey: import.meta.env.VITE_FCM_VAPID_KEY,
    serviceWorkerRegistration: readyRegistration,
  });

  if (!token) {
    return { ok: false, reason: "Token push introuvable." };
  }

  const { error } = await supabase
    .from("device_tokens" as any)
    .upsert({
      user_id: userId,
      token,
      platform: "web",
      enabled: true,
      last_seen: new Date().toISOString(),
    }, { onConflict: "user_id,token" });

  if (error) {
    return { ok: false, reason: error.message };
  }

  return { ok: true };
}

export async function disableWebPush(userId: string) {
  const { error } = await supabase
    .from("device_tokens" as any)
    .update({ enabled: false })
    .eq("user_id", userId);

  if (error) {
    return { ok: false, reason: error.message };
  }

  return { ok: true };
}