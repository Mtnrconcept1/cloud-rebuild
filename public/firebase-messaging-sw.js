/* global importScripts, firebase */

const FIREBASE_VERSION = "11.7.1";
let messagingInitialized = false;

function readFirebaseConfig(search) {
  const params = new URLSearchParams(search || "");
  const config = {
    apiKey: params.get("apiKey") || "",
    projectId: params.get("projectId") || "",
    messagingSenderId: params.get("messagingSenderId") || "",
    appId: params.get("appId") || "",
  };

  const isReady = Object.values(config).every((value) => typeof value === "string" && value.length > 0);
  return isReady ? config : null;
}

function normalizeNotificationUrl(rawUrl) {
  if (!rawUrl || typeof rawUrl !== "string") return "/";
  if (/^https?:\/\//.test(rawUrl)) return rawUrl;
  return `${self.location.origin}${rawUrl.startsWith("/") ? rawUrl : `/${rawUrl}`}`;
}

function showNotificationFromPayload(payload) {
  const title = payload?.notification?.title || payload?.data?.title || "Nouvelle alerte";
  const body = payload?.notification?.body || payload?.data?.body || "";
  const data = payload?.data && typeof payload.data === "object" ? payload.data : {};
  const targetUrl = normalizeNotificationUrl(data.url || "/courier/jobs");

  self.registration.showNotification(title, {
    body,
    icon: "/icon-192.png",
    badge: "/icon-72.png",
    data: {
      ...data,
      url: targetUrl,
    },
  });
}

function ensureMessaging(config) {
  if (messagingInitialized || !config) return;

  importScripts(`https://www.gstatic.com/firebasejs/${FIREBASE_VERSION}/firebase-app-compat.js`);
  importScripts(`https://www.gstatic.com/firebasejs/${FIREBASE_VERSION}/firebase-messaging-compat.js`);

  if (!firebase.apps.length) {
    firebase.initializeApp(config);
  }

  const messaging = firebase.messaging();
  messaging.onBackgroundMessage((payload) => {
    showNotificationFromPayload(payload);
  });

  messagingInitialized = true;
}

ensureMessaging(readFirebaseConfig(self.location.search));

self.addEventListener("message", (event) => {
  if (event.data?.type === "INIT_FIREBASE") {
    ensureMessaging(event.data.config || null);
  }
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const targetUrl = normalizeNotificationUrl(event.notification?.data?.url || "/courier/jobs");

  event.waitUntil((async () => {
    const windowClients = await clients.matchAll({
      type: "window",
      includeUncontrolled: true,
    });

    for (const client of windowClients) {
      if ("focus" in client) {
        await client.focus();
        if ("navigate" in client) {
          await client.navigate(targetUrl);
        }
        return;
      }
    }

    await clients.openWindow(targetUrl);
  })());
});
