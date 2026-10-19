import { useId, useRef, useState, type FormEvent } from "react";
import { useMutation } from "@tanstack/react-query";
import { LoaderCircle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { markReservationHonored } from "@/lib/reservationMutations";
import {
  canCloseServiceReservation,
  getReservationCustomerLabel,
  getSafeTime,
  getShortDateLabel,
  type ServiceReservation,
} from "@/components/floor-plan/serviceShared";

type ReservationClosureDialogProps = {
  reservation: ServiceReservation;
  onClose: () => void;
  onCompleted: (result: { reservationId: string; revenueChf: number | null; feeChf: number }) => void;
};

export default function ReservationClosureDialog({ reservation, onClose, onCompleted }: ReservationClosureDialogProps) {
  const inputId = useId();
  const [amount, setAmount] = useState("");
  const [validationMessage, setValidationMessage] = useState<string | null>(null);
  const submittingRef = useRef(false);
  const alreadyAccounted = Boolean(reservation.honored_at);
  const closure = useMutation({
    mutationFn: async (revenueChf: number) => {
      if (!canCloseServiceReservation(reservation)) {
        throw new Error("Seule une réservation arrivée ou installée peut être clôturée.");
      }
      const result = await markReservationHonored(reservation.id, revenueChf);
      if (!result.ok) throw new Error(result.errorMessage || "La clôture n’a pas été enregistrée.");
      return { reservationId: reservation.id, revenueChf: alreadyAccounted ? null : revenueChf, feeChf: Number(result.feeChf || 0) };
    },
    onSuccess: (result) => onCompleted(result),
    onSettled: () => { submittingRef.current = false; },
  });
  const errorMessage = validationMessage || closure.error?.message;

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submittingRef.current || closure.isPending) return;
    if (alreadyAccounted) {
      submittingRef.current = true;
      closure.mutate(0);
      return;
    }
    const normalizedAmount = amount.trim().replace(",", ".");
    const value = Number(normalizedAmount);
    if (!/^\d+(?:\.\d{1,2})?$/.test(normalizedAmount) || !Number.isFinite(value) || value > 21_474_836.47) {
      setValidationMessage("Saisissez un montant en CHF positif ou nul, avec deux décimales au maximum.");
      return;
    }
    setValidationMessage(null);
    submittingRef.current = true;
    closure.mutate(value);
  };

  return (
    <Dialog open onOpenChange={(open) => { if (!open && !closure.isPending && !submittingRef.current) onClose(); }}>
      <DialogContent className="sm:max-w-lg">
        <form className="space-y-5" onSubmit={submit} aria-busy={closure.isPending}>
          <DialogHeader>
            <DialogTitle>Clôturer la table</DialogTitle>
            <DialogDescription>
              {getReservationCustomerLabel(reservation)} · {getShortDateLabel(reservation.date)} à {getSafeTime(reservation.time)} · {reservation.party_size} personnes
            </DialogDescription>
          </DialogHeader>

          {!alreadyAccounted ? <div className="space-y-2">
            <Label htmlFor={inputId}>Montant réellement encaissé pour cette table (CHF)</Label>
            <Input
              id={inputId}
              type="text"
              inputMode="decimal"
              autoComplete="off"
              placeholder="Ex. 126.50"
              value={amount}
              disabled={closure.isPending}
              aria-invalid={!!validationMessage}
              aria-describedby={`${inputId}-help${errorMessage ? ` ${inputId}-error` : ""}`}
              onChange={(event) => {
                if (submittingRef.current) return;
                setAmount(event.target.value);
                setValidationMessage(null);
                if (closure.isError) closure.reset();
              }}
            />
            <p id={`${inputId}-help`} className="text-sm text-muted-foreground">
              Ce montant sera enregistré comme chiffre d’affaires de la table. Renseignez le montant encaissé après les éventuelles réductions.
            </p>
          </div> : null}

          <div className="rounded-xl border border-border bg-muted/50 p-3 text-sm text-muted-foreground">
            La réservation sera marquée comme terminée et ne bloquera plus de table.
            {alreadyAccounted
              ? " Cette réservation a déjà été comptabilisée. Les montants déjà enregistrés seront conservés."
              : " Les éventuels frais TOK seront appliqués selon votre contrat. Le montant enregistré ne pourra plus être modifié depuis cet écran."}
          </div>

          {errorMessage ? <p id={`${inputId}-error`} role="alert" className="text-sm font-medium text-destructive">{errorMessage}</p> : null}

          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" disabled={closure.isPending} onClick={() => { if (!submittingRef.current) onClose(); }}>Revenir au service</Button>
            <Button type="submit" disabled={closure.isPending || !canCloseServiceReservation(reservation)}>
              {closure.isPending ? <LoaderCircle className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" /> : null}
              {closure.isPending ? "Clôture en cours…" : "Confirmer la clôture"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
