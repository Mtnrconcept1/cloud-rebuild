import { useEffect, useState } from "react";
import { AlertTriangle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
  targetLabel?: string;
  submitting?: boolean;
  refundEligible?: boolean;
  refundAmountChf?: number;
  defaultRefundNow?: boolean;
  refundHint?: string | null;
  confirmLabel?: string;
  onOpenChange: (open: boolean) => void;
  onConfirm: (input: {
    reasonCode: CancellationReasonCode;
    details: string | null;
    refundNow: boolean;
  }) => void;
};

export default function RestaurantCancellationDialog({
  open,
  targetLabel,
  submitting = false,
  refundEligible = false,
  refundAmountChf = 0,
  defaultRefundNow = true,
  refundHint = null,
  confirmLabel = "Confirmer l'annulation",
  onOpenChange,
  onConfirm,
}: Props) {
  const [reasonCode, setReasonCode] = useState<CancellationReasonCode | "">("");
  const [details, setDetails] = useState("");
  const [refundNow, setRefundNow] = useState(refundEligible && defaultRefundNow);

  const needsDetails = reasonCode === "other";
  const detailsTooShort = needsDetails && details.trim().length < 3;
  const canSubmit = reasonCode !== "" && !detailsTooShort && !submitting;

  useEffect(() => {
    if (!open) return;
    setRefundNow(refundEligible && defaultRefundNow);
  }, [defaultRefundNow, open, refundEligible]);

  const handleConfirm = () => {
    if (!canSubmit) return;
    onConfirm({
      reasonCode: reasonCode as CancellationReasonCode,
      details: details.trim() ? details.trim() : null,
      refundNow: refundEligible ? refundNow : false,
    });
  };

  const handleOpenChange = (next: boolean) => {
    if (!next) {
      setReasonCode("");
      setDetails("");
      setRefundNow(refundEligible && defaultRefundNow);
    }
    onOpenChange(next);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-lg border-2">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-destructive" />
            Annuler cette operation ?
          </DialogTitle>
          <DialogDescription>
            {targetLabel ? <span className="font-medium">{targetLabel}. </span> : null}
            Une raison est obligatoire. Si un paiement a ete capture, vous pouvez declencher le remboursement immediatement ou laisser la demande en file admin.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {refundEligible ? (
            <div className="rounded-2xl border border-destructive/20 bg-destructive/5 p-4">
              <div className="flex items-start gap-3">
                <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
                <div className="space-y-2">
                  <div>
                    <p className="text-sm font-semibold">Remboursement attendu</p>
                    <p className="text-lg font-bold text-destructive">{refundAmountChf.toFixed(2)} CHF</p>
                  </div>
                  <div className="flex items-start gap-3 rounded-xl bg-background/80 p-3">
                    <Checkbox
                      id="refund-now"
                      checked={refundNow}
                      onCheckedChange={(checked) => setRefundNow(checked === true)}
                      disabled={submitting}
                    />
                    <div className="space-y-1">
                      <Label htmlFor="refund-now" className="cursor-pointer text-sm font-medium">
                        Proceder au remboursement maintenant
                      </Label>
                      <p className="text-xs text-muted-foreground">
                        {refundNow
                          ? "La carte Stripe sera remboursee des la confirmation."
                          : "L'annulation sera enregistree, puis le remboursement restera disponible dans la file admin."}
                      </p>
                    </div>
                  </div>
                  {refundHint ? <p className="text-xs text-muted-foreground">{refundHint}</p> : null}
                </div>
              </div>
            </div>
          ) : null}

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
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
