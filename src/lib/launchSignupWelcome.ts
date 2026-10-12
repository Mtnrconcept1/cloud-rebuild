const PENDING_SIGNUP_KEY = 'tok:pending-client-signup';
const PENDING_SIGNUP_TTL_MS = 60 * 60 * 1000;

/** An unsigned UI marker, containing no identity or authentication token. */
export function markPendingClientSignup(now = Date.now()): void {
  try {
    if (typeof window !== 'undefined') window.sessionStorage.setItem(PENDING_SIGNUP_KEY, String(now));
  } catch {
    // Private browsing may disable storage.
  }
}

export function hasPendingClientSignup(now = Date.now()): boolean {
  try {
    if (typeof window === 'undefined') return false;
    const saved = Number(window.sessionStorage.getItem(PENDING_SIGNUP_KEY));
    return Number.isFinite(saved) && saved > 0 && now >= saved && now - saved < PENDING_SIGNUP_TTL_MS;
  } catch {
    return false;
  }
}
