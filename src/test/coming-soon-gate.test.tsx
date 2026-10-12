import { render, screen, cleanup } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ComingSoonGate from '@/components/ComingSoonGate';

const mocks = vi.hoisted(() => ({
  user: { id: 'customer-123' } as { id: string } | null,
  loading: false,
  role: 'client' as string | null,
  roles: ['client'] as string[],
  resolved: true,
  state: { enabled: true } as { enabled: boolean } | null,
  error: false,
}));
vi.mock('@/lib/auth-context', () => ({
  useAuth: () => ({
    user: mocks.user, loading: mocks.loading, role: mocks.role,
    roles: mocks.roles, rolesResolved: mocks.resolved,
  }),
}));
vi.mock('@/components/launch/LaunchGateProvider', () => ({
  useLaunchGate: () => ({ state: mocks.state, error: mocks.error }),
}));
function view(path: string) {
  return render(<MemoryRouter initialEntries={[path]}><Routes>
    <Route path="/coming-soon" element={<p>Attente TOK</p>} />
    <Route path="*" element={<ComingSoonGate><p>Application accessible</p></ComingSoonGate>} />
  </Routes></MemoryRouter>);
}
describe('launch route gate', () => {
  beforeEach(() => {
    cleanup();
    mocks.user = { id: 'customer-123' };
    mocks.loading = false;
    mocks.role = 'client';
    mocks.roles = ['client'];
    mocks.resolved = true;
    mocks.state = { enabled: true };
    mocks.error = false;
  });

  it.each(['/', '/mon-espace', '/espaces', '/dashboard', '/admin', '/recherche', '/commande/id', '/parametres/securite', '/conditions-restaurateurs'])(
    'sends the authenticated customer to the launch animation at %s',
    path => { view(path); expect(screen.getByText('Attente TOK')).toBeInTheDocument(); },
  );
  it.each(['/auth', '/auth/callback', '/cgu', '/politique-confidentialite', '/cookies'])(
    'preserves authentication and legal access at %s',
    path => { view(path); expect(screen.getByText('Application accessible')).toBeInTheDocument(); },
  );
  it.each(['/', '/recherche', '/restaurant/123', '/restaurants/geneve', '/conditions-restaurateurs', '/cookies'])(
    'lets an anonymous visitor explore public route %s during launch',
    path => {
      mocks.user = null;
      mocks.role = null;
      mocks.roles = [];
      mocks.state = null;
      mocks.error = true;
      view(path);
      expect(screen.getByText('Application accessible')).toBeInTheDocument();
      expect(screen.queryByText('Attente TOK')).not.toBeInTheDocument();
    },
  );
  it('does not render protected content while restoring an existing session', () => {
    mocks.loading = true;
    view('/');
    expect(screen.getByRole('status')).toHaveTextContent('Vérification de votre session TOK');
    expect(screen.queryByText('Application accessible')).not.toBeInTheDocument();
  });
  it('waits for server launch status for an authenticated customer', () => {
    mocks.state = null;
    view('/');
    expect(screen.getByRole('status')).toHaveTextContent('Vérification de l’ouverture de TOK');
  });
  it('fails closed for a customer if the launch status is unavailable', () => {
    mocks.state = null;
    mocks.error = true;
    view('/mon-espace');
    expect(screen.getByText('Attente TOK')).toBeInTheDocument();
  });
  it('never grants restaurant access before roles are verified', () => {
    mocks.roles = ['restaurateur'];
    mocks.role = 'restaurateur';
    mocks.resolved = false;
    view('/dashboard');
    expect(screen.getByRole('status')).toBeInTheDocument();
    expect(screen.queryByText('Application accessible')).not.toBeInTheDocument();
  });
  it('lets restaurant staff use their workspace without the customer animation', () => {
    mocks.roles = ['restaurateur'];
    mocks.role = 'restaurateur';
    view('/dashboard/menu');
    expect(screen.getByText('Application accessible')).toBeInTheDocument();
  });
  it('keeps a restaurant user out of customer pages during launch', () => {
    mocks.roles = ['restaurateur'];
    mocks.role = 'restaurateur';
    view('/mon-espace');
    expect(screen.getByText('Attente TOK')).toBeInTheDocument();
  });
  it('keeps admin tools available even when the admin selects a customer role', () => {
    mocks.roles = ['admin', 'client'];
    mocks.role = 'client';
    view('/admin');
    expect(screen.getByText('Application accessible')).toBeInTheDocument();
  });
  it('gates customer pages when a multi-role account selects the customer role', () => {
    mocks.roles = ['admin', 'client'];
    mocks.role = 'client';
    view('/recherche');
    expect(screen.getByText('Attente TOK')).toBeInTheDocument();
  });
  it('opens customer access only when the administrator disables the launch lock', () => {
    mocks.state = { enabled: false };
    view('/mon-espace');
    expect(screen.getByText('Application accessible')).toBeInTheDocument();
  });
});
