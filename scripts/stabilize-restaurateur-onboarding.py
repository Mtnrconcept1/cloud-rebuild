from __future__ import annotations

from pathlib import Path
import textwrap


def require_single(source: str, needle: str, label: str) -> int:
    count = source.count(needle)
    if count != 1:
        raise RuntimeError(f"{label}: expected one occurrence, found {count}")
    return source.index(needle)


def stabilize_auth_recovery() -> None:
    path = Path("src/pages/Auth.tsx")
    source = path.read_text(encoding="utf-8")

    resume_marker = "    const resumePrivilegedSignup = async () => {"
    resume_start = require_single(source, resume_marker, "resume privileged signup")
    resume_end = source.index("\n\n    void resumePrivilegedSignup();", resume_start)

    state_marker = "        setRoleMode(draft.requested_role);"
    state_start = source.index(state_marker, resume_start, resume_end)
    operation_ref_start = source.index(
        "        privilegedSignupOperationRef.current = {",
        state_start,
        resume_end,
    )
    state_block = source[state_start:operation_ref_start].rstrip()
    source = source[:state_start] + source[operation_ref_start:]

    missing_marker = "        if (missingForm || missingDocuments.length > 0) {"
    missing_start = source.index(missing_marker, resume_start, resume_end)
    missing_end = source.index(
        "\n\n        const contractContentSha256",
        missing_start,
        resume_end,
    )
    missing_replacement = (
        missing_marker
        + "\n"
        + textwrap.indent(state_block, "  ")
        + "\n          setIsLogin(false);\n"
        + "          const resumeMessage = recovery\n"
        + "            ? missingForm || `Documents manquants: ${missingDocuments.map((item) => item.label).join(\", \")}.`\n"
        + "            : \"Le brouillon local sécurisé n’est pas disponible sur cet appareil. Complétez uniquement les informations ou documents manquants.\";\n"
        + "          toast({\n"
        + "            title: \"Inscription à reprendre\",\n"
        + "            description: resumeMessage,\n"
        + "            variant: \"destructive\",\n"
        + "          });\n"
        + "          return;\n"
        + "        }"
    )
    source = source[:missing_start] + missing_replacement + source[missing_end:]

    finalize_start = source.index(
        "        await finalizeSignupApplication({",
        missing_start,
        resume_end,
    )
    finalize_end = source.index(
        "\n        await removePrivilegedSignupRecoveryDraft",
        finalize_start,
        resume_end,
    )
    finalize_replacement = textwrap.dedent(
        '''\
                const finalizeRecoveredSignup = () =>
                  finalizeSignupApplication(
                    {
                      operationId: draft.operation_id,
                      userId: user.id,
                      payload: resumePayload,
                    },
                    { skipIfExisting: true },
                  );
                try {
                  await finalizeRecoveredSignup();
                } catch (resumeError) {
                  if (cancelled) return;
                  const resumeMessage = resumeError instanceof Error
                    ? resumeError.message
                    : "La première reprise de l’inscription a échoué.";
                  toast({
                    title: "Inscription à reprendre",
                    description: resumeMessage,
                    variant: "destructive",
                  });
                  await finalizeRecoveredSignup();
                }
        '''
    ).rstrip()
    source = source[:finalize_start] + finalize_replacement + source[finalize_end:]

    path.write_text(source, encoding="utf-8")


def clarify_dashboard_card_copy() -> None:
    path = Path("src/pages/dashboard/DashboardHome.tsx")
    source = path.read_text(encoding="utf-8")

    source = source.replace(
        '"Le paiement est en cours de vérification. Reprenez la même tentative dans quelques secondes."',
        '"L’enregistrement de la carte est en cours de vérification. Aucun débit n’a été créé. Réessayez dans quelques instants."',
    )
    source = source.replace(
        'title: "Paiement en cours de vérification"',
        'title: "Enregistrement de carte en cours"',
    )
    source = source.replace(
        'title: isPaymentAttemptIndeterminateError(error) ? "Paiement en cours de vérification" : "Paiement impossible",',
        'title: isPaymentAttemptIndeterminateError(error) ? "Enregistrement de carte en cours" : "Enregistrement de carte impossible",',
    )
    source = source.replace(
        'description: "Reprenez la même tentative pour éviter tout doublon."',
        'description: "La demande est encore en cours de vérification. Aucun débit n’a été créé. Réessayez dans quelques instants."',
    )

    if "Paiement en cours de vérification" in source:
        raise RuntimeError("generic payment recovery copy remains in DashboardHome")
    if "Enregistrement de carte en cours" not in source:
        raise RuntimeError("card-specific recovery copy was not installed")
    if "Aucun débit n’a été créé" not in source:
        raise RuntimeError("no-debit recovery explanation was not installed")

    path.write_text(source, encoding="utf-8")


def stabilize_checkout_assertion() -> None:
    path = Path("src/test/restaurant-onboarding-payments.test.ts")
    source = path.read_text(encoding="utf-8")
    needle = 'if (!signupApplicationId) throw new HttpError(400, "signup_application_id requis")'
    stable = '    expect(checkout).toContain("signup_application_id requis");'

    if needle in source:
        assertion_start = source.rfind("    expect(checkout).toContain(", 0, source.index(needle))
        if assertion_start < 0:
            raise RuntimeError("checkout validation assertion start was not found")
        assertion_end = source.index(");", source.index(needle)) + 2
        source = source[:assertion_start] + stable + source[assertion_end:]
    elif stable not in source:
        raise RuntimeError("checkout validation assertion was not found")

    path.write_text(source, encoding="utf-8")


def ensure_card_copy_regression_test() -> None:
    path = Path("src/test/restaurateur-onboarding-reliability.test.ts")
    source = path.read_text(encoding="utf-8")
    title = '  it("uses card-specific recovery copy without suggesting a debit", () => {'
    if title in source:
        return

    marker = '  it("sets the currency required by Stripe setup-mode checkout", () => {'
    if marker not in source:
        raise RuntimeError("focused Stripe setup test marker was not found")
    addition = textwrap.dedent(
        '''\
          it("uses card-specific recovery copy without suggesting a debit", () => {
            const dashboard = read("src/pages/dashboard/DashboardHome.tsx");
            expect(dashboard).toContain("Enregistrement de carte en cours");
            expect(dashboard).toContain("Aucun débit n’a été créé");
            expect(dashboard).not.toContain("Paiement en cours de vérification");
          });

        '''
    )
    source = source.replace(marker, addition + marker, 1)
    path.write_text(source, encoding="utf-8")


def main() -> None:
    stabilize_auth_recovery()
    clarify_dashboard_card_copy()
    stabilize_checkout_assertion()
    ensure_card_copy_regression_test()


if __name__ == "__main__":
    main()
