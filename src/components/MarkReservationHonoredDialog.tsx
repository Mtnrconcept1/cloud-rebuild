import { useEffect, useState } from "react";
import { Loader2, ReceiptText } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useFeatureFlagSnapshot } from "@/lib/featureFlags";

/** Forfait applique quand « Mon pack » est coupe, en CHF. */
const FLAT_RESERVATION_FEE_CHF = 5;

export default function MarkReservationHonoredDialog({
  open,
  targetLabel,
  submitting = false,
  onOpenChange,
  onConfirm,
}: {
  open: boolean;
  targetLabel?: string;
  submitting?: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (attributedTableRevenueChf: number) => void;
}) {
  const [revenue, setRevenue] = useState("");
  // Quand « Mon pack » est coupe, le serveur facture un forfait : ni le tarif du
  // plan ni le plafond de 7 % ne s'appliquent. Le chiffre d'affaires n'entre
  // alors dans aucun calcul, et le reclamer comme obligatoire laissait croire
  // le contraire.
  const { isEnabled, loading: flagsLoading } = useFeatureFlagSnapshot({ enabled: open });
  const flatFee = !flagsLoading && !isEnabled("dashboard-pack");

  useEffect(() => {
    if (open) setRevenue("");
  }, [open]);

  const parsedRevenue = Number(revenue.replace(",", "."));
  const revenueProvided = revenue.trim() !== "";
  const revenueUsable = Number.isFinite(parsedRevenue) && parsedRevenue >= 0;
  // En forfait le champ devient facultatif : il ne sert plus qu'au suivi du
  // restaurateur. Une saisie erronee reste refusee.
  const valid = flatFee
    ? (!revenueProvided || revenueUsable)
    : (revenueProvided && revenueUsable);

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => !submitting && onOpenChange(nextOpen)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ReceiptText className="h-5 w-5 text-primary" />
            Clôturer la table honorée
          </DialogTitle>
          <DialogDescription>
            {targetLabel ? targetLabel + " · " : ""}
            le client est arrivé et le service est terminé.{" "}
            {flatFee
              ? `La réservation est facturée ${FLAT_RESERVATION_FEE_CHF}.- forfaitaires.`
              : "Saisissez le chiffre d'affaires réellement encaissé pour cette table."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          <Label htmlFor="attributed-table-revenue">
            Chiffre d'affaires table (CHF, TTC){flatFee ? " — facultatif" : ""}
          </Label>
          <Input
            id="attributed-table-revenue"
            inputMode="decimal"
            min={0}
            step="0.01"
            type="number"
            value={revenue}
            onChange={(event) => setRevenue(event.target.value)}
            placeholder="Ex. 180.00"
            autoFocus
          />
          <p className="text-xs text-muted-foreground">
            {flatFee
              ? `Un forfait de ${FLAT_RESERVATION_FEE_CHF}.- s'applique à chaque réservation honorée, sans plafond ni distinction de canal. Ce montant ne sert qu'à votre suivi et n'entre dans aucun calcul de frais.`
              : "Le serveur facture uniquement une réservation acquise par TOK et honorée, au tarif de votre plan, plafonné à 7% de ce montant. Canal propre, annulation, no-show, remboursement ou démo : CHF 0."}
          </p>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" disabled={submitting} onClick={() => onOpenChange(false)}>
            Annuler
          </Button>
          <Button
            type="button"
            disabled={!valid || submitting}
            onClick={() => onConfirm(revenueProvided && revenueUsable ? parsedRevenue : 0)}
          >
            {submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            {flatFee ? "Clôturer la table" : "Clôturer et calculer"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
