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
const publicExceptions = ['/auth', '/coming-soon', '/cgu', '/politique-confidentialite', '/cookies', '/conditions-restaurateurs'];
/** Route access only. Database and Edge checks are the security boundary. */
export function launchRouteAllowed(path: string, roles: UserRole[], resolved: boolean) {
  if (publicExceptions.some(prefix => at(path, prefix))) return true;
  if (!resolved) return false;
  if (roles.includes('admin')) return true;
  if (at(path, '/dashboard') && roles.includes('restaurateur')) return true;
  if (at(path, '/courier') && roles.includes('courier')) return true;
  if (at(path, '/commercial') && roles.includes('commercial')) return true;
  if (path === '/espaces' && roles.some(role => role !== 'client')) return true;
  return path === '/parametres/securite';
}
