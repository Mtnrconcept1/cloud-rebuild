import { useEffect, useRef, type ReactNode } from "react";
import { useLocation } from "react-router-dom";

import { getSupabase } from "@/integrations/supabase/client";
import { useCommercialDemoAccount } from "@/hooks/useCommercialDemoAccount";
import { useAuth } from "@/lib/auth-context";
import {
  buildSanitizedAuthRedirectUrl,
  getSupabaseAuthRedirectState,
} from "@/lib/authRedirect";
import {
  getCommercialHostRedirectTarget,
  getCommercialReauthenticationHref,
  isManagedCommercialAccount,
} from "@/lib/commercialDomains";

function LoadingCommercialRedirect() {
  return (
    <div
      className="flex min-h-screen flex-col items-center justify-center bg-background p-8 text-center"
      data-testid="commercial-host-redirect"
      role="status"
      aria-live="polite"
    >
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-muted border-b-primary" />
      <p className="mt-4 font-semibold">Préparation de votre espace sécurisé…</p>
    </div>
  );
}

/**
 * Blocks route rendering while the current hostname/path/role combination is
 * being moved to its canonical origin. Keeping this above AppShell prevents a
 * forbidden public page from firing data queries during the redirect effect.
 */
export default function CommercialHostBoundary({ children }: { children: ReactNode }) {
  const location = useLocation();
  const { user, loading, role, roles } = useAuth();
  const redirectStartedRef = useRef(false);
  const browserLocation = typeof window !== "undefined" ? window.location : null;
  const accountType = typeof user?.app_metadata?.account_type === "string"
    ? user.app_metadata.account_type
    : null;
  const shouldResolveAdminCommercialMapping = Boolean(
    user
    && roles.includes("admin")
    && roles.includes("commercial")
    && accountType?.trim().toLowerCase() !== "commercial_demo",
  );
  const demoAccount = useCommercialDemoAccount({
    enabled: shouldResolveAdminCommercialMapping,
  });
  // The ambiguous admin+commercial combination stays fail-closed if its
  // durable mapping cannot be checked. Ordinary admins skip this query.
  const hasCommercialDemoMapping = Boolean(
    demoAccount.account
    || (shouldResolveAdminCommercialMapping && demoAccount.error),
  );
  let redirectTarget: string | null = null;

  if (browserLocation) {
    const redirectState = getSupabaseAuthRedirectState(browserLocation.href);
    const safeLocation = redirectState.hasAuthRedirect
      ? new URL(buildSanitizedAuthRedirectUrl(browserLocation.href), browserLocation.origin)
      : {
          pathname: browserLocation.pathname,
          search: location.search,
          hash: location.hash,
        };
    redirectTarget = getCommercialHostRedirectTarget({
      hostname: browserLocation.hostname,
      pathname: safeLocation.pathname,
      search: safeLocation.search,
      hash: safeLocation.hash,
      authResolved: !loading && !demoAccount.loading,
      isAuthenticated: Boolean(user),
      activeRole: role,
      roles,
      accountType,
      hasCommercialDemoMapping,
    });
  }

  const shouldRedirect = Boolean(
    browserLocation
    && redirectTarget
    && redirectTarget !== browserLocation.href,
  );
  const redirectIsCrossOrigin = Boolean(
    browserLocation
    && redirectTarget
    && new URL(redirectTarget, browserLocation.origin).origin !== browserLocation.origin,
  );
  const shouldRequireCommercialReauthentication = Boolean(
    shouldRedirect
    && browserLocation
    && user
    && redirectIsCrossOrigin
    && isManagedCommercialAccount(
      roles,
      accountType,
      hasCommercialDemoMapping,
    ),
  );
  const currentPath = browserLocation?.pathname.toLowerCase() || "";
  const isAuthRoute = currentPath === "/auth" || currentPath === "/auth/callback";
  const shouldWaitForRoleResolution = Boolean(
    browserLocation
    && (loading || demoAccount.loading)
    && !isAuthRoute,
  );

  useEffect(() => {
    if (!shouldRedirect || !redirectTarget || redirectStartedRef.current) return;
    redirectStartedRef.current = true;

    if (!shouldRequireCommercialReauthentication) {
      window.location.replace(redirectTarget);
      return;
    }

    const authenticationTarget = getCommercialReauthenticationHref(redirectTarget);
    let redirected = false;
    const redirectToCommercialLogin = () => {
      if (redirected) return;
      redirected = true;
      window.location.replace(authenticationTarget);
    };
    const fallbackRedirect = window.setTimeout(redirectToCommercialLogin, 1_500);

    void getSupabase().auth.signOut({ scope: "local" })
      .catch(() => undefined)
      .finally(() => {
        window.clearTimeout(fallbackRedirect);
        redirectToCommercialLogin();
      });
  }, [redirectTarget, shouldRedirect, shouldRequireCommercialReauthentication]);

  if (shouldRedirect || shouldWaitForRoleResolution) return <LoadingCommercialRedirect />;
  return <>{children}</>;
}
