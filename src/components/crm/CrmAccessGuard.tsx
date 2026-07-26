import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { Crown, KeyRound, Loader2, Lock, QrCode, RefreshCw, ShieldCheck } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { getSupabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import {
  CRM_MFA_FRIENDLY_NAME,
  findPendingCrmMfaFactor,
  findVerifiedCrmMfaFactor,
  getCrmMfaFactorId,
  isCrmMfaFactor,
  type CrmMfaFactor,
} from "@/lib/crmMfa";

const supabase = getSupabase();

type MfaState = "checking" | "verified" | "challenge" | "setup" | "error";

type CrmAccessGuardProps = {
  children: ReactNode;
  surface: "restaurant" | "admin";
  requiresElite?: boolean;
  hasEliteAccess?: boolean;
  eliteLoading?: boolean;
  requiresPremiumCrm?: boolean;
  hasPremiumCrmAccess?: boolean;
  premiumCrmLoading?: boolean;
  restaurantName?: string | null;
};

type MfaFactor = CrmMfaFactor;

function getFactorId(factor: MfaFactor | null) {
  return getCrmMfaFactorId(factor);
}

function getMfaApi() {
  return (supabase.auth as unknown as {
    mfa?: {
      getAuthenticatorAssuranceLevel: () => Promise<{ data?: { currentLevel?: string; nextLevel?: string } | null; error?: Error | null }>;
      listFactors: () => Promise<{ data?: { all?: MfaFactor[]; totp?: MfaFactor[] } | null; error?: Error | null }>;
      enroll: (payload: { factorType: "totp"; friendlyName?: string }) => Promise<{
        data?: { id?: string; factor_id?: string; totp?: { qr_code?: string; secret?: string } } | null;
        error?: Error | null;
      }>;
      challenge: (payload: { factorId: string }) => Promise<{ data?: { id?: string } | null; error?: Error | null }>;
      unenroll: (payload: { factorId: string }) => Promise<{ data?: { id?: string } | null; error?: Error | null }>;
      verify: (payload: { factorId: string; challengeId: string; code: string }) => Promise<{
        data?: { access_token?: string; refresh_token?: string } | null;
        error?: Error | null;
      }>;
    };
  }).mfa;
}

function toQrCodeSource(qrCode: string) {
  if (qrCode.startsWith("data:")) return qrCode;
  return `data:image/svg+xml;utf8,${encodeURIComponent(qrCode)}`;
}

export default function CrmAccessGuard({
  children,
  surface,
  requiresElite = surface === "restaurant",
  hasEliteAccess = false,
  eliteLoading = false,
  requiresPremiumCrm,
  hasPremiumCrmAccess,
  premiumCrmLoading,
  restaurantName,
}: CrmAccessGuardProps) {
  const { toast } = useToast();
  const [state, setState] = useState<MfaState>("checking");
  const [factor, setFactor] = useState<MfaFactor | null>(null);
  const [challengeId, setChallengeId] = useState<string | null>(null);
  const [verificationCode, setVerificationCode] = useState("");
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [factorToReplaceId, setFactorToReplaceId] = useState<string | null>(null);
  const [rotationConfirmationVisible, setRotationConfirmationVisible] = useState(false);
  const [rotationRequested, setRotationRequested] = useState(false);

  const accessRequired = requiresPremiumCrm ?? requiresElite;
  const accessGranted = hasPremiumCrmAccess ?? hasEliteAccess;
  const accessLoading = premiumCrmLoading ?? eliteLoading;
  const gateTitle = surface === "admin" ? "CRM admin sécurisé" : "CRM clients sécurisé";
  const gateDescription = surface === "admin"
    ? "Une vérification à deux facteurs est requise avant de consulter les données CRM globales."
    : "Le CRM clients contient des données personnelles. Il est réservé aux abonnements Premium et Élite et protégé par une vérification à deux facteurs.";

  const startChallenge = useCallback(async (nextFactor: MfaFactor) => {
    const factorId = getFactorId(nextFactor);
    const mfa = getMfaApi();
    if (!mfa || !factorId) {
      setMessage("Impossible de préparer la vérification 2FA.");
      setState("error");
      return;
    }

    setBusy(true);
    try {
      const { data, error } = await mfa.challenge({ factorId });
      if (error) throw error;
      setChallengeId(data?.id || null);
      setFactor(nextFactor);
      setState("challenge");
      setMessage(null);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Impossible de lancer la vérification 2FA.");
      setState("error");
    } finally {
      setBusy(false);
    }
  }, []);

  const refreshMfaStatus = useCallback(async () => {
    const mfa = getMfaApi();
    setState("checking");
    setMessage(null);

    if (!mfa) {
      setMessage("La vérification à deux facteurs Supabase n'est pas disponible dans cette session.");
      setState("error");
      return;
    }

    try {
      const { data: assurance, error: assuranceError } = await mfa.getAuthenticatorAssuranceLevel();
      if (assuranceError) throw assuranceError;

      if (assurance?.currentLevel === "aal2") {
        setState("verified");
        return;
      }

      const { data: factors, error: factorsError } = await mfa.listFactors();
      if (factorsError) throw factorsError;
      const reusableFactor = findVerifiedCrmMfaFactor(factors);

      if (reusableFactor) {
        await startChallenge(reusableFactor);
        return;
      }

      setState("setup");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Impossible de vérifier le niveau de sécurité du compte.");
      setState("error");
    }
  }, [startChallenge]);

  useEffect(() => {
    if (accessLoading) return;
    if (accessRequired && !accessGranted) return;
    void refreshMfaStatus();
  }, [accessGranted, accessLoading, accessRequired, refreshMfaStatus]);

  const enrollTotp = async () => {
    const mfa = getMfaApi();
    if (!mfa) return;
    setBusy(true);
    setMessage(null);

    try {
      const { data: factors, error: factorsError } = await mfa.listFactors();
      if (factorsError) throw factorsError;
      const reusableFactor = findVerifiedCrmMfaFactor(factors);
      if (reusableFactor) {
        await startChallenge(reusableFactor);
        return;
      }
      const pendingFactor = findPendingCrmMfaFactor(factors);
      const pendingFactorId = getFactorId(pendingFactor);
      if (pendingFactorId) {
        const { error: unenrollError } = await mfa.unenroll({ factorId: pendingFactorId });
        if (unenrollError) throw unenrollError;
      }

      setFactorToReplaceId(null);
      const { data, error } = await mfa.enroll({
        factorType: "totp",
        friendlyName: CRM_MFA_FRIENDLY_NAME,
      });
      if (error) throw error;
      const nextFactor = { id: data?.id || data?.factor_id, factor_type: "totp", status: "unverified" };
      setFactor(nextFactor);
      setQrCode(data?.totp?.qr_code || null);
      setSecret(data?.totp?.secret || null);
      const factorId = getFactorId(nextFactor);
      if (factorId) {
        const challenge = await mfa.challenge({ factorId });
        if (challenge.error) throw challenge.error;
        setChallengeId(challenge.data?.id || null);
      }
      setState("setup");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Impossible d'activer la vérification à deux facteurs.");
      setState("error");
    } finally {
      setBusy(false);
    }
  };

  const beginTotpRotation = async () => {
    const mfa = getMfaApi();
    if (!mfa) return;

    setBusy(true);
    setMessage(null);

    try {
      const { data: assurance, error: assuranceError } = await mfa.getAuthenticatorAssuranceLevel();
      if (assuranceError) throw assuranceError;
      if (assurance?.currentLevel !== "aal2") {
        throw new Error("Validez d'abord le code actuel de votre application d'authentification.");
      }

      const { data: factors, error: factorsError } = await mfa.listFactors();
      if (factorsError) throw factorsError;

      const currentFactor = findVerifiedCrmMfaFactor(factors);
      const currentFactorId = getFactorId(currentFactor);
      if (!currentFactorId) {
        throw new Error("Aucun facteur vérifié ne permet de sécuriser le renouvellement.");
      }

      const pendingFactor = findPendingCrmMfaFactor(factors);
      const pendingFactorId = getFactorId(pendingFactor);
      if (pendingFactorId && pendingFactorId !== currentFactorId) {
        const { error: pendingUnenrollError } = await mfa.unenroll({ factorId: pendingFactorId });
        if (pendingUnenrollError) throw pendingUnenrollError;
      }

      const { data, error } = await mfa.enroll({
        factorType: "totp",
        friendlyName: CRM_MFA_FRIENDLY_NAME,
      });
      if (error) throw error;

      const nextFactor = {
        id: data?.id || data?.factor_id,
        factor_type: "totp",
        friendly_name: CRM_MFA_FRIENDLY_NAME,
        status: "unverified",
      };
      const nextFactorId = getFactorId(nextFactor);
      if (!nextFactorId) throw new Error("Le nouveau facteur 2FA n'a pas pu être créé.");

      const challenge = await mfa.challenge({ factorId: nextFactorId });
      if (challenge.error) throw challenge.error;

      setFactor(nextFactor);
      setFactorToReplaceId(isCrmMfaFactor(currentFactor) ? currentFactorId : null);
      setQrCode(data?.totp?.qr_code || null);
      setSecret(data?.totp?.secret || null);
      setChallengeId(challenge.data?.id || null);
      setVerificationCode("");
      setRotationConfirmationVisible(false);
      setRotationRequested(false);
      setState("setup");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Impossible de renouveler la vérification 2FA.");
      setRotationConfirmationVisible(false);
      setRotationRequested(false);
      setState("verified");
    } finally {
      setBusy(false);
    }
  };

  const verifyCode = async () => {
    const mfa = getMfaApi();
    const factorId = getFactorId(factor);
    const code = verificationCode.replace(/\s+/g, "");
    if (!mfa || !factorId || !challengeId || code.length < 6) return;

    setBusy(true);
    setMessage(null);
    try {
      const { error } = await mfa.verify({ factorId, challengeId, code });
      if (error) throw error;
      const { data: assurance, error: assuranceError } = await mfa.getAuthenticatorAssuranceLevel();
      if (assuranceError) throw assuranceError;
      if (assurance?.currentLevel !== "aal2") {
        throw new Error("La session 2FA n'a pas pu être confirmée. Reconnectez-vous puis réessayez.");
      }

      if (rotationRequested && !factorToReplaceId && !qrCode) {
        setVerificationCode("");
        await beginTotpRotation();
        return;
      }

      const isRotation = Boolean(factorToReplaceId || qrCode);
      if (factorToReplaceId && factorToReplaceId !== factorId) {
        const { error: unenrollError } = await mfa.unenroll({ factorId: factorToReplaceId });
        if (unenrollError) {
          const retryChallenge = await mfa.challenge({ factorId });
          if (!retryChallenge.error) {
            setChallengeId(retryChallenge.data?.id || null);
            setState("challenge");
          }
          throw new Error(
            "Le nouveau code est actif, mais l'ancien n'a pas encore été révoqué. Entrez un nouveau code pour réessayer.",
          );
        }
        setFactorToReplaceId(null);
      }

      const { error: refreshError } = await supabase.auth.refreshSession();
      setState("verified");
      setVerificationCode("");
      setQrCode(null);
      setSecret(null);
      setFactor(null);
      setRotationRequested(false);
      toast({
        title: isRotation ? "Code CRM renouvelé" : "Accès CRM vérifié",
        description: refreshError
          ? "Le code est actif. Reconnectez-vous si la session ne se met pas à jour immédiatement."
          : "Votre session sécurisée est active.",
      });
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Code invalide ou expiré.");
    } finally {
      setBusy(false);
    }
  };

  const canSubmitCode = useMemo(
    () => verificationCode.replace(/\s+/g, "").length >= 6 && Boolean(challengeId) && !busy,
    [busy, challengeId, verificationCode],
  );

  if (accessLoading) {
    return (
      <Card className="border-orange-200 bg-orange-50/60">
        <CardContent className="flex items-center gap-3 p-6 text-sm text-orange-900">
          <Loader2 className="h-5 w-5 animate-spin" />
          Vérification de l'abonnement CRM...
        </CardContent>
      </Card>
    );
  }

  if (accessRequired && !accessGranted) {
    return (
      <Card className="overflow-hidden border-orange-200 bg-gradient-to-br from-orange-50 via-background to-background">
        <CardContent className="grid gap-5 p-6 md:grid-cols-[1fr_auto] md:items-center">
          <div className="space-y-3">
            <Badge className="w-fit gap-1 bg-orange-100 text-orange-800">
              <Crown className="h-3.5 w-3.5" />
              Abonnement Premium ou Élite requis
            </Badge>
            <div>
              <h2 className="font-display text-2xl font-bold">CRM clients réservé aux abonnements Premium et Élite</h2>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
                {restaurantName ? `${restaurantName} n'a pas encore accès au CRM Premium.` : "Ce restaurant n'a pas encore accès au CRM Premium."}
                {" "}Passez à Premium ou Élite pour exploiter les profils clients, habitudes de commande et réservations.
              </p>
            </div>
          </div>
          <Button asChild className="rounded-full">
            <Link to="/dashboard/mon-compte-facturation">Voir l'abonnement</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (state === "verified") {
    return (
      <div className="space-y-4">
        <Card className="border-sky-200 bg-sky-50/60">
          <CardContent className="flex flex-col gap-4 p-4 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-sm font-semibold text-sky-950">Application d'authentification CRM</p>
              <p className="mt-1 text-sm text-sky-900/75">
                Changez d'application ou réinitialisez le code ici. L'ancien accès reste actif jusqu'à la validation du nouveau.
              </p>
            </div>
            {rotationConfirmationVisible ? (
              <div className="flex flex-col gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 sm:flex-row sm:items-center">
                <p className="max-w-md text-xs leading-5 text-amber-950">
                  Le nouveau QR code devra être vérifié avant que l'ancien code soit révoqué.
                </p>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setRotationConfirmationVisible(false)}
                    disabled={busy}
                  >
                    Annuler
                  </Button>
                  <Button type="button" size="sm" onClick={beginTotpRotation} disabled={busy} className="gap-2">
                    {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                    Créer le QR code
                  </Button>
                </div>
              </div>
            ) : (
              <Button
                type="button"
                variant="outline"
                onClick={() => setRotationConfirmationVisible(true)}
                className="gap-2"
              >
                <RefreshCw className="h-4 w-4" />
                Changer d'application
              </Button>
            )}
          </CardContent>
        </Card>
        {children}
      </div>
    );
  }

  return (
    <Card className="overflow-hidden border-sky-200 bg-gradient-to-br from-sky-50 via-background to-background">
      <CardContent className="grid gap-6 p-6 lg:grid-cols-[minmax(0,1fr)_minmax(280px,380px)] lg:items-center">
        <div className="space-y-4">
          <Badge className="w-fit gap-1 bg-sky-100 text-sky-800">
            <ShieldCheck className="h-3.5 w-3.5" />
            Données sensibles
          </Badge>
          <div>
            <h2 className="font-display text-2xl font-bold">{gateTitle}</h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">{gateDescription}</p>
          </div>
          <div className="rounded-2xl border bg-background/80 p-4 text-sm text-muted-foreground">
            Le contrôle est aussi appliqué côté Supabase : une session non vérifiée ne peut pas lire la RPC CRM.
          </div>
        </div>

        <div className="rounded-2xl border bg-background p-4 shadow-sm">
          {state === "checking" ? (
            <div className="flex items-center gap-3 text-sm text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin text-primary" />
              Vérification du niveau de sécurité...
            </div>
          ) : null}

          {state === "setup" ? (
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <QrCode className="h-5 w-5 text-primary" />
                <h3 className="font-semibold">
                  {factorToReplaceId ? "Reconnecter l'application d'authentification" : "Activer la vérification 2FA"}
                </h3>
              </div>
              {qrCode ? (
                <p className="text-xs leading-5 text-muted-foreground">
                  Scannez ce nouveau QR code, puis saisissez le code à 6 chiffres. L'ancien code restera valide jusqu'à cette vérification.
                </p>
              ) : null}
              {qrCode ? (
                <img
                  src={toQrCodeSource(qrCode)}
                  alt="QR code de configuration 2FA"
                  className="mx-auto h-44 w-44 rounded-xl border bg-white p-3"
                />
              ) : (
                <Button type="button" onClick={enrollTotp} disabled={busy} className="w-full gap-2">
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}
                  Générer un QR code
                </Button>
              )}
              {secret ? (
                <p className="rounded-xl bg-muted p-3 text-xs text-muted-foreground">
                  Clé manuelle : <span className="font-mono text-foreground">{secret}</span>
                </p>
              ) : null}
            </div>
          ) : null}

          {state === "challenge" || (state === "setup" && challengeId) ? (
            <div className="mt-4 space-y-3">
              <label className="text-sm font-medium" htmlFor="crm-mfa-code">
                Code de vérification
              </label>
              <div className="flex flex-col gap-2 sm:flex-row">
                <Input
                  id="crm-mfa-code"
                  value={verificationCode}
                  onChange={(event) => setVerificationCode(event.target.value)}
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  placeholder="123456"
                />
                <Button type="button" onClick={verifyCode} disabled={!canSubmitCode} className="sm:shrink-0">
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : rotationRequested ? "Continuer" : "Valider"}
                </Button>
              </div>
            </div>
          ) : null}

          {state === "challenge" ? (
            <div className="mt-4 border-t pt-4">
              {rotationRequested ? (
                <div className="space-y-3 rounded-xl border border-amber-200 bg-amber-50 p-3">
                  <p className="text-xs leading-5 text-amber-950">
                    Saisissez d'abord le code de votre application actuelle. Après validation, un nouveau QR code sera généré ici et l'ancien code restera actif jusqu'à la confirmation du nouveau.
                  </p>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setRotationRequested(false);
                      setMessage(null);
                    }}
                    disabled={busy}
                  >
                    Annuler la réinitialisation
                  </Button>
                </div>
              ) : (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setRotationRequested(true);
                    setMessage(null);
                  }}
                  disabled={busy}
                  className="h-auto min-h-10 w-full gap-2 whitespace-normal py-2.5"
                >
                  <RefreshCw className="h-4 w-4 shrink-0" />
                  Changer d'application / Réinitialiser le code
                </Button>
              )}
              <p className="mt-2 text-xs leading-5 text-muted-foreground">
                Vous n'avez plus accès au code actuel ? Le support TOK doit d'abord vérifier votre identité avant toute réinitialisation.
              </p>
            </div>
          ) : null}

          {message ? <p className="mt-3 text-sm text-destructive">{message}</p> : null}

          {state === "error" ? (
            <div className="mt-4 flex flex-wrap gap-2">
              <Button type="button" onClick={() => void refreshMfaStatus()} variant="outline" className="gap-2">
                <RefreshCw className="h-4 w-4" />
                Réessayer
              </Button>
              <Button type="button" onClick={enrollTotp} disabled={busy} variant="secondary" className="gap-2">
                <Lock className="h-4 w-4" />
                Configurer 2FA
              </Button>
            </div>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}
