import { useEffect, useRef, type ReactNode } from "react";
import { useLocation } from "react-router-dom";

import { getSanitizedMarketingHostRedirectTarget } from "@/lib/marketingDomains";

function LoadingMarketingRedirect() {
  return (
    <div
      className="flex min-h-screen flex-col items-center justify-center bg-[#07111f] p-8 text-center text-white"
      data-testid="marketing-host-redirect"
      role="status"
      aria-live="polite"
    >
      <div className="h-9 w-9 animate-spin rounded-full border-2 border-white/20 border-b-orange-400" />
      <p className="mt-4 font-semibold">Ouverture du centre marketing sécurisé…</p>
      <p className="mt-1 text-sm text-slate-400">Vérification du domaine canonique</p>
    </div>
  );
}

/**
 * Must mount above all public/admin shells. The redirect is computed during
 * render so forbidden children never mount or start data queries while the
 * canonical cross-origin transition is pending.
 */
export default function MarketingHostBoundary({ children }: { children: ReactNode }) {
  const location = useLocation();
  const redirectStartedRef = useRef(false);
  const browserLocation = typeof window !== "undefined" ? window.location : null;
  const redirectTarget = browserLocation
    ? getSanitizedMarketingHostRedirectTarget(browserLocation.href)
    : null;
  const resolvedTarget = browserLocation && redirectTarget
    ? new URL(redirectTarget, browserLocation.origin).href
    : null;
  const shouldRedirect = Boolean(
    browserLocation && resolvedTarget && resolvedTarget !== browserLocation.href,
  );

  useEffect(() => {
    redirectStartedRef.current = false;
  }, [location.hash, location.pathname, location.search]);

  useEffect(() => {
    if (!shouldRedirect || !resolvedTarget || redirectStartedRef.current) return;
    redirectStartedRef.current = true;
    window.location.replace(resolvedTarget);
  }, [resolvedTarget, shouldRedirect]);

  if (shouldRedirect) return <LoadingMarketingRedirect />;
  return <>{children}</>;
}

