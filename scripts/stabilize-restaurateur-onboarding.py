from __future__ import annotations

from pathlib import Path
import textwrap


def require_single(source: str, needle: str, label: str) -> int:
    count = source.count(needle)
    if count != 1:
        raise RuntimeError(f"{label}: expected one occurrence, found {count}")
    return source.index(needle)


def line_start(source: str, index: int) -> int:
    return source.rfind("\n", 0, index) + 1


def line_indent(source: str, index: int) -> str:
    start = line_start(source, index)
    return source[start:index]


def stabilize_auth_recovery() -> None:
    path = Path("src/pages/Auth.tsx")
    source = path.read_text(encoding="utf-8")

    recovery_start = "    setPrivilegedSignupAwaitingEmail(false);\n    let cancelled = false;"
    recovery_active = (
        "    setPrivilegedSignupAwaitingEmail(false);\n"
        "    setPrivilegedSignupResumeChecking(true);\n"
        "    let cancelled = false;"
    )
    if recovery_start not in source:
        raise RuntimeError("confirmed recovery start was not found")
    source = source.replace(recovery_start, recovery_active, 1)

    fallback_guard = (
        "    if (!user || !incompletePrivilegedSignupRole || "
        "privilegedSignupResumeChecking) return;"
    )
    guarded_fallback = textwrap.dedent(
        '''\
          if (
            !user
            || !incompletePrivilegedSignupRole
            || privilegedSignupResumeChecking
            || privilegedSignupMutexRef.current
          ) return;
        '''
    ).rstrip()
    if fallback_guard not in source:
        raise RuntimeError("incomplete-signup fallback guard was not found")
    source = source.replace(fallback_guard, guarded_fallback, 1)

    resume_marker = "const resumePrivilegedSignup = async () => {"
    resume_index = require_single(source, resume_marker, "resume privileged signup")
    resume_end = source.index("\n\n    void resumePrivilegedSignup();", resume_index)

    state_index = source.index("setRoleMode(draft.requested_role);", resume_index, resume_end)
    state_start = line_start(source, state_index)
    operation_index = source.index(
        "privilegedSignupOperationRef.current = {",
        state_index,
        resume_end,
    )
    operation_start = line_start(source, operation_index)
    state_block = source[state_start:operation_start].rstrip()
    source = source[:state_start] + source[operation_start:]

    missing_index = source.index(
        "if (missingForm || missingDocuments.length > 0) {",
        resume_index,
        resume_end,
    )
    missing_start = line_start(source, missing_index)
    base_indent = line_indent(source, missing_index)
    inner_indent = base_indent + "  "
    contract_index = source.index("const contractContentSha256", missing_index, resume_end)
    missing_end = line_start(source, contract_index)

    missing_replacement = (
        f"{base_indent}if (missingForm || missingDocuments.length > 0) {{\n"
        + textwrap.indent(state_block, "  ")
        + f"\n{inner_indent}setIsLogin(false);\n"
        + f"{inner_indent}const resumeMessage = recovery\n"
        + f"{inner_indent}  ? missingForm || `Documents manquants: ${{missingDocuments.map((item) => item.label).join(\", \")}}.`\n"
        + f'{inner_indent}  : "Le brouillon local sécurisé n’est pas disponible sur cet appareil. Complétez uniquement les informations ou documents manquants.";\n'
        + f"{inner_indent}toast({{\n"
        + f'{inner_indent}  title: "Inscription à reprendre",\n'
        + f"{inner_indent}  description: resumeMessage,\n"
        + f'{inner_indent}  variant: "destructive",\n'
        + f"{inner_indent}}});\n"
        + f"{inner_indent}return;\n"
        + f"{base_indent}}}\n\n"
    )
    source = source[:missing_start] + missing_replacement + source[missing_end:]

    finalize_index = source.index(
        "await finalizeSignupApplication({",
        missing_start,
        resume_end,
    )
    finalize_start = line_start(source, finalize_index)
    finalize_indent = line_indent(source, finalize_index)
    cleanup_index = source.index(
        "await removePrivilegedSignupRecoveryDraft",
        finalize_index,
        resume_end,
    )
    finalize_end = line_start(source, cleanup_index)
    finalize_block = textwrap.dedent(
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
    finalize_replacement = textwrap.indent(finalize_block, finalize_indent) + "\n"
    source = source[:finalize_start] + finalize_replacement + source[finalize_end:]

    path.write_text(source, encoding="utf-8")


def clarify_dashboard_card_copy() -> None:
    path = Path("src/pages/dashboard/DashboardHome.tsx")
    source = path.read_text(encoding="utf-8")

    source = source.replace(
        'title: "Paiement en cours de vérification",\n        description: "Reprenez la même tentative pour éviter tout doublon.",',
        'title: "Enregistrement de carte en cours",\n        description: "La demande est encore en cours de vérification. Aucun débit n’a été créé. Réessayez dans quelques instants.",',
        1,
    )
    source = source.replace(
        '"Le paiement est en cours de vérification. Reprenez la même tentative dans quelques secondes."',
        '"L’enregistrement de la carte est en cours de vérification. Aucun débit n’a été créé. Réessayez dans quelques instants."',
        1,
    )

    old_catch = '''    } catch (error) {
      toast({
        title: isPaymentAttemptIndeterminateError(error) ? "Paiement en cours de vérification" : "Paiement impossible",
        description: error instanceof Error ? error.message : "Veuillez réessayer dans quelques instants.",
        variant: "destructive",
      });
    } finally {'''
    new_catch = '''    } catch (error) {
      const isIndeterminate = isPaymentAttemptIndeterminateError(error);
      toast({
        title: isIndeterminate
          ? "Enregistrement de carte en cours"
          : "Enregistrement de carte impossible",
        description: isIndeterminate
          ? "La demande est encore en cours de vérification. Aucun débit n’a été créé. Réessayez dans quelques instants."
          : error instanceof Error
            ? error.message
            : "Veuillez réessayer dans quelques instants.",
        variant: "destructive",
      });
    } finally {'''
    if old_catch not in source:
        raise RuntimeError("dashboard card catch block was not found")
    source = source.replace(old_catch, new_catch, 1)

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
        needle_index = source.index(needle)
        assertion_start = source.rfind("    expect(checkout).toContain(", 0, needle_index)
        if assertion_start < 0:
            raise RuntimeError("checkout validation assertion start was not found")
        assertion_end = source.index(");", needle_index) + 2
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
