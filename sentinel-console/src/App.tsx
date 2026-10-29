import { useCallback, useEffect, useState } from "react";
import { createClient, type Session } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL || "";
const publicKey = import.meta.env.VITE_SUPABASE_ANON_KEY || "";
const validConfig = /^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(url) &&
  publicKey.length >= 20 && !publicKey.includes("REPLACE");
const api = validConfig
  ? createClient(url, publicKey, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    })
  : null;

type Report = {
  summary?: string; category?: string; evidence_count?: number;
  functions?: string[]; correlation_hash?: string;
  analysis?: {
    assessment?: string;
    repair_steps?: string[]; validation_steps?: string[]; rollback_steps?: string[];
  };
};
type Incident = {
  id: string; category: string; severity: string; scope: string; status: string;
  report: Report; evidence_ids: string[]; last_seen_at: string;
  first_seen_at: string; approval_expires_at: string | null;
  occurrence_count: number;
};
type Containment = {
  id: string; incident_id: string; scope: string; activated_at: string;
  reason: string; released_at: string | null;
};
type Overview = {
  incidents: Incident[]; activeContainments: Containment[];
  autoGlobal: boolean; telegramConfigured: boolean; enforcementArmed: boolean;
};

async function sentinelAction<T>(session: Session, action: string, payload: Record<string, unknown> = {}): Promise<T> {
  if (!api) throw Error("Console non configuree.");
  const res = await fetch(`${url}/functions/v1/ops-sentinel-control`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${session.access_token}`,
      apikey: publicKey,
    },
    body: JSON.stringify({ action, ...payload }),
    cache: "no-store",
  });
  const json = await res.json().catch(() => ({})) as { error?: string };
  if (!res.ok) {
    const publicCode = typeof json.error === "string" ? json.error.slice(0, 120) : "Erreur de connexion";
    throw Error(publicCode);
  }
  return json as T;
}
function displayDate(value: string) {
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toLocaleString("fr-CH") : "—";
}
function Evidence({ incident }: { incident: Incident }) {
  const plan = incident.report?.analysis;
  return (
    <details>
      <summary>Preuves techniques et plan d'intervention</summary>
      <div className="report">
        <p>{plan?.assessment || "Une anomalie technique ne confirme pas, seule, une intrusion."}</p>
        <p><strong>Evénements :</strong> {incident.report?.evidence_count ?? incident.evidence_ids?.length ?? 0}</p>
        <p><strong>Fonctions :</strong> {(incident.report?.functions || []).join(", ") || "Non renseignées"}</p>
        <p><strong>Empreinte de corrélation :</strong> <code>{incident.report?.correlation_hash || "—"}</code></p>
        <h4>Identifiants des preuves (sans données personnelles)</h4>
        <div className="evidence-ids">{(incident.evidence_ids || []).map((id) => <code key={id}>{id}</code>)}</div>
        {([
          ["Plan de réparation", plan?.repair_steps],
          ["Contrôles avant réouverture", plan?.validation_steps],
          ["Retour arrière", plan?.rollback_steps],
        ] as const).map(([title, steps]) => (
          <div key={title}><h4>{title}</h4><ol>{(steps || []).map((step, i) => <li key={i}>{step}</li>)}</ol></div>
        ))}
        <p className="notice">Les preuves sont des indices à vérifier. Une mise en quarantaine n'est pas une condamnation de compte.</p>
      </div>
    </details>
  );
}
function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [identity, setIdentity] = useState("");
  const [password, setPassword] = useState("");
  const [factorId, setFactorId] = useState("");
  const [totp, setTotp] = useState("");
  const [overview, setOverview] = useState<Overview | null>(null);
  const [state, setState] = useState<"login" | "mfa" | "ready">("login");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const ensureMfa = useCallback(async () => {
    if (!api) return;
    const { data: level, error: levelError } = await api.auth.mfa.getAuthenticatorAssuranceLevel();
    if (levelError) throw levelError;
    if (level.currentLevel === "aal2") {
      const { data } = await api.auth.getSession();
      setSession(data.session);
      setState("ready");
      return;
    }
    const { data: factors, error: factorError } = await api.auth.mfa.listFactors();
    if (factorError) throw factorError;
    const totpFactor = factors?.totp?.find((item) => item.status === "verified");
    if (!totpFactor) throw Error("Un second facteur TOTP verifie est obligatoire. Activez-le dans la securite du compte.");
    setFactorId(totpFactor.id);
    setState("mfa");
  }, []);

  const login = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!api || busy) return;
    setBusy(true); setError("");
    try {
      const { error: signInError } = await api.auth.signInWithPassword({ email: identity, password });
      setPassword("");
      if (signInError) throw Error("Identifiants invalides ou accès indisponible.");
      await ensureMfa();
    } catch (err) { setError(err instanceof Error ? err.message : "Authentification impossible."); }
    finally { setBusy(false); }
  };
  const challengeMfa = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!api || busy || !factorId) return;
    setBusy(true); setError("");
    try {
      const { data: challenge, error: challengeError } = await api.auth.mfa.challenge({ factorId });
      if (challengeError || !challenge) throw Error("Defi MFA indisponible.");
      const { error: verifyError } = await api.auth.mfa.verify({
        factorId, challengeId: challenge.id, code: totp.trim(),
      });
      setTotp("");
      if (verifyError) throw Error("Code MFA invalide ou expire.");
      await ensureMfa();
    } catch (err) { setError(err instanceof Error ? err.message : "Validation MFA impossible."); }
    finally { setBusy(false); }
  };
  const refresh = useCallback(async (current: Session) => {
    try {
      const data = await sentinelAction<Overview>(current, "list");
      setOverview(data);
      setError("");
    } catch (err) {
      // Never treat a failed monitoring request as an "all clear".
      setOverview(null);
      setError(err instanceof Error ? err.message : "Monitoring indisponible.");
    }
  }, []);

  useEffect(() => {
    if (state !== "ready" || !session) return;
    void refresh(session);
    const timer = window.setInterval(() => void refresh(session), 60_000);
    return () => window.clearInterval(timer);
  }, [state, session, refresh]);

  const logout = async () => {
    setOverview(null); setSession(null); setFactorId(""); setIdentity("");
    setState("login"); setError("");
    await api?.auth.signOut({ scope: "local" }).catch(() => {});
  };
  const release = async (incidentId: string) => {
    if (!session || busy) return;
    const expected = `LIBERER ${incidentId}`;
    const confirmation = window.prompt(
      "La levee d'un confinement n'est autorisee qu'apres verification du correctif et des preuves.\nRecopiez exactement : " + expected,
    );
    if (confirmation !== expected) return;
    setBusy(true); setError("");
    try {
      await sentinelAction(session, "release", { incidentId, confirmation });
      await refresh(session);
    } catch (err) { setError(err instanceof Error ? err.message : "Levee refusee."); }
    finally { setBusy(false); }
  };

  return (
    <main className="shell">
      <header className="masthead">
        <div className="mark"><span className="mark-icon">◆</span><span>TOK <strong>SENTINEL</strong></span></div>
        <span className="badge badge-neutral">Contrôle de cybersécurité</span>
      </header>
      <section className="hero">
        <div className="eyebrow">PROTECTION OPÉRATIONNELLE • ACCÈS RESTREINT</div>
        <h1>Surveiller. Démontrer.<br />Confiner avec discernement.</h1>
        <p>Détection d'anomalies, journal de preuves et décisions humaines traçables. Aucun arrêt total automatique sans preuves critiques indépendantes et mécanisme de confinement prêt.</p>
      </section>
      {!validConfig && <div className="alert">Console non configurée : renseigner les variables publiques VITE_SUPABASE_URL et VITE_SUPABASE_ANON_KEY dans le projet Vercel isolé.</div>}
      {error && <div className="alert" role="alert">{error}</div>}
      {validConfig && state === "login" && (
        <section className="card auth"><h2>Connexion administrateur</h2>
          <p>Session temporaire en mémoire. Mot de passe et authentification multifacteur obligatoires.</p>
          <form onSubmit={(event) => void login(event)}>
            <label>E-mail administrateur<input type="email" autoComplete="username" value={identity} onChange={(event) => setIdentity(event.target.value)} required /></label>
            <label>Mot de passe<input type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} required /></label>
            <button type="submit" disabled={busy}>Connexion sécurisée</button>
          </form>
        </section>
      )}
      {validConfig && state === "mfa" && (
        <section className="card auth"><h2>Vérification TOTP</h2>
          <p>Un second facteur vérifié est nécessaire pour consulter et lever les confinements.</p>
          <form onSubmit={(event) => void challengeMfa(event)}>
            <label>Code à six chiffres<input inputMode="numeric" pattern="[0-9]{6}" maxLength={6} autoComplete="one-time-code" value={totp} onChange={(event) => setTotp(event.target.value)} required /></label>
            <button type="submit" disabled={busy}>Vérifier mon identité</button>
          </form>
          <button type="button" className="ghost" onClick={() => void logout()}>Annuler</button>
        </section>
      )}
      {validConfig && state === "ready" && (
        <section className="dashboard">
          <div className="toolbar">
            <div><span className="eyebrow">CENTRE DE COMMANDEMENT</span><h2>État de la plateforme</h2></div>
            <div className="toolbar-actions">
              <button type="button" onClick={() => session && void refresh(session)} disabled={busy}>Actualiser</button>
              <button type="button" className="ghost" onClick={() => void logout()}>Déconnexion</button>
            </div>
          </div>
          {!overview ? <div className="alert">Aucune donnée de supervision validée disponible. Ne concluez pas à l'absence d'attaque.</div> : (
            <>
              <div className="cards">
                <article className="metric"><span>Confinements actifs</span><strong>{overview.activeContainments.length}</strong></article>
                <article className="metric"><span>Décisions en attente</span><strong>{overview.incidents.filter((i) => i.status === "awaiting_approval").length}</strong></article>
                <article className="metric"><span>Telegram</span><strong>{overview.telegramConfigured ? "Configuré" : "Indisponible"}</strong></article>
                <article className="metric"><span>Arrêt global automatique</span><strong className="safe">Désactivé</strong></article>
              </div>
              <div className="notice" role="status">
                {overview.enforcementArmed
                  ? "Confinement ciblé armé. Les gardes actuels ne couvrent pas toutes les Edge Functions ni le réseau : ne pas considérer cette protection comme totale."
                  : "Mode observation : les alertes et rapports restent actifs, mais les validations Telegram ne peuvent pas déclencher de confinement avant l'activation contrôlée des gardes."}
              </div>
              <h3>Confinements actifs</h3>
              {overview.activeContainments.length === 0 && <div className="card empty">Aucun confinement actif dans la source consultée.</div>}
              <div className="items">{overview.activeContainments.map((item) => (
                <article className="card incident active" key={item.id}>
                  <div className="incident-head"><strong>{item.scope.toUpperCase()}</strong><span className="badge badge-danger">Confiné</span></div>
                  <p>{item.reason}</p><p className="small">Depuis {displayDate(item.activated_at)}</p>
                  <button type="button" onClick={() => void release(item.incident_id)} disabled={busy}>Demander la levée contrôlée</button>
                </article>
              ))}</div>
              <h3>Incidents et dossiers de preuve</h3>
              {overview.incidents.length === 0 && <div className="card empty">Aucun incident enregistré dans les 60 dernières entrées. Cela ne garantit pas l'absence d'intrusion.</div>}
              <div className="items">{overview.incidents.map((incident) => (
                <article className="card incident" key={incident.id}>
                  <div className="incident-head">
                    <div><span className="eyebrow">{incident.category}</span><h4>{incident.scope} — {incident.status}</h4></div>
                    <span className={"badge " + (incident.severity === "critical" ? "badge-danger" : "badge-warning")}>{incident.severity}</span>
                  </div>
                  <p>{incident.report?.summary || "Anomalie technique à analyser."}</p>
                  <p className="small">Détecté {displayDate(incident.first_seen_at)} · Dernier signal {displayDate(incident.last_seen_at)} · {incident.occurrence_count} occurrence(s)</p>
                  {incident.status === "awaiting_approval" && <p className="notice">Approbation ou refus dans le bot Telegram autorisé. Ne pas agir sans preuve.</p>}
                  <Evidence incident={incident} />
                </article>
              ))}</div>
            </>
          )}
        </section>
      )}
      <footer>© TOK Sentinel · Décisions journalisées, sécurité par défaut et accès multifacteur.</footer>
    </main>
  );
}
export default App;
