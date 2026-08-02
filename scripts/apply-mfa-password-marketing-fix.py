from __future__ import annotations

from pathlib import Path
import textwrap


def replace_once(source: str, old: str, new: str, label: str) -> str:
    count = source.count(old)
    if count != 1:
        raise RuntimeError(f"{label}: expected one occurrence, found {count}")
    return source.replace(old, new, 1)


PASSWORD_FORM = r'''import { FormEvent, useMemo, useState } from "react";
import { Eye, EyeOff, KeyRound, Loader2, ShieldCheck } from "lucide-react";
import { getSupabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const supabase = getSupabase();
const MIN_PASSWORD_LENGTH = 10;
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

function getPasswordError(password: string, confirmation: string) {
  if (password.length < MIN_PASSWORD_LENGTH) {
    return `Le mot de passe doit contenir au moins ${MIN_PASSWORD_LENGTH} caractères.`;
  }
  if (!/[a-z]/.test(password) || !/[A-Z]/.test(password) || !/[0-9]/.test(password)) {
    return "Utilisez au moins une minuscule, une majuscule et un chiffre.";
  }
  if (!/[^A-Za-z0-9\s]/.test(password)) {
    return "Ajoutez au moins un symbole, par exemple !, #, %, + ou ?.";
  }
  if (password !== confirmation) return "Les deux mots de passe ne correspondent pas.";
  return null;
}

function getAuthErrorDetails(error: unknown) {
  const candidate = error && typeof error === "object" ? error as AuthErrorLike : {};
  return {
    code: typeof candidate.code === "string" ? candidate.code : "",
    message: typeof candidate.message === "string" ? candidate.message : "",
    status: typeof candidate.status === "number" ? candidate.status : null,
  };
}

function isInsufficientAalError(error: unknown) {
  const { code, message } = getAuthErrorDetails(error);
  return code === "insufficient_aal" || /AAL2|insufficient[_ ]aal/i.test(message);
}

function getPasswordUpdateErrorMessage(error: unknown) {
  const { code, message, status } = getAuthErrorDetails(error);
  if (
    code === "weak_password"
    || status === 422
    || /known to be weak|easy to guess|password should contain/i.test(message)
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
    () => (password || confirmation ? getPasswordError(password, confirmation) : null),
    [confirmation, password],
  );
  const mfaRequired = Boolean(mfaFactorId);

  const prepareAal2 = async () => {
    const { data: assurance, error: assuranceError } =
      await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    if (assuranceError) throw assuranceError;
    if (assurance.currentLevel === "aal2" || assurance.nextLevel !== "aal2") return true;

    if (!mfaFactorId) {
      const { data: factors, error: factorsError } = await supabase.auth.mfa.listFactors();
      if (factorsError) throw factorsError;
      const factor = (factors.totp ?? []).find((candidate) => candidate.status === "verified");
      if (!factor) {
        throw new Error(
          "Ce compte exige une vérification à deux facteurs, mais aucun facteur TOTP vérifié n’est disponible. Terminez d’abord l’activation 2FA ou utilisez la récupération MFA.",
        );
      }
      setMfaFactorId(factor.id);
      setMfaCode("");
      toast({
        title: "Code 2FA requis",
        description: "Saisissez le code à 6 chiffres de votre application d’authentification.",
      });
      return false;
    }

    const normalizedCode = mfaCode.replace(/\s+/g, "");
    if (!TOTP_PATTERN.test(normalizedCode)) {
      toast({
        title: "Code 2FA incomplet",
        description: "Saisissez les 6 chiffres affichés dans votre application d’authentification.",
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
      throw new Error("La session 2FA n’a pas pu être confirmée. Utilisez un nouveau code.");
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
      toast({ title: "Mot de passe invalide", description: errorMessage, variant: "destructive" });
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
        title: isInsufficientAalError(error) ? "Vérification 2FA requise" : "Modification impossible",
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
        <Label htmlFor={recovery ? "recovery-password" : "account-password"}>Nouveau mot de passe</Label>
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
            aria-label={showPassword ? "Masquer le mot de passe" : "Afficher le mot de passe"}
          >
            {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor={recovery ? "recovery-password-confirmation" : "account-password-confirmation"}>
          Confirmer le nouveau mot de passe
        </Label>
        <Input
          id={recovery ? "recovery-password-confirmation" : "account-password-confirmation"}
          type={showPassword ? "text" : "password"}
          autoComplete="new-password"
          value={confirmation}
          onChange={(event) => setConfirmation(event.target.value)}
          disabled={disabled || submitting}
          required
        />
      </div>

      <p className={`text-xs ${validationError ? "text-destructive" : "text-muted-foreground"}`}>
        {validationError || "10 caractères minimum, avec majuscule, minuscule, chiffre et symbole."}
      </p>

      {mfaRequired ? (
        <div className="space-y-2 rounded-xl border bg-muted/30 p-4">
          <Label htmlFor={recovery ? "recovery-password-mfa" : "account-password-mfa"}>
            Code de vérification 2FA
          </Label>
          <Input
            id={recovery ? "recovery-password-mfa" : "account-password-mfa"}
            value={mfaCode}
            onChange={(event) => setMfaCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
            inputMode="numeric"
            autoComplete="one-time-code"
            placeholder="123456"
            maxLength={6}
            disabled={disabled || submitting}
            required
          />
          <p className="text-xs text-muted-foreground">
            Supabase exige une session AAL2 avant de modifier le mot de passe de ce compte.
          </p>
        </div>
      ) : null}

      <Button type="submit" className="w-full" disabled={disabled || submitting}>
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
'''


def update_password_form() -> None:
    Path("src/components/auth/AccountPasswordForm.tsx").write_text(
        textwrap.dedent(PASSWORD_FORM),
        encoding="utf-8",
    )


def update_marketing_bff() -> None:
    path = Path("server/marketingBff.ts")
    source = path.read_text(encoding="utf-8")

    source = replace_once(
        source,
        '''    try {
      svg = decodeURIComponent(trimmed.slice(separator + 1));
    } catch {
      throw new DownstreamHttpError(502);
    }''',
        '''    const payload = trimmed.slice(separator + 1);
    try {
      svg = decodeURIComponent(payload);
    } catch {
      // Supabase can return an SVG data URL containing literal percent
      // characters. The payload is already valid SVG and must not abort
      // the MFA enrollment before the challenge is created.
      svg = payload;
    }''',
        "marketing SVG decoder",
    )

    source = replace_once(
        source,
        '''  } catch {
    if (enrolledFactorId) {
      try {
        await unenrollFactor(config, tokens.accessToken, enrolledFactorId);
      } catch {
        // Best-effort cleanup of an incomplete enrollment.
      }
    }
    await signOutLocalBestEffort(config, tokens.accessToken);
    throw new PublicBffError(401, "authentication_failed", "Authentification impossible.");
  }
}''',
        '''  } catch (error) {
    if (enrolledFactorId) {
      try {
        await unenrollFactor(config, tokens.accessToken, enrolledFactorId);
      } catch {
        // Best-effort cleanup of an incomplete enrollment.
      }
    }
    await signOutLocalBestEffort(config, tokens.accessToken);
    if (error instanceof PublicBffError) throw error;
    throw new PublicBffError(
      503,
      "mfa_setup_unavailable",
      "Configuration 2FA temporairement indisponible.",
    );
  }
}''',
        "marketing MFA setup classification",
    )

    path.write_text(source, encoding="utf-8")


def update_tests() -> None:
    routing_path = Path("src/test/password-recovery-routing.test.ts")
    routing = routing_path.read_text(encoding="utf-8")
    routing = replace_once(
        routing,
        '''    expect(passwordForm).toContain("supabase.auth.updateUser({ password })");
    expect(passwordForm).toContain("new-password");''',
        '''    expect(passwordForm).toContain("supabase.auth.updateUser({ password })");
    expect(passwordForm).toContain("new-password");
    expect(passwordForm).toContain("getAuthenticatorAssuranceLevel");
    expect(passwordForm).toContain("challengeAndVerify");
    expect(passwordForm).toContain("Ajoutez au moins un symbole");
    expect(passwordForm).toContain("known to be weak");''',
        "password security source contract",
    )
    routing_path.write_text(routing, encoding="utf-8")

    security_path = Path("src/test/marketing-bff-security.test.ts")
    security = security_path.read_text(encoding="utf-8")
    marker = '  it("refuses AAL1 TOTP bootstrap when another verified factor exists", async () => {'
    if "accepts Supabase SVG enrollment payloads containing literal percent characters" not in security:
        if marker not in security:
            raise RuntimeError("marketing BFF test insertion marker was not found")
        addition = r'''  it("accepts Supabase SVG enrollment payloads containing literal percent characters", async () => {
    configureServerEnvironment();
    const userId = "11111111-1111-4111-8111-111111111111";
    const factorId = "22222222-2222-4222-8222-222222222222";
    const challengeId = "33333333-3333-4333-8333-333333333333";
    vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (url.endsWith("/rpc/service_consume_marketing_auth_attempt")) {
        return json({ allowed: true, retry_after_seconds: 0 });
      }
      if (url.endsWith("/auth/v1/token?grant_type=password")) {
        return json({
          access_token: "supabase-access-token",
          refresh_token: "supabase-refresh-token",
          user: { id: userId, email: "admin@thetok.ch" },
        });
      }
      if (url.endsWith(`/auth/v1/admin/users/${userId}`)) {
        return json({ id: userId, email: "admin@thetok.ch" });
      }
      if (url.includes("/rest/v1/user_roles?")) return json([{ user_id: userId }]);
      if (url.endsWith("/auth/v1/user")) {
        return json({ id: userId, email: "admin@thetok.ch", factors: [] });
      }
      if (url.endsWith("/auth/v1/factors")) {
        return json({
          id: factorId,
          totp: {
            qr_code: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg"><text>100%</text></svg>',
          },
        });
      }
      if (url.endsWith(`/auth/v1/factors/${factorId}/challenge`)) {
        return json({ id: challengeId });
      }
      if (url.endsWith("/rpc/service_store_marketing_auth_challenge")) {
        return json({ user_id: userId, expires_at: new Date(Date.now() + 600_000).toISOString() });
      }
      throw new Error(`Unexpected test request: ${url}`);
    }));

    const recorder = responseRecorder();
    await marketingLoginHandler(
      mutationRequest(
        { email: "admin@thetok.ch", password: "correct-password" },
        `${MARKETING_CSRF_COOKIE}=${"c".repeat(43)}`,
      ),
      recorder.response,
    );

    expect(recorder.response.statusCode).toBe(200);
    const payload = JSON.parse(recorder.body) as Record<string, unknown>;
    expect(payload.status).toBe("mfa_enrollment_required");
    expect(payload.qrCode).toMatch(/^data:image\/svg\+xml;base64,/);
    expect(recorder.body).not.toMatch(/supabase-access-token|supabase-refresh-token/);
  });

'''
        security = security.replace(marker, textwrap.dedent(addition) + marker, 1)
    security_path.write_text(security, encoding="utf-8")


def main() -> None:
    update_password_form()
    update_marketing_bff()
    update_tests()


if __name__ == "__main__":
    main()
