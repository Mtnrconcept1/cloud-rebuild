import { beforeEach, describe, expect, it } from 'vitest';
import { hasPendingClientSignup, markPendingClientSignup } from '@/lib/launchSignupWelcome';

describe('anonymous post-signup welcome marker', () => {
  beforeEach(() => window.sessionStorage.clear());

  it('does not exist for anonymous visitors', () => {
    expect(hasPendingClientSignup(10_000)).toBe(false);
  });

  it('allows the immediate post-registration animation for one hour', () => {
    markPendingClientSignup(10_000);
    expect(hasPendingClientSignup(10_001)).toBe(true);
    expect(hasPendingClientSignup(10_000 + 60 * 60 * 1000)).toBe(false);
    expect(hasPendingClientSignup(9_999)).toBe(false);
  });

  it('rejects corrupted or missing markers', () => {
    window.sessionStorage.setItem('tok:pending-client-signup', 'not-a-time');
    expect(hasPendingClientSignup(10_000)).toBe(false);
  });
});
