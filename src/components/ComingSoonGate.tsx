import { useLocation, Navigate } from 'react-router-dom';
import { useAuth } from '@/lib/auth-context';
import { launchRouteAllowed } from '@/lib/launchGate';
import { useLaunchGate } from '@/components/launch/LaunchGateProvider';

export default function ComingSoonGate({ children }: { children: React.ReactNode }) {
  const { pathname } = useLocation();
  const { user, loading, role, roles, rolesResolved } = useAuth();
  const { state, error } = useLaunchGate();

  // Do not flash public pages while restoring a session. However, OAuth
  // callbacks must mount so they can finish creating an authenticated session.
  const authRoute = pathname === "/auth" || pathname.startsWith("/auth/");
  if (!authRoute && (loading || (user && !rolesResolved))) {
    return <div className="flex min-h-[45vh] items-center justify-center px-4 text-center text-sm text-muted-foreground" role="status">
      Vérification de votre session TOK…
    </div>;
  }

  const allowed = launchRouteAllowed(pathname, {
    authenticated: Boolean(user), role, roles, rolesResolved,
  });

  // Guest discovery must not depend on a launch RPC being available.
  if (allowed || state?.enabled === false) return <>{children}</>;
  if (state === null && !error) {
    return <div className="flex min-h-[45vh] items-center justify-center px-4 text-center text-sm text-muted-foreground" role="status">
      Vérification de l’ouverture de TOK…
    </div>;
  }
  return <Navigate to="/coming-soon" replace />;
}
