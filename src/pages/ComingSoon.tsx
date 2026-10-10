import { Link, Navigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/lib/auth-context';
import { useLaunchGate } from '@/components/launch/LaunchGateProvider';
import LaunchExperience from '@/components/launch/LaunchExperience';
export default function ComingSoon() {
  const { user, roles, rolesResolved, signOut } = useAuth();
  const { state, error, refresh } = useLaunchGate();
  const [params] = useSearchParams();
  const welcome = params.get('welcome') === '1';
  const restaurant = rolesResolved && roles.includes('restaurateur');
  const admin = rolesResolved && roles.includes('admin');
  if (state?.enabled === false && !welcome) return <Navigate to={user ? '/espaces' : '/auth'} replace />;
  return <main className="launch-page">
    {state ? <LaunchExperience /> : <div className="launch-actions" role="status">
      <h1 className="text-2xl font-bold pt-16">TOK prépare la suite</h1>
      <p>{error ? 'La connexion est momentanément indisponible. Votre accès sera vérifié dès son rétablissement.' : 'Vérification de l’ouverture de TOK…'}</p>
      {error && <button type="button" onClick={refresh}>Réessayer</button>}
    </div>}
    <div className="launch-actions">
      {params.get('email') === '1' && <p role="status">Votre inscription est enregistrée. Confirmez votre adresse depuis l’email reçu pour finaliser votre compte.</p>}
      {restaurant ? <>
        <p>Bienvenue en cuisine ! Vous pouvez déjà préparer votre restaurant, votre menu et vos informations depuis votre dashboard.</p>
        <Link className="launch-primary" to="/dashboard">Préparer mon restaurant</Link>
      </> : user ? <p>{state?.enabled === false ? 'Bienvenue sur TOK, votre espace est prêt.' : 'Votre place est réservée. L’équipe TOK vous ouvrira l’application au lancement, même si le compteur est arrivé à zéro.'}</p>
        : <p>Inscrivez-vous pour rejoindre l’aventure TOK. Restaurateurs, vous pouvez déjà préparer votre établissement.</p>}
      {state?.enabled === false && <Link className="launch-primary" to={user ? '/espaces' : '/auth'}>Accéder à TOK</Link>}
      {admin && <Link className="launch-primary" to="/admin">Gérer le lancement</Link>}
      <nav aria-label="Liens d’attente">
        {!user && <Link to="/auth">S’inscrire ou se connecter</Link>}
        {user && <button type="button" onClick={() => { void signOut(); }}>Se déconnecter</button>}
        <Link to="/cgu">Conditions</Link><Link to="/politique-confidentialite">Confidentialité</Link>
      </nav>
    </div>
  </main>;
}
