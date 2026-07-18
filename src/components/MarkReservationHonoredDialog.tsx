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

  useEffect(() => {
    if (open) setRevenue("");
  }, [open]);

  const parsedRevenue = Number(revenue.replace(",", "."));
  const valid = revenue.trim() !== "" && Number.isFinite(parsedRevenue) && parsedRevenue >= 0;

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => !submitting && onOpenChange(nextOpen)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ReceiptText className="h-5 w-5 text-primary" />
            Confirmer la table honorée
          </DialogTitle>
          <DialogDescription>
            {targetLabel ? targetLabel + " · " : ""}
            saisissez le chiffre d'affaires réellement attribué à cette table.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          <Label htmlFor="attributed-table-revenue">Chiffre d'affaires table (CHF, TTC)</Label>
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
            Le serveur facture uniquement une réservation acquise par TOK et honorée, au tarif de votre plan,
            plafonné à 7% de ce montant. Canal propre, annulation, no-show, remboursement ou démo : CHF 0.
          </p>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" disabled={submitting} onClick={() => onOpenChange(false)}>
            Annuler
          </Button>
          <Button type="button" disabled={!valid || submitting} onClick={() => onConfirm(parsedRevenue)}>
            {submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Confirmer l'arrivée
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
