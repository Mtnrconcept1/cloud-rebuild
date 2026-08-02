import { FormEvent, useMemo, useState } from "react";
import { Eye, EyeOff, KeyRound, Loader2 } from "lucide-react";
import { getSupabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const supabase = getSupabase();
const MIN_PASSWORD_LENGTH = 10;

type AccountPasswordFormProps = {
  recovery?: boolean;
  disabled?: boolean;
  onSuccess?: () => void | Promise<void>;
};

function getPasswordError(password: string, confirmation: string) {
  if (password.length < MIN_PASSWORD_LENGTH) {
    return `Le mot de passe doit contenir au moins ${MIN_PASSWORD_LENGTH} caractères.`;
  }
  if (!/[a-z]/.test(password) || !/[A-Z]/.test(password) || !/[0-9]/.test(password)) {
    return "Utilisez au moins une minuscule, une majuscule et un chiffre.";
  }
  if (password !== confirmation) return "Les deux mots de passe ne correspondent pas.";
  return null;
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
  const validationError = useMemo(
    () => (password || confirmation ? getPasswordError(password, confirmation) : null),
    [confirmation, password],
  );

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
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;

      setPassword("");
      setConfirmation("");
      toast({
        title: "Mot de passe mis à jour",
        description: recovery
          ? "Votre nouveau mot de passe est enregistré. Reconnectez-vous pour continuer."
          : "Votre nouveau mot de passe est actif immédiatement.",
      });
      await onSuccess?.();
    } catch (error) {
      toast({
        title: "Modification impossible",
        description: error instanceof Error ? error.message : "Une erreur est survenue.",
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
        {validationError || "10 caractères minimum, avec une majuscule, une minuscule et un chiffre."}
      </p>

      <Button type="submit" className="w-full" disabled={disabled || submitting}>
        {submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <KeyRound className="mr-2 h-4 w-4" />}
        {recovery ? "Enregistrer et revenir à la connexion" : "Changer mon mot de passe"}
      </Button>
    </form>
  );
}
