import { useState } from "react";
import { Package, ShieldAlert } from "lucide-react";

import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { useFeatureFlags } from "@/lib/featureFlags";

const MON_PACK_FLAG_NAME = "dashboard-pack";

export default function AdminMonPackControl() {
  const { flags, loading, setFlagState } = useFeatureFlags(true);
  const { toast } = useToast();
  const [pendingState, setPendingState] = useState<boolean | null>(null);
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const packFlag = flags.find((flag) => flag.name === MON_PACK_FLAG_NAME);
  const explicitEnabled = packFlag?.explicitEnabled ?? false;
  const effectiveEnabled = packFlag?.effectiveEnabled ?? false;
  const serverStateAvailable = Boolean(packFlag && packFlag.id !== MON_PACK_FLAG_NAME);

  const closeConfirmation = () => {
    if (submitting) return;
    setPendingState(null);
    setReason("");
  };

  const requestToggle = (nextEnabled: boolean) => {
    if (!packFlag || !serverStateAvailable || nextEnabled === explicitEnabled) return;
    setPendingState(nextEnabled);
    setReason("");
  };

  const confirmToggle = async () => {
    if (!packFlag || !serverStateAvailable || pendingState === null || !reason.trim()) return;

    setSubmitting(true);
    try {
      const result = await setFlagState(packFlag.id, pendingState, reason.trim());

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
          ? "La coupure explicite est levée. Les dépendances globales du dashboard restent appliquées."
          : "L'onglet, les nouvelles demandes, confirmations et reprises sont maintenant bloqués.",
      });
      setPendingState(null);
      setReason("");
    } catch (error) {
      toast({
        title: "Modification impossible",
        description: error instanceof Error
          ? error.message
          : "Le statut de Mon pack n'a pas pu être modifié.",
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <Card className={loading || !serverStateAvailable ? "border-muted bg-muted/20" : effectiveEnabled ? "border-emerald-200 bg-emerald-50/70" : "border-destructive/30 bg-destructive/5"}>
        <CardHeader className="space-y-3">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <Package className="h-5 w-5 text-primary" />
                <CardTitle>Mon pack — coupure globale</CardTitle>
                <Badge variant={loading || !serverStateAvailable ? "outline" : effectiveEnabled ? "secondary" : "destructive"}>
                  {loading ? "Chargement" : !serverStateAvailable ? "Indisponible" : effectiveEnabled ? "Disponible" : "Coupé"}
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
              disabled={loading || submitting || !serverStateAvailable}
              aria-label="Activer ou désactiver Mon pack globalement"
            />
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">
            <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
            <p>
              Les modules déjà actifs ne sont ni suspendus ni annulés et aucun paiement Stripe n'est modifié.
              Leur pause, annulation ou crédit doit faire l'objet d'une opération séparée.
            </p>
          </div>
          {!loading && !serverStateAvailable ? (
            <p className="mt-3 text-xs text-destructive">
              L'état serveur de Mon pack est indisponible. Le contrôle reste verrouillé pour éviter une mutation à l'aveugle.
            </p>
          ) : explicitEnabled && !effectiveEnabled ? (
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
          <div className="space-y-2">
            <Label htmlFor="admin-mon-pack-reason">
              Motif du changement <span className="text-destructive">*</span>
            </Label>
            <Input
              id="admin-mon-pack-reason"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder="Raison obligatoire pour l'historique"
              required
              aria-required="true"
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={submitting}>Annuler</AlertDialogCancel>
            <Button
              type="button"
              variant={pendingState ? "default" : "destructive"}
              disabled={submitting || !reason.trim()}
              onClick={() => void confirmToggle()}
            >
              {pendingState ? "Réactiver" : "Confirmer la coupure"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
