import { render, screen, cleanup } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ComingSoonGate from '@/components/ComingSoonGate';
const mocks = vi.hoisted(() => ({ roles: ['client'], resolved: true, state: { enabled: true } as {enabled:boolean}|null, error: false }));
vi.mock('@/lib/auth-context', () => ({ useAuth: () => ({roles: mocks.roles, rolesResolved: mocks.resolved}) }));
vi.mock('@/components/launch/LaunchGateProvider', () => ({ useLaunchGate: () => ({state:mocks.state, error:mocks.error}) }));
function view(path: string) {
 return render(<MemoryRouter initialEntries={[path]}><Routes>
 <Route path="/coming-soon" element={<p>Attente TOK</p>} />
 <Route path="*" element={<ComingSoonGate><p>Application privée</p></ComingSoonGate>} />
 </Routes></MemoryRouter>);
}
describe('launch route gate', () => {
 beforeEach(() => {cleanup();mocks.roles=['client'];mocks.resolved=true;mocks.state={enabled:true};mocks.error=false;});
 it.each(['/','/mon-espace','/espaces','/dashboard','/admin','/recherche','/commande/id','/dashboard-spoof'])('blocks client at %s',path=>{view(path);expect(screen.getByText('Attente TOK')).toBeInTheDocument();});
 it.each(['/auth','/auth/callback','/auth?mode=recovery','/cgu','/politique-confidentialite'])('preserves signup and legal route %s',path=>{view(path);expect(screen.getByText('Application privée')).toBeInTheDocument();});
 it('waits for an unconfirmed launch state without rendering protected pages or redirecting guests',()=>{
   mocks.state=null;
   view('/');
   expect(screen.getByRole('status')).toHaveTextContent('Vérification de l’ouverture de TOK');
   expect(screen.queryByText('Attente TOK')).not.toBeInTheDocument();
   expect(screen.queryByText('Application privée')).not.toBeInTheDocument();
 });
 it('server errors remain fail-closed',()=>{mocks.state=null;mocks.error=true;view('/mon-espace');expect(screen.getByText('Attente TOK')).toBeInTheDocument();});
 it('guest homepage becomes accessible after the server confirms TOK is open',()=>{
   mocks.state=null;
   const screenTree=(<MemoryRouter initialEntries={['/']}><Routes>
     <Route path="/coming-soon" element={<p>Attente TOK</p>} />
     <Route path="*" element={<ComingSoonGate><p>Application privée</p></ComingSoonGate>} />
   </Routes></MemoryRouter>);
   const { rerender } = render(screenTree);
   expect(screen.getByRole('status')).toBeInTheDocument();
   mocks.state={enabled:false};
   rerender(<MemoryRouter initialEntries={['/']}><Routes>
     <Route path="/coming-soon" element={<p>Attente TOK</p>} />
     <Route path="*" element={<ComingSoonGate><p>Application privée</p></ComingSoonGate>} />
   </Routes></MemoryRouter>);
   expect(screen.getByText('Application privée')).toBeInTheDocument();
   expect(screen.queryByText('Attente TOK')).not.toBeInTheDocument();
 });
 it('only verified restaurant roles enter preparation',()=>{mocks.roles=['restaurateur'];view('/dashboard/menu');expect(screen.getByText('Application privée')).toBeInTheDocument();});
 it('restaurant role does not open client routes',()=>{mocks.roles=['restaurateur'];view('/mon-espace');expect(screen.getByText('Attente TOK')).toBeInTheDocument();});
 it('unresolved roles cannot grant dashboard access',()=>{mocks.roles=['restaurateur'];mocks.resolved=false;view('/dashboard');expect(screen.getByText('Attente TOK')).toBeInTheDocument();});
 it('admin can disable the lock',()=>{mocks.roles=['admin'];view('/admin');expect(screen.getByText('Application privée')).toBeInTheDocument();});
 it('admin flag off opens access even with legacy env true',()=>{vi.stubEnv('VITE_COMING_SOON','true');mocks.state={enabled:false};view('/mon-espace');expect(screen.getByText('Application privée')).toBeInTheDocument();vi.unstubAllEnvs();});
});
