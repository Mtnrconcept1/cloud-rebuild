import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Bike, BriefcaseBusiness, ChefHat, CreditCard, Eye, EyeOff, FileText, Loader2, Shield, ShoppingBag, Upload } from "lucide-react";

import { getSupabase } from "@/integrations/supabase/client";
import { useAuth, type UserRole } from "@/lib/auth-context";
import { useFeatureFlagSnapshot } from "@/lib/featureFlags";
import {
  FAIR_GROWTH_ANNUAL_MONTHS_CHARGED,
  getFairGrowthPlan,
} from "@/lib/fairGrowth";
import { normalizeInternalNavigationTarget } from "@/lib/navigation";
import { openSafeHtmlPrintDocument } from "@/lib/safePrintWindow";
import { getDefaultActiveRole, getFeatureVisibleRoles } from "@/lib/roleAccess";
import {
  formatTokCredits,
  getAiSimpleRequestEquivalent,
  getCampaignEquivalentChf,
  getPhotoSimpleEquivalent,
  getTokCreditAmount,
} from "@/lib/tokCredits";
import {
  getMissingSignupDocuments,
  getRequiredSignupDocuments,
  SIGNUP_ROLE_META,
  uploadVerificationDocument,
  type SignupDocumentType,
  type SignupSubscriptionBillingPeriod,
  type SignupRole,
  type UploadedSignupDocument,
} from "@/lib/signup";
import {
  RESTAURANT_PARTNER_CONTRACT_SECTIONS,
  RESTAURANT_PARTNER_CONTRACT_TITLE,
  RESTAURANT_PARTNER_CONTRACT_VERSION,
  generateRestaurantPartnerContractSha256,
  generateSignedRestaurantPartnerContractHtml,
} from "@/lib/restaurantPartnerContract";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import AddressAutocomplete from "@/components/AddressAutocomplete";
import CityAutocomplete from "@/components/CityAutocomplete";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { useSeoMeta } from "@/hooks/useSeoMeta";
import { useTokLogoSrc } from "@/hooks/useTokLogo";
import { COURIER_VEHICLE_OPTIONS } from "@/lib/courier";
import TurnstileCaptcha from "@/components/security/TurnstileCaptcha";
import { isCaptchaEnabled } from "@/lib/captcha";
import {
  buildSanitizedAuthRedirectUrl,
  getSupabaseAuthRedirectState,
} from "@/lib/authRedirect";
import { getPostAuthTargetForRole } from "@/lib/authPostLogin";
import { isCommercialAppHost } from "@/lib/commercialDomains";

const supabase = getSupabase();
const LEGAL_ACCEPTANCE_VERSION = "2026-07-18-fair-growth-v3";

type SignupFormState = {
  fullName: string;
  email: string;
  password: string;
  phone: string;
  city: string;
  address: string;
  businessName: string;
  legalName: string;
  businessRegistrationNumber: string;
  taxId: string;
  restaurantName: string;
  restaurantDescription: string;
  vehicleType: string;
  licensePlate: string;
  iban: string;
};

type RestaurateurOnboardingChoices = {
  subscriptionPlanId: string;
  subscriptionBillingPeriod: SignupSubscriptionBillingPeriod;
};

type RestaurateurContractSignature = {
  signerName: string;
  signatureDataUrl: string;
};

type SignupLegalAcceptance = {
  termsAccepted: boolean;
  privacyPolicyAccepted: boolean;
  acceptedAt: string;
  version: string;
};

type RestaurantSubscriptionPlanOption = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  price_monthly_chf: number;
  campaign_credit_chf: number;
  ai_tool_credits: number;
  ai_photo_credits: number;
  monthly_image_limit: number;
  monthly_premium_image_limit: number;
};

const ROLE_CONFIG: Record<
  UserRole,
  {
    label: string;
    desc: string;
    icon: typeof ShoppingBag;
    to: string;
    color: string;
  }
> = {
  client: {
    label: "Client",
    desc: "Commander et découvrir des restaurants",
    icon: ShoppingBag,
    to: "/",
    color: "border-primary bg-primary/5 text-primary",
  },
  restaurateur: {
    label: "Restaurateur",
    desc: "Gérer mon restaurant et mes commandes",
    icon: ChefHat,
    to: "/dashboard",
    color: "border-amber-500 bg-amber-500/5 text-amber-600",
  },
  admin: {
    label: "Administration",
    desc: "Back-office et gestion de la plateforme",
    icon: Shield,
    to: "/admin",
    color: "border-red-500 bg-red-500/5 text-red-600",
  },
  courier: {
    label: "Livreur",
    desc: "Mes livraisons et mes revenus",
    icon: Bike,
    to: "/courier",
    color: "border-emerald-500 bg-emerald-500/5 text-emerald-600",
  },
  commercial: {
    label: "Commercial",
    desc: "Carte de prospection terrain",
    icon: BriefcaseBusiness,
    to: "/commercial",
    color: "border-sky-500 bg-sky-500/5 text-sky-700",
  },
};

const EMPTY_SIGNUP_FORM: SignupFormState = {
  fullName: "",
  email: "",
  password: "",
  phone: "",
  city: "",
  address: "",
  businessName: "",
  legalName: "",
  businessRegistrationNumber: "",
  taxId: "",
  restaurantName: "",
  restaurantDescription: "",
  vehicleType: "bicycle",
  licensePlate: "",
  iban: "",
};

function formatChf(amount: number | null | undefined) {
  return new Intl.NumberFormat("fr-CH", {
    style: "currency",
    currency: "CHF",
    maximumFractionDigits: Number(amount) % 1 === 0 ? 0 : 2,
  }).format(Number(amount || 0));
}

function getInitialSignupRole(searchParams: URLSearchParams): SignupRole {
  const requestedType = String(searchParams.get("type") || "").toLowerCase();
  if (requestedType === "restaurateur") return "restaurateur";
  if (requestedType === "courier" || requestedType === "livreur") return "courier";
  return "client";
}

const COMMERCIAL_REFERRAL_SESSION_KEY = "tok:commercial-signup-referral";

function getSignupValidationError(
  role: SignupRole,
  form: SignupFormState,
  onboardingChoices?: RestaurateurOnboardingChoices,
  legalAccepted = false,
  contractSignature?: RestaurateurContractSignature,
) {
  if (!form.fullName.trim()) return "Le nom complet est requis.";
  if (!form.email.trim()) return "L'email est requis.";
  if (!form.password.trim() || form.password.length < 6) return "Le mot de passe doit contenir au moins 6 caracteres.";
  if (!legalAccepted) return "Vous devez accepter les CGU et la politique de confidentialité.";

  if (role === "restaurateur") {
    if (!form.phone.trim()) return "Le téléphone est requis.";
    if (!form.city.trim()) return "La ville est requise.";
    if (!form.address.trim()) return "L'adresse est requise.";
    if (!form.businessName.trim()) return "Le nom commercial est requis.";
    if (!form.legalName.trim()) return "La raison sociale est requise.";
    if (!form.businessRegistrationNumber.trim()) return "Le numéro d'immatriculation est requis.";
    if (!form.restaurantName.trim()) return "Le nom du restaurant est requis.";
    if (!form.iban.trim()) return "L'IBAN de versement est requis.";
    if (!onboardingChoices?.subscriptionPlanId) return "Choisissez un abonnement TOK.";
    if (!["monthly", "yearly"].includes(onboardingChoices.subscriptionBillingPeriod)) {
      return "Choisissez une période d'abonnement valide.";
    }
    if (!contractSignature?.signerName.trim()) return "Le nom du signataire du contrat est requis.";
    if (!contractSignature?.signatureDataUrl.startsWith("data:image/png;base64,")) {
      return "La signature manuscrite du contrat restaurateur est requise.";
    }
  }

  if (role === "courier") {
    if (!form.phone.trim()) return "Le téléphone est requis.";
    if (!form.city.trim()) return "La ville est requise.";
    if (!form.address.trim()) return "L'adresse est requise.";
    if (!form.iban.trim()) return "L'IBAN de versement est requis.";
    if (["scooter", "car"].includes(form.vehicleType) && !form.licensePlate.trim()) {
      return "La plaque d'immatriculation est requise pour ce véhicule.";
    }
  }

  return null;
}

function createLegalAcceptancePayload(acceptedAt = new Date().toISOString()): SignupLegalAcceptance {
  return {
    termsAccepted: true,
    privacyPolicyAccepted: true,
    acceptedAt,
    version: LEGAL_ACCEPTANCE_VERSION,
  };
}

function toLegalAcceptanceMetadata(legalAcceptance: SignupLegalAcceptance) {
  return {
    legal_terms_accepted: legalAcceptance.termsAccepted,
    privacy_policy_accepted: legalAcceptance.privacyPolicyAccepted,
    legal_terms_accepted_at: legalAcceptance.acceptedAt,
    privacy_policy_accepted_at: legalAcceptance.acceptedAt,
    legal_acceptance_version: legalAcceptance.version,
  };
}

function exportSignedRestaurantContractPdf(input: {
  signerName: string;
  signatureDataUrl: string;
  signedAt: string;
  legalName: string;
  businessName: string;
  restaurantName: string;
  restaurateurAddress?: string | null;
  restaurateurPhone?: string | null;
  businessRegistrationNumber?: string | null;
  taxId?: string | null;
  city?: string | null;
  signerRole?: string | null;
  contractHash?: string | null;
  acceptanceText?: string | null;
  selectedSubscriptionPlanLabel?: string | null;
  selectedSubscriptionPriceLabel?: string | null;
}) {
  const html = generateSignedRestaurantPartnerContractHtml(input);

  return openSafeHtmlPrintDocument({
    title: `${RESTAURANT_PARTNER_CONTRACT_TITLE} - ${input.signerName}`,
    html,
  });
}

function RestaurantContractSignaturePad({
  signerName,
  onSignerNameChange,
  signatureDataUrl,
  onSignatureChange,
  signupForm,
  selectedSubscriptionPlanLabel,
  selectedSubscriptionPriceLabel,
}: {
  signerName: string;
  onSignerNameChange: (value: string) => void;
  signatureDataUrl: string;
  onSignatureChange: (value: string) => void;
  signupForm: SignupFormState;
  selectedSubscriptionPlanLabel?: string | null;
  selectedSubscriptionPriceLabel?: string | null;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawingRef = useRef(false);

  const updateSignature = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    onSignatureChange(canvas.toDataURL("image/png"));
  }, [onSignatureChange]);

  const getPoint = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((event.clientX - rect.left) / rect.width) * canvas.width,
      y: ((event.clientY - rect.top) / rect.height) * canvas.height,
    };
  };

  const handlePointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;
    const point = getPoint(event);
    drawingRef.current = true;
    canvas.setPointerCapture(event.pointerId);
    context.beginPath();
    context.moveTo(point.x, point.y);
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawingRef.current) return;
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;
    const point = getPoint(event);
    context.lineWidth = 3;
    context.lineCap = "round";
    context.lineJoin = "round";
    context.strokeStyle = "#0f172a";
    context.lineTo(point.x, point.y);
    context.stroke();
  };

  const handlePointerUp = () => {
    if (!drawingRef.current) return;
    drawingRef.current = false;
    updateSignature();
  };

  const clearSignature = () => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;
    context.clearRect(0, 0, canvas.width, canvas.height);
    onSignatureChange("");
  };

  const handleExport = async () => {
    const signedAt = new Date().toISOString();
    const acceptanceText = "J'ai lu et j'accepte l'intégralité du contrat restaurateur TOK et je déclare être habilité à engager le restaurateur.";
    const contractHash = await generateRestaurantPartnerContractSha256({
      signerName,
      signatureDataUrl,
      signedAt,
      legalName: signupForm.legalName,
      businessName: signupForm.businessName,
      restaurantName: signupForm.restaurantName,
      restaurateurAddress: signupForm.address,
      restaurateurPhone: signupForm.phone,
      businessRegistrationNumber: signupForm.businessRegistrationNumber,
      taxId: signupForm.taxId,
      city: signupForm.city,
      signerRole: "Représentant autorisé",
      acceptanceText,
      selectedSubscriptionPlanLabel,
      selectedSubscriptionPriceLabel,
    });
    const exported = exportSignedRestaurantContractPdf({
      signerName,
      signatureDataUrl,
      signedAt,
      legalName: signupForm.legalName,
      businessName: signupForm.businessName,
      restaurantName: signupForm.restaurantName,
      restaurateurAddress: signupForm.address,
      restaurateurPhone: signupForm.phone,
      businessRegistrationNumber: signupForm.businessRegistrationNumber,
      taxId: signupForm.taxId,
      city: signupForm.city,
      signerRole: "Représentant autorisé",
      contractHash,
      acceptanceText,
      selectedSubscriptionPlanLabel,
      selectedSubscriptionPriceLabel,
    });
    if (!exported) {
      alert("Autorisez l'ouverture de la fenêtre d'impression pour exporter le contrat en PDF.");
    }
  };

  return (
    <div className="space-y-4 rounded-2xl border bg-card p-4">
      <div>
        <p className="font-medium">Contrat restaurateur à signer maintenant</p>
        <p className="text-sm text-muted-foreground">
          La signature manuscrite est obligatoire dans la procédure d'inscription. Elle sera visible dans l'export PDF du contrat.
        </p>
      </div>
      <div className="max-h-72 space-y-4 overflow-auto rounded-xl border bg-background p-4 text-sm">
        <p className="font-semibold">{RESTAURANT_PARTNER_CONTRACT_TITLE}</p>
        <p className="text-xs text-muted-foreground">Version {RESTAURANT_PARTNER_CONTRACT_VERSION}</p>
        {RESTAURANT_PARTNER_CONTRACT_SECTIONS.map((section) => (
          <section key={section.title} className="space-y-2">
            <h3 className="font-semibold">{section.title}</h3>
            {section.paragraphs.map((paragraph) => (
              <p key={paragraph} className="text-muted-foreground">{paragraph}</p>
            ))}
          </section>
        ))}
      </div>
      <div className="space-y-2">
        <Label htmlFor="restaurant-contract-signer">Nom et fonction du signataire habilité</Label>
        <Input
          id="restaurant-contract-signer"
          value={signerName}
          onChange={(event) => onSignerNameChange(event.target.value)}
          placeholder="Ex. Marie Dupont, gérante"
        />
      </div>
      <div className="space-y-2">
        <Label>Signature au doigt ou au stylet</Label>
        <canvas
          ref={canvasRef}
          width={900}
          height={260}
          className="h-44 w-full touch-none rounded-xl border bg-white"
          aria-label="Zone de signature manuscrite du contrat restaurateur"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
        />
        <p className="text-xs text-muted-foreground">Signez dans le cadre blanc. La signature est intégrée au dossier d'inscription.</p>
      </div>
      <div className="flex flex-col gap-2 sm:flex-row">
        <Button type="button" variant="secondary" onClick={clearSignature} className="sm:w-auto">
          Effacer la signature
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={handleExport}
          disabled={!signerName.trim() || !signatureDataUrl}
          className="sm:w-auto"
        >
          Exporter le contrat signé en PDF
        </Button>
      </div>
    </div>
  );
}

function splitCourierName(fullName: string) {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  return {
    first_name: parts[0] || "",
    last_name: parts.slice(1).join(" "),
  };
}

function appendPrivilegedSignupDraftFormData(input: {
  formData: FormData;
  userId: string;
  role: SignupRole;
  form: SignupFormState;
  onboardingChoices?: RestaurateurOnboardingChoices;
  documents: Partial<Record<SignupDocumentType, File | null>>;
  captchaToken: string | null;
  legalAcceptance: SignupLegalAcceptance;
  contractSignature?: RestaurateurContractSignature;
  commercialReferralToken?: string;
}) {
  input.formData.append("user_id", input.userId);
  input.formData.append("requested_role", input.role);
  input.formData.append("full_name", input.form.fullName);
  input.formData.append("email", input.form.email);
  input.formData.append("phone", input.form.phone);
  input.formData.append("city", input.form.city);
  input.formData.append("address", input.form.address);
  input.formData.append("legal_name", input.role === "restaurateur" ? input.form.legalName : "");
  input.formData.append("business_name", input.role === "restaurateur" ? input.form.businessName : "");
  input.formData.append(
    "business_registration_number",
    input.role === "restaurateur" ? input.form.businessRegistrationNumber : "",
  );
  input.formData.append("tax_id", input.role === "restaurateur" ? input.form.taxId : "");
  input.formData.append("restaurant_name", input.role === "restaurateur" ? input.form.restaurantName : "");
  input.formData.append(
    "restaurant_description",
    input.role === "restaurateur" ? input.form.restaurantDescription : "",
  );
  input.formData.append("vehicle_type", input.role === "courier" ? input.form.vehicleType : "");
  input.formData.append("license_plate", input.role === "courier" ? input.form.licensePlate : "");
  input.formData.append("iban", input.form.iban);
  input.formData.append("subscription_plan_id", input.role === "restaurateur" ? input.onboardingChoices?.subscriptionPlanId || "" : "");
  input.formData.append("subscription_billing_period", input.role === "restaurateur" ? input.onboardingChoices?.subscriptionBillingPeriod || "" : "");
  input.formData.append("terms_accepted", input.legalAcceptance.termsAccepted ? "true" : "false");
  input.formData.append("privacy_policy_accepted", input.legalAcceptance.privacyPolicyAccepted ? "true" : "false");
  input.formData.append("legal_acceptance_version", input.legalAcceptance.version);
  input.formData.append("legal_acceptance_at", input.legalAcceptance.acceptedAt);
  input.formData.append("contract_version", input.role === "restaurateur" ? RESTAURANT_PARTNER_CONTRACT_VERSION : "");
  input.formData.append("contract_title", input.role === "restaurateur" ? RESTAURANT_PARTNER_CONTRACT_TITLE : "");
  input.formData.append("contract_signer_name", input.role === "restaurateur" ? input.contractSignature?.signerName || "" : "");
  input.formData.append("contract_signature_data_url", input.role === "restaurateur" ? input.contractSignature?.signatureDataUrl || "" : "");
  input.formData.append(
    "commercial_referral_token",
    input.role === "restaurateur" ? input.commercialReferralToken || "" : "",
  );
  input.formData.append("captcha_token", input.captchaToken || "");

  for (const requirement of getRequiredSignupDocuments(input.role, input.form.vehicleType)) {
    const file = input.documents[requirement.type];
    if (file) {
      input.formData.append(`document_${requirement.type}`, file, file.name);
    }
  }
}

async function getSignupEdgeErrorMessage(error: Error) {
  const context = (error as Error & { context?: { json?: () => Promise<unknown>; text?: () => Promise<string> } }).context;

  if (!context) return error.message;

  try {
    const payload = await context.json?.();
    if (payload && typeof payload === "object" && "error" in payload) {
      const message = String((payload as { error?: unknown }).error || "").trim();
      if (message) return message;
    }
  } catch {
    // The edge gateway may return a non-JSON body for deployment errors.
  }

  try {
    const text = (await context.text?.())?.trim();
    if (text) return text.slice(0, 240);
  } catch {
    // Keep the original Supabase error if the response body was already consumed.
  }

  return error.message;
}

async function submitPrivilegedSignupDraft(input: {
  userId: string;
  role: SignupRole;
  form: SignupFormState;
  onboardingChoices?: RestaurateurOnboardingChoices;
  documents: Partial<Record<SignupDocumentType, File | null>>;
  captchaToken: string | null;
  legalAcceptance: SignupLegalAcceptance;
  contractSignature?: RestaurateurContractSignature;
  commercialReferralToken?: string;
}) {
  const formData = new FormData();
  appendPrivilegedSignupDraftFormData({ formData, ...input });

  const { error } = await supabase.functions.invoke("submit-signup-application", {
    body: formData,
  });

  if (error) {
    throw new Error(await getSignupEdgeErrorMessage(error));
  }
}

export default function Auth() {
  const isCommercialAuthHost = typeof window !== "undefined"
    && isCommercialAppHost(window.location.hostname);

  useSeoMeta({
    title: isCommercialAuthHost ? "Connexion commerciale | TOK" : "Connexion et inscription | TOK",
    description: isCommercialAuthHost
      ? "Connectez-vous directement à l'environnement commercial de démonstration TOK."
      : "Connectez-vous à votre compte TOK ou créez votre espace sécurisé.",
    path: "/auth",
    robots: "noindex,nofollow",
  });

  const logoSrc = useTokLogoSrc();
  const [searchParams] = useSearchParams();
  const [commercialReferralToken, setCommercialReferralToken] = useState(() => {
    const fromUrl = String(searchParams.get("commercialReferral") || "").trim();
    if (fromUrl || typeof window === "undefined") return fromUrl;
    try {
      return String(window.sessionStorage.getItem(COMMERCIAL_REFERRAL_SESSION_KEY) || "").trim();
    } catch {
      return "";
    }
  });
  const requestedSubscriptionPlanSlug = String(searchParams.get("subscriptionPlan") || "").trim().toLowerCase();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user, roles, role, switchRole, canSwitchRole } = useAuth();

  const initialRole = getInitialSignupRole(searchParams);
  const [isLogin, setIsLogin] = useState(isCommercialAuthHost || initialRole === "client");
  const [roleMode, setRoleMode] = useState<SignupRole>(initialRole);
  const [signupForm, setSignupForm] = useState<SignupFormState>(EMPTY_SIGNUP_FORM);
  const [loading, setLoading] = useState(false);
  const [forgotPassword, setForgotPassword] = useState(false);
  const [showRolePicker, setShowRolePicker] = useState(false);
  const [documents, setDocuments] = useState<Partial<Record<SignupDocumentType, File | null>>>({});
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [resendLoading, setResendLoading] = useState(false);
  const [privilegedSignupSubmitting, setPrivilegedSignupSubmitting] = useState(false);
  const [selectedSubscriptionPlanId, setSelectedSubscriptionPlanId] = useState("");
  const [selectedSubscriptionBillingPeriod, setSelectedSubscriptionBillingPeriod] = useState<SignupSubscriptionBillingPeriod>("monthly");
  const [legalAccepted, setLegalAccepted] = useState(false);
  const [contractSignerName, setContractSignerName] = useState("");
  const [contractSignatureDataUrl, setContractSignatureDataUrl] = useState("");
  const [subscriptionPlans, setSubscriptionPlans] = useState<RestaurantSubscriptionPlanOption[]>([]);
  const [subscriptionPlansLoading, setSubscriptionPlansLoading] = useState(false);
  const authRedirectHandledRef = useRef(false);
  const { activeFeatures, loading: featureFlagsLoading } = useFeatureFlagSnapshot();
  const courierSignupEnabled = activeFeatures.has("espace-livreur");
  const annualBillingEnabled = activeFeatures.has("billing-fair-growth-annual");

  const requiredDocuments = useMemo(
    () => getRequiredSignupDocuments(roleMode, signupForm.vehicleType),
    [roleMode, signupForm.vehicleType],
  );
  const restaurateurOnboardingChoices = useMemo<RestaurateurOnboardingChoices>(() => ({
    subscriptionPlanId: selectedSubscriptionPlanId,
    subscriptionBillingPeriod: selectedSubscriptionBillingPeriod,
  }), [selectedSubscriptionBillingPeriod, selectedSubscriptionPlanId]);
  const selectedSubscriptionPlan = useMemo(
    () => subscriptionPlans.find((plan) => plan.id === selectedSubscriptionPlanId) || null,
    [selectedSubscriptionPlanId, subscriptionPlans],
  );
  const selectedSubscriptionPrice = selectedSubscriptionPlan
    ? selectedSubscriptionPlan.price_monthly_chf
      * (selectedSubscriptionBillingPeriod === "yearly" ? FAIR_GROWTH_ANNUAL_MONTHS_CHARGED : 1)
    : null;
  const isClientSignup = !isLogin && roleMode === "client";
  const showExtendedIdentityFields = !isLogin && (roleMode === "restaurateur" || roleMode === "courier");
  const showDocumentSection = !isLogin && requiredDocuments.length > 0;
  const switchableRoles = useMemo(() => {
    const visibleRoles = getFeatureVisibleRoles(roles, activeFeatures);
    if (!isCommercialAuthHost) return visibleRoles;
    return visibleRoles.filter((candidateRole) => candidateRole === "commercial" || candidateRole === "admin");
  }, [activeFeatures, isCommercialAuthHost, roles]);
  const postAuthRedirectTarget = useMemo(() => {
    const redirectTarget = searchParams.get("redirect");
    if (!redirectTarget) return null;
    return normalizeInternalNavigationTarget(redirectTarget, "/");
  }, [searchParams]);

  useEffect(() => {
    if (!commercialReferralToken || typeof window === "undefined") return;
    try {
      window.sessionStorage.setItem(COMMERCIAL_REFERRAL_SESSION_KEY, commercialReferralToken);
    } catch {
      // Session storage may be unavailable in hardened browsers; in-memory state remains authoritative.
    }

    const currentUrl = new URL(window.location.href);
    if (currentUrl.searchParams.has("commercialReferral")) {
      currentUrl.searchParams.delete("commercialReferral");
      window.history.replaceState(
        window.history.state,
        document.title,
        `${currentUrl.pathname}${currentUrl.search}${currentUrl.hash}`,
      );
    }
  }, [commercialReferralToken]);

  const getPostAuthTarget = useCallback((selectedRole: UserRole) => {
    return getPostAuthTargetForRole(selectedRole, postAuthRedirectTarget);
  }, [postAuthRedirectTarget]);

  const navigateToPostAuthTarget = useCallback((selectedRole: UserRole, replace = false) => {
    const target = getPostAuthTarget(selectedRole);
    const targetUrl = new URL(target, window.location.origin);

    if (targetUrl.origin !== window.location.origin) {
      if (replace) window.location.replace(targetUrl.href);
      else window.location.assign(targetUrl.href);
      return;
    }

    navigate(`${targetUrl.pathname}${targetUrl.search}${targetUrl.hash}`, { replace });
  }, [getPostAuthTarget, navigate]);

  useEffect(() => {
    if (typeof window === "undefined" || authRedirectHandledRef.current) return;

    const redirectState = getSupabaseAuthRedirectState(window.location.href);
    if (!redirectState.hasAuthRedirect) return;

    authRedirectHandledRef.current = true;
    let cancelled = false;

    const cleanAuthUrl = () => {
      window.history.replaceState(
        window.history.state,
        document.title,
        buildSanitizedAuthRedirectUrl(window.location.href),
      );
    };

    const completeAuthRedirect = async () => {
      setLoading(true);
      try {
        if (redirectState.error) {
          throw new Error(redirectState.errorDescription || redirectState.error);
        }

        if (redirectState.code) {
          const { error } = await supabase.auth.exchangeCodeForSession(redirectState.code);
          if (error) throw error;
        } else if (redirectState.hasSensitiveFragment) {
          await supabase.auth.signOut({ scope: "local" });
          throw new Error("Lien de connexion non compatible avec le flux sécurisé.");
        }
      } catch {
        if (!cancelled) {
          toast({
            title: "Connexion interrompue",
            description: "Reconnectez-vous pour finaliser une session sécurisée.",
            variant: "destructive",
          });
        }
      } finally {
        if (!cancelled) {
          cleanAuthUrl();
          setLoading(false);
        }
      }
    };

    void completeAuthRedirect();

    return () => {
      cancelled = true;
    };
  }, [toast]);

  useEffect(() => {
    if (!user || roles.length === 0 || privilegedSignupSubmitting || featureFlagsLoading) return;

    if (canSwitchRole && switchableRoles.length > 1) {
      if (!showRolePicker) setShowRolePicker(true);
      return;
    }

    const targetRole = role && switchableRoles.includes(role)
      ? role
      : switchableRoles[0] || getDefaultActiveRole(roles);
    if (targetRole !== role) switchRole(targetRole);
    navigateToPostAuthTarget(targetRole, true);
  }, [canSwitchRole, featureFlagsLoading, navigateToPostAuthTarget, privilegedSignupSubmitting, role, roles, showRolePicker, switchRole, switchableRoles, user]);

  useEffect(() => {
    if (!featureFlagsLoading && !courierSignupEnabled && roleMode === "courier") {
      setRoleMode("client");
    }
  }, [courierSignupEnabled, featureFlagsLoading, roleMode]);

  useEffect(() => {
    if (isLogin || roleMode !== "restaurateur") return;
    let mounted = true;

    setSubscriptionPlansLoading(true);
    (supabase.from as any)("restaurant_subscription_plans")
      .select("id, slug, name, description, price_monthly_chf, campaign_credit_chf, ai_tool_credits, ai_photo_credits, monthly_image_limit, monthly_premium_image_limit")
      .eq("is_active", true)
      .order("position", { ascending: true })
      .then(({ data, error }: { data?: unknown[] | null; error?: Error | null }) => {
        if (!mounted) return;
        if (error) {
          setSubscriptionPlans([]);
        } else {
          setSubscriptionPlans((data || []) as RestaurantSubscriptionPlanOption[]);
        }
      })
      .finally(() => {
        if (mounted) setSubscriptionPlansLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, [isLogin, roleMode]);

  useEffect(() => {
    if (roleMode !== "restaurateur") return;
    const referredPlan = commercialReferralToken && requestedSubscriptionPlanSlug
      ? subscriptionPlans.find((plan) => plan.slug === requestedSubscriptionPlanSlug)
      : null;
    if (commercialReferralToken) {
      const referredPlanId = referredPlan?.id || "";
      if (selectedSubscriptionPlanId !== referredPlanId) {
        setSelectedSubscriptionPlanId(referredPlanId);
      }
      return;
    }
    if (!selectedSubscriptionPlanId && subscriptionPlans[0]?.id) {
      setSelectedSubscriptionPlanId(subscriptionPlans[0].id);
    }
  }, [commercialReferralToken, requestedSubscriptionPlanSlug, roleMode, selectedSubscriptionPlanId, subscriptionPlans]);

  useEffect(() => {
    if (!user && privilegedSignupSubmitting) {
      setPrivilegedSignupSubmitting(false);
    }
  }, [privilegedSignupSubmitting, user]);

  const handleRoleSelect = (selectedRole: UserRole) => {
    switchRole(selectedRole);
    navigateToPostAuthTarget(selectedRole);
  };

  const handleResetPassword = async () => {
    if (!signupForm.email.trim()) {
      toast({ title: "Entrez votre email", variant: "destructive" });
      return;
    }
    if (isCaptchaEnabled() && !captchaToken) {
      toast({ title: "Validation requise", description: "Validez le contrôle anti-abus avant de continuer.", variant: "destructive" });
      return;
    }

    setLoading(true);
    const { error } = await supabase.auth.resetPasswordForEmail(signupForm.email, {
      redirectTo: `${window.location.origin}/auth`,
      captchaToken: captchaToken || undefined,
    });

    if (error) {
      toast({ title: "Erreur", description: error.message, variant: "destructive" });
    } else {
      toast({
        title: "Email envoyé",
        description: "Consultez votre boite mail pour reinitialiser votre mot de passe.",
      });
      setForgotPassword(false);
    }
    setLoading(false);
  };

  const handleResendConfirmationEmail = async () => {
    const email = signupForm.email.trim();
    if (!email) {
      toast({ title: "Entrez votre email", variant: "destructive" });
      return;
    }

    setResendLoading(true);
    const { error } = await supabase.auth.resend({
      type: "signup",
      email,
      options: {
        emailRedirectTo: `${window.location.origin}/auth?confirmed=1`,
      },
    });

    if (error) {
      toast({ title: "Erreur", description: error.message, variant: "destructive" });
    } else {
      toast({
        title: "Email envoyé",
        description: "Vérifiez votre boite mail pour confirmer votre compte.",
      });
    }
    setResendLoading(false);
  };

  const updateSignupField = <K extends keyof SignupFormState>(key: K, value: SignupFormState[K]) => {
    setSignupForm((current) => ({ ...current, [key]: value }));
  };

  const handleDocumentChange = (documentType: SignupDocumentType, file: File | null) => {
    setDocuments((current) => ({
      ...current,
      [documentType]: file,
    }));
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setLoading(true);
    let shouldSignOutPrivilegedSignupSession = false;

    try {
      if (isLogin) {
        if (isCaptchaEnabled() && !captchaToken) {
          throw new Error("Validation anti-abus requise.");
        }

        const { error } = await supabase.auth.signInWithPassword({
          email: signupForm.email,
          password: signupForm.password,
          options: {
            captchaToken: captchaToken || undefined,
          },
        });

        if (error) {
          throw error;
        }

        return;
      }

      const submittedRole = roleMode;
      const submittedRequiredDocuments = getRequiredSignupDocuments(submittedRole, signupForm.vehicleType);
      const isPrivilegedSignup = submittedRole !== "client";
      const submittedOnboardingChoices = restaurateurOnboardingChoices;
      const submittedLegalAcceptance = createLegalAcceptancePayload();
      const submittedContractSignature: RestaurateurContractSignature = {
        signerName: contractSignerName,
        signatureDataUrl: contractSignatureDataUrl,
      };
      const validationError = getSignupValidationError(
        submittedRole,
        signupForm,
        submittedRole === "restaurateur" ? submittedOnboardingChoices : undefined,
        legalAccepted,
        submittedRole === "restaurateur" ? submittedContractSignature : undefined,
      );
      if (validationError) {
        throw new Error(validationError);
      }
      if (isCaptchaEnabled() && !captchaToken) {
        throw new Error("Validation anti-abus requise.");
      }

      const missingDocuments = getMissingSignupDocuments(submittedRequiredDocuments, documents);
      if (missingDocuments.length > 0) {
        throw new Error(`Documents manquants: ${missingDocuments.map((item) => item.label).join(", ")}.`);
      }

      if (isPrivilegedSignup) {
        setPrivilegedSignupSubmitting(true);
      }

      const signUpResponse = await supabase.auth.signUp({
        email: signupForm.email,
        password: signupForm.password,
        options: {
          data: {
            full_name: signupForm.fullName,
            signup_intent: submittedRole,
            ...toLegalAcceptanceMetadata(submittedLegalAcceptance),
          },
          emailRedirectTo: `${window.location.origin}/auth?confirmed=1`,
          captchaToken: captchaToken || undefined,
        },
      });

      if (signUpResponse.error) {
        throw signUpResponse.error;
      }

      const activeUser = signUpResponse.data.user;
      const activeSession = signUpResponse.data.session;
      shouldSignOutPrivilegedSignupSession = isPrivilegedSignup && Boolean(activeSession);

      if (!activeUser?.id) {
        toast({
          title: "Compte créé",
          description: "Compte créé. Vérifiez votre email pour confirmer votre compte.",
        });
        if (isPrivilegedSignup) {
          setPrivilegedSignupSubmitting(false);
        }
        return;
      }

      if (!activeSession) {
        if (isPrivilegedSignup) {
          await submitPrivilegedSignupDraft({
            userId: activeUser.id,
            role: submittedRole,
            form: signupForm,
            onboardingChoices: submittedRole === "restaurateur" ? submittedOnboardingChoices : undefined,
            documents,
            captchaToken,
            legalAcceptance: submittedLegalAcceptance,
            contractSignature: submittedRole === "restaurateur" ? submittedContractSignature : undefined,
            commercialReferralToken: submittedRole === "restaurateur" ? commercialReferralToken : undefined,
          });
          try {
            window.sessionStorage.removeItem(COMMERCIAL_REFERRAL_SESSION_KEY);
          } catch {
            // The signup was saved even if browser storage cannot be cleared.
          }
          setCommercialReferralToken("");
          toast({
            title: "Inscription enregistrée",
            description: "Votre dossier complet sera transmis à l'admin TOK après confirmation de votre email.",
          });
          setDocuments({});
          setSignupForm(EMPTY_SIGNUP_FORM);
          setLegalAccepted(false);
          setContractSignerName("");
          setContractSignatureDataUrl("");
          setCaptchaToken(null);
          setPrivilegedSignupSubmitting(false);
        } else {
          toast({
            title: "Compte créé",
            description: "Compte créé. Vérifiez votre email pour confirmer votre compte.",
          });
        }
        return;
      }

      const contractAcceptanceText =
        "J'ai lu et j'accepte l'intégralité du contrat restaurateur TOK et je déclare être habilité à engager le restaurateur.";
      const contractContentSha256 = submittedRole === "restaurateur"
        ? await generateRestaurantPartnerContractSha256({
          signerName: submittedContractSignature.signerName.trim(),
          signatureDataUrl: submittedContractSignature.signatureDataUrl,
          signedAt: submittedLegalAcceptance.acceptedAt,
          legalName: signupForm.legalName,
          businessName: signupForm.businessName,
          restaurantName: signupForm.restaurantName,
          restaurateurAddress: signupForm.address,
          restaurateurPhone: signupForm.phone,
          businessRegistrationNumber: signupForm.businessRegistrationNumber,
          taxId: signupForm.taxId,
          city: signupForm.city,
          signerRole: "Représentant autorisé",
          signerEmail: signupForm.email,
          userId: activeUser.id,
          acceptanceText: contractAcceptanceText,
          selectedSubscriptionPlanLabel: selectedSubscriptionPlan?.name || null,
          selectedSubscriptionPriceLabel: selectedSubscriptionPrice == null
            ? null
            : formatChf(selectedSubscriptionPrice) + (
                submittedOnboardingChoices.subscriptionBillingPeriod === "yearly"
                  ? " · annuel, 12 mois au prix de 11"
                  : " · mensuel"
              ),
        })
        : null;

      const uploadedDocuments: UploadedSignupDocument[] = [];
      for (const requirement of submittedRequiredDocuments) {
        const file = documents[requirement.type];
        if (!file) continue;

        const uploadedDocument = await uploadVerificationDocument({
          userId: activeUser.id,
          role: submittedRole,
          documentType: requirement.type,
          file,
        });
        uploadedDocuments.push(uploadedDocument);
      }

      const { error: syncError } = await supabase.rpc("sync_signup_application", {
        p_requested_role: submittedRole,
        p_full_name: signupForm.fullName,
        p_phone: signupForm.phone,
        p_city: signupForm.city,
        p_address: signupForm.address,
        p_legal_name: submittedRole === "restaurateur" ? signupForm.legalName : null,
        p_business_name: submittedRole === "restaurateur" ? signupForm.businessName : null,
        p_business_registration_number:
          submittedRole === "restaurateur" ? signupForm.businessRegistrationNumber : null,
        p_tax_id: submittedRole === "restaurateur" ? signupForm.taxId : null,
        p_restaurant_name: submittedRole === "restaurateur" ? signupForm.restaurantName : null,
        p_restaurant_description:
          submittedRole === "restaurateur" ? signupForm.restaurantDescription : null,
        p_vehicle_type: submittedRole === "courier" ? signupForm.vehicleType : null,
        p_license_plate: submittedRole === "courier" ? signupForm.licensePlate : null,
        p_iban:
          submittedRole === "courier" || submittedRole === "restaurateur" ? signupForm.iban : null,
        p_metadata:
          submittedRole === "courier"
            ? {
              ...splitCourierName(signupForm.fullName),
              ...toLegalAcceptanceMetadata(submittedLegalAcceptance),
            }
            : submittedRole === "restaurateur"
              ? {
                onboarding_source: "auth_signup",
                selected_subscription_plan_id: submittedOnboardingChoices.subscriptionPlanId,
                selected_subscription_billing_period: submittedOnboardingChoices.subscriptionBillingPeriod,
                onboarding_payment_status: "payment_method_required",
                ...(commercialReferralToken ? { commercial_referral_token: commercialReferralToken } : {}),
                contract_version: RESTAURANT_PARTNER_CONTRACT_VERSION,
                contract_title: RESTAURANT_PARTNER_CONTRACT_TITLE,
                contract_signer_name: submittedContractSignature.signerName.trim(),
                contract_signature_data_url: submittedContractSignature.signatureDataUrl,
                contract_signed_at: submittedLegalAcceptance.acceptedAt,
                contract_signature_source: "auth_signup",
                contract_signer_role: "Représentant autorisé",
                contract_content_sha256: contractContentSha256,
                contract_content_hash: contractContentSha256,
                contract_acceptance_text: contractAcceptanceText,
                contract_signed_email: signupForm.email,
                contract_signed_user_id: activeUser.id,
                contract_legal_name: signupForm.legalName,
                contract_business_name: signupForm.businessName,
                contract_restaurant_name: signupForm.restaurantName,
                ...toLegalAcceptanceMetadata(submittedLegalAcceptance),
              }
              : { verification_source: "auth_signup", ...toLegalAcceptanceMetadata(submittedLegalAcceptance) },
        p_documents: uploadedDocuments,
      });

      if (syncError) {
        throw syncError;
      }

      try {
        window.sessionStorage.removeItem(COMMERCIAL_REFERRAL_SESSION_KEY);
      } catch {
        // The signup was saved even if browser storage cannot be cleared.
      }
      setCommercialReferralToken("");

      toast({
        title: submittedRole === "client" ? "Compte crée" : "Inscription enregistrée",
        description:
          submittedRole === "client"
            ? "Votre compte est actif. Vous pouvez continuer votre parcours."
            : "Votre compte et votre dossier documentaire ont été transmis pour vérification. Vous pourrez vous connecter à l’espace restaurateur après validation.",
      });

      if (submittedRole === "client") {
        navigate(postAuthRedirectTarget || "/");
        return;
      }

      const { error: signOutError } = await supabase.auth.signOut();
      if (signOutError) {
        throw signOutError;
      }
      setIsLogin(true);
      setDocuments({});
      setLegalAccepted(false);
      setContractSignerName("");
      setContractSignatureDataUrl("");
      setSignupForm((current) => ({
        ...EMPTY_SIGNUP_FORM,
        email: current.email,
      }));
    } catch (error) {
      if (shouldSignOutPrivilegedSignupSession) {
        const { error: signOutError } = await supabase.auth.signOut();
        if (signOutError) {
          console.error("[auth] failed to close privileged signup session", signOutError.message);
        }
      } else {
        setPrivilegedSignupSubmitting(false);
      }
      const message = error instanceof Error ? error.message : "Une erreur est survenue.";
      toast({ title: "Erreur", description: message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  if (showRolePicker && user && canSwitchRole && switchableRoles.length > 1) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-secondary/10 px-4">
        <Card className="w-full max-w-md shadow-lg border-0">
          <CardHeader className="text-center space-y-2">
            <img src={logoSrc} alt="Tok" className="mx-auto h-18 w-auto object-contain mb-2" />
            <CardTitle className="font-display text-2xl">Bienvenue</CardTitle>
            <CardDescription>Choisissez votre espace pour continuer</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {switchableRoles.map((role) => {
              const config = ROLE_CONFIG[role];
              return (
                <button
                  key={role}
                  onClick={() => handleRoleSelect(role)}
                  className={`w-full flex items-center gap-4 rounded-xl border-2 p-4 text-left transition-all hover:scale-[1.01] hover:shadow-md ${config.color}`}
                >
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-background shadow-sm">
                    <config.icon className="h-6 w-6" />
                  </div>
                  <div>
                    <p className="font-bold text-base">{config.label}</p>
                    <p className="text-xs text-muted-foreground">{config.desc}</p>
                  </div>
                </button>
              );
            })}
          </CardContent>
        </Card>
      </div>
    );
  }

  if (user && roles.length > 0 && !privilegedSignupSubmitting) return null;

  return (
    <div className="min-h-screen flex items-center justify-center bg-secondary/10 px-4 py-10">
      <Card className="w-full max-w-3xl shadow-lg border-0">
        <CardHeader className="text-center space-y-3">
          <img src={logoSrc} alt="Tok" className="mx-auto h-20 w-auto object-contain" />
          <CardTitle className="font-display text-2xl">
            {isCommercialAuthHost
              ? "Connexion commerciale sécurisée"
              : isLogin
                ? "Bon retour"
                : isClientSignup
                  ? "Créer votre compte"
                  : "Créer un compte vérifié"}
          </CardTitle>
          <CardDescription>
            {isCommercialAuthHost
              ? "Connectez-vous ici avec votre compte commercial. Cette session reste séparée des espaces clients et restaurants réels."
              : isLogin
              ? postAuthRedirectTarget
                ? "Connectez-vous pour reprendre votre commande, réservation ou parcours en cours."
                : "Connectez-vous pour acceder à vos espaces client, restaurateur, livreur ou admin."
              : isClientSignup
                ? "Inscription en moins d'une minute. Adresse et paiement seront demandes uniquement au bon moment."
                : "Choisissez un profil, renseignez vos informations et ajoutez les justificatifs requis."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {isLogin && (postAuthRedirectTarget || searchParams.get("domain") === "required") ? (
            <div className="rounded-xl border border-primary/20 bg-primary/5 p-4 text-sm">
              <p className="font-medium">
                {isCommercialAuthHost ? "Reconnexion requise sur le domaine commercial" : "Connexion requise pour continuer"}
              </p>
              <p className="pt-1 text-muted-foreground">
                {isCommercialAuthHost
                  ? "Aucun jeton de session n’est transféré depuis un autre domaine."
                  : "Une fois connecté, vous reviendrez automatiquement à votre parcours en cours."}
              </p>
            </div>
          ) : null}
          {!isLogin ? (
            <Tabs value={roleMode} onValueChange={(value) => setRoleMode(value as SignupRole)} className="w-full">
              <TabsList className={`grid h-auto w-full ${courierSignupEnabled ? "grid-cols-1 min-[360px]:grid-cols-3" : "grid-cols-2"}`}>
                <TabsTrigger value="client" className="w-full min-w-0 whitespace-normal px-1.5 text-xs leading-tight sm:px-3 sm:text-sm">Client</TabsTrigger>
                <TabsTrigger value="restaurateur" className="w-full min-w-0 whitespace-normal px-1.5 text-xs leading-tight sm:px-3 sm:text-sm">Restaurateur</TabsTrigger>
                {courierSignupEnabled ? <TabsTrigger value="courier" className="w-full min-w-0 whitespace-normal px-1.5 text-xs leading-tight sm:px-3 sm:text-sm">Livreur</TabsTrigger> : null}
              </TabsList>
            </Tabs>
          ) : null}

          {!isLogin ? (
            <div className="rounded-xl border bg-muted/30 p-4 text-sm">
              <p className="font-medium">{SIGNUP_ROLE_META[roleMode].label}</p>
              <p className="pt-1 text-muted-foreground">{SIGNUP_ROLE_META[roleMode].description}</p>
            </div>
          ) : null}

          {forgotPassword ? (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="reset-email">Email</Label>
                <Input
                  id="reset-email"
                  type="email"
                  value={signupForm.email}
                  onChange={(event) => updateSignupField("email", event.target.value)}
                  placeholder="vous@exemple.com"
                  required
                />
              </div>
              <TurnstileCaptcha action="auth_reset_password" onTokenChange={setCaptchaToken} />
              <Button className="w-full" onClick={handleResetPassword} disabled={loading}>
                {loading ? "Envoi..." : "Réinitialiser le mot de passe"}
              </Button>
              <button
                type="button"
                onClick={() => setForgotPassword(false)}
                className="w-full text-sm text-muted-foreground transition-colors hover:text-primary"
              >
                Retour à la connexion
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor={isLogin ? "email-login" : "fullName"}>
                    {isLogin
                      ? "Email"
                      : roleMode === "restaurateur"
                        ? "Nom du responsable"
                        : "Nom complet"}
                  </Label>
                  {isLogin ? (
                    <Input
                      id="email-login"
                      type="email"
                      value={signupForm.email}
                      onChange={(event) => updateSignupField("email", event.target.value)}
                      placeholder="vous@exemple.com"
                      required
                    />
                  ) : (
                    <Input
                      id="fullName"
                      value={signupForm.fullName}
                      onChange={(event) => updateSignupField("fullName", event.target.value)}
                      placeholder="Jean Dupont"
                      required
                    />
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="password">Mot de passe</Label>
                  <div className="relative">
                    <Input
                      id="password"
                      type={showPassword ? "text" : "password"}
                      value={signupForm.password}
                      onChange={(event) => updateSignupField("password", event.target.value)}
                      placeholder="********"
                      required
                      minLength={6}
                      autoComplete={isLogin ? "current-password" : "new-password"}
                      className="pr-11"
                    />
                    <button
                      type="button"
                      aria-label={showPassword ? "Masquer le mot de passe" : "Afficher le mot de passe"}
                      aria-pressed={showPassword}
                      onClick={() => setShowPassword((current) => !current)}
                      className="absolute inset-y-0 right-0 flex w-11 items-center justify-center rounded-r-md text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>

                {!isLogin ? (
                  <div className="space-y-2">
                    <Label htmlFor="email">Email</Label>
                    <Input
                      id="email"
                      type="email"
                      value={signupForm.email}
                      onChange={(event) => updateSignupField("email", event.target.value)}
                      placeholder="vous@exemple.com"
                      required
                    />
                  </div>
                ) : null}

                {showExtendedIdentityFields ? (
                  <>
                    <div className="space-y-2">
                      <Label htmlFor="phone">Téléphone</Label>
                      <Input
                        id="phone"
                        value={signupForm.phone}
                        onChange={(event) => updateSignupField("phone", event.target.value)}
                        placeholder="+41 79 000 00 00"
                        required
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="city">Ville</Label>
                      <CityAutocomplete
                        id="city"
                        value={signupForm.city}
                        onValueChange={(value) => updateSignupField("city", value)}
                        onCitySelect={(city) => updateSignupField("city", city)}
                        placeholder="Ville de rattachement"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="address">Adresse</Label>
                      <AddressAutocomplete
                        id="address"
                        value={signupForm.address}
                        preferredCity={signupForm.city}
                        onValueChange={(value) => updateSignupField("address", value)}
                        onAddressSelect={(address, city) => {
                          updateSignupField("address", address);
                          if (city) updateSignupField("city", city);
                        }}
                        placeholder="Rue, numéro, code postal"
                      />
                    </div>
                  </>
                ) : null}
              </div>

              {isClientSignup ? (
                <div className="rounded-2xl border bg-card/50 p-4 text-sm">
                  <p className="font-medium">Inscription simplifiee</p>
                  <p className="pt-1 text-muted-foreground">
                    Aucun document d&apos;identité n&apos;est demandé pour un compte client. Vos coordonnées de livraison seront renseignées plus tard, uniquement si nécessaire.
                  </p>
                </div>
              ) : null}

              {!isLogin && roleMode === "restaurateur" ? (
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="businessName">Nom commercial</Label>
                    <Input
                      id="businessName"
                      value={signupForm.businessName}
                      onChange={(event) => updateSignupField("businessName", event.target.value)}
                      placeholder="Tok Rive Gauche"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="legalName">Raison sociale</Label>
                    <Input
                      id="legalName"
                      value={signupForm.legalName}
                      onChange={(event) => updateSignupField("legalName", event.target.value)}
                      placeholder="Tok Sarl"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="businessRegistrationNumber">Numéro d'immatriculation</Label>
                    <Input
                      id="businessRegistrationNumber"
                      value={signupForm.businessRegistrationNumber}
                      onChange={(event) =>
                        updateSignupField("businessRegistrationNumber", event.target.value)
                      }
                      placeholder="CHE-123.456.789"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="taxId">Numéro TVA (optionnel)</Label>
                    <Input
                      id="taxId"
                      value={signupForm.taxId}
                      onChange={(event) => updateSignupField("taxId", event.target.value)}
                      placeholder="CHE-123.456 TVA"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="restaurantName">Nom du restaurant</Label>
                    <Input
                      id="restaurantName"
                      value={signupForm.restaurantName}
                      onChange={(event) => updateSignupField("restaurantName", event.target.value)}
                      placeholder="Le Comptoir Tok"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="iban-restaurateur">IBAN de versement</Label>
                    <Input
                      id="iban-restaurateur"
                      value={signupForm.iban}
                      onChange={(event) => updateSignupField("iban", event.target.value)}
                      placeholder="CH93 0076 2011 6238 5295 7"
                    />
                  </div>
                  <div className="space-y-2 md:col-span-2">
                    <Label htmlFor="restaurantDescription">Description du restaurant (optionnel)</Label>
                    <Textarea
                      id="restaurantDescription"
                      value={signupForm.restaurantDescription}
                      onChange={(event) =>
                        updateSignupField("restaurantDescription", event.target.value)
                      }
                      placeholder="Cuisine, positionnement, specialites..."
                    />
                  </div>
                </div>
              ) : null}

              {!isLogin && roleMode === "restaurateur" ? (
                <div className="space-y-4 rounded-2xl border bg-card/60 p-4">
                  <div className="flex items-start gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                      <CreditCard className="h-5 w-5" />
                    </div>
                    <div>
                      <p className="font-medium">Abonnement restaurateur</p>
                      <p className="text-sm text-muted-foreground">
                        Ce choix est joint au dossier et une facture d’abonnement est réservée dès
                        l’inscription. La carte sera enregistrée depuis le dashboard, sans débit immédiat.
                      </p>
                    </div>
                  </div>

                  <div className="space-y-3">
                    <Label>Période de facturation</Label>
                    <div className="grid grid-cols-2 gap-2">
                      <Button
                        type="button"
                        variant={selectedSubscriptionBillingPeriod === "monthly" ? "default" : "outline"}
                        onClick={() => setSelectedSubscriptionBillingPeriod("monthly")}
                        disabled={Boolean(commercialReferralToken)}
                      >
                        Mensuel
                      </Button>
                      <Button
                        type="button"
                        variant={selectedSubscriptionBillingPeriod === "yearly" ? "default" : "outline"}
                        onClick={() => setSelectedSubscriptionBillingPeriod("yearly")}
                        disabled={!annualBillingEnabled || Boolean(commercialReferralToken)}
                        title={annualBillingEnabled ? "12 mois de service au prix de 11" : "Activation après validation Stripe"}
                      >
                        Annuel · 11 pour 12
                      </Button>
                    </div>
                    {!annualBillingEnabled ? (
                      <p className="text-xs text-muted-foreground">
                        L'annuel sera activé après validation du parcours Stripe complet. Les montants sont déjà affichés à titre contractuel.
                      </p>
                    ) : null}

                    {subscriptionPlansLoading ? (
                      <div className="rounded-xl border p-4 text-sm text-muted-foreground">
                        Chargement des abonnements...
                      </div>
                    ) : subscriptionPlans.length > 0 ? (
                      <div className="grid gap-3 md:grid-cols-2">
                        {subscriptionPlans.map((plan) => {
                          const selected = selectedSubscriptionPlanId === plan.id;
                          const fairGrowthPlan = getFairGrowthPlan(plan.slug);
                          const amount = fairGrowthPlan.monthlyPriceChf
                            * (selectedSubscriptionBillingPeriod === "yearly" ? FAIR_GROWTH_ANNUAL_MONTHS_CHARGED : 1);
                          const tokCredits = getTokCreditAmount(plan);
                          return (
                            <button
                              key={plan.id}
                              type="button"
                              className={`rounded-xl border p-4 text-left transition-colors ${
                                selected ? "border-primary bg-primary/10" : "bg-background hover:border-primary/50"
                              }`}
                              onClick={() => setSelectedSubscriptionPlanId(plan.id)}
                              disabled={Boolean(commercialReferralToken)}
                            >
                              <span className="block text-sm font-semibold">{plan.name}</span>
                              <span className="block pt-1 text-xs text-muted-foreground">
                                {plan.description || "Abonnement TOK pour activer le partenariat."}
                              </span>
                              <span className="block pt-3 text-sm font-bold">
                                {formatChf(amount)} {selectedSubscriptionBillingPeriod === "yearly" ? "/ an" : "/ mois"}
                              </span>
                              <span className="mt-2 grid gap-1 rounded-lg bg-primary/5 p-2 text-xs text-muted-foreground">
                                <span><strong>{formatChf(fairGrowthPlan.acquiredReservationFeeChf)}</strong> / réservation TOK honorée</span>
                                <span><strong>{(fairGrowthPlan.marketplaceCommissionBps / 100).toLocaleString("fr-CH")}%</strong> / commande marketplace</span>
                                <span>Canaux propres, annulation, no-show et remboursement : <strong>CHF 0</strong></span>
                                <span>Plafond réservation : <strong>7% du CA table</strong></span>
                                <span>Au minimum 90% au restaurant + 100% des pourboires</span>
                                {fairGrowthPlan.slug === "elite" ? (
                                  <>
                                    <span>3 établissements inclus · CHF 149/site supplémentaire</span>
                                    <span>Sites rattachés après validation TOK ; aucun supplément sans confirmation.</span>
                                  </>
                                ) : null}
                              </span>
                              <span className="mt-3 grid gap-1 text-xs text-muted-foreground">
                                <span className="font-semibold text-foreground">{formatTokCredits(tokCredits)} / mois</span>
                                <span>Utilisables pour campagnes, IA, photos et visuels.</span>
                                <span>ou {getCampaignEquivalentChf(tokCredits).toLocaleString("fr-CH")} CHF de campagnes TOK</span>
                                <span>ou {getAiSimpleRequestEquivalent(tokCredits).toLocaleString("fr-CH")} requêtes assistant IA</span>
                                <span>ou {getPhotoSimpleEquivalent(tokCredits).toLocaleString("fr-CH")} retouches photo simples</span>
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
                        Aucun abonnement actif n'est disponible. Contactez TOK avant de poursuivre.
                      </div>
                    )}
                    {commercialReferralToken ? (
                      <p className={selectedSubscriptionPlanId
                        ? "text-xs font-medium text-emerald-700 dark:text-emerald-300"
                        : "text-xs font-medium text-destructive"}
                      >
                        {selectedSubscriptionPlanId
                          ? "L’abonnement est verrouillé sur l’offre signée avec le commercial."
                          : "Ce lien commercial est incomplet ou ne correspond plus à une offre active."}
                      </p>
                    ) : null}
                  </div>

                  {selectedSubscriptionPlan ? (
                    <div className="rounded-xl border bg-background p-3 text-sm">
                      <p className="font-medium">Snapshot Fair Growth réservé au dossier</p>
                      <p className="pt-1 text-muted-foreground">
                        {formatChf(selectedSubscriptionPrice)} {selectedSubscriptionBillingPeriod === "yearly" ? "pour 12 mois de service (11 mois facturés)" : "/ mois"}.
                        Le plan, la période, les taux et la version tarifaire seront scellés côté serveur.
                      </p>
                    </div>
                  ) : null}
                </div>
              ) : null}

              {!isLogin && roleMode === "courier" ? (
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="vehicleType">Véhicule</Label>
                    <Select
                      value={signupForm.vehicleType}
                      onValueChange={(value) => updateSignupField("vehicleType", value)}
                    >
                      <SelectTrigger id="vehicleType">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {COURIER_VEHICLE_OPTIONS.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="iban-courier">IBAN de versement</Label>
                    <Input
                      id="iban-courier"
                      value={signupForm.iban}
                      onChange={(event) => updateSignupField("iban", event.target.value)}
                      placeholder="CH93 0076 2011 6238 5295 7"
                    />
                  </div>
                  <div className="space-y-2 md:col-span-2">
                    <Label htmlFor="licensePlate">Plaque d'immatriculation</Label>
                    <Input
                      id="licensePlate"
                      value={signupForm.licensePlate}
                      onChange={(event) => updateSignupField("licensePlate", event.target.value)}
                      placeholder="Obligatoire pour scooter ou voiture"
                    />
                  </div>
                </div>
              ) : null}

              {!isLogin && roleMode === "restaurateur" ? (
                <RestaurantContractSignaturePad
                  signerName={contractSignerName}
                  onSignerNameChange={setContractSignerName}
                  signatureDataUrl={contractSignatureDataUrl}
                  onSignatureChange={setContractSignatureDataUrl}
                  signupForm={signupForm}
                  selectedSubscriptionPlanLabel={selectedSubscriptionPlan?.name || null}
                  selectedSubscriptionPriceLabel={selectedSubscriptionPrice == null
                    ? null
                    : formatChf(selectedSubscriptionPrice) + (
                        selectedSubscriptionBillingPeriod === "yearly"
                          ? " · annuel, 12 mois au prix de 11"
                          : " · mensuel"
                      )}
                />
              ) : null}

              {showDocumentSection ? (
                <div className="space-y-4 rounded-2xl border bg-card p-4">
                  <div>
                    <p className="font-medium">Documents a fournir</p>
                    <p className="text-sm text-muted-foreground">
                      Chaque profil impose des pieces justificatives différentes. Les fichiers sont
                      stockés dans un espace privé et revus par l'administration.
                    </p>
                  </div>

                  <div className="grid gap-3 md:grid-cols-2">
                    {requiredDocuments.map((requirement) => {
                      const selectedFile = documents[requirement.type];
                      return (
                        <label
                          key={requirement.type}
                          className="flex cursor-pointer flex-col gap-3 rounded-xl border border-dashed p-4 transition-colors hover:border-primary/50 hover:bg-muted/20"
                        >
                          <div className="space-y-1">
                            <p className="font-medium">{requirement.label}</p>
                            <p className="text-xs text-muted-foreground">{requirement.description}</p>
                          </div>
                          <div className="flex items-center justify-between gap-3 rounded-lg border bg-background px-3 py-2 text-sm">
                            <div className="min-w-0">
                              <p className="truncate">
                                {selectedFile ? selectedFile.name : "Aucun fichier sélectionné"}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                {selectedFile ? `${Math.round(selectedFile.size / 1024)} KB` : requirement.accept}
                              </p>
                            </div>
                            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 text-primary">
                              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                            </div>
                          </div>
                          <Input
                            type="file"
                            className="hidden"
                            accept={requirement.accept}
                            onChange={(event) =>
                              handleDocumentChange(requirement.type, event.target.files?.[0] || null)
                            }
                            disabled={loading}
                          />
                        </label>
                      );
                    })}
                  </div>
                </div>
              ) : null}

              {!isLogin && legalAccepted ? (
                <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
                  <p className="font-medium">Conditions acceptées</p>
                  <p className="mt-1 text-emerald-800">
                    Vous pouvez finaliser votre inscription. Les liens juridiques restent accessibles depuis le pied de page.
                  </p>
                </div>
              ) : null}

              {!isLogin && !legalAccepted ? (
                <div
                  className="fixed inset-0 z-[1900] flex items-start justify-center overflow-y-auto overscroll-contain bg-slate-950/35 px-4 pb-[max(1rem,env(safe-area-inset-bottom,0px))] pt-[max(1rem,env(safe-area-inset-top,0px))] backdrop-blur-md sm:items-center"
                  role="dialog"
                  aria-modal="true"
                  aria-labelledby="legal-acceptance-title"
                >
                  <div className="max-h-[calc(100dvh-2rem)] w-full max-w-lg overflow-y-auto overscroll-contain rounded-3xl border border-slate-200 bg-white p-5 text-slate-950 shadow-2xl sm:p-7">
                    <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
                      <Shield className="h-6 w-6" />
                    </div>
                    <div className="mt-5 text-center">
                      <h2 id="legal-acceptance-title" className="text-xl font-semibold">
                        Accepter les conditions générales
                      </h2>
                      <p className="mt-2 text-sm leading-6 text-slate-600">
                        Avant de créer votre compte TOK, confirmez que vous avez lu et accepté les conditions applicables et la politique de confidentialité.
                      </p>
                    </div>
                    <label
                      htmlFor="legal-acceptance"
                      className="mt-6 flex cursor-pointer items-start gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-left text-sm transition hover:border-primary/40 hover:bg-primary/5"
                    >
                      <Checkbox
                        id="legal-acceptance"
                        checked={legalAccepted}
                        onCheckedChange={(checked) => setLegalAccepted(checked === true)}
                        aria-label="J'accepte les CGU et la politique de confidentialité"
                        className="mt-0.5"
                      />
                      <span className="leading-6 text-slate-700">
                        J'accepte les{" "}
                        <Link to="/cgu" target="_blank" className="font-semibold text-primary hover:underline">
                          CGU
                        </Link>{" "}
                        et la{" "}
                        <Link
                          to="/politique-confidentialite"
                          target="_blank"
                          className="font-semibold text-primary hover:underline"
                        >
                          politique de confidentialité
                        </Link>{" "}
                        de TOK.
                      </span>
                    </label>
                    <p className="mt-4 text-center text-xs leading-5 text-slate-500">
                      Le formulaire reste affiché derrière cette fenêtre, mais il sera accessible après acceptation.
                    </p>
                  </div>
                </div>
              ) : null}

              <TurnstileCaptcha action={isLogin ? "auth_login" : `auth_signup_${roleMode}`} onTokenChange={setCaptchaToken} />
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Traitement...
                  </>
                ) : isLogin ? (
                  "Se connecter"
                ) : isClientSignup ? (
                  "Créer mon compte"
                ) : (
                  <>
                    <FileText className="mr-2 h-4 w-4" />
                    Envoyer mon inscription vérifiée
                  </>
                )}
              </Button>

              {isLogin && !forgotPassword ? (
                <>
                  <Button
                    type="button"
                    variant="secondary"
                    className="w-full"
                    onClick={handleResendConfirmationEmail}
                    disabled={loading || resendLoading}
                  >
                    {resendLoading ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Envoi...
                      </>
                    ) : (
                      "Renvoyer l’email de confirmation"
                    )}
                  </Button>

                  <div className="relative">
                    <div className="absolute inset-0 flex items-center">
                      <span className="w-full border-t" />
                    </div>
                    <div className="relative flex justify-center text-xs uppercase">
                      <span className="bg-card px-2 text-muted-foreground">ou</span>
                    </div>
                  </div>

                  <Button
                    type="button"
                    variant="outline"
                    className="w-full"
                    onClick={async () => {
                      try {
                        const { error } = await supabase.auth.signInWithOAuth({
                          provider: "google",
                          options: { redirectTo: `${window.location.origin}/auth/callback` },
                        });
                        if (error) throw error;
                      } catch {
                        toast({ title: "Google indisponible", description: "La connexion via Google sera bientot disponible.", variant: "destructive" });
                      }
                    }}
                  >
                    <svg className="mr-2 h-4 w-4" viewBox="0 0 24 24"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/></svg>
                    Continuer avec Google
                  </Button>

                  <Button
                    type="button"
                    variant="outline"
                    className="w-full"
                    onClick={async () => {
                      try {
                        const { error } = await supabase.auth.signInWithOAuth({
                          provider: "apple",
                          options: { redirectTo: `${window.location.origin}/auth/callback` },
                        });
                        if (error) throw error;
                      } catch {
                        toast({ title: "Apple indisponible", description: "La connexion via Apple sera bientot disponible.", variant: "destructive" });
                      }
                    }}
                  >
                    <svg className="mr-2 h-4 w-4" viewBox="0 0 24 24" fill="currentColor"><path d="M17.05 20.28c-.98.95-2.05.88-3.08.4-1.09-.5-2.08-.48-3.24 0-1.44.62-2.2.44-3.06-.4C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.32 2.32-2.12 4.56-3.74 4.25z"/></svg>
                    Continuer avec Apple
                  </Button>
                </>
              ) : null}
            </form>
          )}

          {isLogin && !forgotPassword ? (
            <div className="text-center">
              <button
                type="button"
                onClick={() => setForgotPassword(true)}
                className="text-xs text-muted-foreground transition-colors hover:text-primary"
              >
                Mot de passe oublié ?
              </button>
            </div>
          ) : null}

          {!isCommercialAuthHost ? (
            <div className="text-center">
              <button
                type="button"
                onClick={() => {
                  setIsLogin((current) => !current);
                  setForgotPassword(false);
                }}
                className="text-sm text-muted-foreground transition-colors hover:text-primary"
              >
                {isLogin ? "Pas encore de compte ? S'inscrire" : "Déjà un compte ? Se connecter"}
              </button>
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}

