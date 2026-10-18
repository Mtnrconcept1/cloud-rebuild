import { useState, type FormEvent } from "react";
import { Loader2, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { useInviteWorkforceEmployee, useRevokeWorkforceInvitation } from "@/hooks/useTokWorkforce";
import { employeeName, workforceInvitationNotice, type WorkforceEmployee, type WorkforceInvitation } from "@/lib/tokWorkforce";

type Props = {
  restaurantId: string;
  employee: WorkforceEmployee;
  invitation?: WorkforceInvitation;
  mode: "invite" | "revoke";
  returnFocus?: HTMLButtonElement | null;
  onClose: () => void;
};

export default function WorkforceInvitationDialog({ restaurantId, employee, invitation, mode, returnFocus, onClose }: Props) {
  const { toast } = useToast();
  const [email, setEmail] = useState(employee.email || invitation?.email || "");
  const invite = useInviteWorkforceEmployee(restaurantId);
  const revoke = useRevokeWorkforceInvitation(restaurantId);
  const isRevoking = mode === "revoke";
  const pending = invite.isPending || revoke.isPending;
  const error = isRevoking ? revoke.error : invite.error;
  const unavailable = !employee.is_active || !!employee.user_id;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (pending || unavailable) return;
    try {
      if (isRevoking) {
        await revoke.mutateAsync(employee.id);
        toast({ title: "Invitation annulée", description: "Cette invitation ne permettra plus d’activer un accès." });
      } else {
        const result = await invite.mutateAsync({ employeeId: employee.id, email });
        toast(workforceInvitationNotice(result));
      }
      onClose();
    } catch {
      // The failed request stays visible; the entered address is preserved for a retry.
    }
  };

  return (
    <Dialog open onOpenChange={open => { if (!open && !pending) onClose(); }}>
      <DialogContent
        hideCloseButton={pending}
        onCloseAutoFocus={event => { if (returnFocus) { event.preventDefault(); returnFocus.focus(); } }}
      >
        <DialogHeader>
          <DialogTitle>{isRevoking ? "Annuler l’invitation" : "Inviter " + employeeName(employee)}</DialogTitle>
          <DialogDescription>
            {isRevoking
              ? "L’accès en attente de " + employeeName(employee) + " sera annulé. Vous pourrez envoyer une nouvelle invitation ensuite."
              : "Votre collaborateur recevra un e-mail pour rejoindre son espace TOK Équipe : badgeuse, planning, heures et demandes."}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          {isRevoking ? (
            <p className="break-all rounded-xl border p-3 text-sm">{invitation?.email || employee.email}</p>
          ) : (
            <div className="space-y-2">
              <Label htmlFor="wf-invitation-email">Adresse e-mail de l’employé</Label>
              <Input
                id="wf-invitation-email" type="email" required maxLength={254}
                value={email} onChange={event => setEmail(event.target.value)}
                disabled={pending || unavailable} autoComplete="email"
                aria-describedby="wf-invitation-help"
                aria-invalid={!!error}
              />
              <p id="wf-invitation-help" className="text-sm text-muted-foreground">
                L’invitation sera valable 7 jours. L’employé devra se connecter ou créer un compte avec cette adresse et la vérifier.
                Une adresse modifiée sera aussi enregistrée dans sa fiche.
              </p>
            </div>
          )}
          {unavailable ? <p role="alert" className="text-sm text-destructive">Cette fiche est inactive ou possède déjà un accès activé.</p> : null}
          {error ? <p role="alert" className="text-sm text-destructive">{error.message || "L’opération a échoué. Réessayez."}</p> : null}
          <DialogFooter>
            <Button type="button" variant="outline" disabled={pending} onClick={onClose}>{isRevoking ? "Conserver" : "Fermer"}</Button>
            <Button type="submit" variant={isRevoking ? "destructive" : "default"} disabled={pending || unavailable}>
              {pending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" /> : !isRevoking ? <Mail className="mr-2 h-4 w-4" aria-hidden="true" /> : null}
              {pending ? "Traitement…" : isRevoking ? "Annuler l’invitation" : "Envoyer l’invitation"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
