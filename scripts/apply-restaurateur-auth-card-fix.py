from __future__ import annotations

from pathlib import Path
import textwrap


def replace_once(source: str, old: str, new: str, label: str) -> str:
    count = source.count(old)
    if count != 1:
        raise RuntimeError(f"{label}: expected one occurrence, found {count}")
    return source.replace(old, new, 1)


def replace_between(
    source: str,
    start_marker: str,
    end_marker: str,
    replacement: str,
    label: str,
) -> str:
    start = source.find(start_marker)
    if start < 0:
        raise RuntimeError(f"{label}: start marker not found")
    end = source.find(end_marker, start)
    if end < 0:
        raise RuntimeError(f"{label}: end marker not found")
    return source[:start] + replacement + source[end:]


def main() -> None:
    auth_path = Path("src/pages/Auth.tsx")
    auth = auth_path.read_text(encoding="utf-8")

    auth = replace_once(
        auth,
        textwrap.dedent(
            '''\
            import {
              createCheckoutWithRecovery,
              createPaymentAttemptOperationKey,
              getOrCreatePaymentAttemptId,
              markPaymentAttemptRedirected,
            } from "@/lib/paymentAttempt";
            import { LEGAL_ACCEPTANCE_VERSION } from "@/lib/legalDocuments";
            '''
        ),
        textwrap.dedent(
            '''\
            import {
              createCheckoutWithRecovery,
              createPaymentAttemptOperationKey,
              getOrCreatePaymentAttemptId,
              isPaymentAttemptIndeterminateError,
              markPaymentAttemptRedirected,
            } from "@/lib/paymentAttempt";
            import { LEGAL_ACCEPTANCE_VERSION } from "@/lib/legalDocuments";
            import {
              loadPrivilegedSignupRecoveryDraft,
              removePrivilegedSignupRecoveryDraft,
              savePrivilegedSignupRecoveryDraft,
            } from "@/lib/privilegedSignupRecovery";
            '''
        ),
        "Auth recovery imports",
    )

    auth = replace_once(
        auth,
        "const onboardingAttemptScope = (restaurantId: string) => `restaurant-onboarding:${restaurantId}`;\n",
        textwrap.dedent(
            '''\
            const onboardingAttemptScope = (restaurantId: string) => `restaurant-onboarding:${restaurantId}`;

            function buildSignupConfirmationRedirect(operationId?: string | null) {
              const redirect = new URL(getCanonicalAuthCallbackHref(), "https://www.thetok.ch");
              redirect.searchParams.set("confirmed", "1");
              if (operationId) redirect.searchParams.set("signup_operation_id", operationId);
              return redirect.toString();
            }
            '''
        ),
        "signup confirmation redirect helper",
    )

    checkout_anchor = "  const checkout = await createCheckoutWithRecovery({"
    checkout_start = auth.find(checkout_anchor)
    if checkout_start < 0:
        raise RuntimeError("card checkout block start not found")
    checkout_end = auth.find("\n  if (!checkout.url)", checkout_start)
    if checkout_end < 0:
        raise RuntimeError("card checkout block end not found")
    checkout_replacement = textwrap.dedent(
        '''\
          const checkout = await (async () => {
            try {
              return await createCheckoutWithRecovery({
                paymentAttemptId,
                create: async () => {
                  const { data, error } = await invokeSupabaseFunction("create-checkout", { body: checkoutPayload });
                  if (error) throw error;
                  return data;
                },
                getStatus: async () => {
                  const { data, error } = await invokeSupabaseFunction("payment-attempt-status", {
                    body: { payment_attempt_id: paymentAttemptId },
                  });
                  if (error) throw error;
                  return data;
                },
              });
            } catch (error) {
              if (isPaymentAttemptIndeterminateError(error)) {
                throw new Error(
                  "La demande d’enregistrement de carte est encore en cours de vérification. Aucun débit n’a été créé. Réessayez dans quelques instants.",
                );
              }
              throw error;
            }
          })();
        '''
    ).rstrip()
    auth = auth[:checkout_start] + checkout_replacement + auth[checkout_end:]

    auth = replace_once(
        auth,
        '  const requestedSubscriptionPlanSlug = String(searchParams.get("subscriptionPlan") || "").trim().toLowerCase();\n',
        textwrap.dedent(
            '''\
              const requestedSubscriptionPlanSlug = String(searchParams.get("subscriptionPlan") || "").trim().toLowerCase();
              const confirmationCompleted = searchParams.get("confirmed") === "1";
              const confirmationOperationId = String(searchParams.get("signup_operation_id") || "").trim();
            '''
        ),
        "confirmation query state",
    )

    auth = replace_once(
        auth,
        "  const incompleteSignupNoticeRef = useRef(false);\n",
        "  const incompleteSignupNoticeRef = useRef(false);\n  const confirmationNoticeShownRef = useRef(false);\n",
        "confirmation notice ref",
    )

    mount_effect = textwrap.dedent(
        '''\
          useEffect(() => {
            authMountedRef.current = true;
            return () => {
              authMountedRef.current = false;
            };
          }, []);
        '''
    )
    confirmation_effect = mount_effect + textwrap.dedent(
        '''\

          useEffect(() => {
            if (!confirmationCompleted || user) return;

            setPrivilegedSignupAwaitingEmail(false);
            setPrivilegedSignupResumeChecking(false);
            setIsLogin(true);
            setForgotPassword(false);

            if (!confirmationNoticeShownRef.current) {
              confirmationNoticeShownRef.current = true;
              toast({
                title: "Email confirmé",
                description: "Votre dossier restaurateur est conservé. La connexion finalisera automatiquement l’inscription.",
              });
            }

            if (!confirmationOperationId) return;
            let cancelled = false;
            void loadPrivilegedSignupRecoveryDraft(confirmationOperationId)
              .then((draft) => {
                if (!draft || cancelled) return;
                setSignupForm((current) => ({
                  ...current,
                  email: current.email || draft.email,
                }));
                setRoleMode(draft.role);
                privilegedSignupOperationRef.current = {
                  key: `${draft.email}:${draft.role}`,
                  id: draft.operationId,
                };
              })
              .catch(() => undefined);

            return () => {
              cancelled = true;
            };
          }, [confirmationCompleted, confirmationOperationId, toast, user]);
        '''
    )
    auth = replace_once(auth, mount_effect, confirmation_effect, "confirmation effect")

    redirect_literal = '        emailRedirectTo: `${getCanonicalAuthHref()}?confirmed=1`,\n'
    if auth.count(redirect_literal) != 2:
        raise RuntimeError(
            f"confirmation redirects: expected two occurrences, found {auth.count(redirect_literal)}"
        )
    auth = auth.replace(
        redirect_literal,
        textwrap.dedent(
            '''\
                    emailRedirectTo: buildSignupConfirmationRedirect(
                      privilegedSignupOperationRef.current?.id || confirmationOperationId || null,
                    ),
            '''
        ),
        1,
    )

    resume_start_marker = "    const resumePrivilegedSignup = async () => {"
    resume_end_marker = "\n\n    void resumePrivilegedSignup();"
    resume_start = auth.find(resume_start_marker)
    resume_end = auth.find(resume_end_marker, resume_start)
    if resume_start < 0 or resume_end < 0:
        raise RuntimeError("resume privileged signup block not found")
    new_resume = textwrap.dedent(
        '''\
            const resumePrivilegedSignup = async () => {
              setPrivilegedSignupSubmitting(true);
              try {
                const { data, error } = await supabase
                  .from("signup_application_drafts")
                  .select("operation_id, requested_role, safe_payload, status")
                  .eq("user_id", user.id)
                  .gt("expires_at", new Date().toISOString())
                  .maybeSingle();
                if (error) throw error;
                if (!data) {
                  setPrivilegedSignupResumeChecking(false);
                  return;
                }

                const draft = data as ServerSignupDraft;
                if (draft.status === "finalized") {
                  await removePrivilegedSignupRecoveryDraft(draft.operation_id).catch(() => false);
                  await refreshRoles();
                  navigateToPostAuthTarget(draft.requested_role, true);
                  return;
                }

                const safe = draft.safe_payload || {};
                const loadedRecovery = await loadPrivilegedSignupRecoveryDraft(draft.operation_id)
                  .catch(() => null);
                const recovery = loadedRecovery
                  && loadedRecovery.role === draft.requested_role
                  && (!user.email || loadedRecovery.email === user.email.trim().toLowerCase())
                  ? loadedRecovery
                  : null;
                const localForm = recovery?.form;
                const recoveredForm: SignupFormState = {
                  ...signupForm,
                  fullName: localForm?.fullName || signupForm.fullName || String(safe.full_name || user.user_metadata?.full_name || ""),
                  email: String(user.email || localForm?.email || signupForm.email || ""),
                  password: "",
                  phone: localForm?.phone || signupForm.phone,
                  city: localForm?.city || signupForm.city || String(safe.city || ""),
                  address: localForm?.address || signupForm.address,
                  businessName: localForm?.businessName || signupForm.businessName || String(safe.business_name || ""),
                  legalName: localForm?.legalName || signupForm.legalName,
                  businessRegistrationNumber: localForm?.businessRegistrationNumber || signupForm.businessRegistrationNumber,
                  taxId: localForm?.taxId || signupForm.taxId,
                  restaurantName: localForm?.restaurantName || signupForm.restaurantName || String(safe.restaurant_name || ""),
                  restaurantDescription: localForm?.restaurantDescription || signupForm.restaurantDescription || String(safe.restaurant_description || ""),
                  vehicleType: localForm?.vehicleType || signupForm.vehicleType || String(safe.vehicle_type || "bicycle"),
                  licensePlate: localForm?.licensePlate || signupForm.licensePlate,
                  iban: localForm?.iban || signupForm.iban,
                };
                const recoveredDocuments = recovery?.documents
                  ? { ...documents, ...recovery.documents }
                  : documents;
                const recoveredOnboardingChoices: RestaurateurOnboardingChoices | undefined =
                  draft.requested_role === "restaurateur"
                    ? {
                      subscriptionPlanId:
                        recovery?.onboardingChoices?.subscriptionPlanId
                        || String(safe.selected_subscription_plan_id || selectedSubscriptionPlanId || ""),
                      subscriptionBillingPeriod:
                        recovery?.onboardingChoices?.subscriptionBillingPeriod
                        || (safe.selected_subscription_billing_period === "yearly" ? "yearly" : selectedSubscriptionBillingPeriod),
                    }
                    : undefined;
                const acceptedAt = String(
                  recovery?.legalAcceptance.acceptedAt
                  || safe.legal_terms_accepted_at
                  || safe.privacy_policy_accepted_at
                  || "",
                );
                const recoveredLegalAccepted = Boolean(acceptedAt);
                const recoveredLegalAcceptance: SignupLegalAcceptance = {
                  termsAccepted: recoveredLegalAccepted,
                  privacyPolicyAccepted: recoveredLegalAccepted,
                  acceptedAt,
                  version: recovery?.legalAcceptance.version || LEGAL_ACCEPTANCE_VERSION,
                };
                const recoveredContractSignature = draft.requested_role === "restaurateur"
                  ? {
                    signerName: recovery?.contractSignature?.signerName || contractSignerName,
                    signatureDataUrl: recovery?.contractSignature?.signatureDataUrl || contractSignatureDataUrl,
                  }
                  : undefined;
                const recoveredReferralToken = recovery?.commercialReferralToken || commercialReferralToken;

                setRoleMode(draft.requested_role);
                setSignupForm(recoveredForm);
                setDocuments(recoveredDocuments);
                setLegalAccepted(recoveredLegalAccepted);
                setLegalAcceptanceDraft(recoveredLegalAccepted);
                if (recoveredOnboardingChoices) {
                  setSelectedSubscriptionPlanId(recoveredOnboardingChoices.subscriptionPlanId);
                  setSelectedSubscriptionBillingPeriod(recoveredOnboardingChoices.subscriptionBillingPeriod);
                }
                if (recoveredContractSignature) {
                  setContractSignerName(recoveredContractSignature.signerName);
                  setContractSignatureDataUrl(recoveredContractSignature.signatureDataUrl);
                }
                if (recoveredReferralToken) setCommercialReferralToken(recoveredReferralToken);
                privilegedSignupOperationRef.current = {
                  key: `${user.id}:${draft.requested_role}`,
                  id: draft.operation_id,
                };

                const missingDocuments = getMissingSignupDocuments(
                  getRequiredSignupDocuments(draft.requested_role, recoveredForm.vehicleType),
                  recoveredDocuments,
                );
                const missingForm = getSignupValidationError(
                  draft.requested_role,
                  recoveredForm,
                  recoveredOnboardingChoices,
                  recoveredLegalAccepted,
                  recoveredContractSignature,
                  false,
                );
                if (missingForm || missingDocuments.length > 0) {
                  setIsLogin(false);
                  throw new Error(
                    recovery
                      ? missingForm || `Documents manquants: ${missingDocuments.map((item) => item.label).join(", ")}.`
                      : "Le brouillon local sécurisé n’est pas disponible sur cet appareil. Complétez uniquement les informations ou documents manquants.",
                  );
                }

                const contractContentSha256 = draft.requested_role === "restaurateur" && recoveredContractSignature
                  ? await generateRestaurantPartnerContractSha256({
                    signerName: recoveredContractSignature.signerName.trim(),
                    signatureDataUrl: recoveredContractSignature.signatureDataUrl,
                    signedAt: recoveredLegalAcceptance.acceptedAt,
                    legalName: recoveredForm.legalName,
                    businessName: recoveredForm.businessName,
                    restaurantName: recoveredForm.restaurantName,
                    restaurateurAddress: recoveredForm.address,
                    restaurateurPhone: recoveredForm.phone,
                    businessRegistrationNumber: recoveredForm.businessRegistrationNumber,
                    taxId: recoveredForm.taxId,
                    city: recoveredForm.city,
                    signerRole: "Représentant autorisé",
                    signerEmail: recoveredForm.email,
                    userId: user.id,
                    acceptanceText: RESTAURANT_CONTRACT_ACCEPTANCE_TEXT,
                    selectedSubscriptionPlanLabel: recovery?.selectedSubscriptionPlanLabel || null,
                    selectedSubscriptionPriceLabel: recovery?.selectedSubscriptionPriceLabel || null,
                  })
                  : null;
                const resumePayload: SignupApplicationSubmission["payload"] = {
                  role: draft.requested_role,
                  form: getSignupApplicationForm(recoveredForm),
                  onboardingChoices: recoveredOnboardingChoices,
                  documents: recoveredDocuments,
                  legalAcceptance: recoveredLegalAcceptance,
                  contractSignature: recoveredContractSignature,
                  contractContentSha256,
                  commercialReferralToken:
                    draft.requested_role === "restaurateur" ? recoveredReferralToken || undefined : undefined,
                };

                await finalizeSignupApplication({
                  operationId: draft.operation_id,
                  userId: user.id,
                  payload: resumePayload,
                }, { skipIfExisting: true });
                await removePrivilegedSignupRecoveryDraft(draft.operation_id).catch(() => false);
                privilegedSignupOperationRef.current = null;
                try {
                  await refreshRoles();
                } catch {
                  // The authenticated RPC is authoritative; role state will refresh on the next page load.
                }

                if (cancelled) return;
                toast({
                  title: "Inscription enregistrée",
                  description: draft.requested_role === "restaurateur"
                    ? "Votre dossier est enregistré. Enregistrez maintenant votre carte pour débloquer la configuration du restaurant."
                    : "Votre compte est en attente de validation humaine.",
                });
                if (draft.requested_role === "restaurateur" && recoveredOnboardingChoices) {
                  await startRestaurantCardRegistrationAfterSignup(user.id, recoveredOnboardingChoices);
                  return;
                }
                navigateToPostAuthTarget(draft.requested_role, true);
              } catch (error) {
                if (cancelled) return;
                const message = error instanceof Error ? error.message : "Impossible de reprendre l'inscription.";
                toast({ title: "Inscription à reprendre", description: message, variant: "destructive" });
              } finally {
                privilegedSignupMutexRef.current = false;
                if (authMountedRef.current) {
                  setPrivilegedSignupSubmitting(false);
                  setPrivilegedSignupResumeChecking(false);
                }
              }
            };'''
    )
    auth = auth[:resume_start] + new_resume + auth[resume_end:]

    operation_block = textwrap.dedent(
        '''\
              if (isPrivilegedSignup) {
                privilegedSignupOperationRef.current = { key: operationKey, id: operationId };
              }

              if (!isContinuingConfirmedSignup) {
        '''
    )
    recovery_save_block = textwrap.dedent(
        '''\
              if (isPrivilegedSignup) {
                privilegedSignupOperationRef.current = { key: operationKey, id: operationId };
              }

              let recoveryDraftSaved = false;
              if (isPrivilegedSignup && !isContinuingConfirmedSignup) {
                try {
                  recoveryDraftSaved = await savePrivilegedSignupRecoveryDraft({
                    operationId,
                    role: submittedRole,
                    email: signupForm.email,
                    form: getSignupApplicationForm(signupForm),
                    onboardingChoices: submittedRole === "restaurateur" ? submittedOnboardingChoices : undefined,
                    documents,
                    legalAcceptance: {
                      acceptedAt: submittedLegalAcceptance.acceptedAt,
                      version: submittedLegalAcceptance.version,
                    },
                    contractSignature: submittedRole === "restaurateur" ? submittedContractSignature : undefined,
                    selectedSubscriptionPlanLabel: selectedSubscriptionPlan?.name || null,
                    selectedSubscriptionPriceLabel: selectedSubscriptionPrice == null
                      ? null
                      : formatChf(selectedSubscriptionPrice) + (
                        submittedOnboardingChoices.subscriptionBillingPeriod === "yearly"
                          ? " · annuel, 12 mois au prix de 11"
                          : " · mensuel"
                      ),
                    commercialReferralToken:
                      submittedRole === "restaurateur" ? commercialReferralToken || undefined : undefined,
                  });
                } catch {
                  recoveryDraftSaved = false;
                }
              }

              if (!isContinuingConfirmedSignup) {
        '''
    )
    auth = replace_once(auth, operation_block, recovery_save_block, "save local signup recovery")

    auth = auth.replace(
        redirect_literal,
        textwrap.dedent(
            '''\
                        emailRedirectTo: buildSignupConfirmationRedirect(
                          isPrivilegedSignup ? operationId : null,
                        ),
            '''
        ),
        1,
    )
    if redirect_literal in auth:
        raise RuntimeError("signup redirect replacement left an obsolete redirect")

    auth = replace_once(
        auth,
        "        if (signUpResponse.error) throw signUpResponse.error;\n",
        textwrap.dedent(
            '''\
                    if (signUpResponse.error) {
                      if (isPrivilegedSignup) {
                        await removePrivilegedSignupRecoveryDraft(operationId).catch(() => false);
                      }
                      throw signUpResponse.error;
                    }
            '''
        ),
        "signup recovery cleanup on error",
    )

    no_session_start = auth.find("      if (!activeSession) {")
    no_session_end = auth.find("\n\n      await finalizeSignupApplication({", no_session_start)
    if no_session_start < 0 or no_session_end < 0:
        raise RuntimeError("unconfirmed signup block not found")
    no_session_replacement = textwrap.dedent(
        '''\
              if (!activeSession) {
                // The submit lock only protects account/draft creation. Release it
                // before auth state changes so the confirmation effect can resume.
                privilegedSignupMutexRef.current = false;
                setPrivilegedSignupSubmitting(false);
                setPrivilegedSignupResumeChecking(false);
                setPrivilegedSignupAwaitingEmail(isPrivilegedSignup);
                toast({
                  title: "Compte créé",
                  description: isPrivilegedSignup
                    ? recoveryDraftSaved
                      ? "Confirmez votre email. TOK restaurera automatiquement le dossier sur cet appareil, même si le lien s’ouvre dans un nouvel onglet."
                      : "Confirmez votre email. Gardez cet onglet ouvert, car le stockage local sécurisé est indisponible."
                    : "Vérifiez votre email pour confirmer votre compte.",
                });
                return;
              }
        '''
    ).rstrip()
    auth = auth[:no_session_start] + no_session_replacement + auth[no_session_end:]

    auth = replace_once(
        auth,
        textwrap.dedent(
            '''\
              if (isPrivilegedSignup) {
                privilegedSignupOperationRef.current = null;
              }
            '''
        ),
        textwrap.dedent(
            '''\
              if (isPrivilegedSignup) {
                await removePrivilegedSignupRecoveryDraft(operationId).catch(() => false);
                privilegedSignupOperationRef.current = null;
              }
            '''
        ),
        "clear completed local recovery",
    )

    confirmation_notice_marker = "          {isLogin && (postAuthRedirectTarget || searchParams.get(\"domain\") === \"required\") ? ("
    confirmation_notice = textwrap.dedent(
        '''\
                  {confirmationCompleted && !user ? (
                    <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-950">
                      <p className="font-medium">Adresse email confirmée</p>
                      <p className="pt-1 text-emerald-800">
                        Connectez-vous si la session ne s’est pas ouverte automatiquement. Le dossier restaurateur sera restauré sans ressaisie.
                      </p>
                    </div>
                  ) : null}
        '''
    ) + confirmation_notice_marker
    auth = replace_once(
        auth,
        confirmation_notice_marker,
        confirmation_notice,
        "confirmed email notice",
    )

    awaiting_old = textwrap.dedent(
        '''\
                      {privilegedSignupAwaitingEmail && !session ? (
                        <p className="text-center text-sm text-muted-foreground" role="status">
                          Confirmez votre email. Gardez cet onglet ouvert pour reprendre automatiquement le dossier,
                          ou reconnectez-vous ensuite pour le finaliser.
                        </p>
                      ) : null}
        '''
    )
    awaiting_new = textwrap.dedent(
        '''\
                      {privilegedSignupAwaitingEmail && !session ? (
                        <div className="space-y-3 rounded-xl border border-sky-200 bg-sky-50 p-4 text-sm text-sky-950" role="status">
                          <p>
                            Confirmez votre email. Votre formulaire et vos documents restent conservés localement sur cet appareil.
                          </p>
                          <div className="grid gap-2 sm:grid-cols-2">
                            <Button
                              type="button"
                              variant="secondary"
                              onClick={() => {
                                setPrivilegedSignupAwaitingEmail(false);
                                setIsLogin(true);
                                setForgotPassword(false);
                              }}
                            >
                              J’ai confirmé mon email
                            </Button>
                            <Button
                              type="button"
                              variant="outline"
                              onClick={handleResendConfirmationEmail}
                              disabled={loading || resendLoading}
                            >
                              {resendLoading ? "Envoi..." : "Renvoyer l’email"}
                            </Button>
                          </div>
                        </div>
                      ) : null}
        '''
    )
    auth = replace_once(auth, awaiting_old, awaiting_new, "waiting confirmation actions")

    auth = replace_once(
        auth,
        "              {isLogin && !forgotPassword && !isDemoAuthMode ? (\n",
        "              {isLogin && !forgotPassword && !isDemoAuthMode && !confirmationCompleted ? (\n",
        "hide resend after confirmation",
    )

    auth_path.write_text(auth, encoding="utf-8")

    checkout_path = Path("supabase/functions/create-checkout/index.ts")
    checkout = checkout_path.read_text(encoding="utf-8")
    checkout = replace_once(
        checkout,
        '    if (isRestaurantOnboardingSetup) {\n      sessionParams.mode = "setup";\n      sessionParams.setup_intent_data = {',
        '    if (isRestaurantOnboardingSetup) {\n      sessionParams.mode = "setup";\n      sessionParams.currency = CHECKOUT_CURRENCY.toLowerCase();\n      sessionParams.setup_intent_data = {',
        "Stripe setup currency",
    )
    checkout_path.write_text(checkout, encoding="utf-8")

    focused_test_path = Path("src/test/restaurateur-onboarding-reliability.test.ts")
    focused_test_path.write_text(
        textwrap.dedent(
            '''\
            import { readFileSync } from "node:fs";
            import { resolve } from "node:path";
            import { describe, expect, it } from "vitest";

            const root = process.cwd();
            const read = (path: string) => readFileSync(resolve(root, path), "utf8");

            describe("restaurateur onboarding reliability", () => {
              it("restores the privileged form after confirmation without persisting a password", () => {
                const auth = read("src/pages/Auth.tsx");
                const recovery = read("src/lib/privilegedSignupRecovery.ts");

                expect(auth).toContain("buildSignupConfirmationRedirect");
                expect(auth).toContain("getCanonicalAuthCallbackHref");
                expect(auth).toContain("savePrivilegedSignupRecoveryDraft");
                expect(auth).toContain("loadPrivilegedSignupRecoveryDraft");
                expect(auth).toContain("recoveredForm");
                expect(auth).toContain("recoveredDocuments");
                expect(auth).toContain("J’ai confirmé mon email");
                expect(recovery).toContain('DATABASE_NAME = "tok-privileged-signup-recovery"');
                expect(recovery).not.toMatch(/password\\s*:/i);
              });

              it("sets the currency required by Stripe setup-mode checkout", () => {
                const checkout = read("supabase/functions/create-checkout/index.ts");
                expect(checkout).toContain('sessionParams.mode = "setup"');
                expect(checkout).toContain("sessionParams.currency = CHECKOUT_CURRENCY.toLowerCase()");
                expect(checkout.indexOf("sessionParams.currency = CHECKOUT_CURRENCY.toLowerCase()"))
                  .toBeGreaterThan(checkout.indexOf('sessionParams.mode = "setup"'));
              });
            });
            '''
        ),
        encoding="utf-8",
    )


if __name__ == "__main__":
    main()
