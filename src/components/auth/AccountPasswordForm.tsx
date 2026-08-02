import { FormEvent, useMemo, useState } from "react";
import { Eye, EyeOff, KeyRound, Loader2, ShieldCheck } from "lucide-react";
import { getSupabase } from "@/integrations/supabase/client";
import {
  PASSWORD_POLICY_HINT,
  getPasswordError,
} from "@/lib/passwordPolicy";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const supabase = getSupabase();
const TOTP_PATTERN = /^\d{6}$/;

type AccountPasswordFormProps = {
  recovery?: boolean;
  disabled?: boolean;
  onSuccess?: () => void | Promise<void>;
};

type AuthErrorLike = {
  code?: unknown;
  message?: unknown;
  status?: unknown;
};

function getAuthErrorDetails(error: unknown) {
  const candidate =
    error && typeof error === "object" ? (error as AuthErrorLike) : {};
  return {
    code: typeof candidate.code === "string" ? candidate.code : "",
    message: typeof candidate.message === "string" ? candidate.message : "",
    status: typeof candidate.status === "number" ? candidate.status : null,
  };
}

function isInsufficientAalError(error: unknown) {
  const { code, message } = getAuthErrorDetails(error);
  return (
    code === "insufficient_aal" || /AAL2|insufficient[_ ]aal/i.test(message)
  );
}

function getPasswordUpdateErrorMessage(error: unknown) {
  const { code, message, status } = getAuthErrorDetails(error);
  if (
    code === "weak_password" ||
    status === 422 ||
    /known to be weak|easy to guess|password should contain/i.test(message)
  ) {
    return "Ce mot de passe est refusé par la politique de sécurité. Choisissez-en un unique avec majuscule, minuscule, chiffre et symbole.";
  }
  if (isInsufficientAalError(error)) {
    return "Validez d’abord le code de votre application d’authentification.";
  }
  return message || "Une erreur est survenue.";
}

export default function AccountPasswordForm({
  recovery = false,
  disabled = false,
  onSuccess,
}: AccountPasswordFormProps) {
  const { toast } = useToast();
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [mfaFactorId, setMfaFactorId] = useState<string | null>(null);
  const [mfaCode, setMfaCode] = useState("");
  const validationError = useMemo(
    () =>
      password || confirmation
        ? getPasswordError(password, confirmation)
        : null,
    [confirmation, password],
  );
  const mfaRequired = Boolean(mfaFactorId);

  const prepareAal2 = async () => {
    const { data: assurance, error: assuranceError } =
      await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    if (assuranceError) throw assuranceError;
    if (assurance.currentLevel === "aal2" || assurance.nextLevel !== "aal2")
      return true;

    if (!mfaFactorId) {
      const { data: factors, error: factorsError } =
        await supabase.auth.mfa.listFactors();
      if (factorsError) throw factorsError;
      const factor = (factors.totp ?? []).find(
        (candidate) => candidate.status === "verified",
      );
      if (!factor) {
        throw new Error(
          "Ce compte exige une vérification à deux facteurs, mais aucun facteur TOTP vérifié n’est disponible. Terminez d’abord l’activation 2FA ou utilisez la récupération MFA.",
        );
      }
      setMfaFactorId(factor.id);
      setMfaCode("");
      toast({
        title: "Code 2FA requis",
        description:
          "Saisissez le code à 6 chiffres de votre application d’authentification.",
      });
      return false;
    }

    const normalizedCode = mfaCode.replace(/\s+/g, "");
    if (!TOTP_PATTERN.test(normalizedCode)) {
      toast({
        title: "Code 2FA incomplet",
        description:
          "Saisissez les 6 chiffres affichés dans votre application d’authentification.",
        variant: "destructive",
      });
      return false;
    }

    const { error: verifyError } = await supabase.auth.mfa.challengeAndVerify({
      factorId: mfaFactorId,
      code: normalizedCode,
    });
    if (verifyError) throw verifyError;

    const { data: elevated, error: elevatedError } =
      await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    if (elevatedError) throw elevatedError;
    if (elevated.currentLevel !== "aal2") {
      throw new Error(
        "La session 2FA n’a pas pu être confirmée. Utilisez un nouveau code.",
      );
    }
    return true;
  };

  const updatePassword = async () => {
    let result = await supabase.auth.updateUser({ password });
    if (result.error && isInsufficientAalError(result.error)) {
      const ready = await prepareAal2();
      if (!ready) return false;
      result = await supabase.auth.updateUser({ password });
    }
    if (result.error) throw result.error;
    return true;
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submitting || disabled) return;

    const errorMessage = getPasswordError(password, confirmation);
    if (errorMessage) {
      toast({
        title: "Mot de passe invalide",
        description: errorMessage,
        variant: "destructive",
      });
      return;
    }

    setSubmitting(true);
    try {
      const assuranceReady = await prepareAal2();
      if (!assuranceReady) return;
      const updated = await updatePassword();
      if (!updated) return;

      setPassword("");
      setConfirmation("");
      setMfaCode("");
      setMfaFactorId(null);
      toast({
        title: "Mot de passe mis à jour",
        description: recovery
          ? "Votre nouveau mot de passe est enregistré. Reconnectez-vous pour continuer."
          : "Votre nouveau mot de passe est actif immédiatement.",
      });
      await onSuccess?.();
    } catch (error) {
      toast({
        title: isInsufficientAalError(error)
          ? "Vérification 2FA requise"
          : "Modification impossible",
        description: getPasswordUpdateErrorMessage(error),
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form className="space-y-4" onSubmit={handleSubmit}>
      <div className="space-y-2">
        <Label htmlFor={recovery ? "recovery-password" : "account-password"}>
          Nouveau mot de passe
        </Label>
        <div className="relative">
          <Input
            id={recovery ? "recovery-password" : "account-password"}
            type={showPassword ? "text" : "password"}
            autoComplete="new-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            disabled={disabled || submitting}
            className="pr-11"
            required
          />
          <button
            type="button"
            onClick={() => setShowPassword((value) => !value)}
            className="absolute inset-y-0 right-0 flex w-11 items-center justify-center text-muted-foreground"
            aria-label={
              showPassword
                ? "Masquer le mot de passe"
                : "Afficher le mot de passe"
            }
          >
            {showPassword ? (
              <EyeOff className="h-4 w-4" />
            ) : (
              <Eye className="h-4 w-4" />
            )}
          </button>
        </div>
      </div>

      <div className="space-y-2">
        <Label
          htmlFor={
            recovery
              ? "recovery-password-confirmation"
              : "account-password-confirmation"
          }
        >
          Confirmer le nouveau mot de passe
        </Label>
        <Input
          id={
            recovery
              ? "recovery-password-confirmation"
              : "account-password-confirmation"
          }
          type={showPassword ? "text" : "password"}
          autoComplete="new-password"
          value={confirmation}
          onChange={(event) => setConfirmation(event.target.value)}
          disabled={disabled || submitting}
          required
        />
      </div>

      <p
        className={`text-xs ${validationError ? "text-destructive" : "text-muted-foreground"}`}
      >
        {validationError || PASSWORD_POLICY_HINT}
      </p>

      {mfaRequired ? (
        <div className="space-y-2 rounded-xl border bg-muted/30 p-4">
          <Label
            htmlFor={
              recovery ? "recovery-password-mfa" : "account-password-mfa"
            }
          >
            Code de vérification 2FA
          </Label>
          <Input
            id={recovery ? "recovery-password-mfa" : "account-password-mfa"}
            value={mfaCode}
            onChange={(event) =>
              setMfaCode(event.target.value.replace(/\D/g, "").slice(0, 6))
            }
            inputMode="numeric"
            autoComplete="one-time-code"
            placeholder="123456"
            maxLength={6}
            disabled={disabled || submitting}
            required
          />
          <p className="text-xs text-muted-foreground">
            Supabase exige une session AAL2 avant de modifier le mot de passe de
            ce compte.
          </p>
        </div>
      ) : null}

      <Button
        type="submit"
        className="w-full"
        disabled={disabled || submitting}
      >
        {submitting ? (
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        ) : mfaRequired ? (
          <ShieldCheck className="mr-2 h-4 w-4" />
        ) : (
          <KeyRound className="mr-2 h-4 w-4" />
        )}
        {mfaRequired
          ? "Vérifier et enregistrer"
          : recovery
            ? "Enregistrer et revenir à la connexion"
            : "Changer mon mot de passe"}
      </Button>
    </form>
  );
}
