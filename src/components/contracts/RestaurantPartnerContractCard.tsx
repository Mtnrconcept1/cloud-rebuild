import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CheckCircle2,
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
import { getSupabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth-context";
import {
  RESTAURANT_PARTNER_CONTRACT_SECTIONS,
  RESTAURANT_PARTNER_CONTRACT_TITLE,
  RESTAURANT_PARTNER_CONTRACT_VERSION,
} from "@/lib/restaurantPartnerContract";

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
}: {
  restaurantId?: string | null;
  mode?: "restaurateur" | "admin";
}) {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [signerName, setSignerName] = useState("");
  const [acceptedAuthority, setAcceptedAuthority] = useState(false);
  const [acceptedContract, setAcceptedContract] = useState(false);
  const [isSigning, setIsSigning] = useState(false);

  const { data: contracts = [], isLoading } = useQuery({
    queryKey: ["restaurant-contracts", restaurantId],
    enabled: Boolean(restaurantId),
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("restaurant_contracts")
        .select(
          "id, restaurant_id, contract_version, contract_title, signer_name, signed_by, signed_at, status",
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
      contracts.find(
        (contract) =>
          contract.contract_version === RESTAURANT_PARTNER_CONTRACT_VERSION &&
          contract.status === "signed",
      ),
    [contracts],
  );
  const canSign = Boolean(
    restaurantId &&
    user &&
    signerName.trim().length >= 3 &&
    acceptedAuthority &&
    acceptedContract &&
    !currentContract,
  );

  const handleSign = async () => {
    if (!restaurantId || !user || !canSign) return;
    setIsSigning(true);
    try {
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
          <div className="flex items-start gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">
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
              Signer numériquement et enregistrer
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
