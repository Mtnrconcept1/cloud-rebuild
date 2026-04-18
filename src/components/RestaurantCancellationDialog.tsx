import { useState } from "react";
import { AlertTriangle } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { CANCELLATION_REASONS, type CancellationReasonCode } from "@/lib/reservationMutations";

type Props = {
  open: boolean;
  reservationLabel?: string;
  submitting?: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (reasonCode: CancellationReasonCode, details: string | null) => void;
};

export default function RestaurantCancellationDialog({
  open,
  reservationLabel,
  submitting = false,
  onOpenChange,
  onConfirm,
}: Props) {
  const [reasonCode, setReasonCode] = useState<CancellationReasonCode | "">("");
  const [details, setDetails] = useState("");

  const needsDetails = reasonCode === "other";
  const detailsTooShort = needsDetails && details.trim().length < 3;
  const canSubmit = reasonCode !== "" && !detailsTooShort && !submitting;

  const handleConfirm = () => {
    if (!canSubmit) return;
    onConfirm(reasonCode as CancellationReasonCode, details.trim() ? details.trim() : null);
  };

  const handleOpenChange = (next: boolean) => {
    if (!next) {
      setReasonCode("");
      setDetails("");
    }
    onOpenChange(next);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-destructive" />
            Annuler cette reservation ?
          </DialogTitle>
          <DialogDescription>
            {reservationLabel ? <span className="font-medium">{reservationLabel}. </span> : null}
            Une raison est obligatoire. Les frais de reservation restent dus : seul le client peut annuler sans facturation.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="cancel-reason">Raison</Label>
            <Select
              value={reasonCode}
              onValueChange={(value) => setReasonCode(value as CancellationReasonCode)}
            >
              <SelectTrigger id="cancel-reason">
                <SelectValue placeholder="Selectionner une raison" />
              </SelectTrigger>
              <SelectContent>
                {CANCELLATION_REASONS.map((reason) => (
                  <SelectItem key={reason.code} value={reason.code}>
                    {reason.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="cancel-details">
              Details{" "}
              {needsDetails ? (
                <span className="text-destructive">*</span>
              ) : (
                <span className="text-muted-foreground">(optionnel)</span>
              )}
            </Label>
            <Textarea
              id="cancel-details"
              value={details}
              onChange={(event) => setDetails(event.target.value)}
              placeholder={
                needsDetails
                  ? "Expliquez la raison de l'annulation"
                  : "Informations additionnelles"
              }
              rows={3}
            />
            {detailsTooShort ? (
              <p className="text-xs text-destructive">Au moins 3 caracteres requis.</p>
            ) : null}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)} disabled={submitting}>
            Ne pas annuler
          </Button>
          <Button variant="destructive" onClick={handleConfirm} disabled={!canSubmit}>
            Confirmer l'annulation
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
