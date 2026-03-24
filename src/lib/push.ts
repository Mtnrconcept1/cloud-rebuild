import { initializeApp, getApps } from "firebase/app";
import { getMessaging, getToken, isSupported } from "firebase/messaging";
import { supabase } from "@/integrations/supabase/client";
import {
  FIREBASE_API_KEY,
  FIREBASE_APP_ID,
  FIREBASE_AUTH_DOMAIN,
  FIREBASE_MESSAGING_SENDER_ID,
  FIREBASE_PROJECT_ID,
  FIREBASE_STORAGE_BUCKET,
  FIREBASE_VAPID_KEY,
} from "@/lib/env";

export type WebPushStatus = {
  enabled: boolean;
  tokenCount: number;
  permission: NotificationPermission | "unsupported";
  browserSupported: boolean;
  configReady: boolean;
};

function getFirebaseConfig() {
  const projectId = FIREBASE_PROJECT_ID;
  const config = {
    apiKey: FIREBASE_API_KEY,
    authDomain: FIREBASE_AUTH_DOMAIN || (projectId ? `${projectId}.firebaseapp.com` : ""),
    projectId,
    storageBucket: FIREBASE_STORAGE_BUCKET || (projectId ? `${projectId}.firebasestorage.app` : ""),
    messagingSenderId: FIREBASE_MESSAGING_SENDER_ID,
    appId: FIREBASE_APP_ID,
  };

  const vapidKey = FIREBASE_VAPID_KEY;
  const isReady = Object.values(config).every((value) => typeof value === "string" && value.length > 0)
    && typeof vapidKey === "string"
    && vapidKey.length > 0;

  return {
    config,
    vapidKey,
    isReady,
  };
}

function buildFirebaseMessagingServiceWorkerUrl() {
  const { config } = getFirebaseConfig();
  const url = new URL("/firebase-messaging-sw.js", window.location.origin);
  url.searchParams.set("apiKey", config.apiKey || "");
  url.searchParams.set("projectId", config.projectId || "");
  url.searchParams.set("messagingSenderId", config.messagingSenderId || "");
  url.searchParams.set("appId", config.appId || "");
  return url.toString();
}

export async function getWebPushStatus(userId: string): Promise<WebPushStatus> {
  const browserSupported = "Notification" in window && "serviceWorker" in navigator;
  const permission = "Notification" in window ? Notification.permission : "unsupported";
  const { isReady } = getFirebaseConfig();

  const { count, error } = await supabase
    .from("device_tokens")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("platform", "web")
    .eq("enabled", true);

  if (error) {
    throw new Error(error.message);
  }

  return {
    enabled: Number(count || 0) > 0,
    tokenCount: Number(count || 0),
    permission,
    browserSupported,
    configReady: isReady,
  };
}

export async function enableWebPush(userId: string) {
  if (!("Notification" in window) || !("serviceWorker" in navigator)) {
    return { ok: false, reason: "Notifications non supportees sur ce navigateur." };
  }

  try {
    const { config: firebaseConfig, vapidKey, isReady } = getFirebaseConfig();
    if (!isReady) {
      return { ok: false, reason: "Configuration Firebase manquante." };
    }

    const supported = await isSupported();
    if (!supported) {
      return { ok: false, reason: "Le push web n'est pas supporte ici." };
    }

    const permission = await Notification.requestPermission();
    if (permission !== "granted") {
      return { ok: false, reason: "Permission refusee." };
    }

    const app = getApps().length > 0 ? getApps()[0] : initializeApp(firebaseConfig);
    const registration = await navigator.serviceWorker.register(buildFirebaseMessagingServiceWorkerUrl());
    const readyRegistration = await navigator.serviceWorker.ready;
    const activeWorker = readyRegistration.active || registration.active;

    if (activeWorker) {
      activeWorker.postMessage({ type: "INIT_FIREBASE", config: firebaseConfig });
    }

    const messaging = getMessaging(app);
    const token = await getToken(messaging, {
      vapidKey,
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
    .eq("user_id", userId)
    .eq("platform", "web");

  if (error) {
    return { ok: false, reason: error.message };
  }

  return { ok: true };
}
