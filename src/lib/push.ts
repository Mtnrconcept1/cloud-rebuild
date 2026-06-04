import { initializeApp, getApps } from "firebase/app";
import { getMessaging, getToken, isSupported } from "firebase/messaging";
import { getSupabase } from "@/integrations/supabase/client";
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
  configError?: string;
};

export const FIREBASE_VAPID_KEY_ERROR =
  "La cle VAPID web Firebase est invalide. Dans Firebase Console > Cloud Messaging > Web Push certificates, copiez la cle publique VAPID dans VITE_FIREBASE_VAPID_KEY.";

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
  const configFieldsReady = Object.values(config).every((value) => typeof value === "string" && value.length > 0);
  const vapidKeyValid = isValidP256PublicVapidKey(vapidKey);
  const isReady = configFieldsReady && vapidKeyValid;

  return {
    config,
    vapidKey,
    configFieldsReady,
    vapidKeyValid,
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
  const { configFieldsReady, vapidKeyValid, isReady } = getFirebaseConfig();

  const { count, error } = await getSupabase()
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
    configError: configFieldsReady && !vapidKeyValid ? FIREBASE_VAPID_KEY_ERROR : undefined,
  };
}

export async function enableWebPush(userId: string) {
  if (!("Notification" in window) || !("serviceWorker" in navigator)) {
    return { ok: false, reason: "Notifications non supportees sur ce navigateur." };
  }

  try {
    const { config: firebaseConfig, vapidKey, isReady } = getFirebaseConfig();
    if (!isReady) {
      if (!isValidP256PublicVapidKey(vapidKey)) {
        return { ok: false, reason: FIREBASE_VAPID_KEY_ERROR };
      }

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

    const { error } = await getSupabase()
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
    return { ok: false, reason: getWebPushErrorMessage(e) };
  }
}

export async function disableWebPush(userId: string) {
  const { error } = await getSupabase()
    .from("device_tokens")
    .update({ enabled: false } as any)
    .eq("user_id", userId)
    .eq("platform", "web");

  if (error) {
    return { ok: false, reason: error.message };
  }

  return { ok: true };
}

export function isValidP256PublicVapidKey(value: unknown) {
  if (typeof value !== "string") return false;

  const normalized = value.trim();
  if (!normalized || normalized.includes("-----") || normalized.startsWith("{")) return false;
  if (!/^[A-Za-z0-9_-]+={0,2}$/.test(normalized)) return false;

  try {
    const bytes = base64UrlToBytes(normalized);
    return bytes.length === 65 && bytes[0] === 0x04;
  } catch {
    return false;
  }
}

function base64UrlToBytes(value: string) {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, "=");
  const binary = atob(padded);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

function getWebPushErrorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : "";
  if (/applicationServerKey|P-256|vapid/i.test(message)) {
    return FIREBASE_VAPID_KEY_ERROR;
  }

  return message || "Firebase non disponible.";
}
