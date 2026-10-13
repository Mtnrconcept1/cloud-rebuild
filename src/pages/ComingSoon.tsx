import { Link, Navigate, useNavigate } from "react-router-dom";
import { useAuth } from "@/lib/auth-context";
import { useLaunchGate } from "@/components/launch/LaunchGateProvider";
import LaunchExperience from "@/components/launch/LaunchExperience";

export default function ComingSoon() {
  const { user, loading, role, roles, rolesResolved, signOut } = useAuth();
  const { state, error, refresh } = useLaunchGate();
  const navigate = useNavigate();

  if (loading || (user && !rolesResolved)) {
    return <main className="launch-page" role="status">Vérification de votre session TOK…</main>;
  }

  // The launch animation is strictly for signed-in clients. Forged ?welcome=1
  // and email-confirmation URLs cannot trigger it for anonymous visitors.
  if (!user) return <Navigate to="/" replace />;
  if (role && role !== "client" && roles.includes(role)) return <Navigate to="/espaces" replace />;

  // The administrator's launch flag is authoritative, not the welcome query.
  if (state?.enabled === false) return <Navigate to="/espaces" replace />;
  if (state === null && !error) {
    return <main className="launch-page" role="status">Vérification de l’ouverture de TOK…</main>;
  }

  return <main className="launch-page">
    <LaunchExperience />
    {error && <div className="launch-actions" role="status">
      <p>Le statut du lancement est momentanément indisponible. Le compte à rebours reprendra dès que la connexion sera rétablie.</p>
      <button type="button" onClick={refresh}>Réessayer</button>
    </div>}
    <div className="launch-actions">
      <p>Votre place est réservée. L’équipe TOK vous ouvrira l’application au lancement, même si le compteur est arrivé à zéro.</p>
      <nav aria-label="Liens d’attente">
        <button type="button" onClick={() => {
          void signOut().finally(() => navigate("/", { replace: true }));
        }}>Se déconnecter</button>
        <Link to="/cgu">Conditions</Link>
        <Link to="/politique-confidentialite">Confidentialité</Link>
        <Link to="/cookies">Cookies</Link>
      </nav>
    </div>
  </main>;
}
