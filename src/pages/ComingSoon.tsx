import { Link, Navigate, useLocation, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/lib/auth-context';
import { useLaunchGate } from '@/components/launch/LaunchGateProvider';
import { hasPendingClientSignup } from '@/lib/launchSignupWelcome';
import LaunchExperience from '@/components/launch/LaunchExperience';

export default function ComingSoon() {
  const { user, loading, role, roles, rolesResolved, signOut } = useAuth();
  const { state, error, refresh } = useLaunchGate();
  const [params] = useSearchParams();
  const location = useLocation();
  const welcome = params.get('welcome') === '1';
  const confirmationPending = params.get('email') === '1';
  const justSubmitted = (location.state as { clientSignupPending?: unknown } | null)?.clientSignupPending === true
    || hasPendingClientSignup();
  const anonymousSignupPending = !user && welcome && confirmationPending && justSubmitted;
  const restaurant = rolesResolved && role === 'restaurateur' && roles.includes('restaurateur');
  const admin = rolesResolved && role === 'admin' && roles.includes('admin');

  if (loading) return <main className="launch-page" role="status">Vérification de votre session TOK…</main>;
  // A guest without a recent registration must never see the animation through a URL.
  if (!user && !anonymousSignupPending) return <Navigate to="/" replace />;
  if (state?.enabled === false && !welcome) return <Navigate to={user ? '/espaces' : '/'} replace />;

  return <main className="launch-page">
    <LaunchExperience confirmationPending={confirmationPending} />
    {error && <div className="launch-actions" role="status">
      <p>Le statut du lancement est momentanément indisponible. Le compte à rebours reprendra dès que la connexion sera rétablie.</p>
      <button type="button" onClick={refresh}>Réessayer</button>
    </div>}
    <div className="launch-actions">
      {confirmationPending && <p role="status">Demande prise en compte. Si cette adresse nécessite une confirmation, consultez votre boîte de réception et vos courriers indésirables. Si vous possédez déjà un compte, connectez-vous.</p>}
      {restaurant ? <>
        <p>Bienvenue en cuisine ! Vous pouvez déjà préparer votre restaurant, votre menu et vos informations depuis votre dashboard.</p>
        <Link className="launch-primary" to="/dashboard">Préparer mon restaurant</Link>
      </> : confirmationPending ? <p>Vous pouvez vous connecter si votre adresse a déjà été confirmée, ou revenir après validation du lien reçu.</p>
        : user ? <p>{state?.enabled === false ? 'Bienvenue sur TOK, votre espace est prêt.' : 'Votre place est réservée. L’équipe TOK vous ouvrira l’application au lancement, même si le compteur est arrivé à zéro.'}</p>
        : <p>Inscrivez-vous pour rejoindre l’aventure TOK. Restaurateurs, vous pouvez déjà préparer votre établissement.</p>}
      {state?.enabled === false && <Link className="launch-primary" to={user ? '/espaces' : '/'}>Accéder à TOK</Link>}
      {admin && <Link className="launch-primary" to="/admin">Gérer le lancement</Link>}
      <nav aria-label="Liens d’attente">
        {!user && <Link to="/auth">S’inscrire ou se connecter</Link>}
        {confirmationPending && !user && <Link to="/auth">Renvoyer un email de confirmation</Link>}
        {user && <button type="button" onClick={() => { void signOut(); }}>Se déconnecter</button>}
        <Link to="/cgu">Conditions</Link>
        <Link to="/politique-confidentialite">Confidentialité</Link>
        <Link to="/cookies">Cookies</Link>
      </nav>
    </div>
  </main>;
}
