import { useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Gift, Loader2, Sparkles } from "lucide-react";

import RestaurantSearchSelect from "@/components/admin/RestaurantSearchSelect";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { getSupabase } from "@/integrations/supabase/client";

const supabase = getSupabase();
const MAX_GIFT_CREDITS = 100_000;

type GrantResult = {
  gift_id: string;
  restaurant_id: string;
  credits: number;
  already_granted: boolean;
};

export default function AdminAiCreditGiftCard() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [restaurantId, setRestaurantId] = useState("");
  const [creditAmount, setCreditAmount] = useState("50");
  const [reason, setReason] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const requestKeyRef = useRef<string | null>(null);

  const credits = Number(creditAmount);
  const validCredits = /^[0-9]+$/.test(creditAmount)
    && Number.isSafeInteger(credits) && credits >= 1 && credits <= MAX_GIFT_CREDITS;
  const validReason = reason.trim().length >= 10 && reason.trim().length <= 300;
  const canGift = Boolean(restaurantId) && validCredits && validReason;

  const mutation = useMutation({
    mutationFn: async (): Promise<GrantResult> => {
      if (!canGift) throw new Error("Choisissez un restaurant, un nombre de crédits valide et un motif.");
      requestKeyRef.current ??= crypto.randomUUID();
      const { data, error } = await (supabase.rpc as any)("admin_gift_restaurant_ai_credits", {
        p_restaurant_id: restaurantId,
        p_credits: credits,
        p_reason: reason.trim(),
        p_request_key: requestKeyRef.current,
      });
      if (error) throw error;
      return data as GrantResult;
    },
    onSuccess: (result) => {
      requestKeyRef.current = null;
      setReason("");
      queryClient.invalidateQueries({ queryKey: ["admin-restaurants"] });
      queryClient.invalidateQueries({ queryKey: ["admin-restaurant-detail", restaurantId] });
      queryClient.invalidateQueries({ queryKey: ["restaurant-credit-usage"] });
      toast({
        title: result.already_granted ? "Attribution déjà enregistrée" : "Crédits IA offerts",
        description: result.already_granted
          ? "La demande a déjà été traitée. Aucun doublon n'a été créé."
          : result.credits.toLocaleString("fr-CH") + " crédits IA ajoutés au restaurant.",
      });
    },
    onError: (error) => {
      toast({
        title: "Attribution impossible",
        description: error instanceof Error ? error.message : "La demande n'a pas abouti.",
        variant: "destructive",
      });
    },
  });

  const changeRestaurant = (next: string) => {
    setRestaurantId(next);
    requestKeyRef.current = null;
  };

  return (
    <Card>
      <CardHeader className="space-y-2">
        <CardTitle className="flex items-center gap-2 text-lg">
          <Gift className="h-5 w-5 text-primary" />
          Offrir des crédits IA
        </CardTitle>
        <CardDescription>
          Sélectionnez un restaurant pour lui offrir des crédits utilisables avec les outils IA TOK.
          Aucun paiement Stripe ni crédit publicitaire n'est créé.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(11rem,1fr)]">
          <div className="space-y-2">
            <Label>Restaurant bénéficiaire</Label>
            <RestaurantSearchSelect value={restaurantId} onChange={changeRestaurant} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="admin-ai-gift-amount">Crédits IA à offrir</Label>
            <Input
              id="admin-ai-gift-amount"
              type="number"
              min={1}
              max={MAX_GIFT_CREDITS}
              step={1}
              value={creditAmount}
              disabled={mutation.isPending}
              onChange={(event) => {
                setCreditAmount(event.target.value);
                requestKeyRef.current = null;
              }}
              aria-invalid={!validCredits}
            />
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor="admin-ai-gift-reason">Motif de l'attribution</Label>
          <Textarea
            id="admin-ai-gift-reason"
            value={reason}
            maxLength={300}
            rows={2}
            disabled={mutation.isPending}
            placeholder="Ex. : geste commercial pour la présentation du studio marketing"
            onChange={(event) => {
              setReason(event.target.value);
              requestKeyRef.current = null;
            }}
          />
          <p className="text-xs text-muted-foreground">Motif obligatoire (10 à 300 caractères). Chaque attribution est journalisée.</p>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="inline-flex items-center gap-2 text-xs text-muted-foreground">
            <Sparkles className="h-4 w-4" />
            Les crédits offerts sont réservés à l'IA et ne financent pas les campagnes sponsorisées.
          </p>
          <Button
            type="button"
            disabled={!canGift || mutation.isPending}
            onClick={() => setConfirmOpen(true)}
          >
            {mutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Gift className="mr-2 h-4 w-4" />}
            Offrir des crédits IA
          </Button>
        </div>
      </CardContent>
      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmer le cadeau de crédits IA</AlertDialogTitle>
            <AlertDialogDescription>
              Attribuer {validCredits ? credits.toLocaleString("fr-CH") : "—"} crédits IA au restaurant sélectionné ?
              Cette opération sera enregistrée dans le journal d'audit et ne déclenchera aucun paiement.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={mutation.isPending}>Annuler</AlertDialogCancel>
            <AlertDialogAction
              disabled={!canGift || mutation.isPending}
              onClick={(event) => {
                event.preventDefault();
                if (canGift && !mutation.isPending) {
                  setConfirmOpen(false);
                  mutation.mutate();
                }
              }}
            >
              Confirmer l'attribution
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
