import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CheckCircle2,
  Download,
  FileSignature,
  Loader2,
  ShieldCheck,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useCommercialDemoFrame } from "@/components/commercial/CommercialDemoFrameProvider";
import { getSupabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth-context";
import {
  RESTAURANT_PARTNER_CONTRACT_SECTIONS,
  RESTAURANT_PARTNER_CONTRACT_TITLE,
  RESTAURANT_PARTNER_CONTRACT_VERSION,
  generateRestaurantPartnerContractSha256,
  generateSignedRestaurantPartnerContractHtml,
} from "@/lib/restaurantPartnerContract";
import { openSafeHtmlPrintDocument } from "@/lib/safePrintWindow";

const supabase = getSupabase();

type RestaurantContract = {
  id: string;
  restaurant_id: string;
  contract_version: string;
  contract_title: string;
  signer_name: string;
  signed_by: string | null;
  signed_at: string | null;
  status: string;
  signature_metadata?: Record<string, unknown> | null;
};

type RestaurantContractDetails = {
  name?: string | null;
  legal_name?: string | null;
  business_name?: string | null;
  business_registration_number?: string | null;
  tax_id?: string | null;
  address?: string | null;
  city?: string | null;
  phone?: string | null;
};

type RestaurateurProfileDetails = {
  first_name?: string | null;
  last_name?: string | null;
  date_of_birth?: string | null;
  phone_number?: string | null;
};

function formatDateTime(value?: string | null) {
  if (!value) return "Non signé";
  return new Intl.DateTimeFormat("fr-CH", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export default function RestaurantPartnerContractCard({
  restaurantId,
  mode = "restaurateur",
  restaurant,
}: {
  restaurantId?: string | null;
  mode?: "restaurateur" | "admin";
  restaurant?: RestaurantContractDetails | null;
}) {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const commercialDemoFrame = useCommercialDemoFrame();
  const isCommercialDemoRestaurant = commercialDemoFrame?.surface === "restaurant";
  const [signerName, setSignerName] = useState("");
  const [acceptedAuthority, setAcceptedAuthority] = useState(false);
  const [acceptedContract, setAcceptedContract] = useState(false);
  const [isSigning, setIsSigning] = useState(false);
  const [demoContract, setDemoContract] = useState<RestaurantContract | null>(null);

  const { data: contracts = [], isLoading } = useQuery({
    queryKey: ["restaurant-contracts", restaurantId],
    enabled: Boolean(restaurantId),
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("restaurant_contracts")
        .select(
          "id, restaurant_id, contract_version, contract_title, signer_name, signed_by, signed_at, status, signature_metadata",
        )
        .eq("restaurant_id", restaurantId)
        .order("signed_at", { ascending: false })
        .limit(5);
      if (error) throw error;
      return (data || []) as RestaurantContract[];
    },
  });

  const currentContract = useMemo(
    () =>
      demoContract || contracts.find(
        (contract) =>
          contract.contract_version === RESTAURANT_PARTNER_CONTRACT_VERSION &&
          contract.status === "signed",
      ),
    [contracts, demoContract],
  );
  const hasRequiredRestaurantIdentity = Boolean(
    restaurant?.legal_name?.trim() &&
    (restaurant.business_name?.trim() || restaurant.name?.trim()) &&
    restaurant.name?.trim(),
  );
  const canSign = Boolean(
    restaurantId &&
    user &&
    signerName.trim().length >= 3 &&
    hasRequiredRestaurantIdentity &&
    acceptedAuthority &&
    acceptedContract &&
    !currentContract,
  );
  const { data: restaurateurProfile } = useQuery({
    queryKey: [
      "restaurant-contract-signer-profile",
      currentContract?.signed_by,
    ],
    enabled: Boolean(currentContract?.signed_by),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("user_profiles")
        .select("first_name, last_name, date_of_birth, phone_number")
        .eq("user_id", currentContract!.signed_by!)
        .maybeSingle();
      if (error) throw error;
      return data as RestaurateurProfileDetails | null;
    },
  });

  const handleExportPdf = () => {
    const contract = currentContract;
    if (!contract || !restaurant) return;
    const metadata = contract.signature_metadata || {};
    const html = generateSignedRestaurantPartnerContractHtml({
      signerName: contract.signer_name,
      signatureDataUrl:
        typeof metadata.contract_signature_data_url === "string"
          ? metadata.contract_signature_data_url
          : typeof metadata.signature_data_url === "string"
            ? metadata.signature_data_url
            : undefined,
      signedAt: contract.signed_at || new Date().toISOString(),
      legalName: restaurant.legal_name || "",
      businessName: restaurant.business_name || restaurant.name || "",
      restaurantName: restaurant.name || "",
      restaurateurFirstName: restaurateurProfile?.first_name,
      restaurateurLastName: restaurateurProfile?.last_name,
      restaurateurDateOfBirth: restaurateurProfile?.date_of_birth,
      restaurateurAddress: restaurant.address,
      restaurateurPhone: restaurateurProfile?.phone_number || restaurant.phone,
      restaurantAddress: restaurant.address,
      restaurantPhone: restaurant.phone,
      businessRegistrationNumber: restaurant.business_registration_number,
      taxId: restaurant.tax_id,
      signerRole:
        typeof metadata.signer_role === "string"
          ? metadata.signer_role
          : "Représentant autorisé",
      signerEmail:
        typeof metadata.signed_email === "string"
          ? metadata.signed_email
          : user?.email,
      userId: contract.signed_by,
      restaurantId: contract.restaurant_id,
      contractHash:
        typeof metadata.contract_content_sha256 === "string"
          ? metadata.contract_content_sha256
          : typeof metadata.contract_content_hash === "string"
            ? metadata.contract_content_hash
            : undefined,
      acceptanceText:
        typeof metadata.acceptance_text === "string"
          ? metadata.acceptance_text
          : undefined,
      city: restaurant.city,
      place: restaurant.city,
    });
    const exported = openSafeHtmlPrintDocument({
      title: `${RESTAURANT_PARTNER_CONTRACT_TITLE} - ${contract.signer_name}`,
      html,
    });

    if (!exported) {
      toast({
        title: "Export PDF impossible",
        description:
          "Le navigateur n'a pas pu ouvrir la fenêtre d'impression du contrat.",
        variant: "destructive",
      });
    }
  };

  const handleSign = async () => {
    if (!restaurantId || !user || !canSign) return;
    setIsSigning(true);
    try {
      const signedAtClient = new Date().toISOString();
      const acceptanceText =
        "J'ai lu et j'accepte l'intégralité du contrat restaurateur TOK et je déclare être habilité à engager le restaurateur.";

      if (isCommercialDemoRestaurant) {
        setDemoContract({
          id: `commercial-demo-contract:${restaurantId}`,
          restaurant_id: restaurantId,
          contract_version: RESTAURANT_PARTNER_CONTRACT_VERSION,
          contract_title: RESTAURANT_PARTNER_CONTRACT_TITLE,
          signer_name: signerName.trim(),
          signed_by: null,
          signed_at: signedAtClient,
          status: "signed",
          signature_metadata: {
            signer_role: "Représentant autorisé",
            acceptance_text: acceptanceText,
            signed_email: user.email || null,
            signed_at_client: signedAtClient,
            signed_restaurant_id: restaurantId,
            source: "commercial_demo_restaurant_dashboard",
          },
        });
        toast({
          title: "Signature simulée",
          description:
            "Le contrat est signé dans cette fenêtre de démonstration uniquement. Aucun engagement réel n'a été enregistré.",
        });
        setSignerName("");
        setAcceptedAuthority(false);
        setAcceptedContract(false);
        return;
      }

      const contractContentSha256 = await generateRestaurantPartnerContractSha256({
        signerName: signerName.trim(),
        signedAt: signedAtClient,
        legalName: restaurant?.legal_name || "",
        businessName: restaurant?.business_name || restaurant?.name || "",
        restaurantName: restaurant?.name || "",
        signerRole: "Représentant autorisé",
        signerEmail: user.email || null,
        userId: user.id,
        restaurantId,
        acceptanceText,
      });
      const { error } = await (supabase as any)
        .from("restaurant_contracts")
        .insert({
          restaurant_id: restaurantId,
          contract_version: RESTAURANT_PARTNER_CONTRACT_VERSION,
          contract_title: RESTAURANT_PARTNER_CONTRACT_TITLE,
          signer_name: signerName.trim(),
          signed_by: user.id,
          accepted_authority: acceptedAuthority,
          accepted_contract: acceptedContract,
          signature_metadata: {
            signer_role: "Représentant autorisé",
            acceptance_text: acceptanceText,
            contract_content_sha256: contractContentSha256,
            contract_content_hash: contractContentSha256,
            signed_user_id: user.id,
            signed_restaurant_id: restaurantId,
            signed_email: user.email || null,
            signed_at_client: signedAtClient,
            legal_name: restaurant?.legal_name || null,
            business_name: restaurant?.business_name || restaurant?.name || null,
            restaurant_name: restaurant?.name || null,
            user_agent:
              typeof navigator !== "undefined" ? navigator.userAgent : null,
            source:
              mode === "admin"
                ? "admin_restaurant_profile"
                : "restaurant_dashboard",
          },
        });
      if (error) throw error;
      await queryClient.invalidateQueries({
        queryKey: ["restaurant-contracts", restaurantId],
      });
      await queryClient.invalidateQueries({
        queryKey: ["admin-restaurant-detail", restaurantId],
      });
      toast({
        title: "Contrat signé",
        description:
          "La signature numérique est enregistrée sur le profil restaurant.",
      });
      setSignerName("");
      setAcceptedAuthority(false);
      setAcceptedContract(false);
    } catch (error: any) {
      toast({
        title: "Signature impossible",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setIsSigning(false);
    }
  };

  return (
    <Card className="border-primary/20 bg-primary/5">
      <CardHeader>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <FileSignature className="h-5 w-5 text-primary" />
              {RESTAURANT_PARTNER_CONTRACT_TITLE}
            </CardTitle>
            <p className="mt-1 text-xs text-muted-foreground">
              Version {RESTAURANT_PARTNER_CONTRACT_VERSION}
            </p>
          </div>
          <Badge
            variant={currentContract ? "default" : "secondary"}
            className="w-fit"
          >
            {currentContract ? "Signé" : "Signature requise"}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {currentContract ? (
          <div className="flex flex-col gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex items-start gap-3">
              <CheckCircle2 className="mt-0.5 h-5 w-5 flex-none" />
              <div>
                <p className="font-semibold">
                  Signé par {currentContract.signer_name}
                </p>
                <p className="text-xs">
                  Horodatage: {formatDateTime(currentContract.signed_at)}
                </p>
              </div>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="gap-2 border-emerald-300 bg-white text-emerald-900 hover:bg-emerald-100"
              onClick={handleExportPdf}
              disabled={!restaurant}
            >
              <Download className="h-4 w-4" />
              Exporter le contrat en PDF
            </Button>
          </div>
        ) : null}

        <div className="max-h-96 space-y-4 overflow-auto rounded-xl border bg-background p-4 text-sm">
          {RESTAURANT_PARTNER_CONTRACT_SECTIONS.map((section) => (
            <section key={section.title} className="space-y-2">
              <h3 className="font-semibold">{section.title}</h3>
              {section.paragraphs.map((paragraph) => (
                <p key={paragraph} className="text-muted-foreground">
                  {paragraph}
                </p>
              ))}
            </section>
          ))}
        </div>

        {!currentContract && mode === "restaurateur" ? (
          <div className="space-y-3 rounded-xl border bg-background p-4">
            <div className="space-y-2">
              <Label>Nom et fonction du signataire habilité</Label>
              <Input
                value={signerName}
                onChange={(event) => setSignerName(event.target.value)}
                placeholder="Ex. Marie Dupont, gérante"
              />
            </div>
            <label className="flex items-start gap-3 text-sm">
              <Checkbox
                checked={acceptedAuthority}
                onCheckedChange={(checked) =>
                  setAcceptedAuthority(Boolean(checked))
                }
              />
              <span>
                Je confirme être habilité à engager juridiquement le
                restaurateur.
              </span>
            </label>
            <label className="flex items-start gap-3 text-sm">
              <Checkbox
                checked={acceptedContract}
                onCheckedChange={(checked) =>
                  setAcceptedContract(Boolean(checked))
                }
              />
              <span>
                J'ai lu et j'accepte l'intégralité du contrat restaurateur TOK.
              </span>
            </label>
            {!hasRequiredRestaurantIdentity ? (
              <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
                La raison sociale, le nom commercial et le nom du restaurant
                doivent être renseignés avant signature {isCommercialDemoRestaurant ? "simulée" : "réelle"}.
              </p>
            ) : null}
            <Button
              onClick={handleSign}
              disabled={!canSign || isSigning}
              className="w-full gap-2"
            >
              {isSigning ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <ShieldCheck className="h-4 w-4" />
              )}
              {isCommercialDemoRestaurant
                ? "Simuler la signature numérique"
                : "Signer numériquement et enregistrer"}
            </Button>
          </div>
        ) : null}

        {!currentContract && mode === "admin" ? (
          <p className="rounded-xl border border-dashed bg-background p-3 text-sm text-muted-foreground">
            Le restaurateur doit signer depuis son dashboard. La signature
            apparaîtra automatiquement ici dans la fiche admin.
          </p>
        ) : null}

        {isLoading ? (
          <p className="text-xs text-muted-foreground">
            Chargement des signatures...
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}
