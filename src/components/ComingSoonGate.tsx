import { useLocation, Navigate } from 'react-router-dom';
import { useAuth } from '@/lib/auth-context';
import { launchRouteAllowed } from '@/lib/launchGate';
import { useLaunchGate } from '@/components/launch/LaunchGateProvider';
export default function ComingSoonGate({ children }: { children: React.ReactNode }) {
  const { pathname } = useLocation();
  const { roles, rolesResolved } = useAuth();
  const { state, error } = useLaunchGate();
  if (launchRouteAllowed(pathname, roles, rolesResolved) || state?.enabled === false) return <>{children}</>;
  // Wait for the first server answer before navigating. Redirecting with a pending
  // state loses the original public route when the server reports TOK is open.
  // No protected children are rendered during the wait.
  if (state === null && !error) {
    return (
      <div className="flex min-h-[45vh] items-center justify-center px-4 text-center text-sm text-muted-foreground" role="status">
        Vérification de l’ouverture de TOK…
      </div>
    );
  }
  // Server confirms a closed launch, or the request failed: remain fail-closed.
  return <Navigate to="/coming-soon" replace />;
}
