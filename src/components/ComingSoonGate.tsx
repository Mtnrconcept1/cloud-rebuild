import { useLocation, Navigate } from "react-router-dom";
import { useAuth } from "@/lib/auth-context";
import { useFeatureFlagSnapshot } from "@/lib/featureFlags";

const COMING_SOON_ENV = import.meta.env.VITE_COMING_SOON === "true";

const EXEMPT_PREFIXES = [
  "/auth",
  "/dashboard",
  "/admin",
  "/espaces",
  "/courier",
  "/commercial",
  "/coming-soon",
];

function isExemptPath(pathname: string): boolean {
  return EXEMPT_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(prefix + "/"),
  );
}

/**
 * Blocks navigation to public/client routes when the "coming-soon" feature flag
 * is active (admin toggle) OR VITE_COMING_SOON=true (env fallback).
 * Restaurant dashboard, admin dashboard and auth routes remain accessible.
 */
export default function ComingSoonGate({
  children,
}: {
  children: React.ReactNode;
}) {
  const { pathname } = useLocation();
  const { loading: authLoading } = useAuth();
  const { isEnabled, loading: flagsLoading } = useFeatureFlagSnapshot({ enabled: true, live: true });

  const comingSoonActive = COMING_SOON_ENV || isEnabled("coming-soon");

  if (authLoading || flagsLoading) return null;
  if (!comingSoonActive) return <>{children}</>;
  if (isExemptPath(pathname)) return <>{children}</>;

  return <Navigate to="/coming-soon" replace />;
}
