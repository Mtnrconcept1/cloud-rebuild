import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  user: null as { id: string } | null,
  loading: false,
  role: 'client' as string | null,
  roles: ['client'] as string[],
  rolesResolved: true,
  pending: false,
  state: { enabled: false, endsAt: null, serverOffset: 0 } as
    | { enabled: boolean; endsAt: number | null; serverOffset: number }
    | null,
  error: false,
  refresh: vi.fn(),
  signOut: vi.fn(),
}));
vi.mock('@/lib/auth-context', () => ({
  useAuth: () => ({
    user: mocks.user, loading: mocks.loading, role: mocks.role,
    roles: mocks.roles, rolesResolved: mocks.rolesResolved, signOut: mocks.signOut,
  }),
}));
vi.mock('@/lib/launchSignupWelcome', () => ({
  hasPendingClientSignup: () => mocks.pending,
}));
vi.mock('@/components/launch/LaunchGateProvider', () => ({
  useLaunchGate: () => ({ state: mocks.state, error: mocks.error, refresh: mocks.refresh }),
}));
vi.mock('@/components/launch/LaunchExperience', () => ({
  default: ({ confirmationPending }: { confirmationPending?: boolean }) => (
    <div data-testid="launch-experience">
      {confirmationPending ? 'Pending confirmation animation' : 'Launch animation'}
    </div>
  ),
}));
import ComingSoon from '@/pages/ComingSoon';
function view(path: string) {
  render(<MemoryRouter initialEntries={[path]}><Routes>
    <Route path="/" element={<p>Public homepage</p>} />
    <Route path="/coming-soon" element={<ComingSoon />} />
    <Route path="/espaces" element={<p>Workspace chooser</p>} />
  </Routes></MemoryRouter>);
}
describe('TOK coming-soon signup experience', () => {
  beforeEach(() => {
    mocks.user = null;
    mocks.loading = false;
    mocks.role = 'client';
    mocks.roles = ['client'];
    mocks.rolesResolved = true;
    mocks.pending = false;
    mocks.state = { enabled: false, endsAt: null, serverOffset: 0 };
    mocks.error = false;
    vi.clearAllMocks();
  });
  afterEach(cleanup);

  it('shows a pending-signup animation only after a submitted registration', () => {
    mocks.pending = true;
    view('/coming-soon?welcome=1&email=1');
    expect(screen.getByText('Pending confirmation animation')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Si cette adresse nécessite une confirmation');
  });
  it('does not show a visitor the animation with only a crafted welcome URL', () => {
    view('/coming-soon?welcome=1&email=1');
    expect(screen.getByText('Public homepage')).toBeInTheDocument();
    expect(screen.queryByTestId('launch-experience')).not.toBeInTheDocument();
  });
  it('does not show a guest the animation if there was no signup', () => {
    mocks.state = { enabled: true, endsAt: Date.now() + 10000, serverOffset: 0 };
    view('/coming-soon');
    expect(screen.getByText('Public homepage')).toBeInTheDocument();
  });
  it('shows the animation and legal links for a returning logged-in customer', () => {
    mocks.user = { id: 'client-user' };
    mocks.state = { enabled: true, endsAt: Date.now() + 10000, serverOffset: 0 };
    view('/coming-soon');
    expect(screen.getByText('Launch animation')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Cookies' })).toHaveAttribute('href', '/cookies');
    expect(screen.getByRole('button', { name: 'Se déconnecter' })).toBeInTheDocument();
  });
  it('keeps the signup confirmation scene visible on a launch RPC failure', () => {
    mocks.pending = true;
    mocks.state = null;
    mocks.error = true;
    view('/coming-soon?welcome=1&email=1');
    expect(screen.getByText('Pending confirmation animation')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Réessayer' })).toBeInTheDocument();
  });
  it('redirects a signed-in customer to the workspace once TOK opens', () => {
    mocks.user = { id: 'client-user' };
    view('/coming-soon');
    expect(screen.getByText('Workspace chooser')).toBeInTheDocument();
    expect(screen.queryByTestId('launch-experience')).not.toBeInTheDocument();
  });
});
