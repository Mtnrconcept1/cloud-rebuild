import { useEffect, useState, type FormEvent } from "react";
import { AlertCircle, CreditCard, FileText, Loader2, ShieldCheck, Upload } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  getSignupDocumentLabel,
  getSignupDocumentStatusMeta,
  getRequiredSignupDocuments,
  getSignupRestaurateurOnboardingSelection,
  getSignupRoleLabel,
  getSignupStatusMeta,
  isSignupRestaurateurOnboardingPaymentReady,
  type SignupApplication,
  type SignupDocumentType,
} from "@/lib/signup";

export type SignupApplicationCorrectionPayload = {
  fullName: string;
  phone: string;
  city: string;
  address: string;
  legalName: string;
  businessName: string;
  businessRegistrationNumber: string;
  taxId: string;
  restaurantName: string;
  restaurantDescription: string;
  iban: string;
  documentInputs: Partial<Record<SignupDocumentType, File | null>>;
};

type SignupApplicationStatusCardProps = {
  application: SignupApplication | null | undefined;
  title: string;
  emptyDescription: string;
  onStartRestaurantOnboardingPayment?: () => void;
  onboardingPaymentLoading?: boolean;
  onResubmitApplication?: (payload: SignupApplicationCorrectionPayload) => Promise<void> | void;
  resubmittingApplication?: boolean;
};

function getInitialCorrectionPayload(application: SignupApplication): SignupApplicationCorrectionPayload {
  return {
    fullName: application.full_name || "",
    phone: application.phone || "",
    city: application.city || "",
    address: application.address || "",
    legalName: application.legal_name || "",
    businessName: application.business_name || "",
    businessRegistrationNumber: application.business_registration_number || "",
    taxId: application.tax_id || "",
    restaurantName: application.restaurant_name || "",
    restaurantDescription: application.restaurant_description || "",
    iban: application.iban || "",
    documentInputs: {},
  };
}

function getEmptyCorrectionPayload(): SignupApplicationCorrectionPayload {
  return {
    fullName: "",
    phone: "",
    city: "",
    address: "",
    legalName: "",
    businessName: "",
    businessRegistrationNumber: "",
    taxId: "",
    restaurantName: "",
    restaurantDescription: "",
    iban: "",
    documentInputs: {},
  };
}

export default function SignupApplicationStatusCard({
  application,
  title,
  emptyDescription,
  onStartRestaurantOnboardingPayment,
  onboardingPaymentLoading = false,
  onResubmitApplication,
  resubmittingApplication = false,
}: SignupApplicationStatusCardProps) {
  const [correctionOpen, setCorrectionOpen] = useState(false);
  const [correctionForm, setCorrectionForm] = useState<SignupApplicationCorrectionPayload>(getEmptyCorrectionPayload);

  useEffect(() => {
    if (!application) {
      setCorrectionForm(getEmptyCorrectionPayload());
      setCorrectionOpen(false);
      return;
    }
    setCorrectionForm(getInitialCorrectionPayload(application));
    setCorrectionOpen(false);
  }, [application]);

  if (!application) {
    return (
      <Card className="tok-verification-card relative overflow-hidden rounded-3xl border-dashed border-primary/55 bg-card">
        <div className="pointer-events-none absolute right-6 top-1/2 hidden -translate-y-1/2 opacity-55 sm:block">
          <div className="relative h-28 w-32">
            <FileText className="absolute right-8 top-2 h-20 w-20 rotate-6 text-slate-400/45 dark:text-slate-200/28" />
            <div className="absolute bottom-1 right-2 flex h-12 w-12 items-center justify-center rounded-full border border-[#ff9f1c]/50 bg-[#ff6a1a]/18 text-[#ffb15c] shadow-[0_0_32px_rgba(255,106,26,0.42)]">
              <ShieldCheck className="h-6 w-6" />
            </div>
          </div>
        </div>
        <CardHeader className="relative z-10 p-6 sm:p-8">
          <CardTitle className="flex items-center gap-4 text-xl font-bold">
            <span className="tok-kpi-icon tok-tone-orange flex h-14 w-14 items-center justify-center rounded-2xl">
              <ShieldCheck className="h-6 w-6" />
            </span>
            {title}
          </CardTitle>
          <CardDescription className="max-w-2xl text-base leading-7 dark:text-slate-100/80">{emptyDescription}</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const statusMeta = getSignupStatusMeta(application.status);
  const documents = application.signup_application_documents || [];
  const onboardingSelection = getSignupRestaurateurOnboardingSelection(application);
  const onboardingPaymentReady = isSignupRestaurateurOnboardingPaymentReady(application);
  const onboardingPaymentStatus = typeof application.metadata?.onboarding_payment_status === "string"
    ? application.metadata.onboarding_payment_status
    : "payment_method_required";
  const onboardingInvoicePaid = onboardingPaymentStatus === "paid";
  const onboardingSubscriptionActive = ["paid", "active", "trialing"].includes(onboardingPaymentStatus);
  const onboardingPaymentRecoveryRequired = [
    "payment_failed",
    "payment_action_required",
    "past_due",
  ].includes(onboardingPaymentStatus);
  const canResubmitCorrection =
    application.requested_role === "restaurateur" && application.status === "needs_changes" && Boolean(onResubmitApplication);
  const restaurateurRequirements = getRequiredSignupDocuments("restaurateur");

  const updateCorrectionField = (field: keyof Omit<SignupApplicationCorrectionPayload, "documentInputs">, value: string) => {
    setCorrectionForm((current) => ({
      ...current,
      [field]: value,
    }));
  };

  const updateDocumentInput = (type: SignupDocumentType, file: File | null) => {
    setCorrectionForm((current) => ({
      ...current,
      documentInputs: {
        ...current.documentInputs,
        [type]: file,
      },
    }));
  };

  const handleCorrectionSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!onResubmitApplication) return;
    await onResubmitApplication(correctionForm);
    setCorrectionOpen(false);
  };

  return (
    <Card className="tok-dashboard-section relative overflow-hidden rounded-3xl border border-primary/25 bg-primary/5">
      <CardHeader className="space-y-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <ShieldCheck className="h-4 w-4 text-primary" />
              {title}
            </CardTitle>
            <CardDescription>
              Dossier {getSignupRoleLabel(application.requested_role).toLowerCase()} soumis le{" "}
              {application.submitted_at
                ? new Date(application.submitted_at).toLocaleDateString("fr-CH")
                : "récemment"}
            </CardDescription>
          </div>
          <Badge className={statusMeta.tone}>{statusMeta.label}</Badge>
        </div>
        <p className="text-sm text-muted-foreground">{statusMeta.description}</p>
      </CardHeader>
      <CardContent className="space-y-4">
        {onboardingSelection ? (
          <div className="rounded-xl border bg-background/80 p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="space-y-1">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <CreditCard className="h-4 w-4 text-primary" />
                  {onboardingSubscriptionActive
                    ? "Abonnement déjà démarré"
                    : onboardingPaymentRecoveryRequired
                      ? "Paiement de l’abonnement à relancer"
                      : "Facture d’abonnement réservée"}
                </div>
                <p className="text-sm text-muted-foreground">
                  {onboardingSubscriptionActive ? (
                    <>L’abonnement {onboardingSelection.subscriptionBillingPeriod === "yearly" ? "annuel" : "mensuel"} est déjà en cours.</>
                  ) : onboardingPaymentRecoveryRequired ? (
                    <>La première activité client a démarré l’abonnement, mais la facture est encore due. Enregistrez une carte valide pour relancer immédiatement le paiement.</>
                  ) : (
                    <>Abonnement {onboardingSelection.subscriptionBillingPeriod === "yearly" ? "annuel" : "mensuel"}
                      {" "}associé au dossier. Aucun débit n’est effectué avant la première réservation client ou la première commande.</>
                  )}
                </p>
              </div>
              <Badge className={onboardingPaymentReady ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}>
                {onboardingSubscriptionActive
                  ? "Abonnement actif"
                  : onboardingPaymentRecoveryRequired
                    ? "Paiement à relancer"
                  : onboardingInvoicePaid
                  ? "Facture payée"
                  : onboardingPaymentReady
                    ? "Carte enregistrée"
                    : "Carte à enregistrer"}
              </Badge>
            </div>
            {!onboardingPaymentReady
              && (application.status !== "approved" || onboardingPaymentRecoveryRequired)
              && onStartRestaurantOnboardingPayment ? (
              <Button
                type="button"
                className="mt-4 gap-2"
                onClick={onStartRestaurantOnboardingPayment}
                disabled={onboardingPaymentLoading}
              >
                {onboardingPaymentLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <CreditCard className="h-4 w-4" />}
                {onboardingPaymentRecoveryRequired
                  ? "Mettre à jour la carte et relancer le paiement"
                  : "Enregistrer la carte sans débit"}
              </Button>
            ) : null}
            {onboardingPaymentReady && !onboardingInvoicePaid && !onboardingSubscriptionActive ? (
              <p className="mt-3 text-xs font-medium text-emerald-700 dark:text-emerald-300">
                La carte est enregistrée et la formule choisie est scellée dans votre dossier. Aucun montant n’est bloqué ; l’abonnement démarrera automatiquement à la première activité client.
              </p>
            ) : null}
          </div>
        ) : null}

        {application.review_note ? (
          <div className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
            <div className="mb-1 flex items-center gap-2 font-medium">
              <AlertCircle className="h-4 w-4" />
              Note de revue
            </div>
            <p>{application.review_note}</p>
          </div>
        ) : null}

        {canResubmitCorrection ? (
          <div className="rounded-xl border border-amber-200 bg-background/90 p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="font-medium">Correction du dossier</p>
                <p className="pt-1 text-sm text-muted-foreground">
                  Modifiez les informations demandées par l'admin et remplacez uniquement les documents concernés.
                </p>
              </div>
              <Button type="button" variant="outline" onClick={() => setCorrectionOpen((current) => !current)}>
                {correctionOpen ? "Fermer" : "Corriger le dossier"}
              </Button>
            </div>

            {correctionOpen ? (
              <form className="mt-4 space-y-4" onSubmit={handleCorrectionSubmit}>
                <div className="grid gap-3 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor={`correction-full-name-${application.id}`}>Nom du responsable</Label>
                    <Input
                      id={`correction-full-name-${application.id}`}
                      value={correctionForm.fullName}
                      onChange={(event) => updateCorrectionField("fullName", event.target.value)}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor={`correction-phone-${application.id}`}>Téléphone</Label>
                    <Input
                      id={`correction-phone-${application.id}`}
                      value={correctionForm.phone}
                      onChange={(event) => updateCorrectionField("phone", event.target.value)}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor={`correction-city-${application.id}`}>Ville</Label>
                    <Input
                      id={`correction-city-${application.id}`}
                      value={correctionForm.city}
                      onChange={(event) => updateCorrectionField("city", event.target.value)}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor={`correction-address-${application.id}`}>Adresse</Label>
                    <Input
                      id={`correction-address-${application.id}`}
                      value={correctionForm.address}
                      onChange={(event) => updateCorrectionField("address", event.target.value)}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor={`correction-business-name-${application.id}`}>Nom commercial</Label>
                    <Input
                      id={`correction-business-name-${application.id}`}
                      value={correctionForm.businessName}
                      onChange={(event) => updateCorrectionField("businessName", event.target.value)}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor={`correction-legal-name-${application.id}`}>Raison sociale</Label>
                    <Input
                      id={`correction-legal-name-${application.id}`}
                      value={correctionForm.legalName}
                      onChange={(event) => updateCorrectionField("legalName", event.target.value)}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor={`correction-registration-${application.id}`}>Numéro d'immatriculation</Label>
                    <Input
                      id={`correction-registration-${application.id}`}
                      value={correctionForm.businessRegistrationNumber}
                      onChange={(event) => updateCorrectionField("businessRegistrationNumber", event.target.value)}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor={`correction-tax-id-${application.id}`}>Numéro TVA (optionnel)</Label>
                    <Input
                      id={`correction-tax-id-${application.id}`}
                      value={correctionForm.taxId}
                      onChange={(event) => updateCorrectionField("taxId", event.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor={`correction-restaurant-name-${application.id}`}>Nom du restaurant</Label>
                    <Input
                      id={`correction-restaurant-name-${application.id}`}
                      value={correctionForm.restaurantName}
                      onChange={(event) => updateCorrectionField("restaurantName", event.target.value)}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor={`correction-iban-${application.id}`}>IBAN de versement</Label>
                    <Input
                      id={`correction-iban-${application.id}`}
                      value={correctionForm.iban}
                      onChange={(event) => updateCorrectionField("iban", event.target.value)}
                      required
                    />
                  </div>
                  <div className="space-y-2 md:col-span-2">
                    <Label htmlFor={`correction-description-${application.id}`}>Description du restaurant</Label>
                    <Textarea
                      id={`correction-description-${application.id}`}
                      value={correctionForm.restaurantDescription}
                      onChange={(event) => updateCorrectionField("restaurantDescription", event.target.value)}
                    />
                  </div>
                </div>

                <div className="space-y-3">
                  <div>
                    <p className="text-sm font-medium">Documents à remplacer</p>
                    <p className="text-xs text-muted-foreground">
                      Les documents déjà soumis restent attachés au dossier si vous ne les remplacez pas.
                    </p>
                  </div>
                  <div className="grid gap-3 md:grid-cols-3">
                    {restaurateurRequirements.map((requirement) => {
                      const selectedFile = correctionForm.documentInputs[requirement.type];
                      return (
                        <label
                          key={requirement.type}
                          className="flex cursor-pointer flex-col gap-3 rounded-xl border border-dashed p-3 text-sm transition-colors hover:border-primary/50"
                        >
                          <span className="font-medium">{requirement.label}</span>
                          <span className="min-h-5 truncate text-xs text-muted-foreground">
                            {selectedFile ? selectedFile.name : "Conserver ou remplacer"}
                          </span>
                          <span className="inline-flex items-center gap-2 text-xs text-primary">
                            <Upload className="h-3.5 w-3.5" />
                            Uploader un nouveau document
                          </span>
                          <Input
                            type="file"
                            className="hidden"
                            accept={requirement.accept}
                            onChange={(event) => updateDocumentInput(requirement.type, event.target.files?.[0] || null)}
                            disabled={resubmittingApplication}
                          />
                        </label>
                      );
                    })}
                  </div>
                </div>

                <div className="flex flex-wrap justify-end gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setCorrectionForm(getInitialCorrectionPayload(application));
                      setCorrectionOpen(false);
                    }}
                    disabled={resubmittingApplication}
                  >
                    Annuler
                  </Button>
                  <Button type="submit" disabled={resubmittingApplication}>
                    {resubmittingApplication ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Envoi...
                      </>
                    ) : (
                      "Renvoyer le dossier"
                    )}
                  </Button>
                </div>
              </form>
            ) : null}
          </div>
        ) : null}

        <div className="space-y-2">
          <div className="flex items-center gap-2 text-sm font-medium">
            <FileText className="h-4 w-4 text-primary" />
            Documents de vérification
          </div>
          {documents.length > 0 ? (
            <div className="grid gap-2 md:grid-cols-2">
              {documents.map((document) => {
                const documentMeta = getSignupDocumentStatusMeta(document.status);
                return (
                  <div key={document.id} className="rounded-xl border bg-background/80 p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{getSignupDocumentLabel(document.document_type)}</p>
                        <p className="truncate text-xs text-muted-foreground">
                          {document.file_name || document.document_type}
                        </p>
                      </div>
                      <Badge className={documentMeta.tone}>{documentMeta.label}</Badge>
                    </div>
                    {document.rejection_reason ? (
                      <p className="pt-2 text-xs text-destructive">{document.rejection_reason}</p>
                    ) : null}
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
              Aucun document n'est encore rattache à ce dossier.
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
