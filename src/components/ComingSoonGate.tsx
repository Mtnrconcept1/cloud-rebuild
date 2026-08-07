import { useLocation, Navigate } from "react-router-dom";
import { useAuth } from "@/lib/auth-context";

const COMING_SOON_ENABLED = import.meta.env.VITE_COMING_SOON === "true";

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
 * Blocks navigation to public/client routes when VITE_COMING_SOON=true.
 * Restaurant dashboard, admin dashboard and auth routes remain accessible.
 */
export default function ComingSoonGate({
  children,
}: {
  children: React.ReactNode;
}) {
  const { pathname } = useLocation();
  const { loading } = useAuth();

  if (!COMING_SOON_ENABLED) return <>{children}</>;
  if (loading) return null;
  if (isExemptPath(pathname)) return <>{children}</>;

  return <Navigate to="/coming-soon" replace />;
}
