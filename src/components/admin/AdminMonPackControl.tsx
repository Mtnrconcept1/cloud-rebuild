import { useState } from "react";
import { Package, ShieldAlert } from "lucide-react";

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
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { useFeatureFlags } from "@/lib/featureFlags";

const MON_PACK_FLAG_NAME = "dashboard-pack";

export default function AdminMonPackControl() {
  const { flags, loading, toggleFlag } = useFeatureFlags(true);
  const { toast } = useToast();
  const [pendingState, setPendingState] = useState<boolean | null>(null);
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const packFlag = flags.find((flag) => flag.name === MON_PACK_FLAG_NAME);
  const explicitEnabled = packFlag?.explicitEnabled ?? false;
  const effectiveEnabled = packFlag?.effectiveEnabled ?? false;

  const closeConfirmation = () => {
    if (submitting) return;
    setPendingState(null);
    setReason("");
  };

  const requestToggle = (nextEnabled: boolean) => {
    if (!packFlag || nextEnabled === explicitEnabled) return;
    setPendingState(nextEnabled);
    setReason("");
  };

  const confirmToggle = async () => {
    if (!packFlag || pendingState === null || !reason.trim()) return;

    setSubmitting(true);
    const result = await toggleFlag(packFlag.id, reason.trim());
    setSubmitting(false);

    if (!result.success) {
      toast({
        title: "Modification impossible",
        description: result.error || "Le statut de Mon pack n'a pas pu être modifié.",
        variant: "destructive",
      });
      return;
    }

    toast({
      title: pendingState ? "Mon pack réactivé" : "Mon pack désactivé",
      description: pendingState
        ? "L'onglet et les nouvelles activations sont de nouveau disponibles."
        : "L'onglet, les nouvelles demandes, confirmations et reprises sont maintenant bloqués.",
    });
    setPendingState(null);
    setReason("");
  };

  return (
    <>
      <Card className={effectiveEnabled ? "border-emerald-200 bg-emerald-50/70" : "border-destructive/30 bg-destructive/5"}>
        <CardHeader className="space-y-3">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <Package className="h-5 w-5 text-primary" />
                <CardTitle>Mon pack — coupure globale</CardTitle>
                <Badge variant={effectiveEnabled ? "secondary" : "destructive"}>
                  {effectiveEnabled ? "Disponible" : "Coupé"}
                </Badge>
              </div>
              <p className="max-w-3xl text-sm text-muted-foreground">
                Masque l'onglet pour tous les restaurateurs, protège l'accès direct et bloque les nouvelles
                demandes, confirmations et reprises de modules Fair Growth.
              </p>
            </div>
            <Switch
              checked={explicitEnabled}
              onCheckedChange={requestToggle}
              disabled={loading || submitting || !packFlag}
              aria-label="Activer ou désactiver Mon pack globalement"
            />
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">
            <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
            <p>
              Les modules déjà actifs ne sont ni suspendus ni annulés et aucun paiement Stripe n'est modifié.
              Les actions de pause, d'annulation et de crédit restent disponibles.
            </p>
          </div>
          {explicitEnabled && !effectiveEnabled ? (
            <p className="mt-3 text-xs text-muted-foreground">
              Mon pack est explicitement activé, mais une dépendance globale du dashboard restaurateur est coupée.
            </p>
          ) : null}
        </CardContent>
      </Card>

      <AlertDialog open={pendingState !== null} onOpenChange={(open) => { if (!open) closeConfirmation(); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {pendingState ? "Réactiver Mon pack ?" : "Désactiver Mon pack globalement ?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {pendingState
                ? "Cette action rouvre l'onglet et autorise de nouveau les demandes, confirmations et reprises."
                : "Cette coupure est immédiate pour les nouvelles actions. Elle ne suspend pas les modules déjà actifs et ne modifie pas Stripe."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Input
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder="Raison obligatoire pour l'historique"
            aria-label="Raison du changement de statut de Mon pack"
          />
          <AlertDialogFooter>
            <AlertDialogCancel disabled={submitting}>Annuler</AlertDialogCancel>
            <AlertDialogAction
              disabled={submitting || !reason.trim()}
              className={pendingState ? undefined : "bg-destructive text-destructive-foreground hover:bg-destructive/90"}
              onClick={() => void confirmToggle()}
            >
              {pendingState ? "Réactiver" : "Confirmer la coupure"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
