const DATABASE_NAME = "tok-pending-signup";
const DATABASE_VERSION = 1;
const STORE_NAME = "drafts";
const ACTIVE_DRAFT_KEY = "active";
const MARKER_KEY = "tok:pending-privileged-signup";
const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000;

export type PendingPrivilegedSignupDraft<TPayload> = {
  id: string;
  userId: string;
  email: string;
  createdAt: string;
  expiresAt: string;
  payload: TPayload;
};

function getIndexedDb() {
  if (typeof window === "undefined" || !window.indexedDB) {
    throw new Error("Le stockage sécurisé temporaire du navigateur n'est pas disponible.");
  }
  return window.indexedDB;
}

function requestResult<T>(request: IDBRequest<T>) {
  return new Promise<T>((resolve, reject) => {
    request.addEventListener("success", () => resolve(request.result), { once: true });
    request.addEventListener("error", () => reject(request.error || new Error("Erreur IndexedDB.")), { once: true });
  });
}

function transactionDone(transaction: IDBTransaction) {
  return new Promise<void>((resolve, reject) => {
    transaction.addEventListener("complete", () => resolve(), { once: true });
    transaction.addEventListener("abort", () => reject(transaction.error || new Error("Transaction IndexedDB annulée.")), { once: true });
    transaction.addEventListener("error", () => reject(transaction.error || new Error("Erreur de transaction IndexedDB.")), { once: true });
  });
}

async function openDatabase() {
  const request = getIndexedDb().open(DATABASE_NAME, DATABASE_VERSION);
  request.addEventListener("upgradeneeded", () => {
    const database = request.result;
    if (!database.objectStoreNames.contains(STORE_NAME)) {
      database.createObjectStore(STORE_NAME);
    }
  });
  return requestResult(request);
}

function setMarker(present: boolean) {
  if (typeof window === "undefined") return;
  try {
    if (present) window.localStorage.setItem(MARKER_KEY, "1");
    else window.localStorage.removeItem(MARKER_KEY);
  } catch {
    // IndexedDB remains authoritative when localStorage is unavailable.
  }
}

export function hasPendingPrivilegedSignupMarker() {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(MARKER_KEY) === "1";
  } catch {
    return false;
  }
}

export function createPendingPrivilegedSignupDraft<TPayload>(input: {
  userId: string;
  email: string;
  payload: TPayload;
  id?: string;
  now?: Date;
  ttlMs?: number;
}): PendingPrivilegedSignupDraft<TPayload> {
  const now = input.now || new Date();
  const ttlMs = Math.max(input.ttlMs ?? DEFAULT_TTL_MS, 60_000);
  return {
    id: input.id || crypto.randomUUID(),
    userId: input.userId,
    email: input.email.trim().toLowerCase(),
    createdAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + ttlMs).toISOString(),
    payload: input.payload,
  };
}

export async function savePendingPrivilegedSignupDraft<TPayload>(
  draft: PendingPrivilegedSignupDraft<TPayload>,
) {
  const database = await openDatabase();
  try {
    const transaction = database.transaction(STORE_NAME, "readwrite");
    transaction.objectStore(STORE_NAME).put(draft, ACTIVE_DRAFT_KEY);
    await transactionDone(transaction);
    setMarker(true);
  } finally {
    database.close();
  }
}

export async function loadPendingPrivilegedSignupDraft<TPayload>() {
  const database = await openDatabase();
  try {
    const transaction = database.transaction(STORE_NAME, "readonly");
    const draft = await requestResult(
      transaction.objectStore(STORE_NAME).get(ACTIVE_DRAFT_KEY),
    ) as PendingPrivilegedSignupDraft<TPayload> | undefined;
    await transactionDone(transaction);

    if (!draft) {
      setMarker(false);
      return null;
    }

    if (!Number.isFinite(Date.parse(draft.expiresAt)) || Date.parse(draft.expiresAt) <= Date.now()) {
      await clearPendingPrivilegedSignupDraft();
      return null;
    }

    return draft;
  } finally {
    database.close();
  }
}

export async function clearPendingPrivilegedSignupDraft() {
  if (typeof window === "undefined" || !window.indexedDB) {
    setMarker(false);
    return;
  }

  const database = await openDatabase();
  try {
    const transaction = database.transaction(STORE_NAME, "readwrite");
    transaction.objectStore(STORE_NAME).delete(ACTIVE_DRAFT_KEY);
    await transactionDone(transaction);
    setMarker(false);
  } finally {
    database.close();
  }
}
