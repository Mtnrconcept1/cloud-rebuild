import { useEffect, useState, type FormEvent } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import {
  KeyRound,
  Loader2,
  LockKeyhole,
  Megaphone,
  RefreshCw,
  ShieldCheck,
} from "lucide-react";

import AppLoadingScreen from "@/components/ui/app-loading-screen";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useMarketingSession } from "@/marketing/MarketingSessionContext";
import { isMarketingTotpCode } from "@/marketing/marketingBffClient";

export default function MarketingLogin() {
  const navigate = useNavigate();
  const {
    status,
    enrollment,
    submitting,
    error,
    refreshSession,
    login,
    verifyTotp,
    clearError,
  } = useMarketingSession();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");

  useEffect(() => {
    document.title = "Connexion marketing sécurisée · TheTOK";
  }, []);

  if (status === "loading") {
    return (
      <AppLoadingScreen
        fullScreen
        title="Ouverture de l’espace marketing"
        description="Vérification de la session sécurisée…"
      />
    );
  }

  if (status === "authenticated") return <Navigate to="/marketing" replace />;

  const mfaStep = status === "challenge-mfa" || status === "enroll-mfa";
  const codeValid = isMarketingTotpCode(code);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    clearError();

    if (mfaStep) {
      const verified = await verifyTotp(code);
      if (verified) navigate("/marketing", { replace: true });
      return;
    }

    const started = await login(email, password);
    if (started) setPassword("");
  };

  return (
    <main className="relative flex min-h-[100dvh] items-center justify-center overflow-hidden bg-[#06101e] px-4 py-8 text-white sm:px-6">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(249,115,22,0.18),transparent_38%),radial-gradient(circle_at_bottom_right,rgba(14,165,233,0.12),transparent_40%)]" />
      <section className="relative w-full max-w-lg rounded-[2rem] border border-white/10 bg-[#0a1728]/95 p-5 shadow-2xl shadow-black/40 backdrop-blur-xl sm:p-8" aria-labelledby="marketing-login-title">
        <div className="flex items-center gap-3">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-orange-500 to-amber-400 shadow-lg shadow-orange-950/40">
            <Megaphone className="h-5 w-5" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-orange-300">TheTOK · Admin</p>
            <h1 id="marketing-login-title" className="mt-1 text-xl font-bold tracking-tight sm:text-2xl">
              {mfaStep ? "Vérification en deux étapes" : "Marketing Operations"}
            </h1>
          </div>
        </div>

        <p className="mt-5 text-sm leading-relaxed text-slate-400">
          {status === "enroll-mfa"
            ? "Configurez votre application d’authentification, puis confirmez le premier code généré."
            : status === "challenge-mfa"
              ? "Saisissez le code temporaire généré par votre application d’authentification."
              : status === "error"
                ? "Le serveur n’a pas pu confirmer votre session. L’accès reste fermé."
                : "Cet espace utilise une session administrateur isolée et un second facteur obligatoire."}
        </p>

        {status === "error" ? (
          <Button type="button" className="mt-6 w-full" onClick={() => void refreshSession()}>
            <RefreshCw className="mr-2 h-4 w-4" aria-hidden="true" />
            Réessayer la vérification
          </Button>
        ) : (
          <form className="mt-6 space-y-5" onSubmit={submit} noValidate>
            {!mfaStep ? (
              <>
                <div className="space-y-2">
                  <Label htmlFor="marketing-email" className="text-slate-200">Adresse e-mail administrateur</Label>
                  <Input
                    id="marketing-email"
                    name="email"
                    type="email"
                    autoComplete="username"
                    inputMode="email"
                    value={email}
                    onChange={(event) => setEmail(event.target.value.slice(0, 254))}
                    disabled={submitting}
                    required
                    maxLength={254}
                    className="h-12 border-white/10 bg-white/[0.06] text-white placeholder:text-slate-600"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="marketing-password" className="text-slate-200">Mot de passe</Label>
                  <Input
                    id="marketing-password"
                    name="password"
                    type="password"
                    autoComplete="current-password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value.slice(0, 1_024))}
                    disabled={submitting}
                    required
                    maxLength={1_024}
                    className="h-12 border-white/10 bg-white/[0.06] text-white"
                  />
                </div>
              </>
            ) : (
              <>
                {status === "enroll-mfa" && enrollment ? (
                  <div className="rounded-2xl border border-orange-400/20 bg-orange-400/[0.06] p-4">
                    <div className="grid gap-4 sm:grid-cols-[9rem_1fr] sm:items-center">
                      <div className="flex aspect-square items-center justify-center rounded-xl bg-white p-2">
                        {enrollment.qrCodeDataUrl ? (
                          <img
                            src={enrollment.qrCodeDataUrl}
                            alt="QR code d’enrôlement TOTP"
                            width={144}
                            height={144}
                            className="h-full w-full object-contain"
                          />
                        ) : (
                          <KeyRound className="h-10 w-10 text-slate-700" aria-hidden="true" />
                        )}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-orange-100">
                          {enrollment.secret ? "Clé de configuration manuelle" : "Enrôlement TOTP"}
                        </p>
                        {enrollment.secret ? (
                          <code className="mt-2 block break-all rounded-lg bg-black/25 px-3 py-2 text-xs leading-relaxed text-orange-200" aria-label="Secret TOTP">
                            {enrollment.secret}
                          </code>
                        ) : (
                          <p className="mt-2 text-xs leading-relaxed text-slate-400">
                            Scannez le QR code avec votre application d’authentification.
                          </p>
                        )}
                        <p className="mt-2 text-xs leading-relaxed text-slate-400">
                          Ne partagez jamais ce QR code ni cette clé. Ils ne seront plus affichés après validation.
                        </p>
                      </div>
                    </div>
                  </div>
                ) : null}

                <div className="space-y-2">
                  <Label htmlFor="marketing-totp" className="text-slate-200">Code de sécurité</Label>
                  <Input
                    id="marketing-totp"
                    name="totp"
                    type="text"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    pattern="[0-9]*"
                    value={code}
                    onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
                    disabled={submitting}
                    required
                    minLength={6}
                    maxLength={6}
                    autoFocus
                    aria-describedby="marketing-totp-help"
                    className="h-14 border-white/10 bg-white/[0.06] text-center font-mono text-2xl tracking-[0.3em] text-white"
                  />
                  <p id="marketing-totp-help" className="text-xs text-slate-500">6 chiffres, sans espace.</p>
                </div>
              </>
            )}

            {error ? (
              <div className="rounded-xl border border-rose-400/20 bg-rose-400/[0.08] px-3 py-2.5 text-sm text-rose-200" role="alert" aria-live="polite">
                {error}
              </div>
            ) : null}

            <Button
              type="submit"
              className="h-12 w-full bg-orange-500 font-semibold text-white hover:bg-orange-400"
              disabled={submitting || (mfaStep && !codeValid)}
            >
              {submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" /> : mfaStep ? <ShieldCheck className="mr-2 h-4 w-4" aria-hidden="true" /> : <LockKeyhole className="mr-2 h-4 w-4" aria-hidden="true" />}
              {mfaStep ? "Vérifier le code" : "Continuer en sécurité"}
            </Button>
          </form>
        )}

        <div className="mt-6 flex items-start gap-2 border-t border-white/10 pt-4 text-xs leading-relaxed text-slate-500">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" aria-hidden="true" />
          <p>Aucun jeton Supabase n’est conservé dans ce navigateur. La session privilégiée reste limitée à ce domaine.</p>
        </div>
      </section>
    </main>
  );
}
