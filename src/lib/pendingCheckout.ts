export type PendingCheckoutPostActions = {
  sessionId: string;
  userId: string;
  orderId: string | null;
  pointsToRedeem: number;
  promoCodeId: string | null;
};

const STORAGE_KEY = "tok-pending-checkout-post-actions-v1";

function readPendingCheckoutStore() {
  if (typeof window === "undefined") return {} as Record<string, PendingCheckoutPostActions>;

  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed as Record<string, PendingCheckoutPostActions> : {};
  } catch {
    return {};
  }
}

function writePendingCheckoutStore(store: Record<string, PendingCheckoutPostActions>) {
  if (typeof window === "undefined") return;

  try {
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  } catch {
    // Ignore session storage failures.
  }
}

export function savePendingCheckoutPostActions(payload: PendingCheckoutPostActions) {
  const store = readPendingCheckoutStore();
  store[payload.sessionId] = payload;
  writePendingCheckoutStore(store);
}

export function getPendingCheckoutPostActions(sessionId: string) {
  const store = readPendingCheckoutStore();
  return store[sessionId] || null;
}

export function clearPendingCheckoutPostActions(sessionId: string) {
  const store = readPendingCheckoutStore();
  if (store[sessionId]) {
    delete store[sessionId];
    writePendingCheckoutStore(store);
  }
}

export function consumePendingCheckoutPostActions(sessionId: string) {
  const payload = getPendingCheckoutPostActions(sessionId);
  if (payload) clearPendingCheckoutPostActions(sessionId);
  return payload;
}
