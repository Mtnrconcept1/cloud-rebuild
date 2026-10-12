import { useEffect, useRef, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "react-router-dom";

import { getSupabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import {
  buildSanitizedAuthRedirectUrl,
  getSupabaseAuthRedirectState,
} from "@/lib/authRedirect";
import {
  getCommercialHostRedirectTarget,
  getCommercialIdentityGateState,
  isManagedCommercialAccount,
  type CommercialIdentityGateState,
} from "@/lib/commercialDomains";
import { getCanonicalAuthHref } from "@/lib/authDomains";

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

function CommercialIdentityRecovery({
  reason,
  retrying,
  onRetry,
  onSignOut,
}: {
  reason: Exclude<CommercialIdentityGateState, "ready">;
  retrying: boolean;
  onRetry: () => void;
  onSignOut: () => void;
}) {
  return (
    <main
      className="flex min-h-screen items-center justify-center bg-background p-6"
      data-testid="commercial-identity-recovery"
    >
      <section className="w-full max-w-md rounded-2xl border border-border bg-card p-6 text-center shadow-sm">
        <h1 className="text-xl font-semibold">Connexion interrompue</h1>
        <p className="mt-3 text-sm text-muted-foreground" role="alert">
          {reason === "role-mismatch"
            ? "Votre compte est identifié comme un compte de démonstration, mais ses droits commerciaux ne sont pas disponibles. Réessayez ou reconnectez-vous."
            : "La vérification de vos droits a échoué. Pour protéger votre compte, TOK ne change pas de domaine tant que cette vérification est indisponible."}
        </p>
        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-center">
          <button
            type="button"
            className="rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-50"
            disabled={retrying}
            onClick={onRetry}
          >
            {retrying ? "Vérification…" : "Réessayer"}
          </button>
          <button
            type="button"
            className="rounded-lg border border-border px-5 py-2.5 text-sm font-semibold text-foreground"
            onClick={onSignOut}
          >
            Se déconnecter
          </button>
        </div>
      </section>
    </main>
  );
}

/**
 * Blocks route rendering while the current hostname/path/role combination is
 * being moved to its canonical origin. Keeping this above AppShell prevents a
 * forbidden public page from firing data queries during the redirect effect.
 */
export default function CommercialHostBoundary({ children }: { children: ReactNode }) {
  const location = useLocation();
  const { user, loading, rolesResolved, role, roles, refreshRoles, signOut } = useAuth();
  const redirectStartedRef = useRef(false);
  const browserLocation = typeof window !== "undefined" ? window.location : null;
  const accountType = typeof user?.app_metadata?.account_type === "string"
    ? user.app_metadata.account_type
    : null;
  const restrictionQuery = useQuery({
    queryKey: ["commercial-demo-restriction", user?.id],
    enabled: Boolean(
      user?.id && rolesResolved && !isManagedCommercialAccount(roles, accountType)
    ),
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await (getSupabase().rpc as any)(
        "commercial_demo_current_user_is_restricted",
      );
      if (error) throw error;
      return data === true;
    },
  });
  const restrictionLoading = Boolean(user?.id && restrictionQuery.isLoading);
  // A 403/timeout must never be interpreted as a positive commercial marker.
  // Fail closed with an explicit retry instead of redirecting across origins.
  const serverCommercialDemoRestricted = restrictionQuery.data === true;
  const identityGateState = getCommercialIdentityGateState({
    isAuthenticated: Boolean(user),
    roles,
    accountType,
    serverCommercialDemoRestricted,
    restrictionCheckFailed: Boolean(user?.id && restrictionQuery.isError),
  });
  const authResolved = !loading && (!user || rolesResolved) && !restrictionLoading;
  const currentPath = browserLocation?.pathname.toLowerCase() || "";
  const isAuthRoute = currentPath === "/auth" || currentPath === "/auth/callback";
  const isIdentityBlocked = Boolean(
    authResolved && !isAuthRoute && identityGateState !== "ready",
  );
  let redirectTarget: string | null = null;

  if (browserLocation && !isIdentityBlocked) {
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
      authResolved,
      isAuthenticated: Boolean(user),
      activeRole: role,
      roles,
      accountType,
      serverCommercialDemoRestricted,
    });
  }

  const shouldRedirect = Boolean(
    browserLocation
    && redirectTarget
    && redirectTarget !== browserLocation.href,
  );
  const shouldWaitForRoleResolution = Boolean(
    browserLocation && !authResolved && !isAuthRoute,
  );

  useEffect(() => {
    if (!shouldRedirect || !redirectTarget || redirectStartedRef.current) return;
    redirectStartedRef.current = true;
    window.location.replace(redirectTarget);
  }, [redirectTarget, shouldRedirect]);

  if (shouldRedirect || shouldWaitForRoleResolution) return <LoadingCommercialRedirect />;

  if (isIdentityBlocked && identityGateState !== "ready") {
    return (
      <CommercialIdentityRecovery
        reason={identityGateState}
        retrying={restrictionQuery.isFetching}
        onRetry={() => {
          void Promise.allSettled([refreshRoles(), restrictionQuery.refetch()]);
        }}
        onSignOut={() => {
          void signOut().then(
            () => window.location.assign(getCanonicalAuthHref()),
            () => window.location.assign(getCanonicalAuthHref()),
          );
        }}
      />
    );
  }

  return <>{children}</>;
}
