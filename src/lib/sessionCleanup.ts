import { disablePushForCurrentSession as disableCurrentSessionPush } from "@/lib/push-unified";

const CART_STORAGE_VALUES = {
  "miamz-cart": "[]",
  "miamz-cart-metadata": "{}",
  "miamz-order-mode": "delivery",
};

const SESSION_STORAGE_KEYS = [
  "order-checkout-pending-session-id",
  "tok-zero-attente-checkout-session-id",
];

const LOCAL_STORAGE_KEYS_TO_REMOVE = [
  "stripe_pending_order_id",
  "tok-web-push-token",
  "tok-native-push-token",
];

function getLocalStorage() {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function getSessionStorage() {
  if (typeof window === "undefined") return null;
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

export function clearCartBrowserState() {
  const storage = getLocalStorage();
  if (!storage) return;

  for (const [key, value] of Object.entries(CART_STORAGE_VALUES)) {
    storage.setItem(key, value);
  }
}

export function clearAuthenticatedBrowserState() {
  clearCartBrowserState();

  const localStorage = getLocalStorage();
  if (localStorage) {
    for (const key of LOCAL_STORAGE_KEYS_TO_REMOVE) {
      localStorage.removeItem(key);
    }
  }

  const sessionStorage = getSessionStorage();
  if (sessionStorage) {
    for (const key of SESSION_STORAGE_KEYS) {
      sessionStorage.removeItem(key);
    }
  }
}

export async function disablePushForCurrentSession(userId: string) {
  return disableCurrentSessionPush(userId);
}
