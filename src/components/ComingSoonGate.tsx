import { useLocation, Navigate } from 'react-router-dom';
import { useAuth } from '@/lib/auth-context';
import { launchRouteAllowed } from '@/lib/launchGate';
import { useLaunchGate } from '@/components/launch/LaunchGateProvider';
export default function ComingSoonGate({ children }: { children: React.ReactNode }) {
  const { pathname } = useLocation();
  const { roles, rolesResolved } = useAuth();
  const { state } = useLaunchGate();
  if (launchRouteAllowed(pathname, roles, rolesResolved) || state?.enabled === false) return <>{children}</>;
  // Unknown state and network failures stay closed; elapsed time never authorizes access.
  return <Navigate to="/coming-soon" replace />;
}
