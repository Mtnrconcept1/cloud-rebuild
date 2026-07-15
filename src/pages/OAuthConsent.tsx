import { useCallback, useEffect, useMemo, useState } from "react";
import { Check, Loader2, LockKeyhole, ShieldCheck, X } from "lucide-react";
import { useLocation, useSearchParams } from "react-router-dom";

import { getSupabase } from "@/integrations/supabase/client";

type OAuthError = {
  message?: string;
};

type OAuthClientDetails = {
  id?: string;
  name?: string | null;
};

type OAuthAuthorizationDetails = {
  authorization_id?: string | null;
  client?: OAuthClientDetails | null;
  redirect_uri?: string | null;
  redirect_url?: string | null;
  scope?: string | null;
};

type OAuthResult<T> = Promise<{
  data: T | null;
  error: OAuthError | null;
}>;

type OAuthAuthorizationApi = {
  getAuthorizationDetails: (authorizationId: string) => OAuthResult<OAuthAuthorizationDetails>;
  approveAuthorization: (
    authorizationId: string,
    options?: { skipBrowserRedirect?: boolean },
  ) => OAuthResult<{ redirect_url?: string | null }>;
  denyAuthorization: (
    authorizationId: string,
    options?: { skipBrowserRedirect?: boolean },
  ) => OAuthResult<{ redirect_url?: string | null }>;
};

type Decision = "approve" | "deny";

const SCOPE_LABELS: Record<string, string> = {
  openid: "Confirmer votre identité TOK",
  email: "Accéder à votre adresse e-mail",
  profile: "Accéder aux informations de base de votre profil",
};

function getOAuthApi(): OAuthAuthorizationApi | null {
  const supabase = getSupabase();
  const authWithOAuth = supabase.auth as typeof supabase.auth & {
    oauth?: OAuthAuthorizationApi;
  };

  return authWithOAuth.oauth || null;
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error && error.message) return error.message;
  if (error && typeof error === "object" && "message" in error) {
    const message = (error as OAuthError).message;
    if (message) return message;
  }
  return "La demande d’autorisation n’a pas pu être traitée.";
}

function redirectToOAuthClient(redirectUrl: string | null | undefined) {
  if (!redirectUrl) {
    throw new Error("L’adresse de retour de l’application est manquante.");
  }

  const target = new URL(redirectUrl, window.location.origin);
  if (target.protocol !== "https:" && target.protocol !== "http:") {
    throw new Error("L’adresse de retour de l’application n’est pas sûre.");
  }

  window.location.assign(target.toString());
}

export default function OAuthConsent() {
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const authorizationId = searchParams.get("authorization_id")?.trim() || "";
  const [details, setDetails] = useState<OAuthAuthorizationDetails | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [decision, setDecision] = useState<Decision | null>(null);
  const [retryCount, setRetryCount] = useState(0);

  const requestedScopes = useMemo(
    () => details?.scope?.split(/\s+/).filter(Boolean) || [],
    [details?.scope],
  );
  const clientName = details?.client?.name?.trim() || "Application externe";

  useEffect(() => {
    document.title = "Autoriser une application | TOK";
  }, []);

  useEffect(() => {
    let active = true;

    const loadAuthorization = async () => {
      let redirecting = false;
      setLoading(true);
      setDetails(null);
      setErrorMessage(null);

      try {
        if (!authorizationId) {
          throw new Error("Le paramètre authorization_id est manquant ou invalide.");
        }

        const supabase = getSupabase();
        const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
        if (sessionError) throw sessionError;

        if (!sessionData.session) {
          const returnPath = `${location.pathname}${location.search}${location.hash}`;
          redirecting = true;
          window.location.replace(`/auth?redirect=${encodeURIComponent(returnPath)}`);
          return;
        }

        const oauth = getOAuthApi();
        if (!oauth) {
          throw new Error("Le module OAuth de Supabase Auth n’est pas disponible dans cette version de l’application.");
        }

        const { data, error } = await oauth.getAuthorizationDetails(authorizationId);
        if (error) throw error;
        if (!data) throw new Error("La demande d’autorisation est introuvable ou a expiré.");

        // Supabase peut retourner directement une URL si un consentement valide existe déjà.
        if (!data.authorization_id && data.redirect_url) {
          redirecting = true;
          redirectToOAuthClient(data.redirect_url);
          return;
        }

        if (active) setDetails(data);
      } catch (error) {
        if (active) setErrorMessage(getErrorMessage(error));
      } finally {
        if (active && !redirecting) setLoading(false);
      }
    };

    void loadAuthorization();

    return () => {
      active = false;
    };
  }, [authorizationId, location.hash, location.pathname, location.search, retryCount]);

  const submitDecision = useCallback(async (nextDecision: Decision) => {
    if (!authorizationId || decision) return;

    setDecision(nextDecision);
    setErrorMessage(null);

    try {
      const oauth = getOAuthApi();
      if (!oauth) {
        throw new Error("Le module OAuth de Supabase Auth n’est pas disponible dans cette version de l’application.");
      }

      const { data, error } = nextDecision === "approve"
        ? await oauth.approveAuthorization(authorizationId, { skipBrowserRedirect: true })
        : await oauth.denyAuthorization(authorizationId, { skipBrowserRedirect: true });

      if (error) throw error;
      redirectToOAuthClient(data?.redirect_url);
    } catch (error) {
      setErrorMessage(getErrorMessage(error));
      setDecision(null);
    }
  }, [authorizationId, decision]);

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-12 text-slate-950 sm:px-6">
      <section
        className="mx-auto w-full max-w-lg overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-xl shadow-slate-200/60"
        aria-labelledby="oauth-consent-title"
      >
        <header className="border-b border-slate-100 px-6 py-7 text-center sm:px-8">
          <div
            className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-950 text-sm font-black tracking-wider text-white"
            aria-hidden="true"
          >
            TOK
          </div>
          <p className="text-sm font-semibold text-emerald-700">Connexion sécurisée</p>
          <h1 id="oauth-consent-title" className="mt-2 text-2xl font-bold tracking-tight sm:text-3xl">
            Autoriser une application
          </h1>
          <p className="mt-3 text-sm leading-6 text-slate-600">
            Vérifiez les informations ci-dessous avant de partager l’accès à votre compte TOK.
          </p>
        </header>

        <div className="px-6 py-7 sm:px-8">
          {loading ? (
            <div className="flex min-h-52 flex-col items-center justify-center text-center" role="status" aria-live="polite">
              <Loader2 className="h-8 w-8 animate-spin text-emerald-600" aria-hidden="true" />
              <p className="mt-4 font-medium">Vérification de la demande…</p>
              <p className="mt-1 text-sm text-slate-500">Cette étape ne devrait prendre qu’un instant.</p>
            </div>
          ) : details ? (
            <div className="space-y-6">
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
                <div className="flex items-start gap-4">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white shadow-sm">
                    <ShieldCheck className="h-6 w-6 text-emerald-600" aria-hidden="true" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Application</p>
                    <p className="mt-1 break-words text-lg font-bold">{clientName}</p>
                    <p className="mt-1 text-sm leading-5 text-slate-600">
                      souhaite se connecter à votre compte TOK.
                    </p>
                  </div>
                </div>
              </div>

              <div>
                <h2 className="flex items-center gap-2 text-sm font-bold text-slate-900">
                  <LockKeyhole className="h-4 w-4 text-slate-500" aria-hidden="true" />
                  Autorisations demandées
                </h2>
                {requestedScopes.length > 0 ? (
                  <ul className="mt-3 space-y-2" aria-label="Autorisations demandées">
                    {requestedScopes.map((scope) => (
                      <li key={scope} className="flex gap-3 rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-950">
                        <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-700" aria-hidden="true" />
                        <span>
                          {SCOPE_LABELS[scope] || "Accéder à la permission demandée"}
                          <span className="mt-0.5 block break-all font-mono text-xs text-emerald-800">{scope}</span>
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-3 rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-600">
                    Aucune permission supplémentaire n’est demandée.
                  </p>
                )}
              </div>

              {details.redirect_uri ? (
                <details className="rounded-xl border border-slate-200 px-4 py-3 text-sm">
                  <summary className="cursor-pointer font-semibold text-slate-700">Détails techniques</summary>
                  <p className="mt-3 text-xs text-slate-500">Adresse de retour après votre décision :</p>
                  <code className="mt-1 block break-all rounded-lg bg-slate-100 p-2 text-xs text-slate-700">
                    {details.redirect_uri}
                  </code>
                </details>
              ) : null}

              {errorMessage ? (
                <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900" role="alert">
                  {errorMessage}
                </div>
              ) : null}

              <p className="text-sm leading-6 text-slate-600">
                N’autorisez cette demande que si vous avez vous-même lancé la connexion depuis l’application indiquée.
              </p>

              <div className="grid gap-3 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={() => void submitDecision("deny")}
                  disabled={decision !== null}
                  className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-bold text-slate-800 transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {decision === "deny" ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <X className="h-4 w-4" aria-hidden="true" />}
                  Refuser l’accès
                </button>
                <button
                  type="button"
                  onClick={() => void submitDecision("approve")}
                  disabled={decision !== null}
                  className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-3 text-sm font-bold text-white shadow-sm transition hover:bg-emerald-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {decision === "approve" ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Check className="h-4 w-4" aria-hidden="true" />}
                  Autoriser l’accès
                </button>
              </div>
            </div>
          ) : (
            <div className="py-8 text-center">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-red-50">
                <X className="h-6 w-6 text-red-600" aria-hidden="true" />
              </div>
              <h2 className="mt-4 text-lg font-bold">Demande impossible à afficher</h2>
              <p className="mt-2 text-sm leading-6 text-slate-600" role="alert">
                {errorMessage || "Cette demande est invalide ou a expiré."}
              </p>
              <button
                type="button"
                onClick={() => setRetryCount((count) => count + 1)}
                className="mt-6 inline-flex min-h-11 items-center justify-center rounded-xl border border-slate-300 bg-white px-5 py-2.5 text-sm font-bold text-slate-800 transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-500 focus-visible:ring-offset-2"
              >
                Réessayer
              </button>
            </div>
          )}
        </div>

        <footer className="border-t border-slate-100 bg-slate-50 px-6 py-4 text-center text-xs leading-5 text-slate-500 sm:px-8">
          Vos identifiants ne sont jamais communiqués à l’application. Consultez notre{" "}
          <a className="font-semibold text-slate-700 underline-offset-2 hover:underline" href="/politique-confidentialite">
            politique de confidentialité
          </a>.
        </footer>
      </section>
    </main>
  );
}
