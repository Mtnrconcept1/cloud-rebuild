import { describe, expect, it } from 'vitest';
import { launchRouteAllowed } from '@/lib/launchGate';

describe('TOK Connect OAuth during launch', () => {
  const customer = { authenticated: true, role: 'client' as const, roles: ['client' as const], rolesResolved: true };
  it('allows the consent UI while keeping customer commerce closed', () => {
    expect(launchRouteAllowed('/oauth/consent', customer)).toBe(true);
    expect(launchRouteAllowed('/panier', customer)).toBe(false);
    expect(launchRouteAllowed('/commandes', customer)).toBe(false);
    expect(launchRouteAllowed('/oauth/unknown', customer)).toBe(false);
  });
  it('permits consent before roles are resolved without opening other routes', () => {
    expect(launchRouteAllowed('/oauth/consent', { ...customer, rolesResolved: false })).toBe(true);
    expect(launchRouteAllowed('/restaurant/test', { ...customer, rolesResolved: false })).toBe(false);
  });
});
