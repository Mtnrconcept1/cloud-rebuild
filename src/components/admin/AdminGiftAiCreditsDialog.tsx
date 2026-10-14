import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Gift, Loader2 } from "lucide-react";
import { toast } from "sonner";

import RestaurantSearchSelect from "@/components/admin/RestaurantSearchSelect";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { getSupabase } from "@/integrations/supabase/client";

const supabase = getSupabase();

type GiftHistory = {
  id: string;
  amount: number;
  remaining: number;
  reason: string;
  granted_at: string;
  expires_at: string;
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialRestaurantId?: string | null;
};

function formatDate(date: string) {
  return new Intl.DateTimeFormat("fr-CH", { dateStyle: "short" }).format(new Date(date));
}

export default function AdminGiftAiCreditsDialog({
  open,
  onOpenChange,
  initialRestaurantId,
}: Props) {
  const queryClient = useQueryClient();
  const [restaurantId, setRestaurantId] = useState("");
  const [restaurantName, setRestaurantName] = useState("");
  const [quantity, setQuantity] = useState("50");
  const [reason, setReason] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const requestIdRef = useRef<{ key: string; id: string } | null>(null);

  useEffect(() => {
    if (!open) return;
    setRestaurantId(initialRestaurantId || "");
    setRestaurantName("");
    setQuantity("50");
    setReason("");
    setConfirmOpen(false);
    requestIdRef.current = null;
  }, [open, initialRestaurantId]);

  const historyQuery = useQuery({
    queryKey: ["admin-ai-credit-gifts", restaurantId],
    enabled: open && Boolean(restaurantId),
    staleTime: 15_000,
    queryFn: async () => {
      const { data, error } = await (supabase.rpc as any)(
        "admin_list_restaurant_ai_gifts",
        { p_restaurant_id: restaurantId },
      );
      if (error) throw error;
      return (data || []) as GiftHistory[];
    },
  });

  const credits = Number(quantity);
  const isValidAmount = /^\d+$/.test(quantity.trim())
    && Number.isSafeInteger(credits)
    && credits >= 1 && credits <= 10_000;
  const cleanReason = reason.trim();
  const canSubmit = Boolean(restaurantId) && isValidAmount
    && cleanReason.length >= 8 && cleanReason.length <= 500 && !isSaving;

  const submitGift = async () => {
    if (!canSubmit) return;
    const signature = [restaurantId, credits, cleanReason].join(":");
    if (!requestIdRef.current || requestIdRef.current.key !== signature) {
      requestIdRef.current = { key: signature, id: crypto.randomUUID() };
    }
    setIsSaving(true);
    try {
      const { data, error } = await (supabase.rpc as any)(
        "admin_grant_restaurant_ai_credits",
        {
          p_restaurant_id: restaurantId,
          p_credits: credits,
          p_reason: cleanReason,
          p_request_id: requestIdRef.current.id,
        },
      );
      if (error) throw error;
      requestIdRef.current = null;
      setConfirmOpen(false);
      await queryClient.invalidateQueries({ queryKey: ["admin-ai-credit-gifts", restaurantId] });
      toast.success(
        data?.already_granted
          ? "Ces crédits avaient déjà été attribués."
          : `${credits.toLocaleString("fr-CH")} crédits IA offerts au restaurant.`,
      );
      setReason("");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Impossible d'attribuer les crédits IA.",
      );
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={(next) => { if (!isSaving) onOpenChange(next); }}>
        <DialogContent className="max-h-[calc(100dvh-1rem)] max-w-xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Gift className="h-5 w-5 text-primary" />
              Offrir des crédits IA
            </DialogTitle>
            <DialogDescription>
              Attribuez gratuitement des crédits pour les outils OpenAI à un restaurant inscrit.
              Aucun paiement Stripe ni budget de campagne n'est créé.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="admin-ai-gift-restaurant">Restaurant bénéficiaire</Label>
              <div id="admin-ai-gift-restaurant">
                <RestaurantSearchSelect
                  value={restaurantId}
                  onChange={(id) => {
                    setRestaurantId(id);
                    requestIdRef.current = null;
                  }}
                  onSelect={(restaurant) => setRestaurantName(restaurant.name)}
                  eligibleOnly
                  placeholder="Rechercher un restaurant inscrit…"
                />
              </div>
              <p className="text-xs text-muted-foreground">
                La recherche se précise à chaque saisie et couvre tous les restaurants inscrits.
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="admin-ai-gift-amount">Nombre de crédits IA</Label>
              <Input
                id="admin-ai-gift-amount"
                type="number"
                inputMode="numeric"
                min={1}
                max={10000}
                step={1}
                value={quantity}
                onChange={(event) => {
                  setQuantity(event.target.value);
                  requestIdRef.current = null;
                }}
              />
              {!isValidAmount ? (
                <p className="text-xs text-destructive">Saisissez un entier entre 1 et 10 000.</p>
              ) : null}
            </div>
            <div className="space-y-2">
              <Label htmlFor="admin-ai-gift-reason">Motif de l'attribution</Label>
              <Textarea
                id="admin-ai-gift-reason"
                value={reason}
                onChange={(event) => {
                  setReason(event.target.value);
                  requestIdRef.current = null;
                }}
                placeholder="Ex. : geste commercial pour le restaurant"
                maxLength={500}
                rows={3}
              />
              <p className="text-xs text-muted-foreground">Motif obligatoire (8 caractères minimum), conservé dans le journal d'audit.</p>
            </div>
            <p className="rounded-lg bg-muted/60 p-3 text-xs text-muted-foreground">
              Valables 12 mois. Ces crédits sont réservés aux utilisations IA et ne peuvent pas
              financer de campagnes sponsorisées. Le coût OpenAI réel continue d'être enregistré.
            </p>
            <Button
              type="button"
              className="w-full"
              disabled={!canSubmit}
              onClick={() => setConfirmOpen(true)}
            >
              <Gift className="mr-2 h-4 w-4" />
              Offrir les crédits IA
            </Button>
          </div>

          {restaurantId ? (
            <div className="space-y-2 border-t pt-4">
              <p className="text-sm font-semibold">Dernières attributions</p>
              {historyQuery.isPending ? (
                <p className="text-xs text-muted-foreground">Chargement de l'historique…</p>
              ) : historyQuery.isError ? (
                <p role="alert" className="text-xs text-destructive">Historique indisponible.</p>
              ) : historyQuery.data?.length ? (
                <div className="max-h-44 space-y-2 overflow-y-auto">
                  {historyQuery.data.map((gift) => (
                    <div key={gift.id} className="rounded-lg border px-3 py-2 text-xs">
                      <div className="flex justify-between gap-3">
                        <strong>{gift.amount.toLocaleString("fr-CH")} offerts</strong>
                        <span>{formatDate(gift.granted_at)}</span>
                      </div>
                      <p className="text-muted-foreground">
                        {gift.remaining.toLocaleString("fr-CH")} restants · expire le {formatDate(gift.expires_at)}
                      </p>
                      <p className="mt-1 break-words">{gift.reason}</p>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">Aucune attribution pour ce restaurant.</p>
              )}
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      <AlertDialog open={confirmOpen} onOpenChange={(next) => { if (!isSaving) setConfirmOpen(next); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmer le cadeau IA ?</AlertDialogTitle>
            <AlertDialogDescription>
              Vous allez offrir {credits.toLocaleString("fr-CH")} crédits IA
              {restaurantName ? ` à ${restaurantName}` : " au restaurant sélectionné"}.
              Cette opération sera enregistrée dans l'audit TOK. Aucun débit Stripe.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isSaving}>Annuler</AlertDialogCancel>
            <AlertDialogAction
              disabled={!canSubmit}
              onClick={(event) => {
                event.preventDefault();
                void submitGift();
              }}
            >
              {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Confirmer l'attribution
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
