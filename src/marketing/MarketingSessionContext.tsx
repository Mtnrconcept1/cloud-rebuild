import { createContext, useContext } from "react";

export type MarketingSessionStatus =
  | "loading"
  | "unauthenticated"
  | "challenge-mfa"
  | "enroll-mfa"
  | "authenticated"
  | "error";

export type MarketingMfaEnrollment = {
  secret: string | null;
  otpauthUri: string | null;
  qrCodeDataUrl: string | null;
};

export type MarketingSessionValue = {
  status: MarketingSessionStatus;
  expiresAt: string | null;
  enrollment: MarketingMfaEnrollment | null;
  submitting: boolean;
  error: string | null;
  refreshSession: () => Promise<void>;
  login: (email: string, password: string) => Promise<boolean>;
  verifyTotp: (code: string) => Promise<boolean>;
  logout: () => Promise<void>;
  clearError: () => void;
};

export const MarketingSessionContext = createContext<MarketingSessionValue | null>(null);

export function useMarketingSession() {
  const context = useContext(MarketingSessionContext);
  if (!context) {
    throw new Error("useMarketingSession must be used within MarketingSessionProvider");
  }
  return context;
}
