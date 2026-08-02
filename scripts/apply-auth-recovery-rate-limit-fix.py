from pathlib import Path

path = Path('src/pages/Auth.tsx')
source = path.read_text(encoding='utf-8')

old_ref = '''  const confirmationNoticeShownRef = useRef(false);'''
new_ref = '''  const confirmationNoticeShownRef = useRef(false);
  const passwordRecoveryRequestRef = useRef(false);'''
if old_ref not in source:
    raise SystemExit('auth ref anchor not found')
source = source.replace(old_ref, new_ref, 1)

old_handler = '''  const handleResetPassword = async () => {
    if (!signupForm.email.trim()) {
      toast({ title: "Entrez votre email", variant: "destructive" });
      return;
    }
    if (isCaptchaEnabled() && !captchaToken) {
      toast({
        title: "Validation requise",
        description: "Validez le contrôle anti-abus avant de continuer.",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);
    const { error } = await supabase.auth.resetPasswordForEmail(
      signupForm.email,
      {
        redirectTo: isDemoAuthMode
          ? `${window.location.origin}/auth/demo`
          : getCanonicalAuthHref(),
        captchaToken: captchaToken || undefined,
      },
    );

    if (error) {
      toast({
        title: "Erreur",
        description: error.message,
        variant: "destructive",
      });
    } else {
      toast({
        title: "Email envoyé",
        description:
          "Consultez votre boite mail pour reinitialiser votre mot de passe.",
      });
      setForgotPassword(false);
    }
    setLoading(false);
  };'''

new_handler = '''  const handleResetPassword = async () => {
    if (passwordRecoveryRequestRef.current) return;

    const normalizedEmail = signupForm.email.trim().toLowerCase();
    if (!normalizedEmail) {
      toast({ title: "Entrez votre email", variant: "destructive" });
      return;
    }
    if (isCaptchaEnabled() && !captchaToken) {
      toast({
        title: "Validation requise",
        description: "Validez le contrôle anti-abus avant de continuer.",
        variant: "destructive",
      });
      return;
    }

    passwordRecoveryRequestRef.current = true;
    setLoading(true);
    setSignupForm((current) => ({ ...current, email: normalizedEmail }));

    try {
      const { error } = await supabase.auth.resetPasswordForEmail(
        normalizedEmail,
        {
          redirectTo: isDemoAuthMode
            ? `${window.location.origin}/auth/demo`
            : getCanonicalAuthHref(),
          captchaToken: captchaToken || undefined,
        },
      );

      if (error) {
        const isRateLimited =
          error.status === 429 ||
          /rate limit|too many requests|email rate/i.test(error.message);
        toast({
          title: isRateLimited ? "Trop de demandes" : "Envoi impossible",
          description: isRateLimited
            ? "Un email a déjà été demandé récemment. Attendez quelques minutes avant de réessayer et utilisez uniquement le dernier lien reçu."
            : error.message,
          variant: "destructive",
        });
        return;
      }

      toast({
        title: "Email envoyé",
        description:
          "Consultez votre boîte mail pour réinitialiser votre mot de passe. Une nouvelle demande sera temporairement bloquée pour éviter les doublons.",
      });
      setForgotPassword(false);
    } finally {
      passwordRecoveryRequestRef.current = false;
      setLoading(false);
    }
  };'''

if old_handler not in source:
    raise SystemExit('reset password handler anchor not found')
source = source.replace(old_handler, new_handler, 1)
path.write_text(source, encoding='utf-8')

# Add focused source-contract tests.
test_path = Path('src/test/auth-password-recovery.test.ts')
test_path.write_text('''import fs from "node:fs";\nimport { describe, expect, it } from "vitest";\n\nconst auth = fs.readFileSync("src/pages/Auth.tsx", "utf8");\n\ndescribe("password recovery hardening", () => {\n  it("normalizes email before calling Supabase", () => {\n    expect(auth).toContain("signupForm.email.trim().toLowerCase()");\n    expect(auth).toContain("resetPasswordForEmail(\\n        normalizedEmail");\n  });\n\n  it("blocks duplicate in-flight requests", () => {\n    expect(auth).toContain("passwordRecoveryRequestRef.current");\n    expect(auth).toContain("if (passwordRecoveryRequestRef.current) return");\n  });\n\n  it("shows a dedicated rate-limit message", () => {\n    expect(auth).toContain("error.status === 429");\n    expect(auth).toContain("Trop de demandes");\n    expect(auth).toContain("Attendez quelques minutes");\n  });\n});\n''', encoding='utf-8')
