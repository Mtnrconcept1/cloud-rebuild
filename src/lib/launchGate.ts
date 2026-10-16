import type { UserRole } from './auth-context';

export type LaunchState = { enabled: boolean; endsAt: number | null; serverOffset: number };
export function parseLaunchState(value: unknown, now = Date.now()): LaunchState {
  if (!value || typeof value !== 'object') throw new Error('Invalid launch state');
  const state = value as Record<string, unknown>;
  const serverNow = typeof state.server_now === 'string' ? Date.parse(state.server_now) : NaN;
  const endsAt = typeof state.ends_at === 'string' ? Date.parse(state.ends_at) : null;
  if (typeof state.enabled !== 'boolean' || !Number.isFinite(serverNow)
    || (endsAt !== null && !Number.isFinite(endsAt)) || (state.enabled && endsAt === null)) throw new Error('Invalid launch state');
  return { enabled: state.enabled, endsAt, serverOffset: serverNow - now };
}
export function launchRemaining(state: LaunchState | null, now: number) {
  return state?.endsAt == null ? 20 * 86400 : Math.max(0, Math.ceil((state.endsAt - now - state.serverOffset) / 1000));
}
const at = (path: string, prefix: string) => path === prefix || path.startsWith(`${prefix}/`);
type LaunchRouteActor = {
  authenticated: boolean;
  role: UserRole | null;
  roles: UserRole[];
  rolesResolved: boolean;
};
const launchLegalRoutes = ['/cgu', '/politique-confidentialite', '/cookies'];
const launchAuthRoutes = ['/auth', '/coming-soon'];
/** UI routing only: Supabase policies and Edge checks remain authoritative. */
export function launchRouteAllowed(path: string, actor: LaunchRouteActor): boolean {
  // Before signup, the visitor may freely discover the public application.
  if (!actor.authenticated) return true;
  // Consent authenticates the external client; business access stays server-gated.
  if (path === '/oauth/consent') return true;
  if ([...launchLegalRoutes, ...launchAuthRoutes].some(prefix => at(path, prefix))) return true;
  if (!actor.rolesResolved) return false;
  // Separate staff workspaces and the role chooser remain accessible.
  if (path === '/espaces' && actor.roles.some(role => role !== 'client')) return true;
  if (at(path, '/admin') && actor.roles.includes('admin')) return true;
  if (at(path, '/dashboard') && actor.roles.includes('restaurateur')) return true;
  if (at(path, '/courier') && actor.roles.includes('courier')) return true;
  if (at(path, '/commercial') && actor.roles.includes('commercial')) return true;
  // Even a multi-role user choosing the customer surface sees the launch.
  if (actor.role === 'client' || actor.roles.length === 0 || actor.roles.every(role => role === 'client')) return false;
  return actor.roles.includes('admin');
}
