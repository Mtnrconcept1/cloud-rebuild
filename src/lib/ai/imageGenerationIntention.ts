type Body = Record<string, unknown>;
const PREFIX = "tok:image-intention:v1:";
const KEY = /^[A-Za-z0-9_.:-]{8,200}$/;
const inFlight = new Map<string, Promise<unknown>>();

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.keys(value).sort().filter((name) => (value as Body)[name] !== undefined)
    .map((name) => [name, canonical((value as Body)[name])]));
}

/** One user intention survives a lost response or reload without a second spend. */
export function runImageGenerationIntention<T>(
  userId: string,
  body: Body,
  send: (idempotencyKey: string) => Promise<T>,
  explicitKey?: string,
): Promise<T> {
  if (!userId) return Promise.reject(new Error("session_required"));
  if (explicitKey !== undefined && !KEY.test(explicitKey)) return Promise.reject(new Error("image_idempotency_key_invalid"));
  const data = { ...body };
  delete data.idempotency_key;
  delete data.idempotencyKey;
  const fingerprint = JSON.stringify([userId, canonical(data), explicitKey || null]);
  const existing = inFlight.get(fingerprint);
  if (existing) return existing as Promise<T>;

  // Install the promise BEFORE hashing or reading storage so simultaneous
  // calls cannot create two independent keys while the first digest is pending.
  const operation = Promise.resolve().then(async () => {
    if (explicitKey) return send(explicitKey);
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(fingerprint));
    const storageKey = PREFIX + [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
    let key: string;
    try {
      const saved = sessionStorage.getItem(storageKey);
      if (saved !== null && !KEY.test(saved)) throw new Error("invalid_saved_intention");
      key = saved || "image:" + crypto.randomUUID();
      sessionStorage.setItem(storageKey, key);
      if (sessionStorage.getItem(storageKey) !== key) throw new Error("intention_not_persisted");
    } catch {
      // A memory-only fallback would forget an uncertain spend after reload.
      throw new Error("image_intention_storage_unavailable");
    }
    try {
      const result = await send(key);
      try { sessionStorage.removeItem(storageKey); } catch { /* Replaying a completed key is safe. */ }
      return result;
    } catch (error) {
      // Only the backend's explicit terminal failure proves the reservation
      // was released. Timeouts, quota errors and ambiguous results keep the key.
      if (error instanceof Error && error.message === "image_generation_failed") {
        try { sessionStorage.removeItem(storageKey); } catch { /* Keep fail-closed replay if storage is unavailable. */ }
      }
      throw error;
    }
  }).finally(() => { inFlight.delete(fingerprint); });
  inFlight.set(fingerprint, operation);
  return operation;
}
