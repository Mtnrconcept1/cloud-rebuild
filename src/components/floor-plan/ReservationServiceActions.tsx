import { useState } from "react";
import { LoaderCircle } from "lucide-react";

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
import { cn } from "@/lib/utils";

import {
  getReservationCustomerLabel,
  getServiceReservationActions,
  type ServiceReservation,
  type ServiceReservationActionStatus,
} from "./serviceShared";

type ReservationServiceActionsProps = {
  reservation: ServiceReservation;
  onStatusChange?: (reservationId: string, status: ServiceReservationActionStatus) => void;
  pendingReservationStatusId?: string | null;
  disabled?: boolean;
  compact?: boolean;
  surface?: "chrome" | "canvas";
  className?: string;
};

export default function ReservationServiceActions({
  reservation,
  onStatusChange,
  pendingReservationStatusId = null,
  disabled = false,
  compact = false,
  surface = "chrome",
  className,
}: ReservationServiceActionsProps) {
  const [absenceConfirmationId, setAbsenceConfirmationId] = useState<string | null>(null);
  const actions = getServiceReservationActions(reservation);
  const isPending = pendingReservationStatusId === reservation.id;
  const actionsDisabled = disabled || pendingReservationStatusId !== null;
  const customerName = getReservationCustomerLabel(reservation);

  if (!onStatusChange || actions.length === 0) return null;

  return (
    <div className={cn("flex flex-wrap items-center gap-2", className)} role="group" aria-label={`Actions pour ${customerName}`} aria-busy={isPending}>
      {actions.map((action) => (
        <Button
          key={action.status}
          type="button"
          variant={action.requiresConfirmation ? "outline" : "default"}
          className={cn(
            "min-h-10 rounded-xl",
            compact && "h-auto min-h-9 px-3 py-2 text-xs",
            surface === "canvas" && "border border-slate-200 bg-white text-slate-800 shadow-sm hover:bg-slate-100",
          )}
          disabled={actionsDisabled}
          onClick={(event) => {
            event.stopPropagation();
            if (actionsDisabled) return;
            if (action.requiresConfirmation) {
              setAbsenceConfirmationId(reservation.id);
              return;
            }
            onStatusChange(reservation.id, action.status);
          }}
        >
          {isPending ? <LoaderCircle className="mr-2 h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : null}
          {action.label}
        </Button>
      ))}

      <AlertDialog
        open={absenceConfirmationId === reservation.id}
        onOpenChange={(open) => { if (!open) setAbsenceConfirmationId(null); }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Signaler l’absence de {customerName} ?</AlertDialogTitle>
            <AlertDialogDescription>
              Cette réservation passera dans l’historique et ne bloquera plus de table.
              Cette absence ne peut pas être annulée depuis le plan de salle.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Garder la réservation</AlertDialogCancel>
            <AlertDialogAction
              disabled={actionsDisabled}
              onClick={(event) => {
                event.stopPropagation();
                if (actionsDisabled || absenceConfirmationId !== reservation.id) return;
                onStatusChange(reservation.id, "no_show");
                setAbsenceConfirmationId(null);
              }}
            >
              Confirmer l’absence
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
