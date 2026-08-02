import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import {
  MarketingSessionContext,
  type MarketingMfaEnrollment,
  type MarketingSessionStatus,
} from "@/marketing/MarketingSessionContext";
import {
  MARKETING_BFF_ENDPOINTS,
  MARKETING_SESSION_EXPIRED_EVENT,
  MarketingBffError,
  isMarketingTotpCode,
  marketingBffRequest,
} from "@/marketing/marketingBffClient";

type UnknownRecord = Record<string, unknown>;

export type SessionSnapshot = {
  status: Exclude<MarketingSessionStatus, "loading" | "error">;
  enrollment: MarketingMfaEnrollment | null;
  expiresAt: string | null;
};

const LOGIN_ERROR = "Connexion impossible. Vérifiez vos informations et réessayez.";
const MFA_ERROR = "Code invalide ou expiré. Réessayez avec un nouveau code.";
const SESSION_ERROR = "Impossible de vérifier la session marketing. Réessayez.";

function asRecord(value: unknown): UnknownRecord {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as UnknownRecord
    : {};
}

function asString(value: unknown, maxLength: number) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function parseEnrollment(payload: UnknownRecord): MarketingMfaEnrollment | null {
  const nested = asRecord(payload.enrollment || payload.mfaEnrollment || payload.mfa_enrollment);
  const candidate = Object.keys(nested).length ? nested : payload;
  const secret = asString(candidate.secret, 256) || null;
  const rawOtpauthUri = asString(candidate.otpauthUri || candidate.otpauth_uri, 4_096);
  const otpauthUri = /^otpauth:\/\/totp\//i.test(rawOtpauthUri) ? rawOtpauthUri : null;
  const qrCandidate = asString(
    candidate.qrCode || candidate.qr_code || candidate.qrCodeDataUrl || candidate.qr_code_data_url,
    500_000,
  );
  const qrCodeDataUrl = /^data:image\/(?:png|svg\+xml);base64,[A-Za-z0-9+/=]+$/.test(qrCandidate)
    ? qrCandidate
    : null;

  if (!qrCodeDataUrl && !(secret && otpauthUri)) return null;
  return { secret, otpauthUri, qrCodeDataUrl };
}

export function normalizeMarketingSessionPayload(
  value: unknown,
  now = Date.now(),
): SessionSnapshot {
  const root = asRecord(value);
  const nested = asRecord(root.session);
  const payload = Object.keys(nested).length ? { ...root, ...nested } : root;
  const rawStatus = asString(payload.status || payload.state || payload.next, 80).toLowerCase();
  const enrollment = parseEnrollment(payload);
  const rawExpiresAt = asString(payload.expiresAt || payload.expires_at, 80);
  const expiresAtTimestamp = rawExpiresAt ? Date.parse(rawExpiresAt) : Number.NaN;
  const expiresAt = Number.isFinite(expiresAtTimestamp)
    ? new Date(expiresAtTimestamp).toISOString()
    : null;

  if (payload.authenticated === true || ["authenticated", "ready"].includes(rawStatus)) {
    // An authenticated payload without a future server expiry is malformed or
    // already stale. Treat both cases as signed out so privileged UI and any
    // ephemeral revealed target are unmounted immediately.
    if (!expiresAt || expiresAtTimestamp <= now) {
      return { status: "unauthenticated", enrollment: null, expiresAt: null };
    }
    return { status: "authenticated", enrollment: null, expiresAt };
  }
  if (
    payload.enrollmentRequired === true
    || payload.enrollment_required === true
    || ["enroll-mfa", "mfa_enrollment_required", "enrollment_required"].includes(rawStatus)
  ) {
    return { status: "enroll-mfa", enrollment, expiresAt: null };
  }
  if (
    payload.mfaRequired === true
    || payload.mfa_required === true
    || ["challenge-mfa", "mfa_required", "challenge_required"].includes(rawStatus)
  ) {
    return { status: "challenge-mfa", enrollment: null, expiresAt: null };
  }
  if (payload.authenticated === false || ["unauthenticated", "signed_out", "anonymous"].includes(rawStatus)) {
    return { status: "unauthenticated", enrollment: null, expiresAt: null };
  }
  throw new MarketingBffError("Réponse de session invalide.", 502);
}

async function requestSession() {
  const payload = await marketingBffRequest<unknown>(MARKETING_BFF_ENDPOINTS.session, {
    method: "GET",
    requireCsrf: false,
    redirectOnUnauthorized: false,
  });
  return normalizeMarketingSessionPayload(payload);
}

async function hydrateEnrollment(snapshot: SessionSnapshot) {
  if (snapshot.status !== "enroll-mfa" || snapshot.enrollment) return snapshot;
  const enrollmentPayload = await marketingBffRequest<unknown>(MARKETING_BFF_ENDPOINTS.mfaEnroll, {
    method: "POST",
    body: {},
    redirectOnUnauthorized: false,
  });
  const root = asRecord(enrollmentPayload);
  const enrollment = parseEnrollment(root) || parseEnrollment({ enrollment: root });
  if (!enrollment) throw new MarketingBffError("Enrôlement MFA indisponible.", 502);
  return { ...snapshot, enrollment };
}

export default function MarketingSessionProvider({ children }: { children: ReactNode }) {
  const sessionGeneration = useRef(0);
  const [status, setStatus] = useState<MarketingSessionStatus>("loading");
  const [expiresAt, setExpiresAt] = useState<string | null>(null);
  const [enrollment, setEnrollment] = useState<MarketingMfaEnrollment | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const applySnapshot = useCallback((snapshot: SessionSnapshot) => {
    setStatus(snapshot.status);
    setEnrollment(snapshot.enrollment);
    setExpiresAt(snapshot.expiresAt);
    setError(null);
  }, []);

  const lockSession = useCallback(() => {
    sessionGeneration.current += 1;
    setEnrollment(null);
    setExpiresAt(null);
    setSubmitting(false);
    setError(null);
    setStatus("unauthenticated");
  }, []);

  const refreshSession = useCallback(async () => {
    const generation = sessionGeneration.current + 1;
    sessionGeneration.current = generation;
    setStatus("loading");
    setEnrollment(null);
    setExpiresAt(null);
    setError(null);
    try {
      const snapshot = await hydrateEnrollment(await requestSession());
      if (sessionGeneration.current !== generation) return;
      applySnapshot(snapshot);
    } catch (sessionError) {
      if (sessionGeneration.current !== generation) return;
      if (sessionError instanceof MarketingBffError && sessionError.status === 401) {
        applySnapshot({ status: "unauthenticated", enrollment: null, expiresAt: null });
        return;
      }
      setEnrollment(null);
      setExpiresAt(null);
      setStatus("error");
      setError(SESSION_ERROR);
    }
  }, [applySnapshot]);

  useEffect(() => {
    void refreshSession();
    return () => {
      sessionGeneration.current += 1;
    };
  }, [refreshSession]);

  useEffect(() => {
    window.addEventListener(MARKETING_SESSION_EXPIRED_EVENT, lockSession);
    return () => window.removeEventListener(MARKETING_SESSION_EXPIRED_EVENT, lockSession);
  }, [lockSession]);

  useEffect(() => {
    if (status !== "authenticated" || !expiresAt) return;
    const remaining = Date.parse(expiresAt) - Date.now();
    if (!Number.isFinite(remaining) || remaining <= 0) {
      lockSession();
      return;
    }
    const timeout = window.setTimeout(lockSession, remaining);
    return () => window.clearTimeout(timeout);
  }, [expiresAt, lockSession, status]);

  useEffect(() => {
    if (status !== "authenticated") return;
    const revalidate = () => { void refreshSession(); };
    const revalidateWhenVisible = () => {
      if (document.visibilityState === "visible") revalidate();
    };
    window.addEventListener("focus", revalidate);
    document.addEventListener("visibilitychange", revalidateWhenVisible);
    return () => {
      window.removeEventListener("focus", revalidate);
      document.removeEventListener("visibilitychange", revalidateWhenVisible);
    };
  }, [refreshSession, status]);

  const login = useCallback(async (email: string, password: string) => {
    const normalizedEmail = email.trim().toLowerCase();
    if (!/^\S+@\S+\.\S+$/.test(normalizedEmail) || normalizedEmail.length > 254 || !password || password.length > 1_024) {
      setError(LOGIN_ERROR);
      return false;
    }

    const generation = sessionGeneration.current + 1;
    sessionGeneration.current = generation;
    setSubmitting(true);
    setError(null);
    try {
      const payload = await marketingBffRequest<unknown>(MARKETING_BFF_ENDPOINTS.login, {
        method: "POST",
        body: { email: normalizedEmail, password },
        redirectOnUnauthorized: false,
      });
      const snapshot = await hydrateEnrollment(normalizeMarketingSessionPayload(payload));
      if (sessionGeneration.current !== generation) return false;
      applySnapshot(snapshot);
      return true;
    } catch (loginError) {
      if (sessionGeneration.current !== generation) return false;
      if (loginError instanceof MarketingBffError) {
        if (loginError.status === 429) {
          setError("Trop de tentatives. Réessayez dans quelques minutes.");
          return false;
        }
        if (loginError.status >= 500) {
          setError("Service de connexion indisponible. Réessayez plus tard.");
          return false;
        }
        if (loginError.status === 400 || loginError.status === 401) {
          setError(LOGIN_ERROR);
          return false;
        }
      }
      setError(LOGIN_ERROR);
      return false;
    } finally {
      if (sessionGeneration.current === generation) setSubmitting(false);
    }
  }, [applySnapshot]);

  const verifyTotp = useCallback(async (code: string) => {
    const normalizedCode = code.trim();
    if (!isMarketingTotpCode(normalizedCode)) {
      setError(MFA_ERROR);
      return false;
    }

    const generation = sessionGeneration.current + 1;
    sessionGeneration.current = generation;
    setSubmitting(true);
    setError(null);
    try {
      await marketingBffRequest<unknown>(MARKETING_BFF_ENDPOINTS.mfaVerify, {
        method: "POST",
        body: { code: normalizedCode },
        redirectOnUnauthorized: false,
      });
      const snapshot = await requestSession();
      if (sessionGeneration.current !== generation) return false;
      if (snapshot.status !== "authenticated") throw new MarketingBffError(MFA_ERROR, 401);
      applySnapshot(snapshot);
      return true;
    } catch {
      if (sessionGeneration.current !== generation) return false;
      setError(MFA_ERROR);
      return false;
    } finally {
      if (sessionGeneration.current === generation) setSubmitting(false);
    }
  }, [applySnapshot]);

  const logout = useCallback(async () => {
    const generation = sessionGeneration.current + 1;
    sessionGeneration.current = generation;
    setSubmitting(true);
    setEnrollment(null);
    setExpiresAt(null);
    setStatus("loading");
    setError(null);
    try {
      await marketingBffRequest<unknown>(MARKETING_BFF_ENDPOINTS.logout, {
        method: "POST",
        body: {},
        redirectOnUnauthorized: false,
      });
      if (sessionGeneration.current !== generation) return;
      setEnrollment(null);
      setExpiresAt(null);
      setSubmitting(false);
      setStatus("unauthenticated");
      window.location.replace("/marketing/login");
    } catch (logoutError) {
      if (sessionGeneration.current !== generation) return;
      if (logoutError instanceof MarketingBffError && logoutError.status === 401) {
        setEnrollment(null);
        setExpiresAt(null);
        setSubmitting(false);
        setStatus("unauthenticated");
        window.location.replace("/marketing/login");
        return;
      }
      setSubmitting(false);
      setExpiresAt(null);
      setStatus("error");
      setError("Déconnexion impossible. L’accès reste bloqué; réessayez.");
    }
  }, []);

  const value = useMemo(() => ({
    status,
    expiresAt,
    enrollment,
    submitting,
    error,
    refreshSession,
    login,
    verifyTotp,
    logout,
    clearError: () => setError(null),
  }), [enrollment, error, expiresAt, login, logout, refreshSession, status, submitting, verifyTotp]);

  return (
    <MarketingSessionContext.Provider value={value}>
      {children}
    </MarketingSessionContext.Provider>
  );
}
